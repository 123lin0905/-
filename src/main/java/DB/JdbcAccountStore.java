package DB;

import org.example.demo1.AdminUser;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 账户扩展（沿用现有 admin_user 表，不另起账户体系）：
 * <ul>
 *   <li>admin_user.maintainer_id：养护员账号（role_code = MAINTAINER）关联 maintainer 表档案，进而通过 plant_area.maintainer_id 找到负责区域；</li>
 *   <li>admin_role 字典补 MAINTAINER；</li>
 *   <li>演示账号 keeper_zhang / keeper_li（初始密码 123456，与 DBTools 中其他演示账号一致），分别关联工号 WH-1001 / WH-1002。</li>
 * </ul>
 * 以上都是“只补不改”（INSERT IGNORE / 列不存在才 ALTER），重复执行无副作用；admin_user / maintainer 表还没建时跳过，下次再试。
 */
public class JdbcAccountStore {
    private static volatile boolean ready;

    public static Connection open() throws Jdbc.DbUnavailableException {
        Connection c = Jdbc.open();
        if (!ready) ensure(c);
        return c;
    }

    private static synchronized void ensure(Connection c) {
        if (ready) return;
        try (Statement st = c.createStatement()) {
            boolean hasUser, hasCol;
            try (ResultSet rs = st.executeQuery("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'admin_user'")) {
                rs.next(); hasUser = rs.getInt(1) > 0;
            }
            if (!hasUser) return;                 // DBTools 尚未建表：下次再试
            try (ResultSet rs = st.executeQuery("SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'admin_user' AND column_name = 'maintainer_id'")) {
                rs.next(); hasCol = rs.getInt(1) > 0;
            }
            if (!hasCol) st.execute("ALTER TABLE admin_user ADD COLUMN maintainer_id INT NULL COMMENT '养护员账号关联的 maintainer.id'");
            try {
                st.execute("INSERT IGNORE INTO admin_role (role_code, role_name, description) VALUES ('MAINTAINER', '养护人员', '养护工作台：浇水、施肥、喂食，动植物增删改查；可录入人脸')");
            } catch (SQLException ignored) { /* 未执行 001 脚本时没有 admin_role 字典表 */ }
            try {
                st.execute("INSERT IGNORE INTO admin_user (username, password_hash, display_name, role_code, status, maintainer_id) " +
                        "SELECT 'keeper_zhang', SHA2('123456', 256), '张师傅（养护员）', 'MAINTAINER', 1, (SELECT id FROM maintainer WHERE staff_no = 'WH-1001' LIMIT 1)");
                st.execute("INSERT IGNORE INTO admin_user (username, password_hash, display_name, role_code, status, maintainer_id) " +
                        "SELECT 'keeper_li', SHA2('123456', 256), '李工（养护员）', 'MAINTAINER', 1, (SELECT id FROM maintainer WHERE staff_no = 'WH-1002' LIMIT 1)");
            } catch (SQLException ignored) { /* maintainer 表尚未建：演示账号下次再补 */ }
            ready = true;
        } catch (SQLException e) {
            System.err.println("账户扩展初始化提示: " + e.getMessage());
        }
    }

    /** 读取启用中的账号（人脸识别成功后据此建立会话；角色以数据库当前值为准）。 */
    public AdminUser findActive(int id) throws Jdbc.DbUnavailableException {
        try (Connection c = open(); PreparedStatement ps = c.prepareStatement(
                "SELECT id, username, display_name, role_code, status FROM admin_user WHERE id = ? AND status = 1")) {
            ps.setInt(1, id);
            try (ResultSet rs = ps.executeQuery()) {
                if (!rs.next()) return null;
                AdminUser u = new AdminUser(rs.getInt("id"), rs.getString("username"), rs.getString("display_name"), rs.getString("role_code"));
                u.setStatus(rs.getInt("status"));
                return u;
            }
        } catch (SQLException e) {
            throw new Jdbc.DbUnavailableException("查询账号失败：" + e.getMessage(), e);
        }
    }

    /** 账号 + 关联养护员档案；没有关联时 maintainer_id 为 null。 */
    public Map<String, Object> accountInfo(int accountId) throws Jdbc.DbUnavailableException {
        try (Connection c = open(); PreparedStatement ps = c.prepareStatement(
                "SELECT u.id, u.username, u.display_name, u.role_code, u.maintainer_id, m.name AS maintainer_name, m.staff_no " +
                        "FROM admin_user u LEFT JOIN maintainer m ON m.id = u.maintainer_id WHERE u.id = ?")) {
            ps.setInt(1, accountId);
            try (ResultSet rs = ps.executeQuery()) {
                if (!rs.next()) return null;
                Map<String, Object> m = new LinkedHashMap<>();
                m.put("id", rs.getInt("id"));
                m.put("username", rs.getString("username"));
                m.put("display_name", rs.getString("display_name"));
                m.put("role_code", rs.getString("role_code"));
                int mid = rs.getInt("maintainer_id");
                m.put("maintainer_id", rs.wasNull() ? null : mid);
                m.put("maintainer_name", rs.getString("maintainer_name"));
                m.put("staff_no", rs.getString("staff_no"));
                return m;
            }
        } catch (SQLException e) {
            if (Jdbc.isMissingTable(e)) return null;
            throw new Jdbc.DbUnavailableException("查询账号失败：" + e.getMessage(), e);
        }
    }

    /** 管理员人脸管理用：所有养护员账号（含关联档案、已录入人脸条数）。 */
    public List<Map<String, Object>> maintainerAccounts() throws Jdbc.DbUnavailableException {
        String sql = "SELECT u.id, u.username, u.display_name, u.role_code, u.status, u.maintainer_id, m.name AS maintainer_name, " +
                "(SELECT COUNT(*) FROM face_profile f WHERE f.account_id = u.id) AS face_count " +
                "FROM admin_user u LEFT JOIN maintainer m ON m.id = u.maintainer_id WHERE u.role_code = 'MAINTAINER' ORDER BY u.id";
        List<Map<String, Object>> out = new ArrayList<>();
        try (Connection c = open(); PreparedStatement ps = c.prepareStatement(sql); ResultSet rs = ps.executeQuery()) {
            while (rs.next()) {
                Map<String, Object> m = new LinkedHashMap<>();
                m.put("id", rs.getInt("id"));
                m.put("username", rs.getString("username"));
                m.put("display_name", rs.getString("display_name"));
                m.put("role_code", rs.getString("role_code"));
                m.put("status", rs.getInt("status"));
                int mid = rs.getInt("maintainer_id");
                m.put("maintainer_id", rs.wasNull() ? null : mid);
                m.put("maintainer_name", rs.getString("maintainer_name"));
                m.put("face_count", rs.getInt("face_count"));
                out.add(m);
            }
            return out;
        } catch (SQLException e) {
            if (Jdbc.isMissingTable(e)) return out;
            throw new Jdbc.DbUnavailableException("查询养护员账号失败：" + e.getMessage(), e);
        }
    }

    /** 系统后台新增养护员账号时关联档案。 */
    public boolean linkMaintainer(String username, Integer maintainerId) {
        try (Connection c = open(); PreparedStatement ps = c.prepareStatement("UPDATE admin_user SET maintainer_id = ? WHERE username = ?")) {
            if (maintainerId == null) ps.setNull(1, java.sql.Types.INTEGER); else ps.setInt(1, maintainerId);
            ps.setString(2, username);
            return ps.executeUpdate() > 0;
        } catch (Exception e) {
            System.err.println("关联养护员档案失败: " + e.getMessage());
            return false;
        }
    }

    /** 系统后台账号列表展示用：账号 id → 关联的养护员姓名。 */
    public Map<Integer, String> maintainerLinks() {
        Map<Integer, String> out = new HashMap<>();
        try (Connection c = open(); PreparedStatement ps = c.prepareStatement(
                "SELECT u.id, m.name FROM admin_user u JOIN maintainer m ON m.id = u.maintainer_id");
             ResultSet rs = ps.executeQuery()) {
            while (rs.next()) out.put(rs.getInt(1), rs.getString(2));
        } catch (Exception ignored) { /* 列表展示可缺省 */ }
        return out;
    }
}
