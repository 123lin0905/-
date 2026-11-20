/*
 * 运动场周边 · 板块细节 3D 场景（池塘同款写实画风，真实尺寸）
 * ------------------------------------------------------------------------------
 * 布局依据：学校官网绵阳校区三维导览图（手绘斜轴测鸟瞰图，ref/official/sports/）与平面图 campus_layout.json（0.4 米 / 像素），
 *   通过 plan_to_official_affine.json 把平面图坐标投到导览图上逐项比对（自西向东沿二环路北段）：
 *   - 网球场 4 片（2×2，长轴东西向，蓝灰面层 + 绿色缓冲区，铁丝网围合），南侧 3 片橙色排球场；
 *   - 室外游泳池 1 座（L 形：50 × 21 米标准池 + 西南角浅水池），北侧绿色看台台阶，西侧灰瓦四坡顶敞廊（看台 / 体育用房）；
 *   - 体育训练馆：白色大体量、南立面为弧形，屋顶空调机组；
 *   - 篮球场 9 片（3×3）位于毛石挡土墙围合的高台上（约 3 米），四周铁丝网与高杆灯；
 *   - 400 米标准跑道（8 条分道，直道 84.39 米，内半径 36.5 米）+ 天然草足球场（105 × 68 米），红色塑胶铺满场地矩形，角部高杆灯；
 *   - 建筑与工程学院位于田径场西端（灰色 4 层主楼 + 南侧 2 层灰瓦坡顶附楼）；
 *   - 外围：二环路北段（双向四车道 + 行道树）、环校路、体育馆支路。
 * 坐标：与全景一致（x=(px-1024)*0.4，z=(py-999)*0.4，米）。依赖 zone-kit/*.js。
 */
(function () {
  "use strict";
  const ZB = window.ZoneBuild, W = ZB.W;
  const D2R = Math.PI / 180;

  // ---------------- 平面图坐标（像素） ----------------
  const TRACK = [[768, 277], [1212, 183], [1266, 434], [825, 531]];
  const BASKET = [[564, 345], [731, 308], [763, 455], [594, 489]];
  const GONG_N = [[735, 303], [768, 296], [785, 376], [752, 383]];
  const GONG_S = [[752, 383], [785, 376], [799, 447], [768, 455]];
  const PAVILION = { c: [383, 456], len: 62, dep: 15, ang: Math.atan2(152, 37) };
  const HALL_N = [[392, 540], [538, 505]];        // 训练馆北墙
  const HALL_S = [[410, 639], [556, 606]];        // 南立面（弧形外凸）
  const ROAD_RING = [[199, 820], [199, 763], [240, 726], [585, 653], [940, 549], [1149, 496], [1254, 502], [1348, 569]];
  const ROAD_GYM = [[564, 543], [575, 606], [585, 653]];
  const ERHUAN = [[60, 322], [1340, 37]];          // 二环路北段（略延长出画面）
  const CHUANGYE = [[120, 280], [120, 900]];

  // 局部坐标系
  const angOf = (a, b) => Math.atan2(b[1] - a[1], b[0] - a[0]);
  const trackAng = (angOf(TRACK[0], TRACK[1]) + angOf(TRACK[3], TRACK[2])) / 2;
  const trackC = ZB.centroid(TRACK);
  const poolAng = angOf([405, 392], [552, 364]);
  const tennisAng = angOf([188, 423], [334, 395]);
  const basketAng = (angOf(BASKET[0], BASKET[1]) + angOf(BASKET[3], BASKET[2])) / 2;
  const PLATFORM_Y = 3.0;

  // 局部多边形（带洞）：池岸铺装要把水面挖空，否则 0.2 米高的铺装会盖住水面
  function polyHoleL(B, f, outer, holes, y, mat, uvScale) {
    const shape = new THREE.Shape(); outer.forEach(([u, v], i) => (i ? shape.lineTo(u, v) : shape.moveTo(u, v)));
    holes.forEach((h) => { const p = new THREE.Path(); h.forEach(([u, v], i) => (i ? p.lineTo(u, v) : p.moveTo(u, v))); shape.holes.push(p); });
    const g = new THREE.ShapeGeometry(shape, 16).toNonIndexed(), pos = g.attributes.position, uv = g.attributes.uv, k = uvScale || 1;
    for (let i = 0; i < pos.count; i++) { const u = pos.getX(i), v = pos.getY(i); uv.setXY(i, u / k, v / k); const [x, z] = f.w(u, v); pos.setXYZ(i, x, y, z); }
    B.fixWinding(g); g.computeVertexNormals();
    return B.pooled(g, mat);
  }

  function heightAt(x, z) { return ZB.inPoly(ZB.P(x, z), BASKET) ? PLATFORM_Y : 0; }

  function build(K) {
    const B = K.B, M = B.M, look = K.look;
    const water = look.waterMaterial({ key: "pool", color: 0x2f8796, scale: 0.12 });
    // 叠放的薄面层用多边形偏移分层（远景下 1~2 厘米高差会深度冲突）：底层 0 · 场地 1 · 罚球区 2 · 标线 3
    B.decal(M.pitch, 1);

    // ---------- 道路 ----------
    B.ribbon(ERHUAN, 42, 0.04, M.asphalt, false, "road");
    B.ribbon(CHUANGYE, 40, 0.04, M.asphalt, false, "road");
    { // 二环路标线：中央双黄线 + 车道虚线 + 两侧路缘石 / 人行道
      const a = W(ERHUAN[0]), b = W(ERHUAN[1]), L = Math.hypot(b[0] - a[0], b[1] - a[1]), ux = (b[0] - a[0]) / L, uz = (b[1] - a[1]) / L, nx = -uz, nz = ux;
      for (const off of [-0.18, 0.18]) B.line([[a[0] + nx * off, a[1] + nz * off], [b[0] + nx * off, b[1] + nz * off]], 0.15, 0.06, M.yellowPaint);
      for (const off of [-4.2, 4.2]) for (let d = 0; d < L; d += 9) B.line([[a[0] + ux * d + nx * off, a[1] + uz * d + nz * off], [a[0] + ux * (d + 4) + nx * off, a[1] + uz * (d + 4) + nz * off]], 0.15, 0.06, M.paint);
      for (const off of [-8.2, 8.2]) B.line([[a[0] + nx * off, a[1] + nz * off], [b[0] + nx * off, b[1] + nz * off]], 0.15, 0.06, M.paint);
      // 南侧人行道（条石）
      const sw = [[a[0] + nx * 11.6, a[1] + nz * 11.6], [b[0] + nx * 11.6, b[1] + nz * 11.6]];
      B.stripW(sw, 3.2, 0.12, M.pavers, false, false);
      B.line([[a[0] + nx * 9.9, a[1] + nz * 9.9], [b[0] + nx * 9.9, b[1] + nz * 9.9]], 0.3, 0.16, M.granite);
    }
    B.ribbon(ROAD_RING, 24, 0.05, M.asphalt, false, "road");
    B.ribbon(ROAD_GYM, 14, 0.05, M.asphalt, false, "road");
    { // 环校路中心虚线
      for (let i = 0; i < ROAD_RING.length - 1; i++) {
        const a = W(ROAD_RING[i]), b = W(ROAD_RING[i + 1]), L = Math.hypot(b[0] - a[0], b[1] - a[1]), ux = (b[0] - a[0]) / L, uz = (b[1] - a[1]) / L;
        for (let d = 2; d < L - 3; d += 8) B.line([[a[0] + ux * d, a[1] + uz * d], [a[0] + ux * (d + 4), a[1] + uz * (d + 4)]], 0.14, 0.07, M.paint);
      }
    }
    // 步行道 / 场馆前广场（条石、石板）
    const PATHS = [
      { path: [[300, 600], [395, 590], [560, 560], [575, 606]], w: 10 },      // 训练馆南侧步道
      { path: [[372, 548], [380, 600]], w: 8 },                              // 敞廊南口
      { path: [[565, 500], [590, 560]], w: 7 },                               // 篮球台阶下
      { path: [[790, 470], [812, 540]], w: 8 },                               // 工程学院 → 环校路
      { path: [[175, 590], [300, 600]], w: 6 },
    ];
    PATHS.forEach((p) => B.ribbon(p.path, p.w, 0.06, M.pavers, false, "paved"));
    // 训练馆前广场
    B.flat([[400, 640], [560, 604], [572, 640], [415, 676]], M.slabs, 0.07, "paved");

    // ---------- 田径场：红色塑胶铺满场地矩形 + 400 米标准跑道 + 天然草足球场 ----------
    {
      const f = B.frame(trackC, trackAng);
      const trackPoly = TRACK;
      B.flat(trackPoly, M.track, 0.08, "court");
      const R0 = 36.5, L0 = 84.39, LANE = 1.22, N = 8;
      // 内场草坪：官网导览图为矩形天然草足球场（两端半圆区是红色塑胶），草坪矩形 109 × 73 米并裁到跑道内沿以内
      { const HU = 54.5, lim = (u) => { const d = Math.max(0, Math.abs(u) - L0 / 2); return Math.min(R0 - 0.05, Math.sqrt(Math.max(0, (R0 - 0.05) ** 2 - d * d))); };
        const top = [], bot = []; for (let i = 0; i <= 24; i++) { const u = -HU + (2 * HU * i) / 24; top.push([u, -lim(u)]); bot.push([u, lim(u)]); }
        B.polyL(f, top.concat(bot.reverse()), 0.1, M.pitch, 10.5); }
      // 跑道线：内沿路缘 + 9 条分道线
      B.lineL(f, B.ovalL(0, 0, L0, R0, 48), 0.12, 0.13, M.white, true);
      for (let i = 1; i <= N; i++) B.lineL(f, B.ovalL(0, 0, L0, R0 + i * LANE, 48), 0.05, 0.12, M.paint, true);
      // 终点线、起跑线、梯形分道起点
      B.lineL(f, [[L0 / 2 - 6, -R0], [L0 / 2 - 6, -R0 - N * LANE]], 0.08, 0.12, M.paint);
      B.lineL(f, [[L0 / 2 - 6.5, -R0], [L0 / 2 - 6.5, -R0 - N * LANE]], 0.08, 0.12, M.paint);
      for (let i = 0; i < N; i++) { const st = -L0 / 2 + 8 + i * 3.5; B.lineL(f, [[st, R0 + i * LANE], [st, R0 + (i + 1) * LANE]], 0.08, 0.12, M.paint); }
      // 足球场标线
      const PL = 105, PW = 68, w = 0.12, y = 0.13;
      B.rectLineL(f, -PL / 2, -PW / 2, PL / 2, PW / 2, w, y, M.paint);
      B.lineL(f, [[0, -PW / 2], [0, PW / 2]], w, y, M.paint);
      B.lineL(f, B.arcL(0, 0, 9.15, 0, Math.PI * 2, 48), w, y, M.paint);
      for (const s of [-1, 1]) {
        const gx = s * PL / 2;
        B.lineL(f, [[gx, -20.16], [gx - s * 16.5, -20.16], [gx - s * 16.5, 20.16], [gx, 20.16]], w, y, M.paint);
        B.lineL(f, [[gx, -9.16], [gx - s * 5.5, -9.16], [gx - s * 5.5, 9.16], [gx, 9.16]], w, y, M.paint);
        const ps = gx - s * 11, a0 = s > 0 ? Math.PI - 0.93 : -0.93;
        B.lineL(f, B.arcL(ps, 0, 9.15, a0, a0 + 1.86, 16), w, y, M.paint);
        B.lineL(f, B.arcL(ps, 0, 0.18, 0, 6.28, 8), 0.3, y, M.paint);
        for (const cv of [-1, 1]) B.lineL(f, B.arcL(gx, cv * PW / 2, 1, s > 0 ? (cv > 0 ? Math.PI : Math.PI / 2) : (cv > 0 ? -Math.PI / 2 : 0), (s > 0 ? (cv > 0 ? Math.PI : Math.PI / 2) : (cv > 0 ? -Math.PI / 2 : 0)) + Math.PI / 2, 6), w, y, M.paint);
        // 球门：白色门框 + 网
        const [g1x, g1z] = f.w(gx, -3.66), [g2x, g2z] = f.w(gx, 3.66), [b1x, b1z] = f.w(gx + s * 1.8, -3.66), [b2x, b2z] = f.w(gx + s * 1.8, 3.66);
        B.cylW(g1x, g1z, 0.1, 0.06, 0.06, 2.44, M.white, 8); B.cylW(g2x, g2z, 0.1, 0.06, 0.06, 2.44, M.white, 8);
        B.boxW((g1x + g2x) / 2, (g1z + g2z) / 2, 2.5, 7.44, 0.12, 0.12, trackAng + Math.PI / 2, M.white);
        B.net(b1x, b1z, b2x, b2z, 2.0, 0.1); B.net(g1x, g1z, b1x, b1z, 2.4, 0.1); B.net(g2x, g2z, b2x, b2z, 2.4, 0.1);
      }
      // 外圈围网（西端为建筑与工程学院）
      const tw = TRACK.map(W);
      B.fence([tw[0], tw[1], tw[2], tw[3]], 3.2, false);
      // 高杆灯：长边各 3 根
      for (const sv of [-1, 1]) for (const su of [-0.42, 0, 0.42]) {
        const [x, z] = f.w(su * 170, sv * 50); B.floodlight(x, z, 24, trackAng + (sv > 0 ? -Math.PI / 2 : Math.PI / 2), 5);
      }
      // 跑道边的长椅
      for (let k = -3; k <= 3; k++) { const [x, z] = f.w(k * 20, 49.5); B.bench(x, z, trackAng); }
    }

    // ---------- 建筑与工程学院（田径场西端） ----------
    B.building({ id: "gongcheng", name: "建筑与工程学院", poly: GONG_N, h: 15.5, style: "grey", boxes: [{ c: B.centroid(GONG_N), len: 6, dep: 4, ang: angOf(GONG_N[0], GONG_N[3]), h: 2.8 }],
      info: "田径场西端的 4 层灰色教学楼，设建筑模型节点实训室、建设工程项目管理沙盘实训室等，兼作田径场看台与器材用房。" });
    B.building({ id: "gongcheng_s", name: "工程实训附楼", poly: GONG_S, h: 8, style: "grey", roof: { type: "hip", pitch: 2.6, color: 0x6c7780 }, label: false,
      info: "建筑与工程学院南侧的 2 层附楼，灰瓦四坡屋顶，设实训室与器材间。" });

    // ---------- 篮球场高台：毛石挡土墙 + 9 片篮球场（3×3） ----------
    {
      const g = B.extrudePoly(BASKET, PLATFORM_Y, 0);
      // 侧面 = 毛石墙，顶面 = 球场外围绿色面层
      const top = [], side = [];
      for (const gr of g.groups) { const sub = new THREE.BufferGeometry(); for (const n of ["position", "normal", "uv"]) { const a = g.attributes[n]; sub.setAttribute(n, new THREE.BufferAttribute(a.array.slice(gr.start * a.itemSize, (gr.start + gr.count) * a.itemSize), a.itemSize)); } (gr.materialIndex === 0 ? top : side).push(sub); }
      const wallM = new THREE.Mesh(mergeGeos(side), M.stone); wallM.castShadow = wallM.receiveShadow = true; K.scene.add(wallM);
      const surround = B.courtMat(0x3f8a62);
      top.forEach((t) => B.pooled(t, surround));
      B.mark({ kind: "poly", poly: BASKET, cls: "platform" });
      const c = B.centroid(BASKET), f = B.frame(c, basketAng);
      // 局部尺寸：u ±33，v ±28
      const CW = 20, CH = 12, GU = 1.6, GV = 3.2, y = PLATFORM_Y + 0.02;
      // 官网导览图：红色球场面层，三分区与中圈为绿色
      const red = B.decal(B.courtMat(0xa8473b), 1), green = B.decal(B.courtMat(0x2f7a55), 2);
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
        const cu = i * (CW + GU), cv = j * (CH + GV);
        B.polyL(f, B.rectL(cu - CW / 2, cv - CH / 2, cu + CW / 2, cv + CH / 2), y, red, 4);
        B.polyL(f, B.arcL(cu, cv, 1.8, 0, 6.28, 20), y + 0.01, green, 4);
        for (const s of [-1, 1]) {
          const bu = cu + s * CW / 2;
          // 红色三分区（半圆 + 罚球区）
          const arc = B.arcL(bu, cv, 6.0, s > 0 ? Math.PI / 2 : -Math.PI / 2, s > 0 ? Math.PI * 1.5 : Math.PI / 2, 24).map(([u, v]) => [u, Math.max(cv - CH / 2 + 0.3, Math.min(cv + CH / 2 - 0.3, v))]);
          B.polyL(f, [[bu, cv - CH / 2 + 0.3]].concat(arc).concat([[bu, cv + CH / 2 - 0.3]]), y + 0.01, green, 4);
          B.lineL(f, arc, 0.06, y + 0.03, M.paint);
          B.lineL(f, [[bu, cv - 2.45], [bu - s * 5.8, cv - 2.45], [bu - s * 5.8, cv + 2.45], [bu, cv + 2.45]], 0.06, y + 0.03, M.paint);
          B.lineL(f, B.arcL(bu - s * 5.8, cv, 1.8, s > 0 ? Math.PI / 2 : -Math.PI / 2, s > 0 ? Math.PI * 1.5 : Math.PI / 2, 12), 0.06, y + 0.03, M.paint);
          const [hx, hz] = f.w(bu - s * 0.2, cv); B.hoop(hx, hz, basketAng + (s > 0 ? Math.PI : 0), PLATFORM_Y);
        }
        B.rectLineL(f, cu - CW / 2, cv - CH / 2, cu + CW / 2, cv + CH / 2, 0.06, y + 0.03, M.paint);
        B.lineL(f, [[cu, cv - CH / 2], [cu, cv + CH / 2]], 0.06, y + 0.03, M.paint);
        B.lineL(f, B.arcL(cu, cv, 1.8, 0, 6.28, 20), 0.06, y + 0.03, M.paint);
        B.bench(...f.w(cu, cv + CH / 2 + 1.2), basketAng);
      }
      B.fence(BASKET.map(W), 4, true, PLATFORM_Y);
      // 高杆灯（四角 + 两长边中点）
      [[-33, -27], [33, -27], [-33, 27], [33, 27], [0, -28], [0, 28]].forEach(([u, v]) => { const [x, z] = f.w(u, v); B.floodlight(x, z, 15, basketAng + (v > 0 ? -Math.PI / 2 : Math.PI / 2), 3, PLATFORM_Y); });
      // 西南角台阶
      const [sx, sz] = f.w(-30, 31.5);
      for (let k = 0; k < 10; k++) B.boxW(sx + Math.cos(basketAng) * 0, sz, 0, 5, PLATFORM_Y * (k + 1) / 10, 0.35 * (10 - k), basketAng, M.concrete);
    }

    // ---------- 游泳池（L 形：标准池 + 西南角浅水池）+ 看台台阶 + 敞廊 ----------
    {
      const f = B.frame([404, 390], poolAng), y = 0.2;
      // 池岸铺装（凸起 0.2 米）
      const deck = [[-6, -12], [58, -12], [58, 27], [14, 27], [14, 41], [-6, 41]];
      const poolPts = [[0, 0], [50, 0], [50, 21], [9, 21], [9, 36], [0, 36]];
      polyHoleL(B, f, deck, [poolPts], y, M.slabs, 4.8);
      B.mark({ kind: "poly", poly: B.polyPx(f, deck), cls: "paved" });
      // 池壁与池底：水面略低于池岸，池壁用白色瓷砖色
      { const ring = poolPts.map(([u, v]) => f.w(u, v)), pos = [];
        for (let i = 0; i < ring.length; i++) { const a = ring[i], b = ring[(i + 1) % ring.length]; pos.push(a[0], y, a[1], b[0], y, b[1], b[0], -1.6, b[1], a[0], y, a[1], b[0], -1.6, b[1], a[0], -1.6, a[1]); }
        const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(pos.length / 3 * 2), 2)); g.computeVertexNormals();
        const wallMat = new THREE.MeshStandardMaterial({ color: 0x9fd3dc, roughness: 0.4, side: THREE.DoubleSide }); B.addMesh(g, wallMat, false, true); }
      B.polyL(f, poolPts, 0.12, water, 1);
      B.mark({ kind: "poly", poly: B.polyPx(f, poolPts), cls: "water" });
      B.lineL(f, poolPts, 0.5, y + 0.02, M.granite, true);
      // 泳道绳（蓝白浮标）、出发台、扶梯
      const rope = B.epdm(0x2a6fd6, "rope"), ropeW = B.epdm(0xf2f2f2, "ropew");
      for (let i = 1; i < 8; i++) {
        const v = i * 2.5 + 0.5;
        for (let u = 0.5; u < 49.5; u += 1.0) { const [x, z] = f.w(u, v); B.cylW(x, z, 0.08, 0.07, 0.07, 0.08, (u > 5 && u < 45) ? (Math.floor(u) % 2 ? rope : ropeW) : B.epdm(0xd33c2e, "roper"), 6); }
      }
      for (let i = 0; i < 8; i++) { const [x, z] = f.w(50.4, i * 2.5 + 1.75); B.boxW(x, z, y, 0.5, 0.7, 0.5, poolAng, M.white); }
      for (const v of [2, 19]) { const [x, z] = f.w(1.0, v); B.cylW(x, z, y, 0.03, 0.03, 0.9, M.metal, 6); const [x2, z2] = f.w(49, v); B.cylW(x2, z2, y, 0.03, 0.03, 0.9, M.metal, 6); }
      // 北侧绿色看台台阶（4 级）
      const stepM = B.courtMat(0x3f9a5c);
      for (let k = 0; k < 4; k++) { const [x, z] = f.w(25, -6.5 - k * 1.1); B.boxW(x, z, y, 44, 0.45 * (k + 1), 1.1, poolAng, stepM); }
      // 遮阳伞
      for (const u of [8, 22, 36]) { const [x, z] = f.w(u, 31); B.cylW(x, z, y, 0.04, 0.04, 2.4, M.metal, 6); const g = new THREE.ConeGeometry(1.6, 0.6, 12); g.translate(x, y + 2.5, z); B.solid(g, B.epdm(0x2f8fc8, "umb")); }
      B.fence(B.polyPx(f, [[-6, -12], [58, -12], [58, 27], [14, 27], [14, 41], [-6, 41]]).map(W), 2.0, true, 0);
    }
    // 西侧敞廊（看台 / 体育用房）：灰瓦四坡顶 + 立柱 + 后墙
    {
      const p = PAVILION, f = B.frame(p.c, p.ang);
      for (let u = -p.len / 2 + 1; u <= p.len / 2 - 1; u += 5) for (const v of [-p.dep / 2 + 0.6, p.dep / 2 - 0.6]) { const [x, z] = f.w(u, v); B.cylW(x, z, 0, 0.22, 0.22, 4.6, M.white, 10); }
      const back = B.polyPx(f, B.rectL(-p.len / 2 + 1, p.dep / 2 - 1.2, p.len / 2 - 1, p.dep / 2 - 0.5));
      B.building({ id: "tiyu_side", name: "游泳池看台 · 体育用房", poly: back, h: 4.6, style: "grey", parapet: 0, label: false, info: "游泳池西侧的灰瓦四坡顶敞廊，下设看台座椅、更衣与器材用房。" });
      B.pitchedRoof({ c: p.c, len: p.len, dep: p.dep, ang: p.ang }, 4.6, { type: "hip", pitch: 3.2, color: 0x5f6870, overhang: 0.9 });
      B.polyL(f, B.rectL(-p.len / 2, -p.dep / 2, p.len / 2, p.dep / 2), 0.08, M.slabs, 4.8);
      B.mark({ kind: "poly", poly: B.rect(p.c, p.len, p.dep, p.ang), cls: "building", pad: 0.5 });
      for (let u = -p.len / 2 + 4; u < p.len / 2 - 3; u += 4) B.bench(...f.w(u, 2), p.ang + Math.PI / 2);
      B.items.pavilion = { id: "pavilion", name: "游泳池敞廊", pos: new THREE.Vector3(...[W(p.c)[0], 9.5, W(p.c)[1]]), info: "", label: false };
    }

    // ---------- 体育训练馆（白色、南立面弧形） ----------
    {
      const a = HALL_S[0], b = HALL_S[1], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy), ox = -dy / L, oy = dx / L;   // 外法线（朝南）
      const arc = [];
      for (let i = 0; i <= 16; i++) { const t = i / 16, bulge = Math.sin(t * Math.PI) * 14; arc.push([a[0] + dx * t + ox * bulge, a[1] + dy * t + oy * bulge]); }
      const poly = [HALL_N[0], HALL_N[1]].concat(arc.slice().reverse());
      B.building({ id: "tiyu", name: "体育训练馆", poly, h: 18, style: "hall", boxes: [{ c: [470, 560], len: 6, dep: 5, ang: poolAng, h: 1.8 }, { c: [495, 552], len: 6, dep: 5, ang: poolAng, h: 1.8 }, { c: [440, 585], len: 9, dep: 7, ang: poolAng, h: 3 }],
        info: "白色立面的体育训练馆（3 层通高大空间），南立面为弧形并有“体育训练馆”字样，北邻室外游泳池，承担体育课与校队训练。" });
      // 南立面招牌
      const c = document.createElement("canvas"); c.width = 512; c.height = 96; const g = c.getContext("2d");
      g.fillStyle = "#2b2f33"; g.font = "bold 62px 'Noto Serif CJK SC','Noto Sans CJK SC','Songti SC','SimSun',serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("体 育 训 练 馆", 256, 50);
      const sm = new THREE.MeshBasicMaterial({ map: canvasTex(c), transparent: true, depthWrite: false });
      const [sx, sz] = W(arc[8]), out = new THREE.Vector3(ox, 0, oy).normalize();
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(16, 3), sm);
      sign.position.set(sx, 12.5, sz).addScaledVector(out, 0.3); sign.lookAt(sign.position.clone().add(out)); K.scene.add(sign);
    }

    // ---------- 网球场 4 片（2×2）+ 排球场 3 片 ----------
    {
      const f = B.frame([182, 415], tennisAng), y = 0.06;
      const surround = B.courtMat(0x3d7a57), blue = B.decal(B.courtMat(0x4d6c86), 1), orange = B.decal(B.courtMat(0xd27536), 1);
      B.polyL(f, B.rectL(0, 0, 68, 34), y, surround, 5);
      B.mark({ kind: "poly", poly: B.polyPx(f, B.rectL(0, 0, 68, 34)), cls: "court" });
      for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
        const cu = 17 + i * 34, cv = 8.5 + j * 17;
        B.polyL(f, B.rectL(cu - 13.9, cv - 5.5, cu + 13.9, cv + 5.5), y + 0.01, blue, 5);
        B.rectLineL(f, cu - 11.885, cv - 5.485, cu + 11.885, cv + 5.485, 0.05, y + 0.03, M.paint);
        B.lineL(f, [[cu - 11.885, cv - 4.115], [cu + 11.885, cv - 4.115]], 0.05, y + 0.03, M.paint);
        B.lineL(f, [[cu - 11.885, cv + 4.115], [cu + 11.885, cv + 4.115]], 0.05, y + 0.03, M.paint);
        B.lineL(f, [[cu - 6.4, cv - 4.115], [cu - 6.4, cv + 4.115]], 0.05, y + 0.03, M.paint);
        B.lineL(f, [[cu + 6.4, cv - 4.115], [cu + 6.4, cv + 4.115]], 0.05, y + 0.03, M.paint);
        B.lineL(f, [[cu - 6.4, cv], [cu + 6.4, cv]], 0.05, y + 0.03, M.paint);
        const [ax, az] = f.w(cu, cv - 6.4), [bx, bz] = f.w(cu, cv + 6.4); B.net(ax, az, bx, bz, 1.07, y);
      }
      B.fence(B.polyPx(f, B.rectL(0, 0, 68, 34)).map(W), 4, true, 0);
      // 排球场（长轴南北向）
      B.polyL(f, B.rectL(6, 37, 62, 62), y, surround, 5);
      B.mark({ kind: "poly", poly: B.polyPx(f, B.rectL(6, 37, 62, 62)), cls: "court" });
      for (let i = 0; i < 3; i++) {
        const cu = 15 + i * 19, cv = 49.5;
        B.polyL(f, B.rectL(cu - 4.5, cv - 9, cu + 4.5, cv + 9), y + 0.01, orange, 5);
        B.rectLineL(f, cu - 4.5, cv - 9, cu + 4.5, cv + 9, 0.05, y + 0.03, M.paint);
        B.lineL(f, [[cu - 4.5, cv], [cu + 4.5, cv]], 0.05, y + 0.03, M.paint);
        B.lineL(f, [[cu - 4.5, cv - 3], [cu + 4.5, cv - 3]], 0.05, y + 0.03, M.paint);
        B.lineL(f, [[cu - 4.5, cv + 3], [cu + 4.5, cv + 3]], 0.05, y + 0.03, M.paint);
        const [ax, az] = f.w(cu - 5.5, cv), [bx, bz] = f.w(cu + 5.5, cv); B.net(ax, az, bx, bz, 2.43, y);
      }
      B.fence(B.polyPx(f, B.rectL(6, 37, 62, 62)).map(W), 3, true, 0);
      [[0, 0], [68, 0], [0, 34], [68, 34]].forEach(([u, v]) => { const [x, z] = f.w(u + (u ? 1 : -1), v + (v ? 1 : -1)); B.floodlight(x, z, 12, tennisAng + (v ? -Math.PI / 2 : Math.PI / 2), 2); });
    }

    // ---------- 周边 A 区宿舍（北端，背景） ----------
    [["A4", [[510, 721], [552, 707], [604, 862], [562, 876]]], ["A3", [[629, 695], [671, 681], [723, 836], [681, 851]]], ["A2", [[754, 674], [796, 660], [848, 813], [807, 828]]], ["A1", [[872, 653], [914, 639], [967, 789], [925, 805]]]]
      .forEach(([id, poly]) => B.building({ id, name: id + " 学生公寓", poly, h: 22, style: "dormc", label: false, boxes: [{ c: B.centroid(poly), len: 7, dep: 5, ang: angOf(poly[0], poly[3]), h: 3 }], info: "A 区学生公寓（背景）。" }));

    // ---------- 绿篱、花带 ----------
    const flowerBed = B.epdm(0xc85a8c, "flower");
    B.hedge([W([600, 515]), W([770, 478])], 1.0, 1.1);
    B.hedge([W([220, 590]), W([380, 560])], 0.9, 0.9);
    B.hedge([W([830, 545]), W([1260, 452])], 1.0, 1.0);
    B.ribbon([[860, 548], [1230, 468]], 4, 0.15, flowerBed, false, "paved");
    return {};
  }

  // ---------------- 树位（交给 EcoLife：池塘同款树木 + 公告板 LOD） ----------------
  function treeSpots() {
    const spots = [];
    const seg = (a, b, step, off) => { const L = Math.hypot(b[0] - a[0], b[1] - a[1]), ux = (b[0] - a[0]) / L, uy = (b[1] - a[1]) / L; for (let d = step / 2; d < L; d += step) spots.push([a[0] + ux * d - uy * off, a[1] + uy * d + ux * off]); };
    // 二环路行道树（南侧人行道外）
    seg(ERHUAN[0], ERHUAN[1], 22, 36);
    // 二环路与场地之间的林带（两排错位）
    seg([140, 345], [1290, 92], 30, 0); seg([155, 368], [1290, 118], 34, 0);
    // 环校路行道树
    for (let i = 1; i < ROAD_RING.length - 2; i++) { seg(ROAD_RING[i], ROAD_RING[i + 1], 24, -22); seg(ROAD_RING[i], ROAD_RING[i + 1], 26, 22); }
    // 篮球台西侧银杏、训练馆东侧、网球场南侧
    seg([560, 352], [585, 492], 14, -12); seg([580, 600], [575, 520], 16, 14); seg([200, 610], [380, 575], 18, 10);
    // 田径场南侧林带
    seg([840, 560], [1270, 470], 26, 14);
    return spots;
  }

  const cfg = {
    zoneId: "sports_ring", zoneName: "运动场周边", icon: "⚽", panelTitle: "运动场周边生态", seed: 11,
    region: { x0: 110, y0: 30, x1: 1300, y1: 690 }, waterLevel: 0.12, heightAt,
    platforms: [{ poly: BASKET, y: PLATFORM_Y }],
    intro: "二环路北段与环校路之间的运动区：400 米标准田径场（天然草足球场）、高台上的 9 片篮球场、4 片网球场与 3 片排球场、L 形室外游泳池与白色体育训练馆，外围是行道树与林带。",
    highlights: ["400 米跑道", "9 片篮球场", "L 形游泳池", "行道香樟", "林带"],
    build,
    life: {
      roads: [{ name: "环校路", width: 24, path: ROAD_RING }, { name: "体育馆支路", width: 14, path: ROAD_GYM }],
      blockers: [GONG_N, GONG_S, BASKET, ZB.rect(PAVILION.c, PAVILION.len, PAVILION.dep, PAVILION.ang)],
      courts: [TRACK], plazas: [], trees: treeSpots(),
      catLawn: [[600, 500], [780, 470], [800, 540], [610, 590]], catHome: [690, 535],
    },
    // 官网导览图为自南偏西（SSW）看向北的斜轴测：镜头方位约 -0.25 弧度（偏西），俯角约 30°（平面 y 向压缩约一半）
    overview: { t: [W([720, 380])[0], 0, W([720, 380])[1]], d: 470, polar: 1.02, az: -0.25 },
    views: {
      track: { t: [W(trackC)[0], 0, W(trackC)[1]], d: 170, polar: 0.95, az: -0.25 },
      basket: { t: [W([662, 400])[0], 3, W([662, 400])[1]], d: 85, polar: 0.92, az: -0.25 },
      pool: { t: [W([455, 430])[0], 0, W([455, 430])[1]], d: 80, polar: 0.95, az: -0.25 },
      tennis: { t: [W([265, 480])[0], 0, W([265, 480])[1]], d: 85, polar: 0.9, az: -0.25 },
      edit: { t: [W([690, 535])[0], 0, W([690, 535])[1]], d: 60, polar: 0.55, az: 0.3 },
    },
    viewButtons: [{ id: "track", label: "🏃 田径场" }, { id: "basket", label: "🏀 篮球场" }, { id: "pool", label: "🏊 游泳池" }, { id: "tennis", label: "🎾 网球场" }],
    labels: [
      { text: "400 米田径场", p: trackC, h: 6 }, { text: "篮球场（9 片）", p: [662, 400], h: 10 }, { text: "游泳池", p: [450, 405], h: 4 },
      { text: "网球场（4 片）", p: [265, 450], h: 5 }, { text: "排球场（3 片）", p: [270, 545], h: 4 }, { text: "二环路北段", p: [700, 200], h: 1, cls: "road" }, { text: "环校路", p: [760, 615], h: 1, cls: "road" },
    ],
    tourSpeed: 11,
    tour: (() => {
      const k = (px, h, tpx, th, cap) => { const [x, z] = W(px), [tx, tz] = W(tpx); return { p: [x, h, z], t: [tx, th, tz], cap }; };
      return [
        k([700, 760], 140, [700, 420], 0, "运动场周边 · 全景"),
        k([1090, 560], 45, [1010, 360], 0, "400 米标准跑道 · 天然草足球场"),
        k([1300, 330], 38, [1050, 330], 2, "田径场东端 · 弯道与高杆灯"),
        k([1050, 120], 40, [900, 380], 0, "二环路行道树与林带"),
        k([790, 250], 30, [700, 400], 3, "建筑与工程学院 · 田径场西端"),
        k([700, 520], 26, [660, 400], 4, "高台篮球场 · 9 片（3×3）"),
        k([520, 330], 24, [460, 410], 0, "L 形室外游泳池 · 看台台阶"),
        k([330, 430], 20, [430, 440], 3, "灰瓦敞廊 · 体育用房"),
        k([210, 600], 30, [270, 480], 0, "网球场 4 片 · 排球场 3 片"),
        k([470, 720], 40, [480, 590], 10, "白色体育训练馆 · 弧形南立面"),
      ];
    })(),
    species: {
      catalog: ["camphor", "ginkgo", "metasequoia", "osmanthus", "cherry", "azalea", "hedge", "cat", "magpie", "sparrow", "butterfly"],
      seeds: {
        camphor: [[640, 540], [720, 520], [300, 625]],
        ginkgo: [[600, 520], [640, 512], [680, 503]],
        metasequoia: [[886, 588], [966, 571], [1046, 553]],
        osmanthus: [[600, 595], [660, 575]],
        azalea: [[612, 560], [630, 556], [700, 545], [745, 535]],
        cat: [[680, 540]],
        magpie: [[1000, 200], [700, 555]],
        sparrow: [[452, 476], [458, 478], [610, 548]],
        butterfly: [[690, 530], [735, 528]],
      },
    },
    extraList: () => '<h3>场地 <small>按官网导览图</small></h3><ul class="zk-facts"><li>🏃 400 米标准跑道 8 条分道 · 天然草足球场 105×68 米</li><li>🏀 篮球场 9 片（3×3），毛石挡土墙高台约 3 米</li><li>🎾 网球场 4 片（2×2）· 🏐 排球场 3 片</li><li>🏊 L 形室外游泳池 1 座（50×21 米 + 浅水池）</li></ul>',
  };
  window.addEventListener("DOMContentLoaded", () => window.ZoneKit.start(cfg).catch((e) => { console.error(e); const m = document.getElementById("loadmsg"); if (m) m.textContent = "加载失败：" + e.message; }));
})();
