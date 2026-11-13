-- 人脸识别登录 + 三类账户（管理员 / 养护人员 / 访客）+ 养护工作台 + 数据大屏
-- 与 src/main/java/DB/Jdbc.java（DDL）和 DB/JdbcAccountStore.java 一致：接口首次访问时也会自动 CREATE TABLE IF NOT EXISTS / 补列，
-- 正式环境建议由 DBA 手动执行本脚本（应用账号可不授予 CREATE / ALTER 权限）。可重复执行。
--   face_profile  人脸特征（一人可多条；特征向量只在服务端比对，不下发前端）
--   care_log      养护记录（浇水 / 施肥 / 喂食：个体、操作类型、操作人、时间、备注）
--   care_period   各物种养护周期（可配置；0 表示不需要该项养护；*plant / *animal 为默认值）
--   admin_user.maintainer_id  养护员账号（role_code = MAINTAINER）关联 maintainer 档案 → plant_area.maintainer_id 找负责区域
USE plant;

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS face_profile (
  id BIGINT NOT NULL AUTO_INCREMENT,
  account_id INT NOT NULL COMMENT 'admin_user.id',
  role_code VARCHAR(40) NOT NULL COMMENT '录入时账号角色',
  model VARCHAR(40) NOT NULL DEFAULT 'human-faceres' COMMENT '特征模型',
  dim INT NOT NULL COMMENT '特征维度',
  embedding MEDIUMBLOB NOT NULL COMMENT '多帧平均后 L2 归一化的特征向量（float32 小端）；只在服务端比对，不下发前端',
  frames INT NOT NULL DEFAULT 1 COMMENT '参与平均的帧数',
  thumbnail MEDIUMTEXT NULL COMMENT '可选小缩略图 data:image/jpeg;base64（≤ 40KB）',
  created_by VARCHAR(50) DEFAULT NULL COMMENT '录入人（本人或管理员）',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_face_profile_account (account_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS care_log (
  id BIGINT NOT NULL AUTO_INCREMENT,
  target_type VARCHAR(16) NOT NULL COMMENT 'zone_species / plant / animal',
  target_id VARCHAR(64) NOT NULL COMMENT '个体 id（zone_species.id / plant.pid / animal.id）',
  target_name VARCHAR(100) DEFAULT NULL,
  area_code VARCHAR(50) DEFAULT NULL COMMENT 'plant_area.area_code',
  care_type VARCHAR(16) NOT NULL COMMENT 'water 浇水 / fertilize 施肥 / feed 喂食',
  operator_id INT NOT NULL COMMENT '操作人 admin_user.id',
  operator_name VARCHAR(50) NOT NULL,
  maintainer_id INT DEFAULT NULL COMMENT '操作人关联的 maintainer.id',
  note VARCHAR(255) DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_care_log_target (target_type, target_id, care_type),
  KEY idx_care_log_time (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS care_period (
  species_key VARCHAR(40) NOT NULL COMMENT '物种 key（同 zone_species.species_key）；*plant / *animal 为默认',
  care_type VARCHAR(16) NOT NULL COMMENT 'water / fertilize / feed',
  period_days INT NOT NULL COMMENT '周期（天）；0 表示不需要该项养护',
  note VARCHAR(100) DEFAULT NULL,
  PRIMARY KEY (species_key, care_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO care_period (species_key, care_type, period_days, note) VALUES
('*plant','water',3,'植物默认：3 天浇一次'),('*plant','fertilize',30,'植物默认：30 天施一次肥'),('*animal','feed',1,'动物默认：每天喂食'),
('lotus','water',0,'水生，不用浇水'),('lotus','fertilize',30,NULL),('waterlily','water',0,'水生，不用浇水'),('waterlily','fertilize',30,NULL),
('iris','water',0,'湿生，岸边自然补水'),('iris','fertilize',45,NULL),('thalia','water',0,'水生，不用浇水'),('thalia','fertilize',45,NULL),
('reed','water',0,'水生，不用浇水'),('reed','fertilize',0,'粗放管理，不施肥'),
('willow','water',7,NULL),('willow','fertilize',90,NULL),('camphor','water',7,NULL),('camphor','fertilize',90,NULL),
('osmanthus','water',5,NULL),('osmanthus','fertilize',60,NULL),('ginkgo','water',7,NULL),('ginkgo','fertilize',90,NULL),
('cherry','water',5,NULL),('cherry','fertilize',60,NULL),('flowerbed','water',2,NULL),('flowerbed','fertilize',15,NULL),
('shrub_ball','water',4,NULL),('shrub_ball','fertilize',45,NULL),
('koi','feed',1,'每天少量多次'),('turtle','feed',2,NULL),('cat','feed',1,'校园小猫'),
('frog','feed',0,'野生，不投喂'),('dragonfly','feed',0,'野生，不投喂'),('butterfly','feed',0,'野生，不投喂'),
('magpie','feed',0,'野生鸟类，不投喂'),('sparrow','feed',0,'野生鸟类，不投喂'),('egret','feed',0,'野生鸟类，不投喂');

-- 账号表补“关联养护员档案”列（admin_user 由 DBTools / 001 脚本建）
SET @column_exists = (SELECT COUNT(*) FROM information_schema.columns
                      WHERE table_schema = DATABASE() AND table_name = 'admin_user' AND column_name = 'maintainer_id');
SET @sql = IF(@column_exists = 0, 'ALTER TABLE admin_user ADD COLUMN maintainer_id INT NULL COMMENT ''养护员账号关联的 maintainer.id''', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 角色字典补“养护人员”（admin_role 由 001 脚本建）
INSERT IGNORE INTO admin_role (role_code, role_name, description) VALUES
    ('MAINTAINER', '养护人员', '养护工作台：浇水、施肥、喂食，动植物增删改查；可录入人脸');

-- 为生态板块（campus3d/data/zones.json 的 area_code）补建区域档案，养护员通过 plant_area.maintainer_id 负责区域
INSERT IGNORE INTO plant_area (area_code, area_name, status) VALUES
    ('MY-ECO-CUIHU', '生态板块·翠湖水景', '启用'),
    ('MY-ECO-LAWN', '生态板块·中心草坪', '启用'),
    ('MY-ECO-LOTUS', '生态板块·图书馆·荷花池', '启用'),
    ('MY-ECO-TEACH', '生态板块·教学楼绿化带', '启用'),
    ('MY-ECO-DORM-A', '生态板块·A 区宿舍生活区', '启用'),
    ('MY-ECO-DORM-C', '生态板块·C 区宿舍庭院', '启用'),
    ('MY-ECO-SPORT', '生态板块·运动场周边', '启用');
