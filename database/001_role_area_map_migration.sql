USE plant;

SET NAMES utf8mb4;

-- 角色字典：后续可以继续扩展角色，不把角色名称散落在页面中。
CREATE TABLE IF NOT EXISTS admin_role (
    id INT NOT NULL AUTO_INCREMENT,
    role_code VARCHAR(40) NOT NULL,
    role_name VARCHAR(50) NOT NULL,
    description VARCHAR(255) DEFAULT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_admin_role_code (role_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 管理员账号。password_hash 保存 SHA-256 摘要，不保存明文密码。
CREATE TABLE IF NOT EXISTS admin_user (
    id INT NOT NULL AUTO_INCREMENT,
    username VARCHAR(50) NOT NULL,
    password_hash CHAR(64) NOT NULL,
    display_name VARCHAR(50) NOT NULL,
    role_code VARCHAR(40) NOT NULL,
    status TINYINT NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_admin_user_username (username),
    KEY idx_admin_user_role (role_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO admin_role (role_code, role_name, description) VALUES
    ('SYSTEM_ADMIN', '系统管理员', '负责系统配置、管理员账号、养护员和区域维护'),
    ('PLANT_ADMIN', '绿植管理员', '负责绿植档案、地图点位和绿植养护周期'),
    ('MAINTENANCE_ADMIN', '养护管理员', '负责养护记录、养护任务和人员-绿植分配')
ON DUPLICATE KEY UPDATE
    role_name = VALUES(role_name),
    description = VALUES(description);

-- 首次部署使用的演示账号，登录后应及时修改密码。
INSERT INTO admin_user (username, password_hash, display_name, role_code) VALUES
    ('system_admin', SHA2('System@123', 256), '系统管理员', 'SYSTEM_ADMIN'),
    ('plant_admin', SHA2('Plant@123', 256), '绿植管理员', 'PLANT_ADMIN'),
    ('maintenance_admin', SHA2('Maintain@123', 256), '养护管理员', 'MAINTENANCE_ADMIN')
ON DUPLICATE KEY UPDATE
    display_name = VALUES(display_name),
    role_code = VALUES(role_code),
    status = 1;

-- 管理区域。boundary_json 预留多边形边界，先支持中心点+半径。
CREATE TABLE IF NOT EXISTS plant_area (
    id INT NOT NULL AUTO_INCREMENT,
    area_code VARCHAR(50) NOT NULL,
    area_name VARCHAR(100) NOT NULL,
    maintainer_id INT DEFAULT NULL,
    center_latitude DECIMAL(10,7) DEFAULT NULL,
    center_longitude DECIMAL(10,7) DEFAULT NULL,
    radius_m INT DEFAULT NULL,
    boundary_json TEXT,
    status VARCHAR(20) NOT NULL DEFAULT '启用',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_plant_area_code (area_code),
    KEY idx_plant_area_maintainer (maintainer_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 一个养护员可以负责多株绿植，一株绿植也可以配置主/协作养护员。
CREATE TABLE IF NOT EXISTS maintainer_plant (
    id INT NOT NULL AUTO_INCREMENT,
    maintainer_id INT NOT NULL,
    pid CHAR(32) NOT NULL,
    is_primary TINYINT NOT NULL DEFAULT 1,
    assigned_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(20) NOT NULL DEFAULT '有效',
    PRIMARY KEY (id),
    UNIQUE KEY uk_maintainer_plant (maintainer_id, pid),
    KEY idx_maintainer_plant_pid (pid),
    KEY idx_maintainer_plant_maintainer (maintainer_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 统一现有绿植表的字符集，保证后续关联表可以稳定使用中文和字符串索引。
ALTER TABLE plant CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- MySQL 8.0.13 对 ADD COLUMN IF NOT EXISTS 兼容性不一致，使用元数据判断保证脚本可重复执行。
SET @column_exists = (SELECT COUNT(*) FROM information_schema.columns
                      WHERE table_schema = DATABASE() AND table_name = 'plant' AND column_name = 'area_id');
SET @sql = IF(@column_exists = 0, 'ALTER TABLE plant ADD COLUMN area_id INT NULL AFTER pdesc', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @column_exists = (SELECT COUNT(*) FROM information_schema.columns
                      WHERE table_schema = DATABASE() AND table_name = 'plant' AND column_name = 'latitude');
SET @sql = IF(@column_exists = 0, 'ALTER TABLE plant ADD COLUMN latitude DECIMAL(10,7) NULL AFTER area_id', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @column_exists = (SELECT COUNT(*) FROM information_schema.columns
                      WHERE table_schema = DATABASE() AND table_name = 'plant' AND column_name = 'longitude');
SET @sql = IF(@column_exists = 0, 'ALTER TABLE plant ADD COLUMN longitude DECIMAL(10,7) NULL AFTER latitude', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @column_exists = (SELECT COUNT(*) FROM information_schema.columns
                      WHERE table_schema = DATABASE() AND table_name = 'plant' AND column_name = 'trim_period_days');
SET @sql = IF(@column_exists = 0, 'ALTER TABLE plant ADD COLUMN trim_period_days INT NULL AFTER longitude', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @column_exists = (SELECT COUNT(*) FROM information_schema.columns
                      WHERE table_schema = DATABASE() AND table_name = 'plant' AND column_name = 'fertilize_period_days');
SET @sql = IF(@column_exists = 0, 'ALTER TABLE plant ADD COLUMN fertilize_period_days INT NULL AFTER trim_period_days', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @column_exists = (SELECT COUNT(*) FROM information_schema.columns
                      WHERE table_schema = DATABASE() AND table_name = 'plant' AND column_name = 'water_period_days');
SET @sql = IF(@column_exists = 0, 'ALTER TABLE plant ADD COLUMN water_period_days INT NULL AFTER fertilize_period_days', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @column_exists = (SELECT COUNT(*) FROM information_schema.columns
                      WHERE table_schema = DATABASE() AND table_name = 'plant' AND column_name = 'pest_period_days');
SET @sql = IF(@column_exists = 0, 'ALTER TABLE plant ADD COLUMN pest_period_days INT NULL AFTER water_period_days', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @column_exists = (SELECT COUNT(*) FROM information_schema.columns
                      WHERE table_schema = DATABASE() AND table_name = 'plant' AND column_name = 'next_trim_date');
SET @sql = IF(@column_exists = 0, 'ALTER TABLE plant ADD COLUMN next_trim_date DATE NULL AFTER pest_period_days', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @column_exists = (SELECT COUNT(*) FROM information_schema.columns
                      WHERE table_schema = DATABASE() AND table_name = 'plant' AND column_name = 'next_fertilize_date');
SET @sql = IF(@column_exists = 0, 'ALTER TABLE plant ADD COLUMN next_fertilize_date DATE NULL AFTER next_trim_date', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @column_exists = (SELECT COUNT(*) FROM information_schema.columns
                      WHERE table_schema = DATABASE() AND table_name = 'plant' AND column_name = 'next_water_date');
SET @sql = IF(@column_exists = 0, 'ALTER TABLE plant ADD COLUMN next_water_date DATE NULL AFTER next_fertilize_date', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @column_exists = (SELECT COUNT(*) FROM information_schema.columns
                      WHERE table_schema = DATABASE() AND table_name = 'plant' AND column_name = 'next_pest_date');
SET @sql = IF(@column_exists = 0, 'ALTER TABLE plant ADD COLUMN next_pest_date DATE NULL AFTER next_water_date', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @index_exists = (SELECT COUNT(*) FROM information_schema.statistics
                     WHERE table_schema = DATABASE() AND table_name = 'plant' AND index_name = 'idx_plant_area_id');
SET @sql = IF(@index_exists = 0, 'CREATE INDEX idx_plant_area_id ON plant (area_id)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
