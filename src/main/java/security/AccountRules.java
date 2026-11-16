package security;

import java.util.Arrays;
import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * “账号管理”（account_admin.jsp、/api/accounts/*）的权限规则，纯函数，便于单元测试。
 * <ul>
 *   <li>只有系统级管理员（{@link Roles#ACCOUNT_ADMIN_ROLES}：SYSTEM_ADMIN / SUPER_ADMIN / ADMIN）能进入；</li>
 *   <li>新建 / 改角色只能选 {@link #ASSIGNABLE_ROLES}（系统管理员、绿植管理员、养护管理员、养护人员）；</li>
 *   <li>不能停用自己，也不能修改自己的角色（防止把自己锁在外面）；</li>
 *   <li>系统里至少保留一个启用中的系统级管理员：最后一个不能被停用或降级。</li>
 * </ul>
 */
public final class AccountRules {
    private AccountRules() {
    }

    /** 账号管理里可以分配的角色（按显示顺序）。SUPER_ADMIN / ADMIN 为历史角色，只保留、不再新分配。 */
    public static final Set<String> ASSIGNABLE_ROLES = Collections.unmodifiableSet(new LinkedHashSet<>(Arrays.asList(
            "SYSTEM_ADMIN", "PLANT_ADMIN", "MAINTENANCE_ADMIN", Roles.MAINTAINER)));

    private static final Pattern USERNAME = Pattern.compile("^[A-Za-z0-9_.-]{3,50}$");

    public static String usernameProblem(String username) {
        if (username == null || username.isEmpty()) return "请填写账号";
        if (!USERNAME.matcher(username).matches()) return "账号只能用 3–50 位字母、数字、下划线、点或短横线";
        return null;
    }

    public static String displayNameProblem(String name) {
        if (name == null || name.trim().isEmpty()) return "请填写姓名";
        if (name.trim().length() > 50) return "姓名最多 50 个字";
        return null;
    }

    public static String roleProblem(String role) {
        if (role == null || !ASSIGNABLE_ROLES.contains(role)) return "角色只能选择：系统管理员、绿植管理员、养护管理员、养护人员";
        return null;
    }

    /**
     * 停用 / 启用账号。
     *
     * @param otherActiveAccountAdmins 除目标账号外，启用中的系统级管理员数量
     * @return 不允许时返回提示语，允许返回 null
     */
    public static String statusChangeProblem(String actorRole, int actorId, int targetId, String targetRole,
                                             boolean enable, int otherActiveAccountAdmins) {
        if (!Roles.canManageAccounts(actorRole)) return "只有系统管理员可以管理账号";
        if (enable) return null;
        if (actorId == targetId) return "不能停用自己的账号";
        if (Roles.canManageAccounts(targetRole) && otherActiveAccountAdmins < 1) return "这是最后一个启用中的系统管理员，不能停用";
        return null;
    }

    /**
     * 修改角色。
     *
     * @param otherActiveAccountAdmins 除目标账号外，启用中的系统级管理员数量
     */
    public static String roleChangeProblem(String actorRole, int actorId, int targetId, String targetRole,
                                           String newRole, int otherActiveAccountAdmins) {
        if (!Roles.canManageAccounts(actorRole)) return "只有系统管理员可以管理账号";
        String bad = roleProblem(newRole);
        if (bad != null) return bad;
        if (actorId == targetId) return "不能修改自己的角色";
        if (Roles.canManageAccounts(targetRole) && !Roles.canManageAccounts(newRole) && otherActiveAccountAdmins < 1) {
            return "这是最后一个启用中的系统管理员，不能降级";
        }
        return null;
    }

    /** 重置密码：系统级管理员可以重置任何账号（含自己）。 */
    public static String passwordResetProblem(String actorRole) {
        return Roles.canManageAccounts(actorRole) ? null : "只有系统管理员可以重置密码";
    }

    /** 新建账号：角色必须可分配；养护人员必须关联养护员档案（已有档案或新建）。 */
    public static String createProblem(String actorRole, String username, String displayName, String role,
                                       String password, boolean hasMaintainerArchive) {
        if (!Roles.canManageAccounts(actorRole)) return "只有系统管理员可以新建账号";
        String bad = usernameProblem(username);
        if (bad == null) bad = displayNameProblem(displayName);
        if (bad == null) bad = roleProblem(role);
        if (bad == null) bad = PasswordHasher.policyProblem(password);
        if (bad == null && Roles.isMaintainer(role) && !hasMaintainerArchive) bad = "养护人员账号必须关联养护员档案（选择已有档案，或填写姓名新建档案）";
        return bad;
    }
}
