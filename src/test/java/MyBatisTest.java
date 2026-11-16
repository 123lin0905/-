import DB.MyBatisUtil;
import org.apache.ibatis.session.SqlSession;
import org.example.demo1.mapper.PlantMaintenanceMapper;
import org.example.demo1.mapper.PlantMapper;
import org.example.demo1.mapper.SchemaMapper;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertNotNull;

/**
 * MyBatis 配置检查（不连库）：旧版管理系统删除后只保留建表（SchemaMapper）与绿植养护台账（PlantMapper / PlantMaintenanceMapper）。
 * 账号、人脸、养护、大屏等接口走 JDBC（DB.Jdbc*Store），不经 MyBatis。
 */
public class MyBatisTest {

    @Test
    public void testSqlSessionFactoryInit() {
        assertNotNull(MyBatisUtil.getSqlSessionFactory(), "SqlSessionFactory 应当正确初始化");
    }

    @Test
    public void testRemainingMappersRegistered() {
        try (SqlSession session = MyBatisUtil.openSession()) {
            assertNotNull(session.getMapper(SchemaMapper.class), "SchemaMapper 注册成功");
            assertNotNull(session.getMapper(PlantMapper.class), "PlantMapper 注册成功");
            assertNotNull(session.getMapper(PlantMaintenanceMapper.class), "PlantMaintenanceMapper 注册成功");
        }
    }
}
