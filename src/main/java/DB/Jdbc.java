package DB;

import java.io.InputStream;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.Properties;

/**
 * 人脸登录 / 养护工作台 / 数据大屏共用的 JDBC 连接（与 JdbcZoneSpeciesStore 相同：读 db.properties，库 plant）。
 * 首次连接时执行 {@link #DDL}（CREATE TABLE IF NOT EXISTS，与 database/003_face_login_care.sql 一致）。
 * 连不上库时抛 {@link DbUnavailableException}；接口层据此返回 503，且不把 JDBC 原始错误文本返回给前端。
 */
public final class Jdbc {
    private Jdbc() {
    }

    /** 数据库不可用（连不上 / SQL 执行失败）。message 只给日志用，不要原样返回前端。 */
    public static class DbUnavailableException extends Exception {
        public DbUnavailableException(String message, Throwable cause) { super(message, cause); }
    }

    static final String[] DDL = {
            "CREATE TABLE IF NOT EXISTS face_profile (\n" +
                    "  id BIGINT NOT NULL AUTO_INCREMENT,\n" +
                    "  account_id INT NOT NULL COMMENT 'admin_user.id',\n" +
                    "  role_code VARCHAR(40) NOT NULL COMMENT '录入时账号角色',\n" +
                    "  model VARCHAR(40) NOT NULL DEFAULT 'human-faceres' COMMENT '特征模型',\n" +
                    "  dim INT NOT NULL COMMENT '特征维度',\n" +
                    "  embedding MEDIUMBLOB NOT NULL COMMENT '多帧平均后 L2 归一化的特征向量（float32 小端）；只在服务端比对，不下发前端',\n" +
                    "  frames INT NOT NULL DEFAULT 1 COMMENT '参与平均的帧数',\n" +
                    "  thumbnail MEDIUMTEXT NULL COMMENT '可选小缩略图 data:image/jpeg;base64（≤ 40KB）',\n" +
                    "  created_by VARCHAR(50) DEFAULT NULL COMMENT '录入人（本人或管理员）',\n" +
                    "  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,\n" +
                    "  PRIMARY KEY (id),\n" +
                    "  KEY idx_face_profile_account (account_id)\n" +
                    ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
            "CREATE TABLE IF NOT EXISTS care_log (\n" +
                    "  id BIGINT NOT NULL AUTO_INCREMENT,\n" +
                    "  target_type VARCHAR(16) NOT NULL COMMENT 'zone_species / plant / animal',\n" +
                    "  target_id VARCHAR(64) NOT NULL COMMENT '个体 id（zone_species.id / plant.pid / animal.id）',\n" +
                    "  target_name VARCHAR(100) DEFAULT NULL,\n" +
                    "  area_code VARCHAR(50) DEFAULT NULL COMMENT 'plant_area.area_code',\n" +
                    "  care_type VARCHAR(16) NOT NULL COMMENT 'water 浇水 / fertilize 施肥 / feed 喂食',\n" +
                    "  operator_id INT NOT NULL COMMENT '操作人 admin_user.id',\n" +
                    "  operator_name VARCHAR(50) NOT NULL,\n" +
                    "  maintainer_id INT DEFAULT NULL COMMENT '操作人关联的 maintainer.id',\n" +
                    "  note VARCHAR(255) DEFAULT NULL,\n" +
                    "  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,\n" +
                    "  PRIMARY KEY (id),\n" +
                    "  KEY idx_care_log_target (target_type, target_id, care_type),\n" +
                    "  KEY idx_care_log_time (created_at)\n" +
                    ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
            "CREATE TABLE IF NOT EXISTS care_period (\n" +
                    "  species_key VARCHAR(40) NOT NULL COMMENT '物种 key（同 zone_species.species_key）；*plant / *animal 为默认',\n" +
                    "  care_type VARCHAR(16) NOT NULL COMMENT 'water / fertilize / feed',\n" +
                    "  period_days INT NOT NULL COMMENT '周期（天）；0 表示不需要该项养护',\n" +
                    "  note VARCHAR(100) DEFAULT NULL,\n" +
                    "  PRIMARY KEY (species_key, care_type)\n" +
                    ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
            // 默认周期：只插入不存在的行，管理员改过的值不会被覆盖
            "INSERT IGNORE INTO care_period (species_key, care_type, period_days, note) VALUES\n" +
                    "('*plant','water',3,'植物默认：3 天浇一次'),('*plant','fertilize',30,'植物默认：30 天施一次肥'),('*animal','feed',1,'动物默认：每天喂食'),\n" +
                    "('lotus','water',0,'水生，不用浇水'),('lotus','fertilize',30,NULL),('waterlily','water',0,'水生，不用浇水'),('waterlily','fertilize',30,NULL),\n" +
                    "('iris','water',0,'湿生，岸边自然补水'),('iris','fertilize',45,NULL),('thalia','water',0,'水生，不用浇水'),('thalia','fertilize',45,NULL),\n" +
                    "('reed','water',0,'水生，不用浇水'),('reed','fertilize',0,'粗放管理，不施肥'),\n" +
                    "('willow','water',7,NULL),('willow','fertilize',90,NULL),('camphor','water',7,NULL),('camphor','fertilize',90,NULL),\n" +
                    "('osmanthus','water',5,NULL),('osmanthus','fertilize',60,NULL),('ginkgo','water',7,NULL),('ginkgo','fertilize',90,NULL),\n" +
                    "('cherry','water',5,NULL),('cherry','fertilize',60,NULL),('flowerbed','water',2,NULL),('flowerbed','fertilize',15,NULL),\n" +
                    "('shrub_ball','water',4,NULL),('shrub_ball','fertilize',45,NULL),\n" +
                    "('koi','feed',1,'每天少量多次'),('turtle','feed',2,NULL),('cat','feed',1,'校园小猫'),\n" +
                    "('frog','feed',0,'野生，不投喂'),('dragonfly','feed',0,'野生，不投喂'),('butterfly','feed',0,'野生，不投喂'),\n" +
                    "('magpie','feed',0,'野生鸟类，不投喂'),('sparrow','feed',0,'野生鸟类，不投喂'),('egret','feed',0,'野生鸟类，不投喂')",
    };

    private static final String URL, USER, PASSWORD;
    private static volatile boolean schemaReady;

    static {
        Properties p = new Properties();
        try (InputStream in = Jdbc.class.getClassLoader().getResourceAsStream("db.properties")) {
            if (in != null) p.load(in);
        } catch (Exception ignored) { /* 用默认值 */ }
        String u = p.getProperty("jdbc.url", "jdbc:mysql://localhost:3306/plant?useSSL=false&serverTimezone=Asia/Shanghai&characterEncoding=utf8");
        if (!u.contains("connectTimeout")) u += (u.contains("?") ? "&" : "?") + "connectTimeout=3000&socketTimeout=8000";
        URL = u;
        USER = p.getProperty("jdbc.username", "root");
        PASSWORD = p.getProperty("jdbc.password", "");
        try { Class.forName(p.getProperty("jdbc.driver", "com.mysql.cj.jdbc.Driver")); } catch (ClassNotFoundException ignored) { /* DriverManager 自动发现 */ }
    }

    public static Connection open() throws DbUnavailableException {
        try {
            DriverManager.setLoginTimeout(4);
            Connection c = DriverManager.getConnection(URL, USER, PASSWORD);
            if (!schemaReady) {
                synchronized (Jdbc.class) {
                    if (!schemaReady) {
                        try (Statement st = c.createStatement()) {
                            for (String sql : DDL) st.execute(sql);
                        }
                        schemaReady = true;
                    }
                }
            }
            return c;
        } catch (SQLException e) {
            throw new DbUnavailableException("数据库不可用：" + e.getMessage(), e);
        }
    }

    /** 表不存在（MySQL / MariaDB 错误码 1146）：例如全新库里 plant / animal 表还没被 DBTools 建出来。 */
    public static boolean isMissingTable(SQLException e) {
        return e.getErrorCode() == 1146 || "42S02".equals(e.getSQLState());
    }
}
