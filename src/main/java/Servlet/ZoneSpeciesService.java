package Servlet;

import DB.MiniJson;
import DB.ZoneSpeciesStore;
import org.example.demo1.ZoneSpecies;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 板块动植物增删接口的业务逻辑（与 Servlet 容器无关，便于单元测试）。
 * <pre>
 * GET    /api/zones/{zoneId}/species          公开：板块内全部记录（含已移除的原有个体，前端据此隐藏）+ 当前用户能否编辑
 * POST   /api/zones/{zoneId}/species          新增个体；带 seed_ref 时为“原有个体”的首次记录（按 zone+seed_ref 幂等更新）
 * PUT    /api/zones/{zoneId}/species/{id}     移植 / 修改（x、z、rotation、scale、quantity、status）
 * DELETE /api/zones/{zoneId}/species/{id}     移除（软删除：status = removed，保留记录便于追溯）
 * </pre>
 * 写操作要求已登录且角色属于 {@link #EDITOR_ROLES}（管理员 / 养护员）；AuthFilter 也做同样判断。
 */
public class ZoneSpeciesService {
    /** 允许增删动植物的角色：系统 / 绿植 / 养护管理员，以及预留的养护员角色。 */
    public static final Set<String> EDITOR_ROLES = new HashSet<>(Arrays.asList(
            "SYSTEM_ADMIN", "SUPER_ADMIN", "ADMIN", "PLANT_ADMIN", "MAINTENANCE_ADMIN", "MAINTAINER"));
    private static final Pattern PATH = Pattern.compile("^/([A-Za-z0-9_-]{1,50})/species(?:/(\\d{1,18}))?/?$");
    private static final Pattern KEY = Pattern.compile("^[a-z][a-z0-9_]{0,39}$");
    private static final Pattern SEED = Pattern.compile("^[a-z][a-z0-9_]{0,30}#\\d{1,6}$");

    /** 板块配置（来自 campus3d/data/zones.json）。 */
    public static class Zone {
        public final String id, name, areaCode; public final boolean editable;
        public Zone(String id, String name, String areaCode, boolean editable) { this.id = id; this.name = name; this.areaCode = areaCode; this.editable = editable; }
    }

    public static class Result {
        public final int status; public final Map<String, Object> body;
        Result(int status, Map<String, Object> body) { this.status = status; this.body = body; }
        public String json() { return MiniJson.stringify(body); }
    }

    private final ZoneSpeciesStore store;
    public ZoneSpeciesService(ZoneSpeciesStore store) { this.store = store; }

    public static boolean canEdit(String roleCode) { return roleCode != null && EDITOR_ROLES.contains(roleCode); }

    /** 从 zones.json 文本解析板块配置。 */
    @SuppressWarnings("unchecked")
    public static Map<String, Zone> parseZones(String json) {
        Map<String, Zone> out = new LinkedHashMap<>();
        Object zs = MiniJson.parseObject(json).get("zones");
        if (!(zs instanceof List)) return out;
        for (Object o : (List<Object>) zs) {
            if (!(o instanceof Map)) continue;
            Map<String, Object> z = (Map<String, Object>) o;
            String id = (String) z.get("id");
            if (id == null) continue;
            out.put(id, new Zone(id, (String) z.get("name"), z.get("area_code") == null ? id : (String) z.get("area_code"), Boolean.TRUE.equals(z.get("editable"))));
        }
        return out;
    }

    private static Result err(int status, String code, String msg) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("error", code); m.put("message", msg);
        return new Result(status, m);
    }

    /**
     * @param method   HTTP 方法
     * @param pathInfo /api/zones 之后的部分，如 /cuihu_water/species/12
     * @param body     请求体（POST/PUT）
     * @param userName 当前登录用户名（未登录为 null）
     * @param roleCode 当前登录角色（未登录为 null）
     */
    public Result handle(String method, String pathInfo, String body, Map<String, Zone> zones, String userName, String roleCode) {
        Matcher m = PATH.matcher(pathInfo == null ? "" : pathInfo);
        if (!m.matches()) return err(404, "not_found", "接口路径应为 /api/zones/{板块id}/species[/{记录id}]");
        Zone zone = zones.get(m.group(1));
        if (zone == null) return err(404, "zone_not_found", "没有这个生态板块：" + m.group(1));
        Long id = m.group(2) == null ? null : Long.valueOf(m.group(2));
        boolean editor = canEdit(roleCode);
        try {
            if ("GET".equals(method)) {
                if (id != null) {
                    ZoneSpecies s = store.get(zone.id, id);
                    return s == null ? err(404, "not_found", "记录不存在") : ok(200, "item", s.toMap());
                }
                List<Object> items = new ArrayList<>();
                for (ZoneSpecies s : store.list(zone.id)) items.add(s.toMap());
                Map<String, Object> r = new LinkedHashMap<>();
                r.put("zone_id", zone.id); r.put("zone_name", zone.name); r.put("area_code", zone.areaCode); r.put("editable", zone.editable);
                r.put("can_edit", zone.editable && editor); r.put("user", userName); r.put("items", items);
                return new Result(200, r);
            }
            if (!"POST".equals(method) && !"PUT".equals(method) && !"DELETE".equals(method)) return err(405, "method_not_allowed", "不支持的方法 " + method);
            if (userName == null) return err(401, "login_required", "请先登录（管理员或养护员）再增删动植物");
            if (!editor) return err(403, "forbidden", "当前角色 " + roleCode + " 无权增删动植物，仅管理员 / 养护员可以操作");
            if (!zone.editable) return err(403, "zone_readonly", "板块「" + zone.name + "」暂未开放动植物编辑");

            if ("POST".equals(method)) {
                if (id != null) return err(405, "method_not_allowed", "新增请 POST 到 /species");
                Map<String, Object> in = MiniJson.parseObject(body == null ? "{}" : body);
                ZoneSpecies s = new ZoneSpecies();
                s.setZoneId(zone.id); s.setAreaCode(zone.areaCode);
                String type = str(in, "species_type"), key = str(in, "species_key"), name = str(in, "species_name"), seed = str(in, "seed_ref");
                if (!"plant".equals(type) && !"animal".equals(type)) return err(400, "bad_request", "species_type 只能是 plant / animal");
                if (key == null || !KEY.matcher(key).matches()) return err(400, "bad_request", "species_key 格式不正确");
                if (name == null || name.trim().isEmpty() || name.length() > 50) return err(400, "bad_request", "species_name 不能为空且不超过 50 字");
                if (seed != null && !SEED.matcher(seed).matches()) return err(400, "bad_request", "seed_ref 格式应为 key#序号");
                s.setSpeciesType(type); s.setSpeciesKey(key); s.setSpeciesName(name.trim()); s.setSeedRef(seed);
                String bad = applyNumbers(s, in, true);
                if (bad != null) return err(400, "bad_request", bad);
                String st = str(in, "status");
                if (st != null && !"active".equals(st) && !"removed".equals(st)) return err(400, "bad_request", "status 只能是 active / removed");
                s.setStatus(st == null ? "active" : st);
                s.setCreatedBy(userName); s.setUpdatedBy(userName);
                if (seed != null) {          // 原有个体：同一 zone + seed_ref 只有一条记录
                    ZoneSpecies old = store.findBySeed(zone.id, seed);
                    if (old != null) {
                        old.setX(s.getX()); old.setZ(s.getZ()); old.setRotation(s.getRotation()); old.setScale(s.getScale());
                        old.setQuantity(s.getQuantity()); old.setStatus(s.getStatus()); old.setUpdatedBy(userName);
                        return ok(200, "item", store.update(old).toMap());
                    }
                }
                return ok(201, "item", store.insert(s).toMap());
            }
            if (id == null) return err(405, "method_not_allowed", "修改 / 删除需要记录 id：/species/{id}");
            ZoneSpecies s = store.get(zone.id, id);
            if (s == null) return err(404, "not_found", "记录不存在");
            if ("DELETE".equals(method)) {
                s.setStatus("removed"); s.setUpdatedBy(userName);
                return ok(200, "item", store.update(s).toMap());
            }
            Map<String, Object> in = MiniJson.parseObject(body == null ? "{}" : body);
            String bad = applyNumbers(s, in, false);
            if (bad != null) return err(400, "bad_request", bad);
            String st = str(in, "status");
            if (st != null) {
                if (!"active".equals(st) && !"removed".equals(st)) return err(400, "bad_request", "status 只能是 active / removed");
                s.setStatus(st);
            }
            s.setUpdatedBy(userName);
            return ok(200, "item", store.update(s).toMap());
        } catch (ZoneSpeciesStore.StoreUnavailableException e) {
            // 不把 JDBC 原始错误文本返回前端（可能含主机名、账号等），只给通用提示
            return err(503, "db_unavailable", "数据库不可用，未保存到服务器");
        } catch (IllegalArgumentException e) {
            return err(400, "bad_request", e.getMessage());
        }
    }

    private static Result ok(int status, String k, Object v) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put(k, v);
        return new Result(status, m);
    }

    private static String str(Map<String, Object> in, String k) {
        Object v = in.get(k);
        return v == null ? null : String.valueOf(v);
    }

    /** 校验并写入数值字段；required=true 时 x、z 必填。返回错误信息或 null。 */
    private static String applyNumbers(ZoneSpecies s, Map<String, Object> in, boolean required) {
        Double x = num(in, "x"), z = num(in, "z"), rot = num(in, "rotation"), sc = num(in, "scale"), q = num(in, "quantity");
        if (required && (x == null || z == null)) return "x、z 坐标必填";
        if (x != null) { if (Math.abs(x) > 500) return "x 超出范围"; s.setX(x); }
        if (z != null) { if (Math.abs(z) > 500) return "z 超出范围"; s.setZ(z); }
        if (rot != null) s.setRotation(rot % (Math.PI * 2));
        if (sc != null) { if (sc < 0.2 || sc > 3) return "scale 应在 0.2–3 之间"; s.setScale(sc); }
        if (q != null) { if (q < 1 || q > 999 || q != Math.rint(q)) return "quantity 应为 1–999 的整数"; s.setQuantity(q.intValue()); }
        return null;
    }

    private static Double num(Map<String, Object> in, String k) {
        Object v = in.get(k);
        if (v == null) return null;
        if (!(v instanceof Double)) throw new IllegalArgumentException(k + " 必须是数字");
        double d = (Double) v;
        if (Double.isNaN(d) || Double.isInfinite(d)) throw new IllegalArgumentException(k + " 必须是有限数字");
        return d;
    }
}
