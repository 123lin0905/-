-- 板块细节场景重做后的 zone_species 旧记录迁移（翠湖 / 图书馆 / 中心草坪）
--
-- 背景：
--   * 翠湖水景 cuihu_water：pond/pond.html 从 7 × 12 米的锦鲤庭园改为按官方鸟瞰图重建的真实尺寸翠湖
--     （新坐标：x = (px − 366) × 0.4，z = (py − 1515) × 0.4 米）。旧庭园局部坐标与校园平面图没有固定换算，
--     原有个体编号（willow#N、lotus#N、waterlily#N、koi#N）在新场景里指向别的个体或已不存在（翠湖没有荷花）。
--   * 图书馆 library_lotus：从池塘场景变体改为 library/library.html（馆前草坡，世界米，原点 = 平面图 (1260, 850)）；
--     旧记录全部是池塘物种（荷花、鸢尾、青蛙…），坐标无法换算。
--   * 中心草坪 central_lawn：从微缩模型 lawn/lawn.html（1 单位 = 4 米，原点 = 平面图 (932.5, 1035)）
--     改为真实尺度 lawn2/lawn.html（世界米，原点 = 平面图 (870, 1090)）：
--       x_new = x_old × 4 + 25，z_new = z_old × 4 − 22。
--   * 运动场 sports_ring、C 区 c_court、A 区 dorm_life、教学楼 teaching_green 原来没有细节场景，没有旧记录，不需要迁移。
--
-- 执行要求：
--   1. 先备份 zone_species（备份写到 DBA 自己的位置，不要写进仓库的 database-backups/）。
--   2. 在把 zones.json 的 detail_scene 切到新场景的版本上线之前或同时执行。
--   3. 只执行一次。第 3 段坐标换算用 updated_by = 'migration-007' 做了防重复，但如果执行后又有人在场景里改过记录，
--      再执行会对这些记录重复换算。
--   4. care_log 中 target_type = 'zone_species' 指向被作废记录的养护日志会变成“孤儿”，统计时需要容忍或另行清理。
--   5. 无后端演示模式的浏览器存储（localStorage 的 pond-species-demo:cuihu_water、…:library_lotus、…:central_lawn）
--      同样是旧坐标，演示前清一下浏览器存储即可。
USE plant;

SET NAMES utf8mb4;

-- 1. 翠湖：旧庭园坐标的记录全部作废；清空 seed_ref，避免与新场景的同名编号冲突（唯一键 uk_zone_species_seed）
UPDATE zone_species SET status = 'removed', updated_by = 'migration-007'
 WHERE zone_id = 'cuihu_water' AND status = 'active';
UPDATE zone_species SET seed_ref = NULL
 WHERE zone_id = 'cuihu_water' AND seed_ref IS NOT NULL;

-- 2. 图书馆：旧记录来自池塘场景，坐标无法换算，软删除并清空 seed_ref
UPDATE zone_species SET status = 'removed', updated_by = 'migration-007'
 WHERE zone_id = 'library_lotus' AND status = 'active';
UPDATE zone_species SET seed_ref = NULL
 WHERE zone_id = 'library_lotus' AND seed_ref IS NOT NULL;

-- 3. 中心草坪
-- 3.1 旧原有个体（seed_ref）在新场景对应不同的树，作废并清空 seed_ref
UPDATE zone_species SET status = 'removed', seed_ref = NULL, updated_by = 'migration-007'
 WHERE zone_id = 'central_lawn' AND seed_ref IS NOT NULL;
-- 3.2 新增个体：旧微缩坐标 → 新世界米（scale 是相对原型尺寸的倍数，保持不变）
UPDATE zone_species
   SET pos_x = pos_x * 4 + 25, pos_z = pos_z * 4 - 22, updated_by = 'migration-007'
 WHERE zone_id = 'central_lawn' AND seed_ref IS NULL AND status = 'active'
   AND (updated_by IS NULL OR updated_by <> 'migration-007');
-- 3.3 换算后落在新场景范围外（平面图 x 600–1130、y 880–1320 → x −108…104 米、z −84…92 米）的记录软删除
UPDATE zone_species SET status = 'removed', updated_by = 'migration-007'
 WHERE zone_id = 'central_lawn' AND status = 'active'
   AND (pos_x < -108 OR pos_x > 104 OR pos_z < -84 OR pos_z > 92);

-- 换算后的新增个体可能落在道路或水面上（两版场景的道路宽度不同），加载时不再检查放置规则；
-- 建议迁移后由管理员在 lawn2/lawn.html 里看一遍，个别个体手动移植。
