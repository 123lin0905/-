package DB;

import security.FaceMatcher;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.sql.Timestamp;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * face_profile 表（DDL 见 {@link Jdbc#DDL} / database/003_face_login_care.sql）。一人可多条，特征向量只在服务端读写。
 */
public class JdbcFaceStore {

    public int countAll() throws Jdbc.DbUnavailableException {
        try (Connection c = JdbcAccountStore.open(); Statement st = c.createStatement();
             ResultSet rs = st.executeQuery("SELECT COUNT(*) FROM face_profile")) {
            rs.next();
            return rs.getInt(1);
        } catch (SQLException e) {
            throw new Jdbc.DbUnavailableException("统计人脸失败：" + e.getMessage(), e);
        }
    }

    public int countByAccount(int accountId) throws Jdbc.DbUnavailableException {
        try (Connection c = JdbcAccountStore.open(); PreparedStatement ps = c.prepareStatement("SELECT COUNT(*) FROM face_profile WHERE account_id = ?")) {
            ps.setInt(1, accountId);
            try (ResultSet rs = ps.executeQuery()) { rs.next(); return rs.getInt(1); }
        } catch (SQLException e) {
            throw new Jdbc.DbUnavailableException("统计人脸失败：" + e.getMessage(), e);
        }
    }

    /** 所有特征（只用于服务端比对）。只取启用账号的人脸。 */
    public List<FaceMatcher.Profile> allVectors() throws Jdbc.DbUnavailableException {
        List<FaceMatcher.Profile> out = new ArrayList<>();
        try (Connection c = JdbcAccountStore.open(); PreparedStatement ps = c.prepareStatement(
                "SELECT f.id, f.account_id, f.embedding FROM face_profile f JOIN admin_user u ON u.id = f.account_id WHERE u.status = 1");
             ResultSet rs = ps.executeQuery()) {
            while (rs.next()) out.add(new FaceMatcher.Profile(rs.getLong(1), rs.getInt(2), FaceMatcher.fromBytes(rs.getBytes(3))));
            return out;
        } catch (SQLException e) {
            throw new Jdbc.DbUnavailableException("读取人脸特征失败：" + e.getMessage(), e);
        }
    }

    /** 某账号的录入记录（不含特征向量）。 */
    public List<Map<String, Object>> listByAccount(int accountId) throws Jdbc.DbUnavailableException {
        List<Map<String, Object>> out = new ArrayList<>();
        try (Connection c = JdbcAccountStore.open(); PreparedStatement ps = c.prepareStatement(
                "SELECT id, account_id, role_code, model, dim, frames, thumbnail, created_by, created_at FROM face_profile WHERE account_id = ? ORDER BY id")) {
            ps.setInt(1, accountId);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("id", rs.getLong("id"));
                    m.put("account_id", rs.getInt("account_id"));
                    m.put("role_code", rs.getString("role_code"));
                    m.put("model", rs.getString("model"));
                    m.put("dim", rs.getInt("dim"));
                    m.put("frames", rs.getInt("frames"));
                    m.put("thumbnail", rs.getString("thumbnail"));
                    m.put("created_by", rs.getString("created_by"));
                    Timestamp t = rs.getTimestamp("created_at");
                    m.put("created_at", JdbcCareStore.cst(t));
                    out.add(m);
                }
            }
            return out;
        } catch (SQLException e) {
            throw new Jdbc.DbUnavailableException("查询人脸失败：" + e.getMessage(), e);
        }
    }

    public long insert(int accountId, String roleCode, float[] vector, int frames, String thumbnail, String createdBy) throws Jdbc.DbUnavailableException {
        try (Connection c = JdbcAccountStore.open(); PreparedStatement ps = c.prepareStatement(
                "INSERT INTO face_profile (account_id, role_code, model, dim, embedding, frames, thumbnail, created_by, created_at) VALUES (?,?,?,?,?,?,?,?,?)",
                Statement.RETURN_GENERATED_KEYS)) {
            ps.setInt(1, accountId);
            ps.setString(2, roleCode);
            ps.setString(3, "human-faceres");
            ps.setInt(4, vector.length);
            ps.setBytes(5, FaceMatcher.toBytes(vector));
            ps.setInt(6, frames);
            if (thumbnail == null) ps.setNull(7, java.sql.Types.VARCHAR); else ps.setString(7, thumbnail);
            ps.setString(8, createdBy);
            ps.setTimestamp(9, new Timestamp(System.currentTimeMillis()));
            ps.executeUpdate();
            try (ResultSet k = ps.getGeneratedKeys()) { return k.next() ? k.getLong(1) : -1; }
        } catch (SQLException e) {
            throw new Jdbc.DbUnavailableException("保存人脸失败：" + e.getMessage(), e);
        }
    }

    /** 返回该条人脸所属账号 id；不存在返回 null。 */
    public Integer ownerOf(long id) throws Jdbc.DbUnavailableException {
        try (Connection c = JdbcAccountStore.open(); PreparedStatement ps = c.prepareStatement("SELECT account_id FROM face_profile WHERE id = ?")) {
            ps.setLong(1, id);
            try (ResultSet rs = ps.executeQuery()) { return rs.next() ? rs.getInt(1) : null; }
        } catch (SQLException e) {
            throw new Jdbc.DbUnavailableException("查询人脸失败：" + e.getMessage(), e);
        }
    }

    public boolean delete(long id) throws Jdbc.DbUnavailableException {
        try (Connection c = JdbcAccountStore.open(); PreparedStatement ps = c.prepareStatement("DELETE FROM face_profile WHERE id = ?")) {
            ps.setLong(1, id);
            return ps.executeUpdate() > 0;
        } catch (SQLException e) {
            throw new Jdbc.DbUnavailableException("删除人脸失败：" + e.getMessage(), e);
        }
    }
}
