package DB;

import org.example.demo1.ZoneSpecies;

import java.io.InputStream;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.sql.Timestamp;
import java.sql.Types;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.List;
import java.util.Properties;

/**
 * zone_species 表的 JDBC 实现。连接参数沿用 src/main/resources/db.properties（与 MyBatis 相同的库 plant）。
 * 首次使用时 CREATE TABLE IF NOT EXISTS（与 database/002_zone_species.sql 一致），连不上库时抛 StoreUnavailableException。
 */
public class JdbcZoneSpeciesStore implements ZoneSpeciesStore {
    static final String DDL = "CREATE TABLE IF NOT EXISTS zone_species (\n" +
            "  id BIGINT NOT NULL AUTO_INCREMENT,\n" +
            "  zone_id VARCHAR(50) NOT NULL COMMENT '生态板块 id（campus3d/data/zones.json）',\n" +
            "  area_code VARCHAR(50) NOT NULL COMMENT '对应 plant_area.area_code',\n" +
            "  species_type VARCHAR(10) NOT NULL COMMENT 'plant / animal',\n" +
            "  species_key VARCHAR(40) NOT NULL COMMENT '物种目录 key，如 lotus、koi',\n" +
            "  species_name VARCHAR(50) NOT NULL COMMENT '中文名',\n" +
            "  seed_ref VARCHAR(40) DEFAULT NULL COMMENT '场景原有个体编号（如 willow#2）；新增个体为 NULL',\n" +
            "  quantity INT NOT NULL DEFAULT 1,\n" +
            "  pos_x DOUBLE NOT NULL DEFAULT 0, pos_z DOUBLE NOT NULL DEFAULT 0,\n" +
            "  rotation_y DOUBLE NOT NULL DEFAULT 0, scale DOUBLE NOT NULL DEFAULT 1,\n" +
            "  status VARCHAR(16) NOT NULL DEFAULT 'active' COMMENT 'active / removed',\n" +
            "  created_by VARCHAR(50) DEFAULT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,\n" +
            "  updated_by VARCHAR(50) DEFAULT NULL, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,\n" +
            "  PRIMARY KEY (id),\n" +
            "  UNIQUE KEY uk_zone_species_seed (zone_id, seed_ref),\n" +
            "  KEY idx_zone_species_zone (zone_id, status),\n" +
            "  KEY idx_zone_species_area (area_code)\n" +
            ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci";
    private static final String COLS = "id, zone_id, area_code, species_type, species_key, species_name, seed_ref, quantity, pos_x, pos_z, rotation_y, scale, status, created_by, created_at, updated_by, updated_at";

    private final String url, user, password;
    private volatile boolean schemaReady;

    public JdbcZoneSpeciesStore() {
        Properties p = new Properties();
        try (InputStream in = JdbcZoneSpeciesStore.class.getClassLoader().getResourceAsStream("db.properties")) {
            if (in != null) p.load(in);
        } catch (Exception ignored) { /* 用默认值 */ }
        String u = p.getProperty("jdbc.url", "jdbc:mysql://localhost:3306/plant?useSSL=false&serverTimezone=Asia/Shanghai&characterEncoding=utf8");
        // 连不上库时尽快失败（前端会切到演示模式），而不是让页面等 TCP 超时
        if (!u.contains("connectTimeout")) u += (u.contains("?") ? "&" : "?") + "connectTimeout=3000&socketTimeout=8000";
        url = u; user = p.getProperty("jdbc.username", "root"); password = p.getProperty("jdbc.password", "");
        try { Class.forName(p.getProperty("jdbc.driver", "com.mysql.cj.jdbc.Driver")); } catch (ClassNotFoundException ignored) { /* DriverManager 自动发现 */ }
    }

    private Connection conn() throws StoreUnavailableException {
        try {
            DriverManager.setLoginTimeout(4);
            Connection c = DriverManager.getConnection(url, user, password);
            if (!schemaReady) {
                try (Statement st = c.createStatement()) { st.execute(DDL); }
                schemaReady = true;
            }
            return c;
        } catch (SQLException e) {
            throw new StoreUnavailableException("数据库不可用：" + e.getMessage(), e);
        }
    }

    private static ZoneSpecies row(ResultSet rs) throws SQLException {
        SimpleDateFormat f = new SimpleDateFormat("yyyy-MM-dd HH:mm:ss");
        ZoneSpecies s = new ZoneSpecies();
        s.setId(rs.getLong("id")); s.setZoneId(rs.getString("zone_id")); s.setAreaCode(rs.getString("area_code"));
        s.setSpeciesType(rs.getString("species_type")); s.setSpeciesKey(rs.getString("species_key")); s.setSpeciesName(rs.getString("species_name"));
        s.setSeedRef(rs.getString("seed_ref")); s.setQuantity(rs.getInt("quantity"));
        s.setX(rs.getDouble("pos_x")); s.setZ(rs.getDouble("pos_z")); s.setRotation(rs.getDouble("rotation_y")); s.setScale(rs.getDouble("scale"));
        s.setStatus(rs.getString("status")); s.setCreatedBy(rs.getString("created_by")); s.setUpdatedBy(rs.getString("updated_by"));
        Timestamp c = rs.getTimestamp("created_at"), u = rs.getTimestamp("updated_at");
        s.setCreatedAt(c == null ? null : f.format(c)); s.setUpdatedAt(u == null ? null : f.format(u));
        return s;
    }

    @Override
    public List<ZoneSpecies> list(String zoneId) throws StoreUnavailableException {
        try (Connection c = conn(); PreparedStatement ps = c.prepareStatement("SELECT " + COLS + " FROM zone_species WHERE zone_id = ? ORDER BY id")) {
            ps.setString(1, zoneId);
            List<ZoneSpecies> out = new ArrayList<>();
            try (ResultSet rs = ps.executeQuery()) { while (rs.next()) out.add(row(rs)); }
            return out;
        } catch (SQLException e) { throw new StoreUnavailableException("查询失败：" + e.getMessage(), e); }
    }

    @Override
    public ZoneSpecies get(String zoneId, long id) throws StoreUnavailableException {
        try (Connection c = conn(); PreparedStatement ps = c.prepareStatement("SELECT " + COLS + " FROM zone_species WHERE zone_id = ? AND id = ?")) {
            ps.setString(1, zoneId); ps.setLong(2, id);
            try (ResultSet rs = ps.executeQuery()) { return rs.next() ? row(rs) : null; }
        } catch (SQLException e) { throw new StoreUnavailableException("查询失败：" + e.getMessage(), e); }
    }

    @Override
    public ZoneSpecies findBySeed(String zoneId, String seedRef) throws StoreUnavailableException {
        try (Connection c = conn(); PreparedStatement ps = c.prepareStatement("SELECT " + COLS + " FROM zone_species WHERE zone_id = ? AND seed_ref = ?")) {
            ps.setString(1, zoneId); ps.setString(2, seedRef);
            try (ResultSet rs = ps.executeQuery()) { return rs.next() ? row(rs) : null; }
        } catch (SQLException e) { throw new StoreUnavailableException("查询失败：" + e.getMessage(), e); }
    }

    @Override
    public ZoneSpecies insert(ZoneSpecies s) throws StoreUnavailableException {
        String sql = "INSERT INTO zone_species (zone_id, area_code, species_type, species_key, species_name, seed_ref, quantity, pos_x, pos_z, rotation_y, scale, status, created_by, updated_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)";
        try (Connection c = conn(); PreparedStatement ps = c.prepareStatement(sql, Statement.RETURN_GENERATED_KEYS)) {
            ps.setString(1, s.getZoneId()); ps.setString(2, s.getAreaCode()); ps.setString(3, s.getSpeciesType()); ps.setString(4, s.getSpeciesKey());
            ps.setString(5, s.getSpeciesName());
            if (s.getSeedRef() == null) ps.setNull(6, Types.VARCHAR); else ps.setString(6, s.getSeedRef());
            ps.setInt(7, s.getQuantity()); ps.setDouble(8, s.getX()); ps.setDouble(9, s.getZ()); ps.setDouble(10, s.getRotation()); ps.setDouble(11, s.getScale());
            ps.setString(12, s.getStatus()); ps.setString(13, s.getCreatedBy()); ps.setString(14, s.getUpdatedBy());
            ps.executeUpdate();
            try (ResultSet k = ps.getGeneratedKeys()) { if (k.next()) return get(s.getZoneId(), k.getLong(1)); }
            throw new StoreUnavailableException("插入后未返回主键", null);
        } catch (SQLException e) { throw new StoreUnavailableException("写入失败：" + e.getMessage(), e); }
    }

    @Override
    public ZoneSpecies update(ZoneSpecies s) throws StoreUnavailableException {
        String sql = "UPDATE zone_species SET quantity = ?, pos_x = ?, pos_z = ?, rotation_y = ?, scale = ?, status = ?, updated_by = ? WHERE id = ? AND zone_id = ?";
        try (Connection c = conn(); PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setInt(1, s.getQuantity()); ps.setDouble(2, s.getX()); ps.setDouble(3, s.getZ()); ps.setDouble(4, s.getRotation()); ps.setDouble(5, s.getScale());
            ps.setString(6, s.getStatus()); ps.setString(7, s.getUpdatedBy()); ps.setLong(8, s.getId()); ps.setString(9, s.getZoneId());
            ps.executeUpdate();
            return get(s.getZoneId(), s.getId());
        } catch (SQLException e) { throw new StoreUnavailableException("更新失败：" + e.getMessage(), e); }
    }
}
