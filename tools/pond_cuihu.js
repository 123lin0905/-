/* ------------------------------------------------------------------ 翠湖水景：按官方校园地图重建（由 tools/build_pond.py 插入 pond-main.js）
 * 官方地图（学校官方手绘鸟瞰图，自东南方向俯视）上的翠湖：一个南北长约 140 米、东西宽约 65 米的湖，北端窄、在翠湖广场收成湖尖，
 * 南端分成两个湖湾；湖中只有一座长满青草的小岛，岛上一棵大香樟；没有桥、亭、跌水、石灯笼。南岸一块 D 形种植床伸进湖里，
 * 种着 5 棵黄叶乔木，床后是半圆形铺装广场和成排银杏；北端湖尖旁是草坪种植床，放一块置石和一面立起来的镂空圆石盘；
 * 西岸是沥青路和一排紫色的蓝花楹、几棵垂柳；东岸是垂柳、樱花和圆冠乔木，后面是 C 区 7 栋砖红色板楼（4 + 3 错列），
 * 南面是 4 层坡屋顶的教师公寓。水面只有睡莲（4～5 片），没有荷花。
 * 坐标：campus_layout.json 的平面图像素（x 向东、y 向南，0.4 米/像素）→ 场景米：x = (px − 366) × 0.4，z = (py − 1515) × 0.4，
 * 原点在南岸种植床北面的湖面上（锦鲤、睡莲、青蛙、乌龟主要在这一片活动）。湖岸、湖心岛、翠湖广场、半圆广场和周边建筑的
 * 轮廓直接取自 campus_layout.json（构建时写入下面的 CUIHU_DATA），与校园全景同一份数据。 */
const CUIHU_DATA = __CUIHU_DATA__;
const CUIHU = (() => {
  const O = [366, 1515], S = 0.4;
  const W = (p) => [(p[0] - O[0]) * S, (p[1] - O[1]) * S];
  const WL = (list) => list.map(W);
  // ---- 多边形工具（场景米）
  function polySd(poly, x, z) {             // 有向距离：内部为负
    let best = 1e18, inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const ax = poly[j][0], az = poly[j][1], bx = poly[i][0], bz = poly[i][1];
      const ex = bx - ax, ez = bz - az, wx = x - ax, wz = z - az;
      const t = clamp((wx * ex + wz * ez) / (ex * ex + ez * ez || 1), 0, 1);
      const dx = wx - ex * t, dz = wz - ez * t, d = dx * dx + dz * dz;
      if (d < best) best = d;
      if ((az > z) !== (bz > z) && x < (bx - ax) * (z - az) / (bz - az) + ax) inside = !inside;
    }
    return inside ? -Math.sqrt(best) : Math.sqrt(best);
  }
  function inPoly(poly, x, z) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const az = poly[j][1], bz = poly[i][1];
      if ((az > z) !== (bz > z) && x < (poly[i][0] - poly[j][0]) * (z - az) / (bz - az) + poly[j][0]) inside = !inside;
    }
    return inside;
  }
  function bbox(poly) { let a = [1e9, 1e9, -1e9, -1e9]; for (const [x, z] of poly) a = [Math.min(a[0], x), Math.min(a[1], z), Math.max(a[2], x), Math.max(a[3], z)]; return a; }
  // ---- 湖岸与湖心岛（来自 campus_layout.json water[id=cuihu]）
  const lake = WL(CUIHU_DATA.lake);
  const I = CUIHU_DATA.island, ic = W(I.c), irx = (I.rx || I.r) * S, irz = (I.ry || I.r) * S, ia = (I.rot || 0) * Math.PI / 180;
  const island = [];
  for (let k = 0; k < 72; k++) {
    const t = k / 72 * Math.PI * 2, wob = 1 + 0.045 * Math.sin(t * 3 + 0.7) + 0.03 * Math.sin(t * 5 + 2.1);
    const x = irx * Math.cos(t) * wob, z = irz * Math.sin(t) * wob;
    island.push([ic[0] + x * Math.cos(ia) - z * Math.sin(ia), ic[1] + x * Math.sin(ia) + z * Math.cos(ia)]);
  }
  const islandSd = (x, z) => polySd(island, x, z);
  // ---- 铺装、种植床（平面图像素，按官方地图描出）
  const plaza = WL(CUIHU_DATA.plaza);                       // 翠湖广场
  const prom = WL(CUIHU_DATA.promenade);                    // 南岸半圆广场
  const bed = WL([[316, 1574], [322, 1560], [334, 1550], [348, 1544], [366, 1541], [384, 1543], [400, 1549], [412, 1560], [418, 1578], [421, 1600], [416, 1622],
    [408, 1636], [402, 1640], [398, 1628], [390, 1618], [378, 1611], [366, 1609], [354, 1611], [342, 1618], [334, 1628], [330, 1640], [324, 1636], [318, 1620], [314, 1598]]);
  const northBed = WL([[268, 1198], [404, 1198], [396, 1214], [372, 1232], [352, 1246], [330, 1252], [312, 1262], [296, 1290], [282, 1290], [270, 1250]]);
  // 步道（中心线 + 宽度米）：西岸、东岸、南岸环形步道、广场到教师公寓
  const paths = [
    { w: 2.2, pts: WL([[292, 1196], [292, 1260], [293, 1350], [293, 1440], [290, 1490], [283, 1530], [280, 1570], [284, 1606], [296, 1630], [314, 1648], [330, 1656]]) },
    { w: 2.4, pts: WL([[404, 1198], [404, 1240], [414, 1290], [428, 1340], [442, 1392], [453, 1442], [461, 1492], [467, 1540], [474, 1580], [478, 1612], [470, 1640], [450, 1652], [424, 1658], [402, 1656]]) },
    { w: 3.0, pts: WL([[366, 1650], [366, 1700]]) },
  ];
  const road = { w: 6.2, pts: WL([[270, 1100], [270, 1300], [270, 1500], [262, 1540], [246, 1574], [234, 1600]]) };
  // ---- 周边建筑（campus_layout.json：C 区 7 栋板楼 4 + 3 错列、C8–C10、教师公寓、聚友宾馆、B5 / B6、第三教学楼）
  const STY = {
    dorm: { floors: 7, fh: 3.1, brick: '#b4685a', band: '#9c9890', trim: '#d9d2c8' },
    teacher: { floors: 4, fh: 3.1, brick: '#a85a46', band: '#8f8a84', trim: '#e2dbd0', pitched: true },
    brick: { floors: 5, fh: 3.4, brick: '#a8644e', band: '#a39e96', trim: '#ddd5ca' },
    canteen: { floors: 5, fh: 3.5, brick: '#b07a62', band: '#b9b4ac', trim: '#e6e0d6' },
  };
  const buildings = CUIHU_DATA.buildings.map((b) => {
    const st = b.id === 'jiaoshi' ? 'teacher' : b.style === 'dorm' && /^B/.test(b.id) ? 'brick' : STY[b.style] ? b.style : 'brick';
    const s = STY[st], poly = WL(b.poly);
    return { id: b.id, name: b.name, poly, style: st, S: s, h: s.floors * s.fh + 0.6, bb: bbox(poly) };
  });
  // ---- 种植（平面图像素 → 米）；kind：camphor 香樟 / willow 垂柳 / jacaranda 蓝花楹 / ginkgo 银杏（锥形）/ koel 栾树（黄叶）/
  //      blossom 樱花（粉）/ white 白花 / round 圆冠乔木
  const T = (kind, px, py, h) => ({ kind, x: (px - O[0]) * S, z: (py - O[1]) * S, h });
  const trees = [
    T('camphor', 383, 1440, 13.5),                                                       // 湖心岛：一棵大香樟
    // 西岸：沥青路与湖之间一排蓝花楹，几棵垂柳探向水面，夹两棵白花 / 粉花树
    T('jacaranda', 284, 1276, 8.5), T('jacaranda', 284, 1318, 9), T('jacaranda', 285, 1360, 8.5), T('jacaranda', 285, 1404, 9), T('jacaranda', 284, 1446, 8.5),
    T('jacaranda', 280, 1486, 9), T('jacaranda', 274, 1524, 8.5), T('white', 285, 1424, 7), T('blossom', 284, 1340, 6.5),
    T('willow', 298, 1336, 8.5), T('willow', 299, 1428, 9), T('willow', 292, 1512, 8.5),
    // 北端湖尖：蓝花楹、粉花小乔木
    T('jacaranda', 280, 1228, 8), T('jacaranda', 360, 1214, 7.5), T('blossom', 318, 1210, 5), T('blossom', 384, 1222, 5.5),
    // 翠湖广场：南侧一排树池银杏（聚友宾馆前），东南角两棵圆冠树
    ...[0, 1, 2, 3, 4, 5, 6, 7, 8].map((k) => T('ginkgo', 300 + k * 11.5, 1040, 9.5)),
    T('round', 372, 1168, 8), T('round', 392, 1150, 8.5),
    // 东岸：垂柳贴水，樱花、圆冠乔木在步道两侧，再往东是 C 区宿舍
    T('willow', 378, 1290, 8.5), T('willow', 406, 1356, 9), T('willow', 433, 1440, 9), T('willow', 449, 1520, 8.5),
    T('blossom', 400, 1306, 6.5), T('blossom', 425, 1388, 6.5), T('blossom', 448, 1470, 6), T('blossom', 459, 1560, 6.5),
    T('round', 420, 1270, 9), T('round', 446, 1330, 10), T('round', 462, 1400, 9.5), T('round', 476, 1452, 10), T('round', 483, 1506, 9.5), T('round', 490, 1560, 9),
    T('round', 470, 1240, 9),
    // 南岸 D 形种植床：5 棵黄叶乔木（栾树）；两端湖湾转角各一棵垂柳；半圆广场后成排银杏
    T('koel', 333, 1566, 8), T('koel', 350, 1578, 8.5), T('koel', 368, 1566, 9), T('koel', 386, 1580, 8.5), T('koel', 404, 1566, 8),
    T('willow', 302, 1606, 8.5), T('willow', 433, 1630, 8.5),
    T('ginkgo', 266, 1606, 9.5), T('ginkgo', 282, 1622, 9), T('ginkgo', 296, 1648, 9.5), T('ginkgo', 262, 1636, 9), T('ginkgo', 278, 1656, 9.5), T('ginkgo', 300, 1676, 9),
    T('ginkgo', 340, 1680, 9), T('ginkgo', 356, 1684, 9.5), T('ginkgo', 378, 1684, 9.5), T('ginkgo', 394, 1680, 9), T('ginkgo', 414, 1676, 9),
    T('white', 444, 1662, 6.5), T('blossom', 462, 1650, 6),
  ];
  const shrubs = [   // [px, py, 半径(米), 花色]
    [342, 1598, 1.1, 0xd78fc0], [372, 1600, 1.0, 0x9d7ad0], [398, 1602, 1.1, 0xe08aae],   // 种植床里的 3 丛开花灌木
    [370, 1418, 0.9, 0xe9869f], [398, 1462, 0.8, null], [366, 1452, 0.9, null], [396, 1416, 0.7, 0xf2a6c2], [378, 1466, 0.8, null],   // 湖心岛岸边的低矮灌木与花
    [330, 1236, 0.9, 0xe9869f], [346, 1220, 0.8, null], [300, 1210, 1.0, null], [374, 1206, 0.9, 0xc77fd8],                       // 北端草坪种植床
  ];
  // 绿篱：南岸种植床外缘（沿半圆广场）、北端种植床北缘（广场一侧）、广场树池
  const hedges = [
    WL([[330, 1640], [334, 1628], [342, 1618], [354, 1611], [366, 1609], [378, 1611], [390, 1618], [398, 1628], [402, 1640]]),
    WL([[274, 1201], [286, 1201]]), WL([[298, 1201], [398, 1201]]),
  ];
  const rocks = [W([303, 1226])];                         // 北端置石
  const disc = W([336, 1219]);                             // 北端镂空圆石盘
  const lamps = WL([[318, 1120], [372, 1094], [330, 1664], [402, 1664], [298, 1622], [296, 1300], [296, 1396], [293, 1474], [420, 1318], [446, 1418], [464, 1516], [480, 1600]]);
  const benches = [[W([346, 1654]), 0], [W([386, 1654]), 0], [W([297, 1360]), -Math.PI / 2], [W([300, 1452]), -Math.PI / 2], [W([436, 1372]), Math.PI / 2 - 0.3]];
  const lilyPatches = [   // 睡莲：岛南、岛东、西南岸、东南湖湾、种植床北
    { c: W([381, 1484]), r: 6.0, n: 190 }, { c: W([414, 1452]), r: 3.4, n: 70 }, { c: W([306, 1538]), r: 4.0, n: 90 },
    { c: W([442, 1604]), r: 4.0, n: 90 }, { c: W([352, 1528]), r: 3.6, n: 70 },
  ];
  const reeds = WL([[330, 1252], [345, 1254], [356, 1262], [386, 1316], [395, 1336], [437, 1462], [441, 1480], [312, 1268]]);
  // 锦鲤的主要活动范围：原点附近（南岸种植床北面、湖心岛以南）
  const KOI_HOME = { x: 0, z: 0, r: 11 };
  // 场景范围（米）
  const B = { lake: bbox(lake) };
  // ---- 地形：自然草坡入水，岸上平地 0.30 米；湖心岛、南北种植床略高起
  const G = 0.30;
  function bank(s) { return 0.035 + (G - 0.035) * smoothstep(0, 4.0, s); }
  function depth(x, z, d) { return 0.07 + 1.25 * Math.pow(smoothstep(0.0, 7.5, d), 0.8) + 0.06 * fbm3(x * 0.25, 0.3, z * 0.25, 3, 5) * smoothstep(0, 1.5, d); }
  function ground(x, z, s) {
    let h = bank(s) + 0.025 * fbm3(x * 0.35, 0, z * 0.35, 3, 9) * smoothstep(0.3, 2.5, s);
    const di = islandSd(x, z);
    if (di < 0) h += 0.55 * smoothstep(1.5, 8, -di) * (0.85 + 0.15 * fbm3(x * 0.3, 2, z * 0.3, 2, 4));
    if (z > 5 && z < 50 && x > -25 && x < 30) { const db = polySd(bed, x, z); if (db < 0) h += 0.32 * smoothstep(0, 1.4, -db); }
    if (z < -100 && z > -135) { const dn = polySd(northBed, x, z); if (dn < 0) h += 0.18 * smoothstep(0, 3, -dn); }
    return h;
  }
  // 地形网格坐标：湖区 0.4 米细网格，外面逐渐放大到 ±800 米
  function axis(lo, hi, step, ext) {
    const a = []; for (let v = lo; v <= hi + 1e-6; v += step) a.push(v);
    let s = step, v = hi; while (v < ext) { s *= 1.08; v += s; a.push(Math.min(v, ext)); }
    const b = []; s = step; v = lo; while (v > -ext) { s *= 1.08; v -= s; b.push(Math.max(v, -ext)); }
    return b.reverse().concat(a);
  }
  return { O, S, W, WL, polySd, inPoly, bbox, lake, island, islandSd, plaza, prom, bed, northBed, paths, road, buildings, trees, shrubs, hedges, rocks, disc,
    lamps, benches, lilyPatches, reeds, KOI_HOME, B, G, bank, depth, ground, axis,
    xs: () => axis(-46, 54, 0.4, 800), zs: () => axis(-122, 58, 0.4, 800) };
})();

/* ---- 硬质景观：铺装、沥青路、置石与石盘、岸边低矮石块、周边建筑（第一阶段，首帧前） */
function cuihuPaverTex(kind) {
  const N = 512, cv = makeCanvas(N, N), g = cv.getContext('2d');
  if (kind === 'asphalt') {
    g.fillStyle = '#4a4c4e'; g.fillRect(0, 0, N, N);
    for (let i = 0; i < 9000; i++) { const v = 55 + rand() * 50 | 0; g.fillStyle = `rgba(${v},${v},${v + 2},0.5)`; g.fillRect(rand() * N, rand() * N, 1 + rand() * 2, 1 + rand() * 2); }
  } else {
    // 浅灰方形透水砖（30 × 30 厘米，贴图 1 张 = 2.4 米），灰缝 + 轻微色差
    const n = 8, c = N / n;
    g.fillStyle = '#8e8c88'; g.fillRect(0, 0, N, N);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const v = (kind === 'warm' ? 176 : 168) + (rand() * 26 - 13) | 0;
      g.fillStyle = kind === 'warm' ? `rgb(${v + 6},${v},${v - 10})` : `rgb(${v},${v},${v - 3})`;
      g.fillRect(i * c + 2, j * c + 2, c - 4, c - 4);
      for (let k = 0; k < 40; k++) { const w = v - 20 + rand() * 40 | 0; g.fillStyle = `rgba(${w},${w},${w},0.35)`; g.fillRect(i * c + 2 + rand() * (c - 6), j * c + 2 + rand() * (c - 6), 2, 2); }
    }
  }
  const t = canvasTex(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}
function cuihuFacadeTex(st) {
  // 一层 × 一开间的立面单元：砖墙、楼层腰线、铝框窗（带阳台栏板），按 u = 墙长 / 3.6 米、v = 高度 / 层高平铺
  const cv = makeCanvas(256, 256), g = cv.getContext('2d');
  g.fillStyle = st.brick; g.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 6) for (let x = (y / 6) % 2 ? 0 : 9; x < 256; x += 18) { g.fillStyle = `rgba(0,0,0,${0.05 + rand() * 0.08})`; g.fillRect(x, y, 17, 1); g.fillRect(x, y, 1, 6); }
  for (let i = 0; i < 1500; i++) { g.fillStyle = `rgba(${rand() < 0.5 ? '255,235,220' : '60,20,10'},${rand() * 0.08})`; g.fillRect(rand() * 256, rand() * 256, 3, 2); }
  g.fillStyle = st.band; g.fillRect(0, 0, 256, 22);                     // 楼层腰线（灰色）
  g.fillStyle = st.trim; g.fillRect(52, 58, 152, 150);                 // 窗套
  g.fillStyle = '#3b4a55'; g.fillRect(60, 66, 136, 120);               // 玻璃
  const gr = g.createLinearGradient(0, 66, 0, 186); gr.addColorStop(0, 'rgba(190,215,235,0.55)'); gr.addColorStop(1, 'rgba(40,60,75,0.1)');
  g.fillStyle = gr; g.fillRect(60, 66, 136, 120);
  g.fillStyle = '#c9ccd0'; g.fillRect(126, 66, 5, 120); g.fillRect(60, 120, 136, 4);   // 铝框
  g.fillStyle = 'rgba(225,225,228,0.92)'; g.fillRect(44, 172, 168, 36);             // 阳台栏板
  g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(44, 206, 168, 4);
  const t = canvasTex(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}
function cuihuRibbon(pts, w, lift, step = 1.0) {
  // 沿折线的带状路面，贴着地形（每 step 米一段）
  const P = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1], L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(L / step));
    for (let k = 0; k < n; k++) P.push([lerp(ax, bx, k / n), lerp(az, bz, k / n)]);
  }
  P.push(pts[pts.length - 1]);
  const pos = [], uv = [], idx = []; let acc = 0;
  for (let i = 0; i < P.length; i++) {
    const a = P[Math.max(0, i - 1)], b = P[Math.min(P.length - 1, i + 1)];
    let tx = b[0] - a[0], tz = b[1] - a[1]; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
    if (i) acc += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]);
    for (const sd of [-1, 1]) {
      const x = P[i][0] - tz * sd * w / 2, z = P[i][1] + tx * sd * w / 2;
      pos.push(x, Math.max(ground(x, z), CUIHU.G * 0.5) + lift, z); uv.push(x, z);
    }
    if (i) { const q = (i - 1) * 2; idx.push(q, q + 2, q + 1, q + 1, q + 2, q + 3); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}
function cuihuFlat(poly, y) {
  const sh = new THREE.Shape(poly.map(([x, z]) => new THREE.Vector2(x, -z)));
  const g = new THREE.ShapeGeometry(sh, 24); g.rotateX(-Math.PI / 2); g.translate(0, y, 0);
  const p = g.attributes.position, uv = g.attributes.uv; for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i), p.getZ(i));
  return g;
}
function cuihuPrism(poly, y0, y1) {
  const sh = new THREE.Shape(poly.map(([x, z]) => new THREE.Vector2(x, -z)));
  const g = new THREE.ExtrudeGeometry(sh, { depth: y1 - y0, bevelEnabled: false, curveSegments: 4 }); g.rotateX(-Math.PI / 2); g.translate(0, y0, 0);
  return g;
}
function cuihuWalls(poly, y0, h, fh) {
  // 外墙：每条边一个四边形，UV 按开间 / 层高
  const pos = [], uv = [], idx = [];
  let area = 0; for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length]; area += a[0] * b[1] - b[0] * a[1]; }
  const flip = area > 0;
  for (let i = 0; i < poly.length; i++) {
    let a = poly[i], b = poly[(i + 1) % poly.length]; if (flip) [a, b] = [b, a];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]), bays = Math.max(1, Math.round(L / 3.6)), k = pos.length / 3;
    pos.push(a[0], y0, a[1], b[0], y0, b[1], a[0], y0 + h, a[1], b[0], y0 + h, b[1]);
    uv.push(0, 0, bays, 0, 0, h / fh, bays, h / fh);
    idx.push(k, k + 1, k + 2, k + 2, k + 1, k + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
  g.computeVertexNormals(); return g;
}
function cuihuGable(x0, z0, x1, z1, y0, rise, alongX) {
  // 坡屋顶（两坡 + 两端山墙），出檐 0.5 米
  const e = 0.5; x0 -= e; z0 -= e; x1 += e; z1 += e;
  const g = new THREE.BufferGeometry(), P = [];
  if (alongX) {
    const zm = (z0 + z1) / 2, y1 = y0 + rise;
    P.push([x0, y0, z0, x1, y0, z0, x0, y1, zm], [x1, y0, z0, x1, y1, zm, x0, y1, zm], [x1, y0, z1, x0, y0, z1, x1, y1, zm], [x0, y0, z1, x0, y1, zm, x1, y1, zm],
      [x0, y0, z1, x0, y0, z0, x0, y1, zm], [x1, y0, z0, x1, y0, z1, x1, y1, zm]);
  } else {
    const xm = (x0 + x1) / 2, y1 = y0 + rise;
    P.push([x0, y0, z1, x0, y0, z0, xm, y1, z1], [x0, y0, z0, xm, y1, z0, xm, y1, z1], [x1, y0, z0, x1, y0, z1, xm, y1, z0], [x1, y0, z1, xm, y1, z1, xm, y1, z0],
      [x0, y0, z0, x1, y0, z0, xm, y1, z0], [x1, y0, z1, x0, y0, z1, xm, y1, z1]);
  }
  const pos = [].concat(...P);
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const uv = []; for (let i = 0; i < pos.length; i += 3) uv.push(pos[i] + pos[i + 2], pos[i + 1] * 1.6);
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.computeVertexNormals();
  return g;
}
function buildCuihuHardscape() {
  const granite = rockMaterial(TEX.granite, { key: 'granite', scale: 1.5, moss: 0.35, rough: 0.78, nrm: 0.9 });
  const boulderMat = rockMaterial(TEX.boulder, { key: 'boulder', scale: 0.75, moss: 0.5, rough: 0.8, nrm: 1.3, tint: 0xb8b2a8 });
  WORLD.granite = granite; WORLD.boulderMat = boulderMat; WORLD.solids = WORLD.solids || [];
  granite.userData.uniforms.uTint.value.setScalar(0.97);
  const C = CUIHU, G = C.G;
  // 铺装
  const paveMat = physical({ map: cuihuPaverTex('grey'), roughness: 0.8, envMapIntensity: 0.5 }, { key: 'pavers' });
  const warmMat = physical({ map: cuihuPaverTex('warm'), roughness: 0.82, envMapIntensity: 0.5 }, { key: 'pavers2' });
  const roadMat = physical({ map: cuihuPaverTex('asphalt'), roughness: 0.92, envMapIntensity: 0.4 }, { key: 'asphalt' });
  for (const m of [paveMat, warmMat, roadMat]) { m.map.repeat.set(1 / 2.4, 1 / 2.4); m.polygonOffset = true; m.polygonOffsetFactor = -1; m.polygonOffsetUnits = -4; }
  roadMat.map.repeat.set(1 / 6, 1 / 6);
  const flats = [];
  flats.push(new THREE.Mesh(cuihuFlat(C.plaza, G + 0.03), paveMat), new THREE.Mesh(cuihuFlat(C.prom, G + 0.03), warmMat));
  for (const p of C.paths) flats.push(new THREE.Mesh(cuihuRibbon(p.pts, p.w, 0.035), warmMat));
  flats.push(new THREE.Mesh(cuihuRibbon(C.road.pts, C.road.w, 0.03, 2), roadMat));
  for (const m of flats) { m.receiveShadow = true; setLayer(m, LAYER.ABOVE); scene.add(m); WORLD.noReflect.push(m); }
  // 路缘石（广场与半圆广场外沿）+ 银杏树池（方形石沿）
  const curbs = [];
  const curbAlong = (poly, closed) => {
    const n = closed ? poly.length : poly.length - 1;
    for (let i = 0; i < n; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 0.2) continue;
      const g = new THREE.BoxGeometry(L, 0.12, 0.18); g.rotateY(-Math.atan2(b[1] - a[1], b[0] - a[0])); g.translate((a[0] + b[0]) / 2, G + 0.05, (a[1] + b[1]) / 2); curbs.push(g);
    }
  };
  curbAlong(C.plaza, true); curbAlong(C.prom, true);
  for (const t of C.trees) if (t.kind === 'ginkgo' && C.inPoly(C.plaza, t.x, t.z)) {
    for (let k = 0; k < 4; k++) { const g = new THREE.BoxGeometry(1.9, 0.38, 0.16); g.translate(0, 0, 0.87); g.rotateY(k * Math.PI / 2); g.translate(t.x, G + 0.19, t.z); curbs.push(g); }
    const soil = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.05, 1.6).translate(t.x, G + 0.3, t.z), physical({ color: 0x4a3a2a, roughness: 0.95 }, { key: 'pitsoil' })); soil.receiveShadow = true; setLayer(soil, LAYER.ABOVE); scene.add(soil);
  }
  if (curbs.length) meshOf(curbs, granite, LAYER.ABOVE);
  // 北端：一块大置石 + 一面立起来的镂空圆石盘（带石座）
  const V = new THREE.Vector3(), Q = new THREE.Quaternion(), E = new THREE.Euler(), SC = new THREE.Vector3(), mtx = () => new THREE.Matrix4().compose(V, Q, SC);
  const big = [];
  for (const [x, z] of C.rocks) { V.set(x, ground(x, z) + 0.35, z); E.set(0.05, 0.7, -0.04); Q.setFromEuler(E); SC.set(1.6, 1.25, 1.3); big.push(mtx()); }
  WORLD.solids.push(instanced(rockGeo(23.1, 5, -0.35, 0.25), boulderMat, big, LAYER.ABOVE));
  {
    const [x, z] = C.disc, R = 1.45, gy = ground(x, z);
    const sh = new THREE.Shape(); sh.absarc(0, 0, R, 0, Math.PI * 2, false);
    const holes = [[0, 0, 0.36], ...[0, 1, 2, 3, 4, 5, 6, 7].map((k) => [Math.cos(k * Math.PI / 4) * 0.92, Math.sin(k * Math.PI / 4) * 0.92, 0.2])];
    for (const [hx, hy, hr] of holes) { const hp = new THREE.Path(); hp.absarc(hx, hy, hr, 0, Math.PI * 2, true); sh.holes.push(hp); }
    const dg = new THREE.ExtrudeGeometry(sh, { depth: 0.32, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 2, curveSegments: 40 });
    dg.translate(0, R + 0.32, -0.16);
    const plinth = roundedBox(1.9, 0.32, 0.9, 0.05, 31).translate(0, 0.16, 0);
    const m = new THREE.Mesh(mergeGeos([dg, plinth]), granite);
    m.position.set(x, gy - 0.05, z); m.rotation.y = 0.25; m.castShadow = m.receiveShadow = true; setLayer(m, LAYER.ABOVE); scene.add(m);
    WORLD.disc = [x, z];
  }
  // 岸边零星低矮石块（官方地图：自然草坡，偶有低石）
  const low = [[], [], []], variants = [0, 1, 2].map((i) => rockGeo(i * 9.3 + 4, 4));
  for (let k = 0; k < 26; k++) {
    const sh = shoreAt(((k * 0.618034) % 1) * POLY_LEN), r = rr(0.25, 0.55);
    V.set(sh.x + sh.nx * r * 0.3, 0.02 + r * 0.25, sh.z + sh.nz * r * 0.3); E.set(rr(-0.2, 0.2), rand() * 6.28, rr(-0.2, 0.2)); Q.setFromEuler(E);
    SC.set(r * rr(1.0, 1.4), r * rr(0.5, 0.75), r * rr(0.9, 1.2)); low[k % 3].push(mtx());
  }
  for (let i = 0; i < 3; i++) { const bm = instanced(variants[i], boulderMat, low[i], LAYER.BOTH); WORLD.solids.push(bm); addMossShells(bm, 0.5); }
  buildCuihuBuildings();
}
function buildCuihuBuildings() {
  const C = CUIHU, G = C.G, groups = {};
  const roofMat = physical({ color: 0x9a9894, roughness: 0.9, envMapIntensity: 0.5 }, { key: 'roofslab' });
  const plinthMat = physical({ color: 0x77736c, roughness: 0.85 }, { key: 'plinth' });
  const tileMat = physical({ map: TEX.roof.map, normalMap: TEX.roof.normalMap, color: 0x8d949a, roughness: 0.7, envMapIntensity: 0.6 }, { key: 'pitchroof' });
  tileMat.map.wrapS = tileMat.map.wrapT = THREE.RepeatWrapping;
  const roofs = [], plinths = [], boxes = [], pitched = [];
  WORLD.buildings = [];
  for (const b of C.buildings) {
    const st = b.S, h = b.h;
    (groups[b.style] = groups[b.style] || { st, geos: [] }).geos.push(cuihuWalls(b.poly, G, h, st.fh));
    plinths.push(cuihuWalls(b.poly.map(([x, z]) => [x, z]), G - 0.2, 0.9, 0.9));
    let top = G + h;
    if (st.pitched) {
      // 教师公寓：主楼东西向、两翼南北向的坡屋顶
      const [x0, z0, x1, z1] = b.bb, mainZ0 = z0 + (z1 - z0) * 0.4;
      roofs.push(cuihuPrism(b.poly, G + h - 0.05, G + h + 0.1));
      pitched.push(cuihuGable(x0, mainZ0, x1, z1, G + h + 0.1, 3.4, true));
      pitched.push(cuihuGable(x0, z0, x0 + 11.2, mainZ0 + 1, G + h + 0.1, 3.2, false));
      pitched.push(cuihuGable(x1 - 12, z0, x1, mainZ0 + 1, G + h + 0.1, 3.2, false));
      top += 3.5;
    } else {
      roofs.push(cuihuPrism(b.poly, G + h - 0.05, G + h + 0.15));
      // 女儿墙 + 屋顶楼梯间 / 电梯机房
      const par = cuihuWalls(b.poly, G + h, 1.0, 1.0); plinths.push(par);
      const [x0, z0, x1, z1] = b.bb, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, lx = x1 - x0, lz = z1 - z0;
      if (b.style === 'dorm') for (const f of [-0.28, 0.28]) {
        const px = lx > lz ? cx + f * lx : cx, pz = lx > lz ? cz : cz + f * lz;
        if (C.inPoly(b.poly, px, pz)) boxes.push(new THREE.BoxGeometry(4.2, 3.0, 4.2).translate(px, G + h + 1.5, pz));
      }
      top += 3;
    }
    WORLD.buildings.push({ poly: b.poly, top, bb: b.bb, name: b.name });
  }
  for (const k in groups) {
    const { st, geos } = groups[k];
    const m = physical({ map: cuihuFacadeTex(st), roughness: 0.82, envMapIntensity: 0.55 }, { key: 'facade_' + k });
    const mesh = meshOf(geos, m, LAYER.ABOVE);
    mesh.material.side = THREE.DoubleSide;
  }
  meshOf(roofs.concat(boxes), roofMat, LAYER.ABOVE);
  meshOf(plinths, plinthMat, LAYER.ABOVE);
  if (pitched.length) meshOf(pitched, tileMat, LAYER.ABOVE);
}
// 相机 / 巡游用：点 (x,z) 处建筑屋顶高度（不在建筑内返回 -Infinity，pad 为外扩米数）
function cuihuBuildingTop(x, z, pad = 1.5) {
  for (const b of WORLD.buildings || []) {
    if (x < b.bb[0] - pad || x > b.bb[2] + pad || z < b.bb[1] - pad || z > b.bb[3] + pad) continue;
    if (CUIHU.polySd(b.poly, x, z) < pad) return b.top;
  }
  return -Infinity;
}

/* ---- 校园路灯（现代灯杆：灰色细杆 + 扁平灯头），夜晚亮起；前 4 盏配真实点光源（南岸与锦鲤区） */
function buildCuihuLamps() {
  const metal = physical({ color: 0x5d6368, roughness: 0.4, metalness: 0.75, envMapIntensity: 0.8 }, { key: 'lampmetal' });
  const glow = new THREE.MeshBasicMaterial({ color: 0xffd9a0 });
  const lit = [2, 3, 4, 10];
  CUIHU.lamps.forEach(([x, z], i) => {
    if (sdf(x, z) < 0.6) return;
    const gy = Math.max(terrainHeight(x, z), CUIHU.G), parts = [];
    parts.push(new THREE.CylinderGeometry(0.13, 0.16, 0.3, 14).translate(0, 0.15, 0));
    parts.push(new THREE.CylinderGeometry(0.05, 0.07, 4.6, 12).translate(0, 2.6, 0));
    parts.push(new THREE.BoxGeometry(0.9, 0.06, 0.06).translate(0.35, 4.85, 0));
    parts.push(new THREE.CylinderGeometry(0.26, 0.3, 0.1, 18).translate(0.75, 4.82, 0));
    const m = new THREE.Mesh(mergeGeos(parts), metal); m.position.set(x, gy - 0.02, z); m.rotation.y = rand() * 6.28;
    m.castShadow = true; m.receiveShadow = true; setLayer(m, LAYER.ABOVE); scene.add(m);
    const head = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.04, 18), glow.clone());
    const hp = new THREE.Vector3(0.75, 4.76, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), m.rotation.y);
    head.position.set(x + hp.x, gy - 0.02 + hp.y, z + hp.z); setLayer(head, LAYER.ABOVE); scene.add(head); LANTERNS.push(head);
    if (lit.includes(i)) { const L = new THREE.PointLight(0xffc98a, 0, 16, 1.6); L.position.copy(head.position).y -= 0.2; scene.add(L); LAMPS.lights.push(L); }
  });
  for (const [[x, z], yaw] of CUIHU.benches) buildBench(x, z, yaw);
}

/* ---- 视点辅助：平面图像素 → 场景坐标；视线与水面的交点（涟漪模拟窗口、阴影范围都跟随它） */
function cuihuV(px, py, y) { const [x, z] = CUIHU.W([px, py]); return new THREE.Vector3(x, y, z); }
const _cf = new THREE.Vector3(), _cdir = new THREE.Vector3();
function cuihuFocus(out) {
  camera.getWorldDirection(_cdir);
  const p = camera.position;
  let t = _cdir.y < -0.03 ? (WATER_Y - p.y) / _cdir.y : 30;
  t = clamp(t, 0, 45);
  return out.set(p.x + _cdir.x * t, 0, p.z + _cdir.z * t);
}
// 全湖水面遮罩（有向距离，[-2, 2] 米 → 0..255，0.2 米一格）：水面着色器按它裁出湖岸（湖心岛也挖掉）
let lakeMaskTex = null;
const LAKE_R = new THREE.Vector4();
function buildLakeMask() {
  const [x0, z0, x1, z1] = CUIHU.B.lake, pad = 2, cell = 0.2;
  const X0 = x0 - pad, Z0 = z0 - pad, w = Math.ceil((x1 - x0 + 2 * pad) / cell), h = Math.ceil((z1 - z0 + 2 * pad) / cell);
  const md = new Uint8Array(w * h * 4);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const v = clamp((sdf(X0 + (i + 0.5) * cell, Z0 + (j + 0.5) * cell) + 2) / 4, 0, 1) * 255, k = (j * w + i) * 4;
    md[k] = md[k + 1] = md[k + 2] = v; md[k + 3] = 255;
  }
  lakeMaskTex = new THREE.DataTexture(md, w, h); lakeMaskTex.magFilter = lakeMaskTex.minFilter = THREE.LinearFilter; lakeMaskTex.needsUpdate = true;
  LAKE_R.set(X0, Z0, 1 / (w * cell), 1 / (h * cell));
  return lakeMaskTex;
}
// 涟漪模拟只覆盖视点附近 30 米见方的窗口（全湖 145 米按原分辨率模拟太贵）：视点移出窗口中部时，窗口按整格平移，已有涟漪随之搬过去
const SHIFT_FS = /* glsl */`
uniform sampler2D tPrev;
uniform vec2 uOff;
varying vec2 vUv;
void main(){ vec2 uv = vUv + uOff; gl_FragColor = (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) ? vec4(0.0) : texture2D(tPrev, uv); }`;
const SIMFOLLOW = { pass: null };
function simWindowMask() {
  const N = SIM.N, md = maskTex.image.data;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const v = clamp((sdf(SIM.x0 + (i + 0.5) / N * SIM.size, SIM.z0 + (j + 0.5) / N * SIM.size) + 2) / 4, 0, 1) * 255, k = (j * N + i) * 4;
    md[k] = md[k + 1] = md[k + 2] = v;
  }
  maskTex.needsUpdate = true;
}
function simFollow() {
  if (!simPass || !maskTex) return;
  cuihuFocus(_cf);
  const cx = SIM.x0 + SIM.size / 2, cz = SIM.z0 + SIM.size / 2;
  if (Math.abs(_cf.x - cx) < SIM.size * 0.22 && Math.abs(_cf.z - cz) < SIM.size * 0.22) return;
  const cell = SIM.size / SIM.N, di = Math.round((_cf.x - cx) / cell), dj = Math.round((_cf.z - cz) / cell);
  if (!SIMFOLLOW.pass) SIMFOLLOW.pass = shaderPass(SHIFT_FS, { tPrev: { value: null }, uOff: { value: new THREE.Vector2() } });
  SIMFOLLOW.pass.uniforms.tPrev.value = simA.texture; SIMFOLLOW.pass.uniforms.uOff.value.set(di / SIM.N, dj / SIM.N);
  SIMFOLLOW.pass.render(simB);
  const t = simA; simA = simB; simB = t;
  SIM.x0 += di * cell; SIM.z0 += dj * cell;
  simPass.uniforms.uSim.value.set(SIM.x0, SIM.z0, SIM.size, 0);
  waterMat.uniforms.uSim.value.set(SIM.x0, SIM.z0, SIM.size, 1 / SIM.N);
  SH.uSimS.value.set(SIM.x0, SIM.z0, SIM.size, 1 / SIM.N);
  simWindowMask();
  waterMat.uniforms.tRipple.value = simA.texture; SH.tRippleS.value = simA.texture;
}
// 阴影范围跟随视点（±48 米，按 8 米网格吸附，避免阴影边缘每帧抖动）
const SHF = { x: 1e9, z: 1e9 };
function cuihuShadowFollow() {
  cuihuFocus(_cf);
  const g = 8, x = Math.round(lerp(camera.position.x, _cf.x, 0.5) / g) * g, z = Math.round(lerp(camera.position.z, _cf.z, 0.5) / g) * g;
  if (x === SHF.x && z === SHF.z) return;
  SHF.x = x; SHF.z = z;
  sun.target.position.set(x, 0, z); sun.target.updateMatrixWorld();
  sun.position.copy(SH.uSunDir.value).multiplyScalar(150).add(sun.target.position);
  SHADOW.dirty = true;
}
// 近裁剪面随离地高度变化：贴近水面的特写保持 2 厘米，高空俯瞰时放大到 0.5 米（远处 300 米外的深度精度）
function cuihuNearPlane() {
  const p = camera.position, hg = p.y - Math.max(WATER_Y, terrainHeight(p.x, p.z));
  const nr = clamp(hg * 0.04, 0.02, 0.5);
  if (Math.abs(nr - camera.near) > 0.004) { camera.near = nr; camera.updateProjectionMatrix(); }
}
