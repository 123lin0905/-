/*
 * C 区宿舍庭院 · 板块细节 3D 场景（池塘同款写实画风，真实尺寸）
 * ------------------------------------------------------------------------------
 * 布局依据：学校官网绵阳校区三维导览图（手绘斜轴测鸟瞰图，自西南偏南俯视，ref/official/c_court_kindergarten/）与平面图
 *   campus_layout.json（0.4 米 / 像素），通过 plan_to_official_affine.json 把平面图坐标投到导览图上逐项比对：
 *   - C1–C7：翠湖东岸两排错位的 7 栋板式学生公寓（湖侧 4 栋 + 后排 3 栋），约 7 层，砖红色墙面 + 灰色腰线，平屋顶上有楼梯 / 电梯间；
 *   - C8–C10：8 层砖红色组合楼，两个互相咬合的“凹 / 口”字形体量围出 2 个内庭院（庭院内草坪 + 乔木），平面数据与官网一致，
 *             本场景在西翼 / 东翼补上连接段，使两个内庭院闭合（与导览图相同）；
 *   - 教师公寓：园兴西街北侧的 4 层长条砖楼，灰瓦四坡屋顶（平面数据中 22 米偏高，按约 4 层 13 米绘制，见 ZONE_PATCH.md）；
 *   - 幼儿园：彩色坡屋顶建筑群（红瓦 / 黄瓦），中部平屋顶连廊围合弧形内院与玻璃穹顶采光井，西侧小型红色塑胶跑道（田径场），
 *             南侧蓝色软质活动广场（升旗台）、东侧游戏场，彩色围栏临园兴西街；东北为机动车停车场；
 *   - 庭院绿化：楼间草坪、香樟 / 桂花 / 银杏行道树、粉色樱花与紫薇点缀，湖岸垂柳，步道与入口小路；外围是环校路、园兴西街。
 * 坐标：与全景一致（x=(px-1024)*0.4，z=(py-999)*0.4，米）。依赖 zone-kit/*.js。
 */
(function () {
  "use strict";
  const ZB = window.ZoneBuild, W = ZB.W;
  const R4 = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];   // 平面图轴对齐矩形（像素）
  const angOf = (a, b) => Math.atan2(b[1] - a[1], b[0] - a[0]);

  // ---------------- 平面图坐标（像素） ----------------
  const SLABS = {
    C1: [[405, 1099], [444, 1087], [481, 1191], [441, 1204]],
    C2: [[458, 1220], [496, 1208], [531, 1311], [491, 1324]],
    C3: [[504, 1358], [541, 1353], [556, 1463], [519, 1468]],
    C4: [[528, 1505], [566, 1505], [566, 1614], [528, 1614]],
    C5: [[493, 1066], [531, 1053], [569, 1155], [531, 1168]],
    C6: [[543, 1183], [582, 1170], [619, 1273], [580, 1285]],
    C7: [[590, 1306], [629, 1294], [666, 1395], [627, 1407]],
  };
  // C8–C10 组合楼：拆成互不重叠的矩形，两个内庭院闭合
  const COMPLEX = {
    C8: [R4(632, 1428, 807, 1465), R4(632, 1465, 671, 1505), R4(773, 1465, 807, 1590)],
    C9: [R4(632, 1505, 671, 1661), R4(671, 1567, 773, 1614), R4(731, 1614, 773, 1663)],
    C10: [R4(632, 1661, 671, 1722), R4(731, 1663, 773, 1722), R4(632, 1722, 773, 1768)],
  };
  const COURT1 = R4(671, 1465, 773, 1567), COURT2 = R4(671, 1614, 731, 1722);
  const TEACHER = { main: R4(345, 1726, 573, 1768), wingW: R4(345, 1698, 373, 1726), wingE: R4(543, 1698, 573, 1726) };
  const CUIHU = [[308, 1217], [397, 1196], [460, 1327], [507, 1526], [465, 1599], [345, 1583], [303, 1484], [303, 1317]];
  const ISLAND = { c: [408, 1405], r: 26 };
  const KG = R4(784, 1640, 985, 1810);                 // 幼儿园围墙范围
  const PARKING = R4(852, 1588, 978, 1632);
  // 道路
  const YUANXING = [[260, 1844], [1060, 1844]];          // 园兴西街（双向四车道）
  const RING = [[1149, 1719], [1029, 1635], [946, 1484], [872, 1254], [731, 1134], [616, 1029], [512, 959]];   // 环校路
  const PARK_ROAD = [[978, 1610], [1000, 1612]];
  // 步道（铺装）
  const PROMENADE = [[452, 1205], [470, 1270], [482, 1325], [500, 1405], [514, 1490], [508, 1560], [486, 1612], [450, 1650], [400, 1665], [330, 1665]];
  const SPINE = [[470, 1035], [488, 1125], [538, 1250], [581, 1380], [600, 1480], [600, 1815]];
  const EAST_WALK = [[600, 1035], [640, 1150], [680, 1265], [705, 1350], [716, 1418]];
  const NORTH_WALK = [[600, 1418], [818, 1418]];
  const COMPLEX_E = [[818, 1418], [818, 1635], [784, 1635]];
  const PATHS = [
    { path: PROMENADE, w: 10 }, { path: SPINE, w: 12 }, { path: EAST_WALK, w: 9 }, { path: NORTH_WALK, w: 9 }, { path: COMPLEX_E, w: 8 },
    { path: [[460, 1206], [511, 1192], [545, 1170], [600, 1158], [640, 1150]], w: 6 },     // C1/C2 ↔ C5/C6 间横路
    { path: [[485, 1340], [535, 1320], [565, 1300], [620, 1295], [680, 1275]], w: 6 },     // C2/C3 ↔ C6/C7
    { path: [[510, 1488], [560, 1480], [600, 1480]], w: 6 },                                // C3/C4 → 中路
    { path: [[600, 1640], [632, 1640]], w: 5 },                                            // 中路 → C9 西门
    { path: [[580, 1700], [600, 1700]], w: 5 },
    { path: [[818, 1520], [807, 1520]], w: 5 },
  ];

  function heightAt() { return 0; }

  function build(K) {
    const B = K.B, M = B.M, look = K.look, cfg = K.cfg;
    const water = look.waterMaterial({ key: "cuihu", color: 0x3d7f86, scale: 0.08 });

    // ---------- 翠湖（东岸局部）+ 湖心岛 ----------
    B.flat(CUIHU, water, 0.12, "water");
    B.line(CUIHU.map(W), 0.6, 0.16, M.granite, true);
    B.disc(ISLAND.c, ISLAND.r, M.lawn, 0.3, "grass", 40);

    // ---------- 道路 ----------
    {
      B.ribbon(YUANXING, 40, 0.04, M.asphalt, false, "road");
      const a = W(YUANXING[0]), b = W(YUANXING[1]), L = Math.hypot(b[0] - a[0], b[1] - a[1]), ux = (b[0] - a[0]) / L, uz = (b[1] - a[1]) / L, nx = -uz, nz = ux;
      const off = (d, o) => [a[0] + ux * d + nx * o, a[1] + uz * d + nz * o];
      for (const o of [-0.18, 0.18]) B.line([off(0, o), off(L, o)], 0.15, 0.06, M.yellowPaint);
      for (const o of [-3.8, 3.8]) for (let d = 0; d < L; d += 9) B.line([off(d, o), off(d + 4, o)], 0.15, 0.06, M.paint);
      for (const o of [-7.4, 7.4]) B.line([off(0, o), off(L, o)], 0.15, 0.06, M.paint);
      // 北侧人行道 + 路缘石（树池行道树）
      B.stripW([off(0, -10.4), off(L, -10.4)], 4.4, 0.12, M.pavers, false, false);
      B.line([off(0, -8.2), off(L, -8.2)], 0.3, 0.16, M.granite);
      B.mark({ kind: "path", path: [[260, 1818], [1060, 1818]], hw: 7, cls: "paved" });
      // 幼儿园门前斑马线
      for (let k = 0; k < 8; k++) { const d = W([905, 1844])[0] - a[0] - 4 + k * 1.1; B.line([off(d, -7), off(d, 7)], 0.5, 0.06, M.paint); }
    }
    B.ribbon(RING, 26, 0.05, M.asphalt, false, "road");
    for (let i = 0; i < RING.length - 1; i++) {
      const a = W(RING[i]), b = W(RING[i + 1]), L = Math.hypot(b[0] - a[0], b[1] - a[1]), ux = (b[0] - a[0]) / L, uz = (b[1] - a[1]) / L;
      for (let d = 2; d < L - 3; d += 8) B.line([[a[0] + ux * d, a[1] + uz * d], [a[0] + ux * (d + 4), a[1] + uz * (d + 4)]], 0.14, 0.07, M.paint);
    }
    // 环校路内侧红色步道（导览图中沿路的彩色人行道）
    B.ribbon(RING.map(([x, y], i) => [x - 22, y + (i < 3 ? -4 : 6)]).slice(1, 6), 6, 0.06, B.epdm(0xb0705a, "walk"), false, "paved");

    // ---------- 步道 ----------
    PATHS.forEach((p) => B.ribbon(p.path, p.w, 0.07, M.pavers, false, "paved"));
    // 公寓入口小广场
    Object.values(SLABS).forEach((poly) => {
      const c = B.centroid(poly), a = angOf(poly[0], poly[3]), f = B.frame(c, a);
      const dep = Math.hypot(poly[1][0] - poly[0][0], poly[1][1] - poly[0][1]) * B.S;
      B.polyL(f, B.rectL(-5, -dep / 2 - 5, 5, dep / 2 + 5), 0.065, M.slabs, 4.8);
    });

    // ---------- C1–C7 板式学生公寓 ----------
    const DORM_INFO = "C 区学生公寓，约 7 层砖红色板楼，灰色腰线，平屋顶上设楼梯间 / 电梯机房。楼前是香樟、桂花与樱花围合的庭院绿地。";
    Object.entries(SLABS).forEach(([id, poly]) => {
      const a = angOf(poly[0], poly[3]), c = B.centroid(poly);
      const L = Math.hypot(poly[3][0] - poly[0][0], poly[3][1] - poly[0][1]);
      const ux = Math.cos(a), uy = Math.sin(a);
      const boxes = [-0.28, 0.28].map((t) => ({ c: [c[0] + ux * L * t, c[1] + uy * L * t], len: 5, dep: 8, ang: a, h: 3.2 }));
      B.building({ id, name: id + " 学生公寓", poly, h: 22, style: "dormc", boxes, info: DORM_INFO });
    });

    // ---------- C8–C10 组合楼（8 层，两个内庭院） ----------
    Object.entries(COMPLEX).forEach(([id, parts]) => {
      parts.forEach((poly, i) => {
        const c = B.centroid(poly), long = Math.abs(poly[1][0] - poly[0][0]) >= Math.abs(poly[2][1] - poly[1][1]);
        B.building({ id, name: id + " 学生公寓", poly, h: 26, style: "dormc", label: i === parts.length - 1,
          boxes: i === 0 ? [{ c, len: 6, dep: 6, ang: long ? 0 : Math.PI / 2, h: 3.2 }] : [],
          info: "C8–C10 为 8 层砖红色组合楼，两个互相咬合的“凹 / 口”字形体量围出两个内庭院，院内草坪与香樟、桂花遮阴。" });
      });
    });
    // 屋顶空调机组 / 太阳能热水器
    [[700, 1445], [720, 1590], [705, 1745]].forEach((p) => { const [x, z] = W(p); for (let k = 0; k < 3; k++) B.boxW(x + k * 2.2, z, 26, 1.6, 1.2, 1.6, 0, M.metal); });
    // 内庭院：环形小路 + 中心草坪
    for (const [court, inset] of [[COURT1, 8], [COURT2, 7]]) {
      const [x0, y0] = court[0], [x1, y1] = court[2];
      B.ribbon(R4(x0 + inset, y0 + inset, x1 - inset, y1 - inset), 5, 0.07, M.pavers, true, "paved");
      B.ribbon([[(x0 + x1) / 2, y0], [(x0 + x1) / 2, y0 + inset]], 4, 0.07, M.pavers, false, "paved");
    }

    // ---------- 教师公寓（4 层，灰瓦四坡顶） ----------
    {
      const info = "园兴西街北侧的教师公寓，4 层砖红色长条住宅，灰瓦四坡屋顶，两端各有一段北向翼楼。";
      const roof = { type: "hip", pitch: 3.6, color: 0x5f666d, overhang: 0.8 };
      B.building({ id: "jiaoshi_w", name: "教师公寓", poly: TEACHER.wingW, h: 13, style: "teacher", roof, label: false, info });
      B.building({ id: "jiaoshi_e", name: "教师公寓", poly: TEACHER.wingE, h: 13, style: "teacher", roof, label: false, info });
      B.building({ id: "jiaoshi", name: "教师公寓", poly: TEACHER.main, h: 13, style: "teacher", roof, info });
      // 楼前停车位 / 铺装
      B.flat(R4(380, 1772, 540, 1804), M.slabs, 0.06, "paved");
    }

    // ---------- 幼儿园 ----------
    buildKindergarten(K);

    // ---------- 机动车停车场 ----------
    {
      B.flat(PARKING, M.asphalt, 0.05, "road");
      B.ribbon(PARK_ROAD, 14, 0.05, M.asphalt, false, "road");
      const [x0, y0] = W(PARKING[0]), [x1, y1] = W(PARKING[2]);
      for (let x = x0 + 1; x < x1 - 2; x += 2.6) { B.line([[x, y0 + 0.5], [x, y0 + 5.5]], 0.12, 0.07, M.paint); B.line([[x, y1 - 5.5], [x, y1 - 0.5]], 0.12, 0.07, M.paint); }
      const carCols = [0xc23b2e, 0xe8e8e4, 0x2b2f33, 0x3b6ea8, 0xb8bcbf, 0xe0c040];
      let k = 0;
      for (let x = x0 + 2.3; x < x1 - 2; x += 2.6) for (const row of [0, 1]) {
        if (((k * 7) % 10) < 4) { k++; continue; }
        const cz = row ? y1 - 3 : y0 + 3, col = B.courtMat(carCols[k % carCols.length]);
        B.boxW(x, cz, 0.2, 1.75, 0.7, 4.3, 0, col); B.boxW(x, cz + 0.2, 0.9, 1.6, 0.55, 2.3, 0, M.glass); k++;
      }
    }

    // ---------- 绿篱、花带 ----------
    B.hedge([W([300, 1812]), W([780, 1812])], 0.9, 1.0);
    B.hedge([W([614, 1418]), W([614, 1790])], 0.8, 0.9);
    B.hedge([W([826, 1430]), W([826, 1590])], 0.8, 0.9);
    const pink = B.epdm(0xd76b9a, "flower");
    B.ribbon([[640, 1414], [800, 1414]], 3, 0.15, pink, false, "paved");
    B.ribbon([[300, 1806], [780, 1806]], 3, 0.15, pink, false, "paved");

    // ---------- 树位（交给 EcoLife） ----------
    cfg.life.trees = treeSpots(B, cfg);
    return {};
  }

  // ================= 幼儿园 =================
  function buildKindergarten(K) {
    const B = K.B, M = B.M;
    // 场地：彩色塑胶 / 铺装
    B.flat(KG, M.slabs, 0.06, "paved");
    // 西侧小型田径场：4 条分道椭圆跑道（直道 38 米、内半径 4 米）+ 内场人造草
    {
      const f = B.frame([808, 1725], Math.PI / 2), R0 = 4.2, L0 = 38, LANE = 1.0, N = 4;
      B.polyL(f, B.ovalL(0, 0, L0, R0 + N * LANE + 0.6, 40), 0.09, M.track, 2.5);
      B.polyL(f, B.ovalL(0, 0, L0, R0, 30), 0.1, B.courtMat(0x3f8d4a), 4);
      for (let i = 0; i <= N; i++) B.lineL(f, B.ovalL(0, 0, L0, R0 + i * LANE, 36), 0.05, 0.12, M.paint, true);
      B.lineL(f, [[L0 / 2 - 3, -R0], [L0 / 2 - 3, -R0 - N * LANE]], 0.08, 0.12, M.paint);
      B.mark({ kind: "poly", poly: B.polyPx(f, B.ovalL(0, 0, L0, R0 + N * LANE + 0.6, 24)), cls: "court" });
    }
    // 南侧蓝色软质活动广场 + 黄色圆形图案 + 升旗台
    {
      const plaza = [[862, 1748], [952, 1748], [952, 1802], [862, 1802]];
      B.flat(plaza, B.epdm(0x2f6fae, "soft"), 0.08, "paved");
      B.disc([892, 1772], 14, B.epdm(0xe3b53c, "softy"), 0.09);
      B.disc([892, 1772], 10, B.epdm(0x2f6fae, "soft"), 0.1);
      B.flat([[872, 1790], [940, 1790], [940, 1800], [872, 1800]], B.epdm(0x3aa36a, "softg"), 0.09);
      const [fx, fz] = W([925, 1762]);
      B.boxW(fx, fz, 0, 6, 0.45, 3, 0, M.granite);
      [-1.8, 0, 1.8].forEach((o, i) => {
        B.cylW(fx + o, fz, 0.45, 0.06, 0.04, i === 1 ? 10 : 8.5, M.white, 8);
        const flag = new THREE.PlaneGeometry(1.8, 1.2); flag.translate(fx + o + 0.95, (i === 1 ? 10 : 8.5) - 0.3, fz);
        B.solid(flag, B.epdm(i === 1 ? 0xd8262a : 0xf2f2f2, i === 1 ? "flag" : "flagw"));
      });
    }
    // 东侧游戏场：绿色塑胶 + 滑梯 / 攀爬架 / 秋千
    {
      B.flat([[956, 1688], [982, 1688], [982, 1804], [956, 1804]], B.epdm(0x5aa760, "softg2"), 0.08, "paved");
      const red = B.epdm(0xd8413a, "play1"), yel = B.epdm(0xf0c23a, "play2"), blu = B.epdm(0x3c7fd0, "play3");
      const [px, pz] = W([968, 1712]);
      B.boxW(px, pz, 0, 3, 2.2, 3, 0, blu); B.boxW(px, pz, 2.2, 3.4, 0.25, 3.4, 0, red);
      const roofG = new THREE.ConeGeometry(2.4, 1.6, 4); roofG.rotateY(Math.PI / 4); roofG.translate(px, 3.25, pz); B.solid(roofG, yel);
      const slide = new THREE.BoxGeometry(0.9, 0.12, 4.6); slide.rotateX(-0.5); slide.translate(px, 1.2, pz + 3.6); B.solid(slide, yel);
      const [sx, sz] = W([968, 1760]);
      for (const o of [-2, 2]) B.cylW(sx, sz + o, 0, 0.08, 0.08, 2.4, red, 8);
      B.boxW(sx, sz, 2.35, 0.12, 0.12, 4.2, 0, red);
      for (const o of [-0.9, 0.9]) B.boxW(sx, sz + o, 0.5, 0.5, 0.06, 0.25, 0, blu);
      // 沙池
      B.disc([968, 1786], 7, B.epdm(0xe6d29a, "sand"), 0.1);
    }
    // 建筑群：彩色坡屋顶（红瓦 / 黄瓦）+ 平屋顶连廊 + 玻璃穹顶采光井
    const RED = 0xc4563c, YEL = 0xd9b45c;
    const INFO = "幼儿园：彩色坡屋顶的 2–3 层建筑群，设一楼大厅、绘本区、美术厅、感统室、多媒体教室与扎染区；南侧是活动广场与升旗台，西侧有小型田径场。";
    const K1 = (id, c, len, dep, ang, h, style, roof, label) => B.building({ id, name: "幼儿园", rect: { c, len, dep, ang }, h, style, roof, label: !!label, info: INFO });
    K1("kg_nw", [856, 1660], 24, 11, 0, 7, "kcream", { type: "gable", pitch: 3.4, color: YEL, overhang: 0.6, gableMat: B.wallMat("kcream") });
    K1("kg_w", [842, 1690], 14, 10, Math.PI / 2, 7.5, "kbrick", { type: "hip", pitch: 3.2, color: RED, overhang: 0.6 });
    K1("kg_sw", [845, 1720], 16, 11, Math.PI / 2, 8, "kcream", { type: "gable", pitch: 3.4, color: YEL, overhang: 0.6, gableMat: B.wallMat("kcream") });
    K1("kg_s", [860, 1739], 14, 10, 0, 8, "kbrick", { type: "gable", pitch: 3.2, color: RED, overhang: 0.6, gableMat: B.wallMat("kbrick") });
    K1("kg_c", [893, 1706], 15, 10, Math.PI / 2, 10.5, "kbrick", { type: "gable", pitch: 3.8, color: RED, overhang: 0.7, gableMat: B.wallMat("kbrick") });
    K1("kg_e", [928, 1716], 16, 12, Math.PI / 2 - 0.25, 8.5, "kbrick", { type: "gable", pitch: 3.6, color: RED, overhang: 0.7, gableMat: B.wallMat("kbrick") });
    // 平屋顶连廊（灰色涂料），围出弧形内院
    B.building({ id: "youeryuan", name: "幼儿园", poly: [[858, 1668], [918, 1668], [918, 1690], [906, 1690], [906, 1676], [866, 1676], [866, 1712], [854, 1712], [854, 1668]], h: 4.2, style: "grey", parapet: 0.6, info: INFO });
    // 弧形内院的玻璃幕墙
    {
      const [cx, cz] = W([882, 1700]), pts = [];
      for (let i = 0; i <= 18; i++) { const a = Math.PI * 0.95 + (Math.PI * 1.1) * (i / 18); pts.push([cx + Math.cos(a) * 9, cz + Math.sin(a) * 9]); }
      for (let i = 0; i < pts.length - 1; i++) {
        const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
        B.boxW((ax + bx) / 2, (az + bz) / 2, 0, Math.hypot(bx - ax, bz - az) + 0.05, 4.2, 0.15, Math.atan2(bz - az, bx - ax), M.glass);
      }
      // 玻璃穹顶采光井（圆形天窗）
      const [dx, dz] = W([876, 1680]);
      B.cylW(dx, dz, 4.2, 3.6, 3.6, 0.6, M.white, 28);
      const dome = new THREE.SphereGeometry(3.3, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2); dome.scale(1, 0.45, 1); dome.translate(dx, 4.8, dz); B.solid(dome, M.glass);
    }
    // 南立面玻璃门厅 + 白色雨棚
    {
      const [gx, gz] = W([876, 1752]); B.boxW(gx, gz, 0, 9, 4.0, 4, 0, M.glass); B.boxW(gx, gz, 4.0, 9.4, 0.25, 4.4, 0, M.white);
      const [cx, cz] = W([915, 1745]); B.boxW(cx, cz, 2.8, 14, 0.15, 3, 0, M.white);
      for (const o of [-6.5, 6.5]) B.cylW(cx + o, cz + 1.3, 0, 0.08, 0.08, 2.8, M.white, 8);
    }
    // 围栏：南侧彩色矮墙 + 铁艺栏杆，其余铁丝网
    {
      const cols = [0xd8413a, 0xf08a2e, 0xf0c23a, 0x5aa760, 0x3c7fd0, 0x8a5bc8].map((c, i) => B.epdm(c, "rb" + i));
      const [x0, z0] = W(KG[0]), [x1, z1] = W(KG[2]);
      let i = 0;
      for (let x = x0 + 0.6; x < x1 - 0.6; x += 1.2, i++) { if (Math.abs(x - W([905, 0])[0]) < 3) continue; B.boxW(x, z1, 0, 1.15, 0.9, 0.25, 0, cols[i % cols.length]); }
      B.fence([[x0, z1], [x1, z1]], 1.8, false, 0);
      B.fence([[x1, z1], [x1, z0], [x0, z0], [x0, z1]], 1.8, false, 0);
      // 大门（门柱 + 拱形门头）
      const [gx, gz] = W([905, 1810]);
      for (const o of [-3, 3]) B.boxW(gx + o, gz, 0, 0.8, 3.2, 0.8, 0, cols[(o > 0) ? 4 : 0]);
      B.boxW(gx, gz, 3.2, 7, 0.6, 0.8, 0, cols[2]);
    }
    B.mark({ kind: "poly", poly: KG, cls: "paved" });
    // 建筑占地重新登记（paved 之后登记的优先）
    B.marks.filter((m) => m.cls === "building" && m.poly && m.poly.every((p) => ZB.inPoly(p, KG))).forEach((m) => B.marks.push(m));
  }

  // ================= 树位（交给 EcoLife：池塘同款树木 + 公告板 LOD，最多 320 株） =================
  function treeSpots(B, cfg) {
    const spots = [], seedPts = [];
    Object.values(cfg.species.seeds).forEach((a) => a.forEach((p) => seedPts.push(p)));
    const okAt = (p, padPx) => {
      const R = cfg.region; if (p[0] < R.x0 || p[0] > R.x1 || p[1] < R.y0 || p[1] > R.y1) return false;
      if (B.classAt(p[0], p[1], 0) !== "grass") return false;
      if (B.classAt(p[0], p[1], padPx) !== "grass") return false;
      if (seedPts.some((s) => Math.hypot(s[0] - p[0], s[1] - p[1]) < 12)) return false;
      return !spots.some((s) => Math.hypot(s[0] - p[0], s[1] - p[1]) < 13);
    };
    const add = (p, pad) => { if (spots.length < 320 && okAt(p, pad == null ? 6 : pad)) spots.push(p); };
    const seg = (a, b, step, off, pad) => { const L = Math.hypot(b[0] - a[0], b[1] - a[1]), ux = (b[0] - a[0]) / L, uy = (b[1] - a[1]) / L; for (let d = step / 2; d < L; d += step) add([a[0] + ux * d - uy * off, a[1] + uy * d + ux * off], pad); };
    let s = 12345; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    // 1) C8–C10 内庭院
    for (const c of [COURT1, COURT2]) { const [x0, y0] = c[0], [x1, y1] = c[2]; for (let x = x0 + 16; x < x1 - 10; x += 16) for (let y = y0 + 16; y < y1 - 10; y += 18) add([x + (rnd() - 0.5) * 4, y + (rnd() - 0.5) * 4], 3); }
    // 2) 中路、湖滨步道两侧
    for (let i = 0; i < SPINE.length - 1; i++) { seg(SPINE[i], SPINE[i + 1], 20, -13, 4); seg(SPINE[i], SPINE[i + 1], 22, 13, 4); }
    for (let i = 0; i < PROMENADE.length - 1; i++) seg(PROMENADE[i], PROMENADE[i + 1], 18, 11, 3);
    // 3) 楼间庭院（板块范围内的草地）：抖动网格
    const grid = (x0, y0, x1, y1, step, pad) => { for (let y = y0; y < y1; y += step) for (let x = x0; x < x1; x += step) add([x + (rnd() - 0.5) * step * 0.6, y + (rnd() - 0.5) * step * 0.6], pad); };
    grid(430, 1030, 830, 1800, 19, 6);
    // 4) 园兴西街北侧行道树、环校路两侧
    seg([300, 1800], [1050, 1800], 22, 0, 3);
    for (let i = 0; i < RING.length - 1; i++) { seg(RING[i], RING[i + 1], 24, -24, 4); seg(RING[i], RING[i + 1], 26, 24, 4); }
    // 5) 其余草地
    const R = cfg.region;
    grid(R.x0 + 10, R.y0 + 10, R.x1, R.y1, 24, 7);
    return spots;
  }

  const cfg = {
    zoneId: "c_court", zoneName: "C 区宿舍庭院", icon: "🌳", panelTitle: "C 区宿舍庭院生态", seed: 23,
    region: { x0: 300, y0: 1020, x1: 1010, y1: 1868 }, waterLevel: 0.12, heightAt,
    intro: "翠湖东岸的 C 区学生公寓组团：两排错位的 7 栋板式公寓与 8 层双内院组合楼（C8–C10），楼间庭院绿树成荫；南侧是灰瓦坡顶的教师公寓，东南角是彩色坡屋顶的幼儿园与小型田径场。",
    highlights: ["庭院绿地", "香樟", "樱花", "双内庭院", "幼儿园"],
    build,
    life: {
      roads: [{ name: "环校路", width: 26, path: RING }, { name: "园兴西街", width: 40, path: YUANXING }],
      water: [CUIHU],
      blockers: Object.values(SLABS).concat(...Object.values(COMPLEX), Object.values(TEACHER), [KG, PARKING]),
      courts: [KG], plazas: [], trees: [],
      catLawn: [[620, 1200], [700, 1240], [740, 1360], [660, 1400]], catHome: [690, 1330],
    },
    overview: { t: [W([700, 1470])[0], 0, W([700, 1470])[1]], d: 400, polar: 0.98, az: -0.24 },
    views: {
      slabs: { t: [W([540, 1290])[0], 0, W([540, 1290])[1]], d: 170, polar: 0.98, az: -0.24 },
      complex: { t: [W([705, 1580])[0], 8, W([705, 1580])[1]], d: 150, polar: 0.82, az: -0.24 },
      kinder: { t: [W([925, 1725])[0], 0, W([925, 1725])[1]], d: 115, polar: 0.92, az: -0.24 },
      teacher: { t: [W([460, 1740])[0], 0, W([460, 1740])[1]], d: 110, polar: 1.0, az: -0.3 },
      edit: { t: [W([690, 1330])[0], 0, W([690, 1330])[1]], d: 60, polar: 0.6, az: -0.24 },
    },
    viewButtons: [{ id: "slabs", label: "🏢 板楼庭院" }, { id: "complex", label: "🏘 C8–C10 内院" }, { id: "kinder", label: "🧸 幼儿园" }, { id: "teacher", label: "🏠 教师公寓" }],
    labels: [
      { text: "翠湖", p: [400, 1330], h: 2 }, { text: "内庭院", p: [722, 1516], h: 3 }, { text: "内庭院", p: [701, 1668], h: 3 },
      { text: "田径场", p: [808, 1725], h: 2 }, { text: "活动广场", p: [905, 1775], h: 2 }, { text: "机动车停车场", p: [915, 1610], h: 2 },
      { text: "园兴西街", p: [640, 1844], h: 1, cls: "road" }, { text: "环校路", p: [905, 1370], h: 1, cls: "road" },
    ],
    tourSpeed: 10,
    tour: (() => {
      const k = (px, h, tpx, th, cap) => { const [x, z] = W(px), [tx, tz] = W(tpx); return { p: [x, h, z], t: [tx, th, tz], cap }; };
      return [
        k([560, 1980], 150, [650, 1480], 0, "C 区宿舍庭院 · 全景"),
        k([420, 1500], 30, [520, 1400], 6, "翠湖东岸 · 湖滨步道与垂柳"),
        k([505, 1180], 18, [560, 1300], 6, "板楼之间 · 香樟与樱花庭院"),
        k([640, 1100], 40, [600, 1250], 0, "C5–C7 后排公寓"),
        k([850, 1380], 60, [720, 1520], 8, "C8–C10 组合楼 · 8 层双内院"),
        k([720, 1540], 34, [722, 1516], 0, "内庭院 · 草坪与乔木"),
        k([980, 1600], 30, [890, 1700], 4, "幼儿园 · 彩色坡屋顶与玻璃穹顶"),
        k([860, 1860], 20, [880, 1740], 4, "活动广场 · 升旗台 · 小型田径场"),
        k([520, 1880], 26, [460, 1740], 8, "教师公寓 · 灰瓦四坡顶"),
      ];
    })(),
    species: {
      catalog: ["camphor", "osmanthus", "cherry", "crapemyrtle", "ginkgo", "azalea", "hedge", "cat", "magpie", "sparrow", "butterfly"],
      seeds: {
        cherry: [[484, 1160], [541, 1214], [460, 1300], [735, 1290], [690, 1500], [581, 1560]],
        osmanthus: [[667, 1180], [584, 1337], [745, 1540], [700, 1650]],
        camphor: [[720, 1240], [685, 1380], [760, 1395]],
        crapemyrtle: [[545, 1650], [660, 1788]],
        ginkgo: [[855, 1440], [845, 1500]],
        azalea: [[628, 1210], [640, 1230], [578, 1440], [585, 1460], [705, 1310]],
        cat: [[690, 1330]],
        magpie: [[720, 1360], [609, 1239]],
        sparrow: [[702, 1540], [706, 1543], [598, 1600]],
        butterfly: [[612, 1225], [560, 1430]],
      },
    },
    extraList: () => '<h3>组团 <small>按官网导览图</small></h3><ul class="zk-facts"><li>🏢 C1–C7 板式公寓 7 栋（湖侧 4 + 后排 3）· 约 7 层</li><li>🏘 C8–C10 组合楼 8 层 · 两个闭合内庭院</li><li>🏠 教师公寓 4 层 · 灰瓦四坡顶</li><li>🧸 幼儿园：彩色坡屋顶建筑群 · 小型红色跑道 · 活动广场</li></ul>',
  };
  window.addEventListener("DOMContentLoaded", () => window.ZoneKit.start(cfg).catch((e) => { console.error(e); const m = document.getElementById("loadmsg"); if (m) m.textContent = "加载失败：" + e.message; }));
})();
