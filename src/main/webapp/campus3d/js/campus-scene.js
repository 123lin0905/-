/*
 * 绵阳校区三维底图（建筑、道路、水体、场地、雕塑）—— 池塘同款写实画风
 *   EcoCampus.build(scene, layout, { look, sculptureUrl, quality }) -> { itemById, items, pickables, nightMats, ... }
 * 依赖：全局 THREE（lib/three-r160.min.js）、THREE.GLTFLoader、pond-style-core.js（TEX 程序化纹理、genSurface、噪声、mergeGeos）、
 *       campus-look.js（材质补丁：积雪/湿润/宏观色差，水面材质）。
 * 材质：
 *   - 草地 / 地被：池塘同款 TEX.ground（苔藓草坪），加百米尺度的宏观色差，避免平铺感；
 *   - 校外道路：沥青（程序化骨料颗粒 + 法线）；校内道路：花岗岩条石铺装；广场：大块花岗岩石板；
 *   - 建筑：红砖 / 白色涂料外墙 + 铝框玻璃窗（程序化反照率 + 法线 + 粗糙度/金属度 + 夜间窗灯），勒脚灰石；
 *     平屋面为卵石/混凝土，商铺、食堂、幼儿园用池塘小亭同款灰瓦；圆形报告厅为金属穹顶；
 *   - 水体：池塘水面的简化版（菲涅尔 + 天空 IBL + 平面反射 + 涟漪 / 雨点法线），见 campus-look.js。
 * 合批：同一外墙风格的所有建筑合并为 1 个网格（墙）+ 1 个网格（屋面），拾取用不渲染的原始网格（第 7 图层）。
 */
(function (global) {
  "use strict";
  const THREE = global.THREE;
  const PICK_LAYER = 7;

  // ---------------- 程序化表面纹理（与池塘 genSurface 同一套噪声 / 法线生成） ----------------
  const CT = {};
  function surfaceTextures() {
    if (CT.done) return CT;
    // 沥青：深灰基底 + 浅色骨料颗粒 + 细微裂纹
    CT.asphalt = genSurface(256, (u, v, x, y) => {
      const n = fbm2P(u * 8, v * 8, 8, 4, 901) * 0.5 + 0.5, g = hash3i(x, y, 5, 902), g2 = hash3i(x >> 1, y >> 1, 6, 903);
      let c = mix3(srgbHex(0x2b2c2e), srgbHex(0x3d3e40), n);
      if (g > 0.93) c = mix3(c, srgbHex(0x8c8a84), 0.7); else if (g2 > 0.9) c = mix3(c, srgbHex(0x55534f), 0.6);
      const crack = smoothstep(0.03, 0.0, Math.abs(fbm2P(u * 3, v * 3, 3, 4, 904))) * smoothstep(0.55, 0.7, n);
      c = mix3(c, srgbHex(0x18191a), crack * 0.7);
      return [c[0], c[1], c[2], g * 0.5 + n * 0.3 - crack * 0.4, 0.88];
    }, 4);
    // 校内道路：600×300 花岗岩条石，错缝，灰缝下凹
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
    // 广场：1.2 m 大石板
    CT.slabs = genSurface(512, (u, v) => {
      const bx = u * 4, by = v * 4, ix = Math.floor(bx), iy = Math.floor(by), fx = bx - ix, fy = by - iy, id = hash3i(ix, iy, 2, 921);
      const joint = smoothstep(0.0, 0.012, Math.min(fx, 1 - fx)) * smoothstep(0.0, 0.012, Math.min(fy, 1 - fy));
      const fine = fbm2P(u * 48, v * 48, 48, 3, 922) * 0.5 + 0.5, sp = hash3i(Math.floor(u * 512), Math.floor(v * 512), 9, 923);
      let c = mix3(srgbHex(0x96928a), srgbHex(0xaca89f), id * 0.5 + fine * 0.5);
      if (sp > 0.94) c = mix3(c, srgbHex(0x5d5a55), 0.45);
      c = mix3(srgbHex(0x6c6862), c, joint);
      return [c[0], c[1], c[2], joint * 0.85 + fine * 0.15, 0.72];
    }, 5);
    // 塑胶跑道：红色 EPDM 颗粒
    CT.track = genSurface(256, (u, v, x, y) => {
      const g = hash3i(x, y, 3, 931), n = fbm2P(u * 6, v * 6, 6, 3, 932) * 0.5 + 0.5;
      let c = mix3(srgbHex(0x8c3a2c), srgbHex(0xa8483a), n * 0.6 + g * 0.4);
      if (g > 0.95) c = mix3(c, srgbHex(0x3a1a14), 0.6);
      return [c[0], c[1], c[2], g, 0.9];
    }, 3);
    // 人造草坪：割草条纹
    CT.turf = genSurface(256, (u, v, x, y) => {
      const stripe = Math.floor(u * 8) % 2, b = hash3i(x, y, 4, 941), n = fbm2P(u * 8, v * 8, 8, 3, 942) * 0.5 + 0.5;
      let c = mix3(srgbHex(0x2f5a22), srgbHex(0x41712d), b * 0.5 + n * 0.3 + stripe * 0.25);
      return [c[0], c[1], c[2], b, 0.85];
    }, 2);
    // 球场：丙烯酸面层（灰白，按场地着色）
    CT.court = genSurface(128, (u, v, x, y) => {
      const b = hash3i(x, y, 8, 951) * 0.5 + fbm2P(u * 4, v * 4, 4, 3, 952) * 0.25 + 0.5;
      const c = mix3(srgbHex(0xb8bcb8), srgbHex(0xd4d8d4), b);
      return [c[0], c[1], c[2], b * 0.3, 0.6];
    }, 1);
    // 平屋面：浅灰混凝土找坡层 + 分仓缝 + 雨水污渍
    CT.roof = genSurface(256, (u, v, x, y) => {
      const n = fbm2P(u * 4, v * 4, 4, 4, 961) * 0.5 + 0.5, f = hash3i(x, y, 2, 962), g = fbm2P(u * 32, v * 32, 32, 2, 963) * 0.5 + 0.5;
      const seam = Math.min(Math.abs(((u * 4) % 1) - 0.5), Math.abs(((v * 4) % 1) - 0.5)) > 0.485;
      let c = mix3(srgbHex(0x8e8f8f), srgbHex(0xa9aaa8), n * 0.6 + g * 0.25 + f * 0.15);
      c = mix3(c, srgbHex(0x6c6e6c), smoothstep(0.62, 0.8, n) * 0.5);
      if (seam) c = mix3(c, srgbHex(0x4c4d4c), 0.7);
      return [c[0], c[1], c[2], (seam ? 0 : 0.6) + g * 0.2, 0.9];
    }, 2);
    for (const k of ["asphalt", "pavers", "slabs", "track", "turf", "court", "roof"]) {
      CT[k].map.wrapS = CT[k].map.wrapT = CT[k].normalMap.wrapS = CT[k].normalMap.wrapT = THREE.RepeatWrapping;
    }
    CT.done = true;
    return CT;
  }

  // ---------------- 建筑立面（程序化：反照率 / 法线 / 粗糙度+金属度 / 夜间窗灯） ----------------
  const CELL_W = 4, CELL_H = 3.6, CELLS = 4, FACADE_PX = 1024;
  const STYLES = {
    brick: { wall: "brick", col: 0x8f4230, frame: 0xe6e4de, glass: 0x23313b, band: 0xe2ded6, roof: "flat" },
    dorm: { wall: "brick", col: 0xa85536, frame: 0xf0ede6, glass: 0x2b3843, band: 0xece6da, roof: "flat", balcony: true },
    white: { wall: "render", col: 0xe7e9eb, frame: 0x8b9298, glass: 0x2a4352, band: 0xf2f2f0, roof: "flat", big: true },
    dome: { wall: "render", col: 0xe3ddd2, frame: 0x9aa0a6, glass: 0x32495a, band: 0xf1ede6, roof: "flat" },
    library: { wall: "brick", col: 0x96432f, frame: 0x6f767c, glass: 0x1f3546, band: 0xe0ddd6, roof: "flat", big: true },
    canteen: { wall: "render", col: 0xd59b8c, frame: 0xf2ece6, glass: 0x34424c, band: 0xf5ece8, roof: "tile" },
    shop: { wall: "render", col: 0xdcc6a1, frame: 0xf3ead8, glass: 0x3c4a54, band: 0xf2e8d6, roof: "tile", shop: true },
    kinder: { wall: "render", col: 0xeccd66, frame: 0xffffff, glass: 0x34505e, band: 0xfff3cf, roof: "tile" },
  };
  const FACADE_CACHE = {};
  function facadeTextures(styleName, rnd) {
    const st = STYLES[styleName] || STYLES.brick;
    const N = FACADE_PX, CP = N / CELLS;
    const alb = new Uint8Array(N * N * 4), H = new Float32Array(N * N);
    const okey = st.wall + (st.big ? "B" : "") + (st.balcony ? "L" : "") + (st.shop ? "S" : "");
    const needOrm = !FACADE_CACHE[okey];
    const orm = needOrm ? new Uint8Array((N / 2) * (N / 2) * 4) : null;
    const EN = 128, em = new Uint8Array(EN * EN * 4);
    const wallC = srgbHex(st.col), frameC = srgbHex(st.frame), glassC = srgbHex(st.glass), bandC = srgbHex(st.band);
    // 窗口几何（单元内 0..1，自下而上）
    const W0 = st.big ? 0.05 : st.shop ? 0.08 : 0.2, W1 = 1 - W0;
    const H0 = st.big ? 0.12 : st.shop ? 0.08 : 0.3, H1 = st.big ? 0.9 : st.shop ? 0.8 : 0.78;
    const FR = 0.022;
    // 每个窗格是否亮灯（夜间），按楼层/开间随机；商铺底层大多亮
    const lit = [];
    for (let j = 0; j < CELLS; j++) for (let i = 0; i < CELLS; i++) lit.push(rnd() < (st.shop ? 0.85 : 0.6) ? 0.6 + rnd() * 0.4 : 0);
    const warm = [];
    for (let k = 0; k < CELLS * CELLS; k++) warm.push(rnd() < 0.7);
    for (let y = 0; y < N; y++) {
      const cj = Math.floor(y / CP), fy = (y % CP) / CP;
      for (let x = 0; x < N; x++) {
        const ci = Math.floor(x / CP), fx = (x % CP) / CP;
        const i = (y * N + x) * 4;
        let c, h, rough, metal = 0;
        const inWin = fx > W0 && fx < W1 && fy > H0 && fy < H1;
        const inFrame = fx > W0 - FR && fx < W1 + FR && fy > H0 - FR && fy < H1 + FR;
        const band = fy < 0.055;
        if (band) {                                           // 楼层线（白色混凝土线脚，略凸）
          const n = hash3i(x, y, 3, 77) * 0.08;
          c = mix3(bandC, [255, 255, 255], n); h = 0.75; rough = 0.7;
        } else if (inWin) {
          // 铝框玻璃：竖梃 + 横档，玻璃反照率很低、粗糙度很低（主要靠反射环境）
          const mull = st.big ? Math.abs(((fx - W0) / (W1 - W0)) * 3 % 1 - 0.5) > 0.485 : Math.abs(fx - 0.5) < 0.012;
          const tran = Math.abs(fy - (st.big ? 0.66 : 0.64)) < 0.012;
          if (mull || tran) { c = frameC; h = 0.45; rough = 0.35; metal = 0.6; }
          else {
            const refl = smoothstep(0.0, 1.0, (fy - H0) / (H1 - H0)) * 0.25;
            const curtain = !st.big && hash3i(ci, cj, 5, 44) > 0.55 && fy > H1 - 0.12 - 0.25 * hash3i(ci, cj, 6, 45);   // 有的窗拉着窗帘
            c = curtain ? mix3([200, 196, 186], glassC, 0.35) : mix3(glassC, [120, 150, 170], refl);
            h = 0.25; rough = curtain ? 0.6 : 0.06; metal = curtain ? 0 : 0.35;
          }
        } else if (inFrame) { c = frameC; h = 0.6; rough = 0.4; metal = 0.5; }
        else if (st.balcony && fy < 0.3 && fx > 0.12 && fx < 0.88) {   // 宿舍阳台栏板（浅色）
          const n = hash3i(x, y, 2, 13) * 0.06;
          c = mix3(bandC, [255, 255, 255], n); h = 0.85; rough = 0.75;
        } else if (st.wall === "brick") {
          // 顺砖错缝：砖 240×53 mm，灰缝 10 mm（1024 px / 16 m = 64 px/m）
          const by = (cj * CELL_H + fy * CELL_H) / 0.063, row = Math.floor(by), fyy = by - row;
          const bx = (ci * CELL_W + fx * CELL_W) / 0.25 + (row % 2) * 0.5, col = Math.floor(bx), fxx = bx - col;
          const mortar = fyy < 0.16 || fxx < 0.05;
          const id = hash3i(col, row, 1, 31), sp = hash3i(x, y, 9, 32);
          if (mortar) { c = mix3([128, 120, 110], [104, 98, 90], sp); h = 0.0; rough = 0.95; }
          else { c = wallC.map((q) => q * (0.78 + 0.32 * id) * (0.94 + 0.12 * sp)); if (id > 0.93) c = mix3(c, [70, 40, 32], 0.4); h = 0.55 + 0.1 * sp; rough = 0.85; }
        } else {
          // 涂料外墙：细微颗粒 + 大尺度污渍（雨痕从窗台往下）
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
        const inWin = fx > W0 && fx < W1 && fy > H0 && fy < H1;
        const v = inWin && L ? L * (0.8 + 0.2 * (fy - H0) / (H1 - H0)) : 0;
        const wc = warm[k] ? [255, 205, 140] : [235, 240, 255];
        em[o] = wc[0] * v; em[o + 1] = wc[1] * v; em[o + 2] = wc[2] * v; em[o + 3] = 255;
      }
    }
    const map = dataTex(alb, N, N, true);
    const emissiveMap = dataTex(em, EN, EN, true);
    if (needOrm) FACADE_CACHE[okey] = { normalMap: dataTex(heightToNormal(H, N, N, st.wall === "brick" ? 6 : 3), N, N, false), ormMap: dataTex(orm, N / 2, N / 2, false) };
    const shared = FACADE_CACHE[okey];
    for (const t of [map, emissiveMap, shared.normalMap, shared.ormMap]) t.repeat.set(1 / (CELL_W * CELLS), 1 / (CELL_H * CELLS));
    return { map, emissiveMap, normalMap: shared.normalMap, ormMap: shared.ormMap };
  }
  // ExtrudeGeometry 的 UV：墙面 u = 沿墙方向的距离（米），v = 高度（米）；顶面 = 平面坐标（米）
  const UVGEN = {
    generateTopUV(g, v, a, b, c) {
      return [new THREE.Vector2(v[a * 3], v[a * 3 + 1]), new THREE.Vector2(v[b * 3], v[b * 3 + 1]), new THREE.Vector2(v[c * 3], v[c * 3 + 1])];
    },
    generateSideWallUV(g, v, a, b, c, d) {
      const P = (i) => [v[i * 3], v[i * 3 + 1], v[i * 3 + 2]];
      const A = P(a), B = P(b), C = P(c), D = P(d);
      let ex = B[0] - A[0], ey = B[1] - A[1], l = Math.hypot(ex, ey);
      if (l < 1e-6) { ex = C[0] - D[0]; ey = C[1] - D[1]; l = Math.hypot(ex, ey) || 1; }
      ex /= l; ey /= l;
      const U = (p) => new THREE.Vector2(p[0] * ex + p[1] * ey, p[2]);
      return [U(A), U(B), U(C), U(D)];
    },
  };
  function subGeo(g, start, count) {
    const out = new THREE.BufferGeometry();
    for (const name of ["position", "normal", "uv"]) {
      const a = g.attributes[name]; if (!a) continue;
      out.setAttribute(name, new THREE.BufferAttribute(a.array.slice(start * a.itemSize, (start + count) * a.itemSize), a.itemSize));
    }
    return out;
  }

  function build(scene, L, opts) {
    opts = opts || {};
    const look = opts.look;
    const patch = look ? look.patch : (m) => m;
    const S = L.scale_m_per_px || 0.4;
    const CX = 1024, CY = 999;
    const W = (p) => [(p[0] - CX) * S, (p[1] - CY) * S]; // 平面图像素 -> 世界 x,z（米）
    const INFO = global.INFO || {};
    const T = surfaceTextures();
    const tex = (set, tile, rot) => {
      const m = set.map.clone(), n = set.normalMap.clone();
      for (const t of [m, n]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1 / tile, 1 / tile); t.anisotropy = MAX_ANISO; if (rot) { t.rotation = rot; } t.needsUpdate = true; }
      return { map: m, normalMap: n };
    };

    // ---------- helpers ----------
    function shapeOf(poly) {
      const s = new THREE.Shape();
      poly.forEach((p, i) => {
        const [x, z] = W(p);
        i ? s.lineTo(x, -z) : s.moveTo(x, -z);
      });
      return s;
    }
    function circleShape(c, r) {
      const s = new THREE.Shape();
      const [x, z] = W(c);
      s.absarc(x, -z, r * S, 0, Math.PI * 2, false);
      return s;
    }
    // 合批：同一材质的地面 / 带状面最后合并成一个网格（draw call 从几十个降到十来个）；
    // 每块面另建一个不渲染的拾取代理（第 7 图层），用于点击与选中描边
    const POOL = new Map();
    const pickMat = new THREE.MeshBasicMaterial({ visible: false });
    function pooled(geo, mat, y) {
      const g = geo.clone(); g.translate(0, y, 0);
      if (!POOL.has(mat)) POOL.set(mat, []);
      POOL.get(mat).push(g);
    }
    function proxyOf(geo, y) { const m = new THREE.Mesh(geo, pickMat); m.position.y = y; m.layers.set(PICK_LAYER); scene.add(m); return m; }
    // 平铺地面：ShapeGeometry 的 UV 就是平面坐标（米），贴图 repeat = 1/每块尺寸
    function flat(shape, mat, y) {
      const g = new THREE.ShapeGeometry(shape, 24);
      g.rotateX(-Math.PI / 2);
      pooled(g, mat, y);
      return proxyOf(g, y);
    }
    // 沿路径的带状面：UV u = 沿路累计长度，v = 横向偏移（米）
    function ribbon(path, widthPx, y, mat, closed) {
      const pos = [], uv = [];
      const hw = (widthPx * S) / 2;
      const pts = path.map(W);
      if (closed) pts.push(pts[0]);
      let acc = 0;
      for (let i = 0; i < pts.length - 1; i++) {
        const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
        const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz) || 1;
        const nx = (-dz / len) * hw, nz = (dx / len) * hw;
        const u0 = acc, u1 = acc + len; acc = u1;
        pos.push(ax + nx, 0, az + nz, bx + nx, 0, bz + nz, bx - nx, 0, bz - nz); uv.push(u0, hw, u1, hw, u1, -hw);
        pos.push(ax + nx, 0, az + nz, bx - nx, 0, bz - nz, ax - nx, 0, az - nz); uv.push(u0, hw, u1, -hw, u0, -hw);
      }
      pts.forEach(([x, z]) => {
        const n = 12;
        for (let k = 0; k < n; k++) {
          const a0 = (k / n) * Math.PI * 2, a1 = ((k + 1) / n) * Math.PI * 2;
          pos.push(x, 0, z, x + Math.cos(a1) * hw, 0, z + Math.sin(a1) * hw, x + Math.cos(a0) * hw, 0, z + Math.sin(a0) * hw);
          uv.push(x, z, x + Math.cos(a1) * hw, z + Math.sin(a1) * hw, x + Math.cos(a0) * hw, z + Math.sin(a0) * hw);
        }
      });
      const a = pos;
      for (let i = 0; i < a.length; i += 9) {
        const ux = a[i + 3] - a[i], uz = a[i + 5] - a[i + 2], vx = a[i + 6] - a[i], vz = a[i + 8] - a[i + 2];
        if (uz * vx - ux * vz < 0) {
          for (let j = 0; j < 3; j++) { const t = a[i + 3 + j]; a[i + 3 + j] = a[i + 6 + j]; a[i + 6 + j] = t; }
          const k = (i / 9) * 6; for (let j = 0; j < 2; j++) { const t = uv[k + 2 + j]; uv[k + 2 + j] = uv[k + 4 + j]; uv[k + 4 + j] = t; }
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
      g.computeVertexNormals();
      pooled(g, mat, y);
      return proxyOf(g, y);
    }
    function centroid(poly) {
      let x = 0, y = 0;
      poly.forEach((p) => { x += p[0]; y += p[1]; });
      return [x / poly.length, y / poly.length];
    }
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
      let d = Infinity;
      const n = closed ? poly.length : poly.length - 1;
      for (let i = 0; i < n; i++) d = Math.min(d, segDist(p, poly[i], poly[(i + 1) % poly.length]));
      return d;
    }
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const std = (params, o) => patch(new THREE.MeshStandardMaterial(Object.assign({ envMapIntensity: 0.8 }, params)), o);

    // ---------- 地面：池塘同款草地（TEX.ground），宏观色差 ----------
    const groundMats = [];
    const lawnT = tex(TEX.ground, 6);
    const lawnMat = std({ map: lawnT.map, normalMap: lawnT.normalMap, normalScale: new THREE.Vector2(0.8, 0.8), roughness: 0.95, color: 0xffffff },
      { key: "lawn", macro: { scale: 0.011, amp: 0.2 } });
    const fieldT = tex(TEX.ground, 10);
    const outerMat = std({ map: fieldT.map, normalMap: fieldT.normalMap, roughness: 0.97, color: 0xd8dcc4 }, { key: "outerfield", macro: { scale: 0.004, amp: 0.3 } });
    const ground = new THREE.Mesh(new THREE.CircleGeometry(9000, 64), outerMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.6;
    ground.receiveShadow = true;
    { const uv = ground.geometry.attributes.uv, p = ground.geometry.attributes.position; for (let i = 0; i < uv.count; i++) uv.setXY(i, p.getX(i), p.getY(i)); }
    scene.add(ground);
    groundMats.push(outerMat);
    flat(shapeOf(L.boundary), lawnMat, 0);
    groundMats.push(lawnMat);
    const graniteT = tex(TEX.granite, 2.5);
    const curbMat = std({ map: graniteT.map, normalMap: graniteT.normalMap, roughness: 0.75, color: 0xd6d2ca }, { key: "curb" });
    ribbon(L.boundary, 3, 0.05, curbMat, true);

    // 校外道路：沥青 + 白色标线
    const asphaltT = tex(T.asphalt, 5);
    const roadMat = std({ map: asphaltT.map, normalMap: asphaltT.normalMap, normalScale: new THREE.Vector2(0.6, 0.6), roughness: 0.9 }, { key: "asphalt", macro: { scale: 0.02, amp: 0.15 } });
    groundMats.push(roadMat);
    L.outer_roads.forEach((r) => ribbon(r.path, r.width, -0.2, roadMat, false));
    const paintMat = std({ color: 0xd9d6cc, roughness: 0.7 }, { key: "paint" });
    L.outer_roads.forEach((r) => ribbon(r.path, 1.2, -0.1, paintMat, false));

    const pickables = [];
    const itemById = {};
    function register(id, name, cat, pos, meshes, extra) {
      const it = Object.assign({ id, name, cat, pos, meshes: meshes || [] }, extra || {});
      it.info = INFO[id] || {};
      itemById[id] = it;
      it.meshes.forEach((m) => { m.userData.id = id; pickables.push(m); });
      return it;
    }

    // ---------- 水体：池塘水面简化版 ----------
    const waterMat = look ? look.waterMaterial({ key: "lake", color: 0x0d2627, scale: 0.06 }) : new THREE.MeshStandardMaterial({ color: "#3f8fb5" });
    const poolMat = look ? look.waterMaterial({ key: "pool", color: 0x2d7f8c, scale: 0.12 }) : new THREE.MeshStandardMaterial({ color: "#4fb9e0" });
    const waterMeshes = [];
    // 驳岸：花岗岩压顶石（池塘同款 TEX.granite）
    const copingMat = std({ map: graniteT.map, normalMap: graniteT.normalMap, roughness: 0.78, color: 0xc9c4ba }, { key: "coping" });
    const islandMat = std({ map: lawnT.map, normalMap: lawnT.normalMap, roughness: 0.95 }, { key: "island", macro: { scale: 0.03, amp: 0.2 } });
    L.water.forEach((w) => {
      const m = flat(shapeOf(w.poly), waterMat, 0.35);
      ribbon(w.poly, 3.2, 0.42, copingMat, true);
      const ms = [m];
      if (w.island) { ms.push(flat(circleShape(w.island.c, w.island.r), islandMat, 0.5)); ribbon(Array.from({ length: 25 }, (_, k) => [w.island.c[0] + Math.cos(k / 24 * Math.PI * 2) * w.island.r, w.island.c[1] + Math.sin(k / 24 * Math.PI * 2) * w.island.r]), 2.4, 0.46, copingMat, false); }
      const [x, z] = W(centroid(w.poly));
      register(w.id, w.name, "景观", new THREE.Vector3(x, 3, z), ms, { kind: "水体" });
    });

    // 广场：大块花岗岩石板
    const slabT = tex(T.slabs, 4.8);
    const plazaMat = std({ map: slabT.map, normalMap: slabT.normalMap, normalScale: new THREE.Vector2(0.7, 0.7), roughness: 0.72 }, { key: "plaza", macro: { scale: 0.03, amp: 0.1 } });
    groundMats.push(plazaMat);
    L.plazas.forEach((p) => {
      const m = flat(shapeOf(p.poly), plazaMat, 0.55);
      const [x, z] = W(centroid(p.poly));
      register(p.id, p.name, "景观", new THREE.Vector3(x, 3, z), [m], { kind: "广场" });
    });

    // 运动场
    const trackT = tex(T.track, 3), turfT = tex(T.turf, 24), courtT = tex(T.court, 6);
    const trackMat = std({ map: trackT.map, normalMap: trackT.normalMap, roughness: 0.92 }, { key: "track" });
    const turfMat = std({ map: turfT.map, normalMap: turfT.normalMap, roughness: 0.88 }, { key: "turf" });
    const courtMats = {
      basket: std({ map: courtT.map, normalMap: courtT.normalMap, color: 0x5f9c78, roughness: 0.6 }, { key: "court" }),
      blue: std({ map: courtT.map, normalMap: courtT.normalMap, color: 0x4f86b8, roughness: 0.6 }, { key: "court" }),
    };
    const lineMat = std({ color: 0xf2f2ee, roughness: 0.6 }, { key: "paint" });
    L.sports.forEach((s) => {
      const mat = s.type === "track" ? trackMat : s.type === "pool" ? poolMat : s.type === "court" ? (s.id === "basket" ? courtMats.basket : courtMats.blue) : turfMat;
      const ms = [flat(shapeOf(s.poly), mat, s.type === "pool" ? 0.45 : 0.45)];
      if (s.type === "pool") ribbon(s.poly, 2.2, 0.5, copingMat, true);
      if (s.field) ms.push(flat(shapeOf(s.field), turfMat, 0.6));
      if (s.type === "court" || s.type === "track") ribbon(s.field || s.poly, 1.0, s.field ? 0.7 : 0.6, lineMat, true);
      const [x, z] = W(centroid(s.poly));
      register(s.id, s.name, "体育", new THREE.Vector3(x, 3, z), ms, { kind: "场地" });
    });
    groundMats.push(trackMat, turfMat);

    // 校内道路：花岗岩条石铺装（沿路方向错缝）
    const paverT = tex(T.pavers, 4.8);
    const pathMat = std({ map: paverT.map, normalMap: paverT.normalMap, normalScale: new THREE.Vector2(0.8, 0.8), roughness: 0.78 }, { key: "pavers", macro: { scale: 0.025, amp: 0.12 } });
    groundMats.push(pathMat);
    L.campus_roads.forEach((r) => ribbon(r.path, r.width, 0.8, pathMat, r.closed));

    // ---------- 建筑（同风格合批：墙 1 个网格 + 屋面 1 个网格；拾取用不渲染的原始网格） ----------
    const wallMats = {}, nightMats = [];
    const roofFlatT = tex(T.roof, 12), roofTileT = tex(TEX.roof, 2.2);
    const roofMats = {
      flat: std({ map: roofFlatT.map, normalMap: roofFlatT.normalMap, roughness: 0.9, color: 0xffffff }, { key: "roofflat", macro: { scale: 0.05, amp: 0.12 } }),
      tile: std({ map: roofTileT.map, normalMap: roofTileT.normalMap, normalScale: new THREE.Vector2(1.2, 1.2), roughness: 0.6, color: 0xffffff }, { key: "rooftile" }),
    };
    function wallMat(style) {
      if (!wallMats[style]) {
        const ft = facadeTextures(style, rnd);
        const m = std({ map: ft.map, normalMap: ft.normalMap, normalScale: new THREE.Vector2(1, 1), roughnessMap: ft.ormMap, metalnessMap: ft.ormMap,
          roughness: 1, metalness: 1, emissiveMap: ft.emissiveMap, emissive: new THREE.Color(1, 1, 1), emissiveIntensity: 0, envMapIntensity: 1.0 },
          { key: "wall", plinth: true });
        wallMats[style] = m; nightMats.push(m);
      }
      return wallMats[style];
    }
    const GROUPS = {};   // style -> { walls: [], roofs: [] }
    function extrude(shape, h, style) {
      const g = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false, curveSegments: 24, UVGenerator: UVGEN });
      g.rotateX(-Math.PI / 2);
      const G = GROUPS[style] || (GROUPS[style] = { walls: [], roofs: [] });
      for (const gr of g.groups) (gr.materialIndex === 0 ? G.roofs : G.walls).push(subGeo(g, gr.start, gr.count));
      const pick = new THREE.Mesh(g, pickMat);   // 只用于拾取 / 描边，不渲染
      pick.layers.set(PICK_LAYER);
      scene.add(pick);
      return pick;
    }

    L.buildings.forEach((b) => {
      const ms = [];
      let top = b.h || 10, cpx;
      if (b.parts) {
        b.parts.forEach((p) => ms.push(extrude(shapeOf(p.poly), p.h, b.style)));
        top = Math.max.apply(null, b.parts.map((p) => p.h));
        cpx = centroid(b.parts[0].poly);
      } else if (b.circle) {
        ms.push(extrude(circleShape(b.circle.c, b.circle.r), b.h, b.style));
        const [x, z] = W(b.circle.c);
        const r = b.circle.r * S;
        const domeMat = std({ color: 0xc3ccd2, roughness: 0.28, metalness: 0.85, envMapIntensity: 1.1 }, { key: "dome" });
        const dome = new THREE.Mesh(new THREE.SphereGeometry(r * 0.92, 48, 16, 0, Math.PI * 2, 0, Math.PI / 2), domeMat);
        dome.scale.y = 0.55; dome.position.set(x, b.h, z);
        dome.castShadow = true; dome.receiveShadow = true; scene.add(dome); ms.push(dome);
        top = b.h + r * 0.5;
        cpx = b.circle.c;
      } else {
        ms.push(extrude(shapeOf(b.poly), b.h, b.style));
        cpx = centroid(b.poly);
      }
      if (b.roundEnd) ms.push(extrude(circleShape(b.roundEnd.c, b.roundEnd.r), b.h, b.style));
      const [x, z] = W(cpx);
      register(b.id, b.name, b.cat, new THREE.Vector3(x, top + 2, z), ms, { kind: "建筑", h: b.h || top, building: true });
    });
    let buildingTris = 0;
    Object.keys(GROUPS).forEach((style) => {
      const G = GROUPS[style], st = STYLES[style] || STYLES.brick;
      const walls = new THREE.Mesh(mergeGeos(G.walls), wallMat(style));
      walls.castShadow = walls.receiveShadow = true; scene.add(walls);
      const roofs = new THREE.Mesh(mergeGeos(G.roofs), roofMats[st.roof] || roofMats.flat);
      roofs.castShadow = false; roofs.receiveShadow = true; scene.add(roofs);   // 墙体已形成完整投影轮廓，屋面不再重复投影
      buildingTris += (walls.geometry.index.count + roofs.geometry.index.count) / 3;
    });

    // ---------- 雕塑（AI 模型 sculpture_ai.glb，失败时保留程序化旋涡） ----------
    {
      const sc = L.sculpture;
      const [x, z] = W(sc.pos);
      const grp = new THREE.Group();
      grp.position.set(x, 0.6, z);
      const base = new THREE.Mesh(new THREE.BoxGeometry(9, 1.6, 9), std({ map: graniteT.map, normalMap: graniteT.normalMap, color: 0x3a3a3c, roughness: 0.45 }, { key: "plinthstone" }));
      base.position.y = 0.8;
      const red = new THREE.Mesh(new THREE.SphereGeometry(3.2, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), std({ color: 0xa61f26, roughness: 0.35, metalness: 0.1 }, { key: "redpaint" }));
      red.position.y = 1.6;
      const pts = [];
      for (let i = 0; i <= 120; i++) {
        const t = i / 120, a = t * Math.PI * 4.2, r = 2.6 * (1 - t * 0.55) + 0.4;
        pts.push(new THREE.Vector3(Math.cos(a) * r, 4.4 + t * 13, Math.sin(a) * r));
      }
      const steel = std({ color: 0xe4e8ec, metalness: 1, roughness: 0.16, envMapIntensity: 1.2 }, { key: "steel" });
      const swirl = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 120, 0.55, 8, false), steel);
      const swirl2 = swirl.clone(); swirl2.rotation.y = Math.PI;
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.9, 12, 8), steel); tip.position.y = 18;
      [base, red, swirl, swirl2, tip].forEach((m) => { m.castShadow = true; m.receiveShadow = true; grp.add(m); });
      scene.add(grp);
      const scItem = register(sc.id, sc.name, "景观", new THREE.Vector3(x, 22, z), [base, red, swirl, swirl2, tip], { kind: "雕塑", note: sc.note });
      const procedural = [swirl, swirl2, tip];
      const PEDESTAL_TOP = red.position.y + 3.2;
      const fallback = (err) => console.warn("雕塑 GLB 加载失败，保留程序化雕塑。", err);
      if (opts.sculptureUrl && THREE.GLTFLoader) {
        try {
          new THREE.GLTFLoader().load(opts.sculptureUrl, (gltf) => {
            try {
              const model = gltf.scene;
              const meshes = [];
              const steelAI = std({ color: 0xe8ecef, metalness: 1, roughness: 0.2, envMapIntensity: 1.2 }, { key: "steel" });   // 有天空 IBL，不锈钢可用全金属
              model.traverse((o) => {
                if (!o.isMesh) return;
                if (!o.geometry.attributes.normal) o.geometry.computeVertexNormals();
                o.material = steelAI;
                o.castShadow = true;
                o.userData.noOutline = true;
                meshes.push(o);
              });
              if (!meshes.length) throw new Error("GLB 中没有网格");
              const box = new THREE.Box3().setFromObject(model);
              const size = box.getSize(new THREE.Vector3());
              if (!(size.y > 0)) throw new Error("GLB 包围盒为空");
              const s = 5 / size.y;
              model.scale.setScalar(s);
              const c = box.getCenter(new THREE.Vector3());
              model.position.set(-c.x * s, PEDESTAL_TOP - box.min.y * s, -c.z * s);
              grp.add(model);
              procedural.forEach((m) => {
                grp.remove(m);
                const pi = pickables.indexOf(m); if (pi >= 0) pickables.splice(pi, 1);
                const mi = scItem.meshes.indexOf(m); if (mi >= 0) scItem.meshes.splice(mi, 1);
              });
              meshes.forEach((m) => { m.userData.id = scItem.id; pickables.push(m); scItem.meshes.push(m); });
              scItem.model = "AI 复原（Hunyuan3D-2，参考校园照片）";
              if (opts.onSculpture) opts.onSculpture(steelAI);
            } catch (err) { fallback(err); }
          }, undefined, fallback);
        } catch (err) { fallback(err); }
      }
    }

    // ---------- 点位 ----------
    L.gates.forEach((g) => {
      const [x, z] = W(g.pos);
      register(g.id, g.name, "出入口", new THREE.Vector3(x, 6, z), [], { kind: "出入口", road: g.road });
    });
    // 公交站：不锈钢框 + 玻璃候车亭
    const shelterSteel = std({ color: 0x9aa1a8, metalness: 0.9, roughness: 0.35 }, { key: "steel2" });
    const shelterGlass = std({ color: 0x2a3a44, metalness: 0.2, roughness: 0.05, transparent: true, opacity: 0.55, envMapIntensity: 1.2 }, { key: "glass", noWeather: true });
    L.bus_stops.forEach((b) => {
      const [x, z] = W(b.pos);
      const grp = new THREE.Group(); grp.position.set(x, 0, z);
      const roof = new THREE.Mesh(new THREE.BoxGeometry(6.4, 0.18, 1.9), shelterSteel); roof.position.y = 2.7;
      const back = new THREE.Mesh(new THREE.BoxGeometry(6.0, 2.4, 0.06), shelterGlass); back.position.set(0, 1.4, -0.85);
      const posts = mergeGeos([-3, 3].map((px) => new THREE.BoxGeometry(0.12, 2.7, 0.12).translate(px, 1.35, -0.85)));
      const pm = new THREE.Mesh(posts, shelterSteel);
      roof.castShadow = true;
      [roof, back, pm].forEach((m) => grp.add(m));
      scene.add(grp);
      register(b.id, b.name, "交通", new THREE.Vector3(x, 5, z), [roof, back, pm], { kind: "公交站" });
    });
    L.parking.forEach((p) => {
      const [x, z] = W(p.pos);
      const g = new THREE.BoxGeometry(46, 0.3, 30);
      { const uv = g.attributes.uv, pp = g.attributes.position; for (let i = 0; i < uv.count; i++) uv.setXY(i, pp.getX(i) + x, pp.getZ(i) + z); }
      const pad = new THREE.Mesh(g, roadMat);
      pad.position.set(x, 0.7, z); pad.receiveShadow = true; scene.add(pad);
      // 车位线
      const lines = [];
      for (let k = -4; k <= 4; k++) { lines.push(new THREE.PlaneGeometry(0.15, 5.2).rotateX(-Math.PI / 2).translate(k * 5, 0.87, -9)); lines.push(new THREE.PlaneGeometry(0.15, 5.2).rotateX(-Math.PI / 2).translate(k * 5, 0.87, 9)); }
      const lm = new THREE.Mesh(mergeGeos(lines), paintMat); lm.position.set(x, 0, z); lm.receiveShadow = true; scene.add(lm);
      register(p.id, p.name, "交通", new THREE.Vector3(x, 4, z), [pad], { kind: "停车场" });
    });

    // ---------- 可种树的空地（树木本身由 eco-life 生成，便于季节/风动/LOD） ----------
    function treeSpots(maxN, avoid) {
      const blockers = [];
      L.buildings.forEach((b) => (b.parts ? b.parts.map((p) => p.poly) : b.poly ? [b.poly] : []).forEach((p) => blockers.push(p)));
      const circles = L.buildings.filter((b) => b.circle).map((b) => b.circle).concat(L.buildings.filter((b) => b.roundEnd).map((b) => b.roundEnd));
      const areas = L.water.map((w) => w.poly).concat(L.sports.map((s) => s.poly)).concat(L.plazas.filter((p) => p.id !== "c_court").map((p) => p.poly));
      const roads = L.campus_roads;
      const xs = L.boundary.map((p) => p[0]), ys = L.boundary.map((p) => p[1]);
      const minX = Math.min.apply(null, xs), maxX = Math.max.apply(null, xs), minY = Math.min.apply(null, ys), maxY = Math.max.apply(null, ys);
      const spots = [];
      let tries = 0;
      seed = 11;
      while (spots.length < maxN && tries < 50000) {
        tries++;
        const p = [minX + rnd() * (maxX - minX), minY + rnd() * (maxY - minY)];
        if (!inPoly(p, L.boundary) || polyDist(p, L.boundary) < 10) continue;
        if (blockers.some((b) => inPoly(p, b) || polyDist(p, b) < 10)) continue;
        if (circles.some((c) => Math.hypot(p[0] - c.c[0], p[1] - c.c[1]) < c.r + 10)) continue;
        if (areas.some((a) => inPoly(p, a) || polyDist(p, a) < 6)) continue;
        if (roads.some((r) => polyDist(p, r.path, false) < r.width / 2 + 6)) continue;
        if (spots.some((s) => Math.hypot(s[0] - p[0], s[1] - p[1]) < 14)) continue;
        const sc = L.sculpture.pos;
        if (Math.hypot(p[0] - sc[0], p[1] - sc[1]) < 30) continue;
        if (avoid && avoid(p)) continue;
        spots.push(p);
      }
      return spots;
    }
    // 到最近水岸 / 道路的距离（像素），用于树种分配（水边种垂柳、路边种行道树）
    function waterDistPx(p) { let d = Infinity; L.water.forEach((w) => (d = Math.min(d, inPoly(p, w.poly) ? 0 : polyDist(p, w.poly)))); return d; }
    function roadDistPx(p) { let d = Infinity; L.campus_roads.forEach((r) => (d = Math.min(d, polyDist(p, r.path, false) - r.width / 2))); return d; }

    // 合并地面网格
    let groundDraws = 0;
    POOL.forEach((geos, mat) => {
      const m = new THREE.Mesh(mergeGeos(geos), mat);
      m.receiveShadow = true;
      scene.add(m); groundDraws++;
      if (mat === waterMat || mat === poolMat) waterMeshes.push(m);
      else if (look && mat !== lawnMat && mat !== copingMat && mat !== islandMat) look.noReflect.push(m);   // 低于水面视线的地面不进反射 pass
    });
    if (look) waterMeshes.forEach((m) => look.waters.push(m));
    return {
      S, W, shapeOf, centroid, inPoly, polyDist, ribbon, flat, register, waterDistPx, roadDistPx,
      itemById, items: Object.values(itemById), pickables, nightMats, groundMats, PICK_LAYER,
      waterMat, poolMat, waterMeshes, ground, roadMat, pathMat, treeSpots, stats: { buildingTris, groundDraws },
    };
  }

  global.EcoCampus = { build };
})(window);
