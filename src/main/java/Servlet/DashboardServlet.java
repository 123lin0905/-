package Servlet;

import DB.Jdbc;
import DB.JdbcCareStore;
import jakarta.servlet.annotation.WebServlet;
import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.example.demo1.AdminUser;
import security.Roles;

import java.io.IOException;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 数据大屏接口 GET /api/dashboard/stats（仅管理员，{@link Roles#ADMIN_ROLES}；未登录 401，访客 / 养护员 403）。
 * 第一版只放基础统计，作为后续扩展的骨架：各板块动植物数量、档案总数、养护员人数、近 7 天养护操作次数、待养护数量、各区域负责人。
 */
@WebServlet(name = "DashboardServlet", value = "/api/dashboard/*")
public class DashboardServlet extends HttpServlet {
    private final JdbcCareStore store = new JdbcCareStore();
    private final CareService service = new CareService(store);

    @Override
    protected void doGet(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        AdminUser me = ApiSupport.require(req, resp, Roles.ADMIN_ROLES, "数据大屏");
        if (me == null) return;
        String path = req.getPathInfo() == null ? "/" : req.getPathInfo();
        if (!"/stats".equals(path)) { ApiSupport.error(resp, 404, "not_found", "没有这个接口"); return; }
        try {
            ApiSupport.json(resp, 200, stats());
        } catch (Jdbc.DbUnavailableException e) {
            ApiSupport.dbDown(this, resp, e);
        }
    }

    private Map<String, Object> stats() throws Jdbc.DbUnavailableException {
        long now = System.currentTimeMillis();
        Map<String, Map<String, Object>> zones = CareService.zones(getServletContext());
        CareService.Board board = service.board(null, zones, now);

        // 1. 各生态板块动植物（zone_species 中登记的个体：新增的，以及被移植 / 移除过的原有个体）
        Map<String, int[]> zc = store.zoneSpeciesCounts();
        List<Object> zoneRows = new ArrayList<>();
        for (Map<String, Object> z : zones.values()) {
            String id = (String) z.get("id");
            int[] p = zc.getOrDefault(id + "|plant", new int[2]), a = zc.getOrDefault(id + "|animal", new int[2]);
            zoneRows.add(ApiSupport.obj("id", id, "name", z.get("name"), "icon", z.get("icon"), "color", z.get("color"),
                    "editable", z.get("editable"), "plant_records", p[0], "plant_qty", p[1], "animal_records", a[0], "animal_qty", a[1]));
        }
        // 2. 档案与人员
        Map<String, Object> archive = ApiSupport.obj(
                "plants", Math.max(0, store.count("SELECT COUNT(*) FROM plant")),
                "animal_groups", Math.max(0, store.count("SELECT COUNT(*) FROM animal")),
                "animals_total", Math.max(0, store.count("SELECT COALESCE(SUM(count), 0) FROM animal")),
                "zone_species", Math.max(0, store.count("SELECT COUNT(*) FROM zone_species WHERE status = 'active'")));
        Map<String, Object> people = ApiSupport.obj(
                "maintainers", Math.max(0, store.count("SELECT COUNT(*) FROM maintainer")),
                "on_duty", Math.max(0, store.count("SELECT COUNT(*) FROM maintainer WHERE status = '在岗'")),
                "maintainer_accounts", Math.max(0, store.count("SELECT COUNT(*) FROM admin_user WHERE role_code = 'MAINTAINER' AND status = 1")),
                "face_profiles", Math.max(0, store.count("SELECT COUNT(*) FROM face_profile")),
                "face_accounts", Math.max(0, store.count("SELECT COUNT(DISTINCT account_id) FROM face_profile")));
        // 3. 近 7 天养护操作（北京时间按天）
        Map<String, Integer> daily = store.dailyCounts(7);
        List<Object> days = new ArrayList<>();
        int total7 = 0;
        LocalDate today = LocalDate.now(ZoneId.of("Asia/Shanghai"));
        for (int i = 6; i >= 0; i--) {
            String d = today.minusDays(i).toString();
            int w = daily.getOrDefault(d + "|water", 0), f = daily.getOrDefault(d + "|fertilize", 0), fd = daily.getOrDefault(d + "|feed", 0);
            total7 += w + f + fd;
            days.add(ApiSupport.obj("date", d, "water", w, "fertilize", f, "feed", fd, "total", w + f + fd));
        }
        // 4. 待养护 + 各区域
        int pendingTotal = 0;
        for (int v : board.dueAll.values()) pendingTotal += v;
        List<Object> dueItems = new ArrayList<>();
        Map<String, int[]> perArea = new LinkedHashMap<>();
        for (Map<String, Object> it : board.items) {
            String area = it.get("area_name") == null ? "未分配区域" : String.valueOf(it.get("area_name"));
            int[] c = perArea.computeIfAbsent(area, k -> new int[2]);
            c[0]++;
            int due = (Integer) it.get("due_count");
            if (due > 0) { c[1]++; if (dueItems.size() < 8) dueItems.add(ApiSupport.obj("name", it.get("name"), "area_name", area, "source", it.get("source"), "cares", it.get("cares"))); }
        }
        List<Object> areaRows = new ArrayList<>();
        for (Map<String, Object> a : store.areas()) {
            int[] c = perArea.getOrDefault(String.valueOf(a.get("area_name")), new int[2]);
            areaRows.add(ApiSupport.obj("area_code", a.get("area_code"), "area_name", a.get("area_name"), "maintainer_name", a.get("maintainer_name"), "targets", c[0], "due", c[1]));
        }
        return ApiSupport.obj("generated_at", CareService.fmt(now), "zones", zoneRows, "archive", archive, "people", people,
                "care7d", ApiSupport.obj("days", days, "total", total7),
                "pending", ApiSupport.obj("by_type", board.dueAll, "total", pendingTotal, "targets", board.items.size(), "items", dueItems),
                "areas", areaRows);
    }
}
