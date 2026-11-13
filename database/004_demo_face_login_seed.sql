-- 演示数据（可选，正式环境不要执行）：两个养护员账号 + 生态板块负责区域。依赖 003 脚本与 DBTools 初始化的 maintainer 样例（WH-1001 / WH-1002）。
-- 账号初始密码 123456（与 DBTools 里其他演示账号一致），登录后请修改；只补不改，已有同名账号 / 已分配的区域不会被覆盖。
USE plant;

SET NAMES utf8mb4;

INSERT IGNORE INTO admin_user (username, password_hash, display_name, role_code, status, maintainer_id)
SELECT 'keeper_zhang', SHA2('123456', 256), '张师傅（养护员）', 'MAINTAINER', 1, (SELECT id FROM maintainer WHERE staff_no = 'WH-1001' LIMIT 1);
INSERT IGNORE INTO admin_user (username, password_hash, display_name, role_code, status, maintainer_id)
SELECT 'keeper_li', SHA2('123456', 256), '李工（养护员）', 'MAINTAINER', 1, (SELECT id FROM maintainer WHERE staff_no = 'WH-1002' LIMIT 1);

-- 张师傅负责翠湖水景、图书馆·荷花池；李工负责中心草坪（仅当区域还没有负责人时）
UPDATE plant_area SET maintainer_id = (SELECT id FROM maintainer WHERE staff_no = 'WH-1001' LIMIT 1)
 WHERE area_code IN ('MY-ECO-CUIHU', 'MY-ECO-LOTUS') AND maintainer_id IS NULL;
UPDATE plant_area SET maintainer_id = (SELECT id FROM maintainer WHERE staff_no = 'WH-1002' LIMIT 1)
 WHERE area_code = 'MY-ECO-LAWN' AND maintainer_id IS NULL;
