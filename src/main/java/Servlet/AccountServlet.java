package Servlet;

import DB.Jdbc;
import DB.JdbcAccountStore;
import DB.JdbcCareStore;
import DB.MiniJson;
import jakarta.servlet.annotation.WebServlet;
import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.example.demo1.AdminUser;
import security.AccountRules;
import security.PasswordHasher;
import security.Roles;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 账号管理接口（account_admin.jsp），仅系统级管理员（{@link Roles#ACCOUNT_ADMIN_ROLES}）；未登录 401，访客 / 其他角色 403。
 * 写操作一律 Content-Type: application/json（挡住跨站表单提交）。
 * <pre>
 * GET  /api/accounts                    账号列表 + 可选角色 + 养护员档案 + 区域
 * POST /api/accounts                    新建 {username, display_name, password, role_code, maintainer_id? | new_maintainer:{name, phone}, area_ids?}
 * POST /api/accounts/{id}/status        启用 / 停用 {enabled:true|false}（不能停用自己、最后一个系统管理员）
 * POST /api/accounts/{id}/password      重置密码 {password}
 * POST /api/accounts/{id}/role          改角色 {role_code, maintainer_id? | new_maintainer:{name, phone}}（不能改自己、不能降级最后一个系统管理员）
 * POST /api/accounts/{id}/areas         养护人员负责区域 {area_ids:[…]}（写 plant_area.maintainer_id，养护工作台据此显示“我负责的区域”）
 * </pre>
 * 停用、改角色、重置密码后，该账号已登录的会话立即失效（{@link Roles#revokeSessions}）。
 */
@WebServlet(name = "AccountServlet", value = "/api/accounts/*")
public class AccountServlet extends HttpServlet {
    private static final Pattern ACTION = Pattern.compile("^/(\\d{1,9})/(status|password|role|areas)/?$");

    private final JdbcAccountStore accounts = new JdbcAccountStore();
    private final JdbcCareStore care = new JdbcCareStore();

    @Override
    protected void service(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        AdminUser me = ApiSupport.require(req, resp, Roles.ACCOUNT_ADMIN_ROLES, "账号管理");
        if (me == null) return;
        String path = req.getPathInfo() == null ? "/" : req.getPathInfo();
        String m = req.getMethod();
        try {
            if ("GET".equals(m) && ("/".equals(path) || path.isEmpty())) { list(resp, me); return; }
            if (!"POST".equals(m)) { ApiSupport.error(resp, 405, "method_not_allowed", "不支持的请求方法"); return; }
            String ct = req.getContentType();
            if (ct == null || !ct.toLowerCase().startsWith("application/json")) {
                ApiSupport.error(resp, 415, "unsupported_media_type", "请以 JSON 提交");
                return;
            }
            String body = ApiSupport.body(req, 64 * 1024);
            if (body == null) { ApiSupport.error(resp, 413, "too_large", "请求过大"); return; }
            Map<String, Object> in = body.trim().isEmpty() ? new java.util.HashMap<>() : MiniJson.parseObject(body);
            if ("/".equals(path) || path.isEmpty()) { create(req, resp, me, in); return; }
            Matcher am = ACTION.matcher(path);
            if (!am.matches()) { ApiSupport.error(resp, 404, "not_found", "没有这个接口：" + m + " /api/accounts" + path); return; }
            int id = Integer.parseInt(am.group(1));
            switch (am.group(2)) {
                case "status": status(resp, me, id, in); break;
                case "password": password(req, resp, me, id, in); break;
                case "role": role(resp, me, id, in); break;
                default: areas(resp, id, in); break;
            }
        } catch (Jdbc.DbUnavailableException e) {
            ApiSupport.dbDown(this, resp, e);
        } catch (JdbcAccountStore.RuleViolation e) {
            ApiSupport.error(resp, e.status, "rejected", e.getMessage());
        } catch (IllegalArgumentException | ClassCastException e) {
            ApiSupport.error(resp, 400, "bad_request", e.getMessage() == null ? "请求格式不正确" : e.getMessage());
        }
    }

    private void list(HttpServletResponse resp, AdminUser me) throws IOException, Jdbc.DbUnavailableException {
        List<Object> roles = new ArrayList<>();
        for (String r : AccountRules.ASSIGNABLE_ROLES) roles.add(ApiSupport.obj("code", r, "label", Roles.roleLabel(r), "admin", Roles.isAdmin(r)));
        ApiSupport.json(resp, 200, ApiSupport.obj(
                "me", ApiSupport.obj("id", me.getId(), "username", me.getUsername(), "role_code", me.getRoleCode()),
                "roles", roles,
                "password_min_length", PasswordHasher.MIN_LENGTH,
                "accounts", accounts.listAccounts(),
                "maintainers", accounts.maintainers(),
                "areas", care.areas()));
    }

    private static String str(Map<String, Object> in, String k) {
        Object v = in.get(k);
        return v instanceof String ? ((String) v).trim() : null;
    }

    private static Integer intOrNull(Map<String, Object> in, String k) {
        Object v = in.get(k);
        if (v instanceof Number) return ((Number) v).intValue();
        if (v instanceof String && ((String) v).trim().matches("\\d{1,9}")) return Integer.parseInt(((String) v).trim());
        return null;
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> newMaintainer(Map<String, Object> in) {
        Object v = in.get("new_maintainer");
        return v instanceof Map ? (Map<String, Object>) v : null;
    }

    private static List<Integer> areaIds(Map<String, Object> in) {
        Object v = in.get("area_ids");
        if (v == null) return null;
        if (!(v instanceof List)) throw new IllegalArgumentException("area_ids 需要是数组");
        List<Integer> out = new ArrayList<>();
        for (Object o : (List<?>) v) {
            if (!(o instanceof Number)) throw new IllegalArgumentException("area_ids 只能包含数字");
            out.add(((Number) o).intValue());
        }
        return out;
    }

    private void create(HttpServletRequest req, HttpServletResponse resp, AdminUser me, Map<String, Object> in)
            throws IOException, Jdbc.DbUnavailableException, JdbcAccountStore.RuleViolation {
        String username = str(in, "username"), display = str(in, "display_name"), role = str(in, "role_code");
        String password = in.get("password") instanceof String ? (String) in.get("password") : null;
        Integer mid = intOrNull(in, "maintainer_id");
        Map<String, Object> nm = newMaintainer(in);
        String nmName = nm == null ? null : str(nm, "name"), nmPhone = nm == null ? null : str(nm, "phone");
        boolean hasArchive = mid != null || (nmName != null && !nmName.isEmpty());
        String bad = AccountRules.createProblem(me.getRoleCode(), username, display, role, password, hasArchive);
        if (bad != null) { ApiSupport.error(resp, 400, "invalid", bad); return; }
        List<Integer> areas = Roles.isMaintainer(role) ? areaIds(in) : null;
        int id = accounts.createAccount(username, display, role, password, mid, nmName, nmPhone, areas);
        log("账号管理：" + me.getUsername() + " 新建账号 " + username + "（" + role + "）");
        ApiSupport.json(resp, 200, ApiSupport.obj("ok", true, "id", id, "message", "已新建账号 " + username));
    }

    private void status(HttpServletResponse resp, AdminUser me, int id, Map<String, Object> in)
            throws IOException, Jdbc.DbUnavailableException, JdbcAccountStore.RuleViolation {
        Object v = in.get("enabled");
        if (!(v instanceof Boolean)) { ApiSupport.error(resp, 400, "invalid", "缺少 enabled（true / false）"); return; }
        boolean enable = (Boolean) v;
        accounts.setStatus(me, id, enable);
        if (!enable) Roles.revokeSessions(id);
        log("账号管理：" + me.getUsername() + (enable ? " 启用" : " 停用") + "账号 #" + id);
        ApiSupport.json(resp, 200, ApiSupport.obj("ok", true, "message", enable ? "已启用" : "已停用，该账号已登录的会话同时失效"));
    }

    private void password(HttpServletRequest req, HttpServletResponse resp, AdminUser me, int id, Map<String, Object> in)
            throws IOException, Jdbc.DbUnavailableException, JdbcAccountStore.RuleViolation {
        String bad = AccountRules.passwordResetProblem(me.getRoleCode());
        String password = in.get("password") instanceof String ? (String) in.get("password") : null;
        if (bad == null) bad = PasswordHasher.policyProblem(password);
        if (bad != null) { ApiSupport.error(resp, 400, "invalid", bad); return; }
        accounts.resetPassword(id, password);
        Roles.revokeSessions(id);
        if (id == me.getId()) Roles.signIn(req, me, "password");   // 改自己的密码：其他会话下线，当前会话保留
        log("账号管理：" + me.getUsername() + " 重置账号 #" + id + " 的密码");
        ApiSupport.json(resp, 200, ApiSupport.obj("ok", true, "message", "密码已重置" + (id == me.getId() ? "" : "，该账号需用新密码重新登录")));
    }

    private void role(HttpServletResponse resp, AdminUser me, int id, Map<String, Object> in)
            throws IOException, Jdbc.DbUnavailableException, JdbcAccountStore.RuleViolation {
        String role = str(in, "role_code");
        Map<String, Object> nm = newMaintainer(in);
        accounts.changeRole(me, id, role, intOrNull(in, "maintainer_id"), nm == null ? null : str(nm, "name"), nm == null ? null : str(nm, "phone"));
        Roles.revokeSessions(id);
        log("账号管理：" + me.getUsername() + " 把账号 #" + id + " 的角色改为 " + role);
        ApiSupport.json(resp, 200, ApiSupport.obj("ok", true, "message", "已改为" + Roles.roleLabel(role) + "，该账号需重新登录"));
    }

    private void areas(HttpServletResponse resp, int id, Map<String, Object> in)
            throws IOException, Jdbc.DbUnavailableException, JdbcAccountStore.RuleViolation {
        List<Integer> ids = areaIds(in);
        if (ids == null) { ApiSupport.error(resp, 400, "invalid", "缺少 area_ids"); return; }
        accounts.setAreas(id, ids);
        ApiSupport.json(resp, 200, ApiSupport.obj("ok", true, "message", "负责区域已保存（" + ids.size() + " 个）"));
    }
}
