/*
 * 中心草坪 · 板块细节 3D 场景（平面图插画风：扁平纯色 + 轻微等距俯视的微缩模型）
 * ------------------------------------------------------------------------------
 * 画风取自学校官网绵阳校区平面图（campus3d/img/plan_official.jpg）：浅绿草地、米色道路带白描边、
 * 黄色 / 肉色挤出的简洁建筑块（深色侧面）、柔和平光、几乎无阴影。
 *   底图：tools/build_lawn_ground.py 从平面图裁出中心草坪周边并按颜色重绘成纯色图 lawn-ground.png（道路轮廓与平面图一致），
 *         同一张图也是放置规则的依据（草地 / 道路 / 白色铺地 / 广场 / 水面）；
 *   建筑：campus_layout.json（平面图像素坐标）按轮廓挤出，合并成 1 个网格，顶面与侧面用顶点色；
 *   动植物：全部由几种低多边形图元（方块 / 圆球 / 圆锥 / 圆柱 / 翅膀 / 影子圆片）拼成，每种图元一个 InstancedMesh，
 *          每个个体只是一个不渲染的“代理”Object3D（编辑器照常移动 / 缩放它），每帧把代理的矩阵写进实例。
 *   俯视总览 draw calls ≈ 10（底图 2 + 建筑 1 + 图元 6 + 编辑器辅助），无后期、无实时阴影。
 * 坐标：1 场景单位 = 平面图 10 像素 ≈ 4 米；x 向东、z 向南（与平面图 x、y 同向），原点在裁剪范围中心。
 * 画质：读取与全景 / 池塘共用的 localStorage「campus.gfx」：clear 清晰（像素比 ≤1.5）/ smooth 流畅（像素比 1）/
 *       eco·saver·省电（像素比 1、关抗锯齿、帧率上限 30、不画影子、减少装饰树）；未设置时核显 / 软件渲染按流畅处理。
 * 依赖：../lib/three-r160.min.js、../lib/OrbitControls.classic.js、../js/eco-weather.js。导出 window.LAWN。
 */
(function () {
  "use strict";
  const THREE = window.THREE;
  const Q = new URLSearchParams(location.search);
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = (t) => t * t * (3 - 2 * t);
  const ZONE_ID = "central_lawn";

  // ---------------- 裁剪范围与坐标（与 tools/build_lawn_ground.py 一致） ----------------
  const REGION = { x0: 480, y0: 615, x1: 1385, y1: 1455 };
  const PX = 10;
  const CX = (REGION.x0 + REGION.x1) / 2, CY = (REGION.y0 + REGION.y1) / 2;
  const W = (REGION.x1 - REGION.x0) / PX, D = (REGION.y1 - REGION.y0) / PX;
  const toW = (px, py) => [(px - CX) / PX, (py - CY) / PX];
  const SLAB = 1.6;                      // 微缩模型底座厚度

  // ---------------- 画质档 ----------------
  function readGfx() {
    const u = (Q.get("gfx") || "").toLowerCase();
    let v = u; if (!v) { try { v = (localStorage.getItem("campus.gfx") || "").toLowerCase(); } catch (e) { v = ""; } }
    if (/eco|saver|save|power|battery|省电|lite/.test(v)) return { mode: "eco", explicit: true };
    if (/smooth|low|流畅/.test(v)) return { mode: "smooth", explicit: true };
    if (/clear|high|清晰/.test(v)) return { mode: "clear", explicit: true };
    return { mode: null, explicit: false };
  }
  function gpuName() {
    try {
      const c = document.createElement("canvas"), gl = c.getContext("webgl2") || c.getContext("webgl");
      const ext = gl && gl.getExtension("WEBGL_debug_renderer_info");
      return ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : "";
    } catch (e) { return ""; }
  }
  const GPU = gpuName();
  const integrated = /intel|uhd|iris|hd graphics|radeon\(tm\) graphics|radeon graphics|vega \d|mali|adreno|powervr|apple gpu|swiftshader|llvmpipe|software|microsoft basic/i.test(GPU);
  const gfx0 = readGfx();
  const GFX = { mode: gfx0.mode || (integrated ? "smooth" : "clear"), explicit: gfx0.explicit, auto: !gfx0.explicit };
  function gfxParams(mode) {
    const dpr = window.devicePixelRatio || 1;
    if (mode === "eco") return { dpr: Math.min(1, dpr), aa: false, fps: 30, shadows: false, decor: 0.5 };
    if (mode === "smooth") return { dpr: 1, aa: true, fps: 60, shadows: true, decor: 1 };
    return { dpr: Math.min(1.5, dpr), aa: true, fps: 60, shadows: true, decor: 1 };
  }
  let GP = gfxParams(GFX.mode);
  if (Q.get("fps")) GP.fps = clamp(+Q.get("fps") || 60, 10, 120);

  // ---------------- 渲染器 / 场景 / 相机 ----------------
  const canvas = $("c");
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: GP.aa, powerPreference: "default", stencil: false, preserveDrawingBuffer: Q.get("test") === "1" });
  } catch (e) {
    $("loadmsg").textContent = "此设备无法显示三维场景（" + e.message + "）";
    return;
  }
  renderer.setPixelRatio(GP.dpr);
  renderer.setSize(innerWidth, innerHeight, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.shadowMap.enabled = false;
  const scene = new THREE.Scene();
  const BG_DAY = new THREE.Color(0xeef3e6), BG_DUSK = new THREE.Color(0xf3dcc4), BG_NIGHT = new THREE.Color(0x26324a);
  scene.background = BG_DAY.clone();
  const camera = new THREE.PerspectiveCamera(30, innerWidth / innerHeight, 1, 600);
  // r160 物理光照下 Lambert 漫反射带 1/π，强度乘 π 让顶面接近平面图原色
  const LI = { hemi: 0.8 * Math.PI, sun: 0.4 * Math.PI };
  const hemi = new THREE.HemisphereLight(0xffffff, 0xb8c4a6, LI.hemi);
  const sun = new THREE.DirectionalLight(0xfff4e2, LI.sun);
  sun.position.set(-30, 60, -24);
  scene.add(hemi, sun);

  const controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.dampingFactor = 0.12;
  controls.screenSpacePanning = false;
  controls.minDistance = 5; controls.maxDistance = 220;
  controls.minPolarAngle = 0.12; controls.maxPolarAngle = 1.12;
  controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
  controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE };
  controls.zoomSpeed = 1.1; controls.panSpeed = 1.0; controls.rotateSpeed = 0.6;
  controls.addEventListener("change", () => {      // 平移不出底座
    const t = controls.target, cx = clamp(t.x, -W / 2, W / 2), cz = clamp(t.z, -D / 2, D / 2);
    if (cx !== t.x || cz !== t.z) { camera.position.x += cx - t.x; camera.position.z += cz - t.z; t.x = cx; t.z = cz; }
  });

  // 视角：总览（整块微缩模型）与草坪特写
  const LAWN_C = toW(860, 1075);
  const VIEWS = {
    overview: { t: [2, 0, 2], d: 178, polar: 0.56, az: 0 },
    lawn: { t: [LAWN_C[0], 0, LAWN_C[1]], d: 62, polar: 0.72, az: 0.12 },
    edit: { t: [LAWN_C[0] + 1, 0, LAWN_C[1]], d: 74, polar: 0.42, az: 0 },
  };
  function viewPos(v) {
    const t = new THREE.Vector3().fromArray(v.t);
    const p = t.clone().add(new THREE.Vector3(Math.sin(v.polar) * Math.sin(v.az), Math.cos(v.polar), Math.sin(v.polar) * Math.cos(v.az)).multiplyScalar(v.d));
    return [p, t];
  }
  let fly = null;
  function flyTo(pos, target, ms) {
    fly = { p0: camera.position.clone(), t0: controls.target.clone(), p1: pos.clone(), t1: target.clone(), t: 0, dur: (ms || 1100) / 1000 };
  }
  function goView(name, ms) { const [p, t] = viewPos(VIEWS[name]); flyTo(p, t, ms); }
  function flyToPoint(x, z, dist, ms) {
    const t = new THREE.Vector3(x, 0, z);
    const dir = camera.position.clone().sub(controls.target); dir.y = 0;
    if (dir.lengthSq() < 0.01) dir.set(0, 0, 1);
    dir.normalize();
    const d = dist || 16, polar = 0.95;
    const p = t.clone().addScaledVector(dir, Math.sin(polar) * d); p.y = Math.cos(polar) * d;
    flyTo(p, t, ms);
  }
  {
    const [p, t] = viewPos(VIEWS.overview);
    camera.position.copy(p).add(new THREE.Vector3(0, 60, 30)); controls.target.copy(t); camera.lookAt(t);
    flyTo(p, t, 1300);
  }

  // ---------------- 共享图元（实例化） ----------------
  const MAT = new THREE.MeshLambertMaterial({ flatShading: true });
  const MAT2 = new THREE.MeshLambertMaterial({ flatShading: true, side: THREE.DoubleSide });
  const SHADOW_MAT = new THREE.MeshBasicMaterial({ color: 0x29411f, transparent: true, opacity: 0.16, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 });
  function wingGeo() {
    const g = new THREE.BufferGeometry();
    const v = [-0.45, 0, 0, 0.5, 0, 0, 0.62, 0, 0.82, 0.05, 0, 1.0, -0.42, 0, 0.62];
    g.setAttribute("position", new THREE.Float32BufferAttribute(v, 3));
    g.setIndex([0, 1, 2, 0, 2, 3, 0, 3, 4]); g.computeVertexNormals(); return g;
  }
  const PRIMS = {
    box: { geo: new THREE.BoxGeometry(1, 1, 1), mat: MAT, cap: 700 },
    blob: { geo: new THREE.IcosahedronGeometry(0.5, 1), mat: MAT, cap: 1800 },
    gem: { geo: new THREE.IcosahedronGeometry(0.5, 0), mat: MAT, cap: 900 },
    cone: { geo: new THREE.ConeGeometry(0.5, 1, 7), mat: MAT, cap: 700 },
    cyl: { geo: new THREE.CylinderGeometry(0.5, 0.5, 1, 6), mat: MAT, cap: 900 },
    wing: { geo: wingGeo(), mat: MAT2, cap: 300 },
    shadow: { geo: new THREE.CircleGeometry(0.5, 14).rotateX(-Math.PI / 2), mat: SHADOW_MAT, cap: 600 },
  };
  for (const k in PRIMS) {
    const P = PRIMS[k];
    P.im = new THREE.InstancedMesh(P.geo, P.mat, P.cap);
    P.im.count = 0; P.im.frustumCulled = false; P.im.name = "prim-" + k;
    P.im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    if (k !== "shadow") { P.im.setColorAt(0, new THREE.Color()); P.im.instanceColor.setUsage(THREE.DynamicDrawUsage); }
    if (k === "shadow") P.im.renderOrder = 1;
    scene.add(P.im);
  }

  // ---------------- 季节调色（扁平插画色） ----------------
  const SEASONS = ["spring", "summer", "autumn", "winter"];
  const PAL = {
    trunk: 0x8a6446, trunkDark: 0x6e4f39,
    ginkgo: { spring: 0xa6d66a, summer: 0x6cae4e, autumn: 0xf4c430, winter: 0xc9a86a },
    ginkgo2: { spring: 0xb8e07c, summer: 0x7dbb5a, autumn: 0xf8d54e, winter: 0xc9a86a },
    ginkgoLeaf: { autumn: 0xe9d66a }, cherryPetal: { spring: 0xf3d3dc },
    osmanthus: { spring: 0x4f9a52, summer: 0x3f8b47, autumn: 0x3f8b47, winter: 0x4a8a50 },
    osmFlower: 0xf6c143,
    cherry: { spring: 0xf7b7cb, summer: 0x76b85a, autumn: 0xe58b4f, winter: 0xb08e74 },
    cherry2: { spring: 0xfbd2de, summer: 0x8cc66a, autumn: 0xf0a65c, winter: 0xb08e74 },
    camphor: { spring: 0x92b85c, summer: 0x4f9e4f, autumn: 0x56a052, winter: 0x5a9658 },
    camphor2: { spring: 0xa9c86a, summer: 0x63ad5a, autumn: 0x6bb05c, winter: 0x6aa063 },
    shrub: { spring: 0x6dbb5e, summer: 0x5aae55, autumn: 0x6aae56, winter: 0x6a9f5c },
    leafBase: { spring: 0x6cb85c, summer: 0x5aa850, autumn: 0x7aa850, winter: 0x7f9a66 },
    flowerA: { spring: 0xf28fb3, summer: 0xf06d8e, autumn: 0xf2a33a, winter: 0xd9d1c4 },
    flowerB: { spring: 0xffe066, summer: 0xffd23f, autumn: 0xe8673c, winter: 0xcfc6b8 },
    flowerC: { spring: 0xb59cf2, summer: 0x9a7ee8, autumn: 0xf7e7a4, winter: 0xd5cec4 },
    flowerD: 0xffffff,
    catOrange: 0xf2a24a, catWhite: 0xfaf6ee, catGray: 0x9aa0a8, catBlack: 0x3b3a3f, catPink: 0xf3a5a8, catEye: 0x2d3a2a,
    magpie: 0x262a33, magpieWhite: 0xf4f6f6, magpieBlue: 0x3a5f9a,
    sparrow: 0x9a6b44, sparrowBelly: 0xe6d3b5, sparrowHead: 0x7a4e2e,
    beak: 0x3a3a3a, beakYellow: 0xf2b632, egret: 0xfcfcfa, leg: 0x2f2f2f,
    bfYellow: 0xffd84d, bfWhite: 0xfdfcf4, bfBlue: 0x6fb6f2, bfOrange: 0xf59a3c, bfBody: 0x3b3328,
    lampPole: 0x6f7a80, bench: 0xb07a4c, lampHead: 0xfaf3d2,
    catBody: 0xf2a24a, catBelly: 0xfaf6ee, bfWing: 0xffd84d,
  };
  const ENV = { season: "autumn", night: 0, dusk: 0, auto: true, timeAuto: true, demoHour: 12, seasonOverride: null };
  const _c = new THREE.Color();
  function colorOf(key, obj) {
    const ov = obj && obj.userData.colors && obj.userData.colors[key];
    let v = ov != null ? ov : PAL[key];
    if (v == null) v = key;
    if (typeof v === "object") v = v[ENV.season] != null ? v[ENV.season] : v.summer != null ? v.summer : 0xff00ff;
    return _c.setHex(v);
  }

  // ---------------- 模型库：部件 → 图元 ----------------
  // 部件 { p: 图元, c: 调色键, pos, rot([x,y,z]，YXZ 顺序), s([x,y,z]), tag(动画), vis(季节 → 是否显示) }
  const MODELS = {};
  const _m6 = new THREE.Matrix4(), _v2 = new THREE.Vector3(), _s2 = new THREE.Vector3(), _q2 = new THREE.Quaternion(), _up = new THREE.Vector3(0, 1, 0);
  const _m4 = new THREE.Matrix4(), _m5 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, "YXZ"), _v = new THREE.Vector3(), _s = new THREE.Vector3();
  function defModel(key, def) {
    def.parts.forEach((p) => {
      p.pos = p.pos || [0, 0, 0]; p.rot = p.rot || [0, 0, 0]; p.s = p.s || [1, 1, 1];
      if (!p.tag) { p.m = new THREE.Matrix4().compose(_v.fromArray(p.pos), _q.setFromEuler(_e.set(p.rot[0], p.rot[1], p.rot[2], "YXZ")), _s.fromArray(p.s)); }
    });
    MODELS[key] = def; return def;
  }
  const REG = new Set();      // 代理对象
  function createProxy(key, opts) {
    const def = MODELS[key];
    const g = new THREE.Group(); g.name = "lawn-" + key;
    g.userData.model = key; g.userData.pose = {}; g.userData.height = def.height || 1; g.userData.shadowR = def.shadowR || 0.5;
    if (opts && opts.colors) g.userData.colors = opts.colors;
    REG.add(g); return g;
  }
  function disposeProxy(g) { REG.delete(g); if (g.parent) g.parent.remove(g); }
  // 动画部件：tag → 姿态附加旋转 / 位移
  function poseLocal(p, pose, out) {
    let rx = p.rot[0], ry = p.rot[1], rz = p.rot[2], dx = 0, dy = 0;
    switch (p.tag) {
      case "wing": rx += pose.wing || 0; break;
      case "tail": rz += pose.tail || 0; ry += pose.tailY || 0; break;
      case "legF": rz += pose.leg || 0; break;
      case "legB": rz -= pose.leg || 0; break;
      case "head": rz += pose.head || 0; dy += pose.headY || 0; dx += pose.headX || 0; break;
      case "neck": rz += pose.neck || 0; break;
      case "sway": rz += pose.sway || 0; rx += pose.swayX || 0; break;
      case "body": rz += pose.body || 0; dy += pose.bodyY || 0; break;
    }
    return out.compose(_v.set(p.pos[0] + dx, p.pos[1] + dy, p.pos[2]), _q.setFromEuler(_e.set(rx, ry, rz, "YXZ")), _s.fromArray(p.s));
  }
  const STATIC = [];          // 装饰树等静态物（不进编辑器）：{ key, m: Matrix4, x, z, r, colors }
  let syncDirty = true;
  function syncInstances(time) {
    for (const k in PRIMS) PRIMS[k].im.count = 0;
    const put = (prim, m, color) => {
      const P = PRIMS[prim], i = P.im.count; if (i >= P.cap) return;
      P.im.setMatrixAt(i, m); if (color) P.im.setColorAt(i, color); P.im.count = i + 1;
    };
    const sh = GP.shadows;
    const doParts = (def, world, obj, pose, gobj) => {
      for (const p of def.parts) {
        if (p.vis && !p.vis(ENV.season)) continue;
        const lm = p.tag ? poseLocal(p, pose, _m5) : p.m;
        if (p.ground) {
          // 贴地部件（落叶、落花）：始终铺在地面上，个体被提起（移植 / 拔起）时随高度淡出
          const y = gobj ? gobj.position.y : 0, sc = (gobj ? gobj.scale.x : 1) * Math.max(0, 1 - y / 0.25);
          if (sc < 1e-3) continue;
          _m6.compose(_v2.set(world.elements[12], 0, world.elements[14]), _q2.setFromAxisAngle(_up, gobj ? gobj.rotation.y : 0), _s2.set(sc, sc, sc));
          if (!gobj) _m6.copy(world).setPosition(world.elements[12], 0, world.elements[14]);
          _m4.multiplyMatrices(_m6, lm);
        } else _m4.multiplyMatrices(world, lm);
        put(p.p, _m4, colorOf(p.c, obj));
      }
    };
    for (const s of STATIC) {
      const def = MODELS[s.key];
      if (s.sway) { s.pose.sway = Math.sin(time * 0.9 + s.ph) * 0.025; }
      doParts(def, s.m, s, s.pose);
      if (sh && def.shadowR) { _m4.compose(_v.set(s.x + 0.25, 0.015, s.z + 0.2), _q.identity(), _s.set(def.shadowR * 2 * s.sc, 1, def.shadowR * 1.7 * s.sc)); put("shadow", _m4); }
    }
    for (const g of REG) {
      if (!g.parent || !g.visible) continue;
      const def = MODELS[g.userData.model];
      const sc = g.scale.x;
      if (sc < 1e-3) continue;
      if (def.sway) g.userData.pose.sway = Math.sin(time * 0.9 + (g.id % 7)) * 0.025;
      doParts(def, g.matrixWorld, g, g.userData.pose, g);
      if (sh && def.shadowR) {
        const h = Math.max(0, g.position.y), f = 1 / (1 + h * 0.6);
        const r = def.shadowR * sc * f;
        _m4.compose(_v.set(g.position.x + 0.22 * Math.min(1, sc), 0.015, g.position.z + 0.18 * Math.min(1, sc)), _q.identity(), _s.set(r * 2, 1, r * 1.7)); put("shadow", _m4);
      }
    }
    for (const k in PRIMS) {
      const im = PRIMS[k].im;
      im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
    }
  }

  // ---------------- 树种 / 灌木 / 花丛 / 动物的低多边形模型 ----------------
  const notWinter = (s) => s !== "winter";
  const isAutumn = (s) => s === "autumn";
  const isWinter = (s) => s === "winter";
  // 银杏：挺直主干 + 塔形树冠（三层）；秋季金黄，树下铺一圈落叶
  defModel("ginkgo", { height: 3.2, shadowR: 0.9, sway: true, parts: [
    { p: "cyl", c: "trunk", pos: [0, 0.75, 0], s: [0.16, 1.5, 0.16] },
    { p: "blob", c: "ginkgo", pos: [0, 1.85, 0], s: [1.35, 2.1, 1.35], tag: "sway", vis: notWinter },
    { p: "blob", c: "ginkgo2", pos: [0.32, 1.55, 0.22], s: [0.8, 0.95, 0.8], tag: "sway", vis: notWinter },
    { p: "blob", c: "ginkgo2", pos: [-0.12, 2.65, -0.1], s: [0.75, 0.9, 0.75], tag: "sway", vis: notWinter },
    { p: "cyl", c: "trunkDark", pos: [0.22, 1.9, 0], rot: [0, 0, -0.6], s: [0.06, 0.8, 0.06], vis: isWinter },
    { p: "cyl", c: "trunkDark", pos: [-0.2, 2.2, 0.05], rot: [0, 0, 0.55], s: [0.06, 0.8, 0.06], vis: isWinter },
    { p: "cyl", c: "trunkDark", pos: [0, 2.6, 0], s: [0.07, 1.0, 0.07], vis: isWinter },
    { p: "blob", c: "ginkgoLeaf", pos: [0.15, 0, 0.1], s: [2.4, 0.03, 2.1], vis: isAutumn, ground: true },
    { p: "blob", c: "ginkgoLeaf", pos: [-0.9, 0, 0.6], s: [0.7, 0.03, 0.55], vis: isAutumn, ground: true },
  ] });
  // 桂花：矮干 + 浓密圆冠（两团），秋季满树金黄小花点
  const osmFlowers = [];
  for (let i = 0; i < 9; i++) { const a = i * 2.4, r = 0.45 + (i % 3) * 0.12, y = 1.0 + (i % 4) * 0.2; osmFlowers.push({ p: "gem", c: "osmFlower", pos: [Math.cos(a) * r, y, Math.sin(a) * r], s: [0.13, 0.13, 0.13], vis: isAutumn }); }
  defModel("osmanthus", { height: 1.8, shadowR: 0.7, sway: true, parts: [
    { p: "cyl", c: "trunk", pos: [0, 0.35, 0], s: [0.13, 0.7, 0.13] },
    { p: "blob", c: "osmanthus", pos: [0, 1.05, 0], s: [1.35, 1.15, 1.35], tag: "sway" },
    { p: "blob", c: "osmanthus", pos: [0.15, 1.55, -0.05], s: [0.9, 0.8, 0.9], tag: "sway" },
  ].concat(osmFlowers) });
  // 樱花：斜出的分枝 + 扁圆伞形花冠，春季粉白
  defModel("cherry", { height: 2.4, shadowR: 0.95, sway: true, parts: [
    { p: "cyl", c: "trunk", pos: [0, 0.55, 0], s: [0.15, 1.1, 0.15] },
    { p: "cyl", c: "trunk", pos: [0.25, 1.15, 0], rot: [0, 0, -0.7], s: [0.09, 0.7, 0.09] },
    { p: "cyl", c: "trunk", pos: [-0.22, 1.2, 0.1], rot: [0.2, 0, 0.7], s: [0.09, 0.7, 0.09] },
    { p: "blob", c: "cherry", pos: [0, 1.65, 0], s: [1.9, 0.95, 1.7], tag: "sway", vis: notWinter },
    { p: "blob", c: "cherry2", pos: [0.55, 1.5, 0.25], s: [1.0, 0.7, 1.0], tag: "sway", vis: notWinter },
    { p: "blob", c: "cherry2", pos: [-0.55, 1.55, -0.2], s: [1.0, 0.7, 1.0], tag: "sway", vis: notWinter },
    { p: "blob", c: "cherryPetal", pos: [0.1, 0, 0.1], s: [2.3, 0.03, 2.0], vis: (s) => s === "spring", ground: true },
  ] });
  // 香樟：粗干 + 三团大圆冠，四季常绿
  defModel("camphor", { height: 3.0, shadowR: 1.2, sway: true, parts: [
    { p: "cyl", c: "trunk", pos: [0, 0.6, 0], s: [0.22, 1.2, 0.22] },
    { p: "blob", c: "camphor", pos: [0, 1.75, 0], s: [2.1, 1.7, 2.1], tag: "sway" },
    { p: "blob", c: "camphor2", pos: [0.7, 1.45, 0.3], s: [1.25, 1.05, 1.25], tag: "sway" },
    { p: "blob", c: "camphor2", pos: [-0.6, 1.55, -0.35], s: [1.3, 1.1, 1.3], tag: "sway" },
    { p: "blob", c: "camphor", pos: [0.1, 2.5, 0.05], s: [1.2, 0.9, 1.2], tag: "sway" },
  ] });
  // 灌木球：修剪成球形的小叶女贞 / 红叶石楠
  defModel("shrub_ball", { height: 0.8, shadowR: 0.45, parts: [
    { p: "blob", c: "shrub", pos: [0, 0.4, 0], s: [0.9, 0.78, 0.9] },
  ] });
  // 草花花丛 / 花境：低矮叶丛上点缀几色小花
  const flowerParts = [{ p: "blob", c: "leafBase", pos: [0, 0.1, 0], s: [1.15, 0.28, 0.95] }];
  const FL = ["flowerA", "flowerB", "flowerC", "flowerD", "flowerA", "flowerB", "flowerA", "flowerC", "flowerB", "flowerA", "flowerD"];
  for (let i = 0; i < FL.length; i++) { const a = i * 2.39996, r = 0.12 + 0.36 * Math.sqrt((i + 0.5) / FL.length); flowerParts.push({ p: "gem", c: FL[i], pos: [Math.cos(a) * r * 1.15, 0.24 + (i % 3) * 0.04, Math.sin(a) * r * 0.95], s: [0.17, 0.13, 0.17], vis: notWinter }); }
  defModel("flowerbed", { height: 0.35, shadowR: 0, parts: flowerParts });
  // 校园小猫（面向 +x）：身体、头、耳朵、尾巴、四条腿
  defModel("cat", { height: 0.45, shadowR: 0.28, parts: [
    { p: "box", c: "catBody", pos: [0, 0.2, 0], s: [0.42, 0.18, 0.2], tag: "body" },
    { p: "box", c: "catBelly", pos: [0.02, 0.13, 0], s: [0.3, 0.05, 0.17], tag: "body" },
    { p: "gem", c: "catBody", pos: [0.25, 0.33, 0], s: [0.24, 0.21, 0.24], tag: "head" },
    { p: "gem", c: "catBelly", pos: [0.355, 0.3, 0], s: [0.08, 0.08, 0.12], tag: "head" },
    { p: "cone", c: "catBody", pos: [0.24, 0.47, 0.07], s: [0.08, 0.1, 0.07], tag: "head" },
    { p: "cone", c: "catBody", pos: [0.24, 0.47, -0.07], s: [0.08, 0.1, 0.07], tag: "head" },
    { p: "box", c: "catEye", pos: [0.36, 0.36, 0.055], s: [0.02, 0.035, 0.03], tag: "head" },
    { p: "box", c: "catEye", pos: [0.36, 0.36, -0.055], s: [0.02, 0.035, 0.03], tag: "head" },
    { p: "cyl", c: "catBody", pos: [-0.27, 0.32, 0], rot: [0, 0, 0.55], s: [0.045, 0.3, 0.045], tag: "tail" },
    { p: "box", c: "catBody", pos: [0.15, 0.07, 0.065], s: [0.05, 0.14, 0.05], tag: "legF" },
    { p: "box", c: "catBody", pos: [0.15, 0.07, -0.065], s: [0.05, 0.14, 0.05], tag: "legB" },
    { p: "box", c: "catBody", pos: [-0.15, 0.07, 0.065], s: [0.05, 0.14, 0.05], tag: "legB" },
    { p: "box", c: "catBody", pos: [-0.15, 0.07, -0.065], s: [0.05, 0.14, 0.05], tag: "legF" },
  ] });
  // 蝴蝶：两对翅膀（扁平双面）+ 细身
  defModel("butterfly", { height: 0.1, shadowR: 0.1, parts: [
    { p: "cyl", c: "bfBody", pos: [0, 0, 0], rot: [0, 0, Math.PI / 2], s: [0.025, 0.16, 0.025] },
    { p: "wing", c: "bfWing", pos: [0, 0, 0.01], rot: [0, 0, 0], s: [0.2, 1, 0.2], tag: "wing" },
    { p: "wing", c: "bfWing", pos: [0, 0, -0.01], rot: [0, Math.PI, 0], s: [0.2, 1, 0.2], tag: "wing" },
  ] });
  // 喜鹊：黑白相间、长尾，翅膀带蓝色光泽
  defModel("magpie", { height: 0.35, shadowR: 0.18, parts: [
    { p: "gem", c: "magpie", pos: [0, 0.22, 0], s: [0.3, 0.17, 0.16], tag: "body" },
    { p: "gem", c: "magpieWhite", pos: [0.02, 0.18, 0], s: [0.2, 0.1, 0.17], tag: "body" },
    { p: "gem", c: "magpie", pos: [0.15, 0.32, 0], s: [0.13, 0.13, 0.12], tag: "head" },
    { p: "cone", c: "beak", pos: [0.24, 0.32, 0], rot: [0, 0, -Math.PI / 2], s: [0.04, 0.08, 0.04], tag: "head" },
    { p: "box", c: "magpie", pos: [-0.24, 0.27, 0], rot: [0, 0, 0.32], s: [0.26, 0.025, 0.07], tag: "tail" },
    { p: "box", c: "magpieBlue", pos: [-0.02, 0.25, 0.08], s: [0.18, 0.025, 0.2], rot: [0, 0, 0], tag: "wing" },
    { p: "box", c: "magpieBlue", pos: [-0.02, 0.25, -0.08], s: [0.18, 0.025, 0.2], rot: [0, Math.PI, 0], tag: "wing" },
    { p: "cyl", c: "leg", pos: [0.02, 0.06, 0.03], s: [0.015, 0.12, 0.015] },
    { p: "cyl", c: "leg", pos: [0.02, 0.06, -0.03], s: [0.015, 0.12, 0.015] },
  ] });
  // 麻雀：圆滚滚的褐色小鸟
  defModel("sparrow", { height: 0.2, shadowR: 0.1, parts: [
    { p: "gem", c: "sparrow", pos: [0, 0.12, 0], s: [0.17, 0.12, 0.12], tag: "body" },
    { p: "gem", c: "sparrowBelly", pos: [0.02, 0.1, 0], s: [0.12, 0.08, 0.11], tag: "body" },
    { p: "gem", c: "sparrowHead", pos: [0.08, 0.18, 0], s: [0.09, 0.09, 0.085], tag: "head" },
    { p: "cone", c: "beak", pos: [0.135, 0.175, 0], rot: [0, 0, -Math.PI / 2], s: [0.03, 0.04, 0.03], tag: "head" },
    { p: "box", c: "sparrowHead", pos: [-0.11, 0.14, 0], rot: [0, 0, 0.3], s: [0.08, 0.015, 0.05], tag: "tail" },
    { p: "box", c: "sparrow", pos: [-0.01, 0.14, 0.05], s: [0.1, 0.015, 0.11], tag: "wing" },
    { p: "box", c: "sparrow", pos: [-0.01, 0.14, -0.05], s: [0.1, 0.015, 0.11], rot: [0, Math.PI, 0], tag: "wing" },
    { p: "cyl", c: "leg", pos: [0.0, 0.03, 0.02], s: [0.01, 0.06, 0.01] },
    { p: "cyl", c: "leg", pos: [0.0, 0.03, -0.02], s: [0.01, 0.06, 0.01] },
  ] });
  // 白鹭：白身、长颈、黄喙、黑色长腿
  defModel("egret", { height: 0.9, shadowR: 0.22, parts: [
    { p: "gem", c: "egret", pos: [0, 0.5, 0], s: [0.36, 0.2, 0.18], tag: "body" },
    { p: "cyl", c: "egret", pos: [0.14, 0.68, 0], rot: [0, 0, -0.35], s: [0.05, 0.3, 0.05], tag: "neck" },
    { p: "gem", c: "egret", pos: [0.22, 0.86, 0], s: [0.11, 0.1, 0.1], tag: "head" },
    { p: "cone", c: "beakYellow", pos: [0.34, 0.85, 0], rot: [0, 0, -Math.PI / 2], s: [0.035, 0.17, 0.035], tag: "head" },
    { p: "box", c: "egret", pos: [-0.04, 0.53, 0.07], s: [0.26, 0.03, 0.3], tag: "wing" },
    { p: "box", c: "egret", pos: [-0.04, 0.53, -0.07], s: [0.26, 0.03, 0.3], rot: [0, Math.PI, 0], tag: "wing" },
    { p: "cyl", c: "leg", pos: [0, 0.2, 0.04], s: [0.018, 0.42, 0.018], tag: "legF" },
    { p: "cyl", c: "leg", pos: [0, 0.2, -0.04], s: [0.018, 0.42, 0.018], tag: "legB" },
  ] });
  // 路灯、长椅（静态装饰）
  defModel("lamp", { height: 1.2, shadowR: 0, parts: [
    { p: "cyl", c: "lampPole", pos: [0, 0.55, 0], s: [0.05, 1.1, 0.05] },
    { p: "gem", c: "lampHead", pos: [0, 1.15, 0], s: [0.16, 0.14, 0.16] },
  ] });
  defModel("bench", { height: 0.3, shadowR: 0, parts: [
    { p: "box", c: "bench", pos: [0, 0.16, 0], s: [0.6, 0.04, 0.2] },
    { p: "box", c: "bench", pos: [0, 0.27, -0.09], s: [0.6, 0.14, 0.03] },
    { p: "box", c: "lampPole", pos: [0.25, 0.08, 0], s: [0.04, 0.16, 0.18] },
    { p: "box", c: "lampPole", pos: [-0.25, 0.08, 0], s: [0.04, 0.16, 0.18] },
  ] });

  // ---------------- 底座 + 平面图底图 ----------------
  const MASK = { w: 0, h: 0, data: null, ready: false };
  const GROUND_CLASSES = [["grass", [156, 204, 142]], ["road", [221, 208, 180]], ["white", [251, 250, 244]], ["plaza", [220, 218, 219]], ["water", [58, 166, 220]]];
  const groundMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(W, D).rotateX(-Math.PI / 2), groundMat);
  ground.name = "ground"; ground.renderOrder = 0;
  scene.add(ground);
  {   // 底座侧面（土层 + 草皮边）：一个网格、顶点色
    const g = new THREE.BoxGeometry(W, SLAB, D).translate(0, -SLAB / 2 - 0.005, 0).toNonIndexed();
    const pos = g.attributes.position, nrm = g.attributes.normal, col = [];
    const soil = new THREE.Color(0xb48a5e), soilDark = new THREE.Color(0x8f6a46), turf = new THREE.Color(0x7fb46f);
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i), ny = nrm.getY(i);
      const c = ny > 0.5 ? turf : y > -0.25 ? turf : (nrm.getX(i) > 0.5 || nrm.getZ(i) > 0.5 ? soilDark : soil);
      col.push(c.r, c.g, c.b);
    }
    g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    const slab = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
    slab.name = "slab"; scene.add(slab);
  }
  const groundReady = new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const tex = new THREE.Texture(img);
      tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
      tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.needsUpdate = true;
      groundMat.map = tex; groundMat.needsUpdate = true;
      // 放置规则用的类别图：按 1 平面图像素采样
      const w = REGION.x1 - REGION.x0, h = REGION.y1 - REGION.y0;
      const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
      const cx = cv.getContext("2d", { willReadFrequently: true }); cx.imageSmoothingEnabled = false; cx.drawImage(img, 0, 0, w, h);
      const px = cx.getImageData(0, 0, w, h).data, data = new Uint8Array(w * h);
      for (let i = 0; i < w * h; i++) {
        let best = 0, bd = 1e9;
        for (let k = 0; k < GROUND_CLASSES.length; k++) {
          const c = GROUND_CLASSES[k][1], dr = px[i * 4] - c[0], dg = px[i * 4 + 1] - c[1], db = px[i * 4 + 2] - c[2], d2 = dr * dr + dg * dg + db * db;
          if (d2 < bd) { bd = d2; best = k; }
        }
        data[i] = best;
      }
      Object.assign(MASK, { w, h, data, ready: true });
      resolve();
    };
    img.onerror = () => resolve();
    img.src = "lawn-ground.png";
  });
  function classAt(x, z) {        // 世界坐标 → 地面类别名
    if (!MASK.ready) return "grass";
    const px = Math.floor(x * PX + CX - REGION.x0), py = Math.floor(z * PX + CY - REGION.y0);
    if (px < 0 || py < 0 || px >= MASK.w || py >= MASK.h) return "out";
    return GROUND_CLASSES[MASK.data[py * MASK.w + px]][0];
  }

  // ---------------- 建筑：按平面图轮廓挤出（合并为一个网格） ----------------
  const BUILDINGS = [];      // { name, label, poly(世界坐标), circle, h, top }
  function pointInPoly(x, z, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i][0], zi = poly[i][1], xj = poly[j][0], zj = poly[j][1];
      if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
    }
    return inside;
  }
  function distToPoly(x, z, poly) {
    if (pointInPoly(x, z, poly)) return -1;
    let best = 1e9;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const ax = poly[j][0], az = poly[j][1], bx = poly[i][0], bz = poly[i][1];
      const dx = bx - ax, dz = bz - az, t = clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1), 0, 1);
      best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t));
    }
    return best;
  }
  function buildingAt(x, z, margin) {
    for (const b of BUILDINGS) {
      for (const poly of b.polys) if (distToPoly(x, z, poly) < margin) return b;
      for (const c of b.circles) if (Math.hypot(x - c[0], z - c[1]) < c[2] + margin) return b;
    }
    return null;
  }
  const ROOF = { 宿舍: 0xf7dcbc, 教学: 0xfff07c, 其他: 0xf3a9a4 };
  const WALL_INK = new THREE.Color(0x6a5242);
  function buildBuildings(layout) {
    const inside = (poly) => poly.every(([x, y]) => x >= REGION.x0 + 3 && x <= REGION.x1 - 3 && y >= REGION.y0 + 3 && y <= REGION.y1 - 3);
    const geos = [];
    const pushGeo = (g, roof) => {
      if (g.index) g = g.toNonIndexed();
      g.computeVertexNormals();
      const n = g.attributes.normal, col = [], top = new THREE.Color(roof), wall = top.clone().lerp(WALL_INK, 0.62), wallLit = top.clone().lerp(WALL_INK, 0.3);
      for (let i = 0; i < n.count; i++) {
        const ny = n.getY(i), lit = n.getX(i) < -0.3 || n.getZ(i) < -0.3;   // 西 / 北面迎光
        const c = ny > 0.5 ? top : lit ? wallLit : wall;
        col.push(c.r, c.g, c.b);
      }
      g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
      for (const k of Object.keys(g.attributes)) if (k !== "position" && k !== "normal" && k !== "color") g.deleteAttribute(k);
      geos.push(g);
    };
    const extrude = (polyW, h) => {
      const sh = new THREE.Shape(polyW.map(([x, z]) => new THREE.Vector2(x, -z)));
      return new THREE.ExtrudeGeometry(sh, { depth: h, bevelEnabled: false, curveSegments: 16 }).rotateX(-Math.PI / 2);
    };
    for (const b of layout.buildings || []) {
      const parts = b.parts || [{ poly: b.poly, h: b.h }];
      if (!parts.every((p) => Array.isArray(p.poly) && p.poly.length > 2 && inside(p.poly))) continue;
      const roof = b.cat === "宿舍" ? ROOF.宿舍 : b.cat === "教学" ? ROOF.教学 : ROOF.其他;
      const rec = { id: b.id, name: b.name, label: b.name.replace(/\s*学生公寓$/, ""), polys: [], circles: [], h: 0, cx: 0, cz: 0 };
      let sx = 0, sz = 0, n = 0;
      for (const p of parts) {
        const polyW = p.poly.map(([x, y]) => toW(x, y));
        const h = Math.max(1.6, (p.h || 20) * 0.1);
        pushGeo(extrude(polyW, h), roof);
        rec.polys.push(polyW); rec.h = Math.max(rec.h, h);
        polyW.forEach(([x, z]) => { sx += x; sz += z; n++; });
      }
      if (b.roundEnd) {   // A 区宿舍的水滴形尾部
        const [cx, cz] = toW(b.roundEnd.c[0], b.roundEnd.c[1]), r = b.roundEnd.r / PX, h = Math.max(1.6, (b.h || 20) * 0.1);
        pushGeo(new THREE.CylinderGeometry(r, r, h, 20).translate(cx, h / 2, cz), roof);
        rec.circles.push([cx, cz, r]);
      }
      rec.cx = sx / n; rec.cz = sz / n;
      if (b.id === "library") { rec.cx = toW(1278, 980)[0]; rec.cz = toW(1278, 980)[1]; }
      BUILDINGS.push(rec);
    }
    // 合并
    let total = 0; geos.forEach((g) => (total += g.attributes.position.count));
    const P = new Float32Array(total * 3), N = new Float32Array(total * 3), C = new Float32Array(total * 3);
    let o = 0;
    geos.forEach((g) => { P.set(g.attributes.position.array, o * 3); N.set(g.attributes.normal.array, o * 3); C.set(g.attributes.color.array, o * 3); o += g.attributes.position.count; g.dispose(); });
    const mg = new THREE.BufferGeometry();
    mg.setAttribute("position", new THREE.BufferAttribute(P, 3)); mg.setAttribute("normal", new THREE.BufferAttribute(N, 3)); mg.setAttribute("color", new THREE.BufferAttribute(C, 3));
    const mesh = new THREE.Mesh(mg, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
    mesh.name = "buildings"; scene.add(mesh);
    // 中文标注（HTML，0 draw call）
    const box = $("labels");
    for (const b of BUILDINGS) addLabel(b.label, b.cx, b.h + 0.05, b.cz, "lb-bld");
    addLabel("荷花池", ...toWy(1300, 805, 0.05), "lb-water");
    addLabel("光华广场", ...toWy(1330, 1300, 0.05), "lb-plaza");
    addLabel("中心草坪", ...toWy(870, 1050, 0.05), "lb-zone");
    addLabel("中央步道", ...toWy(652, 1000, 0.05), "lb-road lb-v");
    addLabel("环校路", ...toWy(800, 1185, 0.05), "lb-road lb-r35");
    void box;
  }
  function toWy(px, py, y) { const [x, z] = toW(px, py); return [x, y, z]; }
  const LABELS = [];
  function addLabel(text, x, y, z, cls) {
    const el = document.createElement("div"); el.className = "lb " + (cls || ""); el.textContent = text;
    $("labels").appendChild(el); LABELS.push({ el, p: new THREE.Vector3(x, y, z), shown: true, road: /lb-road/.test(cls), zone: /lb-zone/.test(cls) });
  }
  const _pv = new THREE.Vector3();
  function updateLabels() {
    const w = innerWidth, h = innerHeight, far = camera.position.distanceTo(controls.target);
    const small = far > 150, near = far < 34;
    for (const L of LABELS) {
      _pv.copy(L.p).project(camera);
      const vis = _pv.z < 1 && Math.abs(_pv.x) < 1.05 && Math.abs(_pv.y) < 1.05 && !(small && L.road) && !(near && L.zone);
      if (vis !== L.shown) { L.el.style.display = vis ? "" : "none"; L.shown = vis; }
      if (vis) L.el.style.transform = "translate(-50%,-50%) translate(" + ((_pv.x * 0.5 + 0.5) * w).toFixed(1) + "px," + ((-_pv.y * 0.5 + 0.5) * h).toFixed(1) + "px)";
    }
  }

  // ---------------- 静态装饰：周边草地上的行道树 / 灌木、路灯、长椅（不进编辑器） ----------------
  let zonePoly = null;
  function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
  function grassAround(x, z, r) {
    if (classAt(x, z) !== "grass") return false;
    for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; if (classAt(x + Math.cos(a) * r, z + Math.sin(a) * r) !== "grass") return false; }
    return true;
  }
  function inZone(x, z, pad) {
    if (!zonePoly) return false;
    return pad ? distToPoly(x, z, zonePoly) < pad : pointInPoly(x, z, zonePoly);
  }
  function buildDecor() {
    const R = rng(20261112), keys = ["camphor", "camphor", "osmanthus", "ginkgo", "shrub_ball", "camphor", "cherry", "shrub_ball"];
    const want = Math.round(54 * GP.decor);
    let tries = 0;
    while (STATIC.filter((s) => s.tree).length < want && tries++ < 6000) {
      const x = (R() - 0.5) * (W - 4), z = (R() - 0.5) * (D - 4);
      const key = keys[Math.floor(R() * keys.length)], r = { camphor: 1.25, osmanthus: 0.75, ginkgo: 1.0, cherry: 1.0, shrub_ball: 0.45 }[key];
      if (inZone(x, z, 1.5)) continue;                     // 中心草坪内部留给可编辑的个体
      if (!grassAround(x, z, r * 0.75)) continue;
      if (buildingAt(x, z, r + 0.4)) continue;
      if (STATIC.some((s) => Math.hypot(s.x - x, s.z - z) < s.r + r + 0.3)) continue;
      addStatic(key, x, z, r, R() * 6.28, 0.85 + R() * 0.3, true);
    }
    // 中央步道旁的路灯与长椅（沿路边草地等距布置）
    const lamps = [[655, 960], [654, 1040], [760, 893], [905, 864], [1062, 892], [1118, 990]];
    lamps.forEach(([px, py], i) => { const [x, z] = toW(px, py); if (classAt(x, z) === "grass" || classAt(x, z) === "white") addStatic("lamp", x, z, 0.25, 0, 1, false); });
    [[700, 915, -0.24], [1085, 945, 1.0]].forEach(([px, py, ry]) => { const [x, z] = toW(px, py); addStatic("bench", x, z, 0.4, ry, 1, false); });
  }
  function addStatic(key, x, z, r, ry, sc, tree) {
    const s = { key, x, z, r: r * sc, sc, tree, pose: {}, ph: Math.random() * 6, sway: !!MODELS[key].sway, userData: {} };
    s.m = new THREE.Matrix4().compose(new THREE.Vector3(x, 0, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)), new THREE.Vector3(sc, sc, sc));
    STATIC.push(s); return s;
  }
  function staticAt(x, z, r) { return STATIC.find((s) => Math.hypot(s.x - x, s.z - z) < s.r * 0.8 + r) || null; }

  // ---------------- 季节 / 昼夜（北京时间，轻量） ----------------
  const SEASON_NAME = { spring: "春季", summer: "夏季", autumn: "秋季", winter: "冬季" };
  function bj() { return window.EcoWeather ? window.EcoWeather.beijingParts(Date.now()) : null; }
  function applyEnv() {
    const p = bj();
    const season = ENV.seasonOverride || (p ? window.EcoWeather.seasonOfMonth(p.mo) : "autumn");
    let elev = 40;
    const hour = ENV.timeAuto ? (p ? p.hours : 12) : ENV.demoHour;
    if (p && window.EcoWeather.sunPosition) elev = window.EcoWeather.sunPosition(p.doy, hour).elevation;
    const night = clamp((2 - elev) / 10, 0, 1), dusk = clamp(1 - Math.abs(elev - 3) / 9, 0, 1) * (1 - night);
    if (season !== ENV.season) { ENV.season = season; syncDirty = true; }
    ENV.night = night; ENV.dusk = dusk; ENV.hour = hour; ENV.elev = elev;
    scene.background.copy(BG_DAY).lerp(BG_DUSK, dusk).lerp(BG_NIGHT, night);
    const k = 1 - 0.4 * night;
    hemi.intensity = LI.hemi * k; sun.intensity = LI.sun * (1 - night * 0.75);
    hemi.color.setHex(0xffffff).lerp(new THREE.Color(0xffd6b0), dusk * 0.6).lerp(new THREE.Color(0x9fb0d8), night);
    sun.color.setHex(0xfff4e2).lerp(new THREE.Color(0xffb27a), dusk).lerp(new THREE.Color(0xb8c8ff), night);
    groundMat.color.setHex(0xffffff).lerp(new THREE.Color(0xffe2c4), dusk * 0.5).lerp(new THREE.Color(0x8794b4), night);
    PAL.lampHead = night > 0.3 ? 0xffe9a0 : 0xfaf3d2;
    document.body.classList.toggle("is-night", night > 0.5);
    const tl = $("lz-time");
    if (tl) {
      const pad = (n) => String(n).padStart(2, "0"), hh = Math.floor(hour), mm = Math.floor((hour - hh) * 60);
      tl.textContent = (p ? "北京时间 " + p.mo + "月" + p.day + "日 " : "") + pad(hh) + ":" + pad(mm) + (ENV.timeAuto ? "" : "（演示）") + " · " + SEASON_NAME[season] + (ENV.seasonOverride ? "（演示）" : "") + (night > 0.5 ? " · 夜晚" : dusk > 0.4 ? " · 黄昏" : " · 白天");
    }
  }

  // ---------------- 界面：返回、板块卡片、生态面板、工具条 ----------------
  function backUrl() {
    let b = Q.get("back") || "";
    if (!/^\/[^/\\]/.test(b) && b !== "/") b = "../../ecohome.jsp";
    const sep = b.indexOf("?") >= 0 ? "&" : "?";
    let u = b + sep + "zone=" + encodeURIComponent(ZONE_ID) + "&autostart=1";
    if (Q.get("weather")) u += "&weather=" + encodeURIComponent(Q.get("weather"));
    if (ENV.seasonOverride) u += "&season=" + encodeURIComponent(ENV.seasonOverride);
    else if (Q.get("season")) u += "&season=" + encodeURIComponent(Q.get("season"));
    if (!ENV.timeAuto) u += "&hour=" + ENV.demoHour.toFixed(2);
    return u;
  }
  function goBack() { document.body.classList.add("lz-leaving"); const u = backUrl(); setTimeout(() => (location.href = u), 450); }
  function buildUI(zone) {
    $("lz-back").onclick = goBack;
    if (zone) {
      $("lz-name").textContent = (zone.icon ? zone.icon + " " : "") + zone.name;
      $("lz-intro").textContent = zone.intro || "";
      $("lz-tags").innerHTML = (zone.highlights || []).map((h) => "<span>" + esc(h) + "</span>").join("");
      document.title = zone.name + " · 板块细节 - 智慧校园虚拟生态";
    }
    $("lz-view").onclick = () => goView("overview");
    $("lz-lawn").onclick = () => goView("lawn");
    const ss = $("lz-season");
    if (Q.get("season") && SEASONS.indexOf(Q.get("season")) >= 0) { ENV.seasonOverride = Q.get("season"); ss.value = ENV.seasonOverride; }
    ss.onchange = () => { ENV.seasonOverride = ss.value === "auto" ? null : ss.value; applyEnv(); };
    const ts = $("lz-tod");
    if (Q.get("hour")) { ENV.timeAuto = false; ENV.demoHour = +Q.get("hour") || 12; ts.value = ENV.demoHour >= 19 || ENV.demoHour < 5.5 ? "21.5" : ENV.demoHour >= 17 ? "18.2" : "11"; }
    ts.onchange = () => { if (ts.value === "auto") ENV.timeAuto = true; else { ENV.timeAuto = false; ENV.demoHour = +ts.value; } applyEnv(); };
    const gs = $("lz-gfx");
    gs.value = GFX.mode; gs.title = GFX.explicit ? "画质（与校园全景、池塘共用）" : "画质：未手动选择，" + (integrated ? "检测到核显 / 软件渲染，默认流畅" : "默认清晰");
    gs.onchange = () => {
      GFX.mode = gs.value; GFX.explicit = true; GFX.auto = false;
      try { localStorage.setItem("campus.gfx", GFX.mode); } catch (e) { /* 无痕模式 */ }
      const keepFps = Q.get("fps");
      GP = gfxParams(GFX.mode); if (keepFps) GP.fps = clamp(+keepFps, 10, 120);
      renderer.setPixelRatio(GP.dpr); renderer.setSize(innerWidth, innerHeight, false);
      toast(GFX.mode === "eco" ? "省电：像素比 1、帧率上限 30、不画影子（抗锯齿在刷新后关闭）" : GFX.mode === "smooth" ? "流畅：像素比 1" : "清晰：像素比 ≤ 1.5");
    };
    $("lz-fold").onclick = () => { const p = $("lz-eco"); p.classList.toggle("is-folded"); $("lz-fold").textContent = p.classList.contains("is-folded") ? "+" : "–"; };
  }
  let toastT = 0;
  function toast(msg) { const t = $("lz-toast"); t.textContent = msg; t.classList.add("on"); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("on"), 2600); }

  // ---------------- 主循环（帧率上限、可见时才渲染） ----------------
  const hooks = [];
  let last = performance.now(), lastRender = 0, frames = 0, fpsT = 0, fps = 0, started = false, firstFrame = false;
  const clock = { t: 0 };
  let envT = 0;
  function loop(now) {
    requestAnimationFrame(loop);
    if (!started) return;
    const minDt = 1000 / GP.fps - 1.5;
    if (now - lastRender < minDt) return;
    const dt = Math.min(0.1, (now - last) / 1000); last = now; lastRender = now;
    clock.t += dt;
    if (fly) {
      fly.t = Math.min(1, fly.t + dt / fly.dur); const k = ease(fly.t);
      camera.position.lerpVectors(fly.p0, fly.p1, k); controls.target.lerpVectors(fly.t0, fly.t1, k);
      if (fly.t >= 1) fly = null;
    }
    controls.update();
    for (const f of hooks) { try { f(dt, clock.t); } catch (e) { console.error(e); } }
    envT -= dt; if (envT <= 0) { envT = 5; applyEnv(); }
    scene.updateMatrixWorld();
    syncInstances(clock.t);
    renderer.render(scene, camera);
    updateLabels();
    frames++; fpsT += dt;
    if (fpsT >= 1) { fps = frames / fpsT; frames = 0; fpsT = 0; updateHud(); }
    window.__lawnFrames = (window.__lawnFrames || 0) + 1;
    if (!firstFrame) { firstFrame = true; setTimeout(() => { $("loader").classList.add("done"); document.body.classList.add("lz-ready"); window.__lawnReady = true; }, 60); }
  }
  function updateHud() {
    const i = renderer.info.render;
    const t = "帧率 " + fps.toFixed(0) + " fps（上限 " + GP.fps + "）· 绘制批次 " + i.calls + " · 三角形 " + (i.triangles / 1000).toFixed(1) + "k · 像素比 " + renderer.getPixelRatio().toFixed(2) + " · 画质 " + { clear: "清晰", smooth: "流畅", eco: "省电" }[GFX.mode];
    $("lz-hud").textContent = t;
    window.__lawnStats = { fps, calls: i.calls, triangles: i.triangles, dpr: renderer.getPixelRatio(), mode: GFX.mode, cap: GP.fps, gpu: GPU };
  }
  addEventListener("resize", () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight, false); });

  // ---------------- 启动 ----------------
  const fetchJSON = (u) => fetch(u).then((r) => { if (!r.ok) throw new Error("HTTP " + r.status + " " + u); return r.json(); });
  const progress = (f, m) => { $("loadbar").style.width = (f * 100).toFixed(0) + "%"; if (m) $("loadmsg").textContent = m; };
  progress(0.15, "读取校园平面图…");
  const ready = Promise.all([fetchJSON("../data/campus_layout.json"), fetchJSON("../data/zones.json").catch(() => ({ zones: [] })), groundReady]).then(([layout, zones]) => {
    progress(0.6, "生成微缩模型…");
    const zone = (zones.zones || []).find((z) => z.id === ZONE_ID) || null;
    if (zone && zone.polygon) zonePoly = zone.polygon.map(([x, y]) => toW(x, y));
    buildBuildings(layout);
    buildDecor();
    buildUI(zone);
    applyEnv();
    progress(0.9, "种下花草树木…");
    started = true;
    return { zone, layout };
  }).catch((e) => { console.error(e); $("loadmsg").textContent = "加载失败：" + e.message; throw e; });
  requestAnimationFrame(loop);

  window.LAWN = {
    THREE, scene, camera, controls, renderer, REGION, PX, toW, W, D, MODELS, PAL, ENV, PRIMS, STATIC, BUILDINGS,
    createProxy, disposeProxy, classAt, grassAround, buildingAt, staticAt, inZone, flyTo, flyToPoint, goView, VIEWS, viewPos,
    onFrame: (f) => hooks.push(f), ready, toast, applyEnv, backUrl, goBack, setEnv: (o) => {
      if (o.season !== undefined) ENV.seasonOverride = o.season || null;
      if (o.hour != null) { ENV.timeAuto = false; ENV.demoHour = +o.hour; }
      if (o.hour === null) ENV.timeAuto = true;
      applyEnv();
    },
    get gfx() { return Object.assign({ gpu: GPU, integrated }, GFX, GP); },
  };
})();
