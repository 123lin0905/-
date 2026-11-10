import DB.DBTools;
import DB.MyBatisUtil;
import org.apache.ibatis.session.SqlSession;
import org.example.demo1.*;
import org.example.demo1.mapper.*;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

public class MyBatisTest {

    @Test
    public void testSqlSessionFactoryInit() {
        assertNotNull(MyBatisUtil.getSqlSessionFactory(), "SqlSessionFactory 应当正确初始化");
    }

    @Test
    public void testAllMappersRegistered() {
        try (SqlSession session = MyBatisUtil.openSession()) {
            assertNotNull(session.getMapper(PlantMapper.class), "PlantMapper 注册成功");
            assertNotNull(session.getMapper(PlantTypeMapper.class), "PlantTypeMapper 注册成功");
            assertNotNull(session.getMapper(PlantMaintenanceMapper.class), "PlantMaintenanceMapper 注册成功");
            assertNotNull(session.getMapper(MaintainerMapper.class), "MaintainerMapper 注册成功");
            assertNotNull(session.getMapper(PlantAreaMapper.class), "PlantAreaMapper 注册成功");
            assertNotNull(session.getMapper(AdminUserMapper.class), "AdminUserMapper 注册成功");
            assertNotNull(session.getMapper(SystemNoticeMapper.class), "SystemNoticeMapper 注册成功");
            assertNotNull(session.getMapper(AnimalMapper.class), "AnimalMapper 注册成功");
            assertNotNull(session.getMapper(SchemaMapper.class), "SchemaMapper 注册成功");
            System.out.println("全部 9 个 MyBatis Mapper 均已成功注册并加载！");
        }
    }

    @Test
    public void testDBToolsInstantiationAndQueries() {
        DBTools dbTools = new DBTools();
        assertNotNull(dbTools, "DBTools 门面类应当能够成功实例化并托管至 MyBatis");

        // 验证查询各业务数据
        List<Plant> plants = dbTools.queryAllPlants();
        assertNotNull(plants, "植物列表不应为 null");
        System.out.println("成功通过 MyBatis 查询到植物总数: " + plants.size());
        for (Plant p : plants) {
            System.out.println("DB PLANT: id=" + p.getPid() + ", name=" + p.getPname() + ", lat=" + p.getLatitude() + ", lng=" + p.getLongitude() + ", area=" + p.getAreaId());
        }

        List<PlantType> types = dbTools.queryAllPlantTypes();
        assertNotNull(types, "类别列表不应为 null");
        assertTrue(types.size() >= 7, "预设植物类别数量应至少为7条");
        System.out.println("成功通过 MyBatis 查询到植物类别总数: " + types.size());

        List<Maintainer> maintainers = dbTools.queryAllMaintainers(null, null, null);
        assertNotNull(maintainers, "维护人员列表不应为 null");
        System.out.println("成功通过 MyBatis 查询到维护人员总数: " + maintainers.size());

        List<PlantArea> areas = dbTools.queryAllAreas();
        assertNotNull(areas, "管理区域列表不应为 null");
        System.out.println("成功通过 MyBatis 查询到区域总数: " + areas.size());

        List<SystemNotice> notices = dbTools.queryRecentNotices(5);
        assertNotNull(notices, "公告列表不应为 null");
        System.out.println("成功通过 MyBatis 查询到系统公告总数: " + notices.size());

        List<AdminUser> users = dbTools.queryAllAdminUsers();
        assertNotNull(users, "用户列表不应为 null");
        System.out.println("成功通过 MyBatis 查询到后台用户总数: " + users.size());

        List<Animal> animals = dbTools.queryAllAnimals(null, null);
        assertNotNull(animals, "生态动物列表不应为 null");
        assertTrue(animals.size() >= 1, "初始生态动物应当包含种子数据");
        System.out.println("成功通过 MyBatis 查询到校园生态动物总品类数: " + animals.size() + ", 个体总数: " + dbTools.getTotalAnimalCount());

        AdminUser admin = dbTools.authenticateAdmin("admin", security.SecurityUtils.sha256("123456"));
        assertNotNull(admin, "管理员登录校验通过 MyBatis 应能正常验证");
        assertEquals("admin", admin.getUsername());
        System.out.println("成功通过 MyBatis 完成管理员登录校验: " + admin.getDisplayName());
    }
}
