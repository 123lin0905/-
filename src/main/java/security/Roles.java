package security;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpSession;
import org.example.demo1.AdminUser;

import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.Set;

/**
 * 三类身份（管理员 / 养护人员 / 普通用户·访客）与现有角色常量的映射，集中在这里，页面和接口都从这里判断。
 * <pre>
 * 管理员   ADMIN_ROLES      = SYSTEM_ADMIN、SUPER_ADMIN、ADMIN、PLANT_ADMIN、MAINTENANCE_ADMIN（现有后台角色，细分权限仍由 AuthFilter 原规则控制）
 * 养护人员 MAINTAINER       = MAINTAINER（admin_user.role_code，admin_user.maintainer_id 关联 maintainer 表档案）
 * 访客     未登录，或在人脸识别窗口点“先不录入人脸 / 以访客进入”（会话属性 visitor=true），只读
 * </pre>
 * 会话属性：adminUser（{@link AdminUser}，沿用原登录）、visitor（Boolean）、loginMethod（password / face）。
 */
public final class Roles {
    private Roles() {
    }

    public static final String MAINTAINER = "MAINTAINER";
    public static final String SESSION_USER = "adminUser";
    public static final String SESSION_VISITOR = "visitor";
    public static final String SESSION_LOGIN_METHOD = "loginMethod";

    /** 管理员身份：可打开数据大屏、可给养护员录入 / 删除人脸。 */
    public static final Set<String> ADMIN_ROLES = Collections.unmodifiableSet(new HashSet<>(Arrays.asList(
            "SYSTEM_ADMIN", "SUPER_ADMIN", "ADMIN", "PLANT_ADMIN", "MAINTENANCE_ADMIN")));

    /**
     * 可以进入“养护工作台”并执行浇水 / 施肥 / 喂食的角色。
     * 按需求字面，默认只有养护人员；如需让管理员也能进入，把 "SYSTEM_ADMIN" 等加进来即可（README 有说明）。
     */
    public static final Set<String> CARE_ROLES = Collections.unmodifiableSet(new HashSet<>(Collections.singletonList(MAINTAINER)));

    /** 可以录入人脸的角色：管理员 + 养护人员（普通用户 / 访客不录入）。 */
    public static final Set<String> FACE_ROLES;

    static {
        Set<String> s = new HashSet<>(ADMIN_ROLES);
        s.add(MAINTAINER);
        FACE_ROLES = Collections.unmodifiableSet(s);
    }

    public static boolean isAdmin(String role) { return role != null && ADMIN_ROLES.contains(role); }

    public static boolean isMaintainer(String role) { return MAINTAINER.equals(role); }

    public static boolean canCare(String role) { return role != null && CARE_ROLES.contains(role); }

    public static boolean canViewDashboard(String role) { return isAdmin(role); }

    public static boolean canEnrollFace(String role) { return role != null && FACE_ROLES.contains(role); }

    /** admin / maintainer / visitor / anonymous */
    public static String group(AdminUser user, boolean visitor) {
        if (user != null) {
            if (isAdmin(user.getRoleCode())) return "admin";
            if (isMaintainer(user.getRoleCode())) return "maintainer";
            return "other";
        }
        return visitor ? "visitor" : "anonymous";
    }

    public static String groupLabel(String group) {
        switch (group) {
            case "admin": return "管理员";
            case "maintainer": return "养护人员";
            case "visitor": return "访客（只读）";
            case "other": return "已登录";
            default: return "未登录";
        }
    }

    public static AdminUser currentUser(HttpServletRequest request) {
        HttpSession s = request.getSession(false);
        Object v = s == null ? null : s.getAttribute(SESSION_USER);
        return v instanceof AdminUser ? (AdminUser) v : null;
    }

    public static boolean isVisitor(HttpServletRequest request) {
        HttpSession s = request.getSession(false);
        return s != null && Boolean.TRUE.equals(s.getAttribute(SESSION_VISITOR)) && s.getAttribute(SESSION_USER) == null;
    }

    /** 登录成功（密码 / 人脸）：换会话 id 防会话固定，写入账号，清掉访客标记。 */
    public static void signIn(HttpServletRequest request, AdminUser user, String method) {
        HttpSession s = request.getSession(false);
        if (s != null) {
            try { request.changeSessionId(); } catch (IllegalStateException ignored) { /* 会话已失效时下面重新创建 */ }
        }
        s = request.getSession(true);
        s.removeAttribute(SESSION_VISITOR);
        s.setAttribute(SESSION_USER, user);
        s.setAttribute(SESSION_LOGIN_METHOD, method);
    }

    /** 以访客身份进入：只读，不能改动任何东西。 */
    public static void enterAsVisitor(HttpServletRequest request) {
        HttpSession s = request.getSession(true);
        s.removeAttribute(SESSION_USER);
        s.setAttribute(SESSION_VISITOR, Boolean.TRUE);
        s.setAttribute(SESSION_LOGIN_METHOD, "visitor");
    }

    /** 各身份登录后的默认落地页（相对 context path）。 */
    public static String homeFor(AdminUser user) {
        if (user == null) return "/ecohome.jsp";
        String r = user.getRoleCode();
        if (isMaintainer(r)) return "/care_workbench.jsp";
        if ("SYSTEM_ADMIN".equals(r) || "SUPER_ADMIN".equals(r) || "ADMIN".equals(r)) return "/AdminDashboardServlet";
        return "/index.jsp";
    }
}
