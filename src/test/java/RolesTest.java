import Servlet.ZoneSpeciesService;
import org.example.demo1.AdminUser;
import org.junit.jupiter.api.Test;
import security.Roles;

import static org.junit.jupiter.api.Assertions.*;

/** 三类身份与现有角色常量的映射；不改变 zone_species 原有的编辑权限。 */
class RolesTest {
    @Test
    void groups() {
        for (String r : new String[]{"SYSTEM_ADMIN", "SUPER_ADMIN", "ADMIN", "PLANT_ADMIN", "MAINTENANCE_ADMIN"}) {
            assertEquals("admin", Roles.group(new AdminUser(1, "u", "n", r), false), r);
            assertTrue(Roles.canViewDashboard(r));
            assertFalse(Roles.canCare(r), "默认管理员不能进养护工作台：" + r);
            assertTrue(Roles.canEnrollFace(r));
        }
        assertEquals("maintainer", Roles.group(new AdminUser(2, "k", "n", "MAINTAINER"), false));
        assertTrue(Roles.canCare("MAINTAINER"));
        assertFalse(Roles.canViewDashboard("MAINTAINER"));
        assertTrue(Roles.canEnrollFace("MAINTAINER"));
        assertEquals("visitor", Roles.group(null, true));
        assertEquals("anonymous", Roles.group(null, false));
        assertFalse(Roles.canCare(null));
        assertFalse(Roles.canEnrollFace(null));
        assertFalse(Roles.canViewDashboard("GUEST"));
    }

    @Test
    void zoneSpeciesEditorsUnchanged() {
        for (String r : new String[]{"SYSTEM_ADMIN", "SUPER_ADMIN", "ADMIN", "PLANT_ADMIN", "MAINTENANCE_ADMIN", "MAINTAINER"}) assertTrue(ZoneSpeciesService.canEdit(r), r);
        assertFalse(ZoneSpeciesService.canEdit(null));
        assertFalse(ZoneSpeciesService.canEdit("GUEST"));
    }

    @Test
    void homePages() {
        assertEquals("/care_workbench.jsp", Roles.homeFor(new AdminUser(1, "k", "n", "MAINTAINER")));
        // 旧版管理系统已删除：所有管理员角色登录后都进数据大屏
        for (String r : new String[]{"SYSTEM_ADMIN", "SUPER_ADMIN", "ADMIN", "PLANT_ADMIN", "MAINTENANCE_ADMIN"}) {
            assertEquals("/data_screen.jsp", Roles.homeFor(new AdminUser(1, "a", "n", r)), r);
        }
        assertEquals("/ecohome.jsp", Roles.homeFor(new AdminUser(1, "x", "n", "GUEST")));
        assertEquals("/ecohome.jsp", Roles.homeFor(null));
    }
}
