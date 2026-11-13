package Servlet;

import DB.DBTools;
import DB.Jdbc;
import DB.JdbcAccountStore;
import DB.JdbcCareStore;
import DB.MiniJson;
import jakarta.servlet.annotation.WebServlet;
import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.example.demo1.AdminUser;
import security.Roles;

import java.io.IOException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map;

/**
 * 养护工作台接口 /api/care/*（仅养护人员，角色集合见 {@link Roles#CARE_ROLES}；未登录 401，访客 / 其他角色 403）：
 * <pre>
 * GET  /api/care/targets   全部个体及浇水 / 施肥 / 喂食状态；当前养护员负责区域（plant_area.maintainer_id）的排在前面并标记 mine
 * POST /api/care/logs      {target_type, target_id, care_type: water|fertilize|feed, note?} 执行一次养护，写入 care_log
 * GET  /api/care/logs      最近的养护记录（?mine=1 只看自己的）
 * </pre>
 * 植物档案（plant）浇水 / 施肥时同时写原养护台账 plant_maintenance 并顺延下次日期；动物档案（animal）喂食时顺延 next_feeding_date。
 */
@WebServlet(name = "CareServlet", value = "/api/care/*")
public class CareServlet extends HttpServlet {
    private final JdbcCareStore store = new JdbcCareStore();
    private final JdbcAccountStore accounts = new JdbcAccountStore();
    private final CareService service = new CareService(store);

    @Override
    protected void service(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        AdminUser me = ApiSupport.require(req, resp, Roles.CARE_ROLES, "养护工作台");
        if (me == null) return;
        String path = req.getPathInfo() == null ? "/" : req.getPathInfo().replaceAll("/+$", "");
        String m = req.getMethod();
        try {
            if ("GET".equals(m) && "/targets".equals(path)) { targets(req, resp, me); return; }
            if ("POST".equals(m) && "/logs".equals(path)) { log(req, resp, me); return; }
            if ("GET".equals(m) && "/logs".equals(path)) {
                boolean mine = "1".equals(req.getParameter("mine"));
                ApiSupport.json(resp, 200, ApiSupport.obj("items", store.recentLogs(30, mine ? me.getId() : null)));
                return;
            }
            ApiSupport.error(resp, 404, "not_found", "没有这个接口：" + m + " /api/care" + path);
        } catch (Jdbc.DbUnavailableException e) {
            ApiSupport.dbDown(this, resp, e);
        } catch (IllegalArgumentException e) {
            ApiSupport.error(resp, 400, "bad_request", e.getMessage());
        }
    }

    private Integer maintainerIdOf(AdminUser me, Map<String, Object> info) {
        return info == null ? null : (Integer) info.get("maintainer_id");
    }

    private void targets(HttpServletRequest req, HttpServletResponse resp, AdminUser me) throws IOException, Jdbc.DbUnavailableException {
        Map<String, Object> info = accounts.accountInfo(me.getId());
        Integer mid = maintainerIdOf(me, info);
        CareService.Board b = service.board(mid, CareService.zones(getServletContext()), System.currentTimeMillis());
        List<Object> myAreas = new ArrayList<>();
        for (Map<String, Object> a : store.areas()) if (mid != null && mid.equals(a.get("maintainer_id"))) myAreas.add(a);
        ApiSupport.json(resp, 200, ApiSupport.obj(
                "me", ApiSupport.obj("display_name", ApiSupport.displayName(me), "maintainer_id", mid,
                        "maintainer_name", info == null ? null : info.get("maintainer_name"), "areas", myAreas),
                "due", ApiSupport.obj("all", b.dueAll, "mine", b.dueMine),
                "items", b.items));
    }

    private void log(HttpServletRequest req, HttpServletResponse resp, AdminUser me) throws IOException, Jdbc.DbUnavailableException {
        String body = ApiSupport.body(req, 16 * 1024);
        if (body == null) { ApiSupport.error(resp, 413, "too_large", "请求过大"); return; }
        Map<String, Object> in = MiniJson.parseObject(body);
        String type = in.get("target_type") == null ? null : String.valueOf(in.get("target_type"));
        Object rawId = in.get("target_id");
        String id = rawId instanceof Double && (Double) rawId == Math.rint((Double) rawId) ? String.valueOf(((Double) rawId).longValue()) : rawId == null ? null : String.valueOf(rawId);
        String careType = in.get("care_type") == null ? null : String.valueOf(in.get("care_type"));
        String note = in.get("note") == null ? null : String.valueOf(in.get("note")).trim();
        if (note != null && note.isEmpty()) note = null;
        if (note != null && note.length() > 200) { ApiSupport.error(resp, 400, "bad_request", "备注不超过 200 字"); return; }
        if (type == null || id == null || careType == null) { ApiSupport.error(resp, 400, "bad_request", "target_type、target_id、care_type 必填"); return; }

        Map<String, Object> info = accounts.accountInfo(me.getId());
        Integer mid = maintainerIdOf(me, info);
        Map<String, Map<String, Object>> zones = CareService.zones(getServletContext());
        CareService.Board b = service.board(mid, zones, System.currentTimeMillis());
        JdbcCareStore.Target t = service.find(b, type, id);
        if (t == null) { ApiSupport.error(resp, 404, "not_found", "没有这个养护对象：" + type + " " + id); return; }
        if (!Arrays.asList(CareSchedule.careTypesFor(t.speciesType)).contains(careType)) {
            ApiSupport.error(resp, 400, "bad_request", ("animal".equals(t.speciesType) ? "动物只能喂食" : "植物只能浇水 / 施肥")); return;
        }
        Map<String, Object> item = service.itemOf(b, type, id);
        Integer period = null;
        for (Object o : (List<?>) item.get("cares")) {
            Map<?, ?> c = (Map<?, ?>) o;
            if (careType.equals(c.get("care_type"))) period = (Integer) c.get("period_days");
        }
        if (period == null || period <= 0) {
            ApiSupport.error(resp, 400, "not_applicable", t.name + " 不需要" + CareSchedule.label(careType) + "（周期配置为 0）"); return;
        }
        String operator = ApiSupport.displayName(me);
        long logId = store.insertLog(t, careType, me.getId(), operator, mid, note);
        // 同步原有档案（失败不影响本次记录）
        try {
            if ("plant".equals(t.type)) new DBTools().recordPlantCare(t.id, CareSchedule.legacyType(careType), operator, note);
            else if ("animal".equals(t.type)) store.syncAnimalFeeding(t.id, period);
        } catch (Exception e) {
            log("同步原养护档案失败：" + e.getMessage());
        }
        CareService.Board after = service.board(mid, zones, System.currentTimeMillis());
        ApiSupport.json(resp, 201, ApiSupport.obj("ok", true, "id", logId,
                "message", "已记录：" + t.name + " " + CareSchedule.label(careType),
                "item", service.itemOf(after, type, id), "due", ApiSupport.obj("all", after.dueAll, "mine", after.dueMine)));
    }
}
