-- A 区宿舍生活区板块细节场景（campus3d/dorm-a/dorm-a.html，zones.json 中 zone_id = dorm_life）
-- 板块开放“管理动植物”后需要的数据库补充；可重复执行（全部 INSERT IGNORE）。
--
-- 说明：
--   1. 场景原有个体（seed_ref 如 privet#3、ginkgo#12）由前端场景按官方地图生成，zone_species 只记录增删改，
--      因此不需要预置 zone_species 记录。
--   2. 区域档案 MY-ECO-DORM-A 已在 003 中建立，这里再写一遍以便单独执行本脚本。
--   3. 本板块可选物种：ginkgo、camphor、cherry、osmanthus、privet、shrub_ball、hedge、flowerbed、cat、magpie、sparrow、butterfly。
--      其中女贞（privet）和绿篱（hedge）在 003 的 care_period 中没有专门周期（会退回 *plant 默认值），这里补上。
USE plant;

SET NAMES utf8mb4;

INSERT IGNORE INTO plant_area (area_code, area_name, status) VALUES
    ('MY-ECO-DORM-A', '生态板块·A 区宿舍生活区', '启用');

INSERT IGNORE INTO care_period (species_key, care_type, period_days, note) VALUES
    ('privet', 'water', 5, '女贞：楼间绿地常绿小乔木'),
    ('privet', 'fertilize', 60, NULL),
    ('hedge', 'water', 4, '绿篱：修剪整齐的灌木带'),
    ('hedge', 'fertilize', 45, NULL);
