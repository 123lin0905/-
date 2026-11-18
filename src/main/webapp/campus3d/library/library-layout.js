/*
 * 图书馆板块 · 布局（官方校园地图还原）
 * ------------------------------------------------------------------
 * 依据：学校官方校园地图（showtimer 手绘鸟瞰图，dataId 961，z21 瓦片拼图），用 plan_to_official_affine 仿射逆变换
 * 校正回本项目平面图像素坐标（x 东、y 南，0.4 米 / 像素）后逐项描出：
 *   - 图书馆：两层主馆（大面积浅灰石材平屋面，挑檐；南立面通长玻璃幕墙 + 红砖壁柱），东南端三层红砖 / 面砖入口楼（玻璃幕墙、挑雨棚），
 *     西北角一层附楼；屋面按画面高度位移校正回墙基（主馆约向南 34 像素）；馆前铺装前庭与旗杆。
 *   - 馆北：没有水池 —— 是一大片由南向北抬升的开阔草坡，中间一处种植土丘（大香樟 + 白粉色开花树 + 紫 / 黄双色新月形花境），
 *     一条浅色石材园路呈 S 形穿过坡顶后沿东侧回到图书馆东北角；四周是混交林带（含粉色开花树）。
 *   - 馆西：台地花田（红 / 黄 / 粉 / 灰绿色条带逐级抬高，中间一条粉褐色铺装踏步通道），通道顶端一座蓝色屋顶小亭；通道东侧一列银杏。
 *   - 道路：北侧 / 东侧校内路（与地图一致位于本项目 campus_layout.json 道路以西约 40 像素）、西侧图书馆北路、西南中央步道、东缘九洲大道。
 * 坐标原点（世界 0,0）= 平面图 (1260, 850)。所有数值为平面图像素，除特别注明的米。
 */
(function () {
  "use strict";
  const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

  // 图书馆墙基（由屋面仿射位置向南校正）：主馆中心、轴线方向
  const LIB = { c: [1245.75, 1033.5], ang: Math.atan2(-42, 127) };
  const libPlanPoly = (u0, v0, u1, v1, pad) => {   // 局部米 → 平面像素
    const c = Math.cos(LIB.ang), s = Math.sin(LIB.ang); pad = pad || 0;
    return [[u0 - pad, v0 - pad], [u1 + pad, v0 - pad], [u1 + pad, v1 + pad], [u0 - pad, v1 + pad]].map(([u, v]) => [LIB.c[0] + (u * c - v * s) / 0.4, LIB.c[1] + (u * s + v * c) / 0.4]);
  };
  const LIB_PAD = libPlanPoly(-29, -28.5, 29.5, 24, 0);     // 主馆 + 附楼 + 入口楼外扩的平整场地
  // 台地花田（西侧）：上边 A-B、下边 D-C（B-C 为踏步通道西缘）
  const TER = { A: [1060, 870], B: [1116, 861], C: [1142, 969], D: [1090, 985], n: 11,
    colors: ["#e8566a", "#9fae8e", "#f2c531", "#d8323a", "#a7b597", "#f6d23c", "#f08aa8", "#9fae8e", "#f2c531", "#e04848", "#a7b597"] };
  const lerp2 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  function terraceStrip(i, gap) {
    const t0 = i / TER.n + gap, t1 = (i + 1) / TER.n - gap;
    return [lerp2(TER.A, TER.D, t0), lerp2(TER.B, TER.C, t0), lerp2(TER.B, TER.C, t1), lerp2(TER.A, TER.D, t1)];
  }
  const TER_POLY = [TER.A, TER.B, TER.C, TER.D];

  function inPolyP(p, poly) {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i], b = poly[j];
      if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) c = !c;
    }
    return c;
  }
  function distPoly(p, poly) {
    let d = Infinity;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length], dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy;
      const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L));
      d = Math.min(d, Math.hypot(p[0] - a[0] - dx * t, p[1] - a[1] - dy * t));
    }
    return inPolyP(p, poly) ? 0 : d;
  }

  // 地形（米）：馆北草坡由南（图书馆，0 米）向北抬升约 4.2 米；西侧台地再高约 1.5 米；土丘 +1.5 米；图书馆与前庭为平地
  function height(px, py) {
    let h = 4.2 * ss(985, 790, py);
    h += 1.5 * ss(1165, 1080, px) * ss(990, 860, py);
    const dm = Math.hypot(px - 1236, py - 802);
    h += 1.5 * Math.exp(-(dm * dm) / (40 * 40));
    h += 0.22 * Math.sin(px * 0.045 + 1.3) * Math.sin(py * 0.037);
    const dl = distPoly([px, py], LIB_PAD);
    h *= ss(0, 22, dl);
    return h;
  }

  const L = {
    id: "library", zoneId: "library_lotus", name: "图书馆·馆前草坡", icon: "🏛️",
    intro: "校园中轴北端的图书馆：两层主馆配红砖与通长玻璃幕墙，东南角三层入口楼；馆北是开阔的缓坡草地，坡上一处种植土丘围着紫、黄双色新月花境，石材园路弯过坡顶；馆西是逐级抬高的台地花田与蓝顶小亭。",
    highlights: ["图书馆", "草坡", "土丘花境", "台地花田", "银杏", "香樟"],
    ecoTitle: "图书馆生态",
    ecoNote: "原有个体按官方校园地图位置种植（香樟、开花树、银杏列植、花境、台地花田）；数量为场景中的个体数，增删后实时更新。",
    origin: [1260, 850], bounds: { x0: 1050, y0: 560, x1: 1465, y1: 1140 },
    height, waterLevel: null, fog: 0.0016, farY: 1.0, seed: 515,
    ground: {
      lawn: "#6c9a37", outside: "#5d8a32",
      roads: [
        { path: [[1040, 552], [1100, 566], [1160, 584], [1205, 592], [1252, 620], [1298, 660], [1338, 697], [1368, 728], [1388, 778], [1400, 840], [1412, 920], [1424, 1000], [1438, 1070], [1452, 1150]], w: 17 },
        { path: [[1436, 548], [1450, 700], [1464, 850], [1478, 1000], [1492, 1150]], w: 55, centerColor: "rgba(245,245,240,0.9)" },
        { path: [[1036, 846], [1075, 795], [1105, 750], [1135, 705], [1160, 655], [1182, 610], [1205, 592]], w: 16 },
        { path: [[1026, 945], [1060, 990], [1088, 1030], [1115, 1068], [1145, 1100], [1185, 1124], [1232, 1146]], w: 18 },
      ],
      plaza: [
        { poly: libPlanPoly(-29, -17.5, 29.5, 17.5, 0), color: "#bdb7ac", grid: 1.2, gridAngle: LIB.ang },                                   // 馆周散水铺装
        { poly: [[1186, 1092], [1290, 1062], [1352, 1046], [1374, 1146], [1200, 1150]], color: "#c7c0b3", grid: 1.0, gridAngle: LIB.ang, checker: "rgba(130,122,110,0.22)" },   // 馆前前庭
        { poly: [[1123, 872], [1137, 868], [1167, 1000], [1152, 1004]], color: "#aeaaa2", grid: 0.6, gridAngle: 1.33 },                             // 踏步东侧灰色铺装带
        { poly: libPlanPoly(-29, -28.5, -10, -17.5, 0), color: "#bdb7ac", grid: 1.2, gridAngle: LIB.ang },
      ],
      paths: [
        { path: [[1108, 772], [1140, 767], [1165, 762], [1195, 757], [1222, 742], [1246, 724], [1264, 716], [1290, 724], [1312, 738], [1328, 758], [1340, 785], [1350, 815], [1353, 850], [1357, 880], [1358, 902], [1342, 914], [1318, 930], [1300, 945]], w: 9, joints: true },
        { path: [[1262, 716], [1266, 690], [1272, 652]], w: 6 },
        { path: [[1121, 858], [1134, 915], [1147, 968], [1158, 1000], [1176, 1030], [1186, 1062], [1192, 1094]], w: 10, color: "#c69a85", edgeColor: "#8b6a58" },   // 台地花田中间的粉褐色踏步通道
      ],
      soil: [[[1194, 764], [1250, 752], [1284, 788], [1282, 818], [1242, 822], [1198, 812]]],   // 土丘林下覆土
      mulch: [
        [[1045, 555], [1440, 555], [1440, 700], [1380, 724], [1330, 700], [1290, 712], [1250, 712], [1200, 740], [1150, 752], [1100, 758], [1045, 795]],
        [[1335, 940], [1350, 860], [1350, 780], [1376, 745], [1440, 745], [1455, 1140], [1385, 1140], [1352, 1040]],
      ],
      beds: [
        { path: [[1186, 816], [1200, 825], [1218, 830], [1240, 831], [1262, 830], [1281, 836]], w: 10, soil: "#4a3a2a", colors: ["#8e5bd6", "#a274e0", "#7b4cc8", "#9a66da"], step: 0.62 },     // 新月花境：紫
        { path: [[1190, 836], [1205, 846], [1226, 851], [1247, 851], [1268, 846]], w: 9, soil: "#4a3a2a", colors: ["#f2c21c", "#f6d544", "#eaa514"], step: 0.62 },                             // 新月花境：黄
        { poly: TER_POLY, soil: "#5a4632" },
      ],
      hedges: [
        { path: [[1405, 752], [1420, 766], [1442, 778]], w: 8, h: 1.0 },
        { path: [[1312, 948], [1334, 935], [1350, 918]], w: 4, h: 0.8 },
      ],
    },
    openAreas: [
      [[1166, 848], [1200, 838], [1292, 842], [1338, 858], [1346, 905], [1300, 935], [1215, 945], [1185, 930], [1163, 900]],
      [[1192, 764], [1250, 752], [1286, 790], [1284, 822], [1240, 826], [1196, 814]],
    ],
    belts: [
      { poly: [[1045, 555], [1440, 555], [1440, 700], [1380, 724], [1330, 700], [1290, 712], [1250, 712], [1200, 740], [1150, 752], [1100, 758], [1045, 795]], spacing: 10, mix: { camphor: 4, ginkgo: 1, osmanthus: 1.5, cherry: 0.7, metasequoia: 0.8 } },
      { poly: [[1045, 800], [1100, 765], [1140, 772], [1162, 822], [1122, 856], [1060, 866], [1045, 868]], spacing: 9, mix: { camphor: 3, osmanthus: 2, cherry: 1 } },
      { poly: [[1300, 945], [1338, 905], [1345, 860], [1340, 770], [1372, 742], [1440, 742], [1452, 1140], [1385, 1140], [1352, 1040]], spacing: 9.5, mix: { camphor: 4, osmanthus: 2, cherry: 1.2, ginkgo: 1 } },
      { poly: [[1060, 990], [1095, 992], [1150, 1010], [1172, 1050], [1186, 1100], [1140, 1100], [1080, 1040]], spacing: 9, mix: { camphor: 3, osmanthus: 2, ginkgo: 1 } },
      { poly: [[1250, 740], [1330, 705], [1345, 760], [1300, 790], [1275, 760]], spacing: 9, mix: { camphor: 3, cherry: 1, osmanthus: 1 } },
    ],
    // 场景原有、可编辑（选中 / 移植 / 移除）的个体：平面图像素
    seeds: {
      camphor: [[1272, 826, 1.25], [1306, 772, 1.0], [1170, 1060, 1.0]],
      cherry: [[1240, 821, 1.1], [1352, 958, 0.9]],
      ginkgo: [[1183, 796, 1.0], [1152, 890, 0.85], [1157, 912, 0.85], [1162, 934, 0.85], [1167, 956, 0.85], [1172, 978, 0.85], [1177, 1000, 0.85]],
      osmanthus: [[1206, 781, 1.0], [1228, 772, 1.0], [1256, 786, 1.0]],
      crapemyrtle: [[1172, 872, 1.0]],
      flowerbed: [[1176, 846], [1295, 846]],
      shrub_ball: [[1170, 1080], [1290, 1056], [1196, 1086]],
      cat: [[1240, 885]],
      butterfly: [[1232, 846], [1262, 842], [1102, 925]],
      magpie: [[1290, 900]],
      sparrow: [[1210, 900], [1216, 906]],
    },
    lamps: [
      { path: [[1108, 772], [1140, 767], [1165, 762], [1195, 757], [1222, 742], [1246, 724], [1264, 716], [1290, 724], [1312, 738], [1328, 758], [1340, 785], [1350, 815], [1353, 850], [1357, 880], [1358, 902], [1342, 914], [1318, 930], [1300, 945]], spacing: 45, side: 7, offset: 20 },
      [1200, 1110], [1260, 1093], [1330, 1075], [1360, 1120],
    ],
    views: {
      overview: { t: [1255, 880], d: 215, polar: 0.82, az: 0.62, label: "🗺️ 全景", title: "整个板块全景（东南方向俯视）" },
      official: { t: [1255, 880], d: 260, polar: 1.02, az: 0.22, label: "🖼️ 官方视角", title: "与官方校园地图相同的东南向鸟瞰角度" },
      library: { t: [1262, 1035], ty: 5, d: 78, polar: 1.12, az: 0.42, label: "🏛️ 图书馆", title: "图书馆南立面与入口楼" },
      slope: { t: [1238, 822], ty: 2, d: 62, polar: 1.12, az: 0.15, label: "🌳 草坡土丘", title: "馆北草坡、土丘与新月花境" },
      terrace: { t: [1112, 925], ty: 1, d: 52, polar: 1.05, az: 1.05, label: "🌷 台地花田", title: "西侧台地花田与蓝顶小亭" },
      top: { t: [1257, 850], d: 330, polar: 0.001, az: 0 },
      edit: { t: [1240, 860], d: 120, polar: 0.55, az: 0.3 },
    },
    startView: "overview",
    tour: [
      { p: [1345, 1215, 34], t: [1262, 1020, 8], cap: "图书馆 · 红砖与通长玻璃幕墙" },
      { p: [1318, 1118, 5], t: [1292, 1062, 7], cap: "入口楼 · 挑雨棚与前庭旗杆", slow: 0.35 },
      { p: [1214, 1112, 8], t: [1165, 980, 4], cap: "馆西 · 银杏列植" },
      { p: [1084, 1010, 7], t: [1128, 905, 4], cap: "台地花田 · 蓝顶小亭", slow: 0.35 },
      { p: [1120, 840, 9], t: [1236, 822, 4], cap: "馆北草坡 · 种植土丘" },
      { p: [1205, 870, 4], t: [1240, 828, 3], cap: "紫、黄双色新月花境", slow: 0.3 },
      { p: [1262, 742, 4], t: [1310, 800, 2], cap: "S 形石材园路穿过坡顶" },
      { p: [1372, 860, 14], t: [1262, 905, 2], cap: "开阔草坡" },
      { p: [1405, 1040, 30], t: [1262, 1010, 6], cap: "" },
    ],
    // 台地花田的花（逐条带着色）
    flowerPoints: [function (Z, pts, rnd) {
      for (let i = 0; i < TER.n; i++) {
        const poly = terraceStrip(i, 0.012), c = new Z.THREE.Color(TER.colors[i]);
        let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
        for (const p of poly) { minx = Math.min(minx, p[0]); maxx = Math.max(maxx, p[0]); miny = Math.min(miny, p[1]); maxy = Math.max(maxy, p[1]); }
        const st = 0.56 / 0.4, sage = /9fae8e|a7b597/.test(TER.colors[i]);
        for (let y = miny; y <= maxy; y += st) for (let x = minx; x <= maxx; x += st) {
          if (!Z.inPoly([x, y], poly)) continue;
          const [wx, wz] = Z.toW(x + (rnd() - 0.5) * st * 0.5, y + (rnd() - 0.5) * st * 0.5);
          pts.push({ x: wx, y: Z.surfaceAt(wx, wz) - 0.06, z: wz, c: sage ? [c.r * 1.25, c.g * 1.1, c.b * 1.35] : [c.r, c.g, c.b], s: sage ? 0.85 : 0.75 + rnd() * 0.25 });
        }
      }
    }],
    build,
    decorate,
  };

  // ---------------- 建筑：图书馆、蓝顶小亭、台地、旗杆 ----------------
  function build(Z) {
    const THREE = Z.THREE, B = Z.B, M = Z.M, V3 = THREE.Vector3;
    const A = B.assembler();
    const [ox, oz] = Z.toW(LIB.c[0], LIB.c[1]);
    const F = B.frame([ox, oz], LIB.ang);
    const g = new THREE.Group(); g.name = "library";
    const H = 9.0;
    // 主馆：红砖墙 + 两层窗带（层高 4.4 米）
    const main = F.rect(-26.75, -14.35, 26.75, 14.35);
    B.block(A, M, main, H, { floor: 4.4, winW: 1.5, gap: 1.7, parapet: 0, wall: "brick" });
    // 南立面：通长玻璃幕墙（u -26 ~ 10），红砖壁柱、白色层间带
    const v = 14.42;
    A.add(M.glass, B.quad(F.v3(-25.9, 0.6, v), F.v3(10, 0.6, v), F.v3(10, 8.5, v), F.v3(-25.9, 8.5, v)));
    for (const u of [-26.3, -17.4, -8.5, 0.4, 9.5]) { const [x, z] = F.p(u, v + 0.25); A.add(M.brick, B.box(x, 4.5, z, 1.0, 9.0, 0.6, -LIB.ang, 1)); }
    { const [x, z] = F.p(-8, v + 0.12); A.add(M.paint, B.box(x, 4.55, z, 36.4, 0.45, 0.32, -LIB.ang, 1)); }
    // 挑檐屋面板（四周挑出 1.5 米）+ 屋面石材 + 天窗 + 设备间
    const roofR = F.rect(-28.25, -15.85, 28.25, 15.85);
    const pr = B.prism(roofR, H, H + 0.75, 1);
    A.add(M.white, pr.sides); A.add(M.roof, pr.top); A.add(M.white, pr.bottom);
    { const [x, z] = F.p(15.5, -1); A.add(M.glass, B.box(x, H + 1.2, z, 7.5, 0.9, 11, -LIB.ang, 1)); A.add(M.metal, B.box(x, H + 0.8, z, 8.1, 0.12, 11.6, -LIB.ang, 1)); }
    { const [x, z] = F.p(-14, -7); A.add(M.paint, B.box(x, H + 1.5, z, 5, 1.5, 3.4, -LIB.ang, 1)); }
    { const [x, z] = F.p(-2, 6); A.add(M.paint, B.box(x, H + 1.2, z, 3, 0.9, 2.2, -LIB.ang, 1)); }
    // 西北附楼（一层半，平屋面）
    const wing = F.rect(-27, -26, -12, -14.2);
    B.block(A, M, wing, 6.4, { floor: 3.2, winW: 1.8, gap: 1.4, parapet: 0.6, wall: "brick" });
    // 东南入口楼：三层面砖 + 正面玻璃幕墙 + 挑雨棚
    const ent = F.rect(10, 4, 27.5, 21);
    B.block(A, M, ent, 14, { floor: 4.4, winW: 2.2, gap: 1.2, parapet: 0.9, wall: "tile" });
    const fv = 21.08;
    A.add(M.glass, B.quad(F.v3(13.6, 0.6, fv), F.v3(24, 0.6, fv), F.v3(24, 13.4, fv), F.v3(13.6, 13.4, fv)));
    for (const u of [13.4, 16.9, 20.4, 24.1]) { const [x, z] = F.p(u, fv + 0.2); A.add(M.metal, B.box(x, 7, z, 0.18, 12.8, 0.45, -LIB.ang, 1)); }
    { const [x, z] = F.p(18.8, fv + 0.06); A.add(M.glassDark, B.box(x, 2.1, z, 4.6, 3.0, 0.06, -LIB.ang, 1)); }
    { const [x, z] = F.p(18.8, 23.3); A.add(M.white, B.box(x, 4.85, z, 12.5, 0.4, 4.6, -LIB.ang, 1)); }
    for (const u of [13.4, 24.2]) { const [x, z] = F.p(u, 25.1); A.add(M.metal, B.box(x, 2.35, z, 0.28, 4.7, 0.28, -LIB.ang, 1)); }
    // 入口台阶
    for (let k = 0; k < 3; k++) { const [x, z] = F.p(18.8, 22.2 + k * 0.45); A.add(M.granite, B.box(x, 0.3 - k * 0.1, z, 13 + k, 0.6 - k * 0.2, 0.9, -LIB.ang, 1)); }
    A.build(g);
    Z.scene.add(g);
    // 占地（放置规则用，世界米）
    [main, wing, ent].forEach((p) => Z.addBuildingPoly(p));
    // 旗杆（前庭三根）
    const pole = new THREE.CylinderGeometry(0.07, 0.1, 12, 10).translate(0, 6, 0);
    const flagMat = new THREE.MeshStandardMaterial({ color: 0xd2232a, roughness: 0.8, side: THREE.DoubleSide });
    for (const k of [-4, 0, 4]) {
      const [x, z] = F.p(18.8 + k, 36);
      const y = Z.heightAt(x, z);
      const m = new THREE.Mesh(pole, M.metal); m.position.set(x, y, z); m.castShadow = true; Z.scene.add(m);
      const f = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.6, 8, 1).translate(1.2, 0, 0), flagMat); f.position.set(x, y + 11, z); f.castShadow = true; Z.scene.add(f);
      Z.onFrame((dt, t) => { const p = f.geometry.attributes.position; for (let i = 0; i < p.count; i++) { const u = p.getX(i); p.setZ(i, Math.sin(u * 2.2 - t * 4 + k) * 0.12 * u / 2.4); } p.needsUpdate = true; f.rotation.y = -Z.look.U.uWindDir.value.x * 0.0 + 0.6; });
      Z.addStatic(x, z, 0.5);
    }
    buildKiosk(Z);
    buildTerraces(Z);
  }

  // 蓝顶小亭：台地花田踏步通道顶端（官方地图：浅墙、蓝色四坡屋面）
  function buildKiosk(Z) {
    const THREE = Z.THREE, B = Z.B, M = Z.M;
    const [kx, kz] = Z.toW(1145, 888);
    const ang = Math.atan2(108, 26);
    const F = B.frame([kx, kz], ang);
    const y0 = Z.heightAt(kx, kz) - 0.1;
    const A = B.assembler();
    const poly = F.rect(-3.2, -2.7, 3.2, 2.7);
    // 台基
    const base = B.prism(F.rect(-3.8, -3.3, 3.8, 3.3), y0 - 0.6, y0 + 0.35, 1); A.add(M.granite, base.sides); A.add(M.granite, base.top);
    B.block(A, M, poly, 3.1, { y0: y0 + 0.35, floor: 3.1, winW: 1.4, gap: 0.9, parapet: 0, wall: "paint" });
    // 四坡屋面（蓝色），挑出 0.8 米
    const ry = y0 + 0.35 + 3.1;
    const roof = new THREE.ConeGeometry(1, 1, 4, 1, false, Math.PI / 4);
    const nonIdx = roof.toNonIndexed(); nonIdx.scale(4.0 * Math.SQRT2 * 1.0, 1.6, 3.5 * Math.SQRT2 * 1.0);
    const uv = nonIdx.attributes.uv, pos = nonIdx.attributes.position; for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) + pos.getZ(i), pos.getY(i) * 2);
    nonIdx.rotateY(-ang); nonIdx.translate(kx, ry + 0.8, kz);
    A.add(M.blueRoof, nonIdx);
    const g = new THREE.Group(); g.name = "kiosk"; A.build(g); Z.scene.add(g);
    Z.addBuildingPoly(F.rect(-3.8, -3.3, 3.8, 3.3));
  }

  // 台地花田：11 条逐级抬高的种植池（褐色砖砌池壁 + 覆土），花由 flowerPoints 种上
  function buildTerraces(Z) {
    const THREE = Z.THREE, B = Z.B, M = Z.M;
    const A = B.assembler();
    const kerb = Z.look.patch(new THREE.MeshStandardMaterial({ map: M.brick.map, normalMap: M.brick.normalMap, color: 0xb59a86, roughness: 0.85 }), { key: "kerb" });
    for (let i = 0; i < TER.n; i++) {
      const strip = terraceStrip(i, 0.004);
      const w = strip.map((p) => Z.toW(p[0], p[1]));
      const cx = w.reduce((a, p) => a + p[0], 0) / 4, cz = w.reduce((a, p) => a + p[1], 0) / 4;
      let hmin = Infinity; for (const p of w) hmin = Math.min(hmin, Z.heightAt(p[0], p[1]));
      const top = Z.heightAt(cx, cz) + 0.32;
      const pr = B.prism(w, hmin - 0.4, top, 1);
      A.add(kerb, pr.sides); A.add(M.soil, pr.top);
      Z.addRaised(strip, top);
    }
    const g = new THREE.Group(); g.name = "terraces"; A.build(g); Z.scene.add(g);
  }

  // 园路长椅
  function decorate(Z) {
    const THREE = Z.THREE, M = Z.M;
    const seat = Z.B.mergeNonIndexed([
      Z.B.box(0, 0.45, 0, 1.8, 0.06, 0.45, 0, 1).toNonIndexed(), Z.B.box(0, 0.8, -0.2, 1.8, 0.35, 0.05, 0, 1).toNonIndexed(),
    ]);
    const legs = Z.B.mergeNonIndexed([Z.B.box(-0.75, 0.22, 0, 0.08, 0.45, 0.45, 0, 1).toNonIndexed(), Z.B.box(0.75, 0.22, 0, 0.08, 0.45, 0.45, 0, 1).toNonIndexed()]);
    for (const [px, py, a] of [[1236, 735, 0.6], [1300, 735, -0.4], [1345, 830, -1.5], [1230, 860, 3.0], [1180, 772, 0.1]]) {
      const [x, z] = Z.toW(px, py), y = Z.heightAt(x, z);
      const g = new THREE.Group(); g.add(new THREE.Mesh(seat, M.wood), new THREE.Mesh(legs, M.darkMetal));
      g.children.forEach((m) => { m.castShadow = true; m.receiveShadow = true; });
      g.position.set(x, y, z); g.rotation.y = a; Z.scene.add(g); Z.addStatic(x, z, 1.0);
    }
  }

  window.ZONE_LAYOUT = L;
})();
