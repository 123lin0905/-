import Servlet.AuthFilter;
import org.junit.jupiter.api.Test;
import security.Roles;

import static org.junit.jupiter.api.Assertions.*;

/**
 * 人脸数据长期保存与“人脸信息管理”的权限规则（security/Roles.java）：
 * 只有管理员能删除 / 更换；养护人员只能给自己录入、不能删除；系统级管理员管理所有人，其他管理员只管养护人员和自己。
 */
class FacePermissionTest {
    private static final String[] SUPER = {"SYSTEM_ADMIN", "SUPER_ADMIN", "ADMIN"};
    private static final String[] OTHER_ADMIN = {"PLANT_ADMIN", "MAINTENANCE_ADMIN"};
    private static final String K = "MAINTAINER";

    @Test
    void maintainerCanEnrollSelfButNeverDelete() {
        assertTrue(Roles.canEnrollFaceFor(K, 7, K, 7), "养护员可以给自己录入");
        assertTrue(Roles.canViewFacesOf(K, 7, K, 7), "养护员可以看自己的记录");
        assertFalse(Roles.canDeleteFaceOf(K, 7, K, 7), "养护员不能删自己的人脸");
        assertFalse(Roles.canEnrollFaceFor(K, 7, K, 8), "养护员不能给别的养护员录入");
        assertFalse(Roles.canViewFacesOf(K, 7, "SYSTEM_ADMIN", 1));
        assertFalse(Roles.canDeleteFaceOf(K, 7, K, 8));
        assertFalse(Roles.canManageFaces(K), "养护员不能进人脸信息管理");
    }

    @Test
    void superAdminsManageEveryone() {
        for (String r : SUPER) {
            assertTrue(Roles.canManageFaces(r), r);
            assertTrue(Roles.canManageAllFaces(r), r);
            assertTrue(Roles.canDeleteFaceOf(r, 1, K, 7), r + " 删养护员");
            assertTrue(Roles.canDeleteFaceOf(r, 1, "PLANT_ADMIN", 2), r + " 删其他管理员");
            assertTrue(Roles.canDeleteFaceOf(r, 1, "SUPER_ADMIN", 3), r + " 删其他系统管理员");
            assertTrue(Roles.canDeleteFaceOf(r, 1, r, 1), r + " 删自己");
            assertTrue(Roles.canEnrollFaceFor(r, 1, "MAINTENANCE_ADMIN", 2), r + " 给其他管理员录入");
            assertTrue(Roles.canDeleteFaceOf(r, 1, null, 99), r + " 可清理账号已删除后遗留的人脸");
            assertFalse(Roles.canEnrollFaceFor(r, 1, null, 99), "账号已删除不能再录入");
            assertFalse(Roles.canEnrollFaceFor(r, 1, "GUEST", 5), "不需要人脸的角色不能录入");
        }
    }

    @Test
    void otherAdminsOnlyMaintainersAndSelf() {
        for (String r : OTHER_ADMIN) {
            assertTrue(Roles.canManageFaces(r), r);
            assertFalse(Roles.canManageAllFaces(r), r);
            assertTrue(Roles.canDeleteFaceOf(r, 2, K, 7), r + " 删养护员");
            assertTrue(Roles.canEnrollFaceFor(r, 2, K, 7), r + " 给养护员录入");
            assertTrue(Roles.canDeleteFaceOf(r, 2, r, 2), r + " 删自己");
            assertFalse(Roles.canDeleteFaceOf(r, 2, "SYSTEM_ADMIN", 1), r + " 不能删系统管理员");
            assertFalse(Roles.canEnrollFaceFor(r, 2, "ADMIN", 3), r + " 不能给其他管理员录入");
            assertFalse(Roles.canViewFacesOf(r, 2, "PLANT_ADMIN", 4), r + " 不能看其他管理员");
            assertFalse(Roles.canDeleteFaceOf(r, 2, null, 99), r + " 不能清理已删除账号的人脸");
        }
    }

    @Test
    void visitorsAndUnknownRolesCannotDoAnything() {
        assertFalse(Roles.canManageFaces(null));
        assertFalse(Roles.canDeleteFaceOf(null, 0, K, 7));
        assertFalse(Roles.canEnrollFaceFor(null, 0, K, 0));
        assertFalse(Roles.canDeleteFaceOf("GUEST", 5, "GUEST", 5));
    }

    @Test
    void labels() {
        assertEquals("管理员", Roles.faceRoleLabel("PLANT_ADMIN"));
        assertEquals("养护人员", Roles.faceRoleLabel(K));
        assertEquals("账号已删除", Roles.faceRoleLabel(null));
    }

    @Test
    void authFilterGatesFaceAdmin() {
        assertSame(Roles.ADMIN_ROLES, AuthFilter.roleGate("/face_admin.jsp"));
        assertSame(Roles.ADMIN_ROLES, AuthFilter.roleGate("/api/face/accounts"));
        assertSame(Roles.ADMIN_ROLES, AuthFilter.roleGate("/api/face/accounts/3/profiles"));
        assertFalse(AuthFilter.roleGate("/face_admin.jsp").contains(K));
        assertSame(Roles.FACE_ROLES, AuthFilter.roleGate("/face_enroll.jsp"));
        assertNull(AuthFilter.roleGate("/api/face/identify"), "识别接口保持公开");
        assertNull(AuthFilter.roleGate("/api/face/profiles"), "本人记录接口由 FaceServlet 自行校验");
    }
}
