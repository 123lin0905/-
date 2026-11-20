/*
 * 板块细节场景工具包 · 主程序（ZK.start）——教学楼绿化带 teaching/、A 区宿舍生活区 dorm-a/ 共用
 * ------------------------------------------------------------------------------
 * 加载顺序：池塘同款程序化纹理（pond-style-core.js 的 buildTextures，IndexedDB 缓存）→ EcoLook（天空 / IBL / 光照 / 色调映射 / 后期）
 *   → 场景脚本 cfg.build(K) 按官方地图摆放地面、道路、建筑、树木、小品 → 合批 → 动植物编辑器 → 首帧。
 * 界面（全中文）：左上“← 返回校园全景”+ 板块卡片（zones.json 简介、实时天气、北京时间）；右侧“板块生态”清单（点击飞到物种）+
 *   “✏️ 管理动植物”；底部工具栏：🎬 电影镜头 / 🕹 自由镜头、视角、天气、季节、时间、画质；左下帧率 / 批次。
 * 快捷键：C 切换电影 / 自由镜头，T 轮换天气，N 昼夜切换，I 操作说明；自由镜头操作同全景（js/free-camera.js）。
 * URL 参数：zone、back、weather（WMO 码）、season、hour、gfx=clear|smooth|eco、tour=1（自动开始电影镜头）、view=<视角名>、
 *   speciesApi=<接口前缀>|none（none = 无后端演示模式）、edit=1（板块尚未开放编辑时也显示编辑按钮，便于联调）。
 */
(function (global) {
  "use strict";
  const THREE = global.THREE;
  const V3 = THREE.Vector3;
  const Q = new URLSearchParams(location.search);
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const SEASON_NAME = { spring: "春季", summer: "夏季", autumn: "秋季", winter: "冬季" };
  const WEATHER_API = Q.get("api") || "../../api/weather";
  const WX = global.EcoWeather;

  function el(tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }

  async function start(cfg) {
    const zoneId = Q.get("zone") || cfg.zoneId;
    const state = { demoWeather: Q.get("weather") || "auto", demoSeason: Q.get("season") || "auto", timeAuto: !Q.get("hour"), demoHours: parseFloat(Q.get("hour") || "12"), weather: null, flash: 0, nextFlash: 4 };
    // ---------------- 界面骨架 ----------------
    document.body.classList.add("zk");
    const loader = el("div", "zk-loader", '<h1>' + esc(cfg.icon + " " + cfg.title) + ' · 板块细节</h1><div class="zk-bar"><i></i></div><p>准备中…</p>');
    document.body.appendChild(loader);
    const setLoad = (k, msg) => { loader.querySelector("i").style.width = Math.round(k * 100) + "%"; if (msg) loader.querySelector("p").textContent = msg; };
    const stage = el("div", "zk-stage"); document.body.appendChild(stage);
    const labelsHost = el("div", "zk-labels"); document.body.appendChild(labelsHost);
    const back = el("button", "zk-glass zk-back", "← 返回校园全景"); back.type = "button"; back.title = "回到生态主页，镜头停在本板块"; document.body.appendChild(back);
    const card = el("section", "zk-glass zk-card",
      '<p class="zk-kicker">生态板块 · 细节场景</p><h1>' + esc(cfg.icon + " " + cfg.title) + '</h1><p class="zk-intro">正在读取板块资料…</p><p class="zk-tags"></p>' +
      '<p class="zk-wx">天气读取中…</p><p class="zk-time">北京时间 --:--</p>');
    document.body.appendChild(card);
    const panel = el("aside", "zk-glass zk-eco",
      '<header><b>' + esc(cfg.title) + '生态</b><button type="button" class="zk-x" title="收起 / 展开">–</button></header><p class="zk-sub">本板块动植物 · 点击飞到对应物种</p>' +
      '<div class="zk-se-host"></div><div class="zk-eco-body"><p class="zk-muted">加载中…</p></div><p class="zk-note">原有个体按官方地图（手绘鸟瞰图）与平面图位置种植；数量为当前场景中的个体数，增删后实时更新。</p>');
    document.body.appendChild(panel);
    panel.querySelector(".zk-x").onclick = () => panel.classList.toggle("is-folded");
    const bar = el("div", "zk-glass zk-toolbar");
    bar.innerHTML =
      '<button type="button" data-a="tour" title="电影镜头：沿板块连续巡游（C）">🎬 电影镜头</button>' +
      '<span class="zk-views"></span>' +
      '<label title="天气（默认实时天气）">天气<select data-s="weather"><option value="auto">自动</option><option value="0">晴</option><option value="2">多云</option><option value="3">阴</option><option value="61">小雨</option><option value="65">大雨</option><option value="95">雷阵雨</option><option value="71">雪</option><option value="45">雾</option></select></label>' +
      '<label title="季节（默认按北京时间月份）">季节<select data-s="season"><option value="auto">自动</option><option value="spring">春</option><option value="summer">夏</option><option value="autumn">秋</option><option value="winter">冬</option></select></label>' +
      '<label title="昼夜（默认按北京时间太阳高度）">时间<select data-s="time"><option value="auto">自动</option><option value="7.2">清晨</option><option value="11">白天</option><option value="17.6">黄昏</option><option value="21.5">夜晚</option></select></label>';
    document.body.appendChild(bar);
    const hud = el("p", "zk-hud"); document.body.appendChild(hud);
    const help = el("p", "zk-help", "左键拖动旋转 · 右键 / Shift+拖动平移 · 滚轮朝光标缩放 · WASD / 方向键移动 · Q / E 升降 · 双击聚焦 · C 电影镜头 · T 天气 · N 昼夜");
    document.body.appendChild(help);
    const caption = el("div", "zk-caption"); document.body.appendChild(caption);
    const toastEl = el("div", "zk-toast"); document.body.appendChild(toastEl);
    const info = el("div", "zk-glass zk-info"); info.hidden = true; document.body.appendChild(info);
    function toast(msg, ms) { toastEl.textContent = msg; toastEl.classList.add("is-on"); clearTimeout(toast._t); toast._t = setTimeout(() => toastEl.classList.remove("is-on"), ms || 3200); }
    if (state.demoWeather !== "auto") bar.querySelector('[data-s="weather"]').value = state.demoWeather;
    if (state.demoSeason !== "auto") bar.querySelector('[data-s="season"]').value = state.demoSeason;

    // ---------------- 渲染器 / 场景 ----------------
    let flora = null;
    const quality = global.PondQuality ? PondQuality.mode : "clear";
    const renderer = new THREE.WebGLRenderer({ antialias: quality !== "eco", powerPreference: "high-performance", preserveDrawingBuffer: Q.get("test") === "1" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, quality === "clear" ? 2 : 1));
    stage.appendChild(renderer.domElement);
    renderer.domElement.tabIndex = 0;
    renderer.domElement.setAttribute("aria-label", cfg.title + "三维场景");
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, 1, 0.3, 4000);
    const look = EcoLook.create({ renderer, scene, camera, quality, waterLevel: -100 });
    look.resize(true);
    window.addEventListener("resize", () => look.resize());
    if (global.PondQuality) {
      const pq = PondQuality.button(); pq.classList.add("zk-pq"); document.body.appendChild(pq);
      PondQuality.onChange((m) => { look.setQuality(m); flora && flora.setQuality(m); });
    }

    // ---------------- 纹理 ----------------
    setLoad(0.03, "生成池塘同款程序化纹理（首次较慢，之后读取缓存）");
    pondStyleProgress = async (k, msg) => { setLoad(0.03 + k * 0.5, msg); await new Promise((r) => setTimeout(r, 0)); };
    await buildTextures();
    setLoad(0.55, "按官方地图搭建地面、道路与建筑");
    await new Promise((r) => setTimeout(r, 0));

    // ---------------- 世界 ----------------
    const world = ZKWorld.create({ scene, renderer, look, region: cfg.region, mosaicRot: cfg.mosaicRot || 0, res: cfg.res || 0.25 });
    if (cfg.mosaicOrigin) world.groundU.uMosO.value.set(cfg.mosaicOrigin[0], cfg.mosaicOrigin[1]);
    flora = ZKFlora.create(scene, { renderer, look });
    const W = world.W;
    const B = cfg.bounds;   // 平面图像素 [px0, py0, px1, py1]
    const [bx0, bz0] = W(B[0], B[1]), [bx1, bz1] = W(B[2], B[3]);
    const groundOk = (x, z, key) => {
      if (x < bx0 || x > bx1 || z < bz0 || z > bz1) return false;
      if (world.buildingAt(x, z, 0.3)) return false;
      const c = world.classAt(x, z);
      if (c === "out" || c === "asphalt") return false;
      if (key === "cat" && c === "court") return false;
      return true;
    };
    const life = ZKLife.create(scene, { look, renderer, groundOk, groundY: (x, z) => world.groundY(x, z), home: new V3((bx0 + bx1) / 2, 0, (bz0 + bz1) / 2), flockR: Math.max(bx1 - bx0, bz1 - bz0) * 0.35 });
    const SEEDS = [];
    const K = {
      world, flora, life, scene, look, renderer, W, S: world.S,
      plant(key, x, z, o) { SEEDS.push({ key, x, z, rot: o && o.rot != null ? o.rot : null, scale: o && o.scale }); },
      plantPx(key, px, py, o) { const [x, z] = W(px, py); K.plant(key, x, z, o); },
      animal(key, x, z) { SEEDS.push({ key, x, z, animal: true }); },
      decor(key, x, z, rot, scale) { const g = flora.make(key); g.position.set(x, world.groundY(x, z), z); g.rotation.y = rot || 0; g.scale.setScalar(scale || 1); scene.add(g); return g; },
      // 沿路径种植（世界坐标路径），返回点列
      row(key, pathW, step, offset, o) { const pts = world.along(pathW, step, offset || 0, o && o.start); pts.forEach((p) => (o && o.decor ? K.decor(key, p.x, p.z, Math.atan2(-p.dir[1], p.dir[0])) : K.plant(key, p.x, p.z, o))); return pts; },
      // 是否为可种植的草地（需先 world.bake()）：中心与周围一圈都是草地 / 种植土，且离建筑足够远
      greenOK(x, z, clear, bmargin) {
        const ok = (c) => c === "grass" || c === "soil";
        if (!ok(world.classAt(x, z))) return false;
        for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; if (!ok(world.classAt(x + Math.cos(a) * clear, z + Math.sin(a) * clear))) return false; }
        return !world.buildingAt(x, z, bmargin != null ? bmargin : clear + 1);
      },
      // 在世界矩形内随机散植（确定性随机），keys：[[key, 权重], ...]
      fill(o) {
        const tot = o.keys.reduce((a, k) => a + k[1], 0);
        const placed = SEEDS.filter((s) => !s.animal);
        let n = 0, tries = 0;
        while (n < o.n && tries < o.n * 60) {
          tries++;
          const x = o.area[0] + world.rnd() * (o.area[2] - o.area[0]), z = o.area[1] + world.rnd() * (o.area[3] - o.area[1]);
          if (o.inside && !world.inPoly(x, z, o.inside)) continue;
          if (!K.greenOK(x, z, o.clear || 2.5, o.bmargin)) continue;
          if (o.avoid && o.avoid(x, z)) continue;
          if (placed.some((s) => Math.hypot(s.x - x, s.z - z) < (o.minDist || 7))) continue;
          let r = world.rnd() * tot, key = o.keys[0][0];
          for (const k of o.keys) { r -= k[1]; if (r <= 0) { key = k[0]; break; } }
          K.plant(key, x, z); placed.push({ x, z }); n++;
        }
        return n;
      },
      // 沿路径种行道树，只在可种植处
      street(key, pathW, step, offset, clear) {
        const pts = world.along(pathW, step, offset, step / 2);
        const placed = SEEDS.filter((s) => !s.animal);
        let n = 0;
        for (const p of pts) {
          if (!K.greenOK(p.x, p.z, clear || 1.2, 3)) continue;
          if (placed.some((s) => Math.hypot(s.x - p.x, s.z - p.z) < step * 0.7)) continue;
          K.plant(key, p.x, p.z); placed.push({ x: p.x, z: p.z }); n++;
        }
        return n;
      },
      hedgeRow(pathW, offset, key) { const pts = world.along(pathW, 3.0, offset || 0, 1.5); pts.forEach((p) => K.decor(key || "hedge", p.x, p.z, Math.atan2(-p.dir[1], p.dir[0]))); return pts; },
    };
    flora.prewarm(["ginkgo", "camphor", "cherry", "osmanthus", "jacaranda", "privet", "shrub_ball", "hedge", "flowerbed"].concat(cfg.extraFlora || []));
    await cfg.build(K);
    world.finishGround(); world.finishBuildings(); world.finishMeshes(); world.finishDecals(); world.finishLamps(); world.finishCars();
    setLoad(0.8, "加载雕塑与动植物");

    // ---------------- 镜头 ----------------
    const target = new V3();
    const groundPlane = new THREE.Plane(new V3(0, 1, 0), 0);
    const pickGround = (rc, out) => { const p = rc.ray.intersectPlane(groundPlane, out || new V3()); if (!p) return null; if (p.x < bx0 - 80 || p.x > bx1 + 80 || p.z < bz0 - 80 || p.z > bz1 + 80) return null; p.y = world.groundY(p.x, p.z); return p; };
    const controls = FreeCam.create({
      THREE, camera, dom: renderer.domElement, target,
      bounds: { minX: bx0, maxX: bx1, minZ: bz0, maxZ: bz1, minY: 0, maxY: 60 },
      camBounds: { minX: bx0 - 220, maxX: bx1 + 220, minZ: bz0 - 220, maxZ: bz1 + 220, maxY: 420 },
      minDistance: 3, maxDistance: cfg.maxDistance || 420, minPolar: 0.05, maxPolar: 1.48,
      floor: (x, z) => world.groundY(x, z) + 1.2, targetFloor: (x, z) => world.groundY(x, z), focusDistance: 40, smooth: 10,
      pick: pickGround, moveSpeed: (r) => clamp(r * 0.6, 4, 160), verticalSpeed: 0.4,
      enabled: () => !tour.on, onStart: () => { stopFly(); if (tour.on) setTour(false); },
    });
    const VIEWS = {};
    function viewOf(v) {   // v: { t:[px,py,y], d, el（度，俯仰）, az（度，0 = 从南往北看） }
      const [tx, tz] = W(v.t[0], v.t[1]); const t = new V3(tx, v.t[2] || 0, tz);
      const el2 = (v.el != null ? v.el : 35) * Math.PI / 180, az = (v.az || 0) * Math.PI / 180;
      const p = t.clone().add(new V3(Math.sin(az) * Math.cos(el2), Math.sin(el2), Math.cos(az) * Math.cos(el2)).multiplyScalar(v.d));
      return [p, t];
    }
    let fly = null;
    function flyTo(p, t, ms) { fly = { p0: camera.position.clone(), t0: target.clone(), p1: p.clone(), t1: t.clone(), k: 0, dur: (ms || 1400) / 1000 }; }
    function stopFly() { fly = null; }
    function goView(name, ms) { const v = cfg.views[name]; if (!v) return; const [p, t] = viewOf(v); if (ms === 0) { camera.position.copy(p); target.copy(t); camera.lookAt(t); controls.sync(t); } else flyTo(p, t, ms); }
    function flyToPoint(x, z, dist, ms) { const t = new V3(x, world.groundY(x, z) + 1, z); const dir = camera.position.clone().sub(target); dir.y = 0; if (dir.lengthSq() < 1) dir.set(0, 0, 1); dir.normalize(); const p = t.clone().addScaledVector(dir, dist * 0.8).setY(t.y + dist * 0.55); flyTo(p, t, ms); }
    const viewsHost = bar.querySelector(".zk-views");
    Object.keys(cfg.views).forEach((name) => { if (cfg.views[name].hidden) return; const b = el("button", "", esc(cfg.views[name].icon || "📍") + " " + esc(name)); b.type = "button"; b.onclick = () => { setTour(false); goView(name); }; viewsHost.appendChild(b); });
    goView(Q.get("view") && cfg.views[Q.get("view")] ? Q.get("view") : Object.keys(cfg.views)[0], 0);

    // ---------------- 电影镜头（连续巡游） ----------------
    const tour = { on: false, u: 0, curveP: null, curveT: null, n: 0, ease: 0 };
    (function buildTour() {
      const wp = cfg.tour;
      const ps = [], ts = [];
      wp.forEach((w) => { const [p, t] = viewOf(w); ps.push(p); ts.push(t); });
      tour.curveP = new THREE.CatmullRomCurve3(ps, true, "centripetal");
      tour.curveT = new THREE.CatmullRomCurve3(ts, true, "centripetal");
      tour.n = wp.length;
    })();
    const _a = new V3(), _b = new V3();
    function setTour(on) {
      if (on === tour.on) return;
      tour.on = on;
      bar.querySelector('[data-a="tour"]').classList.toggle("is-on", on);
      bar.querySelector('[data-a="tour"]').textContent = on ? "🕹 自由镜头" : "🎬 电影镜头";
      if (on) {   // 从离当前相机最近的路径点接入
        let best = 0, bd = Infinity;
        for (let i = 0; i < 200; i++) { const d = tour.curveP.getPoint(i / 200).distanceTo(camera.position); if (d < bd) { bd = d; best = i / 200; } }
        tour.u = best; tour.ease = 0; tour.from = { p: camera.position.clone(), t: target.clone() };
        stopFly();
        toast("🎬 电影镜头：沿" + cfg.title + "连续巡游，拖动鼠标或按 C 回到自由镜头");
      } else { caption.classList.remove("is-on"); controls.sync(target); }
    }
    function updateTour(dt) {
      const e = 1e-3;
      tour.curveP.getPoint((tour.u + e) % 1, _a); tour.curveP.getPoint((tour.u - e + 1) % 1, _b);
      const dl = _a.distanceTo(_b) / (2 * e);
      // 靠近景点放慢
      const idx = tour.u * tour.n, near = Math.abs(idx - Math.round(idx));
      const sp = (cfg.tourSpeed || 9) * (0.45 + 0.55 * ss(0.05, 0.3, near));
      tour.u = (tour.u + (sp * dt) / Math.max(dl, 1e-3)) % 1;
      const p = tour.curveP.getPoint(tour.u), t = tour.curveT.getPoint(tour.u);
      tour.ease = Math.min(1, tour.ease + dt / 2.5);
      const k = ss(0, 1, tour.ease);
      camera.position.copy(tour.from.p).lerp(p, k);
      target.copy(tour.from.t).lerp(t, k);
      const fy = world.groundY(camera.position.x, camera.position.z) + 1.5; if (camera.position.y < fy) camera.position.y = fy;
      camera.lookAt(target);
      const w = cfg.tour[Math.round(idx) % tour.n];
      if (near < 0.18 && w.cap) { caption.innerHTML = "<b>" + esc(w.name) + "</b>" + esc(w.cap); caption.classList.add("is-on"); } else caption.classList.remove("is-on");
    }
    bar.querySelector('[data-a="tour"]').onclick = () => setTour(!tour.on);

    // ---------------- 标签（建筑名牌） ----------------
    const labels = world.LABELS.concat(cfg.labels ? cfg.labels(K) : []).map((L) => {
      const d = el("button", "zk-label", esc(L.name)); d.type = "button";
      d.onclick = () => { setTour(false); showInfo(L); flyToPoint(L.pos.x, L.pos.z, L.dist || 70, 1200); };
      labelsHost.appendChild(d);
      return Object.assign({ el: d }, L);
    });
    function showInfo(L) {
      const I = (global.INFO && global.INFO[L.id]) || {};
      const desc = (cfg.info && cfg.info[L.id]) || I.desc || "";
      info.innerHTML = '<button type="button" class="zk-x">×</button><h3>' + esc(L.name) + "</h3><p>" + esc(desc) + "</p>";
      info.hidden = false; info.querySelector(".zk-x").onclick = () => (info.hidden = true);
    }
    const _v = new V3();
    function placeLabels() {
      const w = innerWidth, h = innerHeight, d0 = camera.position.distanceTo(target);
      for (const L of labels) {
        _v.copy(L.pos).project(camera);
        const dist = camera.position.distanceTo(L.pos);
        const off = _v.z > 1 || Math.abs(_v.x) > 1.05 || Math.abs(_v.y) > 1.05 || dist > Math.max(260, d0 * 1.6) || tour.on && dist > 180;
        L.el.hidden = off;
        if (off) continue;
        L.el.style.transform = "translate(" + ((_v.x * 0.5 + 0.5) * w).toFixed(1) + "px," + ((-_v.y * 0.5 + 0.5) * h).toFixed(1) + "px) translate(-50%,-100%)";
        L.el.style.opacity = String(clamp(1.4 - dist / Math.max(260, d0 * 1.6), 0.35, 1));
      }
    }

    // ---------------- 动植物编辑器 ----------------
    let zone = null;
    try { const j = await (await fetch("../data/zones.json", { cache: "no-store" })).json(); zone = (j.zones || []).find((z) => z.id === zoneId) || null; } catch (e) { zone = null; }
    if (zone) {
      card.querySelector(".zk-intro").textContent = cfg.intro || zone.intro || "";
      card.querySelector(".zk-tags").innerHTML = (cfg.highlights || zone.highlights || []).map((t) => "<span>" + esc(t) + "</span>").join("");
    } else { card.querySelector(".zk-intro").textContent = cfg.intro || ""; card.querySelector(".zk-tags").innerHTML = (cfg.highlights || []).map((t) => "<span>" + esc(t) + "</span>").join(""); }
    const full = ZKSpecies.catalog({ flora, life, world, groundOk });
    const allowed = zone && Array.isArray(zone.catalog) ? zone.catalog : cfg.catalog;
    let CAT = full.filter((c) => allowed.indexOf(c.key) >= 0);
    for (const c of full) if (CAT.indexOf(c) < 0 && SEEDS.some((s) => s.key === c.key)) CAT.push(Object.assign({}, c, { hidden: true }));
    const byKey = {}; CAT.forEach((c) => (byKey[c.key] = c));
    function canPlace(e, x, z) {
      if (x < bx0 || x > bx1 || z < bz0 || z > bz1) return { ok: false, reason: "超出本板块范围" };
      const r = e.radius || 0.5;
      if (world.buildingAt(x, z, e.type === "plant" ? (e.anim === "tree" ? r * 0.6 : 0.4) : 0.2)) return { ok: false, reason: e.type === "plant" ? "离建筑太近（乔木要留出半个树冠）" : "这里是建筑" };
      const c = world.classAt(x, z);
      const what = { pavers: "步道上", asphalt: "车行道上", slabs: "广场铺装上", mosaic: "广场铺装上", brick: "人行道上", court: "球场上", out: "范围外" }[c];
      if (e.type === "plant") {
        if (what) return { ok: false, reason: "不能种在" + what + "，只能种在草坪 / 树池" };
        const rr = Math.max(0.4, Math.min(r * 0.45, 1.6));
        for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4, c2 = world.classAt(x + Math.cos(a) * rr, z + Math.sin(a) * rr); if (c2 !== "grass" && c2 !== "soil") return { ok: false, reason: "离道路 / 铺装太近，往草坪里面挪一点" }; }
      } else {
        if (e.key !== "butterfly" && (c === "asphalt" || c === "out")) return { ok: false, reason: "不能放在车行道上，请放在草坪或步行区" };
        if (e.key === "cat" && c === "court") return { ok: false, reason: "球场上有人打球，小猫放到草坪上吧" };
      }
      return { ok: true };
    }
    const pick = (rc) => { const p = pickGround(rc); return p && p.x >= bx0 && p.x <= bx1 && p.z >= bz0 && p.z <= bz1 ? { x: p.x, y: p.y, z: p.z } : null; };
    const seeds = [], cnt = {};
    for (const s of SEEDS) {
      const e = byKey[s.key]; if (!e) continue;
      const i = cnt[s.key] = (cnt[s.key] || 0); cnt[s.key]++;
      const ref = s.key + "#" + i;
      const h = ZKSpecies.hashStr(ref);
      const rot = s.rot != null ? s.rot : (h % 628) / 100, sc = s.scale || (e.type === "plant" ? 0.9 + (h % 20) / 100 : 1);
      const obj = e.make({ ref });
      obj.position.set(s.x, world.groundY(s.x, s.z), s.z); obj.rotation.y = rot; obj.scale.setScalar(sc);
      scene.add(obj);
      seeds.push({ ref, key: s.key, obj, x: s.x, z: s.z, rot, scale: sc });
    }
    const apiParam = Q.get("speciesApi");
    const editor = SpeciesEditor.create({
      zoneId, zoneName: cfg.title, apiBase: apiParam === "none" ? null : (apiParam || "../../api/zones/"), storageKey: cfg.storageKey || ("zone-species-demo:" + zoneId),
      THREE, scene, camera, dom: renderer.domElement, catalog: CAT, seeds, canPlace, pick, surfaceY: (x, z) => world.groundY(x, z),
      fx: { soilSize: 9, soilColor: 0x5b4330 },
      hooks: { onToggle: (on) => { document.body.classList.toggle("se-editing", on); if (on && cfg.views["编辑俯瞰"]) { setTour(false); goView("编辑俯瞰", 900); } } },
      onCounts: (c) => updateCounts(c),
    });
    life.setInds(() => editor.inds);
    const editable = (zone && zone.editable) || Q.get("edit") === "1";
    if (editable) editor.buildUI(panel.querySelector(".zk-se-host"));
    else panel.querySelector(".zk-se-host").innerHTML = '<p class="zk-muted">本板块的动植物编辑待 zones.json 开放（editable）后启用。</p>';
    function renderList(counts) {
      const body = panel.querySelector(".zk-eco-body");
      body.innerHTML = [["plant", "植物"], ["animal", "动物"]].map(([t, title]) => {
        const items = CAT.filter((c) => c.type === t && !c.hidden);
        return "<h3>" + title + " <small>" + items.length + " 种</small></h3><ul>" + items.map((c) =>
          '<li><button type="button" class="zk-sp" data-k="' + esc(c.key) + '"><span class="zk-sp-icon">' + esc(c.icon) + '</span><span class="zk-sp-main"><b>' + esc(c.name) +
          '<i data-n="' + esc(c.key) + '">×' + ((counts && counts[c.key]) || 0) + "</i></b><span>" + esc(c.desc) + "</span></span></button></li>").join("") + "</ul>";
      }).join("");
      body.querySelectorAll(".zk-sp").forEach((b) => (b.onclick = () => flyToSpecies(b.getAttribute("data-k"), b)));
    }
    function updateCounts(c) { panel.querySelectorAll("[data-n]").forEach((x) => { x.textContent = "×" + (c[x.getAttribute("data-n")] || 0); }); }
    renderList(editor.counts());
    const flyIdx = {};
    function flyToSpecies(key, btn) {
      panel.querySelectorAll(".zk-sp.is-active").forEach((x) => x.classList.remove("is-active")); if (btn) btn.classList.add("is-active");
      const list = editor.inds.filter((i) => i.key === key && i.status === "active" && i.obj && i.obj.parent);
      const e = byKey[key];
      if (!list.length) { toast("场景里暂时没有「" + (e ? e.name : key) + "」" + (editable ? "，可以用“✏️ 管理动植物”添加" : "")); return; }
      setTour(false);
      const i = (flyIdx[key] = ((flyIdx[key] == null ? -1 : flyIdx[key]) + 1) % list.length), ind = list[i], p = ind.obj.position;
      flyToPoint(p.x, p.z, e.type === "animal" ? 6 : e.anim === "tree" ? 26 : 12, 1200);
      toast(e.icon + " " + e.name + (list.length > 1 ? "（第 " + (i + 1) + " / " + list.length + " " + (e.type === "animal" ? "只" : "株") + "）" : ""));
      if (editor.ED.on) editor.select(ind);
    }
    editor.load().then(() => { updateCounts(editor.counts()); window.__seLoaded = true; }).catch((e) => { console.warn(e); window.__seLoaded = true; });

    // ---------------- 雕塑等异步模型 ----------------
    if (cfg.afterBuild) await cfg.afterBuild(K);

    // ---------------- 天气 / 昼夜 / 季节 ----------------
    WX.load({ proxyUrl: WEATHER_API }).then((w) => { state.weather = w; }).catch(() => { state.weather = WX.virtualWeather(Date.now()); });
    const sel = (s) => bar.querySelector('[data-s="' + s + '"]');
    sel("weather").onchange = (e) => { state.demoWeather = e.target.value; };
    sel("season").onchange = (e) => { state.demoSeason = e.target.value; };
    sel("time").onchange = (e) => { if (e.target.value === "auto") state.timeAuto = true; else { state.timeAuto = false; state.demoHours = parseFloat(e.target.value); } };
    if (!state.timeAuto) { const opt = [...sel("time").options].find((o) => Math.abs(parseFloat(o.value) - state.demoHours) < 0.3); if (opt) sel("time").value = opt.value; }
    const WX_CYCLE = ["auto", "0", "2", "61", "95", "71", "45"];
    window.addEventListener("keydown", (e) => {
      if (e.target && /input|select|textarea/i.test(e.target.tagName)) return;
      if (e.code === "KeyC") setTour(!tour.on);
      if (e.code === "KeyT") { const i = (WX_CYCLE.indexOf(state.demoWeather) + 1) % WX_CYCLE.length; state.demoWeather = WX_CYCLE[i]; sel("weather").value = state.demoWeather; toast("天气：" + sel("weather").selectedOptions[0].textContent); }
      if (e.code === "KeyN") { state.timeAuto = false; const bj = WX.beijingParts(Date.now()); const cur = state.demoHours; state.demoHours = cur > 6 && cur < 18 ? 21.5 : 11; sel("time").value = String(state.demoHours); }
      if (e.code === "KeyI") help.classList.toggle("is-on");
      if (e.key === "Escape") info.hidden = true;
    });
    let firstEnv = true;
    function weatherNow() { if (state.demoWeather !== "auto") return { code: +state.demoWeather, temp: null, wind: 8, source: "demo" }; return state.weather || WX.virtualWeather(Date.now()); }
    function applyEnv(dt) {
      const bj = WX.beijingParts(Date.now());
      const hours = state.timeAuto ? bj.hours : state.demoHours;
      const season = state.demoSeason !== "auto" ? state.demoSeason : WX.seasonOfMonth(bj.mo);
      const sp = WX.sunPosition(bj.doy, hours), el2 = sp.elevation;
      const w = weatherNow(), d = WX.describe(w.code);
      const night = ss(2, -8, el2);
      state.flash = Math.max(0, state.flash - dt * 4);
      if (d.thunder) { state.nextFlash -= dt; if (state.nextFlash <= 0) { state.flash = 1; state.nextFlash = 4 + Math.random() * 7; } }
      look.setEnvironment({ elevDeg: el2, dir: sp.dir, night, kind: d.kind, season, flash: state.flash, windKmh: w.wind || 8, immediate: firstEnv }, dt);
      firstEnv = false;
      flora.setSeason(look.state.letter === "W" && season !== "winter" ? season : season);
      life.setEnvironment({ night, rain: d.rain, snow: d.kind === "snow" ? Math.max(d.snow, 0.8) : 0, fog: d.fog, season, wind: w.wind || 8, quality: look.quality });
      world.setNight(night, d.fog, d.rain);
      const pad = (n) => String(n).padStart(2, "0");
      const hh = Math.floor(hours), mm = Math.floor((hours - hh) * 60);
      card.querySelector(".zk-time").textContent = "北京时间 " + pad(hh) + ":" + pad(mm) + (state.timeAuto ? "" : "（演示）") + " · " + SEASON_NAME[season] + " · 太阳高度 " + Math.round(el2) + "°";
      card.querySelector(".zk-wx").textContent = d.icon + " " + look.state.label + (w.temp != null ? " · " + Math.round(w.temp) + "°C" : "") + " · " + (w.source === "demo" ? "演示" : w.sourceText || "");
    }
    back.onclick = () => {
      let b = Q.get("back") || "";
      if (!/^\/[^/\\]/.test(b)) b = "../../ecohome.jsp";
      let u = b + (b.indexOf("?") >= 0 ? "&" : "?") + "zone=" + encodeURIComponent(zoneId) + "&autostart=1";
      if (state.demoWeather !== "auto") u += "&weather=" + encodeURIComponent(state.demoWeather);
      if (state.demoSeason !== "auto") u += "&season=" + encodeURIComponent(state.demoSeason);
      if (!state.timeAuto) u += "&hour=" + state.demoHours.toFixed(2);
      document.body.classList.add("zk-leaving"); setTimeout(() => (location.href = u), 600);
    };

    // ---------------- 主循环 ----------------
    applyEnv(0.016);
    flora.setQuality(look.quality);
    let last = performance.now(), t = 0, envT = 0, frames = 0, fpsT = 0, fps = 0, acc = 0, lowT = 0;
    const clock = { manual: false };
    function frame(dtIn) {
      const dt = Math.min(dtIn, 0.1);
      t += dt;
      envT -= dt; if (envT <= 0) { envT = 0.25; applyEnv(0.25); }
      if (tour.on) updateTour(dt);
      else if (fly) {
        fly.k = Math.min(1, fly.k + dt / fly.dur); const k = ss(0, 1, fly.k);
        camera.position.lerpVectors(fly.p0, fly.p1, k); target.lerpVectors(fly.t0, fly.t1, k); camera.lookAt(target);
        if (fly.k >= 1) { fly = null; controls.sync(target); }
      } else controls.update(dt);
      flora.update(camera, dt);
      life.update(dt, t, camera, target);
      if (!window.__seManual) editor.update(dt);
      for (const ind of editor.inds) if (ind.status === "active" && ind.obj && ind.obj.parent && !ind.anim && ind.entry.idle) ind.entry.idle(ind, dt);
      if (cfg.onFrame) cfg.onFrame(dt, t, K);
      renderer.info.autoReset = false; renderer.info.reset();
      look.render(dt, t, target);
      placeLabels();
    }
    function loop(now) {
      requestAnimationFrame(loop);
      if (clock.manual) return;
      let dt = (now - last) / 1000; last = now;
      if (look.quality === "eco") { acc += dt; if (acc < 1 / 31) return; dt = acc; acc = 0; }
      frame(dt);
      frames++; fpsT += dt;
      if (fpsT > 1) {
        fps = frames / fpsT; frames = 0; fpsT = 0;
        hud.textContent = "帧率 " + fps.toFixed(0) + (look.quality === "eco" ? "（上限 30）" : "") + " · 画质 " + (global.PondQuality ? PondQuality.name(look.quality) : look.quality) + " · 批次 " + renderer.info.render.calls + " · 三角形 " + (renderer.info.render.triangles / 1e3).toFixed(0) + "k";
        if (global.PondQuality && !PondQuality.explicit && Q.get("test") !== "1") {
          lowT = fps < (look.quality === "clear" ? 35 : 22) ? lowT + 1 : 0;
          if (lowT >= 5) { lowT = 0; PondQuality.degrade("帧率偏低，已自动切换到" + PondQuality.NAMES[look.quality === "clear" ? "smooth" : "eco"] + "画质"); }
        }
      }
    }
    // 预编译着色器后再出首帧
    try { if (renderer.compileAsync) await renderer.compileAsync(scene, camera); } catch (e) { /* ignore */ }
    setLoad(1, "完成");
    frame(0.016);
    loader.classList.add("is-done"); setTimeout(() => loader.remove(), 700);
    requestAnimationFrame(loop);
    if (Q.get("tour") === "1") setTour(true);
    FreeCam.hintOnce("zone-" + zoneId, (h) => toast(h, 6000));
    const api = { scene, camera, renderer, controls, target, look, world, flora, life, editor, K, cfg, goView, setTour, tour, state, frame, clock, flyToSpecies, labels, toast, applyEnv };
    global.__zk = api;
    global.__zkReady = true;
    return api;
  }

  global.ZK = { start };
})(window);
