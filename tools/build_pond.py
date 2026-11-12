# -*- coding: utf-8 -*-
"""把开源 koi-pond-garden/koi-pond.html 改造成校园池塘板块细节场景 pond.html，
并把池塘画风的共享部分抽成 campus3d/js/pond-style-core.js（校园全景 ecohome 与池塘共用）。

用法（在仓库根目录）：
    python3 tools/build_pond.py [koi-pond.html 路径]
上游文件：https://github.com/souranyp-stack/koi-pond-garden （MIT），提交 18213ec590e987f605cce6564471e6c0f9451d37 的
koi-pond.html（sha256 ab76bca6…f8f1a）。不传路径时依次尝试环境变量 KOI_SRC、tools/koi-pond-garden/koi-pond.html。
可重复执行：每次都从原始文件重新生成，所有替换都断言命中次数。改 pond.html / pond-style-core.js 时请改本脚本再生成。"""
import re, sys, os, hashlib
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = sys.argv[1] if len(sys.argv) > 1 else os.environ.get('KOI_SRC') or os.path.join(ROOT, 'tools', 'koi-pond-garden', 'koi-pond.html')
DST = os.path.join(ROOT, 'src', 'main', 'webapp', 'campus3d', 'pond', 'pond.html')
CORE = os.path.join(ROOT, 'src', 'main', 'webapp', 'campus3d', 'js', 'pond-style-core.js')
UPSTREAM_SHA256 = 'ab76bca6c8d3cb8e4185189d3f217665e7d6e1695cbd98f1da8c6024cc1f8f1a'
if not os.path.exists(SRC):
    print('找不到上游 koi-pond.html：', SRC)
    print('请先下载：git clone https://github.com/souranyp-stack/koi-pond-garden tools/koi-pond-garden && '
          'git -C tools/koi-pond-garden checkout 18213ec590e987f605cce6564471e6c0f9451d37')
    sys.exit(2)
raw = open(SRC, 'rb').read()
if hashlib.sha256(raw).hexdigest() != UPSTREAM_SHA256:
    print('!! 注意：上游 koi-pond.html 的 sha256 与预期不同，替换可能不再命中')
s = raw.decode('utf-8')

def rep(old, new, count=1):
    global s
    n = s.count(old)
    if n != count:
        print('!! 命中次数 %d != %d :: %r' % (n, count, old[:120])); sys.exit(1)
    s = s.replace(old, new)

def resub(pat, new, count=1, flags=re.S):
    global s
    s2, n = re.subn(pat, new, s, flags=flags)
    if n != count:
        print('!! 正则命中 %d != %d :: %r' % (n, count, pat[:120])); sys.exit(1)
    s = s2

# ---------------------------------------------------------------- 头部：来源与许可、中文标题、本地依赖
resub(r'<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="utf-8">',
      '''<!DOCTYPE html>
<!--
  校园池塘 · 板块细节 3D 场景（智慧校园绿化管理系统 · 生态主页第二阶段）
  ------------------------------------------------------------------------------
  本文件基于开源项目 Koi Pond Garden 改造：
    https://github.com/souranyp-stack/koi-pond-garden  （单文件 koi-pond.html）
    Copyright (c) 2026 Sourany Phomhome，MIT License，许可全文见同目录 LICENSE-koi-pond-garden.txt
  改造内容（本项目）：界面全中文；樱花/红枫改为垂柳/香樟，日式石灯笼改为校园庭院灯，
  木桥改为石拱桥，六角亭改为红柱中式小亭，去掉“鹿威し”竹筒声；增加夜晚（月光、庭院灯、萤火虫）；
  天气/季节/昼夜按北京时间与生态主页同步（/api/weather → Open-Meteo → 虚拟天气）；
  支持 ?zone=cuihu_water / library_lotus 两个板块共用；返回按钮、板块简介与“池塘生态”面板（见 pond-campus.js）。
  依赖全部本地化：../lib/three-r160.min.js（MIT）、../lib/dat.gui-0.7.9.min.js（Apache-2.0）。
-->
<html lang="zh-CN">
<head>
<meta charset="utf-8">''')
resub(r'<title>Koi Pond Garden</title>.*?<style>',
      '<title>校园池塘 · 板块细节 - 智慧校园虚拟生态</title>\n'
      '<meta name="description" content="天府学院绵阳校区智慧校园虚拟生态：池塘板块细节 3D 场景（基于 MIT 开源项目 Koi Pond Garden 改造）。">\n<style>')
rep('font: 13px/1.45 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }',
    'font: 13px/1.45 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", "WenQuanYi Micro Hei", sans-serif; }')
rep('</style>\n</head>', '</style>\n<link rel="stylesheet" href="pond-campus.css">\n</head>')
rep('<div id="loader"><h1>Koi Pond Garden</h1><div class="bar"><i id="loadbar"></i></div><p id="loadmsg">Starting</p></div>',
    '<div id="loader"><h1 id="loadtitle">校园池塘 · 板块细节</h1><div class="bar"><i id="loadbar"></i></div><p id="loadmsg">准备中…</p></div>')

# 引导卡片（中文，方向键移动，W 留给演示面板）
resub(r'<aside id="help" class="glass" aria-label="Guide">.*?</aside>', '''<aside id="help" class="glass hidden" aria-label="操作说明">
  <header><span class="help-title">操作说明</span>
    <button id="help-close" class="icon-btn" type="button" title="隐藏说明（I）" aria-label="隐藏说明">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button></header>
  <p class="lead">点击水面泛起涟漪，点击青蛙它会跳起来；右侧“池塘生态”清单可飞到对应物种。</p>
  <dl>
    <div><dt><kbd>W</kbd></dt><dd>演示面板</dd></div>
    <div><dt><kbd>C</kbd></dt><dd>镜头模式</dd></div>
    <div><dt><kbd>E</kbd></dt><dd>喂锦鲤</dd></div>
    <div><dt><kbd>G</kbd></dt><dd>抚摸锦鲤</dd></div>
    <div><dt><kbd>K</kbd></dt><dd>跟随锦鲤</dd></div>
    <div><dt><kbd>T</kbd></dt><dd>切换天气</dd></div>
    <div><dt><kbd>P</kbd></dt><dd>定格镜头</dd></div>
    <div><dt><kbd>O</kbd></dt><dd>暂停时间</dd></div>
    <div><dt><kbd>V</kbd></dt><dd>纯净画面</dd></div>
    <div><dt><kbd>M</kbd></dt><dd>静音</dd></div>
    <div><dt><kbd>H</kbd></dt><dd>高级参数</dd></div>
    <div><dt><kbd>I</kbd></dt><dd>隐藏说明</dd></div>
  </dl>
  <p class="foot">自由镜头 · <kbd>拖动</kbd> 转向 · <kbd>↑</kbd><kbd>↓</kbd><kbd>←</kbd><kbd>→</kbd> 移动 · <kbd>Q</kbd> <kbd>空格</kbd> 下降 / 上升 · <kbd>Shift</kbd> 加速</p>
</aside>''')
rep('title="Show the guide (I)" aria-label="Show the guide">?</button>', 'title="操作说明（I）" aria-label="操作说明">?</button>')
rep('<div id="cleanhint" class="glass">Clean view · press V or Esc to bring the controls back</div>',
    '<div id="cleanhint" class="glass">纯净画面 · 按 V 或 Esc 恢复界面</div>')
# 工具栏
for a, b in [
    ('aria-label="Scene controls"', 'aria-label="场景控制"'),
    ('title="Switch between cinematic and manual camera (C)"', 'title="电影镜头 / 自由镜头（C）"'),
    ('<span class="lbl">Manual camera</span>', '<span class="lbl">自由镜头</span>'),
    ('title="Hold the current shot (P)"', 'title="定格当前镜头（P）"'),
    ('<span class="lbl">Hold shot</span>', '<span class="lbl">定格</span>'),
    ('title="Freeze time (O)"', 'title="暂停时间（O）"'),
    ('<span class="lbl">Freeze time</span>', '<span class="lbl">暂停</span>'),
    ('title="Hide all overlays for screenshots (V, Esc to exit)"', 'title="隐藏界面便于截图（V，Esc 退出）"'),
    ('<span class="lbl">Clean view</span>', '<span class="lbl">纯净</span>'),
    ('title="Change the weather / season (T)"', 'title="切换天气（T，进入演示模式）"'),
    ('<span class="lbl">Sunny</span>', '<span class="lbl">天气</span>'),
    ('title="Mute / unmute (M)" aria-label="Mute"', 'title="静音 / 取消静音（M）" aria-label="静音"'),
    ('<span class="lbl">Sound</span>', '<span class="lbl">声音</span>'),
    ('title="Gently stroke a koi (G)"', 'title="轻轻抚摸一条锦鲤（G）"'),
    ('<span class="lbl">Stroke a koi</span>', '<span class="lbl">抚摸锦鲤</span>'),
    ('title="Feed the koi (E)"', 'title="喂锦鲤（E）"'),
    ('<span class="lbl">Feed the koi</span>', '<span class="lbl">喂锦鲤</span>'),
]:
    rep(a, b)

# 依赖本地化 + 校园脚本（板块参数要在主脚本之前确定）
rep('<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/0.160.0/three.min.js"></script>\n'
    '<script src="https://cdnjs.cloudflare.com/ajax/libs/dat-gui/0.7.9/dat.gui.min.js"></script>\n',
    '<script src="../lib/three-r160.min.js"></script>\n'
    '<script src="../lib/dat.gui-0.7.9.min.js"></script>\n'
    '<script src="../js/eco-weather.js"></script>\n'
    '<script src="../js/pond-style-core.js"></script>\n'
    '<script src="../js/pond-style.js"></script>\n'
    '<script src="pond-campus.js"></script>\n')

# ---------------------------------------------------------------- 参数：板块差异、画质分级
CP = 'window.CAMPUS_POND'
rep("  fishCount: 20,\n  quality: 'High',", "  fishCount: " + CP + ".fishCount,\n  quality: " + CP + ".quality,")
rep("  movie: true, letterbox: true, tourSeasons: false,", "  movie: true, letterbox: false, tourSeasons: false,")
rep("  bloomStrength: 0.3,", "  bloomStrength: " + CP + ".lowPower ? 0.22 : 0.3,")
rep("  ssao: true,\n  godRays: true,", "  ssao: !" + CP + ".lowPower,\n  godRays: !" + CP + ".lowPower,")
rep("  dof: true, fStop: 8,", "  dof: !" + CP + ".lowPower, fStop: 8,")
rep("  audio: true,             // starts", "  audio: !" + CP + ".test,      // starts")

# 像素比 ≤ 2（High 时按设备，最多 1.6；按设备档位再降）
rep("renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6));",
    "renderer.setPixelRatio(Math.min(window.devicePixelRatio, " + CP + ".maxDpr, 2));")
rep("renderer.setPixelRatio((q === 'High' ? Math.min(devicePixelRatio, 1.6) : 1) * RES.scale);",
    "renderer.setPixelRatio(Math.min(2, (q === 'High' ? Math.min(devicePixelRatio, " + CP + ".maxDpr) : Math.min(1.25, devicePixelRatio)) * RES.scale));   // 高：min(dpr,2)；低：min(dpr,1.25)，不再强制 ≤1")
rep("  sun.shadow.mapSize.set(q === 'High' ? 4096 : 2048, q === 'High' ? 4096 : 2048);",
    "  const smap = q === 'High' ? (" + CP + ".lowPower ? 2048 : 4096) : (" + CP + ".lowPower ? 1024 : 2048); sun.shadow.mapSize.set(smap, smap);")
# 水面涟漪模拟分辨率按设备降级
rep("const SIM = { N: 256, size: 13.4, x0: 0, z0: 0 };", "const SIM = { N: " + CP + ".simN, size: 13.4, x0: 0, z0: 0 };")
# 帧率低时自动降质量：先降分辨率 → Low → 关闭 SSAO/体积光/景深 → 再降像素
rep("""      else if (P.quality === 'High') { setQuality('Low'); toast('Frame time stayed over 22 ms — switched to Low quality'); }""",
    """      else if (P.quality === 'High') { setQuality('Low'); pondDegraded('帧率偏低，已自动切换到“流畅”画质'); }
      else if (P.ssao || P.godRays || P.dof || P.bloomStrength > 0) { P.ssao = P.godRays = P.dof = false; P.bloomStrength = 0; pondDegraded('帧率偏低，已关闭景深 / 体积光等特效'); }""")
# 自动降质：分辨率下限 0.75（之前 0.6 / 0.45 会明显发糊）；降质提示里带“恢复清晰”
rep("if (RES.scale > 0.62) { RES.scale = Math.max(0.6, RES.scale - 0.1); setQuality(P.quality, true); }",
    "if (RES.scale > 0.76 && P.quality === 'High') { RES.scale = Math.max(0.75, RES.scale - 0.1); setQuality(P.quality, true); }")
rep("function updatePerf(rawDt) {",
    "function pondDegraded(msg) { if (window.PondCampus && PondCampus.degraded) PondCampus.degraded(msg); else toast(msg); }\nfunction updatePerf(rawDt) {")

# ---------------------------------------------------------------- 夜空：月亮、星星
rep("uniform float uOvercast;\nuniform vec3 uOvercastCol;\nconst float pi",
    "uniform float uOvercast;\nuniform vec3 uOvercastCol;\nuniform float uNight;\nuniform vec3 uMoonDir;\nconst float pi")
rep("  gl_FragColor = vec4( col * uSkyScale, 1.0 );\n}`;",
    """  col *= uSkyScale;
  if (uNight > 0.001) {   // 校园夜空：深蓝渐变 + 星星 + 月亮，阴天/雨天时星月被云遮住
    float hy = clamp(direction.y, 0.0, 1.0);
    vec3 nsky = mix(vec3(0.020, 0.030, 0.060), vec3(0.004, 0.008, 0.022), pow(hy, 0.6));
    vec2 sp = direction.xz / (direction.y + 1.05) * 260.0;
    vec2 cell = floor(sp); float hs = h12(cell);
    float star = step(0.985, hs) * smoothstep(0.5, 0.0, length(fract(sp) - 0.5)) * (0.6 + 0.4 * sin(uTime * 2.0 + hs * 40.0));
    float clear = 1.0 - clamp(uOvercast * 1.25 + uCloudCover * 0.35, 0.0, 1.0);
    nsky += vec3(0.75, 0.8, 1.0) * star * 0.18 * smoothstep(0.02, 0.25, direction.y) * clear;
    float md = dot(direction, normalize(uMoonDir));
    nsky += vec3(0.95, 0.95, 0.85) * smoothstep(0.99955, 0.99975, md) * 2.4 * clear;
    nsky += vec3(0.35, 0.42, 0.6) * pow(max(md, 0.0), 60.0) * 0.12 * (0.4 + clear);
    nsky = mix(nsky, vec3(0.025, 0.028, 0.035), clamp(uOvercast, 0.0, 1.0) * 0.8);
    nsky = mix(nsky, vec3(0.006, 0.008, 0.006), smoothstep(0.0, -0.25, direction.y));
    col = mix(col, nsky, uNight);
  }
  gl_FragColor = vec4( col, 1.0 );
}`;""")
rep("  uCloudCover: { value: 0.55 }, uCloudBright: { value: 1.0 }, uOvercast: { value: 0 }, uOvercastCol: { value: new THREE.Color(1, 1, 1) },\n};",
    "  uCloudCover: { value: 0.55 }, uCloudBright: { value: 1.0 }, uOvercast: { value: 0 }, uOvercastCol: { value: new THREE.Color(1, 1, 1) },\n"
    "  uNight: { value: 0 }, uMoonDir: { value: new THREE.Vector3(-0.35, 0.72, -0.6).normalize() },\n};")

# ---------------------------------------------------------------- 太阳：按北京时间真实高度角；夜晚月光
rep("""function updateSun() {
  const f = clamp((P.timeOfDay - 6) / 13, 0, 1);
  const elev = Math.max(0.6 * DEG, Math.sin(Math.PI * f) * 62 * DEG);
  const az = (90 - 180 * f + P.sunAzimuth) * DEG;
  const d = new THREE.Vector3(Math.cos(elev) * Math.sin(az), Math.sin(elev), Math.cos(elev) * Math.cos(az)).normalize();
  const K = lerp(2600, 5500, smoothstep(1 * DEG, 32 * DEG, elev));
  const [r, g, b] = kelvinToRGB(K);
  const inten = 3.3 * smoothstep(-0.5 * DEG, 14 * DEG, elev) * WX.cur.sunMul;
  sun.color.setRGB(r, g, b, THREE.SRGBColorSpace);""",
"""let CAMPUS_EXPO = 1;          // 夜晚提高曝光（由 pond-campus.js 写入 window.CAMPUS_SUN）
function updateSun() {
  const CS = window.CAMPUS_SUN;
  const f = clamp((P.timeOfDay - 6) / 13, 0, 1);
  let elev = Math.max(0.6 * DEG, Math.sin(Math.PI * f) * 62 * DEG);
  let az = (90 - 180 * f + P.sunAzimuth) * DEG;
  const night = CS ? clamp(CS.night, 0, 1) : 0;
  if (CS) { elev = clamp(CS.elev, 0.6, 70) * DEG; az = (55 - (CS.az - 180)) * DEG; }
  let d = new THREE.Vector3(Math.cos(elev) * Math.sin(az), Math.sin(elev), Math.cos(elev) * Math.cos(az)).normalize();
  // 光照模型与校园全景共用（js/pond-style.js → pondSunLight）
  const LIT = pondSunLight(d, elev, night, WX.cur.sunMul, WX.cur.hemiMul, skyUniforms.uMoonDir.value);
  d = LIT.dir; elev = LIT.elev;
  const [r, g, b] = LIT.color, inten = LIT.intensity;
  skyUniforms.uNight.value = night;
  CAMPUS_EXPO = LIT.expo;
  sun.color.setRGB(r, g, b, THREE.SRGBColorSpace);""")
rep("  hemi.intensity = (0.1 + 0.22 * smoothstep(0, 30 * DEG, elev)) * WX.cur.hemiMul;",
    "  hemi.intensity = LIT.hemiIntensity;\n"
    "  hemi.color.setRGB(...LIT.hemiColor);")
rep("  skyUniforms.uCloudBright.value = (0.3 + 1.5 * smoothstep(0, 40 * DEG, elev)) * WX.cur.cloudBright;",
    "  skyUniforms.uCloudBright.value = LIT.cloudBrightK * WX.cur.cloudBright;")
rep("  u.uExposure.value = P.exposure; u.uVignette.value", "  u.uExposure.value = P.exposure * CAMPUS_EXPO; u.uVignette.value")
rep("bloomPrePass.uniforms.uExpo.value = P.exposure / 0.6;", "bloomPrePass.uniforms.uExpo.value = P.exposure * CAMPUS_EXPO / 0.6;")

# ---------------------------------------------------------------- 植物：樱花→垂柳，红枫→香樟（绿叶）
rep("  } else if (kind === 'sakura') {",
"""  } else if (kind === 'willow') {
    // 垂柳：从上往下垂的细长柳条，条上挂满狭长披针形叶
    g.lineCap = 'round';
    for (let k = 0; k < 15; k++) {
      const x0 = rr2(30, N - 30), sway = rr2(-40, 40), len = rr2(N * 0.55, N * 0.98);
      g.strokeStyle = hsl(rr2(55, 75), 30, 26); g.lineWidth = rr2(1.2, 2.2);
      g.beginPath(); g.moveTo(x0, 0); g.quadraticCurveTo(x0 + sway * 0.3, len * 0.5, x0 + sway, len); g.stroke();
      for (let t = 0.04; t < 1.0; t += rr2(0.035, 0.06)) {
        const yy = len * t, xx = x0 + sway * t * t, side = (k + Math.round(t * 40)) % 2 ? 1 : -1;
        ovate(xx + side * 7, yy + 4, rr2(2.6, 4.2), rr2(13, 20), side * rr2(0.25, 0.55), hsl(rr2(78, 100), rr2(42, 60), rr2(30, 48)), false);
      }
    }
  } else if (kind === 'sakura') {""")
rep("  TEX.sakura = leafCard('sakura');", "  TEX.sakura = leafCard('willow');   // 校园版：原樱花叶卡换成垂柳叶卡")
rep("""        addCard(LEAVES.maple, p, n, rr(0.42, 0.62), new THREE.Color().setRGB(rr(0.85, 1.1), rr(0.75, 1.0), rr(0.8, 1.0)));""",
    """        addCard(LEAVES.green, p, n, rr(0.42, 0.62), new THREE.Color().setRGB(rr(0.75, 0.95), rr(0.9, 1.1), rr(0.7, 0.9)));   // 香樟（原红枫）""")
rep("[-9, -4, 8, 'green'], [-8.8, 3.8, 6.5, 'maple'],", "[-9, -4, 8, 'green'], [-8.8, 3.8, 6.5, 'green'],")
rep("[8.7, -9.8, 7.5, 'maple'],", "[8.7, -9.8, 7.5, 'green'],")
rep("[-6.4, -7.6, 5.5, 'pink'],", "[-6.4, -7.6, 5.5, 'green'],")
# 全部改为垂柳（weeping），记录位置供“飞到物种”
rep("    OCC.push([x, z, 0.8]);\n  };\n  const sdfGradX", "    OCC.push([x, z, 0.8]); (WORLD.willows = WORLD.willows || []).push([x, z, h]);\n  };\n  const sdfGradX")
rep("""  sakuraTree(5.3, 2.6, 4.4, false);
  sakuraTree(-6.9, -1.0, 4.6, true);
  sakuraTree(-3.6, -10.4, 4.8, false);
  sakuraTree(5.4, -8.7, 4.2, false);
  sakuraTree(-6.6, 3.3, 3.8, false);
  sakuraTree(1.9, -12.2, 4.0, true);""",
"""  sakuraTree(5.3, 2.6, 4.6, true);       // 垂柳（原樱花）
  sakuraTree(-6.9, -1.0, 5.0, true);
  sakuraTree(-3.6, -10.4, 5.0, true);
  sakuraTree(5.4, -8.7, 4.6, true);
  sakuraTree(-6.6, 3.3, 4.2, true);
  sakuraTree(1.9, -12.2, 4.4, true);""")
# 柳条更长、更下垂
rep("children: [5, 3, 3, 2], childStart: [0.6, 0.3, 0.2, 0.2], spread: [1.05, 0.9, 0.5, 0.35], upBias: [0.45, 0.35, -0.4, -0.8],\n          lenDecay: 0.78,",
    "children: [5, 3, 4, 2], childStart: [0.6, 0.3, 0.2, 0.2], spread: [1.05, 0.9, 0.5, 0.35], upBias: [0.45, 0.35, -0.6, -1.0],\n          lenDecay: 0.86,")
# 柳叶卡沿柳条更密
rep("          addCard(LEAVES.sakura, p.add(randDir().multiplyScalar(0.05)), n, rr(0.22, 0.34), col());",
    "          addCard(LEAVES.sakura, p.add(randDir().multiplyScalar(0.05)), new V3(n.x, n.y * 0.15, n.z), rr(0.34, 0.5), col());")
rep("    const col = () => new THREE.Color().setRGB(rr(0.98, 1.06), rr(0.84, 0.94), rr(0.88, 0.98));\n    if (weeping) {",
    "    const col = () => new THREE.Color().setRGB(rr(0.85, 1.05), rr(0.92, 1.08), rr(0.8, 1.0));\n    if (weeping) {")
rep("        for (let t = 0.15; t <= 1.0; t += 0.1) {", "        for (let t = 0.1; t <= 1.0; t += 0.075) {")
# 季节：柳絮/落叶只在秋季飘落；水面红枫叶只在秋季
rep("    SAKURA.air.visible = SAKURA.rest.visible = !winter; SAKURA.off = winter;", "    SAKURA.air.visible = SAKURA.rest.visible = autumn; SAKURA.off = !autumn;")
rep("  if (PETALS.mesh) { PETALS.mesh.visible = !winter;", "  if (PETALS.mesh) { PETALS.mesh.visible = autumn;")
rep("      mesh.receiveShadow = true; setLayer(mesh, LAYER.SURFACE); scene.add(mesh); seasonal(mesh, 'SRA');",
    "      mesh.receiveShadow = true; setLayer(mesh, LAYER.SURFACE); scene.add(mesh); seasonal(mesh, isPetal ? 'SR' : 'A');")
# 夜晚蜻蜓不飞
rep("  DRAGON.off = !(L === 'S' || L === 'A');", "  DRAGON.off = !(L === 'S' || L === 'A') || (window.CAMPUS_SUN && CAMPUS_SUN.night > 0.5);")
# 季节字母可由校园预设指定
rep("const WX_LETTER = { Sunny: 'S', Rain: 'R', Autumn: 'A', Winter: 'W' };",
    "const WX_LETTER = { Sunny: 'S', Rain: 'R', Autumn: 'A', Winter: 'W' };\nconst WX_NAME_CN = { Sunny: '晴', Rain: '雨', Autumn: '秋', Winter: '冬雪' };")
rep("""  setBtnLabel('tb-weather', name); const b = $('tb-weather'); if (b) b.title = 'Weather: ' + name + ' · change the season (T)';
  toast({ Sunny: 'Sunny spring day', Rain: 'Rain (tsuyu)', Autumn: 'Autumn colours', Winter: 'Winter: snowfall' }[name]);""",
"""  const cn = (WX_PRESETS[name] && WX_PRESETS[name].label) || WX_NAME_CN[name] || name;
  setBtnLabel('tb-weather', cn); const b = $('tb-weather'); if (b) b.title = '天气：' + cn + ' · T 切换（进入演示模式）';
  if (!WX_PRESETS[name].silent) toast({ Sunny: '晴天', Rain: '下雨', Autumn: '秋色', Winter: '冬日飘雪' }[name] || ('天气：' + cn));""")
rep("function cycleWeather() { const k = Object.keys(WX_PRESETS); setWeather(k[(k.indexOf(WX.name) + 1) % k.length]); }",
    "function cycleWeather() { if (window.PondCampus) { PondCampus.cycleWeather(); return; } const k = ['Sunny', 'Rain', 'Autumn', 'Winter']; setWeather(k[(k.indexOf(WX.name) + 1) % k.length]); }")

# ---------------------------------------------------------------- 建筑：中式红柱小亭、石拱桥
rep("""    clearcoat: 0.3, clearcoatRoughness: 0.4, anisotropy: 0.4, envMapIntensity: 0.8 }, { key: 'rail', wood: true, vsPars: WOOD_VS, vsBegin: 'vBox = aBox; vHalf = aHalf;', fsPars: 'varying vec3 vBox;\\nvarying vec4 vHalf;\\n', fsRough: WOOD_ROUGH, uniforms: { uWeather: { value: 1.0 } } });
}""",
"""    clearcoat: 0.3, clearcoatRoughness: 0.4, anisotropy: 0.4, envMapIntensity: 0.8 }, { key: 'rail', wood: true, vsPars: WOOD_VS, vsBegin: 'vBox = aBox; vHalf = aHalf;', fsPars: 'varying vec3 vBox;\\nvarying vec4 vHalf;\\n', fsRough: WOOD_ROUGH, uniforms: { uWeather: { value: 1.0 } } });
  // 中式小亭：朱红漆柱与栏杆
  WORLD.redLacquer = physical({ color: 0x8e2418, roughness: 0.42, clearcoat: 0.55, clearcoatRoughness: 0.3, envMapIntensity: 0.8 }, { key: 'lacquer' });
}""")
rep("  meshOf(rail, WORLD.rail, LAYER.ABOVE);\n  buildRoof(C, floorY + postH - 0.02);",
    "  meshOf(rail, WORLD.redLacquer, LAYER.ABOVE);   // 红柱\n  buildRoof(C, floorY + postH - 0.02);")
rep("  const bronze = physical({ color: 0x8a6e45, map: TEX.boulder.map, roughness: 0.4, metalness: 0.75, envMapIntensity: 1.0 }, { key: 'bronze' });",
    "  const bronze = physical({ color: 0xb08a3e, map: TEX.boulder.map, roughness: 0.35, metalness: 0.8, envMapIntensity: 1.0 }, { key: 'bronze' });   // 宝顶")
rep("""  meshOf(deck, WORLD.wood, LAYER.ABOVE);
  meshOf(rail, WORLD.rail, LAYER.ABOVE);
  meshOf(piers, WORLD.wood, LAYER.BOTH);""",
"""  // 校园版：青石拱桥（石栏板、望柱）
  meshOf(deck, WORLD.granite, LAYER.ABOVE);
  meshOf(rail, WORLD.granite, LAYER.ABOVE);
  meshOf(piers, WORLD.granite, LAYER.BOTH);""")
rep("    buildBridge();\n    buildPavilion();", "    if (" + CP + ".bridge) buildBridge();\n    buildPavilion();")

# ---------------------------------------------------------------- 荷花池版：更多荷叶与荷花
rep("""  const LOT = [[-2.75, 0.3, 0.2, 0.34], [-3.0, -0.25, 0.16, 0.24], [-2.5, -0.6, 0.23, 0.42], [-2.95, 0.75, 0.13, 0.18]];""",
"""  const LOT = [[-2.75, 0.3, 0.2, 0.34], [-3.0, -0.25, 0.16, 0.24], [-2.5, -0.6, 0.23, 0.42], [-2.95, 0.75, 0.13, 0.18]];
  WORLD.lotusSpots = [];
  if (""" + CP + """.lotusExtra) {           // 图书馆·荷花池：成片荷叶（避开青蛙所在睡莲与锦鲤主游区中心）
    let guard = 0;
    while (LOT.length < 4 + """ + CP + """.lotusExtra && guard++ < 4000) {
      const x = rr(-3.4, 3.0), z = rr(-5.8, 5.6), d = sdf(x, z);
      if (d > -0.3 || d < -2.2 || Math.hypot(x + 1.05, z - 3.85) < 0.7 || Math.hypot(x - 0.3, z - 0.2) < 1.3) continue;
      if (LOT.some(([ox, oz]) => Math.hypot(x - ox, z - oz) < 0.36)) continue;
      LOT.push([x, z, rr(0.15, 0.25), rr(0.18, 0.5)]);
    }
  }""")
rep("""    WORLD.lotus.push({ leaf, base: leaf.rotation.clone(), ph: rand() * 6, h });
  });""", """    WORLD.lotus.push({ leaf, base: leaf.rotation.clone(), ph: rand() * 6, h });
    if (i >= 4) WORLD.lotusSpots.push([x, z, h]);
  });""")
rep("""  stalk(-2.2, -0.24, podBase, 0.0058, 'SRA');
  WORLD.lotusFlower = fl;""", """  stalk(-2.2, -0.24, podBase, 0.0058, 'SRA');
  WORLD.lotusFlower = fl;
  // 荷花池版：在新增荷叶旁再开一批荷花 / 花苞
  (WORLD.lotusSpots || []).forEach(([x, z, h], k) => {
    if (k % 2) return;
    const open = k % 4 === 0 ? rr(0.7, 1.0) : 0.35, f2 = flower(open), fx = x + rr(-0.12, 0.12), fz = z + rr(-0.12, 0.12), fy = WATER_Y + h + rr(0.12, 0.3);
    f2.position.set(fx, fy, fz); f2.rotation.set(rr(-0.15, 0.15), rand() * 6, rr(-0.15, 0.15)); f2.scale.setScalar(rr(0.85, 1.05));
    setLayer(f2, LAYER.ABOVE); scene.add(f2); seasonal(f2, 'SR'); stalk(fx, fz, new V3(fx, fy - 0.03, fz), 0.006);
  });""")

# ---------------------------------------------------------------- 日式石灯笼 → 校园庭院灯 + 长椅
resub(r"const LANTERNS = \[\];\nfunction buildLanterns\(\) \{.*?\n\}\nfunction updateLanterns\(\) \{.*?\n\}\n",
r"""const LANTERNS = [];
const LAMPS = { lights: [], heads: [] };
// 校园庭院灯（深灰金属灯杆 + 乳白灯罩，夜晚亮起并照亮周围）与木质长椅，替代原日式石灯笼
function buildLanterns() {
  const metal = physical({ color: 0x2a2f33, roughness: 0.45, metalness: 0.7, envMapIntensity: 0.8 }, { key: 'lampmetal' });
  const glow = new THREE.MeshBasicMaterial({ color: 0xffd9a0 });
  const spots = (window.CAMPUS_POND.lampSpots || [[-4.3, -3.3], [3.65, -6.9], [3.2, 5.6], [-3.6, 5.2]]).filter(([x, z]) => sdf(x, z) > 0.5);
  spots.forEach(([x, z], i) => {
    const gy = terrainHeight(x, z), parts = [];
    parts.push(new THREE.CylinderGeometry(0.11, 0.13, 0.12, 16).translate(0, 0.06, 0));
    parts.push(new THREE.CylinderGeometry(0.035, 0.05, 2.1, 12).translate(0, 1.17, 0));
    parts.push(new THREE.CylinderGeometry(0.16, 0.05, 0.08, 16).translate(0, 2.25, 0));
    parts.push(new THREE.CylinderGeometry(0.2, 0.2, 0.03, 20).translate(0, 2.62, 0));
    parts.push(new THREE.ConeGeometry(0.2, 0.12, 20).translate(0, 2.7, 0));
    const m = new THREE.Mesh(mergeGeos(parts), metal); m.position.set(x, gy - 0.02, z); m.castShadow = true; m.receiveShadow = true;
    setLayer(m, LAYER.ABOVE); scene.add(m);
    const head = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.13, 0.33, 20), glow.clone()); head.position.set(x, gy - 0.02 + 2.45, z);
    setLayer(head, LAYER.ABOVE); scene.add(head); LANTERNS.push(head);
    if (i < 3) {   // 只给前三盏配真实点光源，控制着色器开销
      const L = new THREE.PointLight(0xffc98a, 0, 7.5, 1.6); L.position.set(x, gy + 2.35, z); scene.add(L); LAMPS.lights.push(L);
    }
    // 灯旁一张校园长椅（面向水面）
    const sx = x - sdfGrad(x, z, 'x') * 0.9, sz = z - sdfGrad(x, z, 'z') * 0.9;
    if (sdf(sx, sz) > 0.35) buildBench(sx, sz, Math.atan2(-sdfGrad(x, z, 'x'), -sdfGrad(x, z, 'z')));
  });
}
function sdfGrad(x, z, ax) { return ax === 'x' ? (sdf(x + 0.05, z) - sdf(x - 0.05, z)) / 0.1 : (sdf(x, z + 0.05) - sdf(x, z - 0.05)) / 0.1; }
function buildBench(x, z, yaw) {
  const gy = terrainHeight(x, z), wood = [], iron = [];
  for (let k = 0; k < 4; k++) { const g = woodBox(1.5, 0.035, 0.085); g.translate(0, 0.43, -0.16 + k * 0.105); wood.push(g); }
  for (let k = 0; k < 3; k++) { const g = woodBox(1.5, 0.08, 0.03); g.rotateX(-0.22); g.translate(0, 0.58 + k * 0.1, -0.24 - k * 0.022); wood.push(g); }
  for (const sx of [-0.62, 0.62]) {
    iron.push(new THREE.BoxGeometry(0.05, 0.43, 0.05).translate(sx, 0.215, 0.12), new THREE.BoxGeometry(0.05, 0.8, 0.05).translate(sx, 0.4, -0.22),
      new THREE.BoxGeometry(0.05, 0.04, 0.42).translate(sx, 0.41, -0.05), new THREE.BoxGeometry(0.05, 0.04, 0.36).translate(sx, 0.63, -0.04));
  }
  const grp = new THREE.Group();
  const a = new THREE.Mesh(mergeGeos(wood), WORLD.rail); a.castShadow = a.receiveShadow = true; grp.add(a);
  const b = new THREE.Mesh(mergeGeos(iron), physical({ color: 0x23282b, roughness: 0.5, metalness: 0.6 }, { key: 'benchiron' })); b.castShadow = true; grp.add(b);
  grp.position.set(x, gy - 0.01, z); grp.rotation.y = yaw; setLayer(grp, LAYER.ABOVE); scene.add(grp);
  (WORLD.benches = WORLD.benches || []).push([x, z]);
}
function updateLanterns() {
  const dusk = 1 - smoothstep(4 * DEG, 18 * DEG, sunState.elev);
  const N = window.CAMPUS_SUN ? CAMPUS_SUN.night : 0, on = Math.max(N, dusk * 0.6);
  for (const L of LANTERNS) L.material.color.setRGB(0.25 + 4.5 * on, 0.22 + 3.4 * on, 0.18 + 1.9 * on);
  for (const L of LAMPS.lights) L.intensity = 9 * on;
}
""")
# 萤火虫（夜晚、非冬季）
rep("// Cherry petals drifting on the surface", r"""// 萤火虫：夜晚在岸边草丛与水面上方缓缓飘动、明灭
const FIREFLY = { n: 70, pts: null, base: [] };
function buildFireflies() {
  const pos = new Float32Array(FIREFLY.n * 3), ph = new Float32Array(FIREFLY.n);
  for (let i = 0; i < FIREFLY.n; i++) {
    const sh = shoreAt(rand() * POLY_LEN), d = rr(-0.6, 1.6);
    FIREFLY.base.push([sh.x + sh.nx * d, rr(0.15, 1.3), sh.z + sh.nz * d, rand() * 6.28, rr(0.4, 1.0)]);
    ph[i] = rand() * 6.28;
  }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('aPh', new THREE.BufferAttribute(ph, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: SH.uTime, uOn: { value: 0 }, uScale: { value: innerHeight * 0.5 } },
    vertexShader: 'attribute float aPh; uniform float uTime; uniform float uScale; varying float vA; void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * mv; vA = 0.35 + 0.65 * pow(0.5 + 0.5 * sin(uTime * 2.3 + aPh * 3.0), 3.0); gl_PointSize = clamp(0.05 * uScale / -mv.z, 1.5, 14.0); }',
    fragmentShader: 'uniform float uOn; varying float vA; void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d); gl_FragColor = vec4(vec3(2.6, 3.2, 0.9) * a * vA * uOn, a * vA * uOn); }',
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  FIREFLY.pts = new THREE.Points(geo, mat); FIREFLY.pts.frustumCulled = false; setLayer(FIREFLY.pts, LAYER.ABOVE); scene.add(FIREFLY.pts);
}
function updateFireflies(t) {
  if (!FIREFLY.pts) return;
  const N = window.CAMPUS_SUN ? CAMPUS_SUN.night : 0, winter = WX.applied && WX_LETTER[WX.applied] === 'W';
  const on = winter ? 0 : smoothstep(0.35, 0.85, N) * (1 - clamp(SH.uRain.value, 0, 1) * 0.8);
  FIREFLY.pts.material.uniforms.uOn.value = on; FIREFLY.pts.visible = on > 0.01;
  if (!FIREFLY.pts.visible) return;
  FIREFLY.pts.material.uniforms.uScale.value = renderer.domElement.height * 0.5;
  const a = FIREFLY.pts.geometry.attributes.position;
  for (let i = 0; i < FIREFLY.n; i++) {
    const [x, y, z, p, s] = FIREFLY.base[i];
    a.setXYZ(i, x + Math.sin(t * 0.31 * s + p) * 0.5, y + Math.sin(t * 0.7 * s + p * 2) * 0.18, z + Math.cos(t * 0.27 * s + p) * 0.5);
  }
  a.needsUpdate = true;
}

// Cherry petals drifting on the surface""")
rep("    buildLanterns();\n", "    buildLanterns();\n    buildFireflies();\n")
rep("  updateLanterns();\n", "  updateLanterns();\n  updateFireflies(t);\n")
# 去掉日式“鹿威し”竹筒敲击声
rep("if (AUDIO.nextShishi < 0) { AUDIO.nextShishi = rr(45, 80); if (!STATE.under) shishiOdoshi(); }",
    "if (AUDIO.nextShishi < 0) { AUDIO.nextShishi = 1e9; }   // 校园版：去掉日式竹筒“鹿威し”敲击声")

# ---------------------------------------------------------------- 键盘：W 留给演示面板，自由镜头用方向键
rep("    if (e.code === 'KeyF' || e.code === 'KeyC') toggleCameraMode();",
    "    if (e.code === 'KeyW' && window.PondCampus) { PondCampus.toggleDemo(); return; }\n"
    "    if (e.code === 'Escape' && window.PondCampus) PondCampus.toggleDemo(false);\n"
    "    if (e.code === 'KeyF' || e.code === 'KeyC') toggleCameraMode();")
rep("    if (e.code === 'KeyH') { const d = document.querySelector('.dg.ac'); if (d) d.style.display = d.style.display === 'none' ? '' : 'none'; }",
    "    if (e.code === 'KeyH') { const d = document.querySelector('.dg.ac'); if (d) { const show = d.style.display === 'none' || !d.classList.contains('shown'); d.classList.toggle('shown', show); d.style.display = show ? '' : 'none'; } }")
rep("  if (k.KeyW || k.ArrowUp) camera.position.addScaledVector(_fwd, sp);\n  if (k.KeyS || k.ArrowDown) camera.position.addScaledVector(_fwd, -sp);\n  if (k.KeyA || k.ArrowLeft) camera.position.addScaledVector(_right, -sp);\n  if (k.KeyD || k.ArrowRight) camera.position.addScaledVector(_right, sp);",
    "  if (k.ArrowUp) camera.position.addScaledVector(_fwd, sp);\n  if (k.ArrowDown) camera.position.addScaledVector(_fwd, -sp);\n  if (k.ArrowLeft) camera.position.addScaledVector(_right, -sp);\n  if (k.ArrowRight) camera.position.addScaledVector(_right, sp);")

# ---------------------------------------------------------------- 文案：提示、镜头名、电影字幕、HUD、加载
for a, b in [
    ("toast(`Fly speed ×${CTRL.speedMul.toFixed(2)}`)", "toast(`飞行速度 ×${CTRL.speedMul.toFixed(2)}`)"),
    ("toast('Camera held for your screenshot · P to release')", "toast('已定格镜头便于截图 · 按 P 解除')"),
    ("setBtnLabel('tb-hold', v ? 'Shot held' : 'Hold shot');", "setBtnLabel('tb-hold', v ? '已定格' : '定格');"),
    ("toast(v ? 'Shot held · camera will not move (P to release)' : 'Camera released')", "toast(v ? '镜头已定格（P 解除）' : '镜头已解除定格')"),
    ("setBtnLabel('tb-freeze', v ? 'Time frozen' : 'Freeze time');", "setBtnLabel('tb-freeze', v ? '已暂停' : '暂停');"),
    ("toast(v ? 'Time frozen · O to resume' : 'Time resumed')", "toast(v ? '时间已暂停 · 按 O 继续' : '时间继续')"),
    ("b.setAttribute('aria-label', m ? 'Unmute' : 'Mute'); b.title = (m ? 'Unmute' : 'Mute') + ' (M)'; setBtnLabel('tb-sound', m ? 'Muted' : 'Sound');",
     "b.setAttribute('aria-label', m ? '取消静音' : '静音'); b.title = (m ? '取消静音' : '静音') + '（M）'; setBtnLabel('tb-sound', m ? '已静音' : '声音');"),
    ("setBtnLabel('tb-cam', P.cameraMode === 'Cinematic' ? 'Manual camera' : 'Cinematic camera');", "setBtnLabel('tb-cam', P.cameraMode === 'Cinematic' ? '自由镜头' : '电影镜头');"),
    ("toast(P.cameraMode === 'Manual' ? 'Manual camera: drag to look · WASD move · Q down · Space up · Shift faster · wheel speed' : P.cameraMode === 'Follow koi' ? 'Following a koi (K for the next fish)' : P.cameraMode === 'Follow turtle' ? 'Following the turtle' : 'Cinematic camera');",
     "toast(P.cameraMode === 'Manual' ? '自由镜头：拖动转向 · 方向键移动 · Q 下降 · 空格上升 · Shift 加速 · 滚轮调速' : P.cameraMode === 'Follow koi' ? '跟随锦鲤（按 K 换一条）' : P.cameraMode === 'Follow turtle' ? '跟随乌龟' : '电影镜头（自动巡游）');"),
    ("toast('Feeding the koi')", "toast('正在喂锦鲤')"),
    ("toast('A koi is coming to your hand… drag across it to stroke')", "toast('一条锦鲤游向你的手……在它身上拖动来抚摸')"),
    ("progress(0.08, 'Water ripple normals')", "progress(0.08, '生成水面波纹')"),
    ("progress(0.16, 'Caustic patterns')", "progress(0.16, '生成水下焦散')"),
    ("progress(0.26, 'Granite, boulders and moss')", "progress(0.26, '生成石材与苔藓')"),
    ("progress(0.34, 'Pond gravel')", "progress(0.34, '铺设池底卵石')"),
    ("progress(0.4, 'Moss lawn')", "progress(0.4, '铺设草地')"),
    ("progress(0.48, 'Cedar, bark and roof tiles')", "progress(0.48, '生成木纹、树皮与瓦片')"),
    ("progress(0.56, 'Foliage cards')", "progress(0.56, '生成枝叶')"),
    ("progress(0.02, 'Tracing the pond outline')", "progress(0.02, '勾勒池岸轮廓')"),
    ("progress(0.6, 'Shaping terrain and basin')", "progress(0.6, '塑造地形与池底')"),
    ("progress(0.66, 'Setting stones')", "progress(0.66, '砌筑驳岸石')"),
    ("progress(0.72, 'Building the bridge and pavilion')", "progress(0.72, '搭建石桥与小亭')"),
    ("progress(0.8, 'Planting the garden')", "progress(0.8, '种植垂柳与花木')"),
    ("progress(0.86, 'Filling the pond')", "progress(0.86, '注水、放养锦鲤')"),
    ("progress(0.93, 'Compiling shaders')", "progress(0.93, '编译着色器（首次较慢）')"),
    ("progress(1, 'Ready')", "progress(1, '就绪')"),
    ("$('loadmsg').textContent = 'Failed to start: ' + err.message;", "$('loadmsg').textContent = '场景启动失败：' + err.message;"),
    ("${P.quality} · ${STATE.under ? 'underwater ' + STATE.depth.toFixed(2) + ' m' : 'above water'} · ${P.cameraMode}`",
     "画质 ${P.quality === 'High' ? '高' : '低'} · ${STATE.under ? '水下 ' + STATE.depth.toFixed(2) + ' 米' : '水面以上'} · ${{ Cinematic: '电影镜头', Manual: '自由镜头', 'Follow koi': '跟随锦鲤', 'Follow turtle': '跟随乌龟' }[P.cameraMode] || P.cameraMode}`"),
    ("{ cap: 'The garden from above', T: 13,", "{ cap: window.CAMPUS_POND.zoneName || '池塘全景', T: 13,"),
    ("{ cap: 'The koi pond', T: 11,", "{ cap: window.CAMPUS_POND.lotusExtra ? '满池荷叶' : '翠湖池塘', T: 11,"),
    ("{ cap: 'Koi', T: 11,", "{ cap: '锦鲤', T: 11,"),
    ("{ cap: 'Sacred lotus (hasu)', T: 10,", "{ cap: '荷花', T: 10,"),
    ("{ cap: 'Bamboo grove — Phyllostachys', T: 12,", "{ cap: '竹林', T: 12,"),
    ("{ cap: 'Weeping cherry (shidare-zakura)', T: 10,", "{ cap: '垂柳依依', T: 10,"),
    ("{ cap: 'Cherry blossom', T: 11,", "{ cap: '岸边垂柳', T: 11,"),
    ("{ cap: 'Pond frog', T: 10,", "{ cap: '青蛙', T: 10,"),
    ("{ cap: 'Yellow-bellied slider', T: 9,", "{ cap: '晒背的乌龟', T: 9,"),
    ("{ cap: 'Beneath the surface', T: 13,", "{ cap: '水下世界', T: 13,"),
]:
    rep(a, b)

# 近景视角：改中文名，并补充校园物种视角（供“池塘生态”清单飞行）
rep("""const VIEWS = {
  'Frog':""", """const VIEWS = {
  '垂柳': () => { const w = (WORLD.willows || [[-6.9, -1.0, 5]])[1] || WORLD.willows[0], g = terrainHeight(w[0], w[1]); return [new THREE.Vector3(w[0] + 2.6, g + 1.5, w[1] - 2.2), new THREE.Vector3(w[0], g + w[2] * 0.45, w[1])]; },
  '鸢尾（花菖蒲）': () => { const c = (WORLD.irisClumps || [{ x: -2, z: 4 }])[0]; return [new THREE.Vector3(c.x - c.nx * 0.9, 0.55, c.z - c.nz * 0.9), new THREE.Vector3(c.x, 0.35, c.z)]; },
  '芒草': () => { const c = (WORLD.grass || [[3, 4]])[0]; const g = terrainHeight(c[0], c[1]); return [new THREE.Vector3(c[0] - 1.0, g + 0.9, c[1] + 1.0), new THREE.Vector3(c[0], g + 0.4, c[1])]; },
  '水杉': () => [new THREE.Vector3(-3.5, 2.2, -9.5), new THREE.Vector3(-7, 6.5, -17.5)],
  '黑松': () => [new THREE.Vector3(2.8, 2.0, 1.4), new THREE.Vector3(5.3, 3.4, -1.3)],
  '杜鹃': () => [new THREE.Vector3(2.4, 1.0, 2.6), new THREE.Vector3(4.2, 0.4, 1.5)],
  '石拱桥': () => [new THREE.Vector3(0.9, 1.05, -1.4), new THREE.Vector3(0.0, 0.7, -3.55)],
  '六角亭': () => [new THREE.Vector3(2.6, 2.0, -4.2), new THREE.Vector3(PAVILION.x, 1.8, PAVILION.z)],
  '庭院灯与长椅': () => { const b = (WORLD.benches || [[-4, -3]])[0], g = terrainHeight(b[0], b[1]); return [new THREE.Vector3(b[0] + 1.6, g + 1.2, b[1] + 1.6), new THREE.Vector3(b[0], g + 0.6, b[1])]; },
  'Frog':""")
for a, b in [("'Frog':", "'青蛙':"), ("'Dragonfly':", "'蜻蜓':"), ("'Bamboo grove':", "'竹林':"), ("'Wisteria arbor':", "'紫藤架':"),
             ("'Hydrangeas':", "'绣球':"), ("'Spider lilies':", "'石蒜':"), ("'Peonies':", "'牡丹':"), ("'Camellia':", "'山茶':"),
             ("'Water lilies':", "'睡莲':"), ("'Bridge timber':", "'桥面':"), ("'Stone & moss':", "'驳岸石与苔藓':"), ("'Lotus':", "'荷花':"),
             ("'Underwater':", "'水下':"), ("'Lily roots (underwater)':", "'睡莲根茎（水下）':"), ("'Waterfall':", "'假山跌水':")]:
    rep(a, b)
rep("  if (name === 'Turtle') { P.cameraMode = 'Follow turtle';", "  if (name === 'Turtle' || name === '乌龟') { P.cameraMode = 'Follow turtle';")
rep("  toast(name);\n}", "  toast(name);\n  return true;\n}")
# 记录芒草丛位置
rep("    const gy = ground(cx, cz);\n    for (let i = 0; i < 70; i++) {", "    const gy = ground(cx, cz); (WORLD.grass = WORLD.grass || []).push([cx, cz]);\n    for (let i = 0; i < 70; i++) {")

# ---------------------------------------------------------------- 控制面板（dat.gui）中文
rep("  GUI_CTRL.weather = fE.add(P, 'weather', Object.keys(WX_PRESETS)).name('Weather / season').onChange(setWeather);\n"
    "  GUI_CTRL.time = fE.add(P, 'timeOfDay', 6, 19, 0.05).name('Time of day').onChange(updateSun);\n"
    "  fE.add(P, 'sunAzimuth', -180, 180, 1).name('Sun azimuth').onChange(updateSun);\n",
    "  GUI_CTRL.weather = fE.add(P, 'weather', { '晴': 'Sunny', '雨': 'Rain', '秋': 'Autumn', '冬雪': 'Winter' }).name('天气预设（演示）').onChange((v) => window.PondCampus ? PondCampus.setPreset(v) : setWeather(v));\n")
for a, b in [
    ("const fE = gui.addFolder('Environment');", "const fE = gui.addFolder('环境');"),
    (".name('Wind').onChange(updateWaves);", ".name('风力').onChange(updateWaves);"),
    (".name('Wind direction')", ".name('风向')"),
    ("gui.addFolder('Water')", "gui.addFolder('水面')"),
    (".name('Clarity')", ".name('清澈度')"), (".name('Wave height')", ".name('波浪高度')"), (".name('Caustics')", ".name('焦散强度')"),
    ("gui.addFolder('Koi')", "gui.addFolder('锦鲤')"), (".name('Fish count')", ".name('数量')"), (".name('Feed the koi (E)')", ".name('喂锦鲤（E）')"),
    ("gui.addFolder('Rendering')", "gui.addFolder('渲染')"),
    ("fR.add(P, 'quality', ['Low', 'High']).name('Quality')", "fR.add(P, 'quality', { '低': 'Low', '高': 'High' }).name('画质')"),
    (".name('Auto-drop to Low')", ".name('帧率低时自动降质')"), (".name('Exposure')", ".name('曝光')"), (".name('Bloom')", ".name('泛光')"),
    (".name('Bloom threshold')", ".name('泛光阈值')"), (".name('SSAO')", ".name('环境光遮蔽')"), (".name('God rays')", ".name('体积光')"),
    (".name('Film grain')", ".name('胶片颗粒')"), (".name('Vignette')", ".name('暗角')"), (".name('Lens sharpening')", ".name('锐化')"),
    ("gui.addFolder('Lens (depth of field)')", "gui.addFolder('镜头（景深）')"), (".name('Depth of field + autofocus')", ".name('景深 + 自动对焦')"),
    (".name('Aperture (f-stop)')", ".name('光圈 f 值')"), (".name('Max bokeh size')", ".name('最大虚化')"),
    ("gui.addFolder('Camera')", "gui.addFolder('镜头')"), (".name('Cinematic = film tour')", ".name('电影镜头 = 巡游短片')"),
    (".name('Letterbox bars')", ".name('电影黑边')"), (".name('Change season each loop')", ".name('每轮切换季节')"),
    ("['Cinematic', 'Manual', 'Follow koi', 'Follow turtle']).name('Mode')", "{ '电影镜头': 'Cinematic', '自由镜头': 'Manual', '跟随锦鲤': 'Follow koi', '跟随乌龟': 'Follow turtle' }).name('模式')"),
    ("gui.addFolder('Close-ups')", "gui.addFolder('近景')"),
    ("for (const name of ['Turtle', ...Object.keys(VIEWS)])", "for (const name of ['乌龟', ...Object.keys(VIEWS)])"),
    (".name('Follow a koi (K)')", ".name('跟随锦鲤（K）')"), (".name('Path speed')", ".name('巡游速度')"), (".name('Stay above water')", ".name('不潜入水下')"),
    (".name('Hold shot (P)')", ".name('定格（P）')"), (".name('Freeze time (O)')", ".name('暂停时间（O）')"),
    (".name('Clean view for screenshots (V)')", ".name('纯净画面（V）')"), (".name('Volume')", ".name('音量')"), (".name('Sound')", ".name('声音')"),
]:
    rep(a, b)
rep("  gui.close();                                        // keep the frame clean; 'Open Controls' (or H) brings it back",
    "  gui.close(); dat.GUI.TEXT_CLOSED = '收起参数'; dat.GUI.TEXT_OPEN = '高级参数'; gui.closed = true;\n"
    "  { const d = document.querySelector('.dg.ac'); if (d) d.style.display = 'none'; }   // 默认隐藏，按 H 打开")
rep("""  } catch (err) {
    console.error(err);""", """  } catch (err) {
    console.error(err); window.__pondError = String(err && err.message || err);""")

# ---------------------------------------------------------------- 钩子：校园同步与界面
rep("    await progress(0.93, '编译着色器（首次较慢）');",
    "    if (window.PondCampus) PondCampus.init();\n    await progress(0.93, '编译着色器（首次较慢）');")
rep("  updateHUD(dt);\n}", "  updateHUD(dt);\n  if (window.PondCampus) PondCampus.update(cdt, t);\n}")
rep("    setTimeout(() => { $('loader').style.opacity = 0; setTimeout(() => $('loader').remove(), 900); }, 150);",
    "    setTimeout(() => { $('loader').style.opacity = 0; setTimeout(() => { $('loader').remove(); if (window.PondCampus) PondCampus.ready(); }, 900); }, 150);")

rep("g = localStorage.getItem('koi.guide') !== '0';", "g = localStorage.getItem('pond.guide') === '1';")
rep("try { localStorage.setItem('koi.guide', show ? '1' : '0'); }", "try { localStorage.setItem('pond.guide', show ? '1' : '0'); }")
rep("const RES = { scale: 1 };", "const RES = { scale: " + CP + ".test ? (parseFloat(new URLSearchParams(location.search).get('res')) || 0.6) : 1 };")
rep("renderer.setPixelRatio(Math.min(window.devicePixelRatio, " + CP + ".maxDpr, 2));", "renderer.setPixelRatio(Math.min(window.devicePixelRatio, " + CP + ".maxDpr, 2) * RES.scale);")
rep("  autoQuality: true,", "  autoQuality: !" + CP + ".test,")
rep("function frame() {\n  requestAnimationFrame(frame);", "function frame() {\n  if (window.__pondStop) { window.__pondStopped = true; return; }   // 自动化测试：停帧后截图\n  requestAnimationFrame(frame);")
# 夜晚：雾色与阴天云色压暗成深蓝，避免夜景发灰
rep("  skyUniforms.uOvercast.value = c.overcast; skyUniforms.uOvercastCol.value.setRGB(c.fogCol[0] / c.skyScale, c.fogCol[1] / c.skyScale, c.fogCol[2] / c.skyScale);",
    "  const nf = window.CAMPUS_SUN ? CAMPUS_SUN.night : 0, fc = pondNightFog(c.fogCol, nf);\n"
    "  skyUniforms.uOvercast.value = c.overcast; skyUniforms.uOvercastCol.value.setRGB(fc[0] / c.skyScale, fc[1] / c.skyScale, fc[2] / c.skyScale);")
rep("SH.uFogDensity.value = c.fog; SH.uFogColor.value.setRGB(...c.fogCol);", "SH.uFogDensity.value = c.fog; SH.uFogColor.value.setRGB(...fc);")
# ---------------------------------------------------------------- 抚摸锦鲤：抚摸点一定在水里、镜头在岸上，鱼到位判定放宽
rep("""function startStroke() {
  if (!FEED.hand || FEED.active || STROKE.active) return;
  const shot = P.cameraMode === 'Cinematic' ? feedingShot(0.9, 5.8) : feedingShot(camera.position.x, camera.position.z);
  STROKE.shot = shot;
  const fwd = new THREE.Vector3().subVectors(shot.look, shot.pos).setY(0).normalize();
  STROKE.along.set(-fwd.z, 0, fwd.x);                                  // the fish lies across the view, parallel to the bank
  STROKE.spot.copy(shot.pos).addScaledVector(fwd, 0.95).setY(WATER_Y);
  // lean out over the fish and look almost straight down on it, like the classic photo of a hand on a koi
  STROKE.shot = { pos: STROKE.spot.clone().addScaledVector(fwd, -0.42).setY(WATER_Y + 0.66), look: STROKE.spot.clone().addScaledVector(fwd, 0.04).setY(WATER_Y - 0.05) };
""", """// 校园版：抚摸点必须在水里（sdf < -0.3），镜头站在岸上（sdf > 0.02）；荷花池版避开荷叶密集处。
// 沿池岸逐点找离参考位置最近的合格岸边点（与 feedingShot 相同的避让：跌水、鸢尾、石拱桥桥头）。
function strokePads() { return (WORLD.lotus || []).map((L) => L.leaf.getWorldPosition(new THREE.Vector3())); }
function strokeSpotOK(x, z, pads) {
  if (sdf(x, z) > -0.3) return false;
  let near = 0;
  for (const p of pads) { const d = Math.hypot(p.x - x, p.z - z); if (d < 0.5) return false; if (d < 1.1) near++; }
  return near <= (window.CAMPUS_POND.lotusExtra ? 1 : 2);
}
function strokeShot(nx, nz) {
  const pads = strokePads();
  let best = null, bd = 1e9;
  for (let s = 0; s < POLY_LEN; s += 0.05) {
    const sh = shoreAt(s);
    if (nearWaterfall(sh.x, sh.z, 1.5)) continue;
    if ((WORLD.irisClumps || []).some((c) => Math.hypot(c.x - sh.x, c.z - sh.z) < 1.1)) continue;
    if (Math.abs(sh.z - BRIDGE.z) < 1.0 && Math.abs(Math.abs(sh.x) - 1.8) < 0.9) continue;
    const cx = sh.x + sh.nx * 0.12, cz = sh.z + sh.nz * 0.12;
    if (sdf(cx, cz) < 0.02) continue;                                  // 镜头必须在岸上
    for (const din of [0.55, 0.7, 0.85, 1.0]) {
      const x = sh.x - sh.nx * din, z = sh.z - sh.nz * din;
      if (!strokeSpotOK(x, z, pads)) continue;
      const d = Math.hypot(sh.x - nx, sh.z - nz) + din * 0.2;
      if (d < bd) { bd = d; best = { sh, x, z, cx, cz }; }
      break;
    }
  }
  return best;
}
function startStroke() {
  if (!FEED.hand || FEED.active || STROKE.active) return;
  const ref = P.cameraMode === 'Cinematic' ? [0.9, 5.8] : [camera.position.x, camera.position.z];
  const B = strokeShot(ref[0], ref[1]);
  if (!B) { toast('附近岸边没有合适的抚摸位置'); return; }
  const fwd = new THREE.Vector3(-B.sh.nx, 0, -B.sh.nz).normalize();     // 从岸上看向水面
  STROKE.along.set(-fwd.z, 0, fwd.x);                                  // the fish lies across the view, parallel to the bank
  STROKE.spot.set(B.x, WATER_Y, B.z);
  // crouch on the bank and look down on the fish（镜头在岸上，不再悬在水面上方）
  STROKE.shot = { pos: new THREE.Vector3(B.cx, Math.max(ground(B.cx, B.cz), 0.15) + 0.74, B.cz), look: STROKE.spot.clone().addScaledVector(fwd, 0.04).setY(WATER_Y - 0.05) };
  window.__strokeInfo = { spot: [B.x, B.z], spotSdf: sdf(B.x, B.z), cam: [B.cx, B.cz], camSdf: sdf(B.cx, B.cz), handT: -1, doneT: -1 };
""")
rep("""  const arrived = Math.hypot(f.p.x - STROKE.spot.x, f.p.z - STROKE.spot.z) < 0.18 && backTopY > WATER_Y - 0.045;
  if (STROKE.phaseStart < 0 && (arrived && T > 1.6 || T > 14)) STROKE.phaseStart = T;""",
"""  const arrived = Math.hypot(f.p.x - STROKE.spot.x, f.p.z - STROKE.spot.z) < 0.3 && backTopY > WATER_Y - 0.08;   // 到位判定放宽
  if (STROKE.phaseStart < 0 && T > 6 && !arrived) {
    // 等待上限 6 秒：鱼还没游到，直接把它引过来（平滑拉到手边、转成与岸平行、浮到水面下）
    const k = 1 - Math.exp(-dt * 5), th = Math.atan2(-STROKE.along.z, STROKE.along.x);
    f.p.x = lerp(f.p.x, STROKE.spot.x, k); f.p.z = lerp(f.p.z, STROKE.spot.z, k);
    f.p.y = lerp(f.p.y, WATER_Y - f.size * 0.14 * f.girth - 0.03, k);
    f.heading += Math.atan2(Math.sin(th - f.heading), Math.cos(th - f.heading)) * k;
  }
  if (STROKE.phaseStart < 0 && (arrived && T > 1.6 || T > 7.2)) { STROKE.phaseStart = T; if (window.__strokeInfo) __strokeInfo.handT = T; }""")
rep("    if (S >= total) endStroke();", "    if (S >= total) { if (window.__strokeInfo) __strokeInfo.doneT = T; endStroke(); }")

# 自动化测试（?test=1）可用固定步长 ?tstep=秒 推进场景时间：软件渲染一帧要数秒，按真实时间截断到 0.05 秒会让抚摸流程跑上一小时
rep("const rawDt = clock.getDelta(), cdt = Math.min(rawDt, 0.05),", "const rawDt = clock.getDelta(), cdt = TEST_STEP || Math.min(rawDt, 0.05),")
rep("const RES = { scale: " + CP + ".test ?", "const TEST_STEP = " + CP + ".test ? Math.min(0.2, parseFloat(new URLSearchParams(location.search).get('tstep')) || 0) : 0;\nconst RES = { scale: " + CP + ".test ?")

# ---------------------------------------------------------------- 进入速度：渐进式加载（第三阶段 A）
# 第一阶段（首帧前）：池岸 SDF、程序化纹理（IndexedDB 缓存）、地形、驳岸石、石桥小亭、水面、瀑布、庭院灯、雨雪、远山、锦鲤、手、后期
#   → renderer.compileAsync 预编译着色器 → 首帧 → 加载遮罩立即淡出，可交互（喂鱼/抚摸/镜头/点击水面）。
# 第二阶段（首帧后分帧补上）：植物纹理、植被（垂柳/香樟/灌木/花境/荷花睡莲…）、乌龟、水下根系、萤火虫、落叶落花、蜻蜓、气泡。
#   每一小节之间让出主线程；新对象先放进暂存组、compileAsync 编译好着色器再挂进场景，避免卡帧；底部小条显示真实进度。
# 时间戳：window.__pondT = [[performance.now(), 名称], …]（测速脚本读取；正式环境无副作用）。
def _make_async_with_yields(fn, label):
    """把 fn 改成 async，并在函数体顶层每个小节注释（两格缩进的 // 行）前插入 await phase2Yield()。返回插入个数。"""
    global s
    m = re.search(r"\nfunction " + fn + r"\(([^)]*)\) \{\n(.*?)\n\}\n", s, re.S)
    assert m, fn
    n = [0]
    def ins(mm):
        n[0] += 1
        return "  await phase2Yield(" + repr(label) + ");\n" + mm.group(0)
    body2 = re.sub(r"(?m)^  // ", ins, m.group(2))
    s = s[:m.start()] + "\nasync function " + fn + "(" + m.group(1) + ") {\n" + body2 + "\n}\n" + s[m.end():]
    return n[0]
NY = 0
NY += _make_async_with_yields('buildVegetation', '种植垂柳、香樟与灌木')
NY += _make_async_with_yields('buildBotanical', '布置花境与竹林')
NY += _make_async_with_yields('buildPondLife', '种下睡莲与荷花')
rep("  buildBotanical(OCC, free, V3);\n", "  await buildBotanical(OCC, free, V3);\n")
rep("  buildIrisFlowers(irisClumps);\n\n  buildPondLife();\n}", "  buildIrisFlowers(irisClumps);\n\n  await buildPondLife();\n}")
PHASE2_TOTAL = NY + 9   # 各小节 + 植物纹理/植被/乌龟/水下根系/萤火虫/落叶/落花/蜻蜓/气泡

# 暂存组下 scene.children 不再反映新加入的对象：低矮花境的“不进倒影”名单改为按第二阶段新增对象列表截取
rep("  nr0 = scene.children.length;", "  nr0 = PHASE2.stage ? -1 - PHASE2.added.length : scene.children.length;")
rep("  for (const o of scene.children.slice(nr0)) WORLD.noReflect.push(o);", "  for (const o of (nr0 < 0 ? PHASE2.added.slice(-1 - nr0) : scene.children.slice(nr0))) WORLD.noReflect.push(o);")
INIT_JS = open(os.path.join(ROOT, 'tools', 'pond_init.js'), encoding='utf-8').read()
resub(r"async function init\(\) \{\n  try \{\n.*?\n\}\ninit\(\);\n", lambda m: INIT_JS.replace('__PHASE2_TOTAL__', str(PHASE2_TOTAL)), 1)
# 加载进度：记录每一步的时间戳
rep("async function progress(frac, msg) {\n", "async function progress(frac, msg) {\n  (window.__pondT = window.__pondT || []).push([performance.now(), 'step:' + msg]);\n")
# 第二阶段进度条样式
rep('</style>\n<link rel="stylesheet" href="pond-campus.css">',
    '  #p2chip { position: fixed; left: 50%; bottom: 78px; transform: translateX(-50%); z-index: 6; display: flex; align-items: center; gap: 8px;\n'
    '    padding: 6px 12px; font-size: 12px; color: var(--muted, #cfd8d3); border-radius: 999px; transition: opacity .8s ease; pointer-events: none; }\n'
    '  #p2chip b { color: #fff; font-weight: 600; min-width: 2.6em; text-align: right; }\n'
    '  #p2chip i { display: block; width: 90px; height: 3px; background: rgba(255,255,255,.15); border-radius: 2px; overflow: hidden; }\n'
    '  #p2chip em { display: block; height: 100%; width: 0; background: var(--accent, #8fd18f); transition: width .25s ease; }\n'
    '  #p2chip.is-done { opacity: 0; }\n'
    '</style>\n<link rel="stylesheet" href="pond-campus.css">')

# ---------------------------------------------------------------- 动植物增删（第三阶段 B，池塘试点）
# 场景钩子 tools/pond_edit_hooks.js（window.PondEdit：垂柳 / 香樟 / 桂花 / 荷花 / 睡莲独立生成函数、锦鲤空位管理、原有个体登记）插在渐进加载代码之前；
# pond.html 另外引入通用编辑器 ../js/species-editor.js 与池塘适配层 pond-species.js（场景全部补完、派发 pond:full 后才创建编辑器）。
HOOKS_JS = open(os.path.join(ROOT, 'tools', 'pond_edit_hooks.js'), encoding='utf-8').read()
rep("/* ------------------------------------------------------------------ 校园版：渐进式加载", HOOKS_JS.rstrip() + "\n\n/* ------------------------------------------------------------------ 校园版：渐进式加载")
# 垂柳：每棵树的树皮与叶片卡单独保存（WORLD.willowParts），之后用 PondEdit.treeFromParts 建成独立的树（WORLD.willowTrees），可以单独移植 / 移除
rep("    const gy = ground(x, z), nb = BARK.length;\n    const lean = new V3(-sdfGradX(x, z), 0, -sdfGradZ(x, z)).multiplyScalar(0.28);          // lean toward the water",
    "    const gy = ground(x, z), nb = BARK.length, nc = LEAVES.sakura.length;\n    const lean = new V3(-sdfGradX(x, z), 0, -sdfGradZ(x, z)).multiplyScalar(0.28);          // lean toward the water")
rep("    SAK_BARK.push(...BARK.splice(nb));\n", "    const ownBark = BARK.splice(nb);\n    if (!weeping) SAK_BARK.push(...ownBark);\n")
rep("    OCC.push([x, z, 0.8]); (WORLD.willows = WORLD.willows || []).push([x, z, h]);\n",
    "    OCC.push([x, z, 0.8]); (WORLD.willows = WORLD.willows || []).push([x, z, h]);\n"
    "    if (weeping) (WORLD.willowParts = WORLD.willowParts || []).push({ x, z, gy, h, bark: ownBark, cards: { sakura: LEAVES.sakura.splice(nc) }, seasons: { sakura: 'SRA' } });\n")
# 静态占位表导出：原有的树（香樟、樱花、造型松…）、灌木、竹林、花境都登记在 OCC 里；编辑器新种的岸上植物要避开它们，
# 否则会种进原有树丛里，被树冠完全遮住（垂柳单独可移植，按 WORLD.willows 排除）
rep("  await buildBotanical(OCC, free, V3);\n", "  await buildBotanical(OCC, free, V3);\n  WORLD.occ = OCC;\n")
# 树皮材质导出（编辑器新种的树复用同一材质）；垂柳树皮材质无论是否还有合并网格都要建
rep("""  if (SAK_BARK.length) {
    const sm = physical({ map: TEX.sakuraBark.map, normalMap: TEX.sakuraBark.normalMap, normalScale: new THREE.Vector2(1.2, 1.2), roughness: 0.8, envMapIntensity: 0.6 },
      { key: 'barksak', wind: 'world', windWeight: 'clamp((wPos4.y - 1.5) * 0.05, 0.0, 0.35)' });
    const sbm = meshOf(SAK_BARK, sm, LAYER.ABOVE);
    sbm.customDepthMaterial = patchedDepth({ key: 'barkd', wind: true, windWeight: 'clamp((wPos4.y - 1.5) * 0.05, 0.0, 0.35)' });
  }
""", """  WORLD.barkKit = { mat: barkMat, depth: barkMesh.customDepthMaterial };
  {
    const sm = physical({ map: TEX.sakuraBark.map, normalMap: TEX.sakuraBark.normalMap, normalScale: new THREE.Vector2(1.2, 1.2), roughness: 0.8, envMapIntensity: 0.6 },
      { key: 'barksak', wind: 'world', windWeight: 'clamp((wPos4.y - 1.5) * 0.05, 0.0, 0.35)' });
    const sd = patchedDepth({ key: 'barkd', wind: true, windWeight: 'clamp((wPos4.y - 1.5) * 0.05, 0.0, 0.35)' });
    WORLD.willowBark = { mat: sm, depth: sd };
    if (SAK_BARK.length) { const sbm = meshOf(SAK_BARK, sm, LAYER.ABOVE); sbm.customDepthMaterial = sd; }
  }
""")
# 叶片卡材质：列表为空也建材质（编辑器新种的树要用），导出 WORLD.leafKit；循环结束后把垂柳建成独立的树
rep("""  WORLD.leafMats = [];
  for (const [name, tex, transl, sheen] of leafSets) {
    const list = LEAVES[name]; if (!list.length) continue;
""", """  WORLD.leafMats = [];
  WORLD.leafKit = { cardGeo, sets: {} };
  for (const [name, tex, transl, sheen] of leafSets) {
    const list = LEAVES[name];
""")
rep("""    WORLD.leafMats.push(mat);
    const im = new THREE.InstancedMesh(cardGeo, mat, list.length);
""", """    WORLD.leafMats.push(mat);
    const seasons = { maple: 'SRA', green: 'SRA', sakura: 'SRA', bloom: 'SR', hydrangea: 'SRA', bigleaf: 'SRA', kikyo: 'SR' }[name] || 'SRAW';
    const depth = patchedDepth({ key: 'leafd', wind: true, windWeight: ww }, tex, 0.45);
    WORLD.leafKit.sets[name] = { mat, depth, seasons };
    WORLD.leafMesh[name] = { material: mat, customDepthMaterial: depth };    // 季节切换（垂柳秋色）改的是共享材质，独立的树一起生效
    if (!list.length) continue;
    const im = new THREE.InstancedMesh(cardGeo, mat, list.length);
""")
rep("""    seasonal(im, { maple: 'SRA', green: 'SRA', sakura: 'SRA', bloom: 'SR', hydrangea: 'SRA', bigleaf: 'SRA', kikyo: 'SR' }[name] || 'SRAW');
    im.castShadow = !low; im.receiveShadow = true; if (low) WORLD.noReflect.push(im);
    im.customDepthMaterial = patchedDepth({ key: 'leafd', wind: true, windWeight: ww }, tex, 0.45);
    im.computeBoundingSphere();
    setLayer(im, LAYER.ABOVE); scene.add(im);
  }
""", """    seasonal(im, seasons);
    im.castShadow = !low; im.receiveShadow = true; if (low) WORLD.noReflect.push(im);
    im.customDepthMaterial = depth;
    im.computeBoundingSphere();
    setLayer(im, LAYER.ABOVE); scene.add(im);
  }
  WORLD.willowTrees = (WORLD.willowParts || []).map((part) => {
    part.barkKit = WORLD.willowBark;
    const g = PondEdit.treeFromParts(part); g.userData.seedTree = 'willow'; scene.add(g); return g;
  });
""")
rep("    WORLD.leafMesh[name] = im;\n", "")
# 池塘材质与荷花 flower() 导出给编辑器
rep("  WORLD.lilies = [];\n  await phase2Yield('种下睡莲与荷花');",
    "  WORLD.lilies = [];\n  WORLD.pondKit = { padMat, lotusMat, lilyMat, stamenMat, stemMat };\n  await phase2Yield('种下睡莲与荷花');")
rep("  WORLD.lotusFlower = fl;\n", "  WORLD.lotusFlower = fl;\n  WORLD.lotusKit = { flower, petalMat };\n")
# 锦鲤：名单扩到 24 条（编辑器放入的锦鲤用空位），f.vis 淡入淡出、f.gone 已移除
rep("const KOI_MAX = 20; ", "const KOI_MAX = 24; ")
rep("['doitsu', 'M'], ['goshiki', 'S'], ['benigoi', 'S'], ['ochiba', 'M'], ['kohaku', 'S', { gin: 1 }],\n];",
    "['doitsu', 'M'], ['goshiki', 'S'], ['benigoi', 'S'], ['ochiba', 'M'], ['kohaku', 'S', { gin: 1 }],\n"
    "  ['showa', 'M'], ['yamabuki', 'S'], ['tancho', 'S'], ['asagi', 'S'],     // 21–24：编辑器“放锦鲤”用的空位\n];")
rep("""  for (let i = 0; i < n; i++) {
    const f = F[i];
    const fx = Math.cos(f.heading), fz = -Math.sin(f.heading);
    // feeding excitement""", """  for (let i = 0; i < n; i++) {
    const f = F[i];
    if (f.gone) continue;                     // 已被编辑器移除（空位）
    const fx = Math.cos(f.heading), fz = -Math.sin(f.heading);
    // feeding excitement""")
rep("      const o = F[j], dx = o.p.x - f.p.x, dz = o.p.z - f.p.z, d2 = dx * dx + dz * dz;",
    "      const o = F[j]; if (o.gone) continue;\n      const dx = o.p.x - f.p.x, dz = o.p.z - f.p.z, d2 = dx * dx + dz * dz;")
rep("    const a = F[i], b = F[j];\n    if (Math.abs(a.p.x - b.p.x)", "    const a = F[i], b = F[j];\n    if (a.gone || b.gone) continue;\n    if (Math.abs(a.p.x - b.p.x)")
rep("    _sk.setScalar(f.size); _pk.copy(f.p);", "    _sk.setScalar(f.gone ? 1e-5 : f.size * Math.max(1e-5, f.vis ?? 1)); _pk.copy(f.p);")
rep("    if (!f || i >= n) { SA[i].set(0, 0, 0, 0); continue; }", "    if (!f || i >= n || f.gone) { SA[i].set(0, 0, 0, 0); continue; }")
rep("    SA[i].set(f.p.x, f.p.y, f.p.z, f.size);", "    SA[i].set(f.p.x, f.p.y, f.p.z, f.size * (f.vis ?? 1));")
rep("  const all = KOI.fish.slice(0, Math.min(P.fishCount, KOI.fish.length)), tame",
    "  const all = KOI.fish.slice(0, Math.min(P.fishCount, KOI.fish.length)).filter((f) => !f.gone), tame")
# pond.html 引入通用编辑器与池塘适配层（放在主脚本之后）
SPECIES_TAGS = '<script src="../js/species-editor.js"></script>\n<script src="pond-species.js"></script>\n'

# ---------------------------------------------------------------- 抽出共享画风脚本 pond-style-core.js（全景与池塘逐字共用）
CORE_PARTS = []
def cut(pat, name, keep=''):
    """从 s 中剪下匹配 pat 的一段放进共享脚本；原位置留下 keep。"""
    global s
    m = list(re.finditer(pat, s, flags=re.S))
    if len(m) != 1:
        print('!! 抽取 %s 命中 %d 次' % (name, len(m))); sys.exit(1)
    m = m[0]
    CORE_PARTS.append('// ==== ' + name + ' ====\n' + m.group(0).rstrip() + '\n')
    s = s[:m.start()] + keep + s[m.end():]
# 1~3 节：数学/噪声、程序化纹理（花岗岩、卵石、草地、木纹、树皮、瓦片、水面法线、叶片卡…）、几何工具
cut(r"/\* -{60,} 1\. MATH / NOISE \*/.*?(?=/\* -{60,} 4\. RENDERER, SKY, SUN, ENVIRONMENT \*/)", '1-3. 数学/噪声、程序化纹理、几何工具',
    "pondStyleProgress = progress;   // 共享纹理生成器（pond-style-core.js）的加载进度回调\n\n")
# 植被生成：叶片卡列表、递归分枝树（香樟/垂柳/水杉…两边同一套生长算法）
cut(r"const LEAVES = \{ maple: \[\].*?(?=const ground = \(x, z\) => )", '植被：叶片卡 addCard、递归分枝 growTree')
# 天空：Preetham + 程序化云层 + 校园夜空（星、月）
cut(r"/\* --- Sky: Preetham analytic daylight.*?(?=const skyUniforms = \{)", '天空着色器 SKY_VS / SKY_FS')
cut(r"// Kelvin -> sRGB \(Tanner Helland fit\)\nfunction kelvinToRGB\(k\) \{.*?\n\}\n", '色温 kelvinToRGB')
# 叶片透光、积雪/湿润/秋色
cut(r"// Leaves: transmission-free subsurface approximation.*?\nconst LEAF_POST_LIGHTS = /\* glsl \*/`.*?`;\n", '叶片透光 LEAF_POST_LIGHTS')
cut(r"const WEATHER_ALBEDO = /\* glsl \*/`.*?`;\n", '积雪/湿润/秋色 WEATHER_ALBEDO')
cut(r"const WEATHER_ROUGH = /\* glsl \*/`.*?`;\n", '积雪/湿润粗糙度 WEATHER_ROUGH')
# 天气预设
cut(r"const WX_PRESETS = \{\n.*?\n\};\n", '天气预设 WX_PRESETS')
# 风动（GLSL 函数）与 ACES 色调映射：原位置改为模板插值，内容放进共享脚本
m = re.search(r"vec3 windOffset\(vec3 wp, float w\)\{\n.*?\n\}\n", s, flags=re.S)
assert m and s.count('vec3 windOffset(vec3 wp, float w){') == 1
CORE_PARTS.append('// ==== 风动 windOffset（GLSL）====\nconst PONDSTYLE_WIND_GLSL = /* glsl */`\n' + m.group(0) + '`;\n')
s = s[:m.start()] + '${PONDSTYLE_WIND_GLSL}' + s[m.end():]
m = re.search(r"vec3 RRTAndODTFit\(vec3 v\)\{.*?\nvec3 toSRGB\(vec3 c\)\{[^\n]*\n", s, flags=re.S)
assert m
CORE_PARTS.append('// ==== ACES 电影色调映射 + sRGB（GLSL，合成 pass 用）====\nconst PONDSTYLE_TONEMAP_GLSL = /* glsl */`\n' + m.group(0) + '`;\n')
s = s[:m.start()] + '${PONDSTYLE_TONEMAP_GLSL}' + s[m.end():]
core = '''/*
 * 池塘画风 · 共享核心（自动生成，请勿手改 —— 由 tools/build_pond.py 从池塘场景源码中逐字抽出）
 * ------------------------------------------------------------------------------
 * 来源：开源项目 Koi Pond Garden（https://github.com/souranyp-stack/koi-pond-garden，Copyright (c) 2026 Sourany Phomhome，
 *       MIT License，许可全文见 campus3d/pond/LICENSE-koi-pond-garden.txt）及本项目的校园化改造。
 * 校园全景（ecohome）与池塘细节场景（pond/pond.html）都加载本文件，所以两边的噪声、程序化纹理（草地、花岗岩、卵石、
 * 木纹、树皮、灰瓦、水面法线）、叶片卡（香樟/垂柳/水杉/灌木…）、几何工具、天空（Preetham + 云层 + 星月）、色温、
 * 天气预设、叶片透光、积雪/湿润/秋色着色、风动和 ACES 色调映射完全一致。
 * 依赖：全局 THREE（lib/three-r160.min.js）。经典脚本，定义全局函数 / 常量。
 */
'use strict';
let pondStyleProgress = async () => {};   // buildTextures() 的进度回调，由使用方替换
'''
core += '\n'.join(CORE_PARTS).replace('await progress(', 'await pondStyleProgress(')
assert 'await progress(' not in core
# 程序化纹理缓存（IndexedDB）：全景与池塘共用同一份；首次生成后保存，之后直接读取（键 = 本文件内容哈希，生成器改了自动失效）
n_gs = core.count('= genSurface(')
core = re.sub(r"TEX\.(\w+) = genSurface\(", lambda mm: "TEX." + mm.group(1) + " = genSurfaceCached('" + mm.group(1) + "', ", core)
assert core.count('genSurfaceCached(') >= 9, core.count('genSurfaceCached(')
blk = re.search(r"  // --- Water detail normal: tileable FBM ripples\n  \{\n(.*?)\n  \}\n", core, re.S)
assert blk
core = core[:blk.start()] + ("  // --- Water detail normal: tileable FBM ripples（命中缓存时跳过生成）\n  if (!pondTexRestore('waterNormal')) {\n" + blk.group(1) +
       "\n    pondTexRecord('waterNormal', TEX.waterNormal);\n  }\n") + core[blk.end():]
blk = re.search(r"  // --- Caustics: Voronoi cell-edge network, softened \(two copies are multiplied in-shader\)\n  \{\n(.*?)\n  \}\n", core, re.S)
assert blk
core = core[:blk.start()] + ("  // --- Caustics: Voronoi cell-edge network（命中缓存时跳过生成）\n  if (!pondTexRestore('caustics')) {\n" + blk.group(1) +
       "\n    pondTexRecord('caustics', TEX.caustics, { mean: TEX.causticMean });\n  }\n") + core[blk.end():]
rep_n = core.count('async function buildTextures() {\n')
assert rep_n == 1
core = core.replace('async function buildTextures() {\n', 'async function buildTextures() {\n  await pondTexCache.open();\n  try {\n', 1)
m_bt = re.search(r"async function buildTextures\(\) \{\n.*?\n\}\n", core, re.S)
bt = m_bt.group(0)
assert bt.endswith("\n}\n")
bt = bt[:-3] + "\n  } finally { pondTexCache.save(); }\n}\n"
core = core[:m_bt.start()] + bt + core[m_bt.end():]
core += '\n' + open(os.path.join(ROOT, 'tools', 'pond_texcache.js'), encoding='utf-8').read().replace('__TEXCACHE_VERSION__', hashlib.sha256(core.encode('utf-8')).hexdigest()[:12])
open(CORE, 'w', encoding='utf-8').write(core)
print('OK', len(core), 'bytes ->', CORE)

# ---------------------------------------------------------------- 主脚本拆成可缓存的 pond-main.js（文件名带内容哈希版本号 → 长缓存 immutable）
m = re.search(r"<script>\n'use strict';\n(.*)\n</script>\n</body>", s, re.S)
assert m, '找不到池塘主脚本'
main_js = ("/*\n * 校园池塘板块细节场景 · 主脚本（自动生成，请勿手改 —— 由 tools/build_pond.py 从 koi-pond-garden 源码改造生成，\n"
           " * 渐进式加载部分见 tools/pond_init.js）。来源：https://github.com/souranyp-stack/koi-pond-garden （MIT，许可见同目录 LICENSE-koi-pond-garden.txt）\n */\n"
           "'use strict';\n(window.__pondT = window.__pondT || []).push([performance.now(), 'main-script-start']);\n" + m.group(1) + "\n")
MAIN = os.path.join(os.path.dirname(DST), 'pond-main.js')
open(MAIN, 'w', encoding='utf-8').write(main_js)
ver = hashlib.sha256(main_js.encode('utf-8')).hexdigest()[:10]
s = s[:m.start()] + '<script src="pond-main.js?v=' + ver + '"></script>\n' + SPECIES_TAGS + '</body>' + s[m.end():]
print('OK', len(main_js), 'bytes ->', MAIN, 'v=' + ver)
open(DST, 'w', encoding='utf-8').write(s)
print('OK', len(s), 'bytes ->', DST)
