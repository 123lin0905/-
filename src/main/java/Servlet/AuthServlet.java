package Servlet;

import DB.Jdbc;
import DB.JdbcAccountStore;
import DB.MiniJson;
import jakarta.servlet.annotation.WebServlet;
import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.example.demo1.AdminUser;
import security.Roles;

import java.io.IOException;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Pattern;

/**
 * 账号密码登录（人脸识别窗口 face_login.jsp 里的“账号密码登录”）：
 * <pre>
 * POST /api/auth/login   公开，Content-Type: application/json
 *   请求 {username, password, returnUrl?}
 *   200  {ok:true, user:{…}, redirect}     管理员 → 数据大屏，养护人员 → 养护工作台；returnUrl 合法且有权限时优先跳 returnUrl
 *   400  缺少账号 / 密码；401 账号或密码错误 / 已停用（统一提示，不区分原因）；415 非 JSON；429 尝试过于频繁；503 数据库不可用
 * </pre>
 * 只认账号自己保存的密码（没有通用 / 演示后门密码）；旧的无盐 SHA-256 在登录成功后透明升级为 PBKDF2 加盐哈希。
 * 登录成功走 {@link Roles#signIn}：换会话 id 防会话固定、清掉访客标记。
 * 限流：同一 IP 5 分钟内最多 {@code auth.maxAttempts}（默认 20）次，同一账号 5 分钟内最多 {@code auth.maxFailuresPerUser}（默认 8）次失败。
 */
@WebServlet(name = "AuthServlet", value = "/api/auth/*")
public class AuthServlet extends HttpServlet {
    private static final long WINDOW_MS = 5 * 60_000L;
    /** returnUrl 只允许站内相对路径：/xxx.jsp 或 /xxx.jsp?a=b（不含协议、//、反斜杠、..、换行）。 */
    private static final Pattern SAFE_RETURN = Pattern.compile("^/[A-Za-z0-9_\\-./]*(\\?[A-Za-z0-9_\\-.=&%]*)?$");

    private final JdbcAccountStore accounts = new JdbcAccountStore();
    private final Map<String, Deque<Long>> ipAttempts = new ConcurrentHashMap<>();
    private final Map<String, Deque<Long>> userFailures = new ConcurrentHashMap<>();

    @Override
    protected void service(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        String path = req.getPathInfo() == null ? "/" : req.getPathInfo();
        try {
            if ("POST".equals(req.getMethod()) && "/login".equals(path)) { login(req, resp); return; }
            ApiSupport.error(resp, 404, "not_found", "没有这个接口：" + req.getMethod() + " /api/auth" + path);
        } catch (Jdbc.DbUnavailableException e) {
            ApiSupport.dbDown(this, resp, e);
        } catch (IllegalArgumentException e) {
            ApiSupport.error(resp, 400, "bad_request", e.getMessage());
        }
    }

    private static int prop(String key, int def) {
        try { return Integer.parseInt(System.getProperty(key, String.valueOf(def)).trim()); } catch (NumberFormatException e) { return def; }
    }

    /** 记录一次并判断是否超过上限（超过时不记录）。 */
    private static boolean overLimit(Map<String, Deque<Long>> map, String key, int max, boolean record) {
        long now = System.currentTimeMillis();
        Deque<Long> q = map.computeIfAbsent(key, k -> new ArrayDeque<>());
        synchronized (q) {
            while (!q.isEmpty() && now - q.peekFirst() > WINDOW_MS) q.pollFirst();
            if (q.size() >= max) return true;
            if (record) q.addLast(now);
        }
        if (map.size() > 10_000) map.clear();   // 简单防内存膨胀
        return false;
    }

    private void login(HttpServletRequest req, HttpServletResponse resp) throws IOException, Jdbc.DbUnavailableException {
        String ct = req.getContentType();
        if (ct == null || !ct.toLowerCase().startsWith("application/json")) {
            ApiSupport.error(resp, 415, "unsupported_media_type", "请以 JSON 提交账号密码");
            return;
        }
        if (overLimit(ipAttempts, req.getRemoteAddr(), prop("auth.maxAttempts", 20), true)) {
            ApiSupport.error(resp, 429, "too_many_attempts", "登录尝试过于频繁，请 5 分钟后再试");
            return;
        }
        String body = ApiSupport.body(req, 16 * 1024);
        if (body == null) { ApiSupport.error(resp, 413, "too_large", "请求过大"); return; }
        Map<String, Object> in = MiniJson.parseObject(body);
        String username = in.get("username") instanceof String ? ((String) in.get("username")).trim() : "";
        String password = in.get("password") instanceof String ? (String) in.get("password") : "";
        if (username.isEmpty() || password.isEmpty()) { ApiSupport.error(resp, 400, "bad_request", "请输入账号和密码"); return; }
        if (username.length() > 50 || password.length() > 200) { ApiSupport.error(resp, 401, "invalid_credentials", "账号或密码错误，或账号已停用"); return; }
        String userKey = username.toLowerCase();
        int maxFailures = prop("auth.maxFailuresPerUser", 8);
        if (overLimit(userFailures, userKey, maxFailures, false)) {
            ApiSupport.error(resp, 429, "too_many_attempts", "该账号密码错误次数过多，请 5 分钟后再试，或使用人脸登录");
            return;
        }
        JdbcAccountStore.LoginResult r = accounts.authenticate(username, password);
        AdminUser user = r.user;
        if (user == null) {
            overLimit(userFailures, userKey, maxFailures, true);
            log("账号密码登录失败：" + username.replaceAll("[\\r\\n]", "_") + " ip=" + req.getRemoteAddr());
            ApiSupport.error(resp, 401, "invalid_credentials", "账号或密码错误，或账号已停用");
            return;
        }
        userFailures.remove(userKey);
        Roles.signIn(req, user, "password");
        log("账号密码登录成功：" + user.getUsername() + "（" + user.getRoleCode() + "）" + (r.upgraded ? "，密码哈希已升级为 PBKDF2" : ""));
        String target = returnTarget(in.get("returnUrl") instanceof String ? (String) in.get("returnUrl") : null, user);
        ApiSupport.json(resp, 200, ApiSupport.obj("ok", true, "user", ApiSupport.userJson(user, false),
                "redirect", req.getContextPath() + target));
    }

    /**
     * 登录后的落地页：returnUrl 是站内相对路径、不是登录页 / 接口、且该身份有权打开时用它；否则按身份默认主页。
     * 只接受 context path 之后的路径（如 /face_enroll.jsp），不接受完整 URL。
     */
    public static String returnTarget(String returnUrl, AdminUser user) {
        String home = Roles.homeFor(user);
        String candidate = safeReturnUrl(returnUrl);
        if (candidate == null) return home;
        String p = candidate.contains("?") ? candidate.substring(0, candidate.indexOf('?')) : candidate;
        if ("/".equals(p) || "/face_login.jsp".equals(p) || p.startsWith("/api/") || "/LogoutServlet".equals(p)) return home;
        Set<String> gate = AuthFilter.roleGate(p);
        if (gate != null && (user == null || !gate.contains(user.getRoleCode()))) return home;
        return candidate;
    }

    /** 只允许同站相对路径；不合法返回 null。 */
    public static String safeReturnUrl(String value) {
        if (value == null) return null;
        String v = value.trim();
        if (v.isEmpty() || v.length() > 300) return null;
        if (!SAFE_RETURN.matcher(v).matches()) return null;
        if (v.startsWith("//") || v.contains("..") || v.contains("/./")) return null;
        return v;
    }
}
