/*
 * 生态动态主页：加载动画 -> 全屏 3D 校园大屏。
 * 页面只需提供 window.ECO_CONFIG（见 ecohome.jsp / campus3d/index.html），本脚本负责：
 *   1. 按顺序加载 three.js 等本地脚本并显示进度条；
 *   2. 构建校园、生态动态层、生态板块；
 *   3. 北京时间昼夜、季节、天气（代理 -> 直连 -> 虚拟）；
 *   4. 交互：板块悬浮高亮/点击飞行定位、建筑详情、演示切换面板（按 W）；
 *   5. 第二阶段：有 detail_scene 的板块“进入板块细节”俯冲淡出后打开细节场景（如池塘 pond/pond.html），
 *      细节场景“返回校园全景”带 ?zone=<id>&autostart=1 回到本页并停在该板块。
 */
(function () {
  "use strict";
  const CFG = Object.assign(
    { base: "./", weatherApi: null, systemUrl: null, loginUrl: null, userName: null, autoEnterMs: 4000 },
    window.ECO_CONFIG || {}
  );
  const BASE = CFG.base.replace(/\/?$/, "/");
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const params = new URLSearchParams(location.search);

  // ---------------- DOM 骨架 ----------------
  const root = $("eco-root") || document.body.appendChild(el("div"));
  root.id = "eco-root";
  root.innerHTML = [
    '<div id="eco-stage" class="eco-stage" aria-label="三维生态校园"></div>',
    '<div id="eco-labels" class="eco-labels"></div>',
    '<header class="eco-top">',
    '  <div class="eco-brand"><span class="eco-logo">🌱</span><div><h1>智慧校园 · 虚拟生态</h1><p>西南财经大学天府学院 · 绵阳校区</p></div></div>',
    '  <div class="eco-clock" id="eco-clock"><b id="eco-time">--:--</b><span id="eco-date">北京时间</span></div>',
    '  <div class="eco-actions" id="eco-actions"></div>',
    "</header>",
    '<aside class="eco-weather eco-glass" id="eco-weather" title="点击打开演示面板（快捷键 W）">',
    '  <div class="eco-w-main"><span class="eco-w-icon" id="eco-w-icon">⏳</span><span class="eco-w-temp" id="eco-w-temp">--°C</span></div>',
    '  <div class="eco-w-text" id="eco-w-text">正在获取天气…</div>',
    '  <div class="eco-w-meta" id="eco-w-meta"></div>',
    '  <div class="eco-w-src" id="eco-w-src"></div>',
    "</aside>",
    '<nav class="eco-zones eco-glass" id="eco-zones"><p class="eco-ptitle">生态板块</p><ul id="eco-zone-list"></ul></nav>',
    '<aside class="eco-panel eco-glass" id="eco-panel" hidden aria-live="polite">',
    '  <button class="eco-close" id="eco-panel-close" type="button" aria-label="关闭">×</button>',
    '  <figure class="eco-photo" id="eco-panel-fig" hidden><img id="eco-panel-img" alt=""><figcaption>图片来源：西南财经大学天府学院官网</figcaption></figure>',
    '  <p class="eco-kicker" id="eco-panel-kicker"></p>',
    '  <h2 id="eco-panel-title"></h2>',
    '  <p class="eco-desc" id="eco-panel-desc"></p>',
    '  <div class="eco-chips" id="eco-panel-chips"></div>',
    '  <dl class="eco-facts" id="eco-panel-facts"></dl>',
    '  <button class="eco-btn eco-btn-primary" id="eco-panel-enter" type="button">进入板块细节</button>',
    "</aside>",
    '<div class="eco-toolbar eco-glass">',
    '  <button class="eco-btn" id="eco-reset" type="button">🏠 全景</button>',
    '  <button class="eco-btn" id="eco-top-view" type="button">🗺️ 俯视</button>',
    '  <button class="eco-btn" id="eco-tour" type="button" aria-pressed="false">🎬 巡游</button>',
    '  <button class="eco-btn" id="eco-demo-btn" type="button" title="演示切换（W）">⚙️</button>',
    "</div>",
    '<div class="eco-mini eco-glass" id="eco-mini" title="官方平面图，点击跳转"><img alt="绵阳校区官方平面图" id="eco-mini-img"><span class="eco-mini-mark" id="eco-mini-mark"></span></div>',
    '<section class="eco-demo eco-glass" id="eco-demo" hidden>',
    '  <header><b>演示切换面板</b><button class="eco-close" id="eco-demo-close" type="button" aria-label="关闭">×</button></header>',
    '  <label>天气<select id="d-weather"><option value="auto">自动（实时/虚拟）</option><option value="0">晴</option><option value="2">多云</option><option value="3">阴</option><option value="61">小雨</option><option value="65">大雨</option><option value="95">雷阵雨</option><option value="71">雪</option><option value="45">雾</option></select></label>',
    '  <label>季节<select id="d-season"><option value="auto">自动（按北京时间月份）</option><option value="spring">春</option><option value="summer">夏</option><option value="autumn">秋</option><option value="winter">冬</option></select></label>',
    '  <label>时间<span class="eco-row"><input type="checkbox" id="d-time-auto" checked> 跟随北京时间</span></label>',
    '  <input type="range" id="d-time" min="0" max="24" step="0.05" value="12" disabled><output id="d-time-out">12:00</output>',
    '  <label>时间流速<select id="d-speed"><option value="1">×1</option><option value="60">×60（1 秒 = 1 分钟）</option><option value="600">×600（1 秒 = 10 分钟）</option></select></label>',
    '  <div class="eco-demo-btns"><button class="eco-btn" id="d-reset" type="button">恢复自动</button></div>',
    '  <p class="eco-demo-stats" id="d-stats"></p>',
    '  <p class="eco-demo-tip">快捷键：W 打开/关闭本面板，Esc 关闭详情</p>',
    "</section>",
    '<div class="eco-toast" id="eco-toast" hidden></div>',
    '<footer class="eco-foot">依据官方平面图绘制 · 建筑高度为示意 · 照片来源：西南财经大学天府学院官网 · 天气：Open-Meteo</footer>',
    '<div class="eco-loader" id="eco-loader">',
    '  <div class="eco-loader-inner">',
    '    <div class="eco-loader-leaf">🌿</div>',
    "    <h1>智慧校园 · 虚拟生态</h1>",
    '    <p class="eco-loader-sub">西南财经大学天府学院 绵阳校区</p>',
    '    <div class="eco-bar"><i id="eco-bar-fill"></i></div>',
    '    <p class="eco-loader-msg"><span id="eco-load-msg">准备中…</span> <b id="eco-load-pct">0%</b></p>',
    '    <button class="eco-btn eco-btn-primary eco-enter" id="eco-enter" type="button" hidden>进入生态校园</button>',
    '    <p class="eco-loader-tip" id="eco-loader-tip">提示：拖动旋转、滚轮缩放，点击彩色板块飞过去看看</p>',
    "  </div>",
    "</div>",
  ].join("\n");

  const actions = $("eco-actions");
  if (CFG.systemUrl) {
    const a = el("a", "eco-btn eco-btn-primary", "进入管理系统 →"); a.href = CFG.systemUrl; actions.appendChild(a);
  }
  if (CFG.userName) {
    actions.appendChild(el("span", "eco-user", "👤 " + esc(CFG.userName)));
  } else if (CFG.loginUrl) {
    const a = el("a", "eco-btn", "管理员登录"); a.href = CFG.loginUrl; actions.appendChild(a);
  }
  $("eco-mini-img").src = BASE + "img/plan_official.jpg";

  // ---------------- 加载进度 ----------------
  const fill = $("eco-bar-fill"), pctEl = $("eco-load-pct"), msgEl = $("eco-load-msg");
  let shownPct = 0, targetPct = 0;
  function progress(p, msg) { targetPct = Math.max(targetPct, p); if (msg) msgEl.textContent = msg; }
  (function animBar() {
    shownPct += (targetPct - shownPct) * 0.15;
    if (targetPct - shownPct < 0.3) shownPct = targetPct;
    fill.style.width = shownPct.toFixed(1) + "%";
    pctEl.textContent = Math.round(shownPct) + "%";
    if (shownPct < 100) requestAnimationFrame(animBar);
  })();
  function loadScript(src) {
    return new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = src; s.async = false;
      s.onload = res; s.onerror = () => rej(new Error("脚本加载失败：" + src));
      document.head.appendChild(s);
    });
  }
  function fetchJSON(url) { return fetch(url).then((r) => { if (!r.ok) throw new Error("加载失败 " + url); return r.json(); }); }
  function fail(err) {
    console.error(err);
    msgEl.textContent = "加载失败：" + (err && err.message ? err.message : err);
    const b = $("eco-enter");
    if (CFG.systemUrl) { b.hidden = false; b.textContent = "直接进入管理系统"; b.onclick = () => (location.href = CFG.systemUrl); }
  }

  // three 与池塘细节场景统一为 r160；pond-style-core.js / pond-style.js 为两边共用的池塘画风（纹理、天空、光照、色调、植被、画质档）
  const SCRIPTS = [
    ["lib/three-r160.min.js", 30, "加载三维引擎…"],
    ["lib/OrbitControls.classic.js", 2, "加载交互控件…"],
    ["lib/GLTFLoader.classic.js", 3, "加载模型解析器…"],
    ["js/pond-style-core.js", 3, "加载池塘画风（共享）…"],
    ["js/pond-style.js", 1, "加载光照与画质设置…"],
    ["js/campus-info.js", 1, "加载校园资料…"],
    ["js/campus-look.js", 2, "加载渲染层…"],
    ["js/campus-scene.js", 2, "加载校园底图…"],
    ["js/eco-weather.js", 1, "加载天气模块…"],
    ["js/eco-life.js", 2, "加载生态动态层…"],
  ];
  let acc = 0;
  SCRIPTS.reduce((p, [src, w, msg]) => p.then(() => { progress(acc, msg); return loadScript(BASE + src).then(() => { acc += w; progress(acc); }); }), Promise.resolve())
    .then(() => { progress(acc, "加载校园布局与生态板块…"); return Promise.all([fetchJSON(BASE + "data/campus_layout.json"), fetchJSON(BASE + "data/zones.json")]); })
    .then(([layout, zones]) => { progress(50, "生成三维校园…"); return new Promise((r) => setTimeout(() => r([layout, zones]), 30)); })
    .then(([layout, zones]) => start(layout, zones.zones || []))
    .catch(fail);

  // ================================================================
  async function start(L, ZONES) {
    const THREE = window.THREE;
    const WX = window.EcoWeather;
    // WebGL 检测
    let renderer;
    try {
      const c = document.createElement("canvas");
      if (!c.getContext("webgl2")) throw new Error("浏览器不支持 WebGL 2");
      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance", stencil: false });
    } catch (e) { fail(new Error("此设备无法显示三维场景（" + e.message + "）")); return; }
    const stage = $("eco-stage");
    stage.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, 1, 2, 12000);
    // 池塘画风渲染层：天空、太阳/月光、IBL、雾、阴影、水面反射、后期（清晰档）——与池塘细节场景共用同一套参数
    const look = window.EcoLook.create({ renderer, scene, camera, quality: PondQuality.mode, waterLevel: 0.35 });
    // 与池塘相同的程序化纹理（草地、花岗岩、卵石、木纹、树皮、灰瓦、水面法线、叶片卡）
    pondStyleProgress = async (f, msg) => { progress(50 + f * 22, msg); await new Promise((r) => setTimeout(r, 0)); };
    await buildTextures();
    progress(74, "生成三维校园…");
    await new Promise((r) => setTimeout(r, 0));
    const campus = window.EcoCampus.build(scene, L, { look, sculptureUrl: BASE + "models/sculpture_ai.glb" });
    progress(84, "唤醒小动物与花草树木…");
    await new Promise((r) => setTimeout(r, 0));
    const life = window.EcoLife.create(scene, campus, { zones: ZONES, renderer, layout: L, look });
    progress(92, "划分生态板块…");

    // ---------------- 生态板块 ----------------
    const PX = (p) => campus.W(p);
    const zoneObjs = [];
    const zoneLabels = $("eco-labels");
    const listEl = $("eco-zone-list");
    ZONES.forEach((z) => {
      const shape = campus.shapeOf(z.polygon);
      const fillMat = new THREE.MeshBasicMaterial({ color: z.color, transparent: true, opacity: 0.0, depthWrite: false, fog: false, toneMapped: false });
      const g = new THREE.ShapeGeometry(shape); g.rotateX(-Math.PI / 2);
      const fillMesh = new THREE.Mesh(g, fillMat); fillMesh.position.y = 1.1; fillMesh.renderOrder = 1;
      scene.add(fillMesh);
      const pts = z.polygon.map((p) => { const [x, zz] = PX(p); return new THREE.Vector3(x, 1.4, zz); });
      const lineMat = new THREE.LineDashedMaterial({ color: z.color, dashSize: 6, gapSize: 4, transparent: true, opacity: 0.75, fog: false, toneMapped: false });
      const line = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), lineMat);
      line.computeLineDistances();
      scene.add(line);
      look.noReflect.push(fillMesh, line);
      const [cx, cz] = PX(z.center);
      const lab = el("button", "eco-zlabel", '<span class="eco-zi">' + esc(z.icon || "🌿") + "</span><span>" + esc(z.name) + "</span>");
      lab.type = "button";
      lab.style.setProperty("--zc", z.color);
      lab.addEventListener("click", () => selectZone(z.id));
      lab.addEventListener("mouseenter", () => hoverZone(z.id));
      lab.addEventListener("mouseleave", () => hoverZone(null));
      zoneLabels.appendChild(lab);
      const trees = life.treeSpots.filter((p) => campus.inPoly(p, z.polygon)).length;
      const o = { z, fillMat, lineMat, line, label: lab, pos: new THREE.Vector3(cx, 18, cz), trees };
      zoneObjs.push(o);
      const li = el("li");
      const b = el("button", "eco-zbtn", '<i style="background:' + esc(z.color) + '"></i><span>' + esc(z.icon || "") + " " + esc(z.name) + "</span>");
      b.type = "button";
      b.addEventListener("click", () => selectZone(z.id));
      b.addEventListener("mouseenter", () => hoverZone(z.id));
      b.addEventListener("mouseleave", () => hoverZone(null));
      li.appendChild(b); listEl.appendChild(li);
      o.listBtn = b;
    });
    const zoneById = {}; zoneObjs.forEach((o) => (zoneById[o.z.id] = o));
    let hoverId = null, selZone = null;
    function hoverZone(id) { hoverId = id; renderer.domElement.style.cursor = id ? "pointer" : ""; }
    function zoneAtPx(px) { for (const o of zoneObjs) if (campus.inPoly(px, o.z.polygon)) return o.z.id; return null; }

    // ---------------- 相机 & 控件 ----------------
    const controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.maxPolarAngle = THREE.MathUtils.degToRad(84);
    controls.minDistance = 30;
    controls.maxDistance = 1100;
    controls.screenSpacePanning = false;
    controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
    controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
    renderer.domElement.style.touchAction = "none";
    const HOME_T = new THREE.Vector3(10, 0, -10);
    const HOME_P = new THREE.Vector3(10 + 470, 320, -10 + 660); // 俯角约 21°，画面上方留出天空
    const INTRO_P = new THREE.Vector3(-900, 1300, 1500);
    camera.position.copy(INTRO_P);
    controls.target.copy(HOME_T);
    controls.update();
    let fly = null, touring = false;
    controls.addEventListener("start", () => { fly = null; stopTour(); });
    function flyTo(target, pos, ms) { fly = { t0: performance.now(), ms: ms || 1200, ft: controls.target.clone(), fp: camera.position.clone(), tt: target.clone(), tp: pos.clone() }; }
    function flyAround(t, dist, ms) {
      const dir = camera.position.clone().sub(controls.target); dir.y = 0;
      if (dir.lengthSq() < 1) dir.set(0.6, 0, 0.8);
      dir.normalize();
      const pos = t.clone().addScaledVector(dir, dist * 0.72); pos.y = t.y + dist * 0.62;
      flyTo(t, pos, ms);
    }
    $("eco-reset").onclick = () => { stopTour(); closePanel(); flyTo(HOME_T, HOME_P); };
    $("eco-top-view").onclick = () => { stopTour(); const t = controls.target.clone(); t.y = 0; flyTo(t, new THREE.Vector3(t.x, 900, t.z + 1)); };
    let tourIdx = 0, tourTimer = 0;
    function stopTour() { if (touring) { touring = false; $("eco-tour").setAttribute("aria-pressed", "false"); } }
    $("eco-tour").onclick = () => {
      touring = !touring;
      $("eco-tour").setAttribute("aria-pressed", String(touring));
      if (touring) { tourTimer = 0; tourIdx = 0; } else closePanel();
    };

    // ---------------- 详情面板 ----------------
    const panel = $("eco-panel");
    let outline = null, selItem = null;
    const outlineMat = new THREE.LineBasicMaterial({ color: "#ffb020" });
    function clearOutline() { if (outline) outline.forEach((o) => o.parent && o.parent.remove(o)); outline = null; }
    function closePanel() {
      panel.hidden = true; selZone = null; selItem = null; clearOutline();
      zoneObjs.forEach((o) => { o.label.classList.remove("is-active"); o.listBtn.classList.remove("is-active"); });
    }
    $("eco-panel-close").onclick = closePanel;
    function fillPanel(kicker, title, desc, chips, facts, photo, enterLabel) {
      $("eco-panel-kicker").textContent = kicker;
      $("eco-panel-title").textContent = title;
      $("eco-panel-desc").textContent = desc || "";
      $("eco-panel-chips").innerHTML = (chips || []).map((c) => '<span class="eco-chip">' + esc(c) + "</span>").join("");
      $("eco-panel-facts").innerHTML = (facts || []).map(([k, v]) => "<dt>" + esc(k) + "</dt><dd>" + esc(v) + "</dd>").join("");
      const fig = $("eco-panel-fig");
      fig.hidden = !photo;
      if (photo) { $("eco-panel-img").src = photo; $("eco-panel-img").alt = title + " 实景照片"; }
      $("eco-panel-enter").hidden = !enterLabel;
      if (enterLabel) $("eco-panel-enter").textContent = enterLabel;
      panel.hidden = false;
      panel.scrollTop = 0;
    }
    const SEASON_NAME = { spring: "春季", summer: "夏季", autumn: "秋季", winter: "冬季" };
    function selectZone(id, fromTour) {
      const o = zoneById[id];
      if (!o) return;
      if (!fromTour) stopTour();
      clearOutline(); selItem = null;
      selZone = o;
      zoneObjs.forEach((x) => { x.label.classList.toggle("is-active", x === o); x.listBtn.classList.toggle("is-active", x === o); });
      const z = o.z;
      fillPanel(
        "生态板块 · " + SEASON_NAME[state.season],
        (z.icon ? z.icon + " " : "") + z.name,
        z.intro,
        z.highlights,
        [["板块编号", z.id], ["树木（示意）", o.trees + " 株"], ["对应区域编码", z.area_code || "待关联"], ["当前天气", state.weatherText]],
        null,
        z.detail_scene ? "进入板块细节 3D 场景 →" : "进入板块细节（建设中）"
      );
      const t = o.pos.clone(); t.y = 0;
      flyAround(t, z.camera_distance || 260, 1400);
    }
    // 进入板块细节：有 detail_scene 的板块镜头俯冲 + 淡出后跳转到细节场景；其他板块仍提示建设中
    $("eco-panel-enter").onclick = () => {
      const z = selZone ? selZone.z : null;
      if (!z || !z.detail_scene) {
        toast("「" + (z ? z.name : "该板块") + "」细节场景建设中：将接入板块细节 3D 场景、动植物增删与人脸识别跳转。");
        return;
      }
      enterDetail(selZone);
    };
    let entering = false;
    function enterDetail(o) {
      if (entering) return;
      entering = true;
      stopTour();
      const z = o.z, t = o.pos.clone(); t.y = 0;
      const dir = camera.position.clone().sub(t); dir.y = 0;
      if (dir.lengthSq() < 1) dir.set(0.6, 0, 0.8);
      dir.normalize();
      flyTo(t, t.clone().addScaledVector(dir, 22).setY(18), 1300);   // 镜头俯冲到板块上方
      let url = BASE + z.detail_scene + (z.detail_scene.indexOf("?") >= 0 ? "&" : "?") + "zone=" + encodeURIComponent(z.id) + "&back=" + encodeURIComponent(location.pathname);
      if (state.demoWeather !== "auto") url += "&weather=" + encodeURIComponent(state.demoWeather);
      if (state.demoSeason !== "auto") url += "&season=" + encodeURIComponent(state.demoSeason);
      if (!state.timeAuto) url += "&hour=" + state.demoHours.toFixed(2);
      const veil = el("div", "eco-dive", '<div class="eco-dive-inner"><div class="eco-dive-ring"></div><p>正在进入「' + esc(z.name) + '」细节场景…</p></div>');
      root.appendChild(veil);
      requestAnimationFrame(() => veil.classList.add("is-on"));
      setTimeout(() => { location.href = url; }, 1250);
    }
    // 从细节场景用浏览器“后退”回来（页面缓存恢复）时撤掉过渡遮罩
    window.addEventListener("pageshow", (e) => {
      if (!e.persisted) return;
      entering = false;
      root.querySelectorAll(".eco-dive").forEach((v) => v.remove());
    });
    window.__ecoEnterDetail = (id) => { const o = zoneById[id]; if (o) { selectZone(id); enterDetail(o); } };
    function selectItem(it) {
      stopTour();
      selZone = null;
      zoneObjs.forEach((x) => { x.label.classList.remove("is-active"); x.listBtn.classList.remove("is-active"); });
      selItem = it;
      clearOutline();
      outline = it.meshes.filter((m) => m.geometry && m.geometry.type !== "TubeGeometry" && !m.userData.noOutline).map((m) => {
        const l = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry, 25), outlineMat); l.position.y = 0.05; m.add(l); return l;
      });
      const facts = [];
      if (it.building) facts.push(["高度", "约 " + it.h + " 米（示意）"]);
      if (it.road) facts.push(["临街", it.road]);
      if (it.note) facts.push(["说明", it.note]);
      if (it.model) facts.push(["建模方式", it.model]);
      const zid = zoneAtPx([it.pos.x / campus.S + 1024, it.pos.z / campus.S + 999]);
      if (zid) facts.push(["所属板块", zoneById[zid].z.name]);
      const ph = it.info && it.info.photo ? BASE + "img/" + it.info.photo + ".jpg" : null;
      fillPanel(it.cat + " · " + it.kind, it.name, (it.info && it.info.desc) || "", [], facts, ph, null);
      const t = it.pos.clone(); t.y = it.building ? it.h * 0.4 : 0;
      flyAround(t, it.building ? Math.max(150, it.h * 6) : 170, 1000);
    }

    // ---------------- 拾取：建筑优先，其次板块 ----------------
    const ray = new THREE.Raycaster(); ray.layers.enable(campus.PICK_LAYER);   // 建筑拾取网格在单独图层（不渲染）
    const ndc = new THREE.Vector2(), groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -1), hitP = new THREE.Vector3();
    function setNDC(e) { const r = renderer.domElement.getBoundingClientRect(); ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); ray.setFromCamera(ndc, camera); }
    function groundPx() { if (!ray.ray.intersectPlane(groundPlane, hitP)) return null; return [hitP.x / campus.S + 1024, hitP.z / campus.S + 999]; }
    const buildingPicks = campus.pickables;
    let down = null, lastMove = 0;
    renderer.domElement.addEventListener("pointerdown", (e) => (down = [e.clientX, e.clientY]));
    renderer.domElement.addEventListener("pointermove", (e) => {
      const now = performance.now();
      if (now - lastMove < 60 || e.buttons) return;
      lastMove = now;
      setNDC(e);
      const px = groundPx();
      hoverZone(px ? zoneAtPx(px) : null);
    });
    renderer.domElement.addEventListener("pointerleave", () => hoverZone(null));
    renderer.domElement.addEventListener("pointerup", (e) => {
      if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) return;
      setNDC(e);
      const hit = ray.intersectObjects(buildingPicks.filter((m) => m.visible), false)[0];
      const it = hit && campus.itemById[hit.object.userData.id];
      if (it && it.building) { selectItem(it); return; }
      const px = groundPx();
      const zid = px && zoneAtPx(px);
      if (zid) selectZone(zid);
      else if (it) selectItem(it);
    });

    // ---------------- 小地图 ----------------
    const mini = $("eco-mini"), mark = $("eco-mini-mark");
    mini.addEventListener("click", (e) => {
      const r = mini.getBoundingClientRect();
      const [x, z] = campus.W([((e.clientX - r.left) / r.width) * 2048, ((e.clientY - r.top) / r.height) * 1998]);
      const t = new THREE.Vector3(x, 0, z);
      stopTour();
      flyTo(t, camera.position.clone().sub(controls.target).add(t), 800);
    });

    // ---------------- 时间 / 季节 / 天气 状态 ----------------
    const state = {
      season: "autumn", weatherText: "—", weather: null, demoWeather: "auto", demoSeason: "auto",
      timeAuto: true, demoHours: 12, speed: 1, simOffsetMs: 0,
    };
    function nowMs() { return Date.now() + state.simOffsetMs; }
    function currentBJ() {
      const p = WX.beijingParts(nowMs());
      if (!state.timeAuto) { p.hours = state.demoHours; p.h = Math.floor(state.demoHours); p.mi = Math.floor((state.demoHours % 1) * 60); p.s = 0; }
      return p;
    }
    const W_CARD = { icon: $("eco-w-icon"), temp: $("eco-w-temp"), text: $("eco-w-text"), meta: $("eco-w-meta"), src: $("eco-w-src") };
    function weatherNow() {
      if (state.demoWeather !== "auto") {
        const code = Number(state.demoWeather);
        const base = state.weather || WX.virtualWeather(nowMs());
        const temp = code >= 71 && code <= 86 ? Math.min(base.temp, -1) : base.temp; // 演示下雪时温度不应高于 0°C
        return Object.assign({}, base, { code, temp, source: "demo", sourceText: "演示模式（手动切换）" });
      }
      return state.weather || WX.virtualWeather(nowMs());
    }
    function renderWeatherCard() {
      const w = weatherNow();
      const d = WX.describe(w.code);
      state.weatherText = d.text + " " + Math.round(w.temp) + "°C";
      const bjNow = currentBJ();
      const isNight = WX.sunPosition(bjNow.doy, bjNow.hours).elevation < -2;
      W_CARD.icon.textContent = isNight && d.kind === "clear" ? "🌙" : isNight && d.kind === "partly" ? "☁️" : d.icon;
      W_CARD.temp.textContent = (Math.round(w.temp * 10) / 10) + "°C";
      W_CARD.text.textContent = d.text + " · " + SEASON_NAME[state.season];
      W_CARD.meta.textContent = "风速 " + (w.wind != null ? Math.round(w.wind) + " km/h" : "—") + (w.time ? " · 观测 " + String(w.time).slice(11, 16) : "");
      W_CARD.src.textContent = "数据来源：" + w.sourceText;
      W_CARD.src.className = "eco-w-src " + (w.source === "virtual" ? "is-virtual" : w.source === "demo" ? "is-demo" : "is-live");
    }
    function refreshWeather() {
      WX.load({ proxyUrl: CFG.weatherApi }).then((w) => {
        // 虚拟天气不缓存，交给 weatherNow() 实时按时段计算
        state.weather = w.source === "virtual" ? null : w;
        if (w.source === "virtual") state.virtualMode = true;
        renderWeatherCard();
      });
    }
    refreshWeather();
    setInterval(refreshWeather, 10 * 60 * 1000);
    $("eco-weather").addEventListener("click", () => toggleDemo());

    // ---------------- 演示面板 ----------------
    const demo = $("eco-demo");
    function toggleDemo(force) { demo.hidden = force != null ? !force : !demo.hidden; }
    $("eco-demo-btn").onclick = () => toggleDemo();
    $("eco-demo-close").onclick = () => toggleDemo(false);
    $("d-weather").onchange = (e) => { state.demoWeather = e.target.value; renderWeatherCard(); };
    $("d-season").onchange = (e) => { state.demoSeason = e.target.value; };
    $("d-time-auto").onchange = (e) => {
      state.timeAuto = e.target.checked; $("d-time").disabled = state.timeAuto;
      if (!state.timeAuto) { state.demoHours = currentBJRaw().hours; $("d-time").value = state.demoHours; }
    };
    function currentBJRaw() { return WX.beijingParts(nowMs()); }
    $("d-time").oninput = (e) => { state.demoHours = parseFloat(e.target.value); };
    $("d-speed").onchange = (e) => { state.speed = parseFloat(e.target.value); };
    $("d-reset").onclick = () => {
      Object.assign(state, { demoWeather: "auto", demoSeason: "auto", timeAuto: true, speed: 1, simOffsetMs: 0 });
      $("d-weather").value = "auto"; $("d-season").value = "auto"; $("d-time-auto").checked = true; $("d-time").disabled = true; $("d-speed").value = "1";
      renderWeatherCard();
    };
    window.addEventListener("keydown", (e) => {
      if (e.target && /input|select|textarea/i.test(e.target.tagName)) return;
      if (e.key === "w" || e.key === "W") toggleDemo();
      if (e.key === "Escape") { closePanel(); toggleDemo(false); }
    });
    // URL 参数便于截图/演示：?weather=61&season=winter&hour=21.5
    if (params.get("weather")) { state.demoWeather = params.get("weather"); $("d-weather").value = state.demoWeather; }
    if (params.get("season")) { state.demoSeason = params.get("season"); $("d-season").value = state.demoSeason; }
    if (params.get("hour")) { state.timeAuto = false; state.demoHours = parseFloat(params.get("hour")); $("d-time-auto").checked = false; $("d-time").disabled = false; $("d-time").value = state.demoHours; }
    if (params.get("demo") === "1") toggleDemo(true);

    function toast(msg) {
      const t = $("eco-toast");
      t.textContent = msg; t.hidden = false;
      clearTimeout(toast._t); toast._t = setTimeout(() => (t.hidden = true), 3800);
    }

    // ---------------- 昼夜 / 天气 -> 场景（池塘画风：pondWeatherPreset + pondSunLight，见 campus-look.js） ----------------
    const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
    let envCache = null, firstEnv = true;
    function applyEnvironment(dtReal) {
      if (!state.timeAuto && state.speed > 1) { state.demoHours = (state.demoHours + (dtReal * state.speed) / 3600) % 24; $("d-time").value = state.demoHours; }
      else if (state.timeAuto && state.speed > 1) state.simOffsetMs += dtReal * 1000 * (state.speed - 1);
      const bj = currentBJ();
      const season = state.demoSeason !== "auto" ? state.demoSeason : WX.seasonOfMonth(bj.mo);
      const nightNow = WX.sunPosition(bj.doy, bj.hours).elevation < -2;
      if (season !== state.season || nightNow !== state.lastNight) { state.season = season; state.lastNight = nightNow; renderWeatherCard(); }
      const sp = WX.sunPosition(bj.doy, bj.hours);
      const el = sp.elevation;
      const w = weatherNow();
      const d = WX.describe(w.code);
      const snow = d.kind === "snow" ? Math.max(d.snow, 0.8) : 0;
      const env = { cloud: d.cloud, rain: d.rain, snow, fog: d.fog, thunder: d.thunder, wind: w.wind || 8, season };
      // 平滑过渡，避免切换天气时跳变（粒子量等）
      if (!envCache) envCache = Object.assign({}, env);
      ["cloud", "rain", "snow", "fog"].forEach((k) => (envCache[k] += (env[k] - envCache[k]) * Math.min(1, dtReal * 0.8)));
      envCache.thunder = env.thunder; envCache.wind = env.wind; envCache.season = season;
      const E = envCache;
      const night = ss(2, -8, el);   // 与池塘相同：太阳高度 < -2° 进入夜晚，-8° 完全入夜
      look.setEnvironment({ elevDeg: el, dir: sp.dir, night, kind: d.kind, season, flash: life.flash, windKmh: w.wind || 8, immediate: firstEnv }, dtReal);
      firstEnv = false;
      state.sceneLabel = look.state.label;
      life.setEnvironment({ night, cloud: E.cloud, rain: E.rain, snow: E.snow, fog: E.fog, thunder: E.thunder, wind: E.wind, season, letter: look.state.letter });
      // 时钟
      const pad = (n) => String(n).padStart(2, "0");
      $("d-time-out").textContent = pad(bj.h) + ":" + pad(bj.mi) + (state.timeAuto ? "（北京时间）" : "（演示）");
      $("eco-time").textContent = pad(bj.h) + ":" + pad(bj.mi) + (state.timeAuto && state.speed === 1 ? ":" + pad(bj.s) : "");
      $("eco-date").textContent = "北京时间 · " + bj.mo + "月" + bj.day + "日 · " + SEASON_NAME[season] + (state.timeAuto && state.speed === 1 ? "" : "（演示）") + " · 太阳高度 " + Math.round(el) + "°";
    }

    // ---------------- 标签位置 ----------------
    const v = new THREE.Vector3();
    function placeLabels() {
      const w = stage.clientWidth, h = stage.clientHeight;
      zoneObjs.forEach((o) => {
        v.copy(o.pos).project(camera);
        const off = v.z > 1 || v.x < -1.15 || v.x > 1.15 || v.y < -1.15 || v.y > 1.15;
        o.label.hidden = off;
        if (off) return;
        const x = (v.x * 0.5 + 0.5) * w, y = (-v.y * 0.5 + 0.5) * h;
        o.label.style.transform = "translate(" + x.toFixed(1) + "px," + y.toFixed(1) + "px) translate(-50%,-100%)";
        const hl = o.z.id === hoverId, act = selZone === o;
        o.label.classList.toggle("is-hover", hl);
        o.fillMat.opacity += ((act ? 0.22 : hl ? 0.3 : 0.06) - o.fillMat.opacity) * 0.2;
        o.lineMat.opacity = act || hl ? 1 : 0.6;
      });
      const t = controls.target;
      mark.style.left = ((t.x / campus.S + 1024) / 2048) * 100 + "%";
      mark.style.top = ((t.z / campus.S + 999) / 1998) * 100 + "%";
      const dx = t.x - camera.position.x, dz = t.z - camera.position.z;
      mark.style.setProperty("--a", (Math.atan2(-dx, dz) * 180) / Math.PI + "deg");
    }

    function resize() { look.resize(); }
    new ResizeObserver(resize).observe(stage);
    resize();

    // ---------------- 画质：清晰 / 流畅（与池塘共用 PondQuality；未手动选择时按实测帧率自动降档） ----------------
    const gfx = PondQuality.button(); gfx.id = "eco-gfx";
    document.querySelector(".eco-toolbar").appendChild(gfx);
    PondQuality.onChange((mode) => { look.setQuality(mode); life.setQuality(mode); });

    // ---------------- 主循环 ----------------
    const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
    let last = performance.now(), t0 = last, frames = 0, fpsT = last, fps = 60, lowFor = 0, sinceStart = 0;
    let envTimer = 0;
    const renderStats = { calls: 0, triangles: 0 };
    window.__eco = { state, camera, controls, scene, renderer, life, campus, look, selectZone, selectItem, renderStats, get fps() { return fps; } };
    function tick(now) {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const t = (now - t0) / 1000;
      if (fly) {
        const k = Math.min(1, (now - fly.t0) / fly.ms), e = ease(k);
        controls.target.lerpVectors(fly.ft, fly.tt, e);
        camera.position.lerpVectors(fly.fp, fly.tp, e);
        if (k >= 1) fly = null;
      }
      if (touring && !fly) {
        tourTimer -= dt;
        if (tourTimer <= 0) { selectZone(zoneObjs[tourIdx % zoneObjs.length].z.id, true); tourIdx++; tourTimer = 7; }
        else { // 缓慢环绕
          const off = camera.position.clone().sub(controls.target);
          off.applyAxisAngle(new THREE.Vector3(0, 1, 0), dt * 0.08);
          camera.position.copy(controls.target).add(off);
        }
      }
      controls.update();
      camera.updateMatrixWorld();
      envTimer -= dt;
      if (envTimer <= 0) { applyEnvironment(0.25 + Math.max(0, -envTimer)); envTimer = 0.25; } // 环境每 0.25 秒更新一次足够平滑
      life.update(dt, t, camera, controls.target);
      renderer.info.autoReset = false; renderer.info.reset();
      look.render(dt, t, controls.target);
      renderStats.calls = renderer.info.render.calls; renderStats.triangles = renderer.info.render.triangles;
      placeLabels();
      frames++;
      if (now - fpsT > 1000) {
        sinceStart += (now - fpsT) / 1000;
        fps = (frames * 1000) / (now - fpsT); frames = 0; fpsT = now;
        // 未手动选择画质时：连续 4 秒低于 40 fps 自动切到“流畅”，提示里可一键恢复清晰
        if (!PondQuality.explicit && PondQuality.mode === "clear" && sinceStart > 6 && document.visibilityState === "visible") {
          if (fps < 40) { if (++lowFor >= 4) { lowFor = 0; PondQuality.set("smooth", false); PondQuality.degradeToast("帧率偏低，已自动切换到“流畅”画质"); } }
          else lowFor = 0;
        }
        if (!demo.hidden) $("d-stats").textContent = "帧率 " + fps.toFixed(0) + " fps · 画质 " + (look.quality === "clear" ? "清晰" : "流畅") + " · 像素比 " + renderer.getPixelRatio().toFixed(2) +
          " · draw calls " + renderStats.calls + " · 三角形 " + (renderStats.triangles / 1000).toFixed(0) + "k · 树 " + life.stats.trees + "（近 " + life.stats.lod.near + "）· 路灯 " + life.stats.lamps + " · 鸟 " + life.stats.birds;
      }
      requestAnimationFrame(tick);
    }
    applyEnvironment(0);
    renderWeatherCard();
    look.updateEnv();
    renderer.compile(scene, camera);
    progress(100, "生态校园已就绪");
    requestAnimationFrame(tick);

    // ---------------- 进入动画 ----------------
    const enterBtn = $("eco-enter");
    enterBtn.hidden = false;
    let entered = false;
    function enter() {
      if (entered) return;
      entered = true;
      $("eco-loader").classList.add("is-done");
      document.body.classList.add("eco-entered");
      setTimeout(() => { const l = $("eco-loader"); if (l) l.remove(); }, 1200);
      flyTo(HOME_T, HOME_P, 2600);
    }
    enterBtn.onclick = enter;
    if (params.get("autostart") === "1") enter();
    else if (CFG.autoEnterMs > 0) setTimeout(enter, CFG.autoEnterMs);
    if (params.get("zone")) setTimeout(() => selectZone(params.get("zone")), params.get("autostart") === "1" ? 50 : CFG.autoEnterMs + 2700);
  }
})();
