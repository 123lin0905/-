/*
 * 板块细节场景 · 建筑与硬质景观（ZoneBuild）
 * ------------------------------------------------------------------
 * 池塘画风（pond-style-core.js 的程序化纹理与 ACES / IBL 光照）下的建筑材质与几何工具：
 *   红砖（顺砌，灰缝 + 法线）、铝框玻璃幕墙（竖梃 / 横档、夜间室内灯光）、浅灰石材屋面、花岗岩勒脚、白色涂料、蓝色瓦屋面……
 * 几何全部按真实尺寸（1 单位 = 1 米）生成，UV 按米计（纹理在任何尺寸的墙面上密度一致）；同材质的面合并为一个网格。
 * 依赖：THREE、pond-style-core.js（genSurfaceCached、TEX、mergeGeos、hash3i、fbm2P …）、zone-look.js（patch：天气 / 积雪 / 湿润着色）。
 */
(function (global) {
  "use strict";
  const THREE = global.THREE, V3 = THREE.Vector3;

  // ---------------- 程序化纹理（首次生成后进 IndexedDB 缓存，与池塘 / 全景同一缓存） ----------------
  const BT = {};
  function buildTextures() {
    if (BT.ready) return BT;
    // 红砖：顺砌（每 2 米 26 皮，砖长 24 cm），砖色在橙红—赭红之间随机，灰缝浅灰，砖面细颗粒
    BT.brick = genSurfaceCached("zoneBrick", 512, (u, v, x, y) => {
      const rows = 26, cols = 8;
      const r = Math.floor(v * rows), off = (r % 2) * 0.5;
      const cu = u * cols + off, c = Math.floor(cu);
      const fu = cu - c, fv = v * rows - r;
      const mortar = fu < 0.045 || fv < 0.11;
      const id = hash3i(c, r, 3, 41), fine = fbm2P(u * 64, v * 64, 64, 2, 9) * 0.5 + 0.5;
      let col = mix3(srgbHex(0x9c4a32), srgbHex(0xb8654a), id);
      col = mix3(col, srgbHex(0x7d3a28), smoothstep(0.75, 1, hash3i(c, r, 5, 42)) * 0.6);
      col = col.map((q) => q * (0.9 + 0.18 * fine));
      if (mortar) col = mix3(srgbHex(0xb9b2a6), srgbHex(0xa39c90), fine);
      return [col[0], col[1], col[2], mortar ? 0.05 : 0.6 + fine * 0.2, mortar ? 0.95 : 0.82];
    }, 4);
    // 浅色面砖（入口楼的橙褐色面砖：比红砖浅、规整）
    BT.tile = genSurfaceCached("zoneFacadeTile", 256, (u, v) => {
      const rows = 12, cols = 6;
      const fu = (u * cols) % 1, fv = (v * rows) % 1;
      const joint = fu < 0.03 || fv < 0.06;
      const id = hash3i(Math.floor(u * cols), Math.floor(v * rows), 1, 7), fine = fbm2P(u * 32, v * 32, 32, 2, 3) * 0.5 + 0.5;
      let col = mix3(srgbHex(0xb87450), srgbHex(0xc98a62), id * 0.6 + fine * 0.4);
      if (joint) col = srgbHex(0xd8d0c4);
      return [col[0], col[1], col[2], joint ? 0.1 : 0.55, joint ? 0.9 : 0.7];
    }, 2);
    // 屋面：浅灰石材方砖（官方地图上图书馆大屋面是浅灰色石材 / 地砖拼花）
    BT.roof = genSurfaceCached("zoneRoofSlab", 512, (u, v) => {
      const n = 8, fu = (u * n) % 1, fv = (v * n) % 1;
      const joint = fu < 0.025 || fv < 0.025;
      const id = hash3i(Math.floor(u * n), Math.floor(v * n), 2, 17), fine = fbm2P(u * 48, v * 48, 48, 3, 5) * 0.5 + 0.5;
      let col = mix3(srgbHex(0xb4b4ae), srgbHex(0xcfcfc8), id * 0.55 + fine * 0.45);
      col = mix3(col, srgbHex(0x8e8c86), smoothstep(0.7, 0.9, fbm2P(u * 4, v * 4, 4, 3, 77) * 0.5 + 0.5) * 0.35);   // 雨痕
      if (joint) col = srgbHex(0x8a8984);
      return [col[0], col[1], col[2], joint ? 0.0 : 0.5 + fine * 0.1, 0.88];
    }, 3);
    // 白色 / 米色涂料
    BT.paint = genSurfaceCached("zonePaint", 256, (u, v) => {
      const f = fbm2P(u * 16, v * 16, 16, 4, 61) * 0.5 + 0.5, g = fbm2P(u * 80, v * 80, 80, 2, 62) * 0.5 + 0.5;
      const c = mix3(srgbHex(0xd9d4ca), srgbHex(0xe9e5dc), f * 0.6 + g * 0.4);
      return [c[0], c[1], c[2], g * 0.4, 0.9];
    }, 1.5);
    // 沥青
    BT.asphalt = genSurfaceCached("zoneAsphalt", 512, (u, v, x, y) => {
      const f = fbm2P(u * 8, v * 8, 8, 4, 91) * 0.5 + 0.5, g = hash3i(x, y, 1, 92), h = fbm2P(u * 120, v * 120, 120, 2, 93) * 0.5 + 0.5;
      let c = mix3(srgbHex(0x3d3e40), srgbHex(0x55565a), f * 0.5 + h * 0.3 + g * 0.2);
      if (g > 0.985) c = mix3(c, srgbHex(0x9a968c), 0.6);
      return [c[0], c[1], c[2], h * 0.6 + g * 0.4, 0.9];
    }, 2.5);
    // 草坪（校园修剪草坪：比池塘苔藓地更亮、更绿，叶片细纹 + 斑块）
    BT.lawn = genSurfaceCached("zoneLawn", 512, (u, v, x, y) => {
      const patch = fbm2P(u * 5, v * 5, 5, 4, 616) * 0.5 + 0.5;
      const blade = hash3i(x, y >> 1, 3, 11), blade2 = hash3i(x >> 1, y, 4, 12);
      const fine = fbm2P(u * 40, v * 40, 40, 3, 618) * 0.5 + 0.5;
      let c = mix3(srgbHex(0x4d7d22), srgbHex(0x76a335), fine * 0.5 + blade * 0.3 + blade2 * 0.2);
      c = mix3(c, srgbHex(0x3e6a1d), smoothstep(0.45, 0.2, patch) * 0.5);
      c = mix3(c, srgbHex(0x8fae47), smoothstep(0.62, 0.8, patch) * 0.35);
      return [c[0], c[1], c[2], fine * 0.4 + blade * 0.6, 0.95];
    }, 3);
    // 平均色（地面着色器用：细节纹理 / 平均色 = 明暗起伏，乘到底图颜色上）
    BT.avg = {};
    BT.ready = true;
    return BT;
  }
  function texAvg(tex) {
    try {
      const img = tex.image; const d = img.data; if (!d) return [0.5, 0.5, 0.5];
      let r = 0, g = 0, b = 0, n = 0;
      for (let i = 0; i < d.length; i += 4 * 37) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
      const lin = (c) => { c /= 255 * n; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
      return [lin(r), lin(g), lin(b)];
    } catch (e) { return [0.5, 0.5, 0.5]; }
  }

  // ---------------- 几何：按米计 UV 的四边形 / 盒子 / 挤出 ----------------
  // 四边形 a,b,c,d（逆时针，从外面看），UV：u = 沿 a→b 的米数，v = 沿 a→d 的米数
  function quad(a, b, c, d, us, vs) {
    us = us || 1; vs = vs || 1;
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array([a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z, d.x, d.y, d.z]);
    const lu = a.distanceTo(b) / us, lv = a.distanceTo(d) / vs;
    const uv = new Float32Array([0, 0, lu, 0, lu, lv, 0, lv]);
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    g.computeVertexNormals();
    return g;
  }
  // 竖直墙面：从 p0 到 p1（xz），高 y0..y1；外法线朝 p0→p1 的右手侧（多边形逆时针时朝外）
  function wall(p0, p1, y0, y1, us, vs) {
    return quad(new V3(p0[0], y0, p0[1]), new V3(p1[0], y0, p1[1]), new V3(p1[0], y1, p1[1]), new V3(p0[0], y1, p0[1]), us, vs);
  }
  // 水平面（多边形，y 高度，朝上 / 朝下），UV = 世界 xz 米
  function flat(poly, y, down, us) {
    us = us || 1;
    const shape = new THREE.Shape(poly.map((p) => new THREE.Vector2(p[0], -p[1])));
    const g = new THREE.ShapeGeometry(shape);
    g.rotateX(-Math.PI / 2);
    g.translate(0, y, 0);
    const pos = g.attributes.position, uv = g.attributes.uv;
    for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / us, pos.getZ(i) / us);
    if (down) { const idx = g.index.array; for (let i = 0; i < idx.length; i += 3) { const t = idx[i]; idx[i] = idx[i + 2]; idx[i + 2] = t; } }
    g.computeVertexNormals();
    return g;
  }
  // 棱柱（多边形底面 + 高度）：返回 { sides, top, bottom }，侧面按顺序逐边
  function prism(poly, y0, y1, us) {
    const ccw = signedArea(poly) < 0 ? poly : poly.slice().reverse();   // xz 平面里 z 朝南：屏幕上的逆时针 = 面积 < 0
    const sides = [];
    for (let i = 0; i < ccw.length; i++) sides.push(wall(ccw[i], ccw[(i + 1) % ccw.length], y0, y1, us, us));
    return { sides: mergeGeos(sides), top: flat(ccw, y1, false, us), bottom: flat(ccw, y0, true, us) };
  }
  function signedArea(p) { let a = 0; for (let i = 0; i < p.length; i++) { const q = p[i], r = p[(i + 1) % p.length]; a += q[0] * r[1] - r[0] * q[1]; } return a / 2; }
  // 盒子（中心、尺寸、绕 y 旋转），UV 按米
  function box(cx, cy, cz, sx, sy, sz, rot, us) {
    const g = new THREE.BoxGeometry(sx, sy, sz);
    const pos = g.attributes.position, nrm = g.attributes.normal, uv = g.attributes.uv;
    us = us || 1;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i), nx = Math.abs(nrm.getX(i)), ny = Math.abs(nrm.getY(i));
      if (ny > 0.5) uv.setXY(i, x / us, z / us); else if (nx > 0.5) uv.setXY(i, z / us, y / us); else uv.setXY(i, x / us, y / us);
    }
    if (rot) g.rotateY(rot);
    g.translate(cx, cy, cz);
    return g;
  }

  // 局部坐标系（建筑轴线）：origin [x,z]（米），angle（弧度，u 轴 = (cos, sin) 在 xz 平面）
  function frame(origin, angle) {
    const c = Math.cos(angle), s = Math.sin(angle);
    return {
      p: (u, v) => [origin[0] + u * c - v * s, origin[1] + u * s + v * c],
      v3: (u, y, v) => new V3(origin[0] + u * c - v * s, y, origin[1] + u * s + v * c),
      rect: (u0, v0, u1, v1) => [[u0, v0], [u1, v0], [u1, v1], [u0, v1]].map(([u, v]) => [origin[0] + u * c - v * s, origin[1] + u * s + v * c]),
      angle, origin,
    };
  }

  // ---------------- 材质 ----------------
  function materials(look) {
    const T = buildTextures();
    const patch = look.patch;
    const M = {};
    const std = (key, p, o) => patch(new THREE.MeshStandardMaterial(p), Object.assign({ key }, o || {}));
    const rep = (t, s) => { const x = t.clone(); x.wrapS = x.wrapT = THREE.RepeatWrapping; x.repeat.set(s, s); x.needsUpdate = true; return x; };
    // 纹理按米 UV：红砖贴图覆盖 2 米 → repeat 0.5
    M.brick = std("zbrick", { map: rep(T.brick.map, 0.5), normalMap: rep(T.brick.normalMap, 0.5), normalScale: new THREE.Vector2(0.9, 0.9), roughness: 0.85, envMapIntensity: 0.6 }, { plinth: false });
    M.tile = std("ztile", { map: rep(T.tile.map, 0.5), normalMap: rep(T.tile.normalMap, 0.5), roughness: 0.7, envMapIntensity: 0.7 });
    M.roof = std("zroof", { map: rep(T.roof.map, 1 / 6), normalMap: rep(T.roof.normalMap, 1 / 6), roughness: 0.85, envMapIntensity: 0.6 });
    M.paint = std("zpaint", { map: rep(T.paint.map, 1 / 3), normalMap: rep(T.paint.normalMap, 1 / 3), roughness: 0.9, envMapIntensity: 0.7, side: THREE.DoubleSide });
    M.granite = std("zgranite", { map: rep(TEX.granite.map, 0.5), normalMap: rep(TEX.granite.normalMap, 0.5), roughness: 0.75, color: 0xd8d4cc, envMapIntensity: 0.7 });
    M.darkStone = std("zdstone", { map: rep(TEX.granite.map, 0.5), normalMap: rep(TEX.granite.normalMap, 0.5), roughness: 0.7, color: 0x6a6662, envMapIntensity: 0.6 });
    M.metal = std("zmetal", { color: 0x9aa2a8, roughness: 0.35, metalness: 0.85, envMapIntensity: 1.0 }, { noWeather: true });
    M.darkMetal = std("zdmetal", { color: 0x2c3034, roughness: 0.45, metalness: 0.7, envMapIntensity: 0.9 }, { noWeather: true });
    M.white = std("zwhite", { color: 0xe8e6e0, roughness: 0.6, envMapIntensity: 0.7 });
    M.blueRoof = std("zblueroof", { map: rep(TEX.roof.map, 0.5), normalMap: rep(TEX.roof.normalMap, 0.5), color: 0x8fb6ff, roughness: 0.55, envMapIntensity: 0.8 });
    M.wood = std("zwood", { map: rep(TEX.wood.map, 0.8), normalMap: rep(TEX.wood.normalMap, 0.8), roughness: 0.7, envMapIntensity: 0.5 });
    M.soil = std("zsoil", { map: rep(TEX.gravel.map, 0.6), color: 0x8a6a4c, roughness: 0.95, envMapIntensity: 0.4 });
    // 玻璃幕墙：铝框分格（竖梃 1.5 米、横档 1.1 米）+ 夜间室内灯光（窗格随机亮灭）
    M.glass = glassMaterial(look, { tint: 0x86a7b8, mullionU: 1.5, mullionV: 1.15, key: "zglass" });
    M.glassDark = glassMaterial(look, { tint: 0x5e7d8e, mullionU: 1.2, mullionV: 1.2, key: "zglass2" });
    M.window = glassMaterial(look, { tint: 0x6f8e9d, mullionU: 0.9, mullionV: 1.6, key: "zwin" });
    M.all = Object.values(M).filter((m) => m && m.isMaterial);
    return M;
  }
  const NIGHT = { value: 0 };   // 0 白天 .. 1 夜晚（窗灯）
  function glassMaterial(look, o) {
    const cv = document.createElement("canvas"); cv.width = cv.height = 128;
    const g = cv.getContext("2d");
    g.fillStyle = "#fff"; g.fillRect(0, 0, 128, 128);
    g.fillStyle = "#3a4046"; g.fillRect(0, 0, 128, 7); g.fillRect(0, 0, 7, 128);   // 竖梃 / 横档（深灰铝框）
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(1 / o.mullionU, 1 / o.mullionV); t.anisotropy = 4;
    const m = new THREE.MeshStandardMaterial({ map: t, color: o.tint, metalness: 0.6, roughness: 0.08, envMapIntensity: 1.35 });
    return look.patch(m, {
      key: o.key, noWeather: true,
      uniforms: { uNightW: NIGHT, uMU: { value: new THREE.Vector2(o.mullionU, o.mullionV) } },
      fsPars: "uniform float uNightW; uniform vec2 uMU;\n",
      fsPostLights: /* glsl */`
{ float lit = step(0.45, wxh(floor(vMapUv * 0.5) + floor(vUwPos.y / 4.2) * 7.31 + floor(vUwPos.xz / 13.0) * 3.7));
  reflectedLight.indirectDiffuse += vec3(1.0, 0.8, 0.52) * lit * uNightW * 2.2 * step(0.12, diffuseColor.g); }
`,
    });
  }

  // ---------------- 组装：同材质合并成一个网格 ----------------
  function assembler() {
    const parts = new Map();
    return {
      add(mat, geo) { if (!geo) return; if (!parts.has(mat)) parts.set(mat, []); parts.get(mat).push(geo); },
      build(group, opt) {
        opt = opt || {};
        for (const [mat, geos] of parts) {
          const clean = geos.map((g) => { const x = g.index ? g.toNonIndexed() : g; if (!x.attributes.uv) x.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(x.attributes.position.count * 2), 2)); return x; });
          const geo = mergeNonIndexed(clean);
          const mesh = new THREE.Mesh(geo, mat);
          mesh.castShadow = opt.cast !== false; mesh.receiveShadow = true;
          group.add(mesh);
        }
        parts.clear();
        return group;
      },
    };
  }
  function mergeNonIndexed(geos) {
    let n = 0; for (const g of geos) n += g.attributes.position.count;
    const pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3), uv = new Float32Array(n * 2);
    let o = 0;
    for (const g of geos) {
      pos.set(g.attributes.position.array, o * 3);
      if (g.attributes.normal) nrm.set(g.attributes.normal.array, o * 3);
      uv.set(g.attributes.uv.array.subarray(0, g.attributes.position.count * 2), o * 2);
      o += g.attributes.position.count;
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    out.setAttribute("normal", new THREE.BufferAttribute(nrm, 3));
    out.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    out.computeBoundingSphere(); out.computeBoundingBox();
    return out;
  }

  // ---------------- 通用：砖墙建筑块（平屋顶 + 窗带） ----------------
  // poly：底面多边形（世界 xz 米），h 高度，o: { wall: 'brick'|'paint'|'tile', y0, windows: true, roof: 'roof'|'paint', parapet: 0.9 }
  function block(A, M, poly, h, o) {
    o = o || {};
    const y0 = o.y0 || 0, wm = M[o.wall || "brick"];
    const ccw = signedArea(poly) < 0 ? poly : poly.slice().reverse();
    for (let i = 0; i < ccw.length; i++) {
      const p0 = ccw[i], p1 = ccw[(i + 1) % ccw.length];
      const len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
      A.add(M.granite, wall(p0, p1, y0 - 0.5, y0 + 0.6));
      if (o.windows === false || len < 4) { A.add(wm, wall(p0, p1, y0 + 0.6, y0 + h)); continue; }
      // 每层一条窗带：窗台 0.9 m，窗高 1.6 m，层高 3.4 m；窗间墙 1.2 m
      const fl = o.floor || 3.4, nF = Math.max(1, Math.floor((h - 0.8) / fl));
      const dx = (p1[0] - p0[0]) / len, dz = (p1[1] - p0[1]) / len;
      const at = (s) => [p0[0] + dx * s, p0[1] + dz * s];
      const winW = o.winW || 2.4, gap = o.gap || 1.3, pitch = winW + gap;
      const nW = Math.max(1, Math.floor((len - gap) / pitch)), m0 = (len - (nW * pitch - gap)) / 2;
      let y = y0 + 0.6;
      for (let f = 0; f < nF; f++) {
        const ys = y0 + 0.6 + f * fl, sill = ys + 0.9, head = sill + Math.min(1.9, fl - 1.3);
        A.add(wm, wall(p0, p1, ys, sill));
        A.add(wm, wall(p0, p1, head, ys + fl));
        // 窗间墙与窗
        let s = 0;
        for (let k = 0; k < nW; k++) {
          const a = m0 + k * pitch, b = a + winW;
          A.add(wm, wall(at(s), at(a), sill, head));
          // 窗洞内凹 0.15 m
          const inx = dz * 0.15, inz = -dx * 0.15;   // 向内（外法线为 (-dz, dx)）
          const a2 = at(a), b2 = at(b);
          A.add(M.window, wall([a2[0] + inx, a2[1] + inz], [b2[0] + inx, b2[1] + inz], sill, head));
          A.add(M.paint, wall([a2[0] + inx, a2[1] + inz], a2, sill, head));
          A.add(M.paint, wall(b2, [b2[0] + inx, b2[1] + inz], sill, head));
          A.add(M.paint, quad(new V3(a2[0], sill, a2[1]), new V3(b2[0], sill, b2[1]), new V3(b2[0] + inx, sill, b2[1] + inz), new V3(a2[0] + inx, sill, a2[1] + inz)));
          s = b;
        }
        A.add(wm, wall(at(s), p1, sill, head));
        y = ys + fl;
      }
      if (y < y0 + h) A.add(wm, wall(p0, p1, y, y0 + h));
    }
    // 屋面 + 女儿墙
    const par = o.parapet == null ? 0.9 : o.parapet;
    A.add(M[o.roof || "roof"], flat(ccw, y0 + h, false, 1));
    if (par > 0) {
      for (let i = 0; i < ccw.length; i++) {
        const p0 = ccw[i], p1 = ccw[(i + 1) % ccw.length];
        A.add(M.paint, wall(p0, p1, y0 + h, y0 + h + par));
        A.add(M.paint, wall(p1, p0, y0 + h, y0 + h + par));
      }
    }
  }

  global.ZoneBuild = { buildTextures, texAvg, quad, wall, flat, prism, box, frame, materials, assembler, block, signedArea, NIGHT, mergeNonIndexed };
})(window);
