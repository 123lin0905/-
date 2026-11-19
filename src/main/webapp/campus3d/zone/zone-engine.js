/*
 * 板块细节场景引擎（ZoneScene）—— 图书馆 / 中心草坪等板块共用，画风与池塘细节场景一致
 * ------------------------------------------------------------------
 * 按官方校园地图（手绘鸟瞰图，已用 plan_to_official_affine 仿射校正回平面图坐标）逐项还原板块：
 * 地形（坡地、土丘、台地、池塘下沉）、地面（草坪 / 石材园路 / 沥青路 / 广场铺装 / 花境）、建筑、植被、水面、路灯。
 * 坐标：平面图像素（x 东、y 南，0.4 米 / 像素）→ 世界米（x 东、z 南、y 上），1 单位 = 1 米（真实尺度）。
 * 画风：zone-look.js（池塘同款 Preetham 天空 + 云 + 星月、PMREM 环境光、色温日光、ACES、天气预设、后期泛光）、
 *       pond-style-core.js 程序化纹理与树木生成；昼夜 / 季节 / 天气与主页相同（EcoWeather：/api/weather → Open-Meteo → 虚拟天气）。
 * 交互：自由镜头（../js/free-camera.js）、电影镜头（板块巡游 + 字幕）、演示面板（Y）、画质档（PondQuality，三个场景共用）。
 * 动植物增删见 zone-species.js（接 ../js/species-editor.js）。
 * 用法：页面先加载板块布局脚本（定义 window.ZONE_LAYOUT），再加载本文件，本文件自动 ZoneScene.create(ZONE_LAYOUT)。
 */
(function (global) {
  "use strict";
  const THREE = global.THREE, V3 = THREE.Vector3;
  const Q = new URLSearchParams(location.search);
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const cl = (v, a, b) => (v < a ? a : v > b ? b : v);
  const SEASON_NAME = { spring: "春季", summer: "夏季", autumn: "秋季", winter: "冬季" };

  // ---------------- 几何工具（平面图像素坐标） ----------------
  function inPoly(p, poly) {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i], b = poly[j];
      if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) c = !c;
    }
    return c;
  }
  function segDist(p, a, b) {
    const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy;
    const t = L ? cl(((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L, 0, 1) : 0;
    return Math.hypot(p[0] - a[0] - dx * t, p[1] - a[1] - dy * t);
  }
  function polyDist(p, pts, closed) {
    let d = Infinity; const n = pts.length;
    for (let i = 0; i < n - (closed ? 0 : 1); i++) d = Math.min(d, segDist(p, pts[i], pts[(i + 1) % n]));
    return d;
  }
  // 折线平滑（Catmull-Rom 采样），用于园路、花带
  function smoothPath(pts, step) {
    if (pts.length < 3) return pts;
    const v = pts.map((p) => new THREE.Vector2(p[0], p[1]));
    const out = [];
    for (let i = 0; i < v.length - 1; i++) {
      const p0 = v[Math.max(0, i - 1)], p1 = v[i], p2 = v[i + 1], p3 = v[Math.min(v.length - 1, i + 2)];
      const n = Math.max(2, Math.ceil(p1.distanceTo(p2) / (step || 4)));
      for (let k = 0; k < n; k++) {
        const t = k / n, t2 = t * t, t3 = t2 * t;
        const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
        out.push([f(p0.x, p1.x, p2.x, p3.x), f(p0.y, p1.y, p2.y, p3.y)]);
      }
    }
    out.push(pts[pts.length - 1]);
    return out;
  }

  function create(LAY) {
    const PX = LAY.scale || 0.4;
    const [CX, CY] = LAY.origin;
    const toW = (px, py) => [(px - CX) * PX, (py - CY) * PX];
    const toPlan = (x, z) => [x / PX + CX, z / PX + CY];
    const BB = LAY.bounds;                                            // 平面图像素
    const [X0, Z0] = toW(BB.x0, BB.y0), [X1, Z1] = toW(BB.x1, BB.y1);  // 世界米
    const WM = X1 - X0, DM = Z1 - Z0;
    const test = Q.get("test") === "1";
    const zoneId = Q.get("zone") || LAY.zoneId;

    // ---------------- 画质档（与全景 / 池塘共用 campus.gfx） ----------------
    if (test && !PondQuality.forcedByUrl && PondQuality.mode !== "smooth") PondQuality.set("smooth", false);
    const mode0 = PondQuality.mode;

    // ---------------- 渲染器 / 场景 / 相机 / 画风 ----------------
    const canvas = $("c");
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: mode0 !== "eco", powerPreference: "high-performance", stencil: false });
    } catch (e) { loaderMsg("当前浏览器无法创建 WebGL：" + e.message, true); throw e; }
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, 1, 0.3, 4000);
    const look = ZoneLook.create({ renderer, scene, camera, quality: mode0, waterLevel: LAY.waterLevel != null ? LAY.waterLevel : -50, shadowMin: 22, shadowMax: 150, fogBase: LAY.fog || 0.0016 });
    look.U.uWaterY.value = LAY.waterLevel != null ? LAY.waterLevel : -50;

    const Z = {
      THREE, LAY, scene, camera, renderer, look, toW, toPlan, inPoly, polyDist, segDist, smoothPath, PX,
      bounds: { x0: X0, z0: Z0, x1: X1, z1: Z1, W: WM, D: DM }, zoneId, test,
      frameFns: [], onFrame(f) { this.frameFns.push(f); },
    };
    let readyRes; Z.ready = new Promise((r) => (readyRes = r));
    global.ZONE = Z;

    // ---------------- 加载进度 ----------------
    function loaderMsg(m, err) { const e = $("loadmsg"); if (e) { e.textContent = m; if (err) e.style.color = "#ffb4a8"; } }
    function progress(p, m) { const b = $("loadbar"); if (b) b.style.width = Math.round(p) + "%"; if (m) loaderMsg(m); }
    const nextFrame = () => new Promise((r) => setTimeout(r, 0));
    pondStyleProgress = async (f, m) => { progress(5 + f * 35, m); await nextFrame(); };

    // ================= 地面：分类图 + 颜色图 =================
    // 分类（查询用）：0 草坪 1 林下 2 石材园路 3 沥青 4 广场铺装 5 花境 6 水 7 建筑 8 台地花田 9 绿篱 10 彩色铺装
    const CLS = { grass: 0, mulch: 1, path: 2, road: 3, plaza: 4, bed: 5, water: 6, building: 7, terrace: 8, hedge: 9, pave: 10 };
    const CLS_NAME = Object.keys(CLS).reduce((o, k) => ((o[CLS[k]] = k), o), {});
    const RES = 0.25;   // 米 / 像素
    const GW = Math.ceil(WM / RES), GH = Math.ceil(DM / RES);
    const cvC = document.createElement("canvas"); cvC.width = GW; cvC.height = GH;   // 颜色
    const cvM = document.createElement("canvas"); cvM.width = GW; cvM.height = GH;   // 材质权重 R 草 G 石 B 沥青（余下 = 土 / 花境）
    const cvK = document.createElement("canvas"); cvK.width = GW; cvK.height = GH;   // 分类
    const gC = cvC.getContext("2d"), gM = cvM.getContext("2d"), gK = cvK.getContext("2d");
    const cpx = (p) => [(p[0] - BB.x0) * PX / RES, (p[1] - BB.y0) * PX / RES];   // 平面像素 → 画布像素
    const KCOL = (k) => `rgb(${k * 16},0,0)`;
    const MAT = { grass: "rgb(255,0,0)", stone: "rgb(0,255,0)", asphalt: "rgb(0,0,255)", soil: "rgb(0,0,0)" };
    function shapePath(g, poly, closed) {
      g.beginPath();
      poly.forEach((p, i) => { const q = cpx(p); i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]); });
      if (closed) g.closePath();
    }
    // 画一个区域 / 一条带：three canvases at once
    function paintPoly(poly, color, mat, k) {
      for (const [g, c] of [[gC, color], [gM, MAT[mat]], [gK, KCOL(k)]]) { shapePath(g, poly, true); g.fillStyle = c; g.fill(); }
    }
    function paintLine(path, wPx, color, mat, k, opt) {
      opt = opt || {};
      const pts = opt.raw ? path : smoothPath(path, 3);
      for (const [g, c] of [[gC, color], [gM, MAT[mat]], [gK, KCOL(k)]]) {
        if (opt.colorOnly && g !== gC) continue;
        shapePath(g, pts, false); g.lineWidth = wPx * PX / RES; g.lineCap = opt.cap || "round"; g.lineJoin = "round"; g.strokeStyle = c; g.stroke();
      }
      return pts;
    }
    function strokeColor(path, wPx, color, dash) {
      const pts = smoothPath(path, 3);
      shapePath(gC, pts, false); gC.lineWidth = wPx * PX / RES; gC.lineCap = "butt"; gC.lineJoin = "round"; gC.strokeStyle = color;
      gC.setLineDash(dash ? dash.map((d) => d / RES) : []); gC.stroke(); gC.setLineDash([]);
    }

    // ================= 地形高度 =================
    const waters = (LAY.water || []).map((w) => Object.assign({ level: LAY.waterLevel, depth: 1.1 }, w));
    const HSTEP = 1.0;   // 地形网格 1 米
    const MARGIN = 70;   // 场景外延（米），用林带公告板和雾遮住世界边缘
    const HX0 = X0 - MARGIN, HZ0 = Z0 - MARGIN, HNX = Math.ceil((WM + MARGIN * 2) / HSTEP) + 1, HNZ = Math.ceil((DM + MARGIN * 2) / HSTEP) + 1;
    const HF = new Float32Array(HNX * HNZ);
    function rawHeight(x, z) {
      const xc = cl(x, X0, X1), zc = cl(z, Z0, Z1);
      const [px, py] = toPlan(xc, zc);
      let h = LAY.height ? LAY.height(px, py) : 0;
      // 板块外延：离开边界后 15–60 米内平缓降到远景地面高度（farY + 0.3），与外圈大地面接上，不出现陡坎
      const dOut = Math.hypot(x - xc, z - zc);
      if (dOut > 0) h += ((LAY.farY != null ? LAY.farY : -0.6) + 0.3 - h) * ss(15, 60, dOut);
      for (const w of waters) {
        const p = [px, py], inside = inPoly(p, w.poly), d = polyDist(p, w.poly, true) * PX;
        if (inside) h = Math.min(h, w.level - 0.25 - w.depth * ss(0, 5, d));
        else if (d < 2.2) h = Math.min(h, w.level + 0.12 + d * 0.18);   // 缓坡草岸
      }
      return h;
    }
    function buildHeights() {
      for (let j = 0; j < HNZ; j++) for (let i = 0; i < HNX; i++) HF[j * HNX + i] = rawHeight(HX0 + i * HSTEP, HZ0 + j * HSTEP);
    }
    function heightAt(x, z) {
      const fx = cl((x - HX0) / HSTEP, 0, HNX - 1.001), fz = cl((z - HZ0) / HSTEP, 0, HNZ - 1.001);
      const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
      const a = HF[j * HNX + i], b = HF[j * HNX + i + 1], c = HF[(j + 1) * HNX + i], d = HF[(j + 1) * HNX + i + 1];
      return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
    }
    Z.heightAt = heightAt;
    // 台地 / 建筑上的“地表”高度（编辑器、动物落脚用）：层叠物体登记的顶面
    const raised = [];   // { poly(plan px), y }
    Z.addRaised = (poly, y) => raised.push({ poly, y });
    Z.surfaceAt = (x, z) => {
      const p = toPlan(x, z);
      for (const r of raised) if (inPoly(p, r.poly)) return r.y;
      return heightAt(x, z);
    };
    Z.waterAt = (x, z) => { const p = toPlan(x, z); for (const w of waters) if (inPoly(p, w.poly)) return w; return null; };
    Z.waterDist = (x, z) => { const p = toPlan(x, z); let d = Infinity; for (const w of waters) d = Math.min(d, (inPoly(p, w.poly) ? -1 : 1) * polyDist(p, w.poly, true) * PX); return d; };

    // ================= 构建 =================
    let K = null;   // 分类像素
    Z.classAt = (x, z) => {
      if (!K) return "grass";
      if (x < X0 || x > X1 || z < Z0 || z > Z1) return "out";
      const i = Math.min(GW - 1, Math.floor((x - X0) / RES)), j = Math.min(GH - 1, Math.floor((z - Z0) / RES));
      return CLS_NAME[Math.round(K[(j * GW + i) * 4] / 16)] || "grass";
    };
    const statics = [];   // 不可编辑的障碍（建筑、背景树干、灯柱）：{ x, z, r }
    Z.addStatic = (x, z, r) => statics.push({ x, z, r });
    Z.staticAt = (x, z, r) => statics.some((s) => Math.hypot(s.x - x, s.z - z) < s.r + r);
    const buildings = [];  // 世界 xz 多边形
    Z.addBuildingPoly = (poly) => buildings.push(poly);
    Z.buildingAt = (x, z, m) => buildings.some((b) => inPoly([x, z], b) || (m && polyDist([x, z], b, true) < m));

    async function build() {
      progress(3, "生成程序化纹理…");
      await buildTextures();
      ZoneBuild.buildTextures();
      progress(42, "绘制地面…");
      await nextFrame();
      paintGround();
      progress(50, "生成地形…");
      await nextFrame();
      buildHeights();
      buildTerrain();
      buildWater();
      progress(58, "搭建建筑…");
      await nextFrame();
      Z.M = ZoneBuild.materials(look);
      Z.B = ZoneBuild;
      if (LAY.build) LAY.build(Z);
      progress(66, "种植树木…");
      await nextFrame();
      Z.flora = ZoneFlora.create(Z);
      plantTrees();
      Z.flora.buildBackground();
      progress(80, "铺设花境…");
      await nextFrame();
      plantBeds();
      buildLamps();
      buildParticles();
      if (LAY.decorate) LAY.decorate(Z);
      progress(90, "编译着色器…");
      await nextFrame();
    }

    // ---------------- 地面绘制 ----------------
    function paintGround() {
      const G = LAY.ground || {};
      // 底：草坪
      for (const g of [gC, gM, gK]) { g.fillStyle = g === gC ? (G.lawn || "#6f9c3a") : g === gM ? MAT.grass : KCOL(CLS.grass); g.fillRect(0, 0, GW, GH); }
      // 草色斑块（修剪草坪的深浅）
      const R = mulberry32(17);
      for (let i = 0; i < 260; i++) {
        const x = R() * GW, y = R() * GH, r = 20 + R() * 90;
        const grd = gC.createRadialGradient(x, y, 0, x, y, r);
        const c = R() < 0.5 ? "rgba(70,110,30,0.16)" : "rgba(150,175,70,0.12)";
        grd.addColorStop(0, c); grd.addColorStop(1, "rgba(0,0,0,0)"); gC.fillStyle = grd; gC.fillRect(x - r, y - r, r * 2, r * 2);
      }
      for (const a of G.mulch || []) paintPoly(a, "#55722c", "grass", CLS.mulch);           // 林下（深一点的草 / 落叶）
      for (const a of G.soil || []) paintPoly(a, "#6a5238", "soil", CLS.bed);               // 土丘林下覆土
      for (const a of G.plaza || []) {
        paintPoly(a.poly, a.color || "#bdb6aa", "stone", CLS.plaza);
        if (a.grid) {   // 铺装分格线
          gC.save(); shapePath(gC, a.poly, true); gC.clip();
          gC.strokeStyle = a.gridColor || "rgba(90,85,78,0.45)"; gC.lineWidth = 1;
          const step = a.grid / RES; const ang = a.gridAngle || 0, c = Math.cos(ang), s = Math.sin(ang);
          for (let k = -GW - GH; k < GW + GH; k += step) {
            gC.beginPath(); gC.moveTo(k * c - (-4000) * s, k * s + (-4000) * c); gC.lineTo(k * c - 4000 * s, k * s + 4000 * c); gC.stroke();
            gC.beginPath(); gC.moveTo(-4000 * c - k * s, -4000 * s + k * c); gC.lineTo(4000 * c - k * s, 4000 * s + k * c); gC.stroke();
          }
          if (a.checker) {
            gC.fillStyle = a.checker;
            for (let i = -60; i < 60; i++) for (let j = -60; j < 60; j++) {
              if ((i + j) % 2) continue;
              const u = i * step * 2, v = j * step * 2, ox = cpx(a.poly[0]);
              gC.save(); gC.translate(ox[0], ox[1]); gC.rotate(ang); gC.fillRect(u, v, step * 2, step * 2); gC.restore();
            }
          }
          gC.restore();
        }
      }
      for (const r of G.roads || []) {
        const pts = paintLine(r.path, r.w + 1.6, "#cfc9bd", "stone", CLS.pave);    // 路缘石
        paintLine(r.path, r.w, "#4a4b4e", "asphalt", CLS.road);
        if (r.center !== false) strokeColor(r.path, 0.35, r.centerColor || "rgba(235,200,80,0.85)", [3, 3]);
        void pts;
      }
      for (const p of G.paths || []) {
        if (p.edge !== false) paintLine(p.path, p.w + 0.9, p.edgeColor || "#9d968a", "stone", CLS.path);
        paintLine(p.path, p.w, p.color || "#d8d2c4", "stone", p.k != null ? p.k : CLS.path);
        if (p.joints) strokeColor(p.path, p.w * 0.92, "rgba(120,112,100,0.28)", [0.08, 0.9]);
      }
      for (const b of G.beds || []) {   // 花境底土（花丛另由 plantBeds 种上）
        if (b.poly) paintPoly(b.poly, b.soil || "#5b4632", "soil", CLS.bed);
        else paintLine(b.path, b.w, b.soil || "#5b4632", "soil", CLS.bed);
      }
      for (const h of G.hedges || []) paintLine(h.path, h.w, "#3f5a24", "soil", CLS.hedge);
      for (const w of waters) {          // 池底（透过水面能看到）+ 驳岸湿土
        paintLine(w.poly.concat([w.poly[0]]), 4, "#4d5a33", "soil", CLS.grass, { raw: true, colorOnly: true });
        paintPoly(w.poly, "#3c4a2c", "soil", CLS.water);
      }
      for (const a of G.extra || []) a(gC, gM, gK, { cpx, shapePath, KCOL, MAT, CLS, RES, PX });
      K = gK.getImageData(0, 0, GW, GH).data;
    }

    // ---------------- 地形网格 + 地面材质 ----------------
    let groundMat = null;
    function buildTerrain() {
      const geo = new THREE.PlaneGeometry(HNX - 1, HNZ - 1, HNX - 1, HNZ - 1);
      geo.rotateX(-Math.PI / 2);
      const pos = geo.attributes.position, uv = geo.attributes.uv;
      for (let i = 0; i < pos.count; i++) {
        const gx = Math.round(pos.getX(i) + (HNX - 1) / 2), gz = Math.round(pos.getZ(i) + (HNZ - 1) / 2);
        const x = HX0 + gx * HSTEP, z = HZ0 + gz * HSTEP;
        pos.setXYZ(i, x, HF[gz * HNX + gx], z);
        uv.setXY(i, (x - X0) / WM, (z - Z0) / DM);
      }
      geo.computeVertexNormals();
      const tC = new THREE.CanvasTexture(cvC); tC.colorSpace = THREE.SRGBColorSpace; tC.flipY = false; tC.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      const tM = new THREE.CanvasTexture(cvM); tM.flipY = false;
      const T = ZoneBuild.buildTextures();
      const avg = (t) => new THREE.Vector3(...ZoneBuild.texAvg(t));
      const rep = (t) => { t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; };
      const uni = {
        tMask: { value: tM }, tLawn: { value: rep(T.lawn.map) }, tStone: { value: rep(TEX.granite.map) }, tAsph: { value: rep(T.asphalt.map) }, tSoil: { value: rep(TEX.gravel.map) },
        aLawn: { value: avg(T.lawn.map) }, aStone: { value: avg(TEX.granite.map) }, aAsph: { value: avg(T.asphalt.map) }, aSoil: { value: avg(TEX.gravel.map) },
        uBox: { value: new THREE.Vector4(X0, Z0, WM, DM) }, uOutCol: { value: new THREE.Color(LAY.ground && LAY.ground.outside || "#5f8a33") },
        tLawnN: { value: rep(T.lawn.normalMap) },
      };
      groundMat = look.patch(new THREE.MeshStandardMaterial({ map: tC, roughness: 0.92, envMapIntensity: 0.55 }), {
        key: "zground", uniforms: uni,
        fsPars: "uniform sampler2D tMask, tLawn, tStone, tAsph, tSoil, tLawnN; uniform vec3 aLawn, aStone, aAsph, aSoil; uniform vec4 uBox; uniform vec3 uOutCol;\nfloat gStone = 0.0, gAsph = 0.0;\n",
        fsMap: /* glsl */`
{
  vec2 bu = (vUwPos.xz - uBox.xy) / uBox.zw;
  float inside = step(0.0, bu.x) * step(bu.x, 1.0) * step(0.0, bu.y) * step(bu.y, 1.0);
  vec3 m = texture2D(tMask, clamp(bu, 0.0, 1.0)).rgb * inside + vec3(1.0, 0.0, 0.0) * (1.0 - inside);
  float ms = clamp(1.0 - m.r - m.g - m.b, 0.0, 1.0);
  vec2 w = vUwPos.xz;
  vec3 dG = texture2D(tLawn, w * 0.37).rgb / aLawn * 0.6 + texture2D(tLawn, w * 0.083 + 0.3).rgb / aLawn * 0.4;
  vec3 dS = texture2D(tStone, w * 0.45).rgb / aStone;
  vec3 dA = texture2D(tAsph, w * 0.22).rgb / aAsph;
  vec3 dM = texture2D(tSoil, w * 0.5).rgb / aSoil;
  vec3 det = m.r * dG + m.g * mix(vec3(1.0), dS, 0.75) + m.b * dA + ms * mix(vec3(1.0), dM, 0.8);
  vec3 base = mix(uOutCol, diffuseColor.rgb, inside);
  diffuseColor.rgb = base * clamp(det, vec3(0.35), vec3(1.9));
  // 修剪草坪的割草条纹（很淡）
  diffuseColor.rgb *= 1.0 + m.r * 0.035 * sign(sin(dot(w, vec2(0.34, 0.94)) * 0.9));
  gStone = m.g; gAsph = m.b;
}
`,
        fsAfterMaps: "",
      });
      // 粗糙度：石材、沥青更光滑（湿润时有反光）
      groundMat.onBeforeCompile = ((orig) => (sh) => {
        orig(sh);
        sh.fragmentShader = sh.fragmentShader.replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.72, gStone);\nroughnessFactor = mix(roughnessFactor, 0.82, gAsph);");
      })(groundMat.onBeforeCompile);
      const mesh = new THREE.Mesh(geo, groundMat);
      mesh.receiveShadow = true; mesh.name = "terrain";
      scene.add(mesh);
      Z.terrain = mesh;
      // 更远处：一圈低矮的大地面（被雾吞没），避免看到世界边缘
      const far = new THREE.Mesh(new THREE.RingGeometry(Math.min(WM, DM) * 0.5 + MARGIN * 0.6, 2500, 64, 1).rotateX(-Math.PI / 2),
        look.patch(new THREE.MeshStandardMaterial({ color: LAY.ground && LAY.ground.outside || "#5f8a33", roughness: 1, envMapIntensity: 0.4 }), { key: "zfar" }));
      far.position.set((X0 + X1) / 2, (LAY.farY != null ? LAY.farY : -0.6), (Z0 + Z1) / 2);
      far.receiveShadow = false;
      scene.add(far);
    }

    // ---------------- 水面（池塘同款简化水面：菲涅尔 + 天空反射 + 涟漪法线 + 雨点 + 平面反射 + 半透明可见锦鲤） ----------------
    function buildWater() {
      Z.waterMeshes = [];
      for (const w of waters) {
        const poly = w.poly.map((p) => toW(p[0], p[1]));
        const geo = ZoneBuild.flat(poly, w.level, false, 1);
        const mat = look.waterMaterial({ color: w.color || 0x26412f, opacity: 0.86, scale: 0.16, key: "pond" });
        const m = new THREE.Mesh(geo, mat); m.receiveShadow = true; m.renderOrder = 2; m.name = "water";
        scene.add(m); look.waters.push(m); Z.waterMeshes.push(m);
      }
    }

    // ---------------- 树木 ----------------
    // 林带：在多边形里按最小间距随机布点（避开道路、园路、花境、水、建筑、开阔草坪），树种按比例混种
    const TREE_KEYS = { camphor: 1, ginkgo: 1, osmanthus: 1, cherry: 1, crapemyrtle: 1, willow: 1, metasequoia: 1 };
    const seedTrees = [];
    for (const k in LAY.seeds || {}) if (TREE_KEYS[k]) for (const s of LAY.seeds[k]) seedTrees.push(s);
    function sampleBelt(belt, out, rnd) {
      const poly = belt.poly;
      let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
      for (const p of poly) { minx = Math.min(minx, p[0]); maxx = Math.max(maxx, p[0]); miny = Math.min(miny, p[1]); maxy = Math.max(maxy, p[1]); }
      const sp = (belt.spacing || 11);
      const area = (maxx - minx) * (maxy - miny);
      const tries = Math.ceil(area / (sp * sp) * 6);
      const pts = [];
      const open = LAY.openAreas || [];
      for (let t = 0; t < tries; t++) {
        const p = [minx + rnd() * (maxx - minx), miny + rnd() * (maxy - miny)];
        if (!inPoly(p, poly)) continue;
        if (open.some((o) => inPoly(p, o))) continue;
        const [x, z] = toW(p[0], p[1]);
        const c = Z.classAt(x, z);
        if (c !== "grass" && c !== "mulch" && c !== "out") continue;
        if (nearClass(x, z, belt.clear || 2.2)) continue;
        if (Z.buildingAt(x, z, 3)) continue;
        if (Z.waterAt(x, z) || Z.waterDist(x, z) < 1.5) continue;
        if (pts.some((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < sp * (0.75 + 0.25 * rnd()))) continue;
        if (out.some((q) => Math.hypot(q.px - p[0], q.py - p[1]) < sp * 0.7)) continue;
        if (seedTrees.some((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < Math.max(sp * 0.8, 8))) continue;   // 给场景原有的可编辑树留出位置
        pts.push(p);
      }
      const mix = belt.mix, keys = Object.keys(mix), tot = keys.reduce((a, k) => a + mix[k], 0);
      for (const p of pts) {
        let r = rnd() * tot, key = keys[0];
        for (const k of keys) { r -= mix[k]; if (r <= 0) { key = k; break; } }
        const [x, z] = toW(p[0], p[1]);
        out.push({ key, x, z, y: heightAt(x, z) - 0.05, s: (belt.scale || 1) * (0.78 + rnd() * 0.42), rot: rnd() * 6.28, px: p[0], py: p[1] });
      }
    }
    function nearClass(x, z, r) {
      for (const [dx, dz] of [[r, 0], [-r, 0], [0, r], [0, -r], [r * 0.7, r * 0.7], [-r * 0.7, r * 0.7], [r * 0.7, -r * 0.7], [-r * 0.7, -r * 0.7]]) {
        const c = Z.classAt(x + dx, z + dz);
        if (c === "road" || c === "path" || c === "plaza" || c === "pave" || c === "terrace" || c === "building") return true;
      }
      return false;
    }
    function plantTrees() {
      const rnd = mulberry32(LAY.seed || 4242);
      const list = [];
      for (const r of LAY.rows || []) {   // 行道树：沿折线等距
        const pts = smoothPath(r.path, 2);
        let acc = r.offset || 0;
        for (let i = 0; i < pts.length - 1; i++) {
          const a = pts[i], b = pts[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
          while (acc <= L) {
            const t = acc / L, p = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
            const [x, z] = toW(p[0], p[1]);
            list.push({ key: r.key, x, z, y: heightAt(x, z) - 0.05, s: (r.scale || 1) * (0.9 + rnd() * 0.2), rot: rnd() * 6.28, px: p[0], py: p[1] });
            acc += r.spacing;
          }
          acc -= L;
        }
      }
      for (const b of LAY.belts || []) sampleBelt(b, list, rnd);
      // 场景外延一圈（只做远景公告板气氛）
      if (LAY.ring !== false) {
        // 官方地图上板块四周都是成片的树：外延 6–60 米内按约 5.5 米一株的周长密度撒两圈（远景公告板，代价很小）
        const per = 2 * (WM + DM), n = Math.floor(per / (LAY.ringSpacing || 5.5)), RD = LAY.ringDepth || 54;
        for (let i = 0; i < n; i++) {
          const t = (i + rnd() * 0.6) / n * per, off = 6 + rnd() * RD;
          let x, z;
          if (t < WM) { x = X0 + t; z = Z0 - off; } else if (t < WM + DM) { x = X1 + off; z = Z0 + t - WM; }
          else if (t < 2 * WM + DM) { x = X1 - (t - WM - DM); z = Z1 + off; } else { x = X0 - off; z = Z1 - (t - 2 * WM - DM); }
          const r = rnd();
          list.push({ key: (LAY.ringMix || ["camphor", "camphor", "camphor", "ginkgo", "osmanthus", "cherry"])[Math.floor(r * (LAY.ringMix || [1, 2, 3, 4, 5, 6]).length)], x, z, y: heightAt(x, z) - 0.05, s: 0.85 + rnd() * 0.4, rot: rnd() * 6.28 });
        }
      }
      Z.flora.addBackground(list);
      for (const t of list) if (t.px != null) Z.addStatic(t.x, t.z, 1.2);
      Z.bgTrees = list;
    }

    // ---------------- 花境 / 花田 / 绿篱 / 芦苇 ----------------
    const hex3 = (h) => { const c = new THREE.Color(h); return [c.r, c.g, c.b]; };
    function plantBeds() {
      const rnd = mulberry32(99);
      const pts = [];
      for (const b of (LAY.ground && LAY.ground.beds) || []) {
        if (!b.colors) continue;
        const cols = b.colors.map(hex3);
        const step = b.step || 0.7;
        const take = (p, i) => { const [x, z] = toW(p[0], p[1]); const ci = b.bands ? Math.floor(i) % cols.length : Math.floor(rnd() * cols.length); pts.push({ x: x + (rnd() - 0.5) * 0.3, y: Z.surfaceAt(x, z) - 0.04, z: z + (rnd() - 0.5) * 0.3, c: cols[ci], s: b.size || (0.8 + rnd() * 0.4) }); };
        if (b.path) {
          const path = smoothPath(b.path, 2);
          const hw = b.w / 2 * PX;
          for (let i = 0; i < path.length - 1; i++) {
            const a = path[i], c = path[i + 1], L = Math.hypot(c[0] - a[0], c[1] - a[1]) * PX;
            const tx = (c[0] - a[0]) / (L / PX), ty = (c[1] - a[1]) / (L / PX), nx = -ty, ny = tx;
            for (let s = 0; s < L; s += step) for (let o = -hw + step * 0.5; o < hw; o += step) {
              const f = s / L;
              const p = [a[0] + (c[0] - a[0]) * f + nx * o / PX, a[1] + (c[1] - a[1]) * f + ny * o / PX];
              const band = b.bandsAcross ? (o + hw) / (2 * hw) * cols.length : 0;
              if (b.bandsAcross) { const [x, z] = toW(p[0], p[1]); pts.push({ x: x + (rnd() - 0.5) * 0.25, y: Z.surfaceAt(x, z) - 0.04, z: z + (rnd() - 0.5) * 0.25, c: cols[Math.min(cols.length - 1, Math.floor(band))], s: b.size || (0.8 + rnd() * 0.4) }); }
              else take(p, 0);
            }
          }
        } else if (b.poly) {
          let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
          for (const p of b.poly) { minx = Math.min(minx, p[0]); maxx = Math.max(maxx, p[0]); miny = Math.min(miny, p[1]); maxy = Math.max(maxy, p[1]); }
          const sp = step / PX;
          for (let y = miny; y <= maxy; y += sp) for (let x = minx; x <= maxx; x += sp) if (inPoly([x, y], b.poly)) take([x, y], 0);
        }
      }
      for (const fn of LAY.flowerPoints || []) fn(Z, pts, rnd);
      if (pts.length) Z.flora.addFlowers(pts);
      // 绿篱：沿折线密排灌木叶团，压扁成修剪绿篱
      const hp = [];
      for (const h of (LAY.ground && LAY.ground.hedges) || []) {
        const path = smoothPath(h.path, 2);
        for (let i = 0; i < path.length - 1; i++) {
          const a = path[i], c = path[i + 1], L = Math.hypot(c[0] - a[0], c[1] - a[1]) * PX, ang = Math.atan2(c[1] - a[1], c[0] - a[0]);
          for (let s = 0; s < L; s += 0.8) {
            const f = s / L, [x, z] = toW(a[0] + (c[0] - a[0]) * f, a[1] + (c[1] - a[1]) * f);
            hp.push({ x, y: heightAt(x, z) - 0.05, z, sx: (h.w * PX) / 1.2, sy: (h.h || 1.0) / 0.75, sz: 0.85, rot: -ang });
          }
        }
      }
      for (const s of LAY.shrubs || []) { const [x, z] = toW(s[0], s[1]); hp.push({ x, y: heightAt(x, z) - 0.05, z, sx: s[2] || 1.2, sy: s[3] || 1.1, rot: rnd() * 6 }); }
      if (hp.length) Z.flora.addShrubs(hp);
      // 芦苇 / 水草：池边一圈（北岸更密）
      const rp = [];
      for (const w of waters) {
        if (!w.reeds) continue;
        const poly = w.poly.concat([w.poly[0]]);
        for (let i = 0; i < poly.length - 1; i++) {
          const a = poly[i], c = poly[i + 1], L = Math.hypot(c[0] - a[0], c[1] - a[1]) * PX;
          for (let s = 0; s < L; s += 1.1) {
            if (rnd() > w.reeds) continue;
            const f = s / L, p = [a[0] + (c[0] - a[0]) * f, a[1] + (c[1] - a[1]) * f];
            const [x, z] = toW(p[0], p[1]);
            rp.push({ x: x + (rnd() - 0.5) * 0.6, y: w.level - 0.1, z: z + (rnd() - 0.5) * 0.6, s: 0.7 + rnd() * 0.5 });
          }
        }
      }
      if (rp.length) Z.flora.addReeds(rp);
    }

    // ---------------- 庭院灯（夜间点亮：灯头自发光 + 地面光斑 + 最近几盏真实点光源） ----------------
    const lamps = { list: [], heads: null, pools: null, lights: [] };
    function buildLamps() {
      const pts = [];
      for (const l of LAY.lamps || []) {
        if (l.path) {
          const path = smoothPath(l.path, 2); let acc = l.offset || 4;
          for (let i = 0; i < path.length - 1; i++) {
            const a = path[i], c = path[i + 1], L = Math.hypot(c[0] - a[0], c[1] - a[1]);
            const nx = -(c[1] - a[1]) / L, ny = (c[0] - a[0]) / L;
            while (acc <= L) { const f = acc / L; pts.push([a[0] + (c[0] - a[0]) * f + nx * (l.side || 0), a[1] + (c[1] - a[1]) * f + ny * (l.side || 0)]); acc += l.spacing; }
            acc -= L;
          }
        } else pts.push(l);
      }
      if (!pts.length) return;
      const M = Z.M;
      const pole = mergeGeos([new THREE.CylinderGeometry(0.055, 0.075, 3.4, 8).translate(0, 1.7, 0), new THREE.CylinderGeometry(0.16, 0.18, 0.3, 10).translate(0, 0.15, 0), new THREE.CylinderGeometry(0.2, 0.06, 0.1, 10).translate(0, 3.42, 0)]);
      const head = new THREE.CylinderGeometry(0.17, 0.13, 0.42, 10).translate(0, 3.66, 0);
      const cap = new THREE.ConeGeometry(0.24, 0.16, 10).translate(0, 3.95, 0);
      const n = pts.length;
      const mp = new THREE.InstancedMesh(mergeGeos([pole, cap]), M.darkMetal, n);
      const headMat = new THREE.MeshStandardMaterial({ color: 0xf2efe6, emissive: 0xffc77a, emissiveIntensity: 0, roughness: 0.3 });
      const mh = new THREE.InstancedMesh(head, headMat, n);
      const poolMat = new THREE.MeshBasicMaterial({ color: 0xffb860, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, map: radialTex(), fog: true });
      const mpool = new THREE.InstancedMesh(new THREE.PlaneGeometry(7, 7).rotateX(-Math.PI / 2), poolMat, n);
      const m4 = new THREE.Matrix4();
      pts.forEach((p, i) => {
        const [x, z] = toW(p[0], p[1]), y = heightAt(x, z);
        m4.makeTranslation(x, y, z); mp.setMatrixAt(i, m4); mh.setMatrixAt(i, m4);
        m4.makeTranslation(x, y + 0.06, z); mpool.setMatrixAt(i, m4);
        lamps.list.push(new V3(x, y + 3.7, z)); Z.addStatic(x, z, 0.4);
      });
      mp.castShadow = true; mp.receiveShadow = true; mh.castShadow = false;
      mp.computeBoundingSphere(); mh.computeBoundingSphere(); mpool.computeBoundingSphere();
      mpool.renderOrder = 3;
      scene.add(mp, mh, mpool);
      lamps.heads = headMat; lamps.pools = poolMat;
      for (let i = 0; i < 6; i++) { const L = new THREE.PointLight(0xffc27a, 0, 16, 1.6); L.castShadow = false; scene.add(L); lamps.lights.push(L); }
    }
    function radialTex() {
      const cv = document.createElement("canvas"); cv.width = cv.height = 64; const g = cv.getContext("2d");
      const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32); grd.addColorStop(0, "rgba(255,255,255,1)"); grd.addColorStop(0.4, "rgba(255,255,255,0.35)"); grd.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = grd; g.fillRect(0, 0, 64, 64); const t = new THREE.CanvasTexture(cv); return t;
    }
    let lampT = 0;
    function updateLamps(dt, night) {
      if (!lamps.heads) return;
      lamps.heads.emissiveIntensity = night * 3.2;
      lamps.pools.opacity = night * 0.32;
      lampT -= dt; if (lampT > 0) return; lampT = 0.5;
      const c = camera.position;
      const near = lamps.list.map((p, i) => [p.distanceToSquared(c), i]).sort((a, b) => a[0] - b[0]).slice(0, lamps.lights.length);
      lamps.lights.forEach((L, k) => { const it = near[k]; if (!it) { L.intensity = 0; return; } L.position.copy(lamps.list[it[1]]).y -= 0.2; L.intensity = night * 18; });
    }

    // ---------------- 雨 / 雪粒子（GPU，绕相机循环） ----------------
    const fx = { rain: null, snow: null };
    function buildParticles() {
      const mk = (n, size, color, opacity) => {
        const g = new THREE.BufferGeometry(); const p = new Float32Array(n * 3), r = mulberry32(n);
        for (let i = 0; i < n; i++) { p[i * 3] = r() * 60; p[i * 3 + 1] = r() * 30; p[i * 3 + 2] = r() * 60; }
        g.setAttribute("position", new THREE.BufferAttribute(p, 3));
        const m = new THREE.ShaderMaterial({
          transparent: true, depthWrite: false, uniforms: { uT: { value: 0 }, uC: { value: new V3() }, uSpeed: { value: 9 }, uSize: { value: size }, uCol: { value: new THREE.Color(color) }, uOp: { value: 0 }, uWobble: { value: 0 } },
          vertexShader: `uniform float uT, uSpeed, uSize, uWobble; uniform vec3 uC; varying float vA;
            void main(){ vec3 p = position; p.y = mod(p.y - uT * uSpeed, 30.0);
              p.x = mod(p.x - uC.x + 30.0 + sin(uT * 0.7 + position.z) * uWobble, 60.0) + uC.x - 30.0; p.z = mod(p.z - uC.z + 30.0 + cos(uT * 0.6 + position.x) * uWobble, 60.0) + uC.z - 30.0;
              p.y += uC.y - 12.0; vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = uSize * 260.0 / -mv.z; vA = smoothstep(55.0, 10.0, -mv.z); }`,
          fragmentShader: `uniform vec3 uCol; uniform float uOp; varying float vA; void main(){ vec2 q = gl_PointCoord - 0.5; float d = length(q); if (d > 0.5) discard; gl_FragColor = vec4(uCol, uOp * vA * smoothstep(0.5, 0.15, d)); }`,
        });
        const pts = new THREE.Points(g, m); pts.frustumCulled = false; pts.visible = false; scene.add(pts); return pts;
      };
      fx.rain = mk(6000, 0.06, 0xbfd3e6, 0.5); fx.rain.material.uniforms.uSpeed.value = 16;
      fx.snow = mk(4000, 0.12, 0xffffff, 0.9); fx.snow.material.uniforms.uSpeed.value = 1.6; fx.snow.material.uniforms.uWobble.value = 1.5;
    }
    function updateParticles(t, rain, snow) {
      for (const [p, a] of [[fx.rain, rain], [fx.snow, snow]]) {
        if (!p) continue;
        const k = PondQuality.eco ? 0.5 : 1;
        p.visible = a > 0.02; p.material.uniforms.uT.value = t; p.material.uniforms.uC.value.copy(camera.position);
        p.material.uniforms.uOp.value = Math.min(1, a) * (p === fx.rain ? 0.55 : 0.9);
        p.geometry.setDrawRange(0, Math.floor(p.geometry.attributes.position.count * Math.min(1, a) * k));
      }
    }

    // ================= 自由镜头 / 视角 / 电影镜头 =================
    const controls = FreeCam.create({
      THREE, camera, dom: renderer.domElement, target: new V3(),
      bounds: { minX: X0, maxX: X1, minZ: Z0, maxZ: Z1, minY: -2, maxY: 40 },
      camBounds: { minX: X0 - 120, maxX: X1 + 120, minZ: Z0 - 120, maxZ: Z1 + 120, maxY: 260 },
      minDistance: 2.5, maxDistance: Math.max(WM, DM) * 1.35, minPolar: 0.08, maxPolar: 1.48,
      floor: (x, z) => Math.max(heightAt(x, z), Z.waterAt(x, z) ? (LAY.waterLevel || 0) : -1e9) + 1.1,
      targetFloor: (x, z) => heightAt(x, z),
      pick: (rc, out) => pickGround(rc, out),
      moveSpeed: (r) => cl(r * 0.55, 2, 90), verticalSpeed: 0.35, focusDistance: 22,
      keyMap: { KeyY: null },
      enabled: () => !tour.on && !(Z.editor && Z.editor.ED && Z.editor.ED.drag),
    });
    Z.controls = controls;
    // 地面拾取：沿射线步进求与地形的交点（地形是高度场）
    const _rp = new V3();
    function pickGround(rc, out) {
      const o = rc.ray.origin, d = rc.ray.direction;
      let tPrev = 0, prevAbove = o.y - heightAt(o.x, o.z);
      const wl = LAY.waterLevel != null ? LAY.waterLevel : -1e9;
      for (let t = 0.5; t < 1500; t += Math.max(0.5, t * 0.02)) {
        _rp.copy(o).addScaledVector(d, t);
        if (_rp.x < X0 - 200 || _rp.x > X1 + 200 || _rp.z < Z0 - 200 || _rp.z > Z1 + 200) break;
        let g = heightAt(_rp.x, _rp.z);
        if (Z.waterAt(_rp.x, _rp.z)) g = Math.max(g, wl);
        const above = _rp.y - g;
        if (above <= 0) {
          const f = prevAbove / (prevAbove - above + 1e-6), tt = tPrev + (t - tPrev) * f;
          out.copy(o).addScaledVector(d, tt);
          if (out.x < X0 - 1 || out.x > X1 + 1 || out.z < Z0 - 1 || out.z > Z1 + 1) return null;
          return out;
        }
        tPrev = t; prevAbove = above;
      }
      return null;
    }
    Z.pickGround = pickGround;
    function viewPos(v) {
      const [tx, tz] = toW(v.t[0], v.t[1]);
      const t = new V3(tx, heightAt(tx, tz) + (v.ty || 0), tz);
      const az = v.az || 0, pol = v.polar;
      const p = t.clone().add(new V3(Math.sin(pol) * Math.sin(az), Math.cos(pol), Math.sin(pol) * Math.cos(az)).multiplyScalar(v.d));
      return [p, t];
    }
    let fly = null;
    controls.addEventListener("start", () => { fly = null; if (tour.on) stopTour(); });
    function flyTo(pos, target, ms) { fly = { p0: camera.position.clone(), t0: controls.target.clone(), p1: pos.clone(), t1: target.clone(), t: 0, dur: (ms || 1300) / 1000 }; }
    function goView(name, ms) { const v = (LAY.views || {})[name]; if (!v) return; const [p, t] = viewPos(v); if (ms === 0) { camera.position.copy(p); controls.target.copy(t); camera.lookAt(t); controls.sync(t); } else flyTo(p, t, ms); }
    function flyToPoint(x, z, dist, ms, y) {
      const t = new V3(x, (y != null ? y : Z.surfaceAt(x, z)) + 0.6, z);
      const dir = camera.position.clone().sub(controls.target); dir.y = 0;
      if (dir.lengthSq() < 1e-4) dir.set(0, 0, 1); dir.normalize();
      const p = t.clone().addScaledVector(dir, dist * 0.78); p.y = t.y + dist * 0.62;
      flyTo(p, t, ms);
    }
    Object.assign(Z, { goView, flyTo, flyToPoint, viewPos });

    // 电影镜头：沿关键帧连续巡游（Catmull-Rom），靠近景点放慢并显示字幕；任意操作退出到自由镜头
    const tour = { on: false, u: 0, curveP: null, curveT: null, keys: [], len: 1, blend: 0, from: null, cap: "" };
    function buildTour() {
      const K = LAY.tour || []; if (K.length < 2) return;
      const P = [], T = [];
      for (const k of K) {
        const [px, pz] = toW(k.p[0], k.p[1]), [tx, tz] = toW(k.t[0], k.t[1]);
        P.push(new V3(px, Math.max(heightAt(px, pz) + 1.6, heightAt(px, pz) + k.p[2]), pz));
        T.push(new V3(tx, heightAt(tx, tz) + (k.t[2] || 0), tz));
      }
      tour.curveP = new THREE.CatmullRomCurve3(P, true, "centripetal", 0.5);
      tour.curveT = new THREE.CatmullRomCurve3(T, true, "centripetal", 0.5);
      tour.len = tour.curveP.getLength();
      tour.keys = K.map((k, i) => ({ u: i / K.length, cap: k.cap, slow: k.slow || 0.45 }));
    }
    const _tp = new V3(), _tt = new V3();
    function startTour() {
      if (!tour.curveP) buildTour();
      if (!tour.curveP) return;
      // 从离当前相机最近的路径点开始
      let best = 0, bd = Infinity;
      for (let i = 0; i < 200; i++) { const d = tour.curveP.getPointAt(i / 200, _tp).distanceToSquared(camera.position); if (d < bd) { bd = d; best = i / 200; } }
      tour.u = best; tour.on = true; tour.blend = 0; tour.from = { p: camera.position.clone(), t: controls.target.clone() };
      fly = null; document.body.classList.add("zs-touring"); setTourBtn();
    }
    function stopTour() { tour.on = false; document.body.classList.remove("zs-touring"); showCaption(""); controls.sync(controls.target); setTourBtn(); }
    function updateTour(dt) {
      if (!tour.on) return;
      // 速度：约 5 米/秒，靠近景点关键帧时放慢
      let slow = 1, cap = "";
      for (const k of tour.keys) { let du = Math.abs(tour.u - k.u); du = Math.min(du, 1 - du); const w = ss(0.06, 0.0, du); if (w > 0.25 && k.cap) cap = k.cap; slow = Math.min(slow, 1 - (1 - k.slow) * w); }
      tour.u = (tour.u + dt * 5.2 * slow / tour.len) % 1;
      tour.curveP.getPointAt(tour.u, _tp); tour.curveT.getPointAt((tour.u + 0.004) % 1, _tt);
      const gy = heightAt(_tp.x, _tp.z) + 1.5; if (_tp.y < gy) _tp.y = gy;
      tour.blend = Math.min(1, tour.blend + dt / 2.5);
      const b = ss(0, 1, tour.blend);
      camera.position.copy(tour.from.p).lerp(_tp, b);
      controls.target.copy(tour.from.t).lerp(_tt, b);
      camera.lookAt(controls.target);
      showCaption(cap);
    }
    function showCaption(c) {
      if (c === tour.cap) return; tour.cap = c;
      const el = $("zs-cap"); if (!el) return;
      el.textContent = c; el.classList.toggle("is-on", !!c);
    }
    Z.tour = tour; Z.startTour = startTour; Z.stopTour = stopTour;

    // ================= 昼夜 / 季节 / 天气（与主页、池塘同一套逻辑） =================
    const state = { season: "autumn", weather: null, demoWeather: "auto", demoSeason: "auto", timeAuto: true, demoHours: 12, speed: 1, simOffsetMs: 0, night: 0, elev: 30, flash: 0, envCache: null };
    if (Q.get("weather")) state.demoWeather = Q.get("weather");
    if (Q.get("season")) state.demoSeason = Q.get("season");
    if (Q.get("hour")) { state.timeAuto = false; state.demoHours = parseFloat(Q.get("hour")) || 12; }
    const WX = () => global.EcoWeather;
    const nowMs = () => Date.now() + state.simOffsetMs;
    function currentBJ() {
      const p = WX().beijingParts(nowMs());
      if (!state.timeAuto) { p.hours = state.demoHours; p.h = Math.floor(state.demoHours); p.mi = Math.floor((state.demoHours % 1) * 60); p.s = 0; }
      return p;
    }
    function weatherNow() {
      const W = WX();
      if (state.demoWeather !== "auto") {
        const code = Number(state.demoWeather), base = state.weather || W.virtualWeather(nowMs());
        const temp = code >= 71 && code <= 86 ? Math.min(base.temp, -1) : base.temp;
        return Object.assign({}, base, { code, temp, source: "demo", sourceText: "演示模式（手动切换）" });
      }
      return state.weather || W.virtualWeather(nowMs());
    }
    let firstEnv = true, thunderT = 5;
    function applyEnv(dt) {
      const W = WX();
      const bj = currentBJ();
      const season = state.demoSeason !== "auto" ? state.demoSeason : W.seasonOfMonth(bj.mo);
      const w = weatherNow(), d = W.describe(w.code);
      const sp = W.sunPosition(bj.doy, bj.hours);
      const night = ss(2, -8, sp.elevation);
      // 雷阵雨闪电
      if (d.thunder) { thunderT -= dt; if (thunderT <= 0) { state.flash = 1; thunderT = 4 + Math.random() * 9; } }
      state.flash = Math.max(0, state.flash - dt * 3.5);
      look.setEnvironment({ elevDeg: sp.elevation, dir: sp.dir, night, kind: d.kind, season, flash: state.flash, windKmh: w.wind || 8, immediate: firstEnv }, dt);
      firstEnv = false;
      const env = { rain: d.rain, snow: d.kind === "snow" ? Math.max(d.snow, 0.8) : 0 };
      if (!state.envCache) state.envCache = Object.assign({}, env);
      for (const k in env) state.envCache[k] += (env[k] - state.envCache[k]) * Math.min(1, dt * 0.8);
      Object.assign(state, { season, night, elev: sp.elevation, kind: d.kind, w, d, bj });
      ZoneBuild.NIGHT.value = night;
      if (Z.flora) Z.flora.setSeason(look.state.letter, season);
    }
    let wxCardT = 0;
    function renderWeatherCard() {
      if (!$("zs-wx") || !state.w) return;
      const w = state.w, d = state.d, bj = state.bj, night = state.night > 0.5;
      $("zs-wx-icon").textContent = night && d.kind === "clear" ? "🌙" : d.icon;
      $("zs-wx-temp").textContent = Math.round(w.temp * 10) / 10 + "°C";
      $("zs-wx-text").textContent = d.text + " · " + SEASON_NAME[state.season] + (night ? " · 夜晚" : "") + (look.state.label ? "（场景：" + look.state.label + "）" : "");
      const pad = (n) => String(n).padStart(2, "0");
      $("zs-time").textContent = "北京时间 " + bj.mo + "月" + bj.day + "日 " + pad(bj.h) + ":" + pad(bj.mi) + (state.timeAuto && state.speed === 1 ? "" : "（演示）") + " · 太阳高度 " + Math.round(state.elev) + "°";
      $("zs-src").textContent = "天气来源：" + w.sourceText;
    }
    Z.env = state; Z.applyEnvNow = () => applyEnv(0.016);

    // ================= 界面 =================
    function backUrl() {
      let b = Q.get("back") || "";
      if (!/^\/[^/\\]/.test(b) && b !== "/") b = "../../ecohome.jsp";
      let u = b + (b.indexOf("?") >= 0 ? "&" : "?") + "zone=" + encodeURIComponent(zoneId) + "&autostart=1";
      if (state.demoWeather !== "auto") u += "&weather=" + encodeURIComponent(state.demoWeather);
      if (state.demoSeason !== "auto") u += "&season=" + encodeURIComponent(state.demoSeason);
      if (!state.timeAuto) u += "&hour=" + state.demoHours.toFixed(2);
      return u;
    }
    function el(tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
    function buildUI() {
      const back = el("button", "zs-glass zs-back", "← 返回校园全景"); back.type = "button"; back.id = "zs-back"; back.title = "回到生态主页，镜头停在本板块";
      back.onclick = () => { document.body.classList.add("zs-leaving"); setTimeout(() => (location.href = backUrl()), 350); };
      document.body.appendChild(back);
      const card = el("section", "zs-glass zs-zone"); card.id = "zs-zone";
      card.innerHTML = '<p class="zs-kicker">生态板块 · 细节场景</p><h1 id="zs-name">' + esc((LAY.icon || "") + " " + LAY.name) + '</h1><p class="zs-intro" id="zs-intro">' + esc(LAY.intro || "") + "</p>" +
        '<p class="zs-tags" id="zs-tags"></p>' +
        '<div class="zs-wx" id="zs-wx" title="点击打开演示面板（Y）"><span id="zs-wx-icon">⏳</span><b id="zs-wx-temp">--°C</b><span id="zs-wx-text">正在获取天气…</span></div>' +
        '<p class="zs-time" id="zs-time">北京时间 --:--</p><p class="zs-src" id="zs-src"></p>' +
        '<p class="zs-ref">依据：学校官方校园地图（手绘鸟瞰图）按平面图比例还原，1 格 = 1 米</p>';
      document.body.appendChild(card);
      $("zs-wx").onclick = () => toggleDemo();
      const eco = el("aside", "zs-glass zs-eco"); eco.id = "zs-eco";
      eco.innerHTML = '<header><b>' + esc(LAY.ecoTitle || "板块生态") + '</b><button class="zs-x" id="zs-fold" type="button" title="收起 / 展开">–</button></header>' +
        '<p class="zs-sub">本板块动植物 · 点击飞到对应物种</p><div id="zs-se-host"></div><div class="zs-eco-body" id="zs-eco-body"><p class="zs-muted">加载中…</p></div>' +
        '<p class="zs-note">' + esc(LAY.ecoNote || "原有个体按官方地图位置种植；数量为场景中的个体数，增删后实时更新。") + "</p>";
      document.body.appendChild(eco);
      $("zs-fold").onclick = () => { eco.classList.toggle("is-folded"); $("zs-fold").textContent = eco.classList.contains("is-folded") ? "+" : "–"; };
      const bar = el("div", "zs-glass zs-bar"); bar.id = "zs-bar"; bar.setAttribute("role", "toolbar");
      const vbtn = Object.keys(LAY.views || {}).filter((k) => LAY.views[k].label).map((k) => '<button type="button" data-view="' + k + '" title="' + esc(LAY.views[k].title || "") + '">' + esc(LAY.views[k].label) + "</button>").join("");
      bar.innerHTML = vbtn + '<button type="button" id="zs-tour" title="电影镜头：沿板块连续巡游（C）">🎬 电影镜头</button><button type="button" id="zs-demo-btn" title="天气 / 季节 / 时间演示（Y）">⚙️ 演示</button>';
      document.body.appendChild(bar);
      bar.querySelectorAll("[data-view]").forEach((b) => (b.onclick = () => { if (tour.on) stopTour(); goView(b.getAttribute("data-view"), 1400); }));
      $("zs-tour").onclick = () => (tour.on ? stopTour() : startTour());
      $("zs-demo-btn").onclick = () => toggleDemo();
      const gfx = PondQuality.button(); gfx.id = "zs-gfx"; gfx.classList.add("zs-gfx"); document.body.appendChild(gfx);
      PondQuality.onChange((m) => { look.setQuality(m); });
      const demo = el("section", "zs-glass zs-demo"); demo.id = "zs-demo"; demo.hidden = true;
      demo.innerHTML = [
        '<header><b>演示切换面板</b><button class="zs-x" id="zs-demo-close" type="button" aria-label="关闭">×</button></header>',
        '<label>天气<select id="zsd-weather"><option value="auto">自动（实时/虚拟）</option><option value="0">晴</option><option value="1">少云</option><option value="2">多云</option><option value="3">阴</option><option value="61">小雨</option><option value="65">大雨</option><option value="95">雷阵雨</option><option value="71">雪</option><option value="45">雾</option></select></label>',
        '<label>季节<select id="zsd-season"><option value="auto">自动（按北京时间月份）</option><option value="spring">春</option><option value="summer">夏</option><option value="autumn">秋</option><option value="winter">冬</option></select></label>',
        '<label class="zs-row"><input type="checkbox" id="zsd-time-auto" checked> 跟随北京时间</label>',
        '<div class="zs-row"><input type="range" id="zsd-time" min="0" max="24" step="0.05" value="12" disabled><output id="zsd-time-out">12:00</output></div>',
        '<label>时间流速<select id="zsd-speed"><option value="1">×1</option><option value="60">×60（1 秒 = 1 分钟）</option><option value="600">×600（1 秒 = 10 分钟）</option></select></label>',
        '<div class="zs-quick"><button type="button" data-p="0,summer,11">晴</button><button type="button" data-p="61,auto,13">雨</button><button type="button" data-p="0,autumn,15.5">秋</button><button type="button" data-p="71,winter,11.5">冬雪</button><button type="button" data-p="auto,auto,21.5">夜晚</button></div>',
        '<button class="zs-btn" id="zsd-reset" type="button">恢复自动</button><p class="zs-stats" id="zsd-stats"></p>',
        '<p class="zs-tip">快捷键：Y 本面板 · C 电影镜头 / 自由镜头 · T 轮换天气 · 1–4 视角</p>',
      ].join("");
      document.body.appendChild(demo);
      $("zs-demo-close").onclick = () => toggleDemo(false);
      $("zsd-weather").onchange = (e) => { state.demoWeather = e.target.value; };
      $("zsd-season").onchange = (e) => { state.demoSeason = e.target.value; };
      $("zsd-time-auto").onchange = (e) => { state.timeAuto = e.target.checked; if (!state.timeAuto) state.demoHours = WX().beijingParts(nowMs()).hours; syncDemo(); };
      $("zsd-time").oninput = (e) => { state.demoHours = parseFloat(e.target.value); syncDemo(); };
      $("zsd-speed").onchange = (e) => { state.speed = parseFloat(e.target.value); };
      $("zsd-reset").onclick = () => { Object.assign(state, { demoWeather: "auto", demoSeason: "auto", timeAuto: true, speed: 1, simOffsetMs: 0 }); syncDemo(); };
      demo.querySelectorAll("[data-p]").forEach((b) => (b.onclick = () => {
        const [w, s, h] = b.getAttribute("data-p").split(",");
        state.demoWeather = w; state.demoSeason = s; state.timeAuto = false; state.demoHours = parseFloat(h); syncDemo();
      }));
      syncDemo();
      if (Q.get("demo") === "1") toggleDemo(true);
      const cap = el("div", "zs-cap"); cap.id = "zs-cap"; document.body.appendChild(cap);
      const hud = el("p", "zs-hud"); hud.id = "zs-hud"; document.body.appendChild(hud);
      const help = el("p", "zs-help", "左键拖动旋转 · 右键 / Shift+拖动平移 · 滚轮朝光标缩放 · WASD 移动 · Q / E 升降 · 双击聚焦 · C 电影镜头"); help.id = "zs-help"; document.body.appendChild(help);
      const toastEl = el("div", "zs-toast"); toastEl.id = "zs-toast"; document.body.appendChild(toastEl);
      if (LAY.highlights) $("zs-tags").innerHTML = LAY.highlights.map((h) => "<span>" + esc(h) + "</span>").join("");
    }
    function syncDemo() {
      if (!$("zsd-weather")) return;
      $("zsd-weather").value = state.demoWeather; $("zsd-season").value = state.demoSeason;
      $("zsd-time-auto").checked = state.timeAuto; $("zsd-time").disabled = state.timeAuto; $("zsd-time").value = state.demoHours;
      const h = state.demoHours; $("zsd-time-out").textContent = String(Math.floor(h)).padStart(2, "0") + ":" + String(Math.floor((h % 1) * 60)).padStart(2, "0");
      $("zsd-speed").value = String(state.speed);
    }
    function toggleDemo(force) { const d = $("zs-demo"); if (d) d.hidden = force != null ? !force : !d.hidden; }
    let toastH = 0;
    function toast(m) { const t = $("zs-toast"); if (!t) return; t.textContent = m; t.classList.add("is-on"); clearTimeout(toastH); toastH = setTimeout(() => t.classList.remove("is-on"), 2600); }
    Z.toast = toast;
    function setTourBtn() { const b = $("zs-tour"); if (b) { b.textContent = tour.on ? "🕹️ 自由镜头" : "🎬 电影镜头"; b.classList.toggle("is-on", tour.on); } }
    const WCYCLE = [["0", "summer", 11], ["61", "auto", 13], ["0", "autumn", 15.5], ["71", "winter", 11.5]];
    let wc = -1;
    window.addEventListener("keydown", (e) => {
      if (e.target && /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return;
      if (e.code === "KeyY") toggleDemo();
      else if (e.code === "KeyC") { tour.on ? stopTour() : startTour(); }
      else if (e.code === "KeyT") { wc = (wc + 1) % WCYCLE.length; const [w, s, h] = WCYCLE[wc]; Object.assign(state, { demoWeather: w, demoSeason: s, timeAuto: false, demoHours: h }); syncDemo(); toast("演示天气：" + ["晴（夏）", "雨", "秋", "冬雪"][wc]); }
      else if (/^Digit[1-4]$/.test(e.code)) { const keys = Object.keys(LAY.views || {}).filter((k) => LAY.views[k].label); const k = keys[+e.code.slice(5) - 1]; if (k) { if (tour.on) stopTour(); goView(k, 1400); } }
      else if (e.code === "Escape") toggleDemo(false);
    });

    // ================= 主循环 =================
    function resize() { look.resize(); }
    window.addEventListener("resize", resize);
    const clock = { last: performance.now(), t: 0, frames: 0, fpsT: 0, fps: 0, acc: 0 };
    let envT = 0;
    function frame(now) {
      requestAnimationFrame(frame);
      let dt = Math.min(0.1, (now - clock.last) / 1000);
      // 省电档：30 fps 上限（时间累积跳帧，与池塘相同）
      if (PondQuality.eco && !test) { clock.acc += now - clock.last; clock.last = now; if (clock.acc < 33.3) return; dt = Math.min(0.1, clock.acc / 1000); clock.acc %= 33.3; }
      else clock.last = now;
      step(dt);
    }
    function step(dt) {
      clock.t += dt;
      if (state.speed !== 1) state.simOffsetMs += dt * 1000 * (state.speed - 1);
      if (!state.timeAuto && state.speed !== 1) { state.demoHours = (state.demoHours + dt * state.speed / 3600) % 24; }
      envT -= dt;
      if (envT <= 0 || state.flash > 0) { applyEnv(Math.max(dt, 0.25 - envT)); envT = 0.25; }
      wxCardT -= dt; if (wxCardT <= 0) { renderWeatherCard(); wxCardT = 1; }
      if (fly) {
        fly.t = Math.min(1, fly.t + dt / fly.dur);
        const k = ss(0, 1, fly.t);
        camera.position.copy(fly.p0).lerp(fly.p1, k); controls.target.copy(fly.t0).lerp(fly.t1, k); camera.lookAt(controls.target);
        if (fly.t >= 1) { fly = null; controls.sync(controls.target); }
      } else if (tour.on) updateTour(dt);
      else controls.update(dt);
      if (Z.flora) Z.flora.update(dt, camera.position);
      updateLamps(dt, state.night);
      updateParticles(clock.t, state.envCache ? state.envCache.rain : 0, state.envCache ? state.envCache.snow : 0);
      for (const f of Z.frameFns) f(dt, clock.t);
      look.render(dt, clock.t, controls.target);
      clock.frames++; clock.fpsT += dt;
      if (clock.fpsT >= 1) {
        clock.fps = clock.frames / clock.fpsT; clock.frames = 0; clock.fpsT = 0;
        const info = renderer.info;
        const h = $("zs-hud"); if (h) h.textContent = Math.round(clock.fps) + " fps · " + PondQuality.name() + (PondQuality.eco ? "（上限 30）" : "") + " · 树 近 " + (Z.flora ? Z.flora.stats.near : 0) + " / 远 " + (Z.flora ? Z.flora.stats.far : 0);
        const s = $("zsd-stats"); if (s) s.textContent = "帧率 " + Math.round(clock.fps) + " · 批次 " + info.render.calls + " · 三角形 " + (info.render.triangles / 1e4).toFixed(1) + " 万";
      }
    }
    Z.step = step;

    // ================= 启动 =================
    const t0 = performance.now();
    buildUI();
    WX().load({ proxyUrl: Q.get("api") || "../../api/weather" }).then((w) => { state.weather = w; renderWeatherCard(); });
    fetch("../data/zones.json", { cache: "no-cache" }).then((r) => r.json()).then((j) => {
      const z = (j.zones || []).find((x) => x.id === zoneId);
      Z.zone = z || null;
    }).catch(() => { Z.zone = null; }).finally(() => { zoneLoaded = true; });
    let zoneLoaded = false;
    build().then(async () => {
      resize();
      goView(LAY.startView || "overview", 0);
      applyEnv(0.016);
      look.updateEnv();
      try { if (renderer.compileAsync) await renderer.compileAsync(scene, camera); else renderer.compile(scene, camera); } catch (e) { console.warn(e); }
      Z.flora.updateLOD(camera.position);
      progress(100, "完成");
      while (!zoneLoaded) await new Promise((r) => setTimeout(r, 30));
      readyRes({ zone: Z.zone });
      requestAnimationFrame((n) => { clock.last = n; frame(n); });
      const ld = $("loader"); if (ld) { ld.classList.add("is-done"); setTimeout(() => ld.remove(), 900); }
      Z.loadMs = Math.round(performance.now() - t0);
      global.__zoneReady = true;
      if (!test) FreeCam.hintOnce("zone-" + LAY.id, (h) => toast(h));
    }).catch((e) => { console.error(e); loaderMsg("场景加载失败：" + e.message, true); });
    return Z;
  }

  global.ZoneScene = { create, inPoly, polyDist, smoothPath };
  if (global.ZONE_LAYOUT) create(global.ZONE_LAYOUT);
})(window);
