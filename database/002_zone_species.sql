-- 第三阶段 B：生态板块动植物个体表（动植物增删 + 栽种 / 移植动画）
-- 与 src/main/java/DB/JdbcZoneSpeciesStore.java 中的 DDL 一致；接口首次访问时也会自动 CREATE TABLE IF NOT EXISTS，
-- 正式环境建议由 DBA 手动执行本脚本（应用账号可不授予 CREATE 权限）。
-- zone_id 对应 campus3d/data/zones.json 的板块 id；area_code 对应 plant_area.area_code（未建外键，便于板块先于区域档案上线）；
-- seed_ref 为场景原有个体编号（如 willow#2），同一板块内唯一；新增个体为 NULL。删除为软删除（status = removed）。
USE plant;

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS zone_species (
  id BIGINT NOT NULL AUTO_INCREMENT,
  zone_id VARCHAR(50) NOT NULL COMMENT '生态板块 id（campus3d/data/zones.json）',
  area_code VARCHAR(50) NOT NULL COMMENT '对应 plant_area.area_code',
  species_type VARCHAR(10) NOT NULL COMMENT 'plant / animal',
  species_key VARCHAR(40) NOT NULL COMMENT '物种目录 key，如 lotus、koi',
  species_name VARCHAR(50) NOT NULL COMMENT '中文名',
  seed_ref VARCHAR(40) DEFAULT NULL COMMENT '场景原有个体编号（如 willow#2）；新增个体为 NULL',
  quantity INT NOT NULL DEFAULT 1,
  pos_x DOUBLE NOT NULL DEFAULT 0, pos_z DOUBLE NOT NULL DEFAULT 0,
  rotation_y DOUBLE NOT NULL DEFAULT 0, scale DOUBLE NOT NULL DEFAULT 1,
  status VARCHAR(16) NOT NULL DEFAULT 'active' COMMENT 'active / removed',
  created_by VARCHAR(50) DEFAULT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by VARCHAR(50) DEFAULT NULL, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_zone_species_seed (zone_id, seed_ref),
  KEY idx_zone_species_zone (zone_id, status),
  KEY idx_zone_species_area (area_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
