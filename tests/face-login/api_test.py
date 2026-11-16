#!/usr/bin/env python3
"""
人脸登录 / 账号密码登录 / 三类账户 / 养护工作台 / 数据大屏 / 账号管理 —— 后端接口与权限测试（可重复执行，跑在 MariaDB / MySQL + Tomcat 上）。

用法：
    python3 tests/face-login/api_test.py [--base http://localhost:8080/demo1] [--db-down-cmd "..."] [--db-up-cmd "..."]
依赖：pymysql（检查数据库记录）。连接参数：--db-socket 或 --db-host/--db-port，账号 root/root，库 plant。
注意：会清空 face_profile、care_log 两张表，并写入 TEST- 前缀的测试数据（plant、zone_species、plant_area、maintainer 表，
以及 t_ 前缀的测试账号），只能对测试库执行。Tomcat 需加 -Dface.maxAttempts=500 -Dauth.maxAttempts=500（默认登录 / 识别限流会触发 429）。
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

    def login(self, user, pwd="123456", return_url=None):
        """人脸识别窗口里的账号密码登录：POST /api/auth/login（JSON）。"""
        for _ in range(3):   # 数据库刚重启时连接可能失败一次，重试
            s, js, _, _ = self.req("POST", "/api/auth/login", {"username": user, "password": pwd, "returnUrl": return_url})
            if s == 200: break
            time.sleep(1)
        assert s == 200 and js and js.get("ok"), (user, s, js)
        self.last_login = js
        return self

    def cookie(self, name="JSESSIONID"):
        return next((c.value for c in self.jar if c.name == name), None)


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
q("DELETE FROM admin_user WHERE username LIKE 't\\_%%'")                 # 上次运行“账号管理”测试新建的账号
q("UPDATE plant_area SET maintainer_id = NULL WHERE maintainer_id IN (SELECT id FROM maintainer WHERE name LIKE 'TEST-%%')")
q("DELETE FROM maintainer WHERE name LIKE 'TEST-%%'")
q("DELETE FROM plant_area WHERE area_code LIKE 'TEST-AREA-%%'")
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
for path in ["/care_workbench.jsp", "/data_screen.jsp", "/face_enroll.jsp", "/face_admin.jsp", "/account_admin.jsp"]:
    s, _, _, h = expect(f"未登录访问 {path} 跳登录", anon, "GET", path, 302)
    loc = h.get("Location") or ""
    check(f"  {path} 跳到人脸窗口的账号密码登录并带 returnUrl",
          "face_login.jsp?switch=1&mode=password&returnUrl=" + urllib.parse.quote(path, safe="") in loc, loc)
for path in ["/api/care/targets", "/api/dashboard/stats", "/api/face/profiles", "/api/face/accounts", "/api/accounts"]:
    expect("未登录", anon, "GET", path, 401)
expect("未登录录入人脸", anon, "POST", "/api/face/enroll", 401, {"embeddings": frames(A, 10), "real": .9, "live": .9})
expect("未登录养护", anon, "POST", "/api/care/logs", 401, {"target_type": "plant", "target_id": "TEST-P1", "care_type": "water"})
expect("未登录增删动植物", anon, "POST", "/api/zones/cuihu_water/species", 401, {"species_type": "plant", "species_key": "willow", "species_name": "垂柳", "x": 1, "z": 1})

for path in ["/care_workbench.jsp", "/data_screen.jsp", "/face_enroll.jsp", "/face_admin.jsp", "/account_admin.jsp"]:
    expect("访客只读", visitor, "GET", path, 403)
for path in ["/api/care/targets", "/api/dashboard/stats", "/api/face/profiles", "/api/accounts"]:
    expect("访客只读", visitor, "GET", path, 403)
expect("访客录入人脸", visitor, "POST", "/api/face/enroll", 403, {"embeddings": frames(A, 10), "real": .9, "live": .9})
expect("访客养护", visitor, "POST", "/api/care/logs", 403, {"target_type": "plant", "target_id": "TEST-P1", "care_type": "water"})
s, js, *_ = expect("访客增删动植物", visitor, "POST", "/api/zones/cuihu_water/species", 403, {"species_type": "plant", "species_key": "willow", "species_name": "垂柳", "x": 1, "z": 1})
expect("访客浏览板块动植物（只读 GET 允许）", visitor, "GET", "/api/zones/cuihu_water/species", 200)
for path in ["/ecohome.jsp", "/campus3d/pond/pond.html", "/campus3d/lawn/lawn.html"]:
    expect("访客浏览公开页面", visitor, "GET", path, 200)
# 旧版管理系统已整体删除
for path in ["/index.jsp", "/login.jsp", "/LoginServlet", "/admin.jsp", "/AdminDashboardServlet", "/map.jsp", "/searchplant.jsp",
             "/addplant.jsp", "/QueryServlet", "/animal.jsp", "/maintain.jsp", "/maintainer.jsp", "/ExportServlet", "/campus3d.jsp",
             "/greenkeeper.jsp", "/greenkeeper/index.html", "/AiPetServlet", "/test_cors.jsp", "/hello-servlet", "/UploadServlet"]:
    s, *_ = admin.req("GET", path)
    check(f"旧页面 / 接口已删除：{path} → 404", s == 404, s)

expect("管理员", admin, "GET", "/data_screen.jsp", 200)
expect("管理员", admin, "GET", "/api/dashboard/stats", 200)
expect("管理员", admin, "GET", "/face_enroll.jsp", 200)
expect("管理员：人脸信息管理", admin, "GET", "/face_admin.jsp", 200)
expect("绿植管理员：人脸信息管理", plant_admin, "GET", "/face_admin.jsp", 200)
expect("管理员默认不能进工作台", admin, "GET", "/care_workbench.jsp", 403)
expect("管理员默认不能进工作台", admin, "GET", "/api/care/targets", 403)
expect("绿植管理员属于管理员身份", plant_admin, "GET", "/api/dashboard/stats", 200)
expect("养护员", zhang, "GET", "/care_workbench.jsp", 200)
expect("养护员", zhang, "GET", "/api/care/targets", 200)
expect("养护员", zhang, "GET", "/face_enroll.jsp", 200)
expect("养护员不能进人脸信息管理", zhang, "GET", "/face_admin.jsp", 403)
expect("养护员不能看大屏", zhang, "GET", "/data_screen.jsp", 403)
expect("养护员不能看大屏", zhang, "GET", "/api/dashboard/stats", 403)
expect("养护员不能进账号管理", zhang, "GET", "/account_admin.jsp", 403)
expect("绿植管理员不能进账号管理", plant_admin, "GET", "/account_admin.jsp", 403)
expect("系统管理员：账号管理", admin, "GET", "/account_admin.jsp", 200)

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
expect("绿植管理员不能给其他管理员录入", plant_admin, "POST", "/api/face/enroll", 403, {"account_id": admin_id, "embeddings": frames(C, 30), "real": .9, "live": .9})
s, js, *_ = expect("管理员给养护员李录入 C", admin, "POST", "/api/face/enroll", 201, {"account_id": li_id, "embeddings": frames(C, 30), "real": .9, "live": .9})
li_profile = js["id"]
expect("同一张脸不能录到第二个账号", admin, "POST", "/api/face/enroll", 409, {"embeddings": frames(B, 40), "real": .9, "live": .9})
rows = q("SELECT account_id, role_code, dim, frames, LENGTH(embedding) FROM face_profile ORDER BY id")
check("face_profile 有 3 条，1024 维 float32、3 帧平均", len(rows) == 3 and all(r[2] == 1024 and r[3] == 3 and r[4] == 4096 for r in rows), rows)
s, js, *_ = expect("养护员看自己的人脸", zhang, "GET", "/api/face/profiles", 200)
check("  只有 1 条且不含特征", len(js["items"]) == 1 and "embedding" not in json.dumps(js), js)
expect("养护员不能看管理员的人脸", zhang, "GET", f"/api/face/profiles?account_id={admin_id}", 403)
s, js, *_ = expect("管理员看养护员李的人脸", admin, "GET", f"/api/face/profiles?account_id={li_id}", 200)
s, js, *_ = expect("系统管理员的人脸信息管理账号列表", admin, "GET", "/api/face/accounts", 200)
counts = {a["username"]: a["face_count"] for a in js["items"]}
check("  含管理员与养护员账号及人脸条数", counts.get("keeper_zhang") == 1 and counts.get("keeper_li") == 1 and counts.get("admin") == 1 and "plant_admin" in counts and js["scope"] == "all", js)
check("  列表不含特征向量", "embedding" not in json.dumps(js), "")
s, js, *_ = expect("绿植管理员的账号列表只含养护员和自己", plant_admin, "GET", "/api/face/accounts", 200)
check("  范围 maintainers", js["scope"] == "maintainers" and {a["username"] for a in js["items"]} >= {"keeper_zhang", "keeper_li", "plant_admin"} and "admin" not in {a["username"] for a in js["items"]}, js)
expect("养护员不能看账号列表", zhang, "GET", "/api/face/accounts", 403)
expect("养护员不能看某账号的记录（管理接口）", zhang, "GET", f"/api/face/accounts/{li_id}/profiles", 403)
s, js, *_ = expect("管理员看某账号的记录（管理接口）", admin, "GET", f"/api/face/accounts/{li_id}/profiles", 200)
check("  can_delete=true 且不含特征", js["can_delete"] and "embedding" not in json.dumps(js), js)
s, js, *_ = expect("养护员看自己的记录", zhang, "GET", "/api/face/profiles", 200)
check("  养护员 can_delete=false", js["can_delete"] is False, js)
_, js, *_ = anon.req("GET", "/api/face/status")
check("status.enrolled=true", js["enrolled"] is True, js)

fa = Client("刷脸A")
s, js, *_ = expect("识别 A（管理员）", fa, "POST", "/api/face/identify", 200, {"embedding": jitter(A, 99), "real": .8, "live": .9})
check("  进入管理员账号并跳数据大屏", js and js["user"]["username"] == "admin" and js["redirect"].endswith("/data_screen.jsp"), js)
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
zhang_profile = q("SELECT f.id FROM face_profile f JOIN admin_user u ON u.id = f.account_id WHERE u.username = 'keeper_zhang'")[0][0]
expect("养护员不能删自己的人脸（长期保存，只有管理员能删）", zhang, "DELETE", f"/api/face/profiles/{zhang_profile}", 403)
zhang_id = q("SELECT id FROM admin_user WHERE username = 'keeper_zhang'")[0][0]
expect("养护员不能删除自己账号的全部人脸", zhang, "DELETE", f"/api/face/accounts/{zhang_id}/profiles", 403)
expect("绿植管理员不能删系统管理员的人脸", plant_admin, "DELETE", f"/api/face/profiles/{admin_profile}", 403)
zc = Client("养护员张-退出")
zc.login("keeper_zhang"); zc.req("GET", "/LogoutServlet")
check("退出登录不会删除人脸", q("SELECT COUNT(*) FROM face_profile WHERE id = %s", zhang_profile)[0][0] == 1)
expect("访客不能删人脸", visitor, "DELETE", f"/api/face/profiles/{admin_profile}", 403)
expect("管理员删除养护员李的人脸", admin, "DELETE", f"/api/face/profiles/{li_profile}", 200)
expect("删除后不存在", admin, "DELETE", f"/api/face/profiles/{li_profile}", 404)
expect("删除后李刷脸失败", Client("刷脸C"), "POST", "/api/face/identify", 401, {"embedding": jitter(C, 94), "real": .8, "live": .9})
s, js, *_ = expect("管理员给养护员李重新录入 C", admin, "POST", "/api/face/enroll", 201, {"account_id": li_id, "embeddings": frames(C, 31), "real": .9, "live": .9})
s, js, *_ = expect("管理员删除养护员李的全部人脸", admin, "DELETE", f"/api/face/accounts/{li_id}/profiles", 200)
check("  删除 1 条、列表为空", js["deleted"] == 1 and js["items"] == [], js)
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

print("== 账号密码登录（/api/auth/login） ==")
check("管理员登录后跳数据大屏", admin.last_login["redirect"].endswith("/data_screen.jsp"), admin.last_login)
check("绿植管理员登录后跳数据大屏", plant_admin.last_login["redirect"].endswith("/data_screen.jsp"), plant_admin.last_login)
check("养护员登录后跳养护工作台", zhang.last_login["redirect"].endswith("/care_workbench.jsp"), zhang.last_login)
check("登录成功后旧的无盐 SHA-256 透明升级为 PBKDF2",
      all(r[0].startswith("pbkdf2_sha256$") for r in q("SELECT password_hash FROM admin_user WHERE username IN ('admin', 'plant_admin', 'keeper_zhang', 'keeper_li')")),
      q("SELECT username, LEFT(password_hash, 20) FROM admin_user"))
r1 = Client("返回地址1").login("keeper_zhang", return_url="/face_enroll.jsp")
check("returnUrl=/face_enroll.jsp：养护员登录后回到人脸录入", r1.last_login["redirect"].endswith("/face_enroll.jsp"), r1.last_login)
r2 = Client("返回地址2").login("keeper_zhang", return_url="/data_screen.jsp")
check("returnUrl 无权限时回默认主页", r2.last_login["redirect"].endswith("/care_workbench.jsp"), r2.last_login)
for bad in ["https://evil.example/x", "//evil.example/x", "/\\evil.example", "javascript:alert(1)", "/../WEB-INF/web.xml"]:
    rb = Client("返回地址坏").login("admin", return_url=bad)
    check(f"returnUrl={bad!r} 被拒绝，跳默认主页", rb.last_login["redirect"] == urllib.parse.urlparse(BASE).path + "/data_screen.jsp", rb.last_login)
fx = Client("会话固定")
fx.req("POST", "/api/face/guest")
sid_before = fx.cookie()
fx.login("keeper_li")
check("登录后会话 id 更换（防会话固定），访客标记清除", sid_before and fx.cookie() and fx.cookie() != sid_before, (sid_before, fx.cookie()))
_, me, *_ = fx.req("GET", "/api/me")
check("  /api/me 为养护员", me["user"]["group"] == "maintainer", me)
bad_c = Client("密码错误")
expect("密码错误", bad_c, "POST", "/api/auth/login", 401, {"username": "admin", "password": "wrong-1"})
expect("账号不存在（同样的提示）", bad_c, "POST", "/api/auth/login", 401, {"username": "no_such_user", "password": "wrong-1"})
expect("缺少密码", bad_c, "POST", "/api/auth/login", 400, {"username": "admin"})
s, js, *_ = bad_c.req("POST", "/api/auth/login", form={"username": "admin", "password": "123456"})
check("表单提交（非 JSON）→ 415（挡跨站表单登录）", s == 415, s)
_, me, *_ = bad_c.req("GET", "/api/me")
check("失败后仍未登录", me["user"]["group"] == "anonymous", me)
lock_user = "t_lock_%d" % int(time.time())
codes = [bad_c.req("POST", "/api/auth/login", {"username": lock_user, "password": "x%d" % i})[0] for i in range(9)]
check("同一账号连续失败 8 次后 429", codes[:8] == [401] * 8 and codes[8] == 429, codes)

print("== 账号管理（/api/accounts） ==")
expect("未登录", anon, "GET", "/api/accounts", 401)
expect("访客", visitor, "GET", "/api/accounts", 403)
expect("养护员", zhang, "GET", "/api/accounts", 403)
expect("绿植管理员", plant_admin, "GET", "/api/accounts", 403)
s, js, *_ = expect("系统管理员看账号列表", admin, "GET", "/api/accounts", 200)
names = {a["username"]: a for a in js["accounts"]}
check("  列表含 admin / keeper_zhang（关联档案、负责区域）且不含密码哈希",
      "admin" in names and names["keeper_zhang"]["maintainer_name"] == "张师傅" and {x["area_code"] for x in names["keeper_zhang"]["areas"]} == {"MY-ECO-CUIHU", "MY-ECO-LOTUS"}
      and "password_hash" not in json.dumps(js) and "pbkdf2" not in json.dumps(js), names.get("keeper_zhang"))
check("  可分配角色为 系统管理员 / 绿植管理员 / 养护管理员 / 养护人员", [r["code"] for r in js["roles"]] == ["SYSTEM_ADMIN", "PLANT_ADMIN", "MAINTENANCE_ADMIN", "MAINTAINER"], js["roles"])
s, *_ = admin.req("POST", "/api/accounts", form={"username": "x"})
check("非 JSON 写操作 → 415", s == 415, s)

stamp = str(int(time.time()))[-6:]
area_code = "TEST-AREA-" + stamp
q("INSERT INTO plant_area (area_code, area_name) VALUES (%s, %s)", area_code, "TEST 区域 " + stamp)
test_area = q("SELECT id FROM plant_area WHERE area_code = %s", area_code)[0][0]
keeper_name = "t_keeper_" + stamp
expect("弱密码被拒", admin, "POST", "/api/accounts", 400, {"username": keeper_name, "display_name": "测试养护员", "role_code": "MAINTAINER", "password": "123456", "new_maintainer": {"name": "TEST-养护员"}})
expect("养护员没有档案被拒", admin, "POST", "/api/accounts", 400, {"username": keeper_name, "display_name": "测试养护员", "role_code": "MAINTAINER", "password": "Green2026"})
expect("不能分配历史角色 SUPER_ADMIN", admin, "POST", "/api/accounts", 400, {"username": keeper_name, "display_name": "x", "role_code": "SUPER_ADMIN", "password": "Green2026"})
zhang_archive = names["keeper_zhang"]["maintainer_id"]
expect("档案已关联其他账号被拒", admin, "POST", "/api/accounts", 409, {"username": keeper_name, "display_name": "测试养护员", "role_code": "MAINTAINER", "password": "Green2026", "maintainer_id": zhang_archive})
s, js, *_ = expect("新建养护员（新建档案 + 负责区域）", admin, "POST", "/api/accounts", 200,
                   {"username": keeper_name, "display_name": "测试养护员", "role_code": "MAINTAINER", "password": "Green2026",
                    "new_maintainer": {"name": "TEST-养护员" + stamp, "phone": "13800000000"}, "area_ids": [test_area]})
keeper_id = js["id"]
row = q("SELECT u.role_code, u.maintainer_id, m.name, m.staff_no, LEFT(u.password_hash, 14) FROM admin_user u JOIN maintainer m ON m.id = u.maintainer_id WHERE u.id = %s", keeper_id)
check("  账号关联新档案（自动工号 WH-xxxx），密码为 PBKDF2", row and row[0][0] == "MAINTAINER" and row[0][2] == "TEST-养护员" + stamp and row[0][3].startswith("WH-") and row[0][4] == "pbkdf2_sha256$", row)
keeper_archive = row[0][1]
check("  负责区域写入 plant_area.maintainer_id", q("SELECT maintainer_id FROM plant_area WHERE id = %s", test_area)[0][0] == keeper_archive)
expect("重名被拒", admin, "POST", "/api/accounts", 409, {"username": keeper_name, "display_name": "x", "role_code": "PLANT_ADMIN", "password": "Green2026"})
tk = Client("新养护员").login(keeper_name, "Green2026")
check("新养护员登录后跳工作台", tk.last_login["redirect"].endswith("/care_workbench.jsp"), tk.last_login)
s, js, *_ = expect("新养护员工作台显示负责区域", tk, "GET", "/api/care/targets", 200)
check("  负责区域 = 测试区域", [a["area_code"] for a in js["me"]["areas"]] == [area_code], js["me"])
expect("没有通用后门密码：新账号用 123456 登录失败", Client("后门"), "POST", "/api/auth/login", 401, {"username": keeper_name, "password": "123456"})

admin_id = q("SELECT id FROM admin_user WHERE username = 'admin'")[0][0]
expect("不能停用自己", admin, "POST", f"/api/accounts/{admin_id}/status", 409, {"enabled": False})
expect("不能修改自己的角色", admin, "POST", f"/api/accounts/{admin_id}/role", 409, {"role_code": "PLANT_ADMIN"})
_, me, *_ = admin.req("GET", "/api/me")
check("  管理员仍然登录且角色未变", me["user"]["role_code"] == "SYSTEM_ADMIN", me)

s, js, *_ = expect("负责区域改为空", admin, "POST", f"/api/accounts/{keeper_id}/areas", 200, {"area_ids": []})
check("  plant_area 负责人清空", q("SELECT maintainer_id FROM plant_area WHERE id = %s", test_area)[0][0] is None)
expect("负责区域不存在", admin, "POST", f"/api/accounts/{keeper_id}/areas", 400, {"area_ids": [99999999]})
expect("再分配回测试区域", admin, "POST", f"/api/accounts/{keeper_id}/areas", 200, {"area_ids": [test_area]})

expect("停用新养护员", admin, "POST", f"/api/accounts/{keeper_id}/status", 200, {"enabled": False})
_, me, *_ = tk.req("GET", "/api/me")
check("  被停用账号的已登录会话立即失效", me["user"]["group"] == "anonymous", me)
expect("  被停用后不能登录", Client("停用后"), "POST", "/api/auth/login", 401, {"username": keeper_name, "password": "Green2026"})
expect("重新启用", admin, "POST", f"/api/accounts/{keeper_id}/status", 200, {"enabled": True})
tk = Client("新养护员2").login(keeper_name, "Green2026")

expect("重置密码：弱密码被拒", admin, "POST", f"/api/accounts/{keeper_id}/password", 400, {"password": "abc"})
expect("重置密码", admin, "POST", f"/api/accounts/{keeper_id}/password", 200, {"password": "NewPass2026"})
_, me, *_ = tk.req("GET", "/api/me")
check("  重置后旧会话失效", me["user"]["group"] == "anonymous", me)
expect("  旧密码失效", Client("旧密码"), "POST", "/api/auth/login", 401, {"username": keeper_name, "password": "Green2026"})
tk = Client("新密码").login(keeper_name, "NewPass2026")

expect("改为绿植管理员", admin, "POST", f"/api/accounts/{keeper_id}/role", 200, {"role_code": "PLANT_ADMIN"})
check("  改为管理员后解除档案关联（档案保留）", q("SELECT maintainer_id FROM admin_user WHERE id = %s", keeper_id)[0][0] is None
      and q("SELECT COUNT(*) FROM maintainer WHERE id = %s", keeper_archive)[0][0] == 1)
_, me, *_ = tk.req("GET", "/api/me")
check("  改角色后旧会话失效", me["user"]["group"] == "anonymous", me)
expect("改回养护人员但不给档案被拒", admin, "POST", f"/api/accounts/{keeper_id}/role", 400, {"role_code": "MAINTAINER"})
expect("改回养护人员并关联原档案", admin, "POST", f"/api/accounts/{keeper_id}/role", 200, {"role_code": "MAINTAINER", "maintainer_id": keeper_archive})
expect("不能分配未知角色", admin, "POST", f"/api/accounts/{keeper_id}/role", 409, {"role_code": "GUEST"})
admin_name = "t_admin_" + stamp
s, js, *_ = expect("新建系统管理员", admin, "POST", "/api/accounts", 200, {"username": admin_name, "display_name": "测试系统管理员", "role_code": "SYSTEM_ADMIN", "password": "Admin2026x"})
ta_id = js["id"]
ta = Client("新系统管理员").login(admin_name, "Admin2026x")
check("  新系统管理员登录后跳数据大屏", ta.last_login["redirect"].endswith("/data_screen.jsp"), ta.last_login)
expect("  新系统管理员能进账号管理", ta, "GET", "/api/accounts", 200)
expect("  停用新系统管理员（还有其他系统管理员）", admin, "POST", f"/api/accounts/{ta_id}/status", 200, {"enabled": False})
expect("  被停用的系统管理员会话失效", ta, "GET", "/api/accounts", 401)
expect("修改不存在的账号", admin, "POST", "/api/accounts/99999999/status", 404, {"enabled": False})

# 恢复测试库：删掉测试区域（测试账号 t_* 与 TEST- 档案在下次运行开头清理）
q("UPDATE plant_area SET maintainer_id = NULL WHERE id = %s", test_area)
q("DELETE FROM plant_area WHERE id = %s", test_area)

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
