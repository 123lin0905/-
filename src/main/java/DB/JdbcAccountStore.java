package DB;

import org.example.demo1.AdminUser;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 账号数据访问（沿用现有 admin_user 表，不另起账户体系）：账号密码登录、人脸登录取账号、人脸信息管理列表、账号管理。
 * 首次连接时补齐结构（“只补不改”，重复执行无副作用；admin_user / maintainer 表还没建时跳过，下次再试）：
 * <ul>
 *   <li>admin_user.maintainer_id：养护员账号（role_code = MAINTAINER）关联 maintainer 表档案，进而通过 plant_area.maintainer_id 找到负责区域；</li>
 *   <li>admin_user.password_hash 放宽到 VARCHAR(255)，以存放 PBKDF2 加盐哈希（{@link security.PasswordHasher}）；旧的无盐 SHA-256 在登录成功后透明升级；</li>
 *   <li>admin_role 字典补 MAINTAINER；</li>
 *   <li>演示账号 keeper_zhang / keeper_li（初始密码 123456，部署后请在账号管理里修改），分别关联工号 WH-1001 / WH-1002。</li>
 * </ul>
 */
public class JdbcAccountStore {
    private static volatile boolean ready;

    public static Connection open() throws Jdbc.DbUnavailableException {
        Connection c = Jdbc.open();
        if (!ready) {
            DBTools.ensureSchema();               // 全新库：先由 DBTools 建 admin_user / maintainer / plant_area 等表
            ensure(c);
        }
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
            // 001 脚本建的是 CHAR(64)、DBTools 建的是 VARCHAR(128)：放宽以存放 PBKDF2 哈希（与 database/005_password_hash.sql 一致）
            try (ResultSet rs = st.executeQuery("SELECT data_type, character_maximum_length FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'admin_user' AND column_name = 'password_hash'")) {
                if (rs.next() && (!"varchar".equalsIgnoreCase(rs.getString(1)) || rs.getLong(2) < 255)) {
                    st.execute("ALTER TABLE admin_user MODIFY COLUMN password_hash VARCHAR(255) NOT NULL COMMENT 'PBKDF2 加盐哈希（旧数据为无盐 SHA-256，登录成功后自动升级）'");
                }
            }
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

    /**
     * 人脸信息管理用：所有“有人脸或可以录入人脸”的账号（管理员角色 + 养护人员，以及角色已变更但仍留有人脸的账号），
     * 含已录入条数、最早 / 最近录入时间、最近录入人、最近一张缩略图；另附“账号已删除但人脸仍保留”的记录（username 为 null）。
     * 不含特征向量。可管理范围由调用方按 {@link security.Roles#canManageFaceOf} 过滤。
     */
    public List<Map<String, Object>> faceAccounts() throws Jdbc.DbUnavailableException {
        StringBuilder in = new StringBuilder();
        for (String r : security.Roles.FACE_ROLES) in.append(in.length() == 0 ? "" : ",").append('\'').append(r).append('\'');
        String sql = "SELECT u.id, u.username, u.display_name, u.role_code, u.status, u.maintainer_id, m.name AS maintainer_name, " +
                "(SELECT COUNT(*) FROM face_profile f WHERE f.account_id = u.id) AS face_count, " +
                "(SELECT MIN(f.created_at) FROM face_profile f WHERE f.account_id = u.id) AS first_at, " +
                "(SELECT MAX(f.created_at) FROM face_profile f WHERE f.account_id = u.id) AS last_at, " +
                "(SELECT f.created_by FROM face_profile f WHERE f.account_id = u.id ORDER BY f.id DESC LIMIT 1) AS last_by, " +
                "(SELECT f.thumbnail FROM face_profile f WHERE f.account_id = u.id AND f.thumbnail IS NOT NULL ORDER BY f.id DESC LIMIT 1) AS thumbnail " +
                "FROM admin_user u LEFT JOIN maintainer m ON m.id = u.maintainer_id " +
                "WHERE u.role_code IN (" + in + ") OR EXISTS (SELECT 1 FROM face_profile f WHERE f.account_id = u.id) ORDER BY u.id";
        List<Map<String, Object>> out = new ArrayList<>();
        try (Connection c = open()) {
            try (PreparedStatement ps = c.prepareStatement(sql); ResultSet rs = ps.executeQuery()) {
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
                    m.put("first_enrolled_at", JdbcCareStore.cst(rs.getTimestamp("first_at")));
                    m.put("last_enrolled_at", JdbcCareStore.cst(rs.getTimestamp("last_at")));
                    m.put("last_enrolled_by", rs.getString("last_by"));
                    m.put("thumbnail", rs.getString("thumbnail"));
                    m.put("deleted", false);
                    out.add(m);
                }
            }
            // 账号已被删除、但人脸仍保留的记录（人脸不随账号自动删除，只能由管理员在人脸信息管理里手动删除）
            try (PreparedStatement ps = c.prepareStatement(
                    "SELECT f.account_id, MAX(f.role_code) AS role_code, COUNT(*) AS face_count, MIN(f.created_at) AS first_at, MAX(f.created_at) AS last_at " +
                            "FROM face_profile f LEFT JOIN admin_user u ON u.id = f.account_id WHERE u.id IS NULL GROUP BY f.account_id ORDER BY f.account_id");
                 ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("id", rs.getInt("account_id"));
                    m.put("username", null);
                    m.put("display_name", "（账号已删除）");
                    m.put("role_code", null);
                    m.put("enrolled_role_code", rs.getString("role_code"));
                    m.put("status", 0);
                    m.put("maintainer_id", null);
                    m.put("maintainer_name", null);
                    m.put("face_count", rs.getInt("face_count"));
                    m.put("first_enrolled_at", JdbcCareStore.cst(rs.getTimestamp("first_at")));
                    m.put("last_enrolled_at", JdbcCareStore.cst(rs.getTimestamp("last_at")));
                    m.put("last_enrolled_by", null);
                    m.put("thumbnail", null);
                    m.put("deleted", true);
                    out.add(m);
                }
            }
            return out;
        } catch (SQLException e) {
            if (Jdbc.isMissingTable(e)) return out;
            throw new Jdbc.DbUnavailableException("查询人脸账号失败：" + e.getMessage(), e);
        }
    }

    // ======================= 账号密码登录 =======================

    /** 登录结果：user 为 null 表示账号不存在、密码错误或已停用（对外统一提示，不区分原因）。 */
    public static final class LoginResult {
        public final AdminUser user;
        public final boolean upgraded;

        LoginResult(AdminUser user, boolean upgraded) { this.user = user; this.upgraded = upgraded; }
    }

    /** 不存在的账号也做一次同等开销的哈希，避免用响应时间探测账号是否存在。 */
    private static final String DUMMY_HASH = security.PasswordHasher.hash("dummy-password-0");

    /**
     * 校验账号密码（只认该账号自己保存的密码，没有任何通用 / 演示后门密码）。
     * 成功且库里还是旧格式（无盐 SHA-256 / 明文）时，透明改写为 PBKDF2 加盐哈希。
     */
    public LoginResult authenticate(String username, String password) throws Jdbc.DbUnavailableException {
        if (username == null || username.isEmpty() || password == null || password.isEmpty()) return new LoginResult(null, false);
        try (Connection c = open()) {
            Integer id = null;
            String stored = null, display = null, role = null;
            int status = 0;
            try (PreparedStatement ps = c.prepareStatement(
                    "SELECT id, password_hash, display_name, role_code, status FROM admin_user WHERE username = ?")) {
                ps.setString(1, username);
                try (ResultSet rs = ps.executeQuery()) {
                    if (rs.next()) {
                        id = rs.getInt(1); stored = rs.getString(2); display = rs.getString(3); role = rs.getString(4); status = rs.getInt(5);
                    }
                }
            }
            boolean ok = security.PasswordHasher.verify(password, stored == null ? DUMMY_HASH : stored);
            if (id == null || !ok || status != 1) return new LoginResult(null, false);
            boolean upgraded = false;
            if (security.PasswordHasher.needsUpgrade(stored)) {
                try (PreparedStatement ps = c.prepareStatement("UPDATE admin_user SET password_hash = ? WHERE id = ? AND password_hash = ?")) {
                    ps.setString(1, security.PasswordHasher.hash(password));
                    ps.setInt(2, id);
                    ps.setString(3, stored);
                    upgraded = ps.executeUpdate() > 0;
                } catch (SQLException e) {
                    System.err.println("密码哈希升级失败（不影响本次登录）: " + e.getMessage());
                }
            }
            AdminUser u = new AdminUser(id, username, display, role);
            u.setStatus(status);
            return new LoginResult(u, upgraded);
        } catch (SQLException e) {
            throw new Jdbc.DbUnavailableException("账号登录查询失败：" + e.getMessage(), e);
        }
    }

    // ======================= 账号管理 =======================

    /** 账号管理里的操作被规则拒绝（如停用最后一个系统管理员、账号重名）：message 直接给前端看。 */
    public static class RuleViolation extends Exception {
        public final int status;

        public RuleViolation(int status, String message) { super(message); this.status = status; }
    }

    /** 账号列表（不含密码哈希）：账号、姓名、角色、状态、关联养护员档案、负责区域、人脸条数。 */
    public List<Map<String, Object>> listAccounts() throws Jdbc.DbUnavailableException {
        List<Map<String, Object>> out = new ArrayList<>();
        try (Connection c = open()) {
            Map<Integer, List<Map<String, Object>>> areasByMaintainer = new java.util.HashMap<>();
            try (PreparedStatement ps = c.prepareStatement("SELECT id, area_code, area_name, maintainer_id FROM plant_area WHERE maintainer_id IS NOT NULL ORDER BY id");
                 ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    Map<String, Object> a = new LinkedHashMap<>();
                    a.put("id", rs.getInt(1)); a.put("area_code", rs.getString(2)); a.put("area_name", rs.getString(3));
                    areasByMaintainer.computeIfAbsent(rs.getInt(4), k -> new ArrayList<>()).add(a);
                }
            } catch (SQLException e) {
                if (!Jdbc.isMissingTable(e)) throw e;
            }
            String faceCount = "(SELECT COUNT(*) FROM face_profile f WHERE f.account_id = u.id)";
            String sql = "SELECT u.id, u.username, u.display_name, u.role_code, u.status, u.created_at, u.maintainer_id, " +
                    "m.name AS maintainer_name, m.staff_no, m.phone, " + faceCount + " AS face_count " +
                    "FROM admin_user u LEFT JOIN maintainer m ON m.id = u.maintainer_id ORDER BY u.id";
            try (PreparedStatement ps = c.prepareStatement(sql); ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("id", rs.getInt("id"));
                    m.put("username", rs.getString("username"));
                    m.put("display_name", rs.getString("display_name"));
                    String role = rs.getString("role_code");
                    m.put("role_code", role);
                    m.put("role_label", security.Roles.roleLabel(role));
                    m.put("group", security.Roles.isAdmin(role) ? "admin" : security.Roles.isMaintainer(role) ? "maintainer" : "other");
                    m.put("status", rs.getInt("status"));
                    m.put("created_at", JdbcCareStore.cst(rs.getTimestamp("created_at")));
                    int mid = rs.getInt("maintainer_id");
                    Integer maintainerId = rs.wasNull() ? null : mid;
                    m.put("maintainer_id", maintainerId);
                    m.put("maintainer_name", rs.getString("maintainer_name"));
                    m.put("staff_no", rs.getString("staff_no"));
                    m.put("phone", rs.getString("phone"));
                    m.put("areas", maintainerId == null ? new ArrayList<>() : areasByMaintainer.getOrDefault(maintainerId, new ArrayList<>()));
                    m.put("face_count", rs.getInt("face_count"));
                    out.add(m);
                }
            }
            return out;
        } catch (SQLException e) {
            if (Jdbc.isMissingTable(e)) return out;
            throw new Jdbc.DbUnavailableException("查询账号列表失败：" + e.getMessage(), e);
        }
    }

    /** 养护员档案（maintainer 表），附已关联的账号（一个档案最多关联一个账号）。 */
    public List<Map<String, Object>> maintainers() throws Jdbc.DbUnavailableException {
        List<Map<String, Object>> out = new ArrayList<>();
        try (Connection c = open(); PreparedStatement ps = c.prepareStatement(
                "SELECT m.id, m.staff_no, m.name, m.phone, m.department, m.status, " +
                        "(SELECT u.username FROM admin_user u WHERE u.maintainer_id = m.id ORDER BY u.id LIMIT 1) AS linked " +
                        "FROM maintainer m ORDER BY m.id");
             ResultSet rs = ps.executeQuery()) {
            while (rs.next()) {
                Map<String, Object> m = new LinkedHashMap<>();
                m.put("id", rs.getInt("id"));
                m.put("staff_no", rs.getString("staff_no"));
                m.put("name", rs.getString("name"));
                m.put("phone", rs.getString("phone"));
                m.put("department", rs.getString("department"));
                m.put("status", rs.getString("status"));
                m.put("linked_username", rs.getString("linked"));
                out.add(m);
            }
            return out;
        } catch (SQLException e) {
            if (Jdbc.isMissingTable(e)) return out;
            throw new Jdbc.DbUnavailableException("查询养护员档案失败：" + e.getMessage(), e);
        }
    }

    /** 除 excludeId 外启用中的系统级管理员数量；在事务里加行锁，防止两个管理员同时互相停用。 */
    private static int otherActiveAccountAdmins(Connection c, int excludeId) throws SQLException {
        StringBuilder in = new StringBuilder();
        for (String r : security.Roles.ACCOUNT_ADMIN_ROLES) in.append(in.length() == 0 ? "" : ",").append('\'').append(r).append('\'');
        int n = 0;
        try (PreparedStatement ps = c.prepareStatement("SELECT id FROM admin_user WHERE status = 1 AND role_code IN (" + in + ") AND id <> ? FOR UPDATE")) {
            ps.setInt(1, excludeId);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) n++;
            }
        }
        return n;
    }

    private static Map<String, Object> lockAccount(Connection c, int id) throws SQLException {
        try (PreparedStatement ps = c.prepareStatement("SELECT id, username, role_code, status, maintainer_id FROM admin_user WHERE id = ? FOR UPDATE")) {
            ps.setInt(1, id);
            try (ResultSet rs = ps.executeQuery()) {
                if (!rs.next()) return null;
                Map<String, Object> m = new LinkedHashMap<>();
                m.put("id", rs.getInt(1));
                m.put("username", rs.getString(2));
                m.put("role_code", rs.getString(3));
                m.put("status", rs.getInt(4));
                int mid = rs.getInt(5);
                m.put("maintainer_id", rs.wasNull() ? null : mid);
                return m;
            }
        }
    }

    /** 事务模板：规则不通过时回滚并抛 RuleViolation。 */
    private interface Tx<T> {
        T run(Connection c) throws SQLException, RuleViolation;
    }

    private static <T> T inTx(Tx<T> body) throws Jdbc.DbUnavailableException, RuleViolation {
        try (Connection c = open()) {
            c.setAutoCommit(false);
            try {
                T r = body.run(c);
                c.commit();
                return r;
            } catch (SQLException | RuleViolation | RuntimeException e) {
                try { c.rollback(); } catch (SQLException ignored) { /* 连接已断 */ }
                throw e;
            } finally {
                try { c.setAutoCommit(true); } catch (SQLException ignored) { /* 连接已断 */ }
            }
        } catch (SQLException e) {
            if (e.getErrorCode() == 1062) throw new RuleViolation(409, "账号或工号已存在，请换一个");
            throw new Jdbc.DbUnavailableException("账号管理操作失败：" + e.getMessage(), e);
        }
    }

    /**
     * 解析养护员档案：maintainerId（已有档案，必须存在且未关联其他账号）或 newName / newPhone（新建最小档案）。
     * 返回档案 id；都没给返回 null。
     */
    private static Integer resolveMaintainer(Connection c, Integer maintainerId, String newName, String newPhone, int forAccountId) throws SQLException, RuleViolation {
        if (maintainerId != null) {
            try (PreparedStatement ps = c.prepareStatement("SELECT id FROM maintainer WHERE id = ?")) {
                ps.setInt(1, maintainerId);
                try (ResultSet rs = ps.executeQuery()) {
                    if (!rs.next()) throw new RuleViolation(400, "所选养护员档案不存在");
                }
            }
            try (PreparedStatement ps = c.prepareStatement("SELECT username FROM admin_user WHERE maintainer_id = ? AND id <> ? LIMIT 1")) {
                ps.setInt(1, maintainerId);
                ps.setInt(2, forAccountId);
                try (ResultSet rs = ps.executeQuery()) {
                    if (rs.next()) throw new RuleViolation(409, "该养护员档案已关联账号 " + rs.getString(1) + "，请选择其他档案或新建档案");
                }
            }
            return maintainerId;
        }
        if (newName == null || newName.trim().isEmpty()) return null;
        String name = newName.trim();
        if (name.length() > 50) throw new RuleViolation(400, "养护员姓名最多 50 个字");
        String phone = newPhone == null ? null : newPhone.trim();
        if (phone != null && !phone.isEmpty() && !phone.matches("^[0-9+\\- ]{5,30}$")) throw new RuleViolation(400, "联系电话格式不正确");
        // 工号自动生成：WH-2001 起，取现有 WH-数字 的最大值 + 1
        int next = 2001;
        try (Statement st = c.createStatement(); ResultSet rs = st.executeQuery(
                "SELECT staff_no FROM maintainer WHERE staff_no LIKE 'WH-%' FOR UPDATE")) {
            while (rs.next()) {
                String no = rs.getString(1).substring(3);
                if (no.matches("\\d{1,9}")) next = Math.max(next, Integer.parseInt(no) + 1);
            }
        }
        try (PreparedStatement ps = c.prepareStatement(
                "INSERT INTO maintainer (staff_no, name, phone, department, duty, status, entry_date) VALUES (?, ?, ?, ?, ?, '在岗', ?)",
                Statement.RETURN_GENERATED_KEYS)) {
            ps.setString(1, "WH-" + next);
            ps.setString(2, name);
            ps.setString(3, phone == null || phone.isEmpty() ? null : phone);
            ps.setString(4, "校园绿化养护");
            ps.setString(5, "养护人员");
            ps.setString(6, new java.text.SimpleDateFormat("yyyy-MM-dd").format(new java.util.Date()));
            ps.executeUpdate();
            try (ResultSet rs = ps.getGeneratedKeys()) {
                if (rs.next()) return rs.getInt(1);
            }
        }
        throw new SQLException("新建养护员档案失败：未返回 id");
    }

    /** 新建账号（规则已由 {@link security.AccountRules#createProblem} 预检；这里处理重名、档案关联）。返回新账号 id。 */
    public int createAccount(String username, String displayName, String roleCode, String password,
                             Integer maintainerId, String newMaintainerName, String newMaintainerPhone,
                             List<Integer> areaIds) throws Jdbc.DbUnavailableException, RuleViolation {
        String hash = security.PasswordHasher.hash(password);
        return inTx(c -> {
            try (PreparedStatement ps = c.prepareStatement("SELECT 1 FROM admin_user WHERE username = ?")) {
                ps.setString(1, username);
                try (ResultSet rs = ps.executeQuery()) {
                    if (rs.next()) throw new RuleViolation(409, "账号 " + username + " 已存在，请换一个");
                }
            }
            Integer mid = null;
            if (security.Roles.isMaintainer(roleCode)) {
                mid = resolveMaintainer(c, maintainerId, newMaintainerName, newMaintainerPhone, 0);
                if (mid == null) throw new RuleViolation(400, "养护人员账号必须关联养护员档案（选择已有档案，或填写姓名新建档案）");
            }
            int id;
            try (PreparedStatement ps = c.prepareStatement(
                    "INSERT INTO admin_user (username, password_hash, display_name, role_code, status, maintainer_id) VALUES (?, ?, ?, ?, 1, ?)",
                    Statement.RETURN_GENERATED_KEYS)) {
                ps.setString(1, username);
                ps.setString(2, hash);
                ps.setString(3, displayName.trim());
                ps.setString(4, roleCode);
                if (mid == null) ps.setNull(5, java.sql.Types.INTEGER); else ps.setInt(5, mid);
                ps.executeUpdate();
                try (ResultSet rs = ps.getGeneratedKeys()) {
                    if (!rs.next()) throw new SQLException("新建账号失败：未返回 id");
                    id = rs.getInt(1);
                }
            }
            if (mid != null && areaIds != null) assignAreas(c, mid, areaIds);
            return id;
        });
    }

    /** 启用 / 停用。actor 为当前管理员；规则见 {@link security.AccountRules#statusChangeProblem}。 */
    public void setStatus(AdminUser actor, int targetId, boolean enable) throws Jdbc.DbUnavailableException, RuleViolation {
        inTx(c -> {
            Map<String, Object> t = lockAccount(c, targetId);
            if (t == null) throw new RuleViolation(404, "账号不存在");
            String bad = security.AccountRules.statusChangeProblem(actor.getRoleCode(), actor.getId(), targetId,
                    (String) t.get("role_code"), enable, enable ? 1 : otherActiveAccountAdmins(c, targetId));
            if (bad != null) throw new RuleViolation(409, bad);
            try (PreparedStatement ps = c.prepareStatement("UPDATE admin_user SET status = ? WHERE id = ?")) {
                ps.setInt(1, enable ? 1 : 0);
                ps.setInt(2, targetId);
                ps.executeUpdate();
            }
            return null;
        });
    }

    /** 重置密码（新密码已按 {@link security.PasswordHasher#policyProblem} 校验）。 */
    public void resetPassword(int targetId, String newPassword) throws Jdbc.DbUnavailableException, RuleViolation {
        String hash = security.PasswordHasher.hash(newPassword);
        inTx(c -> {
            try (PreparedStatement ps = c.prepareStatement("UPDATE admin_user SET password_hash = ? WHERE id = ?")) {
                ps.setString(1, hash);
                ps.setInt(2, targetId);
                if (ps.executeUpdate() == 0) throw new RuleViolation(404, "账号不存在");
            }
            return null;
        });
    }

    /**
     * 修改角色。改为养护人员时必须关联档案（沿用原关联，或 maintainerId / 新建）；改为管理员时解除档案关联（档案与负责区域保留）。
     */
    public void changeRole(AdminUser actor, int targetId, String newRole, Integer maintainerId,
                           String newMaintainerName, String newMaintainerPhone) throws Jdbc.DbUnavailableException, RuleViolation {
        inTx(c -> {
            Map<String, Object> t = lockAccount(c, targetId);
            if (t == null) throw new RuleViolation(404, "账号不存在");
            String bad = security.AccountRules.roleChangeProblem(actor.getRoleCode(), actor.getId(), targetId,
                    (String) t.get("role_code"), newRole, otherActiveAccountAdmins(c, targetId));
            if (bad != null) throw new RuleViolation(409, bad);
            Integer mid = null;
            if (security.Roles.isMaintainer(newRole)) {
                mid = resolveMaintainer(c, maintainerId, newMaintainerName, newMaintainerPhone, targetId);
                if (mid == null) mid = (Integer) t.get("maintainer_id");
                if (mid == null) throw new RuleViolation(400, "改为养护人员时必须关联养护员档案（选择已有档案，或填写姓名新建档案）");
            }
            try (PreparedStatement ps = c.prepareStatement("UPDATE admin_user SET role_code = ?, maintainer_id = ? WHERE id = ?")) {
                ps.setString(1, newRole);
                if (mid == null) ps.setNull(2, java.sql.Types.INTEGER); else ps.setInt(2, mid);
                ps.setInt(3, targetId);
                ps.executeUpdate();
            }
            return null;
        });
    }

    /** 设置养护人员账号的负责区域（plant_area.maintainer_id）。返回该账号关联的档案 id。 */
    public int setAreas(int targetId, List<Integer> areaIds) throws Jdbc.DbUnavailableException, RuleViolation {
        return inTx(c -> {
            Map<String, Object> t = lockAccount(c, targetId);
            if (t == null) throw new RuleViolation(404, "账号不存在");
            if (!security.Roles.isMaintainer((String) t.get("role_code"))) throw new RuleViolation(409, "只有养护人员账号可以分配负责区域");
            Integer mid = (Integer) t.get("maintainer_id");
            if (mid == null) throw new RuleViolation(409, "该养护人员账号还没有关联养护员档案，请先在“改角色 / 档案”里关联");
            assignAreas(c, mid, areaIds);
            return mid;
        });
    }

    /** 区域只有一个负责养护员：勾选的区域改归该档案（会从原负责人处移走），取消勾选的区域清空负责人。 */
    private static void assignAreas(Connection c, int maintainerId, List<Integer> areaIds) throws SQLException, RuleViolation {
        List<Integer> ids = new ArrayList<>();
        for (Integer a : areaIds) if (a != null && !ids.contains(a)) ids.add(a);
        if (ids.size() > 500) throw new RuleViolation(400, "区域数量过多");
        if (!ids.isEmpty()) {
            StringBuilder q = new StringBuilder();
            for (int i = 0; i < ids.size(); i++) q.append(i == 0 ? "?" : ",?");
            try (PreparedStatement ps = c.prepareStatement("SELECT COUNT(*) FROM plant_area WHERE id IN (" + q + ")")) {
                for (int i = 0; i < ids.size(); i++) ps.setInt(i + 1, ids.get(i));
                try (ResultSet rs = ps.executeQuery()) {
                    rs.next();
                    if (rs.getInt(1) != ids.size()) throw new RuleViolation(400, "所选区域不存在，请刷新后重试");
                }
            }
            try (PreparedStatement ps = c.prepareStatement("UPDATE plant_area SET maintainer_id = ? WHERE id IN (" + q + ")")) {
                ps.setInt(1, maintainerId);
                for (int i = 0; i < ids.size(); i++) ps.setInt(i + 2, ids.get(i));
                ps.executeUpdate();
            }
        }
        StringBuilder sql = new StringBuilder("UPDATE plant_area SET maintainer_id = NULL WHERE maintainer_id = ?");
        if (!ids.isEmpty()) {
            sql.append(" AND id NOT IN (");
            for (int i = 0; i < ids.size(); i++) sql.append(i == 0 ? "?" : ",?");
            sql.append(')');
        }
        try (PreparedStatement ps = c.prepareStatement(sql.toString())) {
            ps.setInt(1, maintainerId);
            for (int i = 0; i < ids.size(); i++) ps.setInt(i + 2, ids.get(i));
            ps.executeUpdate();
        }
    }
}
