#!/usr/bin/env python3
"""
测试库准备（可重复执行）：依次执行 database/001–005 脚本，并把 plant 库所有表统一为 utf8mb4_unicode_ci。

为什么要统一排序规则：全新库里如果先由 DBTools 建表（DEFAULT CHARSET=utf8mb4，不写排序规则 → MySQL 8 为 utf8mb4_0900_ai_ci、
MariaDB 11 为 utf8mb4_uca1400_ai_ci），再执行 001 脚本（把 plant 表转成 utf8mb4_unicode_ci），原有的
跨表查询（如 plant ⨝ maintainer_plant）会报 “Illegal mix of collations”。
这是建表顺序造成的；新增的查询已显式写 COLLATE，不受影响。
用法：python3 tests/face-login/setup_test_db.py [--socket /tmp/maria.sock]（需先访问一次任一接口如 /api/face/status，让 DBTools 建表）
"""
import argparse, os, pymysql

ap = argparse.ArgumentParser()
ap.add_argument("--socket", default="/tmp/maria.sock")
ap.add_argument("--host", default=None)
ap.add_argument("--port", type=int, default=3306)
a = ap.parse_args()
kw = dict(user="root", password="root", charset="utf8mb4", autocommit=True, client_flag=pymysql.constants.CLIENT.MULTI_STATEMENTS)
kw.update(dict(host=a.host, port=a.port) if a.host else dict(unix_socket=a.socket))
c = pymysql.connect(**kw)
root = os.path.join(os.path.dirname(__file__), "..", "..", "database")
cur = c.cursor()
for f in ["001_role_area_map_migration.sql", "002_zone_species.sql", "003_face_login_care.sql", "004_demo_face_login_seed.sql", "005_password_hash.sql"]:
    cur.execute(open(os.path.join(root, f), encoding="utf-8").read())
    while cur.nextset():
        pass
    print("执行", f)
cur.execute("SELECT table_name FROM information_schema.tables WHERE table_schema = 'plant' AND table_collation <> 'utf8mb4_unicode_ci'")
for (t,) in cur.fetchall():
    cur.execute(f"ALTER TABLE plant.`{t}` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci")
    print("统一排序规则", t)
print("完成")
