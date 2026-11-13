#!/usr/bin/env python3
"""
人脸登录 / 三类账户 / 养护工作台 / 数据大屏 —— 后端接口与权限测试（可重复执行，跑在 MariaDB / MySQL + Tomcat 上）。

用法：
    python3 tests/face-login/api_test.py [--base http://localhost:8080/demo1] [--db-down-cmd "..."] [--db-up-cmd "..."]
依赖：pymysql（检查数据库记录）。连接参数：--db-socket 或 --db-host/--db-port，账号 root/root，库 plant。
注意：会清空 face_profile、care_log 两张表，并写入 TEST- 前缀的测试数据（plant 表、zone_species 表），只能对测试库执行。
人脸特征用随机向量模拟（真正的人脸特征来自浏览器端 human 模型，见 e2e_face.py）。
"""
import argparse, http.cookiejar, json, random, subprocess, sys, time, urllib.error, urllib.parse, urllib.request

import pymysql

ap = argparse.ArgumentParser()
ap.add_argument("--base", default="http://localhost:8080/demo1")
ap.add_argument("--db-socket", default="/tmp/maria.sock")
ap.add_argument("--db-host", default=None)
ap.add_argument("--db-port", type=int, default=3306)
ap.add_argument("--db-down-cmd", default=None, help="停库命令（可选，用来测 503）")
ap.add_argument("--db-up-cmd", default=None, help="起库命令（与 --db-down-cmd 配合）")
args = ap.parse_args()
BASE = args.base.rstrip("/")


def db():
    kw = dict(user="root", password="root", database="plant", charset="utf8mb4", autocommit=True)
    if args.db_host: kw.update(host=args.db_host, port=args.db_port)
    else: kw.update(unix_socket=args.db_socket)
    return pymysql.connect(**kw)


def q(sql, *p):
    c = db()
    try:
        with c.cursor() as cur:
            cur.execute(sql, p)
            return cur.fetchall()
    finally:
        c.close()


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k): return None


class Client:
    def __init__(self, name):
        self.name = name
        self.jar = http.cookiejar.CookieJar()
        self.op = urllib.request.build_opener(urllib.request.ProxyHandler({}), urllib.request.HTTPCookieProcessor(self.jar), NoRedirect())

    def req(self, method, path, body=None, form=None):
        data, headers = None, {}
        if body is not None: data = json.dumps(body).encode(); headers["Content-Type"] = "application/json"
        if form is not None: data = urllib.parse.urlencode(form).encode(); headers["Content-Type"] = "application/x-www-form-urlencoded"
        r = urllib.request.Request(BASE + path, data=data, method=method, headers=headers)
        try:
            resp = self.op.open(r, timeout=30)
            status, raw, hdr = resp.status, resp.read(), resp.headers
        except urllib.error.HTTPError as e:
            status, raw, hdr = e.code, e.read(), e.headers
        text = raw.decode("utf-8", "replace")
        try: js = json.loads(text)
        except Exception: js = None
        return status, js, text, hdr

    def login(self, user, pwd="123456"):
        for _ in range(3):   # 数据库刚重启时 MyBatis 连接池里的旧连接会失败一次（原有行为），重试
            s, _, _, h = self.req("POST", "/LoginServlet", form={"username": user, "password": pwd, "returnUrl": "/index.jsp"})
            if s == 302: break
            time.sleep(1)
        assert s == 302 and "login.jsp" not in (h.get("Location") or ""), (user, s, h.get("Location"))
        return self


PASS, FAIL = [], []


def check(name, cond, info=""):
    (PASS if cond else FAIL).append(name)
    print(("  ✔ " if cond else "  ✘ ") + name + ("" if cond else "  —— " + str(info)[:300]))


def expect(name, client, method, path, status, body=None):
    s, js, text, h = client.req(method, path, body)
    ok = s == status if isinstance(status, int) else s in status
    check(f"{client.name}: {method} {path} → {status}", ok, f"实际 {s} {text[:200]}")
    return s, js, text, h


def vec(seed, dim=1024):
    r = random.Random(seed)
    return [max(0.0, r.gauss(0, 1)) for _ in range(dim)]


def jitter(v, seed, amt=0.3):
    r = random.Random(seed)
    return [max(0.0, x + r.gauss(0, amt)) for x in v]


def frames(v, seed):
    return [jitter(v, seed + i) for i in range(3)]


# ------------------------------------------------------------------ 准备
print("== 准备测试数据 ==")
q("DELETE FROM face_profile")
q("DELETE FROM care_log")
q("DELETE FROM zone_species WHERE created_by LIKE '%%（养护员）' OR species_name LIKE 'TEST-%%'")
q("DELETE FROM plant_maintenance WHERE pid LIKE 'TEST-%%'")
q("DELETE FROM plant WHERE pid LIKE 'TEST-%%'")
area_cuihu = q("SELECT id FROM plant_area WHERE area_code = 'MY-ECO-CUIHU'")[0][0]
q("INSERT INTO plant (pid, pname, ptype, pdatetime, pprice, ppic, pdesc, area_id, water_period_days, fertilize_period_days) "
  "VALUES ('TEST-P1', 'TEST-翠湖岸边桂花', '乔木', '2026-01-01', 0, '', '测试', %s, 5, 60)", area_cuihu)
A, B, C, STRANGER = vec(1), vec(2), vec(3), vec(4)

anon = Client("未登录")
visitor = Client("访客")
admin = Client("管理员").login("admin")
plant_admin = Client("绿植管理员").login("plant_admin")
zhang = Client("养护员张").login("keeper_zhang")
li = Client("养护员李").login("keeper_li")
s, js, *_ = visitor.req("POST", "/api/face/guest")
check("访客：POST /api/face/guest 进入访客身份", s == 200 and js["user"]["group"] == "visitor", js)

print("== /api/me 身份 ==")
for c, g in [(anon, "anonymous"), (visitor, "visitor"), (admin, "admin"), (plant_admin, "admin"), (zhang, "maintainer")]:
    _, js, *_ = c.req("GET", "/api/me")
    check(f"{c.name}: /api/me group={g}", js and js["user"]["group"] == g, js)
_, js, *_ = zhang.req("GET", "/api/me")
check("养护员：can_care=true, can_dashboard=false, can_edit_species=true", js["can_care"] and not js["can_dashboard"] and js["can_edit_species"], js)
_, js, *_ = admin.req("GET", "/api/me")
check("管理员：can_dashboard=true, can_care=false（默认管理员不进工作台）", js["can_dashboard"] and not js["can_care"], js)

print("== 页面与接口权限（401 / 403 / 通过） ==")
for path in ["/care_workbench.jsp", "/data_screen.jsp", "/face_enroll.jsp"]:
    s, _, _, h = expect(f"未登录访问 {path} 跳登录", anon, "GET", path, 302)
    check(f"  {path} 跳到 login.jsp", "login.jsp" in (h.get("Location") or ""), h.get("Location"))
for path in ["/api/care/targets", "/api/dashboard/stats", "/api/face/profiles", "/api/face/accounts"]:
    expect("未登录", anon, "GET", path, 401)
expect("未登录录入人脸", anon, "POST", "/api/face/enroll", 401, {"embeddings": frames(A, 10), "real": .9, "live": .9})
expect("未登录养护", anon, "POST", "/api/care/logs", 401, {"target_type": "plant", "target_id": "TEST-P1", "care_type": "water"})
expect("未登录增删动植物", anon, "POST", "/api/zones/cuihu_water/species", 401, {"species_type": "plant", "species_key": "willow", "species_name": "垂柳", "x": 1, "z": 1})

for path in ["/care_workbench.jsp", "/data_screen.jsp", "/face_enroll.jsp", "/QueryServlet", "/AdminDashboardServlet", "/addplant.jsp"]:
    expect("访客只读", visitor, "GET", path, 403)
for path in ["/api/care/targets", "/api/dashboard/stats", "/api/face/profiles"]:
    expect("访客只读", visitor, "GET", path, 403)
expect("访客录入人脸", visitor, "POST", "/api/face/enroll", 403, {"embeddings": frames(A, 10), "real": .9, "live": .9})
expect("访客养护", visitor, "POST", "/api/care/logs", 403, {"target_type": "plant", "target_id": "TEST-P1", "care_type": "water"})
s, js, *_ = expect("访客增删动植物", visitor, "POST", "/api/zones/cuihu_water/species", 403, {"species_type": "plant", "species_key": "willow", "species_name": "垂柳", "x": 1, "z": 1})
expect("访客浏览板块动植物（只读 GET 允许）", visitor, "GET", "/api/zones/cuihu_water/species", 200)
for path in ["/ecohome.jsp", "/index.jsp", "/campus3d/pond/pond.html", "/campus3d/lawn/lawn.html"]:
    expect("访客浏览公开页面", visitor, "GET", path, 200)

expect("管理员", admin, "GET", "/data_screen.jsp", 200)
expect("管理员", admin, "GET", "/api/dashboard/stats", 200)
expect("管理员", admin, "GET", "/face_enroll.jsp", 200)
expect("管理员默认不能进工作台", admin, "GET", "/care_workbench.jsp", 403)
expect("管理员默认不能进工作台", admin, "GET", "/api/care/targets", 403)
expect("绿植管理员属于管理员身份", plant_admin, "GET", "/api/dashboard/stats", 200)
expect("养护员", zhang, "GET", "/care_workbench.jsp", 200)
expect("养护员", zhang, "GET", "/api/care/targets", 200)
expect("养护员", zhang, "GET", "/face_enroll.jsp", 200)
expect("养护员不能看大屏", zhang, "GET", "/data_screen.jsp", 403)
expect("养护员不能看大屏", zhang, "GET", "/api/dashboard/stats", 403)
expect("养护员不能进系统后台（原有规则不变）", zhang, "GET", "/AdminDashboardServlet", 403)

print("== 人脸：录入 / 识别 / 删除 ==")
s, js, *_ = expect("还没有人脸", anon, "GET", "/api/face/status", 200)
check("status.enrolled=false", js["enrolled"] is False, js)
expect("没有人脸时识别", anon, "POST", "/api/face/identify", 409, {"embedding": A, "real": .9, "live": .9})
expect("只有 2 帧", admin, "POST", "/api/face/enroll", 400, {"embeddings": frames(A, 10)[:2], "real": .9, "live": .9})
expect("特征格式错误", admin, "POST", "/api/face/enroll", 400, {"embeddings": [[1, 2, 3]] * 3, "real": .9, "live": .9})
expect("活体分数过低", admin, "POST", "/api/face/enroll", 422, {"embeddings": frames(A, 10), "real": .9, "live": .1})
expect("多帧混进别人", admin, "POST", "/api/face/enroll", 422, {"embeddings": [A, B, STRANGER], "real": .9, "live": .9})
s, js, *_ = expect("管理员给自己录入 A", admin, "POST", "/api/face/enroll", 201, {"embeddings": frames(A, 10), "real": .9, "live": .9, "thumbnail": "data:image/jpeg;base64,/9j/AAAA"})
check("录入返回列表里不含特征向量", "embedding" not in json.dumps(js), "")
admin_profile = js["id"]
s, js, *_ = expect("养护员张给自己录入 B", zhang, "POST", "/api/face/enroll", 201, {"embeddings": frames(B, 20), "real": .9, "live": .9})
admin_id = q("SELECT id FROM admin_user WHERE username = 'admin'")[0][0]
li_id = q("SELECT id FROM admin_user WHERE username = 'keeper_li'")[0][0]
pa_id = q("SELECT id FROM admin_user WHERE username = 'plant_admin'")[0][0]
expect("养护员不能给管理员录入", zhang, "POST", "/api/face/enroll", 403, {"account_id": admin_id, "embeddings": frames(C, 30), "real": .9, "live": .9})
expect("养护员不能给其他养护员录入", zhang, "POST", "/api/face/enroll", 403, {"account_id": li_id, "embeddings": frames(C, 30), "real": .9, "live": .9})
expect("管理员不能给其他管理员录入", admin, "POST", "/api/face/enroll", 403, {"account_id": pa_id, "embeddings": frames(C, 30), "real": .9, "live": .9})
s, js, *_ = expect("管理员给养护员李录入 C", admin, "POST", "/api/face/enroll", 201, {"account_id": li_id, "embeddings": frames(C, 30), "real": .9, "live": .9})
li_profile = js["id"]
expect("同一张脸不能录到第二个账号", admin, "POST", "/api/face/enroll", 409, {"embeddings": frames(B, 40), "real": .9, "live": .9})
rows = q("SELECT account_id, role_code, dim, frames, LENGTH(embedding) FROM face_profile ORDER BY id")
check("face_profile 有 3 条，1024 维 float32、3 帧平均", len(rows) == 3 and all(r[2] == 1024 and r[3] == 3 and r[4] == 4096 for r in rows), rows)
s, js, *_ = expect("养护员看自己的人脸", zhang, "GET", "/api/face/profiles", 200)
check("  只有 1 条且不含特征", len(js["items"]) == 1 and "embedding" not in json.dumps(js), js)
expect("养护员不能看管理员的人脸", zhang, "GET", f"/api/face/profiles?account_id={admin_id}", 403)
s, js, *_ = expect("管理员看养护员李的人脸", admin, "GET", f"/api/face/profiles?account_id={li_id}", 200)
s, js, *_ = expect("管理员的养护员账号列表", admin, "GET", "/api/face/accounts", 200)
check("  列表含 keeper_zhang / keeper_li 及人脸条数", {a["username"]: a["face_count"] for a in js["items"]} == {"keeper_zhang": 1, "keeper_li": 1}, js)
expect("养护员不能看账号列表", zhang, "GET", "/api/face/accounts", 403)
_, js, *_ = anon.req("GET", "/api/face/status")
check("status.enrolled=true", js["enrolled"] is True, js)

fa = Client("刷脸A")
s, js, *_ = expect("识别 A（管理员）", fa, "POST", "/api/face/identify", 200, {"embedding": jitter(A, 99), "real": .8, "live": .9})
check("  进入管理员账号并跳管理页", js and js["user"]["username"] == "admin" and js["redirect"].endswith("/AdminDashboardServlet"), js)
_, me, *_ = fa.req("GET", "/api/me")
check("  会话已是管理员", me["user"]["group"] == "admin", me)
expect("  刷脸后能打开数据大屏", fa, "GET", "/data_screen.jsp", 200)
fb = Client("刷脸B")
s, js, *_ = expect("识别 B（养护员）", fb, "POST", "/api/face/identify", 200, {"embedding": jitter(B, 98), "real": .8, "live": .9})
check("  进入养护员账号并跳工作台", js and js["user"]["username"] == "keeper_zhang" and js["redirect"].endswith("/care_workbench.jsp"), js)
expect("  刷脸后能进养护工作台", fb, "GET", "/api/care/targets", 200)
fv = Client("访客转刷脸")
fv.req("POST", "/api/face/guest")
s, js, *_ = expect("访客再刷脸 B", fv, "POST", "/api/face/identify", 200, {"embedding": jitter(B, 97), "real": .8, "live": .9})
_, me, *_ = fv.req("GET", "/api/me")
check("  访客标记被清除，成为养护员", me["user"]["group"] == "maintainer", me)
fs = Client("陌生人")
s, js, *_ = expect("陌生人识别失败", fs, "POST", "/api/face/identify", 401, {"embedding": STRANGER, "real": .8, "live": .9})
check("  失败不返回相似度 / 账号信息", js and "similarity" not in js and "user" not in js, js)
_, me, *_ = fs.req("GET", "/api/me")
check("  失败后仍未登录", me["user"]["group"] == "anonymous", me)
expect("活体不通过", fs, "POST", "/api/face/identify", 422, {"embedding": jitter(A, 96), "real": .8, "live": .1})
expect("防翻拍不通过", fs, "POST", "/api/face/identify", 422, {"embedding": jitter(A, 96), "real": .05, "live": .9})
expect("特征格式错误", fs, "POST", "/api/face/identify", 400, {"embedding": [1, 2], "real": .8, "live": .9})
expect("缺少活体分数", fs, "POST", "/api/face/identify", 422, {"embedding": jitter(A, 95)})

expect("养护员不能删管理员的人脸", zhang, "DELETE", f"/api/face/profiles/{admin_profile}", 403)
expect("访客不能删人脸", visitor, "DELETE", f"/api/face/profiles/{admin_profile}", 403)
expect("管理员删除养护员李的人脸", admin, "DELETE", f"/api/face/profiles/{li_profile}", 200)
expect("删除后不存在", admin, "DELETE", f"/api/face/profiles/{li_profile}", 404)
expect("删除后李刷脸失败", Client("刷脸C"), "POST", "/api/face/identify", 401, {"embedding": jitter(C, 94), "real": .8, "live": .9})
check("face_profile 剩 2 条", q("SELECT COUNT(*) FROM face_profile")[0][0] == 2)

print("== 养护工作台 ==")
s, js, *_ = expect("养护员张在翠湖新增垂柳（沿用 species-editor 权限）", zhang, "POST", "/api/zones/cuihu_water/species", 201,
                   {"species_type": "plant", "species_key": "willow", "species_name": "垂柳", "x": 3, "z": 4})
willow = str(js["item"]["id"])
_, js, *_ = zhang.req("POST", "/api/zones/cuihu_water/species", {"species_type": "plant", "species_key": "lotus", "species_name": "荷花", "x": 1, "z": 1})
lotus = str(js["item"]["id"])
_, js, *_ = zhang.req("POST", "/api/zones/cuihu_water/species", {"species_type": "animal", "species_key": "koi", "species_name": "锦鲤", "x": 0, "z": 0, "quantity": 6})
koi = str(js["item"]["id"])
_, js, *_ = li.req("POST", "/api/zones/central_lawn/species", {"species_type": "animal", "species_key": "cat", "species_name": "校园小猫", "x": 2, "z": 2})
cat = str(js["item"]["id"])
s, js, *_ = expect("工作台列表", zhang, "GET", "/api/care/targets", 200)
items = js["items"]
by = {(i["target_type"], i["target_id"]): i for i in items}
check("  我负责的排在前面", items[0]["mine"] and all(i["mine"] for i in items[:sum(1 for i in items if i["mine"])]), [i["mine"] for i in items])
check("  负责区域含翠湖水景、图书馆·荷花池", {a["area_code"] for a in js["me"]["areas"]} == {"MY-ECO-CUIHU", "MY-ECO-LOTUS"}, js["me"])
check("  垂柳（翠湖）是我负责的、需浇水", by[("zone_species", willow)]["mine"] and by[("zone_species", willow)]["cares"][0]["state"] == "due", by.get(("zone_species", willow)))
check("  小猫（中心草坪）不是张负责的", not by[("zone_species", cat)]["mine"])
check("  荷花不需要浇水（周期 0）", by[("zone_species", lotus)]["cares"][0]["state"] == "na")
check("  TEST-P1 绿植档案在翠湖、周期取档案自身 5 天", by[("plant", "TEST-P1")]["mine"] and by[("plant", "TEST-P1")]["cares"][0]["period_days"] == 5, by.get(("plant", "TEST-P1")))
water_due_before = js["due"]["mine"]["water"]
s, js, *_ = expect("给垂柳浇水", zhang, "POST", "/api/care/logs", 201, {"target_type": "zone_species", "target_id": willow, "care_type": "water", "note": "API 测试"})
check("  返回后状态变为正常", js["item"]["cares"][0]["state"] == "ok" and js["item"]["cares"][0]["last_by"], js.get("item"))
check("  我负责的待浇水数减 1", js["due"]["mine"]["water"] == water_due_before - 1, js["due"])
row = q("SELECT target_type, target_id, care_type, operator_name, maintainer_id, note FROM care_log WHERE target_id = %s", willow)
check("  care_log 有记录（个体、类型、操作人、养护员档案、备注）", row and row[0][2] == "water" and row[0][3] == "张师傅（养护员）" and row[0][4] == 1 and row[0][5] == "API 测试", row)
expect("给锦鲤喂食", zhang, "POST", "/api/care/logs", 201, {"target_type": "zone_species", "target_id": koi, "care_type": "feed"})
expect("可以照顾不是自己负责区域的（只是排后面）", zhang, "POST", "/api/care/logs", 201, {"target_type": "zone_species", "target_id": cat, "care_type": "feed"})
expect("荷花不需要浇水", zhang, "POST", "/api/care/logs", 400, {"target_type": "zone_species", "target_id": lotus, "care_type": "water"})
expect("植物不能喂食", zhang, "POST", "/api/care/logs", 400, {"target_type": "zone_species", "target_id": willow, "care_type": "feed"})
expect("对象不存在", zhang, "POST", "/api/care/logs", 404, {"target_type": "zone_species", "target_id": "999999", "care_type": "water"})
expect("缺字段", zhang, "POST", "/api/care/logs", 400, {"target_type": "zone_species"})
expect("备注过长", zhang, "POST", "/api/care/logs", 400, {"target_type": "zone_species", "target_id": willow, "care_type": "water", "note": "长" * 201})
expect("绿植档案施肥", zhang, "POST", "/api/care/logs", 201, {"target_type": "plant", "target_id": "TEST-P1", "care_type": "fertilize"})
pm = q("SELECT mtype, operator FROM plant_maintenance WHERE pid = 'TEST-P1'")
check("  同步写入原养护台账 plant_maintenance", pm and pm[0][0] == "施肥", pm)
nd = q("SELECT next_fertilize_date FROM plant WHERE pid = 'TEST-P1'")
check("  顺延 next_fertilize_date", nd and nd[0][0] is not None, nd)
expect("管理员不能执行养护", admin, "POST", "/api/care/logs", 403, {"target_type": "zone_species", "target_id": willow, "care_type": "water"})
s, js, *_ = expect("最近记录", zhang, "GET", "/api/care/logs", 200)
check("  最近记录 4 条", len(js["items"]) == 4, len(js["items"]))
check("care_log 共 4 条", q("SELECT COUNT(*) FROM care_log")[0][0] == 4)
import datetime
now_cst = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=8))).replace(tzinfo=None)
t = datetime.datetime.strptime(js["items"][0]["created_at"], "%Y-%m-%d %H:%M:%S")
check("  记录时间按北京时间返回（与当前北京时间相差 < 5 分钟）", abs((now_cst - t).total_seconds()) < 300, (js["items"][0]["created_at"], now_cst))

print("== 数据大屏 ==")
s, js, *_ = expect("统计", admin, "GET", "/api/dashboard/stats", 200)
z = {x["id"]: x for x in js["zones"]}
check("  翠湖：植物 2 条、动物 6 只", z["cuihu_water"]["plant_records"] == 2 and z["cuihu_water"]["animal_qty"] == 6, z.get("cuihu_water"))
check("  近 7 天养护 4 次（今天）", js["care7d"]["total"] == 4 and js["care7d"]["days"][-1]["total"] == 4, js["care7d"])
check("  养护员人数 ≥ 4、养护员账号 2、人脸 2 条", js["people"]["maintainers"] >= 4 and js["people"]["maintainer_accounts"] == 2 and js["people"]["face_profiles"] == 2, js["people"])
check("  待养护数量 > 0", js["pending"]["total"] > 0, js["pending"])
check("  区域负责人：翠湖 → 张师傅", any(a["area_code"] == "MY-ECO-CUIHU" and a["maintainer_name"] == "张师傅" for a in js["areas"]), js["areas"])

if args.db_down_cmd and args.db_up_cmd:
    print("== 数据库不可用：503 且不泄露 JDBC 原始错误 ==")
    subprocess.run(args.db_down_cmd, shell=True)
    time.sleep(3)
    for c, path in [(anon, "/api/face/status"), (zhang, "/api/care/targets"), (admin, "/api/dashboard/stats"), (anon, "/api/zones/cuihu_water/species")]:
        s, js, text, _ = c.req("GET", path)
        leak = any(k in text for k in ["jdbc", "JDBC", "Communications link", "SQLException", "Exception", "localhost:3306", "Access denied"])
        check(f"{c.name}: {path} → 503 且无原始错误", s == 503 and not leak, f"{s} {text[:200]}")
    s, js, text, _ = fb.req("POST", "/api/face/identify", {"embedding": jitter(B, 93), "real": .8, "live": .9})
    check("刷脸在无库时 503", s == 503 and "jdbc" not in text.lower(), f"{s} {text[:200]}")
    subprocess.run(args.db_up_cmd, shell=True)
    for _ in range(30):
        try: q("SELECT 1"); break
        except Exception: time.sleep(1)
    time.sleep(2)
    s, *_ = anon.req("GET", "/api/face/status")
    check("数据库恢复后接口恢复 200", s == 200, s)

print(f"\n通过 {len(PASS)} 项，失败 {len(FAIL)} 项")
if FAIL:
    print("失败：\n  " + "\n  ".join(FAIL))
sys.exit(1 if FAIL else 0)
