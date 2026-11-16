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
 * 管理员   ADMIN_ROLES      = SYSTEM_ADMIN、SUPER_ADMIN、ADMIN、PLANT_ADMIN、MAINTENANCE_ADMIN（数据大屏、人脸信息管理）
 *          ACCOUNT_ADMIN_ROLES = SYSTEM_ADMIN、SUPER_ADMIN、ADMIN（另可进入“账号管理”，规则见 {@link AccountRules}）
 * 养护人员 MAINTAINER       = MAINTAINER（admin_user.role_code，admin_user.maintainer_id 关联 maintainer 表档案）
 * 访客     未登录，或在人脸识别窗口点“先不录入人脸 / 以访客进入”（会话属性 visitor=true），只读
 * </pre>
 * 会话属性：adminUser（{@link AdminUser}）、visitor（Boolean）、loginMethod（password / face / visitor）、signedInAt（登录时间，毫秒）。
 * 账号被停用、改角色或重置密码后，{@link #revokeSessions} 让该账号在此之前建立的会话全部失效（下次请求视为未登录）。
 */
public final class Roles {
    private Roles() {
    }

    public static final String MAINTAINER = "MAINTAINER";
    public static final String SESSION_USER = "adminUser";
    public static final String SESSION_VISITOR = "visitor";
    public static final String SESSION_LOGIN_METHOD = "loginMethod";
    public static final String SESSION_SIGNED_IN_AT = "signedInAt";

    /** 账号 id → 会话失效时间：早于该时间登录的会话一律视为已退出（单机内存即可，重启后旧会话本来也不存在）。 */
    private static final java.util.Map<Integer, Long> REVOKED = new java.util.concurrent.ConcurrentHashMap<>();

    /** 管理员身份：可打开数据大屏、人脸信息管理（可管理范围见 canManageFaceOf）。 */
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

    /**
     * 可以管理“所有人”人脸（含其他管理员）的系统级管理员：SYSTEM_ADMIN、SUPER_ADMIN、ADMIN。
     * 其他管理员角色（PLANT_ADMIN、MAINTENANCE_ADMIN）在人脸信息管理里只能管理养护人员和自己。
     */
    public static final Set<String> FACE_SUPER_ROLES = Collections.unmodifiableSet(new HashSet<>(Arrays.asList(
            "SYSTEM_ADMIN", "SUPER_ADMIN", "ADMIN")));

    /** 系统级管理员：可进入“账号管理”（新建账号、启用 / 停用、重置密码、改角色、分配负责区域）。 */
    public static final Set<String> ACCOUNT_ADMIN_ROLES = Collections.unmodifiableSet(new HashSet<>(Arrays.asList(
            "SYSTEM_ADMIN", "SUPER_ADMIN", "ADMIN")));

    public static boolean canManageAccounts(String role) { return role != null && ACCOUNT_ADMIN_ROLES.contains(role); }

    public static boolean isAdmin(String role) { return role != null && ADMIN_ROLES.contains(role); }

    public static boolean isMaintainer(String role) { return MAINTAINER.equals(role); }

    public static boolean canCare(String role) { return role != null && CARE_ROLES.contains(role); }

    public static boolean canViewDashboard(String role) { return isAdmin(role); }

    public static boolean canEnrollFace(String role) { return role != null && FACE_ROLES.contains(role); }

    // ---------------- 人脸数据的长期保存规则 ----------------
    // 人脸一经录入就长期保存，只有管理员手动删除 / 更换才会变化：退出登录、重新录入、超过条数上限都不会自动删除或覆盖旧记录。
    // 养护人员可以给自己录入（追加），但不能删除；管理员可以删除 / 为他人录入，范围见 canManageFaceOf。

    /** 能否打开“人脸信息管理”（face_admin.jsp、/api/face/accounts 等）：全部管理员角色。 */
    public static boolean canManageFaces(String role) { return isAdmin(role); }

    /** 能否管理“所有人”的人脸（含其他管理员）：SYSTEM_ADMIN / SUPER_ADMIN / ADMIN。 */
    public static boolean canManageAllFaces(String role) { return role != null && FACE_SUPER_ROLES.contains(role); }

    /**
     * 管理员能否管理目标账号的人脸（查看全部记录、删除、为其录入 / 更换）。
     * 系统级管理员：任何账号（含其他管理员，以及角色已变更 / 账号已删除后遗留的人脸）；
     * 其他管理员：自己 + 养护人员账号；养护人员与访客：一律不行。
     *
     * @param targetRole 目标账号当前角色；账号已删除时为 null
     */
    public static boolean canManageFaceOf(String actorRole, int actorId, String targetRole, int targetId) {
        if (!canManageFaces(actorRole)) return false;
        if (actorId == targetId) return true;
        if (canManageAllFaces(actorRole)) return true;
        return isMaintainer(targetRole);
    }

    /** 能否为目标账号录入（追加）人脸：本人（管理员 / 养护人员）；或有管理权限的管理员。目标角色必须是需要人脸的角色。 */
    public static boolean canEnrollFaceFor(String actorRole, int actorId, String targetRole, int targetId) {
        if (!canEnrollFace(actorRole) || !canEnrollFace(targetRole)) return false;
        if (actorId == targetId) return true;
        return canManageFaceOf(actorRole, actorId, targetRole, targetId);
    }

    /** 能否删除目标账号的人脸：只有管理员（范围同 canManageFaceOf）；养护人员连自己的也不能删。 */
    public static boolean canDeleteFaceOf(String actorRole, int actorId, String targetRole, int targetId) {
        return canManageFaceOf(actorRole, actorId, targetRole, targetId);
    }

    /** 能否查看目标账号的人脸记录列表（不含特征向量）：本人，或有管理权限的管理员。 */
    public static boolean canViewFacesOf(String actorRole, int actorId, String targetRole, int targetId) {
        if (actorId == targetId && canEnrollFace(actorRole)) return true;
        return canManageFaceOf(actorRole, actorId, targetRole, targetId);
    }

    /** 人脸信息管理里的身份标签：管理员 / 养护人员 / 其他。 */
    public static String faceRoleLabel(String role) {
        if (isAdmin(role)) return "管理员";
        if (isMaintainer(role)) return "养护人员";
        return role == null ? "账号已删除" : "其他（" + role + "）";
    }

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
        if (!(v instanceof AdminUser)) return null;
        AdminUser u = (AdminUser) v;
        Long revokedAt = REVOKED.get(u.getId());
        if (revokedAt != null) {
            Object at = s.getAttribute(SESSION_SIGNED_IN_AT);
            long signedInAt = at instanceof Long ? (Long) at : 0L;
            if (signedInAt <= revokedAt) {
                // 账号已被管理员停用 / 改角色 / 重置密码：本会话作废（回到未登录）
                s.removeAttribute(SESSION_USER);
                s.removeAttribute(SESSION_SIGNED_IN_AT);
                s.removeAttribute(SESSION_LOGIN_METHOD);
                return null;
            }
        }
        return u;
    }

    /** 让该账号此前建立的所有会话失效（账号管理里停用、改角色、重置密码后调用）。 */
    public static void revokeSessions(int accountId) {
        REVOKED.put(accountId, System.currentTimeMillis());
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
        long now = System.currentTimeMillis();
        Long revokedAt = REVOKED.get(user.getId());
        // 与 revokeSessions 同一毫秒内重新登录时也要晚于失效时间
        s.setAttribute(SESSION_SIGNED_IN_AT, revokedAt != null && now <= revokedAt ? revokedAt + 1 : now);
    }

    /** 以访客身份进入：只读，不能改动任何东西。 */
    public static void enterAsVisitor(HttpServletRequest request) {
        HttpSession s = request.getSession(true);
        s.removeAttribute(SESSION_USER);
        s.setAttribute(SESSION_VISITOR, Boolean.TRUE);
        s.setAttribute(SESSION_LOGIN_METHOD, "visitor");
    }

    /** 各身份登录后的默认落地页（相对 context path）：管理员（含绿植 / 养护管理员）→ 数据大屏，养护人员 → 养护工作台，其他 → 生态主页。 */
    public static String homeFor(AdminUser user) {
        return homeForRole(user == null ? null : user.getRoleCode());
    }

    public static String homeForRole(String role) {
        if (isMaintainer(role)) return "/care_workbench.jsp";
        if (isAdmin(role)) return "/data_screen.jsp";
        return "/ecohome.jsp";
    }

    /** 角色中文名（账号管理、提示语用）。 */
    public static String roleLabel(String role) {
        if (role == null) return "未知";
        switch (role) {
            case "SYSTEM_ADMIN": return "系统管理员";
            case "SUPER_ADMIN": return "超级管理员";
            case "ADMIN": return "管理员";
            case "PLANT_ADMIN": return "绿植管理员";
            case "MAINTENANCE_ADMIN": return "养护管理员";
            case MAINTAINER: return "养护人员";
            default: return role;
        }
    }
}
