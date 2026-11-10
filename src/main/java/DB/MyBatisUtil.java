package DB;

import org.apache.ibatis.io.Resources;
import org.apache.ibatis.session.SqlSession;
import org.apache.ibatis.session.SqlSessionFactory;
import org.apache.ibatis.session.SqlSessionFactoryBuilder;

import java.io.IOException;
import java.io.InputStream;
import java.util.function.Consumer;
import java.util.function.Function;

/**
 * MyBatis 工具类，负责全局 SqlSessionFactory 单例生命周期维护与 SqlSession 会话管理。
 */
public class MyBatisUtil {

    private static final SqlSessionFactory SQL_SESSION_FACTORY;

    static {
        try {
            String resource = "mybatis-config.xml";
            InputStream inputStream = Resources.getResourceAsStream(resource);
            SQL_SESSION_FACTORY = new SqlSessionFactoryBuilder().build(inputStream);
        } catch (IOException e) {
            System.err.println("初始化 MyBatis SqlSessionFactory 失败: " + e.getMessage());
            e.printStackTrace();
            throw new RuntimeException("MyBatis 配置文件加载失败，请检查 mybatis-config.xml 及数据库连接配置", e);
        }
    }

    /**
     * 获取全局唯一 SqlSessionFactory
     */
    public static SqlSessionFactory getSqlSessionFactory() {
        return SQL_SESSION_FACTORY;
    }

    /**
     * 打开一个默认自动提交事务的 SqlSession
     */
    public static SqlSession openSession() {
        return SQL_SESSION_FACTORY.openSession(true);
    }

    /**
     * 打开一个指定是否自动提交事务的 SqlSession
     */
    public static SqlSession openSession(boolean autoCommit) {
        return SQL_SESSION_FACTORY.openSession(autoCommit);
    }

    /**
     * 便捷执行函数：自动开辟会话、获取 Mapper、执行逻辑并安全关闭会话返回结果
     */
    public static <M, R> R apply(Class<M> mapperClass, Function<M, R> function) {
        try (SqlSession session = openSession(true)) {
            M mapper = session.getMapper(mapperClass);
            return function.apply(mapper);
        } catch (Exception e) {
            System.err.println("执行 MyBatis 操作异常 [" + mapperClass.getSimpleName() + "]: " + e.getMessage());
            e.printStackTrace();
            throw e;
        }
    }

    /**
     * 便捷执行消费者函数：自动开辟会话、获取 Mapper、执行无返回值操作并安全关闭会话
     */
    public static <M> void accept(Class<M> mapperClass, Consumer<M> consumer) {
        try (SqlSession session = openSession(true)) {
            M mapper = session.getMapper(mapperClass);
            consumer.accept(mapper);
        } catch (Exception e) {
            System.err.println("执行 MyBatis 操作异常 [" + mapperClass.getSimpleName() + "]: " + e.getMessage());
            e.printStackTrace();
            throw e;
        }
    }
}
