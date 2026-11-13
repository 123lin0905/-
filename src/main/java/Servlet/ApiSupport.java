package Servlet;

import DB.MiniJson;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.example.demo1.AdminUser;
import security.Roles;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Map;

/** 人脸 / 养护 / 大屏接口共用的 JSON 输出、请求体读取与身份判断。 */
final class ApiSupport {
    private ApiSupport() {
    }

    static final String DB_DOWN_MESSAGE = "数据库暂不可用，请稍后再试（详细原因已记录在服务器日志）";

    static void json(HttpServletResponse resp, int status, Object body) throws IOException {
        resp.setStatus(status);
        resp.setContentType("application/json;charset=UTF-8");
        resp.setHeader("Cache-Control", "no-store");
        resp.getWriter().write(MiniJson.stringify(body));
    }

    static Map<String, Object> obj(Object... kv) {
        Map<String, Object> m = new LinkedHashMap<>();
        for (int i = 0; i + 1 < kv.length; i += 2) m.put(String.valueOf(kv[i]), kv[i + 1]);
        return m;
    }

    static void error(HttpServletResponse resp, int status, String code, String message) throws IOException {
        json(resp, status, obj("error", code, "message", message));
    }

    /** 503：不把 JDBC 原始错误返回前端，只写服务器日志。 */
    static void dbDown(jakarta.servlet.GenericServlet servlet, HttpServletResponse resp, Exception e) throws IOException {
        servlet.log("数据库不可用：" + e.getMessage(), e.getCause() != null ? e.getCause() : e);
        error(resp, 503, "db_unavailable", DB_DOWN_MESSAGE);
    }

    /** 读取请求体（超过 maxBytes 返回 null）。 */
    static String body(HttpServletRequest req, int maxBytes) throws IOException {
        if (req.getContentLength() > maxBytes) return null;
        ByteArrayOutputStream bo = new ByteArrayOutputStream();
        byte[] b = new byte[8192];
        int n, total = 0;
        try (InputStream in = req.getInputStream()) {
            while ((n = in.read(b)) > 0) {
                total += n;
                if (total > maxBytes) return null;
                bo.write(b, 0, n);
            }
        }
        return new String(bo.toByteArray(), StandardCharsets.UTF_8);
    }

    /**
     * 角色校验：未登录 401；访客或角色不符 403。通过返回当前用户，否则已写好响应并返回 null。
     */
    static AdminUser require(HttpServletRequest req, HttpServletResponse resp, java.util.Set<String> roles, String what) throws IOException {
        AdminUser u = Roles.currentUser(req);
        if (u == null) {
            if (Roles.isVisitor(req)) error(resp, 403, "forbidden", "访客只能浏览，不能使用" + what);
            else error(resp, 401, "login_required", "请先登录后再使用" + what);
            return null;
        }
        if (!roles.contains(u.getRoleCode())) {
            error(resp, 403, "forbidden", "当前角色 " + u.getRoleCode() + " 无权使用" + what);
            return null;
        }
        return u;
    }

    static String displayName(AdminUser u) {
        return u.getDisplayName() != null && !u.getDisplayName().trim().isEmpty() ? u.getDisplayName() : u.getUsername();
    }

    static Map<String, Object> userJson(AdminUser u, boolean visitor) {
        String g = Roles.group(u, visitor);
        return obj("id", u == null ? null : u.getId(), "username", u == null ? null : u.getUsername(),
                "display_name", u == null ? (visitor ? "访客" : null) : displayName(u),
                "role_code", u == null ? null : u.getRoleCode(), "group", g, "group_label", Roles.groupLabel(g));
    }
}
