package Servlet;

import DB.Jdbc;
import DB.JdbcCareStore;
import DB.MiniJson;
import jakarta.servlet.ServletContext;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.Date;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 养护工作台与数据大屏共用：把个体（zone_species / plant / animal）+ 养护周期 + 最近操作 计算成“是否需要浇水 / 施肥 / 喂食”。
 */
class CareService {
    private final JdbcCareStore store;
    private volatile boolean areasEnsured;

    CareService(JdbcCareStore store) { this.store = store; }

    /** zones.json 的板块信息（id → map：name、icon、color、area_code、detail_scene）。 */
    @SuppressWarnings("unchecked")
    static Map<String, Map<String, Object>> zones(ServletContext ctx) {
        Map<String, Map<String, Object>> out = new LinkedHashMap<>();
        try (InputStream in = ctx.getResourceAsStream("/campus3d/data/zones.json")) {
            if (in == null) return out;
            ByteArrayOutputStream bo = new ByteArrayOutputStream();
            byte[] b = new byte[8192];
            int n;
            while ((n = in.read(b)) > 0) bo.write(b, 0, n);
            Object zs = MiniJson.parseObject(new String(bo.toByteArray(), StandardCharsets.UTF_8)).get("zones");
            if (zs instanceof List) for (Object o : (List<Object>) zs) {
                if (!(o instanceof Map)) continue;
                Map<String, Object> z = (Map<String, Object>) o;
                if (z.get("id") != null) out.put((String) z.get("id"), z);
            }
        } catch (Exception ignored) { /* 板块信息缺省时只少了名称 / 图标 */ }
        return out;
    }

    /** 确保 zones.json 的生态板块在 plant_area 中都有区域档案（只补建一次）。 */
    void ensureZoneAreas(Map<String, Map<String, Object>> zones) {
        if (areasEnsured) return;
        Map<String, String> m = new LinkedHashMap<>();
        for (Map<String, Object> z : zones.values()) {
            Object code = z.get("area_code");
            if (code != null) m.put(String.valueOf(code), "生态板块·" + z.get("name"));
        }
        store.ensureZoneAreas(m);
        areasEnsured = true;
    }

    static String fmt(Long ms) {
        if (ms == null) return null;
        SimpleDateFormat f = new SimpleDateFormat("yyyy-MM-dd HH:mm");
        f.setTimeZone(java.util.TimeZone.getTimeZone("Asia/Shanghai"));
        return f.format(new Date(ms));
    }

    static class Board {
        final List<Map<String, Object>> items = new ArrayList<>();
        final Map<String, Integer> dueAll = new LinkedHashMap<>(), dueMine = new LinkedHashMap<>();
        final List<JdbcCareStore.Target> targets = new ArrayList<>();
    }

    /** 计算全部个体的养护状态；maintainerId 为当前养护员档案 id（可为 null），用于标记“我负责的”。 */
    Board board(Integer maintainerId, Map<String, Map<String, Object>> zones, long now) throws Jdbc.DbUnavailableException {
        ensureZoneAreas(zones);
        Map<String, Integer> periods = store.periods();
        Map<String, JdbcCareStore.LastOp> last = store.lastOps();
        Board b = new Board();
        for (String t : new String[]{CareSchedule.WATER, CareSchedule.FERTILIZE, CareSchedule.FEED}) { b.dueAll.put(t, 0); b.dueMine.put(t, 0); }
        for (JdbcCareStore.Target t : store.targets()) {
            b.targets.add(t);
            boolean mine = maintainerId != null && (maintainerId.equals(t.areaMaintainerId) || t.directMaintainers.contains(maintainerId));
            Map<String, Object> it = new LinkedHashMap<>();
            it.put("target_type", t.type); it.put("target_id", t.id); it.put("name", t.name);
            it.put("species_key", t.speciesKey); it.put("species_type", t.speciesType); it.put("quantity", t.quantity);
            Map<String, Object> z = t.zoneId == null ? null : zones.get(t.zoneId);
            it.put("zone_id", t.zoneId); it.put("zone_name", z == null ? null : z.get("name")); it.put("zone_icon", z == null ? null : z.get("icon"));
            it.put("scene_url", z == null || z.get("detail_scene") == null ? null : "campus3d/" + z.get("detail_scene") + "?zone=" + t.zoneId);
            it.put("area_code", t.areaCode); it.put("area_name", t.areaName); it.put("mine", mine);
            it.put("source", "zone_species".equals(t.type) ? "生态板块" : "plant".equals(t.type) ? "绿植档案" : "生态动物档案");
            List<Object> cares = new ArrayList<>();
            int dueCount = 0;
            for (String ct : CareSchedule.careTypesFor(t.speciesType)) {
                Integer period = CareSchedule.resolvePeriod(t.ownPeriods.get(ct), "zone_species".equals(t.type) ? t.speciesKey : null, t.speciesType, ct, periods);
                JdbcCareStore.LastOp op = last.get(t.type + "|" + t.id + "|" + ct);
                CareSchedule.Status st = CareSchedule.evaluate(op == null ? null : op.at, period, now);
                Map<String, Object> c = new LinkedHashMap<>();
                c.put("care_type", ct); c.put("label", CareSchedule.label(ct)); c.put("period_days", period);
                c.put("state", st.state); c.put("last_at", fmt(op == null ? null : op.at)); c.put("last_by", op == null ? null : op.by);
                c.put("next_due_at", fmt(st.nextDueAt)); c.put("overdue_hours", st.overdueMs / CareSchedule.HOUR);
                cares.add(c);
                if (st.needsAction()) {
                    dueCount++;
                    b.dueAll.merge(ct, 1, Integer::sum);
                    if (mine) b.dueMine.merge(ct, 1, Integer::sum);
                }
            }
            it.put("cares", cares); it.put("due_count", dueCount);
            b.items.add(it);
        }
        b.items.sort(Comparator.<Map<String, Object>, Boolean>comparing(m -> !(Boolean) m.get("mine"))
                .thenComparing(m -> -((Integer) m.get("due_count")))
                .thenComparing(m -> String.valueOf(m.get("area_name")))
                .thenComparing(m -> String.valueOf(m.get("name"))));
        return b;
    }

    JdbcCareStore.Target find(Board b, String type, String id) {
        for (JdbcCareStore.Target t : b.targets) if (t.type.equals(type) && t.id.equals(id)) return t;
        return null;
    }

    Map<String, Object> itemOf(Board b, String type, String id) {
        for (Map<String, Object> m : b.items) if (type.equals(m.get("target_type")) && id.equals(m.get("target_id"))) return m;
        return Collections.emptyMap();
    }
}
