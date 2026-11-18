/*
 * 教学楼绿化带 · 板块细节场景（光华广场 + 两侧教学楼 + 校门 + 报告厅）
 * ------------------------------------------------------------------------------
 * 依据：官方地图（学校官网“3D 地图”的手绘鸟瞰图，从西南略偏南方向俯看）与官网平面图（campus_layout.json，1 像素 = 0.4 米）。
 *   - 光华广场：校门 → 图书馆的主轴，大块灰 / 米黄拼花铺装；两侧各一排银杏（约 13 株，树池 + 灌木球）；北端抬高的平台与台阶；
 *   - 聚·散雕塑（银色不锈钢旋涡 + 红色半球 + 黑色石基）在广场北端、图书馆一侧，平面图约 (1286, 1250)，旁边是抬高的草坪花池（灌木球 + 红色花带），两侧樱花；
 *   - 校门：两座湖蓝色玻璃雨棚门卫室，中间一个圆形种植岛；校门东侧停车场，园兴西街边有公交候车亭；
 *   - 学术报告厅：圆形玻璃基座 + 浅蓝色扁穹顶；实验楼（智能科技学院）西北角圆柱形玻璃楼梯塔；
 *   - 教学楼：红砖墙 + 白色窗框 / 外廊，平屋面带女儿墙、楼梯间和空调外机；第二教学楼屋面西侧一排小坡顶天窗；
 *   - 第二教学楼南端一片蓝花楹，旁边一排宣传栏；道路两侧香樟行道树，九洲大道、园兴西街外侧行道树。
 * 坐标：平面图像素 (px, py)，K.W() 换算为世界米。
 */
(function () {
  "use strict";
  const THREE = window.THREE, V3 = THREE.Vector3;

  // 光华广场局部坐标：u 沿轴线（北端中点 → 南端中点，米），v 横向（西负东正，米）
  const N0px = [1282.5, 1099.5], AX = [0.3396, 0.9403], EX = [0.9403, -0.3396];
  const PL = 234, PH = 31;

  async function build(K) {
    const { world, W } = K;
    const PZ = (u, v) => { const [x, z] = W(N0px[0], N0px[1]); return [x + AX[0] * u + EX[0] * v, z + AX[1] * u + EX[1] * v]; };
    const C = world.CLS;
    const pw = (pts) => pts.map((p) => W(p[0], p[1]));

    // ================= 地面：道路、广场、人行道 =================
    // 校外道路：九洲大道、园兴西街（双向四车道，中间黄线）
    world.road([[1296, 47], [1964, 1860]], 40, { centerLine: "yellow", edgeLines: true });
    world.road([[880, 1844], [1964, 1844]], 40, { centerLine: "yellow", edgeLines: true });
    // 校外人行道（红砖）
    world.paintPath(C.brick, pw([[880, 1814], [1900, 1814]]), 5);
    world.paintPath(C.brick, pw([[1296 - 30, 47], [1964 - 30, 1860]]), 5);
    // 校内：环校路、教学区西路 / 中路、校门路、中央步道末端
    const ring = [[1149, 496], [1254, 502], [1348, 569], [1421, 731], [1473, 940], [1567, 1202], [1651, 1463], [1677, 1567], [1635, 1672], [1515, 1714], [1149, 1719], [1029, 1635], [946, 1484], [872, 1254]];
    world.road(ring, 26, { centerLine: "white" });
    world.road([[1108, 1149], [1181, 1134], [1348, 1092], [1468, 987]], 20, {});
    world.road([[1113, 1160], [1285, 1724]], 20, {});
    world.road([[1045, 836], [1191, 1092]], 22, { cls: C.pavers, kerb: false });
    // 校门前广场（两座雨棚之间的车行区）+ 校门路
    world.paintPoly(C.asphalt, pw([[1484, 1712], [1560, 1700], [1590, 1760], [1600, 1826], [1470, 1826], [1460, 1760]]));
    // 楼前铺装与步道（花岗岩条石）
    const paversPolys = [
      [[1186, 1132], [1200, 1128], [1266, 1372], [1252, 1378]],               // 第二教学楼东侧步道
      [[1296, 1460], [1310, 1456], [1376, 1690], [1362, 1696]],               // 第一教学楼东侧步道
      [[1386, 1088], [1398, 1083], [1467, 1296], [1456, 1302]],               // 实验楼西侧
      [[1494, 1393], [1506, 1388], [1550, 1540], [1538, 1545]],               // 济民楼西侧
    ];
    paversPolys.forEach((p) => world.paintPoly(C.pavers, pw(p)));
    // 光华广场：外圈石板 + 内部拼花
    const plazaW = pw([[1207, 1118], [1358, 1081], [1557, 1630], [1405, 1672]]);
    world.paintPoly(C.slabs, plazaW);
    world.paintPoly(C.mosaic, [PZ(66, -20), PZ(66, 20), PZ(PL, 20), PZ(PL, -20)]);
    // 报告厅、停车场
    world.paintPoly(C.asphalt, pw([[1606, 1690], [1712, 1672], [1736, 1800], [1612, 1812]]));
    for (let r = 0; r < 3; r++) for (let i = 0; i < 9; i++) {   // 停车位（白线）
      const [x, z] = W(1622 + i * 11.5, 1712 + r * 34); world.decalRect(x, z, 2.5, 5.2, 0, 0.12, "white");
      if ((i + r * 3) % 4 !== 3) world.car(x, z, Math.PI / 2 + (world.rnd() < 0.5 ? 0 : Math.PI));
    }
    // 校内建筑周边种植土（树池）在种树时画
    // 第二教学楼南端草坪（蓝花楹）中的小径
    world.paintPath(C.pavers, pw([[1262, 1392], [1300, 1380]]), 2.4);
    world.bake();

    // ================= 建筑 =================
    const B = (def) => world.building(def);
    B({ id: "jiaoxue1", name: "第一教学楼", poly: [[1252, 1479], [1301, 1463], [1369, 1698], [1327, 1714]], h: 14.4, style: "teach", label: true });
    B({ id: "jiaoxue2", name: "第二教学楼", poly: [[1139, 1149], [1191, 1137], [1259, 1379], [1214, 1395]], h: 14.4, style: "teach", label: true });
    const ring4 = world.pxPoly([[967, 1207], [1066, 1181], [1139, 1421], [1045, 1447]]);
    B({ id: "jiaoxue4", name: "第四教学楼", polyW: ring4, holesW: [world.offsetPoly(ring4, 12)], h: 18, style: "corridor", label: true });
    const ring5 = world.pxPoly([[1061, 1489], [1155, 1463], [1228, 1698], [1139, 1724]]);
    B({ id: "jiaoxue5", name: "第五教学楼", polyW: ring5, holesW: [world.offsetPoly(ring5, 12)], h: 18, style: "corridor", label: true });
    B({ id: "shiyan", name: "实验楼（智能科技学院）", poly: [[1402, 1100], [1447, 1071], [1515, 1285], [1473, 1301]], h: 16, style: "teach", label: true });
    const [tx, tz] = W(1410, 1093);
    B({ id: "shiyan_tower", circleW: { c: [tx, tz], r: 7.4 }, h: 21.6, style: "glass", parapet: 0.6, noFoot: false });
    B({ id: "jimin", name: "济民楼", poly: [[1505, 1390], [1546, 1374], [1590, 1520], [1552, 1533]], h: 14.4, style: "teach", label: true });
    // 图书馆（广场北端的背景建筑）
    [[[1196, 977], [1348, 935], [1364, 993], [1217, 1040]], [[1191, 920], [1233, 904], [1264, 967], [1223, 982]], [[1311, 977], [1353, 967], [1364, 1008], [1322, 1022]]].forEach((p, i) =>
      B({ id: i ? "library_" + i : "library", name: "图书馆", poly: p, h: [18, 22, 14][i], style: "library", label: i === 0 }));
    // 报告厅：玻璃圆形基座 + 浅蓝扁穹顶
    const [bx, bz] = W(1588, 1567);
    B({ id: "baogaoting", name: "学术报告厅", circleW: { c: [bx, bz], r: 16 }, h: 8, style: "glass", parapet: 0, roof: false, label: true, labelY: 9 });
    {
      const ringG = new THREE.CylinderGeometry(16.6, 16.6, 1.2, 64, 1, true).translate(bx, 8.6, bz);
      world.addGeo(ringG, world.MAT.white);
      const capR = 16.8, capH = 4.2, R = (capR * capR + capH * capH) / (2 * capH), th = Math.asin(capR / R);
      const dome = new THREE.SphereGeometry(R, 72, 12, 0, Math.PI * 2, 0, th).translate(bx, 9.2 + capH - R, bz);
      const cv = makeCanvas(512, 256), g = cv.getContext("2d");
      g.fillStyle = "#8fc3e6"; g.fillRect(0, 0, 512, 256);
      g.strokeStyle = "rgba(255,255,255,0.55)"; g.lineWidth = 2;
      for (let i = 0; i < 512; i += 16) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 256); g.stroke(); }
      for (let j = 0; j < 256; j += 32) { g.beginPath(); g.moveTo(0, j); g.lineTo(512, j); g.stroke(); }
      const domeMat = world.std({ map: canvasTex(cv, true), roughness: 0.32, metalness: 0.45, envMapIntensity: 1.1 }, { key: "zk-dome" });
      const m = new THREE.Mesh(dome, domeMat); m.castShadow = true; m.receiveShadow = true; K.scene.add(m);
      // 朝广场的入口雨篷
      const ang = Math.atan2(-0.34, -0.94);
      world.addGeo(new THREE.BoxGeometry(8, 0.35, 4).rotateY(-ang).translate(bx - 17.5 * 0.94, 4.2, bz - 17.5 * 0.34 + 2), world.MAT.white);
    }
    // 校门：两座玻璃雨棚门卫室 + 中间圆形种植岛
    function gate(polyPx, lean) {
      const p = world.pxPoly(polyPx), c = world.centroid(p);
      const small = p.map(([x, z]) => [c[0] + (x - c[0]) * 0.55, c[1] + (z - c[1]) * 0.55]);
      world.building({ id: "gatehouse", polyW: small, h: 3.4, style: "white", parapet: 0.3 });
      const big = p.map(([x, z]) => [c[0] + (x - c[0]) * 1.25, c[1] + (z - c[1]) * 1.25]);
      // 斜屋面玻璃雨棚
      const shape = world.shapeOfW(big);
      const g = new THREE.ShapeGeometry(shape); g.rotateX(-Math.PI / 2);
      const pos = g.attributes.position;
      for (let i = 0; i < pos.count; i++) { const x = pos.getX(i), z = pos.getZ(i); pos.setY(i, 5.4 + ((x - c[0]) * lean[0] + (z - c[1]) * lean[1]) * 0.12); }
      g.computeVertexNormals();
      world.addGeo(g, world.MAT.glassTeal);
      for (let i = 0; i < big.length; i++) {
        const a = big[i], b2 = big[(i + 1) % big.length], ya = 5.4 + ((a[0] - c[0]) * lean[0] + (a[1] - c[1]) * lean[1]) * 0.12, yb = 5.4 + ((b2[0] - c[0]) * lean[0] + (b2[1] - c[1]) * lean[1]) * 0.12;
        const len = Math.hypot(b2[0] - a[0], b2[1] - a[1]);
        const beam = new THREE.BoxGeometry(len, 0.25, 0.25); beam.rotateZ(Math.atan2(yb - ya, len)); beam.rotateY(-Math.atan2(b2[1] - a[1], b2[0] - a[0])); beam.translate((a[0] + b2[0]) / 2, (ya + yb) / 2, (a[1] + b2[1]) / 2);
        world.addGeo(beam, world.MAT.steelWhite);
        world.addGeo(new THREE.CylinderGeometry(0.16, 0.16, ya, 8).translate(a[0], ya / 2, a[1]), world.MAT.steelWhite);
      }
    }
    gate([[1437, 1743], [1484, 1724], [1494, 1755], [1450, 1771]], [1, 0]);
    gate([[1536, 1722], [1593, 1708], [1601, 1735], [1544, 1747]], [-1, 0]);
    const [gx, gz] = W(1520, 1752);
    world.platform(world.ellipsePoly(gx, gz, 4.2, 4.2, 0, 32), 0.45, "lawn");
    world.paintCircle(C.grass, gx, gz, 4.2);
    world.sign("西南财经大学天府学院", gx, 1.25, gz + 4.6, 0, 6.4, 0.9, { bg: "#7a2a1e", fg: "#f6e7c8" });
    world.addGeo(new THREE.BoxGeometry(7.2, 1.6, 0.6).translate(gx, 0.8, gz + 4.3), world.MAT.darkGranite);
    // 公交候车亭（天府学院站）
    {
      const [sx, sz] = W(1630, 1818);
      world.addGeo(new THREE.BoxGeometry(8, 0.15, 2.2).translate(sx, 2.7, sz), world.MAT.steelWhite);
      world.addGeo(new THREE.BoxGeometry(8, 2.4, 0.08).translate(sx, 1.4, sz - 1.0), world.MAT.glassTeal);
      for (const u of [-3.8, 3.8]) world.addGeo(new THREE.BoxGeometry(0.12, 2.7, 0.12).translate(sx + u, 1.35, sz - 1.0), world.MAT.metal);
      world.sign("天府学院站", sx, 3.1, sz + 1.12, 0, 3.2, 0.5, { bg: "#1d5fa8", fg: "#ffffff" });
    }
    // 屋顶：楼梯间、空调外机；第二教学楼屋面西侧小坡顶天窗
    function roofKit(polyPx, h, n) {
      const p = world.pxPoly(polyPx);
      const a = p[0], b = p[3], c2 = p[1];   // 长边 a→b
      const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
      const wv = [(c2[0] - a[0]) / 2, (c2[1] - a[1]) / 2];
      for (let i = 0; i < n; i++) {
        const t = (i + 0.7) / (n + 0.4), x = a[0] + (b[0] - a[0]) * t + wv[0], z = a[1] + (b[1] - a[1]) * t + wv[1];
        world.box(x, z, 6, 5, 3.2, h, ang, world.wallMat("brickplain"));
        world.acUnits(x + Math.cos(ang) * 7, z + Math.sin(ang) * 7, 3, h, ang + Math.PI / 2);
      }
    }
    roofKit([[1252, 1479], [1301, 1463], [1369, 1698], [1327, 1714]], 14.4, 2);
    roofKit([[1139, 1149], [1191, 1137], [1259, 1379], [1214, 1395]], 14.4, 2);
    roofKit([[1402, 1100], [1447, 1071], [1515, 1285], [1473, 1301]], 16, 2);
    roofKit([[1505, 1390], [1546, 1374], [1590, 1520], [1552, 1533]], 14.4, 1);
    roofKit([[967, 1207], [1066, 1181], [1139, 1421], [1045, 1447]], 18, 2);
    roofKit([[1061, 1489], [1155, 1463], [1228, 1698], [1139, 1724]], 18, 2);
    {
      const tileT = { map: TEX.roof.map, normalMap: TEX.roof.normalMap };
      const tileMat = world.std({ map: tileT.map, normalMap: tileT.normalMap, roughness: 0.6, color: 0x9aa0a4 }, { key: "zk-tile" });
      const a = W(1139, 1149), b = W(1214, 1395), ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
      for (let t = 0.06; t < 0.97; t += 0.075) {
        const x = a[0] + (b[0] - a[0]) * t + Math.cos(ang + Math.PI / 2) * -3.2, z = a[1] + (b[1] - a[1]) * t + Math.sin(ang + Math.PI / 2) * -3.2;
        const prism = new THREE.CylinderGeometry(1.5, 1.5, 3.6, 3, 1).rotateZ(Math.PI / 2).rotateX(Math.PI / 6);
        prism.scale(1, 0.75, 1).rotateY(-ang - Math.PI / 2).translate(x, 15.6, z);
        // 坡顶朝向沿短边
        world.addGeo(prism, tileMat);
      }
    }

    // ================= 光华广场：北端平台、台阶、雕塑花池 =================
    const TER = 1.6;
    world.platform([PZ(0, -PH), PZ(0, PH), PZ(64, PH), PZ(64, -PH)], TER, "slab");
    const d = [AX[0], AX[1]];
    // 南侧大台阶（从下沉广场上到平台：沿 −AX 方向升高）
    { const c = PZ(70, 0); world.steps(c[0], c[1], [-d[0], -d[1]], 50, 10, TER / 10, 0.6); }
    // 北侧台阶下到教学区西路
    { const c = PZ(-6, -6); world.steps(c[0], c[1], d, 30, 10, TER / 10, 0.6); }
    // 草坪花池（雕塑西北侧）：抬高 0.7 m 的长方形草坪，红色花带 + 灌木球
    const planter = [PZ(42, -29), PZ(42, -15), PZ(54, -15), PZ(54, -29)];
    world.paintPoly(C.grass, planter);
    world.platform(planter.map(([x, z]) => [x, z]), TER + 0.7, "lawn", world.MAT.darkGranite);
    // 雕塑（AI 模型在 afterBuild 中加载）：黑色石基 + 红色半球
    const [sx, sz] = W(1286, 1250);
    world.addGeo(new THREE.BoxGeometry(5.2, 1.0, 5.2).translate(sx, TER + 0.5, sz), world.MAT.darkGranite);
    world.addGeo(new THREE.SphereGeometry(2.0, 40, 16, 0, Math.PI * 2, 0, Math.PI / 2).translate(sx, TER + 1.0, sz), world.MAT.red);
    // 广场两侧路灯、坐凳
    for (let u = 12; u < PL; u += 22) for (const v of [-28.5, 28.5]) { const [x, z] = PZ(u, v); world.lamp(x, z); }
    for (let u = 80; u < PL; u += 25) for (const v of [-21.5, 21.5]) { const [x, z] = PZ(u + 6, v); world.bench(x, z, Math.atan2(AX[1], AX[0])); }
    // 宣传栏（蓝花楹草坪南侧）
    world.boards(W(1266, 1396), W(1304, 1384), 5);

    // ================= 植物 =================
    // 广场两侧银杏行（树池 + 灌木球）
    for (let u = 74; u <= 226; u += 12.6) for (const v of [-24.5, 24.5]) {
      const [x, z] = PZ(u, v);
      world.paintCircle(C.soil, x, z, 1.3);
      K.plant("ginkgo", x, z);
    }
    for (let u = 80; u <= 222; u += 12.6) for (const v of [-24.5, 24.5]) { const [x, z] = PZ(u, v); K.decor("shrub_ball", x, z, 0, 0.7); }
    // 平台上的银杏、雕塑两侧樱花、花池上的灌木球与花带
    for (const [u, v] of [[8, -24], [8, 24], [24, -24], [24, 24], [40, 24], [52, 26]]) { const [x, z] = PZ(u, v); world.paintCircle(C.soil, x, z, 1.4); K.plant("ginkgo", x, z); }
    for (const [u, v] of [[50, -4], [62, -34], [45, -34], [60, -2]]) { const [x, z] = PZ(u, v); world.paintCircle(C.soil, x, z, 1.4); K.plant("cherry", x, z); }
    for (const [u, v] of [[45, -26], [45, -18], [51, -26], [51, -18], [48, -22]]) { const [x, z] = PZ(u, v); K.plant("shrub_ball", x, z, { scale: 0.85 }); }
    for (const [u, v] of [[43, -22], [53, -22]]) { const [x, z] = PZ(u, v); K.plant("flowerbed", x, z, { scale: 1.2 }); }
    // 广场两侧外缘绿篱
    K.hedgeRow([PZ(66, -PH - 1), PZ(PL - 4, -PH - 1)], 0);
    K.hedgeRow([PZ(66, PH + 1), PZ(PL - 4, PH + 1)], 0);
    K.hedgeRow([PZ(2, -PH + 1.2), PZ(62, -PH + 1.2)], 0, "hedge_red");
    K.hedgeRow([PZ(2, PH - 1.2), PZ(62, PH - 1.2)], 0, "hedge_red");
    // 第二教学楼南端的蓝花楹
    [[1262, 1300], [1270, 1322], [1279, 1344], [1268, 1364], [1286, 1366]].forEach(([px, py]) => K.plantPx("jacaranda", px, py));
    // 校门种植岛：花丛 + 灌木球
    K.plant("flowerbed", gx, gz, { scale: 1.6 }); K.plant("shrub_ball", gx + 2.4, gz - 1.6); K.plant("shrub_ball", gx - 2.4, gz - 1.6);
    // 行道树：环校路、教学区道路两侧香樟；九洲大道、园兴西街外侧香樟
    const ringW = pw(ring);
    K.street("camphor", ringW, 11, 8.2); K.street("camphor", ringW, 11, -8.2);
    const westRoad = pw([[1108, 1149], [1181, 1134], [1348, 1092], [1468, 987]]);
    K.street("camphor", westRoad, 10, 6.8); K.street("osmanthus", westRoad, 10, -6.8);
    const midRoad = pw([[1113, 1160], [1285, 1724]]);
    K.street("camphor", midRoad, 10, 6.8); K.street("camphor", midRoad, 10, -6.8);
    K.street("camphor", pw([[1296, 47], [1964, 1860]]), 9, -12.5); K.street("camphor", pw([[1296, 47], [1964, 1860]]), 9, 11.5);
    K.street("camphor", pw([[880, 1844], [1964, 1844]]), 9, -11.5);
    // 楼间与路边绿地：香樟、桂花、樱花、女贞散植（避开道路、广场与建筑）
    const [ax0, az0] = W(940, 960), [ax1, az1] = W(1740, 1820);
    K.fill({ keys: [["camphor", 4], ["osmanthus", 3], ["cherry", 2], ["privet", 1]], area: [ax0, az0, ax1, az1], n: 70, minDist: 9, clear: 2.4, bmargin: 4 });
    K.fill({ keys: [["shrub_ball", 3], ["flowerbed", 1]], area: [ax0, az0, ax1, az1], n: 26, minDist: 5, clear: 1.0, bmargin: 2 });
    // 道路两侧绿篱（局部）
    K.hedgeRow(pw([[1186, 1150], [1252, 1372]]), 4.5);
    K.hedgeRow(pw([[1300, 1475], [1362, 1690]]), 4.5);
    // 路灯：环校路、教学区道路
    world.along(ringW, 30, 7, 10).forEach((p, i) => world.lamp(p.x, p.z));
    world.along(midRoad, 30, -5.5, 10).forEach((p) => world.lamp(p.x, p.z));
    world.along(westRoad, 30, -5.5, 10).forEach((p) => world.lamp(p.x, p.z));
    world.bake();

    // ================= 小动物 =================
    const A = (key, px, py) => { const [x, z] = W(px, py); K.animal(key, x, z); };
    A("cat", 1276, 1335); A("cat", 1545, 1600); A("cat", 1130, 1300); A("cat", 1300, 1215);
    A("magpie", 1300, 1420); A("magpie", 1460, 1560); A("magpie", 1350, 1170);
    A("sparrow", 1370, 1400); A("sparrow", 1375, 1405); A("sparrow", 1440, 1600); A("sparrow", 1430, 1606);
    A("butterfly", 1290, 1236); A("butterfly", 1270, 1345); A("butterfly", 1520, 1752); A("butterfly", 1180, 1460);
  }

  // 雕塑：AI 复原模型 sculpture_ai.glb（银色旋涡），失败时用程序化旋涡
  async function afterBuild(K) {
    const [sx, sz] = K.W(1286, 1250);
    const TOP = 1.6 + 1.0 + 1.9;
    const steel = K.world.std({ color: 0xe8ecef, metalness: 1, roughness: 0.2, envMapIntensity: 1.2 }, { key: "zk-steel" });
    const grp = new THREE.Group(); grp.position.set(sx, 0, sz); K.scene.add(grp);
    function procedural() {
      const pts = [];
      for (let i = 0; i <= 100; i++) { const t = i / 100, a = t * Math.PI * 4.2, r = 1.3 * (1 - t * 0.55) + 0.2; pts.push(new V3(Math.cos(a) * r, TOP + t * 5.5, Math.sin(a) * r)); }
      const sw = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 100, 0.28, 8, false), steel);
      const sw2 = sw.clone(); sw2.rotation.y = Math.PI;
      [sw, sw2].forEach((m) => { m.castShadow = true; grp.add(m); });
    }
    await new Promise((res) => {
      if (!THREE.GLTFLoader) { procedural(); res(); return; }
      try {
        new THREE.GLTFLoader().load("../models/sculpture_ai.glb", (gltf) => {
          try {
            const model = gltf.scene; let n = 0;
            model.traverse((o) => { if (o.isMesh) { if (!o.geometry.attributes.normal) o.geometry.computeVertexNormals(); o.material = steel; o.castShadow = true; n++; } });
            if (!n) throw new Error("GLB 中没有网格");
            const box = new THREE.Box3().setFromObject(model), size = box.getSize(new V3());
            const s = 5.6 / size.y; model.scale.setScalar(s);
            const c = box.getCenter(new V3());
            model.position.set(-c.x * s, TOP - 0.4 - box.min.y * s, -c.z * s);
            grp.add(model);
          } catch (e) { console.warn("雕塑模型异常，使用程序化旋涡", e); procedural(); }
          res();
        }, undefined, (e) => { console.warn("雕塑 GLB 加载失败，使用程序化旋涡", e); procedural(); res(); });
      } catch (e) { procedural(); res(); }
    });
  }

  ZK.start({
    zoneId: "teaching_green", title: "教学楼绿化带", icon: "🏫",
    intro: "光华广场是从校门通往图书馆的主轴：两侧各一排银杏，北端抬高的平台上立着“聚·散”不锈钢雕塑，旁边是草坪花池和樱花；广场两侧是红砖白框的教学楼，校门内东侧是浅蓝穹顶的学术报告厅。",
    highlights: ["银杏大道", "聚·散雕塑", "蓝花楹", "行道香樟", "绿篱"],
    region: [900, 880, 1860, 1890], bounds: [950, 960, 1730, 1860], res: 0.3,
    mosaicRot: Math.atan2(EX[1], EX[0]), mosaicOrigin: ZKWorld.W(N0px[0], N0px[1]),
    catalog: ["ginkgo", "camphor", "cherry", "osmanthus", "jacaranda", "privet", "shrub_ball", "hedge", "flowerbed", "cat", "magpie", "sparrow", "butterfly"],
    storageKey: "teaching-species-demo:teaching_green",
    build, afterBuild,
    views: {
      "官方视角": { icon: "🗺️", t: [1360, 1400, 0], d: 360, el: 32, az: -14 },
      "俯视": { icon: "⬇️", t: [1340, 1410, 0], d: 470, el: 89, az: 0 },
      "银杏大道": { icon: "🍂", t: [1330, 1300, 2], d: 120, el: 16, az: 20 },
      "聚·散雕塑": { icon: "🗿", t: [1286, 1250, 5], d: 26, el: 14, az: 35 },
      "校门": { icon: "🚪", t: [1520, 1740, 3], d: 75, el: 18, az: 4 },
      "报告厅": { icon: "🔵", t: [1588, 1567, 6], d: 70, el: 24, az: -60 },
      "编辑俯瞰": { hidden: true, t: [1350, 1380, 0], d: 230, el: 62, az: -14 },
    },
    info: {
      sculpture: "“聚·散”不锈钢雕塑：银色不锈钢旋涡造型，立在红色半球台座与黑色方形石基上，位于光华广场北端、图书馆一侧的平台上，前方是草坪花池，两侧樱花。",
      baogaoting: "学术报告厅：圆形玻璃基座配浅蓝色扁穹顶，位于校门内东侧、光华广场南端，用于讲座、典礼与学术报告。",
      shiyan: "实验楼（智能科技学院）：红砖与玻璃立面，西北角是圆柱形玻璃楼梯塔，专业实验室集中于此。",
    },
    labels: (K) => {
      const [sx, sz] = K.W(1286, 1250), [gx, gz] = K.W(1520, 1752);
      return [{ id: "sculpture", name: "聚·散雕塑", pos: new V3(sx, 11, sz), dist: 30 }, { id: "main_gate", name: "校门", pos: new V3(gx, 8, gz), dist: 70 },
        { id: "guanghua", name: "光华广场", pos: new V3(...(() => { const [x, z] = K.W(1400, 1420); return [x, 4, z]; })()), dist: 120 }];
    },
    tourSpeed: 10,
    tour: [
      { name: "园兴西街 · 校门", cap: "两座湖蓝色玻璃雨棚门卫室，中间是圆形种植岛", t: [1520, 1745, 3], d: 70, el: 14, az: -4 },
      { name: "校门内", cap: "进门左手是第一教学楼，右手是浅蓝穹顶的学术报告厅", t: [1500, 1650, 4], d: 48, el: 10, az: 10 },
      { name: "学术报告厅", cap: "圆形玻璃基座 + 浅蓝色扁穹顶", t: [1588, 1567, 7], d: 52, el: 16, az: -50 },
      { name: "银杏大道", cap: "广场两侧各一排银杏，秋天满树金黄", t: [1420, 1420, 3], d: 46, el: 8, az: 18 },
      { name: "光华广场北端", cap: "抬高的平台与大台阶，通往图书馆", t: [1320, 1260, 3], d: 55, el: 14, az: 25 },
      { name: "聚·散雕塑", cap: "银色不锈钢旋涡、红色半球、黑色石基，旁边是草坪花池和樱花", t: [1286, 1250, 5], d: 24, el: 12, az: 70 },
      { name: "蓝花楹", cap: "第二教学楼南端的一片蓝花楹，初夏开满蓝紫色的花", t: [1272, 1345, 4], d: 34, el: 14, az: 110 },
      { name: "第四、第五教学楼", cap: "红砖墙与白色外廊相间的围合式教学楼", t: [1090, 1450, 6], d: 95, el: 30, az: 120 },
      { name: "实验楼", cap: "西北角的圆柱形玻璃楼梯塔", t: [1430, 1150, 10], d: 75, el: 22, az: -40 },
      { name: "全景", cap: "教学楼绿化带：广场、教学楼与行道树", t: [1360, 1420, 0], d: 300, el: 34, az: -14 },
    ],
  }).catch((e) => { console.error(e); const p = document.querySelector(".zk-loader p"); if (p) p.textContent = "场景加载失败：" + e.message; });
})();
