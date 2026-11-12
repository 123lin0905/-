package Servlet;

import DB.JdbcZoneSpeciesStore;
import jakarta.servlet.annotation.WebServlet;
import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.example.demo1.AdminUser;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.URL;
import java.net.URLConnection;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.Map;

/**
 * 生态板块动植物增删接口：/api/zones/{zoneId}/species[/{id}]（业务逻辑见 {@link ZoneSpeciesService}）。
 * GET 公开；POST / PUT / DELETE 需登录，且角色为管理员 / 养护员（会话属性 adminUser，与 AuthFilter 相同）。
 * 板块配置读自 /campus3d/data/zones.json（area_code、editable）。数据库不可用时返回 503 {"error":"db_unavailable"}。
 */
@WebServlet(name = "ZoneSpeciesServlet", value = "/api/zones/*")
public class ZoneSpeciesServlet extends HttpServlet {
    private ZoneSpeciesService service;
    private volatile Map<String, ZoneSpeciesService.Zone> zones = Collections.emptyMap();
    private volatile long zonesStamp = -1;

    @Override
    public void init() {
        service = new ZoneSpeciesService(new JdbcZoneSpeciesStore());
    }

    private Map<String, ZoneSpeciesService.Zone> zones() {
        try {
            URL u = getServletContext().getResource("/campus3d/data/zones.json");
            if (u == null) return zones;
            URLConnection c = u.openConnection();
            long lm = c.getLastModified();
            if (lm != zonesStamp) {
                try (InputStream in = c.getInputStream()) {
                    zones = ZoneSpeciesService.parseZones(new String(readAll(in), StandardCharsets.UTF_8));
                    zonesStamp = lm;
                }
            }
        } catch (Exception e) {
            log("读取 zones.json 失败", e);
        }
        return zones;
    }

    private static byte[] readAll(InputStream in) throws IOException {
        ByteArrayOutputStream bo = new ByteArrayOutputStream();
        byte[] b = new byte[8192];
        int n;
        while ((n = in.read(b)) > 0) bo.write(b, 0, n);
        return bo.toByteArray();
    }

    @Override
    protected void service(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        String m = req.getMethod();
        String body = null;
        if ("POST".equals(m) || "PUT".equals(m)) {
            if (req.getContentLength() > 64 * 1024) { resp.sendError(413); return; }
            body = new String(readAll(req.getInputStream()), StandardCharsets.UTF_8);
        }
        Object su = req.getSession(false) == null ? null : req.getSession(false).getAttribute("adminUser");
        AdminUser u = su instanceof AdminUser ? (AdminUser) su : null;
        ZoneSpeciesService.Result r = service.handle(m, req.getPathInfo(), body, zones(),
                u == null ? null : (u.getDisplayName() != null ? u.getDisplayName() : u.getUsername()), u == null ? null : u.getRoleCode());
        resp.setStatus(r.status);
        resp.setContentType("application/json;charset=UTF-8");
        resp.setHeader("Cache-Control", "no-store");
        resp.getWriter().write(r.json());
    }
}
