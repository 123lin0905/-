#!/usr/bin/env python3
"""
人脸登录端到端测试（Playwright + Chromium 假摄像头）。

Chromium 启动参数 --use-fake-device-for-media-stream --use-file-for-fake-video-capture=<y4m> 把测试视频当作摄像头画面，
三段视频由 tests/face-login/make_videos.sh 用 human 仓库自带样例图生成（来源见 tests/face-login/samples/SOURCE.md）：
    personA.y4m  —— 人物 A（person-vlado*.jpg，3 张不同照片），录入为管理员 admin
    personB.y4m  —— 人物 B（ai-face.jpg），养护员 keeper_zhang 本人登录后录入
    stranger.y4m —— 陌生人（person-lexi.jpg、person-celeste.jpg），从未录入
验证：无人脸时提示录入 +“先不录入”进入访客只读；录入 A / B；A 刷脸进入管理员且只有管理员看到大屏入口；B 刷脸进入养护员、
看到工作台、能浇水 / 喂食且数据库有记录；陌生人识别失败；全程无未捕获 JS 异常；人脸相关页面不请求任何外部域名。
用法：python3 tests/face-login/e2e_face.py --media <y4m 目录> --out <截图目录> [--base http://localhost:8080/demo1]
注意：会清空 face_profile、care_log（只能对测试库执行）；需先跑过 api_test.py（建好翠湖的垂柳 / 锦鲤测试个体）或手动建好。
"""
import argparse, json, os, sys, time
from urllib.parse import urlparse

import pymysql
from playwright.sync_api import sync_playwright

ap = argparse.ArgumentParser()
ap.add_argument("--base", default="http://localhost:8080/demo1")
ap.add_argument("--media", default="/workspace/work/face_test/media")
ap.add_argument("--out", default="/workspace/work/face_test")
ap.add_argument("--db-socket", default="/tmp/maria.sock")
a = ap.parse_args()
BASE = a.base.rstrip("/")
HOST = urlparse(BASE).netloc
os.makedirs(a.out, exist_ok=True)


def q(sql, *p):
    c = pymysql.connect(unix_socket=a.db_socket, user="root", password="root", database="plant", charset="utf8mb4", autocommit=True)
    try:
        with c.cursor() as cur:
            cur.execute(sql, p)
            return cur.fetchall()
    finally:
        c.close()


PASS, FAIL, JS_ERRORS, CONSOLE_ERRORS, EXTERNAL = [], [], [], [], []


def check(name, cond, info=""):
    (PASS if cond else FAIL).append(name)
    print(("  ✔ " if cond else "  ✘ ") + name + ("" if cond else "  —— " + str(info)[:300]), flush=True)


def shot(page, name):
    path = os.path.join(a.out, name + ".png")
    page.screenshot(path=path)
    print("    📸", path, flush=True)


FACE_PAGES = ("face_login.jsp", "face_enroll.jsp", "care_workbench.jsp", "data_screen.jsp")


def watch(page, tag):
    page.on("pageerror", lambda e: JS_ERRORS.append(f"[{tag}] {page.url} {e}"))
    page.on("console", lambda m: m.type == "error" and CONSOLE_ERRORS.append(f"[{tag}] {page.url} {m.text[:200]}"))

    def on_req(r):
        host = urlparse(r.url).netloc
        if r.url.startswith("http") and host != HOST and any(p in page.url for p in FACE_PAGES):
            EXTERNAL.append(f"[{tag}] {page.url} → {r.url}")
    page.on("request", on_req)


def browser(p, video):
    return p.chromium.launch(args=[
        "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream",
        "--use-file-for-fake-video-capture=" + os.path.join(a.media, video),
        "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--no-sandbox"])


def new_page(br, tag):
    ctx = br.new_context(viewport={"width": 1366, "height": 860}, permissions=["camera"], locale="zh-CN")
    pg = ctx.new_page()
    pg.set_default_navigation_timeout(120000)   # 三维场景在软件渲染（SwiftShader）下很慢
    pg.on("dialog", lambda d: d.accept())
    watch(pg, tag)
    return ctx, pg


def password_login(pg, user):
    pg.goto(BASE + "/login.jsp")
    pg.fill("#username", user)
    pg.fill("#password", "123456")
    pg.click("button[type=submit]")
    pg.wait_for_load_state("load")


def enroll_self(pg, tag):
    pg.goto(BASE + "/face_enroll.jsp")
    pg.wait_for_selector("#profile-list li")
    pg.click("#btn-enroll")
    pg.wait_for_function("() => window.__enrollResult !== undefined", timeout=120000, polling=500)
    r = pg.evaluate("window.__enrollResult")
    shot(pg, tag)
    return r


def nav_ids(pg):
    return pg.evaluate("() => ['nav-dashboard','nav-workbench','nav-face-enroll','nav-face-login'].filter(id => document.getElementById(id))")


print("== 准备：清空人脸与养护记录 ==", flush=True)
q("DELETE FROM face_profile")
q("DELETE FROM care_log")
willow = q("SELECT id FROM zone_species WHERE zone_id = 'cuihu_water' AND species_key = 'willow' AND status = 'active' ORDER BY id DESC LIMIT 1")
koi = q("SELECT id FROM zone_species WHERE zone_id = 'cuihu_water' AND species_key = 'koi' AND status = 'active' ORDER BY id DESC LIMIT 1")
if not willow or not koi:
    print("缺少翠湖垂柳 / 锦鲤测试个体，请先运行 api_test.py"); sys.exit(2)
willow, koi = str(willow[0][0]), str(koi[0][0])

with sync_playwright() as p:
    # ---------------------------------------------------------------- 1. 无人脸 → 提示录入 → 先不录入 → 访客只读
    print("== 1. 系统里没有人脸：提示录入 +“先不录入人脸”进入访客只读 ==", flush=True)
    br = browser(p, "stranger.y4m")
    ctx, pg = new_page(br, "访客")
    pg.goto(BASE + "/")
    pg.wait_for_function("() => document.getElementById('face-login').dataset.state === 'no-faces'", timeout=30000)
    check("打开系统先出现人脸识别窗口（根路径即 face_login.jsp）", "face_login.jsp" in pg.url or pg.locator("#face-login").count() == 1, pg.url)
    check("提示“请先进行人脸录入”", pg.is_visible("#no-face-tip") and "请先进行人脸录入" in pg.inner_text("#no-face-tip"))
    check("有“先不录入人脸”按钮", pg.inner_text("#btn-guest").strip() == "先不录入人脸", pg.inner_text("#btn-guest"))
    check("保留账号密码登录入口", pg.is_visible("#btn-password"))
    shot(pg, "01_no_faces_prompt")
    pg.click("#btn-guest")
    pg.wait_for_url("**/ecohome.jsp", timeout=20000)
    pg.wait_for_selector("#eco-actions")
    ids = nav_ids(pg)
    check("访客进入生态主页，只有“人脸登录”入口", ids == ["nav-face-login"], ids)
    check("访客身份标识为“访客（只读）”", "访客（只读）" in pg.inner_text("#eco-actions"), pg.inner_text("#eco-actions"))
    pg.wait_for_timeout(6000)
    shot(pg, "02_visitor_ecohome")
    pg.goto(BASE + "/index.jsp")
    ids = nav_ids(pg)
    check("访客在管理系统首页看不到大屏 / 工作台 / 人脸录入入口", ids == ["nav-face-login"], ids)
    for path in ["/data_screen.jsp", "/care_workbench.jsp", "/face_enroll.jsp"]:
        r = pg.goto(BASE + path)
        check(f"访客直接访问 {path} 被服务端拦截 403", r.status == 403, r.status)
    shot(pg, "03_visitor_403")
    for scene, flag in [("/campus3d/pond/pond.html?zone=cuihu_water", "window.__seLoaded === true"), ("/campus3d/lawn/lawn.html?zone=central_lawn", "window.__seLoaded === true")]:
        pg.goto("about:blank")
        pg.goto(BASE + scene, wait_until="domcontentloaded")
        pg.wait_for_function("() => " + flag, timeout=120000, polling=500)
        hidden = pg.evaluate("() => { const b = document.getElementById('se-toggle'); return !b || b.hidden || getComputedStyle(b).display === 'none'; }")
        check(f"访客在 {scene.split('?')[0]} 看不到“管理动植物”按钮", hidden)
    shot(pg, "03b_visitor_lawn_no_edit")
    ctx.close(); br.close()

    # ---------------------------------------------------------------- 2. 录入 A（管理员）
    print("== 2. 管理员账号密码登录后录入人脸 A ==", flush=True)
    br = browser(p, "personA.y4m")
    ctx, pg = new_page(br, "录入A")
    password_login(pg, "admin")
    ids = nav_ids(pg)
    check("管理员登录后首页有大屏 + 人脸录入入口、无工作台", ids == ["nav-dashboard", "nav-face-enroll"], ids)
    r = enroll_self(pg, "04_enroll_A_admin")
    check("管理员录入人脸 A 成功（多帧平均）", r and r.get("ok") and r.get("frames", 0) >= 3, r)
    opts = pg.evaluate("() => Array.from(document.querySelectorAll('#target-select option')).map(o => o.textContent)")
    check("管理员可选择给养护员录入（下拉含 keeper_zhang / keeper_li）", any("keeper_zhang" in o for o in opts) and any("keeper_li" in o for o in opts), opts)
    ctx.close(); br.close()

    # ---------------------------------------------------------------- 3. 录入 B（养护员本人）
    print("== 3. 养护员 keeper_zhang 账号密码登录后录入人脸 B ==", flush=True)
    br = browser(p, "personB.y4m")
    ctx, pg = new_page(br, "录入B")
    password_login(pg, "keeper_zhang")
    ids = nav_ids(pg)
    check("养护员登录后首页有工作台 + 人脸录入入口、无大屏", ids == ["nav-workbench", "nav-face-enroll"], ids)
    r = enroll_self(pg, "05_enroll_B_maintainer")
    check("养护员录入人脸 B 成功", r and r.get("ok") and r.get("frames", 0) >= 3, r)
    check("养护员页面没有“录入给其他账号”的选项", pg.evaluate("document.querySelectorAll('#target-select option').length") == 1)
    ctx.close(); br.close()
    rows = q("SELECT u.username, f.frames, f.dim, f.thumbnail IS NOT NULL FROM face_profile f JOIN admin_user u ON u.id = f.account_id ORDER BY f.id")
    check("face_profile：admin、keeper_zhang 各 1 条（1024 维，含缩略图）", [r[0] for r in rows] == ["admin", "keeper_zhang"] and all(r[2] == 1024 and r[3] for r in rows), rows)

    # ---------------------------------------------------------------- 4. A 刷脸 → 管理员
    print("== 4. 喂 A：刷脸进入管理员 ==", flush=True)
    br = browser(p, "personA.y4m")
    ctx, pg = new_page(br, "刷脸A")
    pg.goto(BASE + "/")
    pg.wait_for_function("() => window.__faceResult !== undefined", timeout=90000, polling=300)
    r = pg.evaluate("window.__faceResult")
    check("A 识别为管理员 admin", r.get("ok") and r["user"]["username"] == "admin", r)
    shot(pg, "06_A_recognized")
    pg.wait_for_url("**/AdminDashboardServlet", timeout=20000)
    check("管理员刷脸后进入管理页（系统后台）", "AdminDashboardServlet" in pg.url, pg.url)
    pg.goto(BASE + "/ecohome.jsp")
    pg.wait_for_selector("#eco-actions a")
    ids = nav_ids(pg)
    check("生态主页：管理员看到大屏入口、看不到工作台", "nav-dashboard" in ids and "nav-workbench" not in ids, ids)
    pg.goto(BASE.rsplit("/", 1)[0] + pg.get_attribute("#nav-dashboard", "href"))   # 点导航入口（加载动画会挡住点击，直接按入口链接打开）
    pg.wait_for_function("() => window.__dsData !== undefined", timeout=30000)
    pg.wait_for_timeout(500)
    shot(pg, "07_admin_data_screen")
    r = pg.goto(BASE + "/care_workbench.jsp")
    check("管理员访问养护工作台被拦截 403（默认）", r.status == 403, r.status)
    pg.goto(BASE + "/campus3d/pond/pond.html?zone=cuihu_water", wait_until="domcontentloaded")
    pg.wait_for_function("() => window.__seLoaded === true", timeout=120000, polling=500)
    check("管理员在池塘板块看得到“管理动植物”按钮", pg.is_visible("#se-toggle"))
    pg.goto("about:blank")
    pg.goto(BASE + "/LogoutServlet")
    pg.wait_for_function("() => document.getElementById('face-login').dataset.state === 'ready'", timeout=30000)
    check("退出后回到人脸窗口但不自动识别（显示“开始人脸识别”）", pg.is_visible("#btn-start") and pg.evaluate("window.__faceResult === undefined"))
    shot(pg, "08_after_logout")
    ctx.close(); br.close()

    # ---------------------------------------------------------------- 5. B 刷脸 → 养护员 → 浇水 / 喂食
    print("== 5. 喂 B：刷脸进入养护员，浇水 / 喂食 ==", flush=True)
    br = browser(p, "personB.y4m")
    ctx, pg = new_page(br, "刷脸B")
    pg.goto(BASE + "/")
    pg.wait_for_function("() => window.__faceResult !== undefined", timeout=90000, polling=300)
    r = pg.evaluate("window.__faceResult")
    check("B 识别为养护员 keeper_zhang", r.get("ok") and r["user"]["username"] == "keeper_zhang", r)
    pg.wait_for_url("**/care_workbench.jsp", timeout=20000)
    pg.wait_for_function("() => window.__cwLoaded >= 1", timeout=30000)
    check("养护员刷脸后进入养护工作台", "care_workbench.jsp" in pg.url)
    check("工作台显示负责区域（翠湖水景、图书馆·荷花池）", "翠湖水景" in pg.inner_text("#cw-areas") and "荷花池" in pg.inner_text("#cw-areas"), pg.inner_text("#cw-areas"))
    shot(pg, "09_B_workbench_before")
    sel_w = f'article[data-type="zone_species"][data-id="{willow}"]'
    sel_k = f'article[data-type="zone_species"][data-id="{koi}"]'
    check("垂柳显示“需要浇水”", pg.get_attribute(sel_w + ' .cw-care[data-care="water"]', "data-state") == "due")
    n = pg.evaluate("window.__cwLoaded")
    pg.click(sel_w + ' .cw-act[data-care="water"]')
    pg.wait_for_function(f"() => window.__cwLoaded > {n}", timeout=30000)
    check("浇水后垂柳状态刷新为“正常”", pg.get_attribute(sel_w + ' .cw-care[data-care="water"]', "data-state") == "ok")
    last_at = pg.evaluate(f"() => window.__cwData.items.find(i => i.target_type === 'zone_species' && i.target_id === '{willow}').cares[0].last_at")
    check("最近记录与卡片的“上次时间”一致（都按北京时间）", last_at and last_at in pg.inner_text("#cw-logs"), (last_at, pg.inner_text("#cw-logs")[:120]))
    n = pg.evaluate("window.__cwLoaded")
    pg.click(sel_k + ' .cw-act[data-care="feed"]')
    pg.wait_for_function(f"() => window.__cwLoaded > {n}", timeout=30000)
    check("喂食后锦鲤状态刷新为“正常”", pg.get_attribute(sel_k + ' .cw-care[data-care="feed"]', "data-state") == "ok")
    pg.wait_for_timeout(300)
    shot(pg, "10_B_workbench_after_water_feed")
    rows = q("SELECT target_id, care_type, operator_name, maintainer_id FROM care_log ORDER BY id")
    check("数据库 care_log 有浇水、喂食两条记录（操作人张师傅）",
          [(r[0], r[1]) for r in rows] == [(willow, "water"), (koi, "feed")] and all(r[2] == "张师傅（养护员）" and r[3] == 1 for r in rows), rows)
    pg.goto(BASE + "/ecohome.jsp")
    pg.wait_for_selector("#eco-actions a")
    ids = nav_ids(pg)
    check("生态主页：养护员看到工作台入口、看不到大屏", "nav-workbench" in ids and "nav-dashboard" not in ids, ids)
    r = pg.goto(BASE + "/data_screen.jsp")
    check("养护员访问数据大屏被拦截 403", r.status == 403, r.status)
    shot(pg, "11_B_data_screen_403")
    pg.goto(BASE + "/campus3d/lawn/lawn.html?zone=central_lawn", wait_until="domcontentloaded")
    pg.wait_for_function("() => window.__seLoaded === true", timeout=120000, polling=500)
    check("养护员在中心草坪看得到“管理动植物”按钮", pg.is_visible("#se-toggle"))
    shot(pg, "12_B_lawn_edit_button")
    ctx.close(); br.close()

    # ---------------------------------------------------------------- 6. 陌生人
    print("== 6. 喂陌生人脸：识别失败 ==", flush=True)
    br = browser(p, "stranger.y4m")
    ctx, pg = new_page(br, "陌生人")
    pg.goto(BASE + "/")
    pg.wait_for_function("() => document.querySelector('#fl-steps span[data-s=detect].on') && document.getElementById('fl-video').videoWidth > 0", timeout=90000, polling=50)
    shot(pg, "13a_stranger_scanning")
    pg.wait_for_function("() => window.__faceResult !== undefined", timeout=90000, polling=300)
    r = pg.evaluate("window.__faceResult")
    check("陌生人识别失败（401 not_recognized）", r.get("ok") is False and r.get("status") == 401, r)
    check("失败后可重试 / 以访客进入 / 账号密码登录", pg.is_visible("#btn-retry") and pg.is_visible("#btn-guest") and pg.is_visible("#btn-password"))
    shot(pg, "13_stranger_rejected")
    me = pg.evaluate("fetch('%s/api/me').then(r => r.json())" % BASE)
    check("陌生人没有获得任何账号会话", me["user"]["group"] == "anonymous", me)
    pg.click("#btn-guest")
    pg.wait_for_url("**/ecohome.jsp", timeout=20000)
    check("陌生人可以以访客身份进入", "ecohome.jsp" in pg.url)
    ctx.close(); br.close()

benign = [e for e in CONSOLE_ERRORS if "status of 403" in e or "status of 401" in e]
# 原有页面 index.jsp / admin.jsp（AdminDashboardServlet）引用 Google Fonts 与 cdnjs 上的 ECharts，测试环境外网被代理拒绝（407），与本功能无关
legacy_cdn = [e for e in CONSOLE_ERRORS if "status of 407" in e and ("/index.jsp" in e or "/AdminDashboardServlet" in e)]
other_console = [e for e in CONSOLE_ERRORS if e not in benign and e not in legacy_cdn]
check("全程没有未捕获的 JS 异常（pageerror）", not JS_ERRORS, JS_ERRORS)
check("没有其他 console.error（预期的 401 / 403 资源报错除外）", not other_console, other_console)
check("人脸 / 工作台 / 大屏页面没有请求任何外部域名（模型与库全部本地）", not EXTERNAL, EXTERNAL)
print("\n原有页面外部 CDN 请求被测试环境代理拒绝（与本功能无关）：", len(legacy_cdn))
print("预期内的 401 / 403 控制台报错：", len(benign))
for e in benign: print("   ", e)
print(f"\n通过 {len(PASS)} 项，失败 {len(FAIL)} 项")
if FAIL: print("失败：\n  " + "\n  ".join(FAIL))
json.dump({"pass": PASS, "fail": FAIL, "js_errors": JS_ERRORS, "console_errors": CONSOLE_ERRORS, "external": EXTERNAL}, open(os.path.join(a.out, "e2e_result.json"), "w"), ensure_ascii=False, indent=1)
sys.exit(1 if FAIL else 0)
