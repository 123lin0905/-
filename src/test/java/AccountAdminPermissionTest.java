import Servlet.AuthFilter;
import Servlet.AuthServlet;
import org.example.demo1.AdminUser;
import org.junit.jupiter.api.Test;
import security.AccountRules;
import security.Roles;

import static org.junit.jupiter.api.Assertions.*;

/** 账号管理的权限规则、登录后的跳转（returnUrl 只允许站内相对路径且有权限）。 */
class AccountAdminPermissionTest {
    private static final int ME = 1, OTHER = 2;

    @Test
    void onlySystemLevelAdminsManageAccounts() {
        for (String r : new String[]{"SYSTEM_ADMIN", "SUPER_ADMIN", "ADMIN"}) assertTrue(Roles.canManageAccounts(r), r);
        for (String r : new String[]{"PLANT_ADMIN", "MAINTENANCE_ADMIN", "MAINTAINER", "GUEST"}) assertFalse(Roles.canManageAccounts(r), r);
        assertFalse(Roles.canManageAccounts(null));
        assertSame(Roles.ACCOUNT_ADMIN_ROLES, AuthFilter.roleGate("/account_admin.jsp"));
        assertSame(Roles.ACCOUNT_ADMIN_ROLES, AuthFilter.roleGate("/api/accounts"));
        assertSame(Roles.ACCOUNT_ADMIN_ROLES, AuthFilter.roleGate("/api/accounts/5/status"));
        assertNull(AuthFilter.roleGate("/api/auth/login"), "登录接口公开");
        assertNotNull(AccountRules.statusChangeProblem("PLANT_ADMIN", ME, OTHER, "MAINTAINER", false, 3));
        assertNotNull(AccountRules.roleChangeProblem("MAINTAINER", ME, OTHER, "MAINTAINER", "SYSTEM_ADMIN", 3));
        assertNotNull(AccountRules.passwordResetProblem("MAINTENANCE_ADMIN"));
        assertNull(AccountRules.passwordResetProblem("SYSTEM_ADMIN"));
    }

    @Test
    void cannotDisableOrDemoteSelf() {
        assertEquals("不能停用自己的账号", AccountRules.statusChangeProblem("SYSTEM_ADMIN", ME, ME, "SYSTEM_ADMIN", false, 5));
        assertNull(AccountRules.statusChangeProblem("SYSTEM_ADMIN", ME, ME, "SYSTEM_ADMIN", true, 5), "启用自己无害");
        assertEquals("不能修改自己的角色", AccountRules.roleChangeProblem("SYSTEM_ADMIN", ME, ME, "SYSTEM_ADMIN", "MAINTAINER", 5));
        assertEquals("不能修改自己的角色", AccountRules.roleChangeProblem("ADMIN", ME, ME, "ADMIN", "SYSTEM_ADMIN", 5));
    }

    @Test
    void keepAtLeastOneSystemAdmin() {
        assertNotNull(AccountRules.statusChangeProblem("SYSTEM_ADMIN", ME, OTHER, "SYSTEM_ADMIN", false, 0), "最后一个系统管理员不能停用");
        assertNull(AccountRules.statusChangeProblem("SYSTEM_ADMIN", ME, OTHER, "SYSTEM_ADMIN", false, 1));
        assertNotNull(AccountRules.roleChangeProblem("SUPER_ADMIN", ME, OTHER, "ADMIN", "PLANT_ADMIN", 0), "最后一个系统级管理员不能降级");
        assertNull(AccountRules.roleChangeProblem("SYSTEM_ADMIN", ME, OTHER, "SYSTEM_ADMIN", "PLANT_ADMIN", 1));
        assertNull(AccountRules.roleChangeProblem("SYSTEM_ADMIN", ME, OTHER, "PLANT_ADMIN", "SYSTEM_ADMIN", 0), "升级不受影响");
        assertNull(AccountRules.statusChangeProblem("SYSTEM_ADMIN", ME, OTHER, "MAINTAINER", false, 0), "停用养护员不受影响");
    }

    @Test
    void assignableRolesAndCreate() {
        assertNotNull(AccountRules.roleChangeProblem("SYSTEM_ADMIN", ME, OTHER, "MAINTAINER", "SUPER_ADMIN", 3), "历史角色不再分配");
        assertNotNull(AccountRules.roleChangeProblem("SYSTEM_ADMIN", ME, OTHER, "MAINTAINER", "GUEST", 3));
        assertNull(AccountRules.createProblem("SYSTEM_ADMIN", "keeper_wang", "王师傅", "MAINTAINER", "Green2026", true));
        assertNotNull(AccountRules.createProblem("SYSTEM_ADMIN", "keeper_wang", "王师傅", "MAINTAINER", "Green2026", false), "养护员必须关联档案");
        assertNull(AccountRules.createProblem("SYSTEM_ADMIN", "plant2", "绿植二号", "PLANT_ADMIN", "Green2026", false));
        assertNotNull(AccountRules.createProblem("SYSTEM_ADMIN", "a b", "x", "PLANT_ADMIN", "Green2026", false), "账号格式");
        assertNotNull(AccountRules.createProblem("SYSTEM_ADMIN", "plant3", " ", "PLANT_ADMIN", "Green2026", false), "姓名必填");
        assertNotNull(AccountRules.createProblem("SYSTEM_ADMIN", "plant3", "x", "PLANT_ADMIN", "123456", false), "弱密码");
        assertNotNull(AccountRules.createProblem("PLANT_ADMIN", "plant3", "x", "PLANT_ADMIN", "Green2026", false), "非系统管理员不能新建");
    }

    @Test
    void loginReturnUrlIsSameSiteAndPermitted() {
        AdminUser admin = new AdminUser(1, "admin", "a", "SYSTEM_ADMIN");
        AdminUser keeper = new AdminUser(2, "k", "k", "MAINTAINER");
        AdminUser plant = new AdminUser(3, "p", "p", "PLANT_ADMIN");
        assertEquals("/data_screen.jsp", AuthServlet.returnTarget(null, admin));
        assertEquals("/care_workbench.jsp", AuthServlet.returnTarget(null, keeper));
        assertEquals("/data_screen.jsp", AuthServlet.returnTarget(null, plant));
        assertEquals("/face_enroll.jsp", AuthServlet.returnTarget("/face_enroll.jsp", keeper));
        assertEquals("/face_enroll.jsp?account_id=7", AuthServlet.returnTarget("/face_enroll.jsp?account_id=7", admin));
        assertEquals("/account_admin.jsp", AuthServlet.returnTarget("/account_admin.jsp", admin));
        assertEquals("/data_screen.jsp", AuthServlet.returnTarget("/account_admin.jsp", plant), "无权限的 returnUrl 回默认主页");
        assertEquals("/care_workbench.jsp", AuthServlet.returnTarget("/data_screen.jsp", keeper));
        for (String bad : new String[]{"https://evil.example/", "//evil.example/x", "/\\evil", "javascript:alert(1)", "/../WEB-INF/web.xml",
                "/face_enroll.jsp\r\nSet-Cookie:x", "face_enroll.jsp", "/api/accounts", "/face_login.jsp", "/LogoutServlet"}) {
            assertEquals("/data_screen.jsp", AuthServlet.returnTarget(bad, admin), bad);
        }
        assertNull(AuthServlet.safeReturnUrl("//evil.example"));
        assertNull(AuthServlet.safeReturnUrl("http://evil"));
        assertEquals("/ecohome.jsp", AuthServlet.safeReturnUrl("/ecohome.jsp"));
    }
}
