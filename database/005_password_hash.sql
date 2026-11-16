-- 账号密码改为 PBKDF2 加盐哈希（security/PasswordHasher.java）：放宽 admin_user.password_hash 以存放
--   pbkdf2_sha256$迭代次数$盐$摘要（约 90 字符）。001 脚本建的是 CHAR(64)，DBTools 建的是 VARCHAR(128)。
-- 与 DB/JdbcAccountStore.java 一致：接口首次访问数据库时也会自动执行同样的放宽，可重复执行。
-- 旧数据（无盐 SHA-256）不需要迁移：账号登录成功后自动改写为新哈希。不删除任何表、不改动其他列。
USE plant;

SET NAMES utf8mb4;

ALTER TABLE admin_user MODIFY COLUMN password_hash VARCHAR(255) NOT NULL COMMENT 'PBKDF2 加盐哈希（旧数据为无盐 SHA-256，登录成功后自动升级）';
