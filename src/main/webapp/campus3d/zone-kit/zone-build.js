/*
 * 板块细节场景 · 建模工具（C 区宿舍庭院 / 运动场周边共用）—— 池塘同款写实画风
 * ------------------------------------------------------------------------------
 * 坐标：与校园全景完全一致 —— 官方平面图（2048×1998）像素 p=[px, py]，世界坐标 x=(px-1024)*0.4 米（向东），z=(py-999)*0.4 米（向南），y 向上。
 * 材质：池塘 / 全景同一套程序化纹理（pond-style-core.js 的 TEX：草地、花岗岩、灰瓦、树皮…）+ 本文件的路面 / 塑胶 / 球场 / 立面纹理
 *       （立面、沥青、条石、石板、塑胶、人造草、屋面的生成函数复制自 js/campus-scene.js，并扩展了 C 区灰色腰线砖墙、幼儿园彩色涂料、
 *       白色训练馆、灰色清水混凝土等风格），全部经 campus-look.js（EcoLook）的 patch() 打上积雪 / 湿润 / 秋色 / 宏观色差补丁，
 *       与池塘、全景的天气着色一致；水面用 look.waterMaterial()（池塘水面简化版：菲涅尔 + IBL + 平面反射 + 涟漪 / 雨点法线）。
 * 合批：地面按材质合并、建筑墙面按立面风格合并、屋面按材质合并、标线合并为一个网格；拾取用不渲染的代理网格（第 7 图层）。
 * 依赖：THREE r160、pond-style-core.js、campus-look.js。导出 window.ZoneBuild。
 */
(function (global) {
  "use strict";
  const THREE = global.THREE;
  const PICK_LAYER = 7;
  const S = 0.4, CX = 1024, CY = 999;
  const W = (p) => [(p[0] - CX) * S, (p[1] - CY) * S];
  const P = (x, z) => [x / S + CX, z / S + CY];

  // ---------------- 程序化表面纹理 ----------------
  const CT = {};
  function surfaceTextures() {
    if (CT.done) return CT;
    CT.asphalt = genSurface(256, (u, v, x, y) => {
      const n = fbm2P(u * 8, v * 8, 8, 4, 901) * 0.5 + 0.5, g = hash3i(x, y, 5, 902), g2 = hash3i(x >> 1, y >> 1, 6, 903);
      let c = mix3(srgbHex(0x2f3032), srgbHex(0x424345), n);
      if (g > 0.93) c = mix3(c, srgbHex(0x8c8a84), 0.7); else if (g2 > 0.9) c = mix3(c, srgbHex(0x55534f), 0.6);
      const crack = smoothstep(0.03, 0.0, Math.abs(fbm2P(u * 3, v * 3, 3, 4, 904))) * smoothstep(0.55, 0.7, n);
      c = mix3(c, srgbHex(0x18191a), crack * 0.7);
      return [c[0], c[1], c[2], g * 0.5 + n * 0.3 - crack * 0.4, 0.88];
    }, 4);
    CT.pavers = genSurface(512, (u, v) => {
      const bx = u * 8, by = v * 16, row = Math.floor(by), ox = (row % 2) * 0.5, cx = bx + ox, ix = Math.floor(cx);
      const fx = cx - ix, fy = by - row, id = hash3i(ix, row, 1, 911);
      const joint = smoothstep(0.0, 0.035, Math.min(fx, 1 - fx)) * smoothstep(0.0, 0.07, Math.min(fy, 1 - fy));
      const sp = hash3i(Math.floor(u * 512), Math.floor(v * 512), 7, 912), fine = fbm2P(u * 64, v * 64, 64, 2, 913) * 0.5 + 0.5;
      let c = mix3(srgbHex(0x8d8a84), srgbHex(0xaaa69d), id * 0.6 + fine * 0.4);
      if (sp > 0.92) c = mix3(c, srgbHex(0x45423f), 0.5); else if (sp < 0.05) c = mix3(c, srgbHex(0xd2cec6), 0.5);
      c = mix3(srgbHex(0x55524c), c, joint);
      return [c[0], c[1], c[2], joint * 0.8 + fine * 0.1 + id * 0.1, 0.8];
    }, 6);
    CT.slabs = genSurface(512, (u, v) => {
      const bx = u * 4, by = v * 4, ix = Math.floor(bx), iy = Math.floor(by), fx = bx - ix, fy = by - iy, id = hash3i(ix, iy, 2, 921);
      const joint = smoothstep(0.0, 0.012, Math.min(fx, 1 - fx)) * smoothstep(0.0, 0.012, Math.min(fy, 1 - fy));
      const fine = fbm2P(u * 48, v * 48, 48, 3, 922) * 0.5 + 0.5, sp = hash3i(Math.floor(u * 512), Math.floor(v * 512), 9, 923);
      let c = mix3(srgbHex(0x96928a), srgbHex(0xaca89f), id * 0.5 + fine * 0.5);
      if (sp > 0.94) c = mix3(c, srgbHex(0x5d5a55), 0.45);
      c = mix3(srgbHex(0x6c6862), c, joint);
      return [c[0], c[1], c[2], joint * 0.85 + fine * 0.15, 0.72];
    }, 5);
    // 塑胶（EPDM 颗粒，白色底，按材质颜色着色：红色跑道、蓝绿色幼儿园活动场）
    CT.epdm = genSurface(256, (u, v, x, y) => {
      const g = hash3i(x, y, 3, 931), n = fbm2P(u * 6, v * 6, 6, 3, 932) * 0.5 + 0.5;
      let c = mix3([196, 196, 196], [236, 236, 236], n * 0.6 + g * 0.4);
      if (g > 0.95) c = mix3(c, [90, 90, 90], 0.5);
      return [c[0], c[1], c[2], g, 0.9];
    }, 3);
    // 天然草足球场：割草条纹（条纹宽 = 纹理一半，贴图按场地坐标铺）
    CT.pitch = genSurface(256, (u, v, x, y) => {
      const stripe = u < 0.5 ? 1 : 0, b = hash3i(x, y, 4, 941), n = fbm2P(u * 8, v * 8, 8, 3, 942) * 0.5 + 0.5;
      const c = mix3(srgbHex(0x3c6b2a), srgbHex(0x55873a), b * 0.35 + n * 0.3 + stripe * 0.35);
      return [c[0], c[1], c[2], b * 0.6 + n * 0.4, 0.9];
    }, 2);
    // 球场丙烯酸面层（白底，按材质颜色着色）
    CT.court = genSurface(128, (u, v, x, y) => {
      const b = hash3i(x, y, 8, 951) * 0.5 + fbm2P(u * 4, v * 4, 4, 3, 952) * 0.25 + 0.5;
      const c = mix3([205, 205, 205], [238, 238, 238], b);
      return [c[0], c[1], c[2], b * 0.3, 0.6];
    }, 1);
    CT.roof = genSurface(256, (u, v, x, y) => {
      const n = fbm2P(u * 4, v * 4, 4, 4, 961) * 0.5 + 0.5, f = hash3i(x, y, 2, 962), g = fbm2P(u * 32, v * 32, 32, 2, 963) * 0.5 + 0.5;
      const seam = Math.min(Math.abs(((u * 4) % 1) - 0.5), Math.abs(((v * 4) % 1) - 0.5)) > 0.485;
      let c = mix3(srgbHex(0x8e8f8f), srgbHex(0xa9aaa8), n * 0.6 + g * 0.25 + f * 0.15);
      c = mix3(c, srgbHex(0x6c6e6c), smoothstep(0.62, 0.8, n) * 0.5);
      if (seam) c = mix3(c, srgbHex(0x4c4d4c), 0.7);
      return [c[0], c[1], c[2], (seam ? 0 : 0.6) + g * 0.2, 0.9];
    }, 2);
    // 筒瓦（白底，按材质颜色着色：灰瓦 / 红瓦 / 黄瓦）
    CT.tiles = genSurface(256, (u, v, x, y) => {
      const cols = 8, rows = 16, cu = u * cols, row = Math.floor(v * rows), fv = v * rows - row, fu = cu - Math.floor(cu);
      const round = Math.sin(fu * Math.PI), id = hash3i(Math.floor(cu), row, 3, 971), sp = hash3i(x, y, 4, 972);
      const lap = smoothstep(0.0, 0.18, fv);
      const k = (0.62 + 0.38 * round) * (0.7 + 0.3 * lap) * (0.9 + 0.12 * id) * (0.96 + 0.06 * sp);
      const c = [235 * k, 235 * k, 235 * k];
      return [c[0], c[1], c[2], round * 0.7 + lap * 0.3, 0.7];
    }, 6);
    // 毛石挡土墙（篮球场高台）
    CT.stone = genSurface(256, (u, v, x, y) => {
      worleyP(u * 7, v * 5, 7, 981); const e = WOR.f2 - WOR.f1, id = WOR.id;
      const mortar = smoothstep(0.02, 0.09, e);
      const n = fbm2P(u * 16, v * 16, 16, 3, 982) * 0.5 + 0.5;
      let c = mix3(srgbHex(0x8a8172), srgbHex(0xb3aa98), (id % 97) / 97 * 0.6 + n * 0.4);
      c = mix3(srgbHex(0x5a554d), c, mortar);
      return [c[0], c[1], c[2], mortar * (0.6 + n * 0.4), 0.92];
    }, 6);
    for (const k of Object.keys(CT)) if (CT[k].map) { CT[k].map.wrapS = CT[k].map.wrapT = CT[k].normalMap.wrapS = CT[k].normalMap.wrapT = THREE.RepeatWrapping; }
    CT.done = true;
    return CT;
  }

  // ---------------- 建筑立面（复制自 campus-scene.js，增加风格） ----------------
  const CELL_W = 4, CELL_H = 3.6, CELLS = 4, FACADE_PX = 512;
  const STYLES = {
    dormc: { wall: "brick", col: 0xb4644c, frame: 0xf0ede6, glass: 0x2b3843, band: 0x9b9893, roof: "flat", balcony: true, bandH: 0.09 },
    teacher: { wall: "brick", col: 0xa85a40, frame: 0xf0ede6, glass: 0x2b3843, band: 0xe8e2d6, roof: "tile", balcony: true },
    brick: { wall: "brick", col: 0x8f4230, frame: 0xe6e4de, glass: 0x23313b, band: 0xe2ded6, roof: "flat" },
    kbrick: { wall: "brick", col: 0xb85a3c, frame: 0xffffff, glass: 0x34505e, band: 0xf3e7d4, roof: "tile", big: true },
    kcream: { wall: "render", col: 0xf2e2bd, frame: 0xffffff, glass: 0x34505e, band: 0xfff6e2, roof: "tile" },
    kyellow: { wall: "render", col: 0xedc45a, frame: 0xffffff, glass: 0x34505e, band: 0xfff1c4, roof: "tile" },
    hall: { wall: "render", col: 0xeef0f1, frame: 0x9aa2a8, glass: 0x2a4352, band: 0xf6f6f4, roof: "flat", big: true, sparse: true },
    grey: { wall: "render", col: 0xb4b8ba, frame: 0x7d858b, glass: 0x2a3b46, band: 0xd6d8d8, roof: "flat" },
    glass: { wall: "render", col: 0xdfe4e6, frame: 0x8f979c, glass: 0x355466, band: 0xeef0f0, roof: "flat", big: true },
  };
  const FACADE_CACHE = {};
  function facadeTextures(styleName, rnd) {
    const st = STYLES[styleName] || STYLES.brick;
    const N = FACADE_PX, CP = N / CELLS;
    const alb = new Uint8Array(N * N * 4), H = new Float32Array(N * N);
    const okey = st.wall + (st.big ? "B" : "") + (st.balcony ? "L" : "") + (st.sparse ? "S" : "") + (st.bandH || "");
    const needOrm = !FACADE_CACHE[okey];
    const orm = needOrm ? new Uint8Array((N / 2) * (N / 2) * 4) : null;
    const EN = 128, em = new Uint8Array(EN * EN * 4);
    const wallC = srgbHex(st.col), frameC = srgbHex(st.frame), glassC = srgbHex(st.glass), bandC = srgbHex(st.band);
    const W0 = st.big ? 0.05 : 0.2, W1 = 1 - W0;
    const H0 = st.big ? 0.12 : 0.3, H1 = st.big ? 0.9 : 0.78;
    const FR = 0.022, BH = st.bandH || 0.055;
    const lit = [];
    for (let j = 0; j < CELLS; j++) for (let i = 0; i < CELLS; i++) lit.push(rnd() < 0.6 ? 0.6 + rnd() * 0.4 : 0);
    const warm = []; for (let k = 0; k < CELLS * CELLS; k++) warm.push(rnd() < 0.7);
    for (let y = 0; y < N; y++) {
      const cj = Math.floor(y / CP), fy = (y % CP) / CP;
      for (let x = 0; x < N; x++) {
        const ci = Math.floor(x / CP), fx = (x % CP) / CP;
        const i = (y * N + x) * 4;
        let c, h, rough, metal = 0;
        const sparseWall = st.sparse && (cj % 2 === 1 || ci % 4 === 3);   // 训练馆：大片白墙 + 条窗
        const inWin = !sparseWall && fx > W0 && fx < W1 && fy > H0 && fy < H1;
        const inFrame = !sparseWall && fx > W0 - FR && fx < W1 + FR && fy > H0 - FR && fy < H1 + FR;
        const band = fy < BH;
        if (band) { const n = hash3i(x, y, 3, 77) * 0.08; c = mix3(bandC, [255, 255, 255], n); h = 0.75; rough = 0.7; }
        else if (inWin) {
          const mull = st.big ? Math.abs(((fx - W0) / (W1 - W0)) * 3 % 1 - 0.5) > 0.485 : Math.abs(fx - 0.5) < 0.012;
          const tran = Math.abs(fy - (st.big ? 0.66 : 0.64)) < 0.012;
          if (mull || tran) { c = frameC; h = 0.45; rough = 0.35; metal = 0.6; }
          else {
            const refl = smoothstep(0.0, 1.0, (fy - H0) / (H1 - H0)) * 0.25;
            const curtain = !st.big && hash3i(ci, cj, 5, 44) > 0.55 && fy > H1 - 0.12 - 0.25 * hash3i(ci, cj, 6, 45);
            c = curtain ? mix3([200, 196, 186], glassC, 0.35) : mix3(glassC, [120, 150, 170], refl);
            h = 0.25; rough = curtain ? 0.6 : 0.06; metal = curtain ? 0 : 0.35;
          }
        } else if (inFrame) { c = frameC; h = 0.6; rough = 0.4; metal = 0.5; }
        else if (st.balcony && fy < 0.3 && fx > 0.12 && fx < 0.88) { const n = hash3i(x, y, 2, 13) * 0.06; c = mix3([236, 232, 224], [255, 255, 255], n); h = 0.85; rough = 0.75; }
        else if (st.wall === "brick") {
          const by = (cj * CELL_H + fy * CELL_H) / 0.063, row = Math.floor(by), fyy = by - row;
          const bx = (ci * CELL_W + fx * CELL_W) / 0.25 + (row % 2) * 0.5, col = Math.floor(bx), fxx = bx - col;
          const mortar = fyy < 0.16 || fxx < 0.05;
          const id = hash3i(col, row, 1, 31), sp = hash3i(x, y, 9, 32);
          if (mortar) { c = mix3([150, 140, 128], [124, 116, 106], sp); h = 0.0; rough = 0.95; }
          else { c = wallC.map((q) => q * (0.8 + 0.3 * id) * (0.94 + 0.12 * sp)); if (id > 0.94) c = mix3(c, [80, 46, 36], 0.35); h = 0.55 + 0.1 * sp; rough = 0.85; }
        } else {
          const n = fbm2P(x / N * 24, y / N * 24, 24, 3, 51) * 0.5 + 0.5, sp = hash3i(x, y, 4, 52);
          const streak = (fx > W0 && fx < W1 && fy < H0 && fy > H0 - 0.25) ? (1 - (H0 - fy) / 0.25) * 0.06 : 0;
          c = wallC.map((q) => q * (0.93 + 0.08 * n + 0.04 * sp) * (1 - streak));
          h = 0.5 + 0.08 * sp + 0.05 * n; rough = 0.9;
        }
        alb[i] = c[0]; alb[i + 1] = c[1]; alb[i + 2] = c[2]; alb[i + 3] = 255;
        H[y * N + x] = h;
        if (needOrm && !(x & 1) && !(y & 1)) { const o = ((y >> 1) * (N >> 1) + (x >> 1)) * 4; orm[o] = 255; orm[o + 1] = rough * 255; orm[o + 2] = metal * 255; orm[o + 3] = 255; }
      }
    }
    for (let y = 0; y < EN; y++) {
      const cj = Math.floor(y / (EN / CELLS)), fy = (y % (EN / CELLS)) / (EN / CELLS);
      for (let x = 0; x < EN; x++) {
        const ci = Math.floor(x / (EN / CELLS)), fx = (x % (EN / CELLS)) / (EN / CELLS);
        const o = (y * EN + x) * 4, k = cj * CELLS + ci, L = lit[k];
        const sparseWall = st.sparse && (cj % 2 === 1 || ci % 4 === 3);
        const inWin = !sparseWall && fx > W0 && fx < W1 && fy > H0 && fy < H1;
        const v = inWin && L ? L * (0.8 + 0.2 * (fy - H0) / (H1 - H0)) : 0;
        const wc = warm[k] ? [255, 205, 140] : [235, 240, 255];
        em[o] = wc[0] * v; em[o + 1] = wc[1] * v; em[o + 2] = wc[2] * v; em[o + 3] = 255;
      }
    }
    const map = dataTex(alb, N, N, true), emissiveMap = dataTex(em, EN, EN, true);
    if (needOrm) FACADE_CACHE[okey] = { normalMap: dataTex(heightToNormal(H, N, N, st.wall === "brick" ? 5 : 3), N, N, false), ormMap: dataTex(orm, N / 2, N / 2, false) };
    const shared = FACADE_CACHE[okey];
    for (const t of [map, emissiveMap, shared.normalMap, shared.ormMap]) t.repeat.set(1 / (CELL_W * CELLS), 1 / (CELL_H * CELLS));
    return { map, emissiveMap, normalMap: shared.normalMap, ormMap: shared.ormMap };
  }
  const UVGEN = {
    generateTopUV(g, v, a, b, c) { return [new THREE.Vector2(v[a * 3], v[a * 3 + 1]), new THREE.Vector2(v[b * 3], v[b * 3 + 1]), new THREE.Vector2(v[c * 3], v[c * 3 + 1])]; },
    generateSideWallUV(g, v, a, b, c, d) {
      const Pp = (i) => [v[i * 3], v[i * 3 + 1], v[i * 3 + 2]];
      const A = Pp(a), B = Pp(b), C = Pp(c), D = Pp(d);
      let ex = B[0] - A[0], ey = B[1] - A[1], l = Math.hypot(ex, ey);
      if (l < 1e-6) { ex = C[0] - D[0]; ey = C[1] - D[1]; l = Math.hypot(ex, ey) || 1; }
      ex /= l; ey /= l;
      const U = (p) => new THREE.Vector2(p[0] * ex + p[1] * ey, p[2]);
      return [U(A), U(B), U(C), U(D)];
    },
  };
  function subGeo(g, start, count) {
    const out = new THREE.BufferGeometry();
    for (const name of ["position", "normal", "uv"]) { const a = g.attributes[name]; if (!a) continue; out.setAttribute(name, new THREE.BufferAttribute(a.array.slice(start * a.itemSize, (start + count) * a.itemSize), a.itemSize)); }
    return out;
  }

  // ---------------- 几何工具（平面图像素） ----------------
  function inPoly(pt, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if (yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  function segDist(p, a, b) {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
    return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
  }
  function polyDist(p, poly, closed) {
    if (closed === undefined) closed = true;
    let d = Infinity; const n = closed ? poly.length : poly.length - 1;
    for (let i = 0; i < n; i++) d = Math.min(d, segDist(p, poly[i], poly[(i + 1) % poly.length]));
    return d;
  }
  function centroid(poly) { let x = 0, y = 0; poly.forEach((p) => { x += p[0]; y += p[1]; }); return [x / poly.length, y / poly.length]; }
  // 矩形（中心像素 c、长 len 米、宽 dep 米、长轴方向角 ang 弧度（世界 x→z 方向，与平面图同向））→ 平面图像素四角（顺时针）
  function rect(c, len, dep, ang) {
    const ca = Math.cos(ang), sa = Math.sin(ang), hl = len / 2 / S, hd = dep / 2 / S;
    return [[-hl, -hd], [hl, -hd], [hl, hd], [-hl, hd]].map(([u, v]) => [c[0] + u * ca - v * sa, c[1] + u * sa + v * ca]);
  }
  // 局部坐标系：原点像素 o、x 轴角 ang；f(u, v)（米）→ 世界 [x, z]
  function frame(o, ang) {
    const [ox, oz] = W(o), ca = Math.cos(ang), sa = Math.sin(ang);
    return { w: (u, v) => [ox + u * ca - v * sa, oz + u * sa + v * ca], ang, o };
  }

  // ================================================================
  function create(scene, look, opts) {
    opts = opts || {};
    const patch = look.patch;
    const T = surfaceTextures();
    let seed = opts.seed || 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const std = (params, o) => patch(new THREE.MeshStandardMaterial(Object.assign({ envMapIntensity: 0.8 }, params)), o);
    const decal = (m, k) => { m.polygonOffset = true; m.polygonOffsetFactor = -k; m.polygonOffsetUnits = -4 * k; return m; };
    const tex = (set, tile, tileV) => {
      const m = set.map.clone(), n = set.normalMap.clone();
      for (const t of [m, n]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1 / tile, 1 / (tileV || tile)); t.anisotropy = MAX_ANISO; t.needsUpdate = true; }
      return { map: m, normalMap: n };
    };
    const pickMat = new THREE.MeshBasicMaterial({ visible: false });
    const pickables = [], items = {};
    // 地物分类（放置规则用）：后登记的优先
    const marks = [];   // { kind: 'poly'|'path'|'circle', cls, poly / path+hw / c+r }
    const nightMats = [];

    // ---------- 材质 ----------
    const lawnT = tex(TEX.ground, 6), outerT = tex(TEX.ground, 10), graniteT = tex(TEX.granite, 2.5);
    const M = {
      lawn: std({ map: lawnT.map, normalMap: lawnT.normalMap, normalScale: new THREE.Vector2(0.8, 0.8), roughness: 0.95 }, { key: "lawn", macro: { scale: 0.011, amp: 0.2 } }),
      outer: std({ map: outerT.map, normalMap: outerT.normalMap, roughness: 0.97, color: 0xd8dcc4 }, { key: "outerfield", macro: { scale: 0.004, amp: 0.3 } }),
      asphalt: (() => { const t = tex(T.asphalt, 5); return std({ map: t.map, normalMap: t.normalMap, normalScale: new THREE.Vector2(0.6, 0.6), roughness: 0.9 }, { key: "asphalt", macro: { scale: 0.02, amp: 0.15 } }); })(),
      pavers: (() => { const t = tex(T.pavers, 4.8); return std({ map: t.map, normalMap: t.normalMap, normalScale: new THREE.Vector2(0.8, 0.8), roughness: 0.78 }, { key: "pavers", macro: { scale: 0.025, amp: 0.12 } }); })(),
      slabs: (() => { const t = tex(T.slabs, 4.8); return std({ map: t.map, normalMap: t.normalMap, normalScale: new THREE.Vector2(0.7, 0.7), roughness: 0.72 }, { key: "plaza", macro: { scale: 0.03, amp: 0.1 } }); })(),
      granite: std({ map: graniteT.map, normalMap: graniteT.normalMap, roughness: 0.75, color: 0xd6d2ca }, { key: "curb" }),
      paint: decal(std({ color: 0xeeeeea, roughness: 0.6 }, { key: "paint" }), 3),
      yellowPaint: decal(std({ color: 0xe0b43a, roughness: 0.6 }, { key: "paint" }), 3),
      stone: (() => { const t = tex(T.stone, 3.5); return std({ map: t.map, normalMap: t.normalMap, normalScale: new THREE.Vector2(1.2, 1.2), roughness: 0.92 }, { key: "stonewall" }); })(),
      roofFlat: (() => { const t = tex(T.roof, 12); return std({ map: t.map, normalMap: t.normalMap, roughness: 0.9 }, { key: "roofflat", macro: { scale: 0.05, amp: 0.12 } }); })(),
      concrete: std({ map: graniteT.map, normalMap: graniteT.normalMap, roughness: 0.85, color: 0xc4c2bc }, { key: "concrete" }),
      metal: std({ color: 0x5b6267, roughness: 0.45, metalness: 0.75 }, { key: "metal" }),
      darkMetal: std({ color: 0x2a2f33, roughness: 0.45, metalness: 0.7 }, { key: "lampmetal" }),
      white: std({ color: 0xf2f2ef, roughness: 0.55 }, { key: "whitepaint" }),
      wood: (() => { const t = tex(TEX.wood, 1.2); return std({ map: t.map, normalMap: t.normalMap, roughness: 0.7, color: 0xb98d62 }, { key: "wood" }); })(),
      glass: patch(new THREE.MeshStandardMaterial({ color: 0x5f8193, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.55, envMapIntensity: 1.3 }), { key: "glass", noWeather: true }),
      soil: std({ map: lawnT.map, color: 0x6d5a45, roughness: 1 }, { key: "soil" }),
    };
    const epdmCache = {}, courtCache = {}, tileCache = {};
    function epdm(color, key) { if (!epdmCache[color]) { const t = tex(T.epdm, 2.5); epdmCache[color] = std({ map: t.map, normalMap: t.normalMap, color, roughness: 0.92 }, { key: "epdm" + (key || "") }); } return epdmCache[color]; }
    function courtMat(color) { if (!courtCache[color]) { const t = tex(T.court, 5); courtCache[color] = std({ map: t.map, normalMap: t.normalMap, color, roughness: 0.62 }, { key: "court" }); } return courtCache[color]; }
    function tileMat(color) { if (!tileCache[color]) { const t = tex(T.tiles, 2.4); tileCache[color] = std({ map: t.map, normalMap: t.normalMap, normalScale: new THREE.Vector2(1.3, 1.3), color, roughness: 0.62 }, { key: "rooftile" }); } return tileCache[color]; }
    const pitchMat = (() => { const t = tex(T.pitch, 10, 10); return std({ map: t.map, normalMap: t.normalMap, roughness: 0.9 }, { key: "pitch" }); })();
    M.pitch = pitchMat;
    M.track = epdm(0xb04a3a, "track");

    // ---------- 合批 ----------
    const POOL = new Map();
    function pooled(geo, mat) { if (!POOL.has(mat)) POOL.set(mat, []); POOL.get(mat).push(geo); return geo; }
    function proxy(geo) { const m = new THREE.Mesh(geo, pickMat); m.layers.set(PICK_LAYER); scene.add(m); return m; }

    // ---------- 地面面片 ----------
    function shapeOf(poly) { const s = new THREE.Shape(); poly.forEach((p, i) => { const [x, z] = W(p); i ? s.lineTo(x, -z) : s.moveTo(x, -z); }); return s; }
    function shapeW(pts) { const s = new THREE.Shape(); pts.forEach(([x, z], i) => (i ? s.lineTo(x, -z) : s.moveTo(x, -z))); return s; }
    function flatGeo(shape, y) { const g = new THREE.ShapeGeometry(shape, 24); g.rotateX(-Math.PI / 2); g.translate(0, y, 0); return g; }
    function flat(poly, mat, y, cls) { const g = flatGeo(shapeOf(poly), y); pooled(g, mat); if (cls) mark({ kind: "poly", poly, cls }); return g; }
    function flatW(pts, mat, y) { return pooled(flatGeo(shapeW(pts), y), mat); }
    function disc(c, rPx, mat, y, cls, seg) {
      const [x, z] = W(c); const g = new THREE.CircleGeometry(rPx * S, seg || 40); g.rotateX(-Math.PI / 2);
      { const uv = g.attributes.uv, p = g.attributes.position; for (let i = 0; i < uv.count; i++) uv.setXY(i, p.getX(i) + x, p.getZ(i) + z); }
      g.translate(x, y, z); pooled(g, mat); if (cls) mark({ kind: "circle", c, r: rPx, cls }); return g;
    }
    // 沿路径的带状面（世界米坐标点）：UV u = 沿路长度，v = 横向偏移
    function stripW(pts, width, y, mat, closed, caps) {
      const pos = [], uv = [], hw = width / 2;
      const P2 = pts.slice(); if (closed) P2.push(P2[0]);
      let acc = 0;
      for (let i = 0; i < P2.length - 1; i++) {
        const [ax, az] = P2[i], [bx, bz] = P2[i + 1];
        const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz) || 1;
        const nx = (-dz / len) * hw, nz = (dx / len) * hw;
        const u0 = acc, u1 = acc + len; acc = u1;
        pos.push(ax + nx, y, az + nz, bx - nx, y, bz - nz, bx + nx, y, bz + nz); uv.push(u0, hw, u1, -hw, u1, hw);
        pos.push(ax + nx, y, az + nz, ax - nx, y, az - nz, bx - nx, y, bz - nz); uv.push(u0, hw, u0, -hw, u1, -hw);
      }
      if (caps !== false) P2.forEach(([x, z]) => {
        const n = 10;
        for (let k = 0; k < n; k++) {
          const a0 = (k / n) * Math.PI * 2, a1 = ((k + 1) / n) * Math.PI * 2;
          pos.push(x, y, z, x + Math.cos(a0) * hw, y, z + Math.sin(a0) * hw, x + Math.cos(a1) * hw, y, z + Math.sin(a1) * hw);
          uv.push(x, z, x + Math.cos(a0) * hw, z + Math.sin(a0) * hw, x + Math.cos(a1) * hw, z + Math.sin(a1) * hw);
        }
      });
      // 统一朝上
      for (let i = 0; i < pos.length; i += 9) {
        const ux = pos[i + 3] - pos[i], uz = pos[i + 5] - pos[i + 2], vx = pos[i + 6] - pos[i], vz = pos[i + 8] - pos[i + 2];
        if (uz * vx - ux * vz < 0) {
          for (let j = 0; j < 3; j++) { const t = pos[i + 3 + j]; pos[i + 3 + j] = pos[i + 6 + j]; pos[i + 6 + j] = t; }
          const k = (i / 9) * 6; for (let j = 0; j < 2; j++) { const t = uv[k + 2 + j]; uv[k + 2 + j] = uv[k + 4 + j]; uv[k + 4 + j] = t; }
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
      g.computeVertexNormals();
      return pooled(g, mat);
    }
    function ribbon(path, widthPx, y, mat, closed, cls) {
      stripW(path.map(W), widthPx * S, y, mat, closed);
      if (cls) mark({ kind: "path", path, hw: widthPx / 2, cls, closed });
    }
    // 线（标线）：世界点列、线宽米
    function line(pts, w, y, mat, closed) { return stripW(pts, w, y, mat || M.paint, closed, false); }
    function arcPts(cx, cz, r, a0, a1, n) { const out = []; n = n || Math.max(8, Math.ceil(Math.abs(a1 - a0) * r / 0.6)); for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * (i / n); out.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]); } return out; }
    function mark(m) { marks.push(m); }


    // ---------- 局部坐标系（米）工具：场地、标线 ----------
    // 局部多边形（UV = 局部坐标 / uvScale，便于割草条纹、球场纹理沿场地方向）
    function polyL(f, pts, y, mat, uvScale) {
      const shape = new THREE.Shape(); pts.forEach(([u, v], i) => (i ? shape.lineTo(u, v) : shape.moveTo(u, v)));
      const g = new THREE.ShapeGeometry(shape, 16);
      const p = g.attributes.position, uv = g.attributes.uv, k = uvScale || 1;
      for (let i = 0; i < p.count; i++) { const u = p.getX(i), v = p.getY(i); uv.setXY(i, u / k, v / k); const [x, z] = f.w(u, v); p.setXYZ(i, x, y, z); }
      g.computeVertexNormals(); fixWinding(g); g.computeVertexNormals();
      return pooled(g, mat);
    }
    const rectL = (u0, v0, u1, v1) => [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
    function lineL(f, pts, w, y, mat, closed) { return line(pts.map(([u, v]) => f.w(u, v)), w, y, mat, closed); }
    function rectLineL(f, u0, v0, u1, v1, w, y, mat) { return lineL(f, rectL(u0 + w / 2, v0 + w / 2, u1 - w / 2, v1 - w / 2), w, y, mat, true); }
    function arcL(cu, cv, r, a0, a1, n) { return arcPts(cu, cv, r, a0, a1, n); }
    // 田径跑道椭圆（局部）：中心 (cu, cv)，直道长 L（沿 u），半径 r
    function ovalL(cu, cv, L, r, n) {
      n = n || 48; const out = [];
      for (let i = 0; i <= n; i++) { const a = -Math.PI / 2 + Math.PI * i / n; out.push([cu + L / 2 + Math.cos(a) * r, cv + Math.sin(a) * r]); }
      for (let i = 0; i <= n; i++) { const a = Math.PI / 2 + Math.PI * i / n; out.push([cu - L / 2 + Math.cos(a) * r, cv + Math.sin(a) * r]); }
      return out;
    }
    const polyPx = (f, pts) => pts.map(([u, v]) => P(...f.w(u, v)));

    // ---------- 实体 ----------
    function addMesh(geo, mat, cast, recv) { const m = new THREE.Mesh(geo, mat); m.castShadow = cast !== false; m.receiveShadow = recv !== false; scene.add(m); return m; }
    const SOLIDS = new Map();   // 同材质小物件合并
    function solid(geo, mat) { if (!SOLIDS.has(mat)) SOLIDS.set(mat, []); SOLIDS.get(mat).push(geo); return geo; }
    function boxW(x, z, y0, sx, sy, sz, rot, mat, uvScale) {
      const g = new THREE.BoxGeometry(sx, sy, sz);
      if (uvScale) { const uv = g.attributes.uv, n = g.attributes.normal, p = g.attributes.position; for (let i = 0; i < uv.count; i++) { const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)); uv.setXY(i, (ax > 0.5 ? p.getZ(i) : p.getX(i)) / uvScale, (ay > 0.5 ? p.getZ(i) : p.getY(i)) / uvScale); } }
      g.rotateY(-(rot || 0)); g.translate(x, y0 + sy / 2, z);
      return solid(g, mat);
    }
    function cylW(x, z, y0, r0, r1, h, mat, seg) { const g = new THREE.CylinderGeometry(r1, r0, h, seg || 10); g.translate(x, y0 + h / 2, z); return solid(g, mat); }

    // ---------- 建筑 ----------
    const wallMats = {};
    function wallMat(style) {
      if (!wallMats[style]) {
        const ft = facadeTextures(style, rnd);
        const m = std({ map: ft.map, normalMap: ft.normalMap, roughnessMap: ft.ormMap, metalnessMap: ft.ormMap, roughness: 1, metalness: 1,
          emissiveMap: ft.emissiveMap, emissive: new THREE.Color(1, 1, 1), emissiveIntensity: 0, envMapIntensity: 1.0 }, { key: "wall", plinth: true });
        wallMats[style] = m; nightMats.push(m);
      }
      return wallMats[style];
    }
    const WALLS = {}, ROOFS = new Map();
    function extrudePoly(poly, h, y0) {
      const g = new THREE.ExtrudeGeometry(shapeOf(poly), { depth: h, bevelEnabled: false, curveSegments: 24, UVGenerator: UVGEN });
      g.rotateX(-Math.PI / 2); if (y0) g.translate(0, y0, 0);
      return g;
    }
    function roofPush(geo, mat) { if (!ROOFS.has(mat)) ROOFS.set(mat, []); ROOFS.get(mat).push(geo); }
    /**
     * 建筑：b = { id, name, poly | rect:{c,len,dep,ang}, h, y0, style, roof: { type:'flat'|'hip'|'gable', pitch(米), color, overhang },
     *            parapet(米), boxes:[{ c, len, dep, ang, h }]（屋顶楼梯间 / 机房，像素中心）, info }
     */
    function building(b) {
      const poly = b.poly || rect(b.rect.c, b.rect.len, b.rect.dep, b.rect.ang);
      const y0 = b.y0 || 0, h = b.h;
      const g = extrudePoly(poly, h, y0);
      const G = WALLS[b.style] || (WALLS[b.style] = []);
      const roofType = (b.roof && b.roof.type) || "flat";
      for (const gr of g.groups) {
        if (gr.materialIndex === 0) { if (roofType === "flat") roofPush(subGeo(g, gr.start, gr.count), b.roofMat || M.roofFlat); }
        else G.push(subGeo(g, gr.start, gr.count));
      }
      const pick = new THREE.Mesh(g, pickMat); pick.layers.set(PICK_LAYER); scene.add(pick); pick.userData.id = b.id;
      if (roofType === "flat") {
        if (b.parapet !== 0) stripW(poly.map(W), 0.35, y0 + h, M.concrete, true, false), parapetWall(poly, y0 + h, b.parapet || 0.9);
        (b.boxes || []).forEach((bx) => { const r = rect(bx.c, bx.len, bx.dep, bx.ang); const g2 = extrudePoly(r, bx.h, y0 + h); for (const gr of g2.groups) (gr.materialIndex === 0 ? roofPush(subGeo(g2, gr.start, gr.count), M.roofFlat) : (WALLS.grey || (WALLS.grey = [])).push(subGeo(g2, gr.start, gr.count))); });
      } else {
        const r = b.rect || rectOf(poly);
        pitchedRoof(r, y0 + h, b.roof);
      }
      mark({ kind: "poly", poly, cls: "building", pad: b.pad || 1.5 });
      const c = b.rect ? b.rect.c : centroid(poly), [x, z] = W(c);
      const top = y0 + h + (roofType === "flat" ? 3 : (b.roof.pitch || 3));
      if (b.id) { items[b.id] = { id: b.id, name: b.name, pos: new THREE.Vector3(x, top + 2, z), info: b.info || "", h: top, label: b.label !== false }; pickables.push(pick); }
      return pick;
    }
    // 女儿墙：沿屋面边缘的一圈薄墙（外侧贴立面材质的腰线色）
    function parapetWall(poly, y, hgt) {
      const pts = poly.map(W), pos = [], nor = [], uv = [];
      for (let i = 0; i < pts.length; i++) {
        const [ax, az] = pts[i], [bx, bz] = pts[(i + 1) % pts.length];
        const len = Math.hypot(bx - ax, bz - az);
        const quad = [[ax, y, az], [bx, y, bz], [bx, y + hgt, bz], [ax, y + hgt, az]];
        const n = [-(bz - az) / len, 0, (bx - ax) / len];
        [0, 1, 2, 0, 2, 3].forEach((k) => { pos.push(...quad[k]); nor.push(...n); });
        uv.push(0, 0, len, 0, len, hgt, 0, 0, len, hgt, 0, hgt);
      }
      const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
      const m = solid(g, M.concrete); m.userData = {};
      // 双面：再加一份反向面
      const g2 = g.clone(); const p2 = g2.attributes.position.array, n2 = g2.attributes.normal.array;
      for (let i = 0; i < p2.length; i += 9) { for (let j = 0; j < 3; j++) { const t = p2[i + 3 + j]; p2[i + 3 + j] = p2[i + 6 + j]; p2[i + 6 + j] = t; } }
      for (let i = 0; i < n2.length; i++) n2[i] = -n2[i];
      solid(g2, M.concrete);
    }
    function rectOf(poly) {
      // 取最长边方向的外接矩形
      let best = 0, ang = 0;
      for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length], l = Math.hypot(b[0] - a[0], b[1] - a[1]); if (l > best) { best = l; ang = Math.atan2(b[1] - a[1], b[0] - a[0]); } }
      const ca = Math.cos(ang), sa = Math.sin(ang);
      let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
      poly.forEach(([x, y]) => { const u = x * ca + y * sa, v = -x * sa + y * ca; u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); });
      const uc = (u0 + u1) / 2, vc = (v0 + v1) / 2;
      return { c: [uc * ca - vc * sa, uc * sa + vc * ca], len: (u1 - u0) * S, dep: (v1 - v0) * S, ang };
    }
    // 坡屋顶：hip 四坡 / gable 双坡（山墙用墙面同色涂料封口）；r 为矩形（像素中心、米）
    function pitchedRoof(r, y, roof) {
      const ov = roof.overhang != null ? roof.overhang : 0.6, pitch = roof.pitch || Math.min(r.dep * 0.32, 5);
      const L = r.len / 2 + ov, D = r.dep / 2 + ov, f = frame(r.c, r.ang);
      const hip = roof.type === "hip" ? Math.min(D, L * 0.9) : 0;
      const pts = { a: [-L, -D], b: [L, -D], c: [L, D], d: [-L, D], e: [-L + hip, 0], g: [L - hip, 0] };
      const V = (k, yy) => { const [u, v] = pts[k]; const [x, z] = f.w(u, v); return [x, yy, z]; };
      const yt = y + pitch, yb = y - 0.15;
      const tris = [];
      // 两个长坡面
      tris.push([V("a", yb), V("e", yt), V("g", yt)], [V("a", yb), V("g", yt), V("b", yb)]);
      tris.push([V("c", yb), V("g", yt), V("e", yt)], [V("c", yb), V("e", yt), V("d", yb)]);
      // 两端：四坡为三角坡面；双坡为山墙
      const ends = [[V("d", yb), V("e", yt), V("a", yb)], [V("b", yb), V("g", yt), V("c", yb)]];
      const pos = [], uv = [];
      const pushTri = (t) => {
        // 屋面 UV：沿屋脊方向 u、沿坡向 v（米）
        t.forEach((p) => { pos.push(...p); const du = (p[0] - f.w(0, 0)[0]) * Math.cos(r.ang) + (p[2] - f.w(0, 0)[1]) * Math.sin(r.ang); uv.push(du, p[1] * 1.6 + Math.abs(-(p[0] - f.w(0, 0)[0]) * Math.sin(r.ang) + (p[2] - f.w(0, 0)[1]) * Math.cos(r.ang))); });
      };
      tris.forEach(pushTri);
      if (roof.type === "hip") ends.forEach(pushTri);
      const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
      fixWinding(g); g.computeVertexNormals();
      roofPush(g, tileMat(roof.color || 0x6f7378));
      // 屋檐下的封檐板（薄条）与山墙
      const eave = new THREE.BufferGeometry(), ep = [];
      const ring = ["a", "b", "c", "d"].map((k) => V(k, yb));
      for (let i = 0; i < 4; i++) { const A = ring[i], B = ring[(i + 1) % 4]; ep.push(...A, ...B, B[0], B[1] - 0.35, B[2], ...A, B[0], B[1] - 0.35, B[2], A[0], A[1] - 0.35, A[2]); }
      eave.setAttribute("position", new THREE.Float32BufferAttribute(ep, 3)); eave.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(ep.length / 3 * 2), 2));
      fixWindingOut(eave, f.w(0, 0)); eave.computeVertexNormals();
      solid(eave, M.white);
      if (roof.type === "gable") {
        const gg = new THREE.BufferGeometry(), gp = [];
        // 山墙在墙体位置（不含出檐）
        const L0 = r.len / 2, D0 = r.dep / 2;
        const Wp = (u, v, yy) => { const [x, z] = f.w(u, v); return [x, yy, z]; };
        gp.push(...Wp(-L0, -D0, y), ...Wp(-L0, D0, y), ...Wp(-L0, 0, yt - 0.1), ...Wp(L0, -D0, y), ...Wp(L0, 0, yt - 0.1), ...Wp(L0, D0, y));
        gg.setAttribute("position", new THREE.Float32BufferAttribute(gp, 3));
        gg.setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, r.dep, 0, r.dep / 2, pitch, 0, 0, r.dep / 2, pitch, r.dep, 0], 2));
        fixWindingOut(gg, f.w(0, 0)); gg.computeVertexNormals();
        solid(gg, roof.gableMat || M.white);
      }
    }
    function fixWinding(g) {
      const p = g.attributes.position.array, uv = g.attributes.uv && g.attributes.uv.array;
      for (let i = 0; i < p.length; i += 9) {
        const ux = p[i + 3] - p[i], uy = p[i + 4] - p[i + 1], uz = p[i + 5] - p[i + 2], vx = p[i + 6] - p[i], vy = p[i + 7] - p[i + 1], vz = p[i + 8] - p[i + 2];
        const ny = uz * vx - ux * vz;   // (u × v).y
        if (ny < 0) { for (let j = 0; j < 3; j++) { const t = p[i + 3 + j]; p[i + 3 + j] = p[i + 6 + j]; p[i + 6 + j] = t; } if (uv) { const k = (i / 9) * 6; for (let j = 0; j < 2; j++) { const t = uv[k + 2 + j]; uv[k + 2 + j] = uv[k + 4 + j]; uv[k + 4 + j] = t; } } }
      }
    }
    function fixWindingOut(g, c) {
      const p = g.attributes.position.array;
      for (let i = 0; i < p.length; i += 9) {
        const ux = p[i + 3] - p[i], uy = p[i + 4] - p[i + 1], uz = p[i + 5] - p[i + 2], vx = p[i + 6] - p[i], vy = p[i + 7] - p[i + 1], vz = p[i + 8] - p[i + 2];
        const nx = uy * vz - uz * vy, nz = ux * vy - uy * vx;
        const mx = (p[i] + p[i + 3] + p[i + 6]) / 3 - c[0], mz = (p[i + 2] + p[i + 5] + p[i + 8]) / 3 - c[1];
        if (nx * mx + nz * mz < 0) for (let j = 0; j < 3; j++) { const t = p[i + 3 + j]; p[i + 3 + j] = p[i + 6 + j]; p[i + 6 + j] = t; }
      }
    }

    // ---------- 场地小品 ----------
    // 铁丝网围栏：半透明网片（alphaTest 网格贴图）+ 立柱
    const fenceTex = (() => {
      const c = makeCanvas(64, 64), g = c.getContext("2d"); g.clearRect(0, 0, 64, 64);
      g.strokeStyle = "rgba(60,80,70,1)"; g.lineWidth = 3;
      for (let k = -64; k < 128; k += 16) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k + 64, 64); g.stroke(); g.beginPath(); g.moveTo(k + 64, 0); g.lineTo(k, 64); g.stroke(); }
      const t = canvasTex(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
    })();
    const fenceMat = patch(new THREE.MeshStandardMaterial({ map: fenceTex, color: 0x4d6b5a, alphaTest: 0.35, side: THREE.DoubleSide, roughness: 0.6, metalness: 0.4 }), { key: "fence", noWeather: true });
    function fence(ptsW, h, closed, y0) {
      y0 = y0 || 0;
      const P2 = ptsW.slice(); if (closed) P2.push(P2[0]);
      const pos = [], uv = [];
      for (let i = 0; i < P2.length - 1; i++) {
        const [ax, az] = P2[i], [bx, bz] = P2[i + 1], len = Math.hypot(bx - ax, bz - az);
        pos.push(ax, y0, az, bx, y0, bz, bx, y0 + h, bz, ax, y0, az, bx, y0 + h, bz, ax, y0 + h, az);
        uv.push(0, 0, len / 0.5, 0, len / 0.5, h / 0.5, 0, 0, len / 0.5, h / 0.5, 0, h / 0.5);
        const n = Math.max(1, Math.round(len / 3));
        for (let k = 0; k <= n; k++) cylW(ax + (bx - ax) * k / n, az + (bz - az) * k / n, y0, 0.05, 0.05, h + 0.1, M.darkMetal, 6);
      }
      const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2)); g.computeVertexNormals();
      if (!SOLIDS.has(fenceMat)) SOLIDS.set(fenceMat, []);
      SOLIDS.get(fenceMat).push(g);
    }
    // 高杆灯（球场 / 田径场）：灯杆 + 灯架 + 灯头（夜间发光）
    const floodMat = new THREE.MeshBasicMaterial({ color: 0x555a60 });
    const floodHeads = [];
    function floodlight(x, z, h, faceAng, n, y0) {
      y0 = y0 || 0; n = n || 4;
      cylW(x, z, y0, 0.28, 0.16, h, M.metal, 10);
      boxW(x, z, y0 + h, 2.6, 0.15, 0.2, faceAng + Math.PI / 2, M.metal);
      for (let k = 0; k < n; k++) {
        const off = (k - (n - 1) / 2) * 0.62, cx = x + Math.cos(faceAng + Math.PI / 2) * off, cz = z + Math.sin(faceAng + Math.PI / 2) * off;
        const g = new THREE.BoxGeometry(0.5, 0.45, 0.2); g.rotateX(0.5); g.rotateY(-faceAng - Math.PI / 2); g.translate(cx, y0 + h + 0.35, cz);
        floodHeads.push(g);
      }
    }
    // 篮球架（双臂支架 + 篮板 + 篮圈）：base 在场地端线外，面向 dir
    function hoop(x, z, dirAng, y0) {
      y0 = y0 || 0;
      const ca = Math.cos(dirAng), sa = Math.sin(dirAng);
      cylW(x - ca * 0.9, z - sa * 0.9, y0, 0.09, 0.08, 3.3, M.metal, 8);
      const arm = new THREE.BoxGeometry(1.3, 0.1, 0.1); arm.rotateY(-dirAng); arm.translate(x - ca * 0.3, y0 + 3.2, z - sa * 0.3); solid(arm, M.metal);
      const board = new THREE.BoxGeometry(0.05, 1.05, 1.8); board.rotateY(-dirAng); board.translate(x + ca * 0.3, y0 + 3.35, z + sa * 0.3); solid(board, M.white);
      const ring = new THREE.TorusGeometry(0.23, 0.02, 6, 16); ring.rotateX(Math.PI / 2); ring.translate(x + ca * 0.58, y0 + 3.05, z + sa * 0.58); solid(ring, epdm(0xd2562a));
    }
    // 球网（网球 / 排球）：两根柱 + 半透明网
    function net(ax, az, bx, bz, h, y0) {
      y0 = y0 || 0;
      cylW(ax, az, y0, 0.05, 0.05, h + 0.1, M.darkMetal, 6); cylW(bx, bz, y0, 0.05, 0.05, h + 0.1, M.darkMetal, 6);
      const len = Math.hypot(bx - ax, bz - az);
      const g = new THREE.BufferGeometry(), y1 = y0 + h, ya = y0 + (h > 2 ? h - 1 : 0.1);
      g.setAttribute("position", new THREE.Float32BufferAttribute([ax, ya, az, bx, ya, bz, bx, y1, bz, ax, ya, az, bx, y1, bz, ax, y1, az], 3));
      g.setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, len / 0.25, 0, len / 0.25, (y1 - ya) / 0.25, 0, 0, len / 0.25, (y1 - ya) / 0.25, 0, (y1 - ya) / 0.25], 2));
      g.computeVertexNormals(); if (!SOLIDS.has(fenceMat)) SOLIDS.set(fenceMat, []); SOLIDS.get(fenceMat).push(g);
      line([[ax, az], [bx, bz]], 0.06, y1, M.white);
    }
    // 长椅
    function bench(x, z, ang) {
      boxW(x, z, 0.42, 1.8, 0.06, 0.42, ang, M.wood);
      const ca = Math.cos(ang), sa = Math.sin(ang);
      for (const s of [-0.75, 0.75]) boxW(x + ca * s, z + sa * s, 0, 0.08, 0.42, 0.4, ang, M.darkMetal);
      boxW(x - Math.sin(ang) * 0.2, z + Math.cos(ang) * 0.2, 0.55, 1.8, 0.4, 0.05, ang, M.wood);
    }
    // 绿篱（修剪的小叶女贞）：圆角长方体 + 池塘叶片贴图的磨毛外壳
    const hedgeT = tex(TEX.moss || TEX.ground, 1.2);
    M.hedge = std({ map: hedgeT.map, normalMap: hedgeT.normalMap, normalScale: new THREE.Vector2(2, 2), color: 0x6f9a52, roughness: 0.9 }, { key: "hedge", macro: { scale: 0.2, amp: 0.25 } });
    function hedge(ptsW, w, h) {
      for (let i = 0; i < ptsW.length - 1; i++) {
        const [ax, az] = ptsW[i], [bx, bz] = ptsW[i + 1], len = Math.hypot(bx - ax, bz - az);
        const g = roundedBox(len, h, w, Math.min(0.25, w * 0.3), i + 3);
        { const uv = g.attributes.uv, p = g.attributes.position; for (let k = 0; k < uv.count; k++) uv.setXY(k, p.getX(k) + p.getZ(k), p.getY(k)); }
        g.rotateY(-Math.atan2(bz - az, bx - ax)); g.translate((ax + bx) / 2, h / 2, (az + bz) / 2);
        solid(g, M.hedge);
      }
    }

    // ---------- 收尾：合并 ----------
    function finish() {
      let draws = 0;
      POOL.forEach((geos, mat) => {
        const m = new THREE.Mesh(mergeGeos(geos), mat); m.receiveShadow = true; m.castShadow = false; scene.add(m); draws++;
        if (mat.userData && mat.userData.water) look.waters.push(m);
        else if (mat !== M.lawn) look.noReflect.push(m);
      });
      Object.keys(WALLS).forEach((style) => { if (!WALLS[style].length) return; const m = addMesh(mergeGeos(WALLS[style]), wallMat(style)); draws++; m.userData.walls = style; });
      ROOFS.forEach((geos, mat) => { const m = addMesh(mergeGeos(geos), mat); m.castShadow = true; draws++; });
      SOLIDS.forEach((geos, mat) => { const m = addMesh(mergeGeos(geos), mat); draws++; if (mat === fenceMat) { m.castShadow = false; } });
      if (floodHeads.length) { const m = new THREE.Mesh(mergeGeos(floodHeads), floodMat); scene.add(m); draws++; look.noReflect.push(m); }
      return { draws };
    }
    // 地物分类：返回 'building' / 'water' / 'court' / 'road' / 'paved' / 'grass' / 'out'
    function classAt(px, py, pad) {
      pad = pad || 0;
      for (let i = marks.length - 1; i >= 0; i--) {
        const m = marks[i];
        if (m.kind === "poly") { if (inPoly([px, py], m.poly) || (pad && polyDist([px, py], m.poly) < pad + (m.cls === "building" ? (m.pad || 0) : 0))) return m.cls; }
        else if (m.kind === "circle") { if (Math.hypot(px - m.c[0], py - m.c[1]) < m.r + pad) return m.cls; }
        else if (m.kind === "path") { if (polyDist([px, py], m.path, !!m.closed) < m.hw + pad) return m.cls; }
      }
      return "grass";
    }

    return {
      S, W, P, rect, frame, inPoly, polyDist, centroid, M, T, std, decal, tex, epdm, courtMat, tileMat, fenceMat, floodMat,
      flat, flatW, disc, ribbon, stripW, line, arcPts, mark, marks, classAt, polyL, rectL, lineL, rectLineL, arcL, ovalL, polyPx, pooled, fixWinding,
      boxW, cylW, solid, addMesh, building, pitchedRoof, fence, floodlight, hoop, net, bench, hedge,
      shapeOf, extrudePoly, wallMat, nightMats, pickables, items, finish, rnd, PICK_LAYER,
    };
  }

  global.ZoneBuild = { create, W, P, S, rect, inPoly, polyDist, centroid, PICK_LAYER };
})(window);
