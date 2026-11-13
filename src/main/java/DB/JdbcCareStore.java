package DB;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.sql.Timestamp;
import java.text.ParseException;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 养护工作台 / 数据大屏的数据访问：care_log、care_period（DDL 见 {@link Jdbc#DDL}），
 * 以及读取现有的 zone_species（生态板块个体）、plant（绿植档案）、animal（生态动物档案）、plant_area（区域 + 负责养护员）。
 * 现有表可能还没建（全新库、DBTools 尚未初始化），缺表时按空处理，不报错。
 */
public class JdbcCareStore {

    /** 一个可养护的个体。 */
    public static class Target {
        public String type;          // zone_species / plant / animal
        public String id;
        public String name;
        public String speciesKey;    // zone_species.species_key；plant 为 ptype；animal 为 species
        public String speciesType;   // plant / animal
        public String zoneId;        // 仅 zone_species
        public String areaCode, areaName;
        public Integer areaId, areaMaintainerId;
        public int quantity = 1;
        public final Set<Integer> directMaintainers = new HashSet<>();   // plant 的 maintainer_plant 直接分配
        public final Map<String, Integer> ownPeriods = new HashMap<>();   // 个体自身周期（plant / animal 表字段）
    }

    public static class LastOp {
        public long at;
        public String by;
    }

    /** 解析原养护台账 plant_maintenance.mdate（DBTools 按 JVM 默认时区写入的字符串）。 */
    private static final SimpleDateFormat TS = new SimpleDateFormat("yyyy-MM-dd HH:mm:ss");

    /** 返回给前端的时间一律按北京时间显示（服务器 JVM 时区可能是 UTC）。 */
    static String cst(Timestamp t) {
        if (t == null) return null;
        SimpleDateFormat f = new SimpleDateFormat("yyyy-MM-dd HH:mm:ss");
        f.setTimeZone(java.util.TimeZone.getTimeZone("Asia/Shanghai"));
        return f.format(t);
    }

    private static Integer intOrNull(ResultSet rs, String col) throws SQLException {
        int v = rs.getInt(col);
        return rs.wasNull() ? null : v;
    }

    /** 首次使用时为 zones.json 里的生态板块补建 plant_area 区域档案（area_code 相同即可关联；已存在的不改）。 */
    public void ensureZoneAreas(Map<String, String> areaCodeToName) {
        if (areaCodeToName == null || areaCodeToName.isEmpty()) return;
        try (Connection c = JdbcAccountStore.open(); PreparedStatement ps = c.prepareStatement(
                "INSERT IGNORE INTO plant_area (area_code, area_name, status) VALUES (?, ?, '启用')")) {
            for (Map.Entry<String, String> e : areaCodeToName.entrySet()) {
                ps.setString(1, e.getKey());
                ps.setString(2, e.getValue());
                ps.addBatch();
            }
            ps.executeBatch();
        } catch (Exception e) {
            System.err.println("补建生态板块区域档案提示: " + e.getMessage());
        }
    }

    public Map<String, Integer> periods() throws Jdbc.DbUnavailableException {
        Map<String, Integer> out = new HashMap<>();
        try (Connection c = JdbcAccountStore.open(); Statement st = c.createStatement();
             ResultSet rs = st.executeQuery("SELECT species_key, care_type, period_days FROM care_period")) {
            while (rs.next()) out.put(rs.getString(1) + "|" + rs.getString(2), rs.getInt(3));
            return out;
        } catch (SQLException e) {
            throw new Jdbc.DbUnavailableException("读取养护周期失败：" + e.getMessage(), e);
        }
    }

    /** 全部可养护个体：生态板块个体（zone_species, active）+ 绿植档案（plant）+ 生态动物档案（animal）。 */
    public List<Target> targets() throws Jdbc.DbUnavailableException {
        List<Target> out = new ArrayList<>();
        try (Connection c = JdbcAccountStore.open()) {
            // 1. 生态板块个体
            try (PreparedStatement ps = c.prepareStatement(
                    "SELECT z.id, z.zone_id, z.area_code, z.species_type, z.species_key, z.species_name, z.seed_ref, z.quantity, a.id AS area_id, a.area_name, a.maintainer_id " +
                            // 显式指定排序规则：zone_species 为 utf8mb4_unicode_ci，plant_area 可能是库默认（MySQL 8 为 0900_ai_ci、MariaDB 11 为 uca1400），直接比较会报 Illegal mix of collations
                            "FROM zone_species z LEFT JOIN plant_area a ON a.area_code COLLATE utf8mb4_unicode_ci = z.area_code COLLATE utf8mb4_unicode_ci " +
                            "WHERE z.status = 'active' ORDER BY z.zone_id, z.id");
                 ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    Target t = new Target();
                    t.type = "zone_species"; t.id = String.valueOf(rs.getLong("id"));
                    t.name = rs.getString("species_name") + (rs.getString("seed_ref") != null ? "（原有 " + rs.getString("seed_ref") + "）" : " #" + rs.getLong("id"));
                    t.speciesKey = rs.getString("species_key"); t.speciesType = rs.getString("species_type");
                    t.zoneId = rs.getString("zone_id"); t.areaCode = rs.getString("area_code"); t.areaName = rs.getString("area_name");
                    t.areaId = intOrNull(rs, "area_id"); t.areaMaintainerId = intOrNull(rs, "maintainer_id"); t.quantity = rs.getInt("quantity");
                    out.add(t);
                }
            } catch (SQLException e) { if (!Jdbc.isMissingTable(e)) throw e; }
            // 2. 绿植档案
            Map<String, Target> plants = new LinkedHashMap<>();
            try (PreparedStatement ps = c.prepareStatement(
                    "SELECT p.pid, p.pname, p.ptype, p.area_id, p.water_period_days, p.fertilize_period_days, a.area_code, a.area_name, a.maintainer_id " +
                            "FROM plant p LEFT JOIN plant_area a ON a.id = p.area_id ORDER BY p.area_id, p.pid");
                 ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    Target t = new Target();
                    t.type = "plant"; t.id = rs.getString("pid"); t.name = rs.getString("pname");
                    t.speciesKey = rs.getString("ptype"); t.speciesType = "plant";
                    t.areaId = intOrNull(rs, "area_id"); t.areaCode = rs.getString("area_code"); t.areaName = rs.getString("area_name");
                    t.areaMaintainerId = intOrNull(rs, "maintainer_id");
                    Integer w = intOrNull(rs, "water_period_days"), f = intOrNull(rs, "fertilize_period_days");
                    if (w != null) t.ownPeriods.put("water", w);
                    if (f != null) t.ownPeriods.put("fertilize", f);
                    plants.put(t.id, t);
                }
            } catch (SQLException e) { if (!Jdbc.isMissingTable(e)) throw e; }
            if (!plants.isEmpty()) {
                try (PreparedStatement ps = c.prepareStatement("SELECT pid, maintainer_id FROM maintainer_plant WHERE status = '有效'");
                     ResultSet rs = ps.executeQuery()) {
                    while (rs.next()) { Target t = plants.get(rs.getString(1)); if (t != null) t.directMaintainers.add(rs.getInt(2)); }
                } catch (SQLException e) { if (!Jdbc.isMissingTable(e)) throw e; }
                out.addAll(plants.values());
            }
            // 3. 生态动物档案
            try (PreparedStatement ps = c.prepareStatement(
                    "SELECT an.id, an.name, an.species, an.count, an.area_id, an.area_name AS an_area, an.feeding_cycle_days, a.area_code, a.area_name, a.maintainer_id " +
                            "FROM animal an LEFT JOIN plant_area a ON a.id = an.area_id ORDER BY an.area_id, an.id");
                 ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    Target t = new Target();
                    t.type = "animal"; t.id = String.valueOf(rs.getInt("id")); t.name = rs.getString("name");
                    t.speciesKey = rs.getString("species"); t.speciesType = "animal";
                    t.areaId = intOrNull(rs, "area_id"); t.areaCode = rs.getString("area_code");
                    t.areaName = rs.getString("area_name") != null ? rs.getString("area_name") : rs.getString("an_area");
                    t.areaMaintainerId = intOrNull(rs, "maintainer_id"); t.quantity = Math.max(1, rs.getInt("count"));
                    Integer fd = intOrNull(rs, "feeding_cycle_days");
                    if (fd != null) t.ownPeriods.put("feed", fd);
                    out.add(t);
                }
            } catch (SQLException e) { if (!Jdbc.isMissingTable(e)) throw e; }
            return out;
        } catch (SQLException e) {
            throw new Jdbc.DbUnavailableException("读取养护对象失败：" + e.getMessage(), e);
        }
    }

    /** 每个“个体 + 养护项目”的最近一次操作（care_log；plant 另参考原养护台账 plant_maintenance 的浇水 / 施肥记录）。 */
    public Map<String, LastOp> lastOps() throws Jdbc.DbUnavailableException {
        Map<String, LastOp> out = new HashMap<>();
        try (Connection c = JdbcAccountStore.open()) {
            try (PreparedStatement ps = c.prepareStatement(
                    "SELECT l.target_type, l.target_id, l.care_type, l.created_at, l.operator_name FROM care_log l " +
                            "JOIN (SELECT MAX(id) AS id FROM care_log GROUP BY target_type, target_id, care_type) m ON m.id = l.id");
                 ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    LastOp o = new LastOp();
                    o.at = rs.getTimestamp(4).getTime(); o.by = rs.getString(5);
                    out.put(rs.getString(1) + "|" + rs.getString(2) + "|" + rs.getString(3), o);
                }
            }
            try (PreparedStatement ps = c.prepareStatement(
                    "SELECT pid, mtype, mdate, operator FROM plant_maintenance WHERE mtype IN ('浇水', '施肥')");
                 ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    Long at = parseTime(rs.getString(3));
                    if (at == null) continue;
                    String key = "plant|" + rs.getString(1) + "|" + ("浇水".equals(rs.getString(2)) ? "water" : "fertilize");
                    LastOp old = out.get(key);
                    if (old == null || at > old.at) { LastOp o = new LastOp(); o.at = at; o.by = rs.getString(4); out.put(key, o); }
                }
            } catch (SQLException e) { if (!Jdbc.isMissingTable(e)) throw e; }
            return out;
        } catch (SQLException e) {
            throw new Jdbc.DbUnavailableException("读取养护记录失败：" + e.getMessage(), e);
        }
    }

    private static Long parseTime(String s) {
        if (s == null) return null;
        s = s.trim();
        try {
            synchronized (TS) { return (s.length() > 10 ? TS : new SimpleDateFormat("yyyy-MM-dd")).parse(s.length() > 19 ? s.substring(0, 19) : s).getTime(); }
        } catch (ParseException e) {
            return null;
        }
    }

    public long insertLog(Target t, String careType, int operatorId, String operatorName, Integer maintainerId, String note) throws Jdbc.DbUnavailableException {
        try (Connection c = JdbcAccountStore.open(); PreparedStatement ps = c.prepareStatement(
                "INSERT INTO care_log (target_type, target_id, target_name, area_code, care_type, operator_id, operator_name, maintainer_id, note, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
                Statement.RETURN_GENERATED_KEYS)) {
            ps.setString(1, t.type); ps.setString(2, t.id); ps.setString(3, t.name); ps.setString(4, t.areaCode);
            ps.setString(5, careType); ps.setInt(6, operatorId); ps.setString(7, operatorName);
            if (maintainerId == null) ps.setNull(8, java.sql.Types.INTEGER); else ps.setInt(8, maintainerId);
            if (note == null) ps.setNull(9, java.sql.Types.VARCHAR); else ps.setString(9, note);
            // 时间由应用写入（JDBC 按 serverTimezone 换算），避免数据库服务器时区与应用不一致
            ps.setTimestamp(10, new Timestamp(System.currentTimeMillis()));
            ps.executeUpdate();
            try (ResultSet k = ps.getGeneratedKeys()) { return k.next() ? k.getLong(1) : -1; }
        } catch (SQLException e) {
            throw new Jdbc.DbUnavailableException("写入养护记录失败：" + e.getMessage(), e);
        }
    }

    public List<Map<String, Object>> recentLogs(int limit, Integer operatorId) throws Jdbc.DbUnavailableException {
        List<Map<String, Object>> out = new ArrayList<>();
        String sql = "SELECT id, target_type, target_id, target_name, area_code, care_type, operator_id, operator_name, note, created_at FROM care_log" +
                (operatorId != null ? " WHERE operator_id = ?" : "") + " ORDER BY id DESC LIMIT ?";
        try (Connection c = JdbcAccountStore.open(); PreparedStatement ps = c.prepareStatement(sql)) {
            int i = 1;
            if (operatorId != null) ps.setInt(i++, operatorId);
            ps.setInt(i, Math.max(1, Math.min(200, limit)));
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("id", rs.getLong("id")); m.put("target_type", rs.getString("target_type")); m.put("target_id", rs.getString("target_id"));
                    m.put("target_name", rs.getString("target_name")); m.put("area_code", rs.getString("area_code"));
                    m.put("care_type", rs.getString("care_type")); m.put("operator_id", rs.getInt("operator_id"));
                    m.put("operator_name", rs.getString("operator_name")); m.put("note", rs.getString("note"));
                    Timestamp t = rs.getTimestamp("created_at");
                    m.put("created_at", cst(t));
                    out.add(m);
                }
            }
            return out;
        } catch (SQLException e) {
            throw new Jdbc.DbUnavailableException("读取养护记录失败：" + e.getMessage(), e);
        }
    }

    /** 近 N 天（含今天，北京时间）每天、每种养护的操作次数：key = yyyy-MM-dd|care_type。 */
    public Map<String, Integer> dailyCounts(int days) throws Jdbc.DbUnavailableException {
        Map<String, Integer> out = new HashMap<>();
        java.time.ZoneId zone = java.time.ZoneId.of("Asia/Shanghai");
        java.time.LocalDate first = java.time.LocalDate.now(zone).minusDays(days - 1);
        long from = first.atStartOfDay(zone).toInstant().toEpochMilli();
        try (Connection c = JdbcAccountStore.open(); PreparedStatement ps = c.prepareStatement(
                "SELECT created_at, care_type FROM care_log WHERE created_at >= ?")) {
            ps.setTimestamp(1, new Timestamp(from));
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    String d = java.time.Instant.ofEpochMilli(rs.getTimestamp(1).getTime()).atZone(zone).toLocalDate().toString();
                    out.merge(d + "|" + rs.getString(2), 1, Integer::sum);
                }
            }
            return out;
        } catch (SQLException e) {
            throw new Jdbc.DbUnavailableException("统计养护记录失败：" + e.getMessage(), e);
        }
    }

    /** 区域档案 + 负责养护员姓名。 */
    public List<Map<String, Object>> areas() throws Jdbc.DbUnavailableException {
        List<Map<String, Object>> out = new ArrayList<>();
        try (Connection c = JdbcAccountStore.open(); PreparedStatement ps = c.prepareStatement(
                "SELECT a.id, a.area_code, a.area_name, a.maintainer_id, m.name FROM plant_area a LEFT JOIN maintainer m ON m.id = a.maintainer_id ORDER BY a.id");
             ResultSet rs = ps.executeQuery()) {
            while (rs.next()) {
                Map<String, Object> m = new LinkedHashMap<>();
                m.put("id", rs.getInt(1)); m.put("area_code", rs.getString(2)); m.put("area_name", rs.getString(3));
                int mid = rs.getInt(4); m.put("maintainer_id", rs.wasNull() ? null : mid); m.put("maintainer_name", rs.getString(5));
                out.add(m);
            }
            return out;
        } catch (SQLException e) {
            if (Jdbc.isMissingTable(e)) return out;
            throw new Jdbc.DbUnavailableException("读取区域失败：" + e.getMessage(), e);
        }
    }

    /** 数据大屏的简单计数：返回 -1 表示该表还不存在。 */
    public int count(String sql) throws Jdbc.DbUnavailableException {
        try (Connection c = JdbcAccountStore.open(); Statement st = c.createStatement(); ResultSet rs = st.executeQuery(sql)) {
            return rs.next() ? rs.getInt(1) : 0;
        } catch (SQLException e) {
            if (Jdbc.isMissingTable(e)) return -1;
            throw new Jdbc.DbUnavailableException("统计失败：" + e.getMessage(), e);
        }
    }

    /** 生态板块个体按板块、类型汇总：zone_id|plant → {records, quantity}。 */
    public Map<String, int[]> zoneSpeciesCounts() throws Jdbc.DbUnavailableException {
        Map<String, int[]> out = new HashMap<>();
        try (Connection c = JdbcAccountStore.open(); Statement st = c.createStatement();
             ResultSet rs = st.executeQuery("SELECT zone_id, species_type, COUNT(*), COALESCE(SUM(quantity), 0) FROM zone_species WHERE status = 'active' GROUP BY zone_id, species_type")) {
            while (rs.next()) out.put(rs.getString(1) + "|" + rs.getString(2), new int[]{rs.getInt(3), rs.getInt(4)});
            return out;
        } catch (SQLException e) {
            if (Jdbc.isMissingTable(e)) return out;
            throw new Jdbc.DbUnavailableException("统计板块动植物失败：" + e.getMessage(), e);
        }
    }

    /** 养护后同步原有档案：动物的下次喂食日期（与原“生态动物”页面一致）。失败不影响 care_log。 */
    public void syncAnimalFeeding(String animalId, int cycleDays) {
        try (Connection c = JdbcAccountStore.open(); PreparedStatement ps = c.prepareStatement(
                "UPDATE animal SET next_feeding_date = DATE_FORMAT(DATE_ADD(CURDATE(), INTERVAL ? DAY), '%Y-%m-%d') WHERE id = ?")) {
            ps.setInt(1, Math.max(1, cycleDays));
            ps.setInt(2, Integer.parseInt(animalId));
            ps.executeUpdate();
        } catch (Exception e) {
            System.err.println("同步动物喂食日期提示: " + e.getMessage());
        }
    }
}
