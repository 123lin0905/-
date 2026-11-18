/*
 * 板块细节场景工具包 · 世界构建（ZKWorld）—— 教学楼绿化带（teaching/）与 A 区宿舍生活区（dorm-a/）共用
 * ------------------------------------------------------------------------------
 * 画风与池塘细节场景（pond/pond.html，改造自 MIT 许可的 Koi Pond Garden）一致：只读复用 js/pond-style-core.js 的
 * 噪声 / genSurface 程序化纹理 / growTree 递归分枝树 / addCard 叶片卡 / 树皮与草地纹理，js/campus-look.js（EcoLook）的
 * Preetham 天空、IBL、阴影、ACES 色调映射与后期、材质补丁（积雪 / 湿润 / 秋色 / 叶片透光 / 风动）。
 * 本文件不改动任何共享脚本；需要扩展的部分（立面纹理、地面多材质混合、灌木 / 绿篱原型等）复制到这里再扩展。
 *
 * 坐标：与 campus_layout.json、全景页相同——官方平面图像素 (px, py) → 世界 x = (px − 1024) × 0.4 米，z = (py − 999) × 0.4 米，
 *       x 向东、z 向南、y 向上；1 平面图像素 = 0.4 米，场景为真实尺度（米）。
 * 依赖：THREE r160、pond-style-core.js、campus-look.js（EcoLook，用于 patch / depth）。导出 window.ZKWorld。
 */
(function (global) {
  "use strict";
  const THREE = global.THREE;
  const V3 = THREE.Vector3;
  const S = 0.4, CX = 1024, CY = 999;
  const W = (px, py) => [(px - CX) * S, (py - CY) * S];
  const toPx = (x, z) => [x / S + CX, z / S + CY];

  // ---------------------------------------------------------------- 几何工具
  function inPoly(x, z, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i][0], zi = poly[i][1], xj = poly[j][0], zj = poly[j][1];
      if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi + 1e-12) + xi) inside = !inside;
    }
    return inside;
  }
  function segDist(x, z, a, b) {
    const dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / l2));
    return Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t);
  }
  function polyDist(x, z, poly, closed) {
    let d = Infinity;
    const n = poly.length, m = closed === false ? n - 1 : n;
    for (let i = 0; i < m; i++) d = Math.min(d, segDist(x, z, poly[i], poly[(i + 1) % n]));
    return d;
  }
  function area(poly) { let a = 0; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) a += (poly[j][0] + poly[i][0]) * (poly[j][1] - poly[i][1]); return a / 2; }
  // 多边形内缩（世界坐标，斜接；用于女儿墙、花池压顶）
  function offsetPoly(poly, d) {
    const n = poly.length, out = [];
    const sgn = area(poly) > 0 ? 1 : -1;
    for (let i = 0; i < n; i++) {
      const p0 = poly[(i - 1 + n) % n], p1 = poly[i], p2 = poly[(i + 1) % n];
      const e1 = norm2([p1[0] - p0[0], p1[1] - p0[1]]), e2 = norm2([p2[0] - p1[0], p2[1] - p1[1]]);
      const n1 = [-e1[1] * sgn, e1[0] * sgn], n2 = [-e2[1] * sgn, e2[0] * sgn];
      const m = norm2([n1[0] + n2[0], n1[1] + n2[1]]);
      const k = d / Math.max(0.3, m[0] * n1[0] + m[1] * n1[1]);
      out.push([p1[0] - m[0] * k, p1[1] - m[1] * k]);
    }
    return out;
  }
  function norm2(v) { const l = Math.hypot(v[0], v[1]) || 1; return [v[0] / l, v[1] / l]; }
  function centroid(poly) { let x = 0, z = 0; poly.forEach((p) => { x += p[0]; z += p[1]; }); return [x / poly.length, z / poly.length]; }
  const pxPoly = (poly) => poly.map((p) => W(p[0], p[1]));
  function ellipsePoly(cx, cz, a, b, rot, n) {
    const out = [];
    for (let i = 0; i < (n || 48); i++) { const t = (i / (n || 48)) * Math.PI * 2, x = Math.cos(t) * a, z = Math.sin(t) * b; out.push([cx + x * Math.cos(rot) - z * Math.sin(rot), cz + x * Math.sin(rot) + z * Math.cos(rot)]); }
    return out;
  }
  // 沿世界坐标路径等距取点（返回 {x, z, dir:[dx,dz], nrm:[nx,nz]}）
  function along(path, step, offset, start) {
    const out = [];
    let carry = start != null ? start : step / 2;
    for (let i = 0; i < path.length - 1; i++) {
      const a = path[i], b = path[i + 1], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (len < 1e-6) continue;
      const dx = (b[0] - a[0]) / len, dz = (b[1] - a[1]) / len;
      let d = carry;
      for (; d <= len; d += step) out.push({ x: a[0] + dx * d - dz * (offset || 0), z: a[1] + dz * d + dx * (offset || 0), dir: [dx, dz], nrm: [-dz, dx] });
      carry = d - len;
    }
    return out;
  }
  function shapeOfW(poly, holes) {
    const s = new THREE.Shape();
    poly.forEach(([x, z], i) => (i ? s.lineTo(x, -z) : s.moveTo(x, -z)));
    (holes || []).forEach((h) => { const p = new THREE.Path(); h.forEach(([x, z], i) => (i ? p.lineTo(x, -z) : p.moveTo(x, -z))); s.holes.push(p); });
    return s;
  }

  // ---------------------------------------------------------------- 程序化表面纹理（与 campus-scene.js 同法，复制并扩展）
  const CT = {};
  function surfaceTextures() {
    if (CT.done) return CT;
    CT.asphalt = genSurface(256, (u, v, x, y) => {
      const n = fbm2P(u * 8, v * 8, 8, 4, 901) * 0.5 + 0.5, g = hash3i(x, y, 5, 902), g2 = hash3i(x >> 1, y >> 1, 6, 903);
      let c = mix3(srgbHex(0x2f3032), srgbHex(0x434446), n);
      if (g > 0.93) c = mix3(c, srgbHex(0x8c8a84), 0.7); else if (g2 > 0.9) c = mix3(c, srgbHex(0x55534f), 0.6);
      const crack = smoothstep(0.03, 0.0, Math.abs(fbm2P(u * 3, v * 3, 3, 4, 904))) * smoothstep(0.55, 0.7, n);
      c = mix3(c, srgbHex(0x18191a), crack * 0.7);
      return [c[0], c[1], c[2], g * 0.5 + n * 0.3 - crack * 0.4, 0.88];
    }, 4);
    CT.pavers = genSurface(512, (u, v) => {   // 600×300 花岗岩条石，错缝
      const bx = u * 8, by = v * 16, row = Math.floor(by), ox = (row % 2) * 0.5, cx = bx + ox, ix = Math.floor(cx);
      const fx = cx - ix, fy = by - row, id = hash3i(ix, row, 1, 911);
      const joint = smoothstep(0.0, 0.035, Math.min(fx, 1 - fx)) * smoothstep(0.0, 0.07, Math.min(fy, 1 - fy));
      const sp = hash3i(Math.floor(u * 512), Math.floor(v * 512), 7, 912), fine = fbm2P(u * 64, v * 64, 64, 2, 913) * 0.5 + 0.5;
      let c = mix3(srgbHex(0x8d8a84), srgbHex(0xaaa69d), id * 0.6 + fine * 0.4);
      if (sp > 0.92) c = mix3(c, srgbHex(0x45423f), 0.5); else if (sp < 0.05) c = mix3(c, srgbHex(0xd2cec6), 0.5);
      c = mix3(srgbHex(0x55524c), c, joint);
      return [c[0], c[1], c[2], joint * 0.8 + fine * 0.1 + id * 0.1, 0.8];
    }, 6);
    CT.slabs = genSurface(512, (u, v) => {   // 1.2 m 广场石板
      const bx = u * 4, by = v * 4, ix = Math.floor(bx), iy = Math.floor(by), fx = bx - ix, fy = by - iy, id = hash3i(ix, iy, 2, 921);
      const joint = smoothstep(0.0, 0.012, Math.min(fx, 1 - fx)) * smoothstep(0.0, 0.012, Math.min(fy, 1 - fy));
      const fine = fbm2P(u * 48, v * 48, 48, 3, 922) * 0.5 + 0.5, sp = hash3i(Math.floor(u * 512), Math.floor(v * 512), 9, 923);
      let c = mix3(srgbHex(0xa29e96), srgbHex(0xbab6ad), id * 0.5 + fine * 0.5);
      if (sp > 0.94) c = mix3(c, srgbHex(0x5d5a55), 0.45);
      c = mix3(srgbHex(0x6c6862), c, joint);
      return [c[0], c[1], c[2], joint * 0.85 + fine * 0.15, 0.72];
    }, 5);
    CT.brick = genSurface(512, (u, v) => {   // 人字纹红砖人行道（200×100 透水砖）
      const bx = u * 16, by = v * 32, row = Math.floor(by), cx = bx + (row % 2) * 0.5, ix = Math.floor(cx), fx = cx - ix, fy = by - row;
      const id = hash3i(ix, row, 3, 931), sp = hash3i(Math.floor(u * 512), Math.floor(v * 512), 4, 932);
      const joint = smoothstep(0.0, 0.05, Math.min(fx, 1 - fx)) * smoothstep(0.0, 0.1, Math.min(fy, 1 - fy));
      let c = mix3(srgbHex(0x8e4a3a), srgbHex(0xa9604a), id);
      if (id > 0.85) c = mix3(c, srgbHex(0x6c6058), 0.5);
      c = c.map((q) => q * (0.94 + 0.1 * sp));
      c = mix3(srgbHex(0x6a625a), c, joint);
      return [c[0], c[1], c[2], joint * 0.8 + sp * 0.2, 0.85];
    }, 5);
    CT.roof = genSurface(256, (u, v, x, y) => {   // 平屋面：混凝土找坡层 + 分仓缝 + 污渍
      const n = fbm2P(u * 4, v * 4, 4, 4, 961) * 0.5 + 0.5, f = hash3i(x, y, 2, 962), g = fbm2P(u * 32, v * 32, 32, 2, 963) * 0.5 + 0.5;
      const seam = Math.min(Math.abs(((u * 4) % 1) - 0.5), Math.abs(((v * 4) % 1) - 0.5)) > 0.485;
      let c = mix3(srgbHex(0x8e8f8f), srgbHex(0xa9aaa8), n * 0.6 + g * 0.25 + f * 0.15);
      c = mix3(c, srgbHex(0x6c6e6c), smoothstep(0.62, 0.8, n) * 0.5);
      if (seam) c = mix3(c, srgbHex(0x4c4d4c), 0.7);
      return [c[0], c[1], c[2], (seam ? 0 : 0.6) + g * 0.2, 0.9];
    }, 2);
    for (const k of ["asphalt", "pavers", "slabs", "brick", "roof"]) {
      for (const t of [CT[k].map, CT[k].normalMap]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = MAX_ANISO; t.needsUpdate = true; }
    }
    CT.done = true;
    return CT;
  }

  // ---------------------------------------------------------------- 建筑立面（复制自 campus-scene.js 并扩展：教学楼白色外廊、宿舍阳台、玻璃幕墙、商铺）
  const CELL_W = 4, CELL_H = 3.6, CELLS = 4, FACADE_PX = 1024;
  const STYLES = {
    teach: { wall: "brick", col: 0x9a4733, frame: 0xebe8e2, glass: 0x22303a, band: 0xe8e4dc },
    corridor: { wall: "brick", col: 0x9a4733, frame: 0xf2f0ea, glass: 0x2a3640, band: 0xf3f1ec, corridor: true },
    dorm: { wall: "brick", col: 0xa85a3c, frame: 0xf0ede6, glass: 0x2b3843, band: 0xc9c2b6, balcony: true },
    library: { wall: "brick", col: 0x96432f, frame: 0x6f767c, glass: 0x1f3546, band: 0xe0ddd6, big: true },
    glass: { wall: "render", col: 0xdfe3e6, frame: 0xb8c0c6, glass: 0x2f5866, band: 0xe9edef, big: true, curtain: true },
    white: { wall: "render", col: 0xe7e9eb, frame: 0x8b9298, glass: 0x2a4352, band: 0xf2f2f0, big: true },
    canteen: { wall: "brick", col: 0xa3533b, frame: 0xf2ece6, glass: 0x34424c, band: 0xe8e2d8 },
    shop: { wall: "render", col: 0xe2d6c4, frame: 0x6b5a4a, glass: 0x3c4a54, band: 0xf0e8da, shop: true },
    plain: { wall: "render", col: 0xd9d4cb, frame: 0x9a948a, glass: 0x3a4650, band: 0xe6e1d8, blank: true },
    brickplain: { wall: "brick", col: 0x9a4733, frame: 0x9a4733, glass: 0x9a4733, band: 0xd8d2c8, blank: true },
  };
  const FACADE_CACHE = {};
  function facadeTextures(styleName, rnd) {
    const st = STYLES[styleName] || STYLES.teach;
    const N = FACADE_PX, CP = N / CELLS;
    const alb = new Uint8Array(N * N * 4), H = new Float32Array(N * N);
    const okey = styleName;
    const needOrm = !FACADE_CACHE[okey];
    const orm = needOrm ? new Uint8Array((N / 2) * (N / 2) * 4) : null;
    const EN = 128, em = new Uint8Array(EN * EN * 4);
    const wallC = srgbHex(st.col), frameC = srgbHex(st.frame), glassC = srgbHex(st.glass), bandC = srgbHex(st.band);
    const W0 = st.curtain ? 0.0 : st.big ? 0.05 : st.shop ? 0.06 : st.corridor ? 0.12 : 0.2, W1 = 1 - W0;
    const H0 = st.curtain ? 0.06 : st.big ? 0.12 : st.shop ? 0.08 : st.corridor ? 0.32 : 0.3, H1 = st.curtain ? 0.97 : st.big ? 0.9 : st.shop ? 0.8 : 0.8;
    const FR = 0.022;
    const lit = [], warm = [];
    for (let j = 0; j < CELLS; j++) for (let i = 0; i < CELLS; i++) lit.push(rnd() < (st.shop ? 0.85 : 0.55) ? 0.6 + rnd() * 0.4 : 0);
    for (let k = 0; k < CELLS * CELLS; k++) warm.push(rnd() < 0.7);
    for (let y = 0; y < N; y++) {
      const cj = Math.floor(y / CP), fy = (y % CP) / CP;
      for (let x = 0; x < N; x++) {
        const ci = Math.floor(x / CP), fx = (x % CP) / CP;
        const i = (y * N + x) * 4;
        let c, h, rough, metal = 0;
        const blank = st.blank;
        const inWin = !blank && fx > W0 && fx < W1 && fy > H0 && fy < H1;
        const inFrame = !blank && fx > W0 - FR && fx < W1 + FR && fy > H0 - FR && fy < H1 + FR;
        const band = fy < (st.corridor ? 0.09 : st.curtain ? 0.035 : 0.055);
        if (band) {
          const n = hash3i(x, y, 3, 77) * 0.08;
          c = mix3(bandC, [255, 255, 255], n); h = 0.75; rough = 0.7;
        } else if (st.corridor && fy < 0.3) {          // 外廊白色栏板（教学楼的白色横向线条）
          const n = hash3i(x, y, 2, 13) * 0.05;
          c = mix3(bandC, [255, 255, 255], n); h = 0.9; rough = 0.75;
        } else if (inWin) {
          const mull = st.curtain ? Math.abs(((fx * 2) % 1) - 0.5) > 0.47 : st.big ? Math.abs(((fx - W0) / (W1 - W0)) * 3 % 1 - 0.5) > 0.485 : Math.abs(fx - 0.5) < 0.012;
          const tran = st.curtain ? false : Math.abs(fy - (st.big ? 0.66 : 0.64)) < 0.012;
          if (mull || tran) { c = frameC; h = 0.45; rough = 0.35; metal = 0.6; }
          else {
            const refl = smoothstep(0.0, 1.0, (fy - H0) / (H1 - H0)) * 0.25;
            const curtain = !st.big && hash3i(ci, cj, 5, 44) > 0.55 && fy > H1 - 0.12 - 0.25 * hash3i(ci, cj, 6, 45);
            c = curtain ? mix3([200, 196, 186], glassC, 0.35) : mix3(glassC, [120, 150, 170], refl);
            h = 0.25; rough = curtain ? 0.6 : 0.06; metal = curtain ? 0 : 0.35;
          }
        } else if (inFrame) { c = frameC; h = 0.6; rough = 0.4; metal = 0.5; }
        else if (st.balcony && fy < 0.3 && fx > 0.12 && fx < 0.88) {
          const n = hash3i(x, y, 2, 13) * 0.06;
          c = mix3([238, 234, 226], [255, 255, 255], n); h = 0.85; rough = 0.75;
        } else if (st.wall === "brick") {
          const by = (cj * CELL_H + fy * CELL_H) / 0.063, row = Math.floor(by), fyy = by - row;
          const bx = (ci * CELL_W + fx * CELL_W) / 0.25 + (row % 2) * 0.5, col = Math.floor(bx), fxx = bx - col;
          const mortar = fyy < 0.16 || fxx < 0.05;
          const id = hash3i(col, row, 1, 31), sp = hash3i(x, y, 9, 32);
          if (mortar) { c = mix3([128, 120, 110], [104, 98, 90], sp); h = 0.0; rough = 0.95; }
          else { c = wallC.map((q) => q * (0.78 + 0.32 * id) * (0.94 + 0.12 * sp)); if (id > 0.93) c = mix3(c, [70, 40, 32], 0.4); h = 0.55 + 0.1 * sp; rough = 0.85; }
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
        const o = (y * EN + x) * 4, k = cj * CELLS + ci, L = st.blank ? 0 : lit[k];
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
    for (const t of [map, emissiveMap, shared.normalMap, shared.ormMap]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1 / (CELL_W * CELLS), 1 / (CELL_H * CELLS)); t.needsUpdate = true; }
    return { map, emissiveMap, normalMap: shared.normalMap, ormMap: shared.ormMap };
  }
  // ExtrudeGeometry UV：墙面 u = 沿墙距离（米），v = 高度（米）；顶面 = 平面坐标
  const UVGEN = {
    generateTopUV(g, v, a, b, c) { return [new THREE.Vector2(v[a * 3], v[a * 3 + 1]), new THREE.Vector2(v[b * 3], v[b * 3 + 1]), new THREE.Vector2(v[c * 3], v[c * 3 + 1])]; },
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
  function toNonIndexed(g) { return g.index ? g.toNonIndexed() : g; }
  function mergeNI(list) {   // 合并非索引几何（position / normal / uv）
    const geos = list.map(toNonIndexed);
    let n = 0; geos.forEach((g) => (n += g.attributes.position.count));
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2);
    let o = 0;
    geos.forEach((g) => {
      const c = g.attributes.position.count;
      pos.set(g.attributes.position.array, o * 3);
      if (!g.attributes.normal) g.computeVertexNormals();
      nor.set(g.attributes.normal.array, o * 3);
      if (g.attributes.uv) uv.set(g.attributes.uv.array, o * 2);
      o += c;
    });
    const out = new THREE.BufferGeometry();
    out.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    out.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
    out.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    return out;
  }
  // 文字招牌（中文店招 / 楼名），canvas 贴图
  function signTex(text, o) {
    o = o || {};
    const w = o.w || 512, h = o.h || 96, cv = makeCanvas(w, h), g = cv.getContext("2d");
    g.fillStyle = o.bg || "#b3261e"; g.fillRect(0, 0, w, h);
    if (o.border) { g.strokeStyle = o.border; g.lineWidth = 6; g.strokeRect(3, 3, w - 6, h - 6); }
    g.fillStyle = o.fg || "#fff4d8";
    g.font = "bold " + Math.round(h * 0.56) + "px 'PingFang SC','Microsoft YaHei','Noto Sans CJK SC','WenQuanYi Zen Hei',sans-serif";
    g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText(text, w / 2, h / 2 + 2, w - 20);
    return canvasTex(cv, true);
  }

  // ================================================================ create
  /**
   * opts: { scene, renderer, look, region: [px0, py0, px1, py1]（地面混合贴图范围，平面图像素）, res（米 / 像素，默认 0.25）, seed }
   */
  function create(opts) {
    const scene = opts.scene, renderer = opts.renderer, look = opts.look;
    const patch = look.patch, depth = look.depth, U = look.U;
    let seed = opts.seed || 4242;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const T = surfaceTextures();
    const std = (p, o) => patch(new THREE.MeshStandardMaterial(p), o || { key: "zk-std" });
    const nightMats = [];

    // ---------------------------------------------------------------- 地面：多材质混合（splat）
    // 类别（独热编码，两张 RGBA）：0 草地 · 1 花岗岩条石步道 · 2 沥青 · 3 广场石板 · 4 红砖人行道 · 5 塑胶球场 · 6 种植土 / 树池 · 7 广场拼花
    const CLS = { grass: 0, pavers: 1, asphalt: 2, slabs: 3, brick: 4, court: 5, soil: 6, mosaic: 7 };
    const reg = opts.region;
    const [gx0, gz0] = W(reg[0], reg[1]), [gx1, gz1] = W(reg[2], reg[3]);
    const RES = opts.res || 0.25;
    const GW = Math.ceil((gx1 - gx0) / RES), GH = Math.ceil((gz1 - gz0) / RES);
    const cvs = [makeCanvas(GW, GH), makeCanvas(GW, GH)], ctx = cvs.map((c) => c.getContext("2d"));
    ctx.forEach((g, i) => { g.fillStyle = i === 0 ? "rgb(255,0,0)" : "rgb(0,0,0)"; g.fillRect(0, 0, GW, GH); });
    if (ctx[1]) { ctx[1].globalAlpha = 1; }
    // canvas 不能写 alpha 通道的独热值（预乘会丢色），所以每张用 RGB 三通道 + 第三张？——改为 3 张 RGB：类 0-2 / 3-5 / 6-7
    cvs.push(makeCanvas(GW, GH)); ctx.push(cvs[2].getContext("2d")); ctx[2].fillStyle = "rgb(0,0,0)"; ctx[2].fillRect(0, 0, GW, GH);
    const CH = ["rgb(255,0,0)", "rgb(0,255,0)", "rgb(0,0,255)"];
    const gxy = (x, z) => [(x - gx0) / RES, (z - gz0) / RES];
    function paintWith(cls, drawFn) {
      const k = Math.floor(cls / 3), c = cls % 3;
      ctx.forEach((g, i) => { g.save(); g.fillStyle = i === k ? CH[c] : "rgb(0,0,0)"; g.strokeStyle = g.fillStyle; drawFn(g); g.restore(); });
    }
    function paintPoly(cls, polyW) {
      paintWith(cls, (g) => { g.beginPath(); polyW.forEach(([x, z], i) => { const [u, v] = gxy(x, z); i ? g.lineTo(u, v) : g.moveTo(u, v); }); g.closePath(); g.fill(); });
    }
    function paintPath(cls, pathW, widthM, round) {
      paintWith(cls, (g) => {
        g.lineWidth = widthM / RES; g.lineJoin = "round"; g.lineCap = round === false ? "butt" : "round";
        g.beginPath(); pathW.forEach(([x, z], i) => { const [u, v] = gxy(x, z); i ? g.lineTo(u, v) : g.moveTo(u, v); }); g.stroke();
      });
    }
    function paintCircle(cls, x, z, r) { paintWith(cls, (g) => { const [u, v] = gxy(x, z); g.beginPath(); g.arc(u, v, r / RES, 0, Math.PI * 2); g.fill(); }); }
    let classData = null;
    function bakeClasses() {
      const ds = ctx.map((g) => g.getImageData(0, 0, GW, GH).data);
      classData = new Uint8Array(GW * GH);
      for (let i = 0; i < GW * GH; i++) {
        let best = 0, bv = -1;
        for (let k = 0; k < 3; k++) for (let c = 0; c < 3; c++) { const v = ds[k][i * 4 + c]; if (v > bv) { bv = v; best = k * 3 + c; } }
        classData[i] = best;
      }
    }
    const CLS_NAMES = ["grass", "pavers", "asphalt", "slabs", "brick", "court", "soil", "mosaic"];
    function classAt(x, z) {
      if (!classData) return "grass";
      const u = Math.floor((x - gx0) / RES), v = Math.floor((z - gz0) / RES);
      if (u < 0 || v < 0 || u >= GW || v >= GH) return "out";
      return CLS_NAMES[classData[v * GW + u]] || "grass";
    }
    const groundU = {
      tSp0: { value: null }, tSp1: { value: null }, tSp2: { value: null },
      uSpO: { value: new THREE.Vector2(gx0, gz0) }, uSpS: { value: new THREE.Vector2(gx1 - gx0, gz1 - gz0) },
      tG: { value: TEX.ground.map }, tGn: { value: TEX.ground.normalMap },
      tP: { value: T.pavers.map }, tPn: { value: T.pavers.normalMap },
      tA: { value: T.asphalt.map }, tS: { value: T.slabs.map }, tSn: { value: T.slabs.normalMap },
      tB: { value: T.brick.map }, tBn: { value: T.brick.normalMap },
      uMosRot: { value: opts.mosaicRot || 0 }, uMosO: { value: new THREE.Vector2(0, 0) },
    };
    for (const t of [TEX.ground.map, TEX.ground.normalMap]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.needsUpdate = true; }
    const GROUND_PARS = /* glsl */`
uniform sampler2D tSp0; uniform sampler2D tSp1; uniform sampler2D tSp2; uniform vec2 uSpO; uniform vec2 uSpS;
uniform sampler2D tG; uniform sampler2D tGn; uniform sampler2D tP; uniform sampler2D tPn; uniform sampler2D tA;
uniform sampler2D tS; uniform sampler2D tSn; uniform sampler2D tB; uniform sampler2D tBn; uniform float uMosRot; uniform vec2 uMosO;
float zkRough = 0.9; vec3 zkW0; vec3 zkW1; vec3 zkW2;
`;
    const GROUND_MAP = /* glsl */`
{
  vec2 suv = (vUwPos.xz - uSpO) / uSpS;
  zkW0 = texture2D(tSp0, suv).rgb; zkW1 = texture2D(tSp1, suv).rgb; zkW2 = texture2D(tSp2, suv).rgb;
  float ws = dot(zkW0, vec3(1.0)) + dot(zkW1, vec3(1.0)) + zkW2.r + zkW2.g;
  if (suv.x < 0.0 || suv.y < 0.0 || suv.x > 1.0 || suv.y > 1.0 || ws < 0.01) { zkW0 = vec3(1.0, 0.0, 0.0); zkW1 = vec3(0.0); zkW2 = vec3(0.0); ws = 1.0; }
  zkW0 /= ws; zkW1 /= ws; zkW2 /= ws;
  vec2 p = vUwPos.xz;
  vec3 cG = texture2D(tG, p / 3.2).rgb * mix(0.82, 1.08, wxn(p * 0.06)) * vec3(0.92, 1.0, 0.86);
  vec3 cP = texture2D(tP, p / 4.8).rgb;
  vec3 cA = texture2D(tA, p / 5.0).rgb;
  vec3 cS = texture2D(tS, p / 4.8).rgb;
  vec3 cB = texture2D(tB, p / 3.2).rgb;
  vec3 cC = vec3(0.42, 0.11, 0.075) * (0.9 + 0.2 * wxn(p * 3.0));
  vec3 cD = vec3(0.16, 0.11, 0.075) * (0.8 + 0.4 * wxn(p * 2.3)) + cG * 0.15;
  // 光华广场拼花：沿广场轴线 7.2 m 大格，格内浅灰 / 米黄相间，格线为铁锈红条石
  float cr = cos(uMosRot), sr = sin(uMosRot);
  vec2 q = vec2(cr * (p.x - uMosO.x) + sr * (p.y - uMosO.y), -sr * (p.x - uMosO.x) + cr * (p.y - uMosO.y));
  vec2 cell = floor(q / 7.2), f = fract(q / 7.2);
  float border = 1.0 - smoothstep(0.035, 0.05, min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y)));
  float alt = mod(cell.x + cell.y, 2.0);
  vec2 f2 = abs(f - 0.5);
  float inner = step(max(f2.x, f2.y), 0.22) * (1.0 - alt);
  vec3 cM = cS * mix(vec3(1.0), vec3(1.07, 0.98, 0.84), alt);
  cM = mix(cM, cS * vec3(0.82, 0.62, 0.5), inner * 0.8);
  cM = mix(cM, vec3(0.32, 0.2, 0.15) * (0.8 + 0.4 * cS.r), border);
  vec3 col = cG * zkW0.r + cP * zkW0.g + cA * zkW0.b + cS * zkW1.r + cB * zkW1.g + cC * zkW1.b + cD * zkW2.r + cM * zkW2.g;
  diffuseColor.rgb = col;
  zkRough = 0.95 * zkW0.r + 0.8 * zkW0.g + 0.86 * zkW0.b + 0.72 * zkW1.r + 0.84 * zkW1.g + 0.7 * zkW1.b + 0.98 * zkW2.r + 0.7 * zkW2.g;
}
`;
    const GROUND_NORMAL = /* glsl */`
{
  vec2 p = vUwPos.xz;
  vec3 nG = texture2D(tGn, p / 3.2).xyz * 2.0 - 1.0;
  vec3 nP = texture2D(tPn, p / 4.8).xyz * 2.0 - 1.0;
  vec3 nS = texture2D(tSn, p / 4.8).xyz * 2.0 - 1.0;
  vec3 nB = texture2D(tBn, p / 3.2).xyz * 2.0 - 1.0;
  vec3 nn = nG * zkW0.r + nP * zkW0.g + nS * (zkW1.r + zkW2.g) + nB * zkW1.g + vec3(0.0, 0.0, 1.0) * (zkW0.b + zkW1.b + zkW2.r);
  vec3 wn = normalize(vec3(nn.x * 0.8, max(nn.z, 0.2), nn.y * 0.8));
  normal = normalize((viewMatrix * vec4(wn, 0.0)).xyz);
}
`;
    const groundMat = std({ color: 0xffffff, roughness: 0.9, metalness: 0, envMapIntensity: 0.6 },
      { key: "zk-ground", uniforms: groundU, fsPars: GROUND_PARS, fsMap: GROUND_MAP, fsNormal: GROUND_NORMAL });
    {
      const ob = groundMat.onBeforeCompile;
      groundMat.onBeforeCompile = (sh) => { ob(sh); sh.fragmentShader = sh.fragmentShader.replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\nroughnessFactor = zkRough;"); };
    }
    function finishGround() {
      bakeClasses();
      const tx = cvs.map((c) => { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.NoColorSpace; t.minFilter = THREE.LinearFilter; t.magFilter = THREE.LinearFilter; t.generateMipmaps = false; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; return t; });
      groundU.tSp0.value = tx[0]; groundU.tSp1.value = tx[1]; groundU.tSp2.value = tx[2];
      // 近处地面：区域 + 外扩 600 米；外圈只有草地（着色器在区域外退回草地）
      const g = new THREE.PlaneGeometry(gx1 - gx0 + 1200, gz1 - gz0 + 1200, 1, 1).rotateX(-Math.PI / 2);
      const m = new THREE.Mesh(g, groundMat);
      m.position.set((gx0 + gx1) / 2, 0, (gz0 + gz1) / 2);
      m.receiveShadow = true;
      scene.add(m);
      return m;
    }

    // ---------------------------------------------------------------- 贴地装饰（车道线、球场线、停车位）
    const decalMat = new THREE.MeshStandardMaterial({ color: 0xf2f2ee, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const yellowMat = new THREE.MeshStandardMaterial({ color: 0xe7c23a, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const DECALS = { white: [], yellow: [] };
    function decalLine(a, b, w, color, dash) {
      const dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz); if (len < 0.01) return;
      const ang = Math.atan2(dz, dx);
      const segs = dash ? Math.floor(len / (dash[0] + dash[1])) : 1;
      for (let i = 0; i < segs; i++) {
        const s0 = dash ? i * (dash[0] + dash[1]) : 0, sl = dash ? dash[0] : len;
        const g = new THREE.PlaneGeometry(sl, w).rotateX(-Math.PI / 2).rotateY(-ang);
        const cxm = a[0] + (dx / len) * (s0 + sl / 2), czm = a[1] + (dz / len) * (s0 + sl / 2);
        g.translate(cxm, 0.03, czm);
        DECALS[color || "white"].push(g);
      }
    }
    function decalRect(cx, cz, w, d, ang, lw, color) {   // 矩形框（球场边线、停车位）
      const c = Math.cos(ang), s = Math.sin(ang);
      const P = (u, v) => [cx + u * c - v * s, cz + u * s + v * c];
      const q = [P(-w / 2, -d / 2), P(w / 2, -d / 2), P(w / 2, d / 2), P(-w / 2, d / 2)];
      for (let i = 0; i < 4; i++) decalLine(q[i], q[(i + 1) % 4], lw, color);
    }
    function finishDecals() {
      if (DECALS.white.length) { const m = new THREE.Mesh(mergeNI(DECALS.white), decalMat); m.receiveShadow = true; scene.add(m); }
      if (DECALS.yellow.length) { const m = new THREE.Mesh(mergeNI(DECALS.yellow), yellowMat); m.receiveShadow = true; scene.add(m); }
    }

    // ---------------------------------------------------------------- 建筑
    const roofT = { map: T.roof.map.clone(), normalMap: T.roof.normalMap.clone() };
    for (const t of [roofT.map, roofT.normalMap]) { t.repeat.set(1 / 12, 1 / 12); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.needsUpdate = true; }
    const roofMat = std({ map: roofT.map, normalMap: roofT.normalMap, roughness: 0.9, color: 0xffffff }, { key: "zk-roof", macro: { scale: 0.05, amp: 0.12 } });
    const copingMat = std({ color: 0xd9d6cf, roughness: 0.8 }, { key: "zk-coping" });
    const wallMats = {};
    function wallMat(style) {
      if (!wallMats[style]) {
        const ft = facadeTextures(style, rnd);
        const m = std({ map: ft.map, normalMap: ft.normalMap, normalScale: new THREE.Vector2(1, 1), roughnessMap: ft.ormMap, metalnessMap: ft.ormMap,
          roughness: 1, metalness: 1, emissiveMap: ft.emissiveMap, emissive: new THREE.Color(1, 1, 1), emissiveIntensity: 0, envMapIntensity: 1.0 },
        { key: "zk-wall", plinth: true });
        wallMats[style] = m; nightMats.push(m);
      }
      return wallMats[style];
    }
    const GROUPS = {};             // style -> { walls: [] }
    const ROOFS = [], COPING = [];
    const FOOTPRINTS = [];         // { poly(world), h, id, name }
    const LABELS = [];             // { id, name, pos: V3, cat }
    function addExtrude(polyW, h, y0, style, holes, roofOn) {
      const shape = shapeOfW(polyW, holes);
      const g = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false, curveSegments: 32, UVGenerator: UVGEN });
      g.rotateX(-Math.PI / 2); g.translate(0, y0, 0);
      const G = GROUPS[style] || (GROUPS[style] = { walls: [] });
      for (const gr of g.groups) {
        if (gr.materialIndex === 0) { if (roofOn !== false) { const sg = subGeo(g, gr.start, gr.count); if (sg.attributes.position.array[1] > y0 + h - 0.01 || true) ROOFS.push(sg); } }
        else G.walls.push(subGeo(g, gr.start, gr.count));
      }
    }
    // 去掉底面：ExtrudeGeometry 的 group 0 同时包含顶面与底面；底面在地下，看不到，保留无妨
    function parapet(polyW, y, hgt, thick, holes) {
      const t = thick || 0.35;
      const rings = [[polyW, offsetPoly(polyW, t)]].concat((holes || []).map((h) => [offsetPoly(h, -t), h]));
      for (const [outer, inner] of rings) {
        const g = new THREE.ExtrudeGeometry(shapeOfW(outer, [inner]), { depth: hgt, bevelEnabled: false, curveSegments: 32, UVGenerator: UVGEN });
        g.rotateX(-Math.PI / 2); g.translate(0, y, 0);
        COPING.push(g);
      }
    }
    /**
     * 建筑：def = { id, name, cat, poly（平面图像素）| polyW（世界）| circle:{c:[px,py], r（像素）} | ellipse:{c, a, b（米）, rot}, holes（像素）,
     *              h（米）, y0, style, parapet（女儿墙高，默认 0.9；0 不要）, roof（false 不封顶）, label（true / 文字）, labelY }
     */
    function building(def) {
      let polyW = def.polyW || (def.poly ? pxPoly(def.poly) : null);
      if (def.circle) { const [x, z] = W(def.circle.c[0], def.circle.c[1]); polyW = ellipsePoly(x, z, def.circle.r * S, def.circle.r * S, 0, 48); }
      if (def.circleW) polyW = ellipsePoly(def.circleW.c[0], def.circleW.c[1], def.circleW.r, def.circleW.r, 0, 48);
      if (def.ellipse) { const e = def.ellipse; polyW = ellipsePoly(e.c[0], e.c[1], e.a, e.b, e.rot || 0, 56); }
      if (area(polyW) < 0) polyW = polyW.slice().reverse();
      const holes = (def.holesW || (def.holes || []).map(pxPoly)).map((h) => (area(h) > 0 ? h.slice().reverse() : h));
      const y0 = def.y0 || 0, h = def.h;
      addExtrude(polyW, h, y0, def.style || "teach", holes, def.roof);
      const pp = def.parapet != null ? def.parapet : 0.9;
      if (pp > 0) parapet(polyW, y0 + h, pp, def.parapetThick || 0.32, holes);
      if (!def.noFoot) FOOTPRINTS.push({ poly: polyW, h: y0 + h, id: def.id, holes });
      if (def.label) {
        const c = centroid(polyW);
        LABELS.push({ id: def.id, name: typeof def.label === "string" ? def.label : def.name, pos: new V3(c[0], y0 + h + (def.labelY || 4), c[1]), cat: def.cat || "" });
      }
      return polyW;
    }
    // 屋顶构筑物：楼梯间、水箱、空调外机
    const BOXES = [];   // { geo, mat }
    const acMat = std({ color: 0xc9cdd0, roughness: 0.5, metalness: 0.4 }, { key: "zk-ac" });
    const darkMetal = std({ color: 0x3b4044, roughness: 0.45, metalness: 0.7 }, { key: "zk-darkmetal" });
    function box(cx, cz, w, d, h, y0, ang, mat, list) {
      const g = new THREE.BoxGeometry(w, h, d).rotateY(-ang || 0).translate(cx, y0 + h / 2, cz);
      (list || BOXES).push({ g, mat });
    }
    function acUnits(cx, cz, n, y0, ang) {
      for (let i = 0; i < n; i++) {
        const u = (i - (n - 1) / 2) * 1.6, c = Math.cos(ang || 0), s = Math.sin(ang || 0);
        box(cx + u * c, cz + u * s, 1.2, 0.8, 0.9, y0, ang, acMat);
      }
    }
    function finishBuildings() {
      Object.keys(GROUPS).forEach((style) => {
        const G = GROUPS[style]; if (!G.walls.length) return;
        const m = new THREE.Mesh(mergeNI(G.walls), wallMat(style));
        m.castShadow = true; m.receiveShadow = true; scene.add(m);
      });
      if (ROOFS.length) { const m = new THREE.Mesh(mergeNI(ROOFS), roofMat); m.castShadow = true; m.receiveShadow = true; scene.add(m); }
      if (COPING.length) { const m = new THREE.Mesh(mergeNI(COPING), copingMat); m.castShadow = true; m.receiveShadow = true; scene.add(m); }
      const byMat = new Map();
      BOXES.forEach((b) => { if (!byMat.has(b.mat)) byMat.set(b.mat, []); byMat.get(b.mat).push(b.g); });
      byMat.forEach((list, mat) => { const m = new THREE.Mesh(mergeNI(list), mat); m.castShadow = true; m.receiveShadow = true; scene.add(m); });
    }
    function buildingAt(x, z, margin) {
      for (const f of FOOTPRINTS) {
        if (inPoly(x, z, f.poly) && !f.holes.some((h) => inPoly(x, z, h))) return f;
        if (margin && polyDist(x, z, f.poly) < margin) return f;
      }
      return null;
    }

    // ---------------------------------------------------------------- 一般网格（合批）
    const MESHES = new Map();   // material -> [geo]
    function addGeo(geo, mat) { if (!MESHES.has(mat)) MESHES.set(mat, []); MESHES.get(mat).push(geo); }
    function finishMeshes() {
      MESHES.forEach((list, mat) => {
        const m = new THREE.Mesh(mergeNI(list), mat);
        m.castShadow = !mat.userData.noShadow; m.receiveShadow = true;
        if (mat.userData.noReflect) look.noReflect.push(m);
        scene.add(m);
      });
    }
    // 常用材质
    const graniteT = (() => { const m = TEX.granite.map.clone(), n = TEX.granite.normalMap.clone(); [m, n].forEach((t) => { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(0.5, 0.5); t.needsUpdate = true; }); return { map: m, normalMap: n }; })();
    const MAT = {
      granite: std({ map: graniteT.map, normalMap: graniteT.normalMap, color: 0xd8d4cc, roughness: 0.75 }, { key: "zk-granite" }),
      darkGranite: std({ map: graniteT.map, normalMap: graniteT.normalMap, color: 0x4a4a4c, roughness: 0.4 }, { key: "zk-dgranite" }),
      white: std({ color: 0xf1f0ec, roughness: 0.6 }, { key: "zk-white" }),
      steelWhite: std({ color: 0xeef0f0, roughness: 0.35, metalness: 0.6 }, { key: "zk-steelwhite" }),
      metal: darkMetal,
      glassTeal: (() => { const m = std({ color: 0x5fb4b8, roughness: 0.08, metalness: 0.2, transparent: true, opacity: 0.62, envMapIntensity: 1.3, side: THREE.DoubleSide, depthWrite: false }, { key: "zk-glassteal", noWeather: true }); m.userData.noShadow = true; return m; })(),
      wood: std({ map: TEX.wood ? TEX.wood.map : null, color: 0xb98a5c, roughness: 0.7 }, { key: "zk-wood" }),
      red: std({ color: 0xa61f26, roughness: 0.35, metalness: 0.1 }, { key: "zk-red" }),
      board: std({ color: 0x2f4f6f, roughness: 0.5 }, { key: "zk-board" }),
      rubber: std({ color: 0x6b5b4a, roughness: 0.9 }, { key: "zk-rubber" }),
      fence: (() => { const cv = makeCanvas(64, 64), g = cv.getContext("2d"); g.clearRect(0, 0, 64, 64); g.strokeStyle = "rgba(40,80,60,1)"; g.lineWidth = 3; for (let i = -64; i < 128; i += 16) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 64, 64); g.stroke(); g.beginPath(); g.moveTo(i + 64, 0); g.lineTo(i, 64); g.stroke(); } const t = canvasTex(cv, true); t.wrapS = t.wrapT = THREE.RepeatWrapping; const m = std({ map: t, color: 0x6aa080, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.6, metalness: 0.3 }, { key: "zk-fence", noWeather: true }); m.userData.noShadow = true; return m; })(),
    };
    // 台阶 / 平台：沿方向 dir（单位向量）向前逐级升高；center 为第一级前沿中点
    function steps(cx, cz, dir, width, n, rise, tread, y0) {
      const ang = Math.atan2(dir[1], dir[0]);
      for (let i = 0; i < n; i++) {
        const d = tread * (i + 0.5), x = cx + dir[0] * d, z = cz + dir[1] * d, hgt = (y0 || 0) + rise * (i + 1);
        const g = new THREE.BoxGeometry(tread, hgt, width).rotateY(-ang).translate(x, hgt / 2, z);
        addGeo(g, MAT.granite);
      }
    }
    // 平台（抬高的地面块），顶面用地面材质的一种：草 / 石板
    const lawnTopMat = std({ map: TEX.ground.map, normalMap: TEX.ground.normalMap, color: 0xe6f0d8, roughness: 0.95 }, { key: "zk-lawntop", macro: { scale: 0.08, amp: 0.15 } });
    const slabTopT = { map: T.slabs.map.clone(), normalMap: T.slabs.normalMap.clone() };
    [slabTopT.map, slabTopT.normalMap].forEach((t) => { t.repeat.set(1 / 4.8, 1 / 4.8); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.needsUpdate = true; });
    const slabTopMat = std({ map: slabTopT.map, normalMap: slabTopT.normalMap, roughness: 0.75 }, { key: "zk-slabtop" });
    {
      const tM = TEX.ground.map.clone(), tN = TEX.ground.normalMap.clone();
      [tM, tN].forEach((t) => { t.repeat.set(1 / 3.2, 1 / 3.2); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.needsUpdate = true; });
      lawnTopMat.map = tM; lawnTopMat.normalMap = tN;
    }
    const PLATFORMS = [];   // { poly, y } 用于地表高度
    function platform(polyW, hgt, top, sideMat) {
      if (area(polyW) < 0) polyW = polyW.slice().reverse();
      const shape = shapeOfW(polyW);
      const g = new THREE.ExtrudeGeometry(shape, { depth: hgt, bevelEnabled: false, curveSegments: 24, UVGenerator: UVGEN });
      g.rotateX(-Math.PI / 2);
      for (const gr of g.groups) addGeo(subGeo(g, gr.start, gr.count), gr.materialIndex === 0 ? (top === "lawn" ? lawnTopMat : top === "slab" ? slabTopMat : top || slabTopMat) : (sideMat || MAT.granite));
      PLATFORMS.push({ poly: polyW, y: hgt });
    }
    function groundY(x, z) {
      let y = 0;
      for (const p of PLATFORMS) if (inPoly(x, z, p.poly)) y = Math.max(y, p.y);
      return y;
    }
    // 路缘石：沿路径两侧的浅色窄条
    function kerbs(pathW, widthM) {
      for (const side of [-1, 1]) {
        const pts = [];
        for (let i = 0; i < pathW.length; i++) {
          const a = pathW[Math.max(0, i - 1)], b = pathW[Math.min(pathW.length - 1, i + 1)];
          const n = norm2([-(b[1] - a[1]), b[0] - a[0]]);
          pts.push([pathW[i][0] + n[0] * side * widthM / 2, pathW[i][1] + n[1] * side * widthM / 2]);
        }
        for (let i = 0; i < pts.length - 1; i++) {
          const a = pts[i], b = pts[i + 1], len = Math.hypot(b[0] - a[0], b[1] - a[1]); if (len < 0.1) continue;
          const g = new THREE.BoxGeometry(len + 0.2, 0.14, 0.25).rotateY(-Math.atan2(b[1] - a[1], b[0] - a[0])).translate((a[0] + b[0]) / 2, 0.07, (a[1] + b[1]) / 2);
          addGeo(g, MAT.granite);
        }
      }
    }
    // 道路（沥青 + 路缘石 + 中心虚线）
    function road(pathPx, widthPx, o) {
      o = o || {};
      const pw = pathPx.map((p) => W(p[0], p[1]));
      const w = widthPx * S;
      paintPath(o.cls != null ? o.cls : CLS.asphalt, pw, w, o.round);
      if (o.kerb !== false) kerbs(pw, w);
      if (o.centerLine) for (let i = 0; i < pw.length - 1; i++) decalLine(pw[i], pw[i + 1], 0.15, o.centerLine === "yellow" ? "yellow" : "white", [3, 4]);
      if (o.edgeLines) for (const side of [-1, 1]) for (let i = 0; i < pw.length - 1; i++) {
        const a = pw[i], b = pw[i + 1], n = norm2([-(b[1] - a[1]), b[0] - a[0]]), k = side * (w / 2 - 0.5);
        decalLine([a[0] + n[0] * k, a[1] + n[1] * k], [b[0] + n[0] * k, b[1] + n[1] * k], 0.15, "white");
      }
      return pw;
    }

    // ---------------------------------------------------------------- 路灯（夜间亮起）
    const LAMPS = [];
    function lamp(x, z, kind) { LAMPS.push({ x, z, y: groundY(x, z), kind: kind || "street" }); }
    let lampSys = null;
    function finishLamps() {
      const n = Math.max(1, LAMPS.length);
      const poleGeo = mergeGeos([
        new THREE.CylinderGeometry(0.22, 0.26, 0.3, 10).translate(0, 0.15, 0),
        new THREE.CylinderGeometry(0.07, 0.1, 4.4, 8).translate(0, 2.5, 0),
        new THREE.CylinderGeometry(0.32, 0.1, 0.16, 12).translate(0, 4.75, 0),
        new THREE.CylinderGeometry(0.4, 0.4, 0.06, 14).translate(0, 5.42, 0),
        new THREE.ConeGeometry(0.4, 0.26, 14).translate(0, 5.58, 0),
      ]);
      const poles = new THREE.InstancedMesh(poleGeo, darkMetal, n);
      const bulbMat = new THREE.MeshBasicMaterial({ color: 0x555a60 });
      const bulbs = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.3, 0.26, 0.55, 12), bulbMat, n);
      const glowTex = (() => {
        const c = makeCanvas(64, 64), g = c.getContext("2d"), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
        gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.25, "rgba(255,255,255,0.55)"); gr.addColorStop(1, "rgba(255,255,255,0)");
        g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c);
      })();
      const poolMat = new THREE.MeshBasicMaterial({ map: glowTex, color: "#ffcf7a", transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
      const pools = new THREE.InstancedMesh(new THREE.PlaneGeometry(13, 13).rotateX(-Math.PI / 2), poolMat, n);
      const haloPos = new Float32Array(n * 3);
      const m = new THREE.Matrix4();
      LAMPS.forEach((l, i) => {
        m.makeTranslation(l.x, l.y, l.z); poles.setMatrixAt(i, m);
        m.makeTranslation(l.x, l.y + 5.15, l.z); bulbs.setMatrixAt(i, m);
        m.makeTranslation(l.x, l.y + 0.06, l.z); pools.setMatrixAt(i, m);
        haloPos.set([l.x, l.y + 5.2, l.z], i * 3);
      });
      poles.count = bulbs.count = pools.count = LAMPS.length;
      poles.castShadow = true;
      const hg = new THREE.BufferGeometry(); hg.setAttribute("position", new THREE.BufferAttribute(haloPos, 3)); hg.setDrawRange(0, LAMPS.length);
      const haloMat = new THREE.PointsMaterial({ map: glowTex, color: "#ffd38a", size: 4, sizeAttenuation: true, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
      const halos = new THREE.Points(hg, haloMat);
      pools.renderOrder = 2;
      scene.add(poles, bulbs, pools, halos);
      look.noReflect.push(pools, halos);
      lampSys = { bulbMat, poolMat, haloMat, n: LAMPS.length };
    }
    function setNight(night, fog, rain) {
      const on = Math.max(0, Math.min(1, (night - 0.25) * 2 + (fog || 0) * 0.3 + ((rain || 0) > 0.5 ? 0.3 : 0)));
      if (lampSys) {
        lampSys.bulbMat.color.setRGB(0.25 + 4.5 * on, 0.22 + 3.4 * on, 0.18 + 1.9 * on);
        lampSys.poolMat.opacity = on * 0.55; lampSys.haloMat.opacity = on * 0.8;
      }
      nightMats.forEach((m) => (m.emissiveIntensity = night * 1.6));
      SIGNS.forEach((m) => (m.emissiveIntensity = 0.15 + night * 1.1));
    }

    // ---------------------------------------------------------------- 店招 / 楼名牌
    const SIGNS = [];
    function sign(text, x, y, z, ang, w, h, o) {
      const t = signTex(text, o);
      const mat = new THREE.MeshStandardMaterial({ map: t, emissiveMap: t, emissive: new THREE.Color(1, 1, 1), emissiveIntensity: 0.15, roughness: 0.5 });
      SIGNS.push(mat);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
      m.position.set(x, y, z); m.rotation.y = ang || 0;
      scene.add(m);
      return m;
    }

    // ---------------------------------------------------------------- 长椅、宣传栏、车辆、廊架、围网
    function bench(x, z, ang) {
      const y = groundY(x, z), c = Math.cos(ang), s = Math.sin(ang);
      const put = (geo, mat, u, v, hy) => { geo.rotateY(-ang).translate(x + u * c - v * s, y + hy, z + u * s + v * c); addGeo(geo, mat); };
      put(new THREE.BoxGeometry(1.8, 0.06, 0.45), MAT.wood, 0, 0, 0.45);
      put(new THREE.BoxGeometry(1.8, 0.4, 0.05), MAT.wood, 0, 0.22, 0.75);
      for (const u of [-0.75, 0.75]) put(new THREE.BoxGeometry(0.06, 0.45, 0.45), darkMetal, u, 0, 0.22);
    }
    function boards(a, b, n) {   // 宣传栏：一排白框蓝底展板
      const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n, x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t, y = groundY(x, z);
        addGeo(new THREE.BoxGeometry(2.4, 1.3, 0.12).rotateY(-ang).translate(x, y + 1.35, z), MAT.board);
        addGeo(new THREE.BoxGeometry(2.6, 0.12, 0.3).rotateY(-ang).translate(x, y + 2.08, z), MAT.white);
        for (const u of [-1.2, 1.2]) addGeo(new THREE.BoxGeometry(0.1, 2.1, 0.1).rotateY(-ang).translate(x + Math.cos(ang) * u, y + 1.05, z + Math.sin(ang) * u), MAT.white);
      }
    }
    const CAR_COLORS = [0xe8e8e6, 0x1f2326, 0xb02a2a, 0x6c7378, 0x2c4f86, 0xd7d2c4, 0x9aa1a6];
    const CARS = [];
    function car(x, z, ang, color) { CARS.push({ x, z, ang, color: color != null ? color : CAR_COLORS[Math.floor(rnd() * CAR_COLORS.length)] }); }
    function finishCars() {
      if (!CARS.length) return;
      const bodyG = mergeGeos([new THREE.BoxGeometry(4.4, 0.75, 1.8).translate(0, 0.65, 0), new THREE.BoxGeometry(2.4, 0.6, 1.6).translate(-0.2, 1.3, 0)]);
      const glassG = new THREE.BoxGeometry(2.3, 0.45, 1.62).translate(-0.2, 1.32, 0);
      const wheelG = mergeGeos([[-1.4, -0.8], [1.4, -0.8], [-1.4, 0.8], [1.4, 0.8]].map(([u, v]) => new THREE.CylinderGeometry(0.33, 0.33, 0.24, 12).rotateX(Math.PI / 2).translate(u, 0.33, v)));
      const bm = std({ color: 0xffffff, roughness: 0.25, metalness: 0.6, envMapIntensity: 1.2 }, { key: "zk-carbody" });
      const gm = std({ color: 0x1b2328, roughness: 0.05, metalness: 0.4 }, { key: "zk-carglass" });
      const wm = std({ color: 0x151515, roughness: 0.8 }, { key: "zk-tyre" });
      const n = CARS.length;
      const ib = new THREE.InstancedMesh(bodyG, bm, n), ig = new THREE.InstancedMesh(glassG, gm, n), iw = new THREE.InstancedMesh(wheelG, wm, n);
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), c = new THREE.Color();
      CARS.forEach((k, i) => { q.setFromAxisAngle(new V3(0, 1, 0), -k.ang); m.compose(new V3(k.x, 0, k.z), q, new V3(1, 1, 1)); ib.setMatrixAt(i, m); ig.setMatrixAt(i, m); iw.setMatrixAt(i, m); ib.setColorAt(i, c.setHex(k.color)); });
      [ib, ig, iw].forEach((x) => { x.castShadow = true; x.receiveShadow = true; scene.add(x); });
    }
    function pergola(a, b, width, height) {   // 廊架：白色柱 + 横梁
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]), ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
      const ux = (b[0] - a[0]) / len, uz = (b[1] - a[1]) / len, nx = -uz, nz = ux;
      for (let d = 0; d <= len; d += 4) for (const s of [-1, 1]) {
        const x = a[0] + ux * d + nx * s * width / 2, z = a[1] + uz * d + nz * s * width / 2;
        addGeo(new THREE.BoxGeometry(0.35, height, 0.35).translate(x, height / 2, z), MAT.white);
      }
      for (const s of [-1, 1]) addGeo(new THREE.BoxGeometry(len, 0.4, 0.3).rotateY(-ang).translate((a[0] + b[0]) / 2 + nx * s * width / 2, height + 0.2, (a[1] + b[1]) / 2 + nz * s * width / 2), MAT.white);
      for (let d = 0.5; d < len; d += 0.9) addGeo(new THREE.BoxGeometry(0.16, 0.3, width + 1.2).rotateY(-ang).translate(a[0] + ux * d, height + 0.55, a[1] + uz * d), MAT.white);
    }
    function fence(pathW, height) {   // 球场围网：深绿立柱 + 铁丝网
      for (let i = 0; i < pathW.length - 1; i++) {
        const a = pathW[i], b = pathW[i + 1], len = Math.hypot(b[0] - a[0], b[1] - a[1]), ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
        const g = new THREE.PlaneGeometry(len, height); const uv = g.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * len / 0.6, uv.getY(k) * height / 0.6);
        g.rotateY(-ang).translate((a[0] + b[0]) / 2, height / 2, (a[1] + b[1]) / 2);
        addGeo(g, MAT.fence);
        for (let d = 0; d <= len; d += 3) addGeo(new THREE.CylinderGeometry(0.05, 0.05, height, 6).translate(a[0] + (b[0] - a[0]) * d / len, height / 2, a[1] + (b[1] - a[1]) * d / len), darkMetal);
      }
    }
    function hoop(x, z, ang) {   // 篮球架
      const c = Math.cos(ang), s = Math.sin(ang);
      addGeo(new THREE.CylinderGeometry(0.1, 0.12, 3.2, 8).translate(x, 1.6, z), darkMetal);
      addGeo(new THREE.BoxGeometry(0.06, 1.05, 1.8).rotateY(-ang).translate(x + c * 1.0, 3.3, z + s * 1.0), MAT.white);
      addGeo(new THREE.TorusGeometry(0.23, 0.02, 6, 16).rotateX(Math.PI / 2).translate(x + c * 1.3, 3.05, z + s * 1.3), MAT.red);
      addGeo(new THREE.BoxGeometry(1.0, 0.08, 0.08).rotateY(-ang).translate(x + c * 0.5, 3.0, z + s * 0.5), darkMetal);
    }

    return {
      S, W, toPx, pxPoly, inPoly, polyDist, segDist, offsetPoly, centroid, ellipsePoly, along, area, norm2, shapeOfW, mergeNI,
      CLS, paintPoly, paintPath, paintCircle, classAt, bake: bakeClasses, finishGround, groundMat, groundU,
      decalLine, decalRect, finishDecals,
      building, parapet, box, acUnits, finishBuildings, buildingAt, FOOTPRINTS, LABELS, wallMat, STYLES,
      addGeo, finishMeshes, MAT, std, steps, platform, groundY, PLATFORMS, kerbs, road,
      lamp, finishLamps, setNight, LAMPS, sign, SIGNS, bench, boards, car, finishCars, pergola, fence, hoop,
      nightMats, rnd, CT: T, signTex,
    };
  }

  global.ZKWorld = { create, W, toPx, S, STYLES };
})(window);
