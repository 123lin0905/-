/*
 * 板块细节场景外壳（C 区宿舍庭院 dorm-c/、运动场周边 sports/ 共用）—— 池塘同款写实画风
 * ------------------------------------------------------------------------------
 * 渲染：campus-look.js（EcoLook：池塘的 Preetham 天空 + 云层 + 星月、天空 IBL、太阳 / 月光、阴影、ACES 色调映射与后期、
 *       池塘水面简化版），pond-style-core.js / pond-style.js 只读复用（程序化纹理、叶片卡、天气预设、画质档 PondQuality）；
 * 生态：eco-life.js（EcoLife：池塘同款树木 + 公告板 LOD、灌木花丛、路灯、鸟群、小猫追蝴蝶、雨 / 雪 / 花瓣 / 落叶 / 萤火虫粒子）
 *       通过适配对象接入本板块的树位、道路与草坪；
 * 镜头：free-camera.js（自由镜头，与全景 / 池塘 / 中心草坪统一）+ 本文件的电影镜头（全场景连续巡游，景点处放慢并显示字幕）；
 * 天气 / 昼夜 / 季节：eco-weather.js（服务器代理 → Open-Meteo 直连 → 虚拟天气；北京时间太阳位置；按月份的季节），可在工具条演示切换；
 * 动植物增删：species-editor.js + zone-species.js（与池塘相同的栽种 / 移植 / 移除动画、保存到 /api/zones/{id}/species）。
 * 用法：ZoneKit.start(cfg)（见 dorm-c/dorm-c-scene.js、sports/sports-scene.js）。
 * URL：?zone=<id>&back=<主页路径>、weather=<WMO 码>、season=spring|summer|autumn|winter、hour=0~24、gfx=clear|smooth|eco、
 *      view=<视角名>、tour=1（打开即电影镜头）、cam=x,y,z,tx,ty,tz（截图用机位）、speciesApi=<接口前缀>、test=1。
 */
(function (global) {
  "use strict";
  const THREE = global.THREE;
  const Q = new URLSearchParams(location.search);
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const easeIO = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const SEASON_NAME = { spring: "春", summer: "夏", autumn: "秋", winter: "冬" };
  const WEATHER_OPTS = [["auto", "自动"], ["0", "晴"], ["2", "多云"], ["3", "阴"], ["61", "小雨"], ["65", "大雨"], ["95", "雷阵雨"], ["71", "雪"], ["45", "雾"]];

  function shell(cfg) {
    const viewBtns = (cfg.viewButtons || []).map((v) => '<button type="button" data-view="' + esc(v.id) + '" title="' + esc(v.title || v.label) + '">' + esc(v.label) + "</button>").join("");
    document.body.insertAdjacentHTML("beforeend", `
<div id="zk-stage"></div>
<div id="zk-labels" aria-hidden="true"></div>
<div id="loader"><h1>${esc(cfg.icon)} ${esc(cfg.zoneName)} · 板块细节</h1><div class="bar"><i id="loadbar"></i></div><p id="loadmsg">准备中…</p></div>
<button id="zk-back" class="zk-glass zk-back" type="button" title="回到生态主页，镜头停在本板块">← 返回校园全景</button>
<section id="zk-zone" class="zk-glass zk-zone">
  <p class="zk-kicker">生态板块 · 细节场景</p>
  <h1 id="zk-name">${esc(cfg.icon)} ${esc(cfg.zoneName)}</h1>
  <p class="zk-intro" id="zk-intro">正在读取板块资料…</p>
  <p class="zk-tags" id="zk-tags"></p>
  <p class="zk-wx" id="zk-wx">天气读取中…</p>
  <p class="zk-time" id="zk-time">北京时间 --:--</p>
</section>
<div id="zk-gfx-host" class="zk-gfx-host"></div>
<aside id="zk-eco" class="zk-glass zk-eco">
  <header><b>${esc(cfg.panelTitle || cfg.zoneName + "生态")}</b><button class="zk-x" id="zk-fold" type="button" title="收起 / 展开">–</button></header>
  <p class="zk-eco-sub">本板块动植物 · 点击飞到对应物种</p>
  <div id="zk-se-host"></div>
  <div class="zk-eco-body" id="zk-eco-body"><p class="zk-muted">加载中…</p></div>
  <p class="zk-eco-note">${esc(cfg.ecoNote || "布局按学校官网绵阳校区三维导览图与平面图（0.4 米 / 像素）绘制；物种为按绵阳常见校园绿化设计的示意。")}</p>
</aside>
<div id="zk-bar" class="zk-glass zk-bar" role="toolbar" aria-label="场景控制">
  <button id="zk-cine" type="button" title="电影镜头：全场景连续巡游（C 键切换）">🎬 电影镜头</button>
  <button type="button" data-view="overview" title="整个板块总览">🗺️ 总览</button>${viewBtns}
  <label title="天气（默认实时天气）">天气<select id="zk-weather">${WEATHER_OPTS.map(([v, t]) => '<option value="' + v + '">' + t + "</option>").join("")}</select></label>
  <label title="季节（默认按北京时间月份）">季节<select id="zk-season"><option value="auto">自动</option><option value="spring">春</option><option value="summer">夏</option><option value="autumn">秋</option><option value="winter">冬</option></select></label>
  <label title="时间（默认北京时间）">时间<select id="zk-tod"><option value="auto">自动</option><option value="7.2">清晨</option><option value="12">正午</option><option value="16">午后</option><option value="18.4">黄昏</option><option value="21.5">夜晚</option></select></label>
</div>
<p id="zk-caption" class="zk-caption" aria-live="polite"></p>
<p id="zk-hud" class="zk-hud"></p>
<p id="zk-help" class="zk-help">${esc(global.FreeCam ? global.FreeCam.HINT : "")} · C 电影镜头</p>
<div id="zk-card" class="zk-glass zk-card" hidden><button class="zk-x" id="zk-card-x" type="button">×</button><b id="zk-card-t"></b><p id="zk-card-d"></p></div>
<div id="zk-toast" class="zk-toast"></div>`);
  }

  async function start(cfg) {
    shell(cfg);
    const progress = (f, m) => { $("loadbar").style.width = (f * 100).toFixed(0) + "%"; if (m) $("loadmsg").textContent = m; };
    const fail = (e) => { console.error(e); $("loadmsg").textContent = "加载失败：" + (e && e.message || e); };
    let toastT = 0;
    const toast = (msg, ms) => { const t = $("zk-toast"); t.textContent = msg; t.classList.add("on"); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("on"), ms || 2800); };
    progress(0.05, "读取板块资料…");
    const zones = await fetch("../data/zones.json").then((r) => r.json()).catch(() => ({ zones: [] }));
    const zone = (zones.zones || []).find((z) => z.id === cfg.zoneId) || null;

    // ---------- 渲染器 / 画风层 ----------
    let renderer;
    try {
      if (!document.createElement("canvas").getContext("webgl2")) throw new Error("浏览器不支持 WebGL 2");
      renderer = new THREE.WebGLRenderer({ antialias: PondQuality.mode !== "eco", powerPreference: PondQuality.mode === "eco" ? "low-power" : "high-performance", stencil: false, preserveDrawingBuffer: Q.get("test") === "1" });
    } catch (e) { fail(new Error("此设备无法显示三维场景（" + e.message + "）")); return; }
    const stage = $("zk-stage"); stage.appendChild(renderer.domElement);
    renderer.domElement.tabIndex = 0; renderer.domElement.setAttribute("aria-label", cfg.zoneName + "三维场景");
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.3, 6000);
    const look = global.EcoLook.create({ renderer, scene, camera, quality: PondQuality.mode, waterLevel: cfg.waterLevel != null ? cfg.waterLevel : 0.1 });
    pondStyleProgress = async (f, msg) => { progress(0.1 + f * 0.4, msg); await new Promise((r) => setTimeout(r, 0)); };
    await buildTextures();
    progress(0.55, "生成地形、道路与建筑…"); await new Promise((r) => setTimeout(r, 0));

    const B = global.ZoneBuild.create(scene, look, { seed: cfg.seed || 7 });
    const R = cfg.region;
    const inRegion = (px, py) => px >= R.x0 && px <= R.x1 && py >= R.y0 && py <= R.y1;
    const surfaceY = (x, z) => (cfg.heightAt ? cfg.heightAt(x, z) : 0);
    const K = {
      THREE, cfg, zone, scene, camera, renderer, look, B, Q, toast, inRegion, surfaceY,
      classAt: (x, z, padM) => { const [px, py] = B.P(x, z); if (!inRegion(px, py)) return "out"; return B.classAt(px, py, (padM || 0) / B.S); },
    };
    // 底图：远处农田 + 板块范围草地
    {
      const outer = new THREE.Mesh(new THREE.CircleGeometry(4000, 48), B.M.outer);
      outer.rotation.x = -Math.PI / 2; outer.position.y = -0.4; outer.receiveShadow = true;
      { const uv = outer.geometry.attributes.uv, p = outer.geometry.attributes.position; for (let i = 0; i < uv.count; i++) uv.setXY(i, p.getX(i), p.getY(i)); }
      scene.add(outer);
      B.flat([[R.x0 - 60, R.y0 - 60], [R.x1 + 60, R.y0 - 60], [R.x1 + 60, R.y1 + 60], [R.x0 - 60, R.y1 + 60]], B.M.lawn, 0);
    }
    const built = cfg.build(K) || {};
    const fin = B.finish();
    progress(0.72, "种下花草树木…"); await new Promise((r) => setTimeout(r, 0));

    // ---------- 生态层（EcoLife 适配） ----------
    const L2 = cfg.life || {};
    const lifeLayout = {
      buildings: (L2.blockers || []).map((poly) => ({ poly })), water: (L2.water || []).map((poly, i) => ({ id: "w" + i, poly })),
      sports: (L2.courts || []).map((poly) => ({ poly })), plazas: (L2.plazas || []).map((poly) => ({ poly })),
      campus_roads: L2.roads || [], boundary: [[R.x0, R.y0], [R.x1, R.y0], [R.x1, R.y1], [R.x0, R.y1]],
    };
    const campus = {
      W: B.W, S: B.S, inPoly: B.inPoly, polyDist: B.polyDist, nightMats: B.nightMats,
      treeSpots: (n, avoid) => (L2.trees || []).filter((p) => !(avoid && avoid(p))).slice(0, n),
      waterDistPx: (p) => { let d = Infinity; lifeLayout.water.forEach((w) => (d = Math.min(d, B.inPoly(p, w.poly) ? 0 : B.polyDist(p, w.poly)))); return d; },
      roadDistPx: (p) => { let d = Infinity; (L2.roads || []).forEach((r) => (d = Math.min(d, B.polyDist(p, r.path, false) - r.width / 2))); return d; },
    };
    const lifeZones = L2.catLawn ? [{ id: "central_lawn", center: L2.catHome || B.centroid(L2.catLawn), polygon: L2.catLawn }] : [];
    const life = global.EcoLife.create(scene, campus, { zones: lifeZones, renderer, layout: lifeLayout, look });
    const treeW = life.treeSpots.map((p) => B.W(p));
    K.life = life;
    K.nearTree = (x, z, r) => treeW.find(([tx, tz]) => Math.hypot(tx - x, tz - z) < r) || null;

    // ---------- 拾取 ----------
    const pickRay = new THREE.Raycaster(); pickRay.layers.set(B.PICK_LAYER);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit = new THREE.Vector3();
    K.pickGround = (rc, out) => {
      const o = out || new THREE.Vector3();
      if (cfg.platforms) for (const pf of cfg.platforms) { plane.constant = -pf.y; if (rc.ray.intersectPlane(plane, hit) && B.inPoly(B.P(hit.x, hit.z), pf.poly)) { plane.constant = 0; return out ? o.copy(hit) : { x: hit.x, y: hit.y, z: hit.z }; } }
      plane.constant = 0;
      if (!rc.ray.intersectPlane(plane, hit)) return null;
      const [px, py] = B.P(hit.x, hit.z); if (!inRegion(px, py)) return out ? null : null;
      return out ? o.copy(hit) : { x: hit.x, y: 0, z: hit.z };
    };

    // ---------- 自由镜头 ----------
    const [bx0, bz0] = B.W([R.x0, R.y0]), [bx1, bz1] = B.W([R.x1, R.y1]);
    const span = Math.max(bx1 - bx0, bz1 - bz0);
    const controls = global.FreeCam.create({
      THREE, camera, dom: renderer.domElement, target: new THREE.Vector3(),
      bounds: { minX: bx0, maxX: bx1, minZ: bz0, maxZ: bz1, minY: 0, maxY: 60 },
      camBounds: { minX: bx0 - span, maxX: bx1 + span, minZ: bz0 - span, maxZ: bz1 + span, maxY: span * 1.6 },
      minDistance: 3, maxDistance: span * 1.5, minPolar: 0.001, maxPolar: THREE.MathUtils.degToRad(86),
      floor: (x, z) => surfaceY(x, z) + 1.4, targetFloor: (x, z) => surfaceY(x, z), focusDistance: 40, smooth: 9,
      pick: (rc, out) => K.pickGround(rc, out), moveSpeed: (r) => Math.min(120, Math.max(4, r * 0.4)), verticalSpeed: 0.4,
      enabled: () => !cine.on,
    });
    K.controls = controls;
    const VIEWS = Object.assign({ overview: cfg.overview }, cfg.views || {});
    let fly = null;
    function viewPos(v) {
      const t = new THREE.Vector3(v.t[0], v.t[1] || 0, v.t[2]);
      const p = t.clone().add(new THREE.Vector3(Math.sin(v.polar) * Math.sin(v.az), Math.cos(v.polar), Math.sin(v.polar) * Math.cos(v.az)).multiplyScalar(v.d));
      return [p, t];
    }
    function flyTo(p, t, ms) { fly = { p0: camera.position.clone(), t0: controls.target.clone(), p1: p.clone(), t1: t.clone(), k: 0, dur: (ms || 1400) / 1000 }; }
    function goView(name, ms) { const v = VIEWS[name]; if (!v) return; setCine(false); const [p, t] = viewPos(v); flyTo(p, t, ms); }
    K.goView = goView; K.flyTo = flyTo;
    K.flyToPoint = (x, z, d, ms) => {
      setCine(false);
      const dir = camera.position.clone().sub(controls.target); dir.y = 0; if (dir.lengthSq() < 0.01) dir.set(0.5, 0, 1); dir.normalize();
      const t = new THREE.Vector3(x, surfaceY(x, z) + 0.6, z), p = t.clone().addScaledVector(dir, d * 0.8); p.y = t.y + d * 0.6;
      flyTo(p, t, ms || 1200);
    };
    controls.addEventListener("start", () => { fly = null; });

    // ---------- 电影镜头（全场景连续巡游） ----------
    const cine = { on: false, u: 0, speed: 1, blend: 0, from: null, capIdx: -1 };
    const tourKeys = cfg.tour || [];
    const tp = new THREE.CatmullRomCurve3(tourKeys.map((k) => new THREE.Vector3(...k.p)), true, "centripetal");
    const tt = new THREE.CatmullRomCurve3(tourKeys.map((k) => new THREE.Vector3(...k.t)), true, "centripetal");
    const tourLen = tourKeys.length ? tp.getLength() : 1;
    const _cp = new THREE.Vector3(), _ct = new THREE.Vector3();
    function nearestU() {
      let best = 0, bd = Infinity;
      for (let i = 0; i < 200; i++) { const u = i / 200; tp.getPointAt(u, _cp); const d = _cp.distanceToSquared(camera.position); if (d < bd) { bd = d; best = u; } }
      return best;
    }
    function setCine(on) {
      on = !!on && tourKeys.length > 1;
      if (on === cine.on) return;
      cine.on = on; fly = null;
      $("zk-cine").classList.toggle("is-on", on); $("zk-cine").textContent = on ? "🕹 自由镜头" : "🎬 电影镜头";
      $("zk-cine").title = on ? "切换到自由镜头（C）" : "电影镜头：全场景连续巡游（C 键切换）";
      if (on) { cine.u = nearestU(); cine.blend = 0; cine.from = { p: camera.position.clone(), t: controls.target.clone() }; }
      else { $("zk-caption").classList.remove("on"); controls.sync(controls.target); }
    }
    K.setCine = setCine;
    function stepCine(dt) {
      // 景点附近放慢：按到最近关键帧的距离调速
      tp.getPointAt(cine.u, _cp);
      let dMin = Infinity, ki = -1;
      tourKeys.forEach((k, i) => { const d = Math.hypot(k.p[0] - _cp.x, k.p[1] - _cp.y, k.p[2] - _cp.z); if (d < dMin) { dMin = d; ki = i; } });
      const slow = 0.45 + 0.55 * ss(6, 40, dMin);
      const v = (cfg.tourSpeed || 9) * slow * cine.speed;
      cine.u = (cine.u + (v * dt) / tourLen) % 1;
      tp.getPointAt(cine.u, _cp); tt.getPointAt(cine.u, _ct);
      cine.blend = Math.min(1, cine.blend + dt / 2.5);
      const b = easeIO(cine.blend);
      camera.position.copy(cine.from.p).lerp(_cp, b);
      controls.target.copy(cine.from.t).lerp(_ct, b);
      camera.lookAt(controls.target);
      const cap = $("zk-caption");
      if (dMin < 30 && tourKeys[ki].cap) { if (cine.capIdx !== ki) { cine.capIdx = ki; cap.textContent = tourKeys[ki].cap; } cap.classList.add("on"); }
      else cap.classList.remove("on");
    }

    // ---------- 物种（动植物增删） ----------
    progress(0.82, "唤醒小动物…");
    const SP = global.ZoneSpecies.create(K, { zoneId: cfg.zoneId, zoneName: cfg.zoneName, catalog: cfg.species.catalog, seeds: cfg.species.seeds, apiBase: Q.get("speciesApi") || "../../api/zones/" });
    K.SP = SP;
    let editorCat = [];
    function renderList(counts) {
      const body = $("zk-eco-body");
      body.innerHTML = [["plant", "植物"], ["animal", "动物"]].map(([t, title]) => {
        const items = editorCat.filter((c) => c.type === t && !c.hidden);
        return "<h3>" + title + " <small>" + items.length + " 种</small></h3><ul>" + items.map((c) => '<li><button type="button" class="zk-sp" data-k="' + esc(c.key) + '"><span class="zk-sp-icon">' + esc(c.icon) +
          '</span><span class="zk-sp-main"><b>' + esc(c.name) + '<i class="zk-n" data-n="' + esc(c.key) + '">×' + ((counts && counts[c.key]) || 0) + "</i></b><span>" + esc(c.desc) + "</span></span></button></li>").join("") + "</ul>";
      }).join("") + (cfg.extraList ? cfg.extraList() : "");
      body.querySelectorAll(".zk-sp").forEach((b) => (b.onclick = () => flyToSpecies(b.getAttribute("data-k"), b)));
    }
    K.updateCounts = (c) => document.querySelectorAll(".zk-n[data-n]").forEach((el) => (el.textContent = "×" + (c[el.getAttribute("data-n")] || 0)));
    const flyIdx = {};
    function flyToSpecies(key, btn) {
      document.querySelectorAll(".zk-sp.is-active").forEach((x) => x.classList.remove("is-active")); if (btn) btn.classList.add("is-active");
      const ed = SP.editor, list = ed ? ed.inds.filter((i) => i.key === key && i.status === "active" && i.obj) : [], e = ed && ed.byKey[key];
      if (!list.length) { toast("场景里暂时没有「" + (e ? e.name : key) + "」，可以用“✏️ 管理动植物”添加"); return; }
      const i = (flyIdx[key] = ((flyIdx[key] == null ? -1 : flyIdx[key]) + 1) % list.length), ind = list[i], p = ind.obj.position;
      K.flyToPoint(p.x, p.z, e.type === "animal" ? 6 : 22, 1200);
      toast(e.icon + " " + e.name + (list.length > 1 ? "（第 " + (i + 1) + " / " + list.length + " " + (e.type === "animal" ? "只" : "株") + "）" : ""));
      if (ed.ED.on) ed.select(ind);
    }
    const started = SP.start(zone);
    const editor = started.editor; editorCat = started.catalog;
    renderList(editor.counts());
    if (!zone || zone.editable !== false || Q.get("test") === "1") editor.buildUI($("zk-se-host"));
    K.updateCounts(editor.counts());
    editor.load().then((n) => { global.__seLoaded = true; global.__seRows = n; K.updateCounts(editor.counts()); }).catch((e) => { console.warn(e); global.__seLoaded = true; });
    global.__se = editor;

    // ---------- 界面 ----------
    if (zone) {
      $("zk-name").textContent = (zone.icon ? zone.icon + " " : "") + zone.name;
      $("zk-intro").textContent = cfg.intro || zone.intro || "";
      $("zk-tags").innerHTML = (cfg.highlights || zone.highlights || []).map((h) => "<span>" + esc(h) + "</span>").join("");
      document.title = zone.name + " · 板块细节 - 智慧校园虚拟生态";
    } else { $("zk-intro").textContent = cfg.intro || ""; $("zk-tags").innerHTML = (cfg.highlights || []).map((h) => "<span>" + esc(h) + "</span>").join(""); }
    function backUrl() {
      let b = Q.get("back") || "";
      if (!/^\/[^/\\]/.test(b) && b !== "/") b = "../../ecohome.jsp";
      let u = b + (b.indexOf("?") >= 0 ? "&" : "?") + "zone=" + encodeURIComponent(cfg.zoneId) + "&autostart=1";
      if (ENV.weather !== "auto") u += "&weather=" + encodeURIComponent(ENV.weather);
      if (ENV.season !== "auto") u += "&season=" + encodeURIComponent(ENV.season);
      if (ENV.hour != null) u += "&hour=" + ENV.hour.toFixed(2);
      return u;
    }
    $("zk-back").onclick = () => { document.body.classList.add("zk-leaving"); const u = backUrl(); setTimeout(() => (location.href = u), 420); };
    $("zk-cine").onclick = () => setCine(!cine.on);
    document.querySelectorAll("#zk-bar [data-view]").forEach((b) => (b.onclick = () => goView(b.getAttribute("data-view"))));
    $("zk-fold").onclick = () => { const p = $("zk-eco"); p.classList.toggle("is-folded"); $("zk-fold").textContent = p.classList.contains("is-folded") ? "+" : "–"; };
    $("zk-card-x").onclick = () => ($("zk-card").hidden = true);
    const gfx = PondQuality.button(); $("zk-gfx-host").appendChild(gfx);
    PondQuality.onChange((mode) => { look.setQuality(mode); life.setQuality(mode); life.refreshLOD(camera.position); });

    // ---------- 环境：北京时间 / 天气 / 季节 ----------
    const WX = global.EcoWeather;
    const ENV = { weather: "auto", season: "auto", hour: null, live: null };
    if (Q.get("weather")) ENV.weather = Q.get("weather");
    if (Q.get("season")) ENV.season = Q.get("season");
    if (Q.get("hour")) ENV.hour = parseFloat(Q.get("hour"));
    $("zk-weather").value = WEATHER_OPTS.some((o) => o[0] === ENV.weather) ? ENV.weather : "auto";
    $("zk-season").value = ENV.season;
    $("zk-weather").onchange = (e) => { ENV.weather = e.target.value; envT = 0; };
    $("zk-season").onchange = (e) => { ENV.season = e.target.value; envT = 0; };
    $("zk-tod").onchange = (e) => { ENV.hour = e.target.value === "auto" ? null : parseFloat(e.target.value); envT = 0; };
    function loadWeather() {
      const proxy = Q.get("weatherProxy") || "../../api/weather";
      WX.load({ proxyUrl: proxy }).then((w) => { ENV.live = w; envT = 0; }).catch(() => { ENV.live = WX.virtualWeather(Date.now()); });
    }
    if (Q.get("test") === "1") ENV.live = WX.virtualWeather(Date.now()); else loadWeather();
    setInterval(() => { if (Q.get("test") !== "1") loadWeather(); }, 10 * 60 * 1000);
    let envCache = null, firstEnv = true, envT = 0;
    function applyEnv(dtReal) {
      const bj = WX.beijingParts(Date.now());
      if (ENV.hour != null) { bj.hours = ENV.hour; bj.h = Math.floor(ENV.hour); bj.mi = Math.floor((ENV.hour % 1) * 60); }
      const season = ENV.season !== "auto" ? ENV.season : WX.seasonOfMonth(bj.mo);
      const sp = WX.sunPosition(bj.doy, bj.hours), el = sp.elevation;
      const live = ENV.live || WX.virtualWeather(Date.now());
      const code = ENV.weather !== "auto" ? parseInt(ENV.weather, 10) : live.code;
      const d = WX.describe(code);
      const env = { cloud: d.cloud, rain: d.rain, snow: d.kind === "snow" ? Math.max(d.snow, 0.8) : 0, fog: d.fog, thunder: d.thunder, wind: live.wind || 8 };
      if (!envCache || firstEnv) envCache = Object.assign({}, env);
      ["cloud", "rain", "snow", "fog"].forEach((k) => (envCache[k] += (env[k] - envCache[k]) * Math.min(1, dtReal * 0.8)));
      envCache.thunder = env.thunder; envCache.wind = env.wind;
      const E = envCache, night = ss(2, -8, el);
      look.setEnvironment({ elevDeg: el, dir: sp.dir, night, kind: d.kind, season, flash: life.flash, windKmh: env.wind, immediate: firstEnv }, dtReal);
      firstEnv = false;
      life.setEnvironment({ night, cloud: E.cloud, rain: E.rain, snow: E.snow, fog: E.fog, thunder: E.thunder, wind: E.wind, season, letter: look.state.letter });
      SP.setSeason(season);
      const lamp = Math.min(1, Math.max(0, (night - 0.25) * 2 + E.fog * 0.3 + (E.rain > 0.5 ? 0.3 : 0)));
      B.floodMat.color.setRGB(0.3 + 5 * lamp, 0.3 + 4.6 * lamp, 0.3 + 4 * lamp);
      if (cfg.onEnv) cfg.onEnv({ night, season, lamp, E });
      document.body.classList.toggle("is-night", night > 0.5);
      const pad = (n) => String(n).padStart(2, "0");
      $("zk-time").textContent = "北京时间 " + bj.mo + "月" + bj.day + "日 " + pad(bj.h) + ":" + pad(bj.mi) + (ENV.hour != null ? "（演示）" : "") + " · " + SEASON_NAME[season] + (ENV.season !== "auto" ? "（演示）" : "") + (night > 0.5 ? " · 夜晚" : el < 8 ? " · 晨昏" : " · 白天");
      $("zk-wx").textContent = d.icon + " " + (ENV.weather !== "auto" ? d.text + "（演示）" : d.text + " " + (live.temp != null ? live.temp + "°C" : "") + " · " + (live.source === "virtual" ? "虚拟天气" : "实时天气"));
      K.env = { night, season, el, kind: d.kind };
    }

    // ---------- 标注（建筑 / 场地名） ----------
    const labels = [];
    const labHost = $("zk-labels");
    Object.values(B.items).filter((it) => it.label).forEach((it) => labels.push({ text: it.name, pos: it.pos, cls: "bld" }));
    (cfg.labels || []).forEach((l) => { const [x, z] = B.W(l.p); labels.push({ text: l.text, pos: new THREE.Vector3(x, l.h || 2, z), cls: l.cls || "site" }); });
    labels.forEach((l) => { const e = document.createElement("span"); e.className = "zk-lb zk-lb-" + l.cls; e.textContent = l.text; labHost.appendChild(e); l.el = e; });
    const _v = new THREE.Vector3();
    function placeLabels() {
      const w = stage.clientWidth, h = stage.clientHeight, dcam = camera.position.distanceTo(controls.target);
      for (const l of labels) {
        _v.copy(l.pos).project(camera);
        const dist = camera.position.distanceTo(l.pos);
        const off = _v.z > 1 || Math.abs(_v.x) > 1.05 || Math.abs(_v.y) > 1.05 || dist > Math.max(260, dcam * 2.4) || (l.cls === "bld" && dist < 12);
        l.el.style.display = off ? "none" : "";
        if (off) continue;
        l.el.style.transform = "translate(" + ((_v.x * 0.5 + 0.5) * w).toFixed(1) + "px," + ((-_v.y * 0.5 + 0.5) * h).toFixed(1) + "px) translate(-50%,-100%)";
        l.el.style.opacity = String(Math.max(0.35, Math.min(1, 1.6 - dist / Math.max(260, dcam * 2.4))));
      }
    }

    // ---------- 点击建筑：信息卡 ----------
    let downXY = null;
    renderer.domElement.addEventListener("pointerdown", (e) => { downXY = [e.clientX, e.clientY]; });
    renderer.domElement.addEventListener("pointerup", (e) => {
      if (!downXY || Math.hypot(e.clientX - downXY[0], e.clientY - downXY[1]) > 5 || e.button !== 0 || (editor && editor.ED.on)) return;
      const r = renderer.domElement.getBoundingClientRect(), ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      pickRay.setFromCamera(ndc, camera);
      const h = pickRay.intersectObjects(B.pickables, false)[0];
      if (h && h.object.userData.id && B.items[h.object.userData.id]) { const it = B.items[h.object.userData.id]; $("zk-card-t").textContent = it.name; $("zk-card-d").textContent = it.info || ""; $("zk-card").hidden = false; }
    });
    addEventListener("keydown", (e) => {
      if (e.target && /input|select|textarea/i.test(e.target.tagName)) return;
      if (e.code === "KeyC" && !e.ctrlKey && !e.metaKey) setCine(!cine.on);
      if (e.key === "Escape") $("zk-card").hidden = true;
    });

    // ---------- 尺寸 ----------
    function resize() { look.resize(); }
    new ResizeObserver(resize).observe(stage); resize();

    // ---------- 初始机位 ----------
    const camQ = (Q.get("cam") || "").split(",").map(Number);
    if (camQ.length === 6 && camQ.every((v) => isFinite(v))) { camera.position.set(camQ[0], camQ[1], camQ[2]); controls.target.set(camQ[3], camQ[4], camQ[5]); camera.lookAt(controls.target); }
    else { const [p, t] = viewPos(VIEWS[Q.get("view")] || VIEWS.overview); camera.position.copy(p); controls.target.copy(t); camera.lookAt(t); }
    controls.update(0);
    if (Q.get("tour") === "1") setCine(true);
    life.refreshLOD(camera.position);

    // ---------- 主循环 ----------
    applyEnv(0);
    let last = performance.now(), t0 = last, frames = 0, fpsT = last, fps = 0, capAcc = 0, capLast = -1;
    const stats = { calls: 0, triangles: 0, fps: 0 };
    global.__zk = { K, B, life, look, scene, camera, controls, renderer, editor, stats, setCine, goView, applyEnv, ENV, cine, fin, built };
    let hookList = [];
    K.onFrame = (f) => hookList.push(f);
    function tick(now) {
      requestAnimationFrame(tick);
      if (PondQuality.mode === "eco") {
        if (capLast < 0) capLast = now;
        capAcc += now - capLast; capLast = now;
        if (capAcc < 1000 / 30 - 1.5) return;
        capAcc = Math.min(capAcc - 1000 / 30, 1000 / 30);
      } else capLast = now;
      const dt = Math.min(0.1, (now - last) / 1000); last = now;
      frame(dt, (now - t0) / 1000);
      frames++;
      if (now - fpsT > 1000) {
        fps = (frames * 1000) / (now - fpsT); frames = 0; fpsT = now; stats.fps = fps;
        $("zk-hud").textContent = fps.toFixed(0) + " fps · " + PondQuality.name() + (PondQuality.mode === "eco" ? "（上限 30）" : "") + " · 批次 " + stats.calls + " · 三角形 " + (stats.triangles / 1000).toFixed(0) + "k";
      }
    }
    function frame(dt, t) {
      if (fly) {
        fly.k = Math.min(1, fly.k + dt / fly.dur); const k = easeIO(fly.k);
        camera.position.lerpVectors(fly.p0, fly.p1, k); controls.target.lerpVectors(fly.t0, fly.t1, k); camera.lookAt(controls.target);
        if (fly.k >= 1) fly = null;
      }
      if (cine.on) stepCine(dt); else controls.update(dt);
      camera.updateMatrixWorld();
      envT -= dt; if (envT <= 0) { applyEnv(0.25 + Math.max(0, -envT)); envT = 0.25; }
      if (!global.__seManual) editor.update(dt);
      for (const f of hookList) { try { f(dt, t); } catch (e) { console.error(e); } }
      life.update(dt, t, camera, controls.target);
      renderer.info.autoReset = false; renderer.info.reset();
      look.render(dt, t, controls.target);
      stats.calls = renderer.info.render.calls; stats.triangles = renderer.info.render.triangles;
      placeLabels();
      global.__zkFrames = (global.__zkFrames || 0) + 1;
    }
    K.renderOnce = (dt) => frame(dt || 0.016, (performance.now() - t0) / 1000);
    progress(1, "完成");
    requestAnimationFrame(tick);
    requestAnimationFrame(() => setTimeout(() => { $("loader").classList.add("done"); document.body.classList.add("zk-ready"); global.__zkReady = true;
      if (!Q.get("test")) global.FreeCam.hintOnce(cfg.zoneId, (m) => toast(m, 6000)); }, 60));
    return K;
  }

  global.ZoneKit = { start };
})(window);
