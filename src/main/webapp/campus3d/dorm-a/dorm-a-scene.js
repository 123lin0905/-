/*
 * A 区宿舍生活区 · 板块细节场景（A1–A4 学生公寓 + 三座圆形场馆 + 学生食堂与底层商铺）
 * ------------------------------------------------------------------------------
 * 依据：官方地图（学校官网“3D 地图”的手绘鸟瞰图，从南偏西方向斜俯看）与官网平面图（campus_layout.json，1 像素 = 0.4 米）。
 *   官方图 ↔ 平面图仿射：px21_x = 4.6257x + 1.1329y + 3227.9，px21_y = −0.7659x + 2.0585y + 5683.5。
 *   - 学生公寓 A1–A4：四栋红砖板楼（约 6 层，灰色腰线 / 阳台，平屋面带楼梯间），彼此平行、自西向东错开；楼端是方的（按画面，
 *     不用平面图的 roundEnd 圆头），南端有凸出的楼梯间和一层灰顶附属用房；
 *   - 三座独立的单层圆形场馆（玻璃外墙、灰色平屋面）立在板楼南端西侧：乒乓球馆（A4）、健美操馆（A3）、武术 / 跆拳道馆（A2）；
 *   - A3–A2、A2–A1 楼间北段各一块红色塑胶球场（围网 + 一侧树带），楼间草坪中散植香樟、女贞、桂花，A4 西侧与 A3 南端各一丛银杏；
 *   - 学生食堂：椭圆形就餐大厅（平屋面一排 4 个玻璃金字塔天窗 + 屋顶设备），北侧连着 3 层红砖楼，西侧是抬高的就餐平台；
 *     东侧弧形两层商业翼：蒲公英学子超市、学子书店、晨曦洗衣；南侧一排底层商铺（蜜雪冰城、辰鑫糕点、医务室）与长廊架；
 *     东南是红砖铺装的前广场，连到乒乓球馆。
 * 坐标：平面图像素 (px, py)，K.W() 换算为世界米。
 */
(function () {
  "use strict";
  const THREE = window.THREE, V3 = THREE.Vector3;

  // 板楼：平面图四角（西北、东北、东南、西南），沿楼长方向 d、横向 e（向东）
  const SLABS = [
    { id: "A4", name: "A4 学生公寓", poly: [[510, 721], [552, 707], [604, 862], [562, 876]] },
    { id: "A3", name: "A3 学生公寓", poly: [[629, 695], [671, 681], [723, 836], [681, 851]] },
    { id: "A2", name: "A2 学生公寓", poly: [[754, 674], [796, 660], [848, 813], [807, 828]] },
    { id: "A1", name: "A1 学生公寓", poly: [[872, 653], [914, 639], [967, 789], [925, 805]] },
  ];
  const SLAB_H = 19;
  const D = [0.318, 0.948], E = [0.948, -0.318];     // 楼长方向（向南）、横向（向东）
  // 三座圆形场馆（平面图像素圆心，半径 24 像素 ≈ 9.6 米）
  const ROT = [
    { id: "pingpang", name: "乒乓球馆", c: [525, 902] },
    { id: "jianmeicao", name: "健美操馆", c: [652, 878] },
    { id: "wushu", name: "武术 / 跆拳道馆", c: [770, 849] },
  ];
  const ROT_R = 24, ROT_H = 5.2;
  // 学生食堂椭圆大厅
  const OVAL = { c: [312, 838], a: 25, b: 18.5, rot: 18 * Math.PI / 180, h: 8.4 };
  // 两块楼间球场（平面图中心）
  const COURTS = [[741, 762], [857, 725]];

  async function build(K) {
    const { world, W } = K;
    const C = world.CLS;
    const pw = (pts) => pts.map((p) => W(p[0], p[1]));
    const addPx = (p, v, k) => [p[0] + v[0] * k, p[1] + v[1] * k];
    const slabAng = Math.atan2(D[1], D[0]);

    // ================= 地面：道路、步道、铺装 =================
    // 环校路（北段、南段）
    const ringN = [[199, 1000], [199, 763], [240, 726], [585, 653], [940, 549], [1040, 523]];
    const ringS = [[573, 1000], [512, 959], [209, 953], [199, 953]];
    world.road(ringN, 26, { centerLine: "white" });
    world.road(ringS, 26, { centerLine: "white" });
    // 中央步道（画面上是楼南端外的一条林荫车行道）
    const midRoad = [[633, 1000], [632, 940], [669, 914], [1003, 836], [1040, 836]];
    world.road(midRoad, 20, {});
    // 板楼四周窄铺装 + 每栋楼东侧的消防通道（花岗岩条石），北接环校路
    SLABS.forEach((s) => world.paintPoly(C.pavers, world.offsetPoly(world.pxPoly(s.poly), -2.2)));
    const lane = (s, off, t0, t1) => {
      const ne = s.poly[1], se = s.poly[2];
      const a = addPx(addPx(ne, E, off), D, t0), b = addPx(addPx(se, E, off), D, t1);
      return [a, b];
    };
    const lanes = [lane(SLABS[0], 14, -48, 4), lane(SLABS[1], 9, -62, 6), lane(SLABS[2], 9, -40, 6), lane(SLABS[3], 12, -32, 10)];
    lanes.forEach((l) => world.paintPath(C.pavers, pw(l), 3.6));
    // A4 东侧通道拐向南侧红砖广场
    world.paintPath(C.pavers, pw([lanes[0][1], [606, 910]]), 3.6);
    // 板楼西侧小径
    SLABS.forEach((s) => world.paintPath(C.pavers, pw([addPx(addPx(s.poly[0], E, -9), D, -10), addPx(s.poly[3], E, -9)]), 2.2));
    // 食堂东南的红砖前广场，连到乒乓球馆；圆形场馆四周红砖铺装
    world.paintPoly(C.brick, pw([[446, 846], [500, 834], [548, 878], [566, 936], [458, 946], [446, 912]]));
    ROT.forEach((r) => { const [x, z] = W(r.c[0], r.c[1]); world.paintCircle(C.brick, x, z, ROT_R * 0.4 + 3.2); });
    // 楼南端红砖步道：串起三座圆形场馆与各楼南口
    world.paintPath(C.brick, pw([[548, 930], [612, 912], [652, 905], [700, 892], [770, 876], [850, 857], [930, 838], [990, 824]]), 4.2);
    SLABS.forEach((s) => { const m = [(s.poly[2][0] + s.poly[3][0]) / 2, (s.poly[2][1] + s.poly[3][1]) / 2]; world.paintPath(C.brick, pw([m, addPx(m, D, 26)]), 4); });
    // 食堂西侧就餐平台、北楼前人行道
    world.paintPoly(C.slabs, pw([[212, 806], [258, 800], [266, 890], [214, 896]]));
    world.paintPath(C.pavers, pw([[214, 742], [400, 708]]), 3);
    // 楼间球场（红色塑胶）
    const courtPolys = COURTS.map(([px, py]) => {
      const [x, z] = W(px, py), c = Math.cos(slabAng), s = Math.sin(slabAng);
      const P = (u, v) => [x + u * c - v * s, z + u * s + v * c];
      return { x, z, P, poly: [P(-16, -9.5), P(16, -9.5), P(16, 9.5), P(-16, 9.5)] };
    });
    courtPolys.forEach((ct) => world.paintPoly(C.court, ct.poly));
    world.bake();

    // ================= 建筑 =================
    // 四栋板楼（方头，按官方画面）
    SLABS.forEach((s) => world.building({ id: s.id, name: s.name, cat: "宿舍", poly: s.poly, h: SLAB_H, style: "dorm", label: true }));
    SLABS.forEach((s) => {
      const p = world.pxPoly(s.poly), [nw, ne, se, sw] = p;
      const ang = Math.atan2(sw[1] - nw[1], sw[0] - nw[0]);
      const mid = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      // 屋面：两端楼梯间 + 中部水箱 / 空调外机
      for (const t of [0.12, 0.88]) {
        const c = mid(mid(nw, ne, 0.5), mid(sw, se, 0.5), t);
        world.box(c[0], c[1], 5.5, 6.5, 3.0, SLAB_H, ang, world.wallMat("brickplain"));
      }
      const cm = mid(mid(nw, ne, 0.5), mid(sw, se, 0.5), 0.5);
      world.acUnits(cm[0], cm[1], 3, SLAB_H, ang);
      world.box(cm[0] + D[0] * 6, cm[1] + D[1] * 6, 2.6, 2.6, 1.8, SLAB_H, ang, world.MAT.steelWhite);
      // 南端凸出的楼梯间（比屋面高一截）+ 东南角一层灰顶附属用房
      const sm = mid(sw, se, 0.62);
      world.box(sm[0] + D[0] * 1.6, sm[1] + D[1] * 1.6, 3.4, 5.2, SLAB_H + 2.2, 0, ang, world.wallMat("brickplain"));
      world.box(sm[0] + D[0] * 3.35, sm[1] + D[1] * 3.35, 0.1, 1.6, SLAB_H - 1, 0.8, ang, world.MAT.glassTeal);
      const an = mid(sw, se, 0.78);
      world.building({ id: s.id + "_annex", polyW: rectW(an[0] + D[0] * 4.6, an[1] + D[1] * 4.6, 7, 9, ang), h: 3.8, style: "plain", parapet: 0.4 });
      // 北端楼梯间
      const nm = mid(nw, ne, 0.4);
      world.box(nm[0] - D[0] * 1.4, nm[1] - D[1] * 1.4, 2.8, 4.6, SLAB_H + 1.6, 0, ang, world.wallMat("brickplain"));
    });

    // 三座圆形场馆：玻璃外墙 + 灰色平屋面 + 白色檐口 + 屋顶设备
    ROT.forEach((r) => {
      const [x, z] = W(r.c[0], r.c[1]), R = ROT_R * 0.4;
      world.building({ id: r.id, name: r.name, cat: "体育", circleW: { c: [x, z], r: R }, h: ROT_H, style: "glass", parapet: 0.5, label: true, labelY: 3 });
      world.addGeo(new THREE.CylinderGeometry(R + 0.35, R + 0.35, 0.9, 64, 1, true).translate(x, ROT_H - 0.1, z), world.MAT.white);
      world.addGeo(new THREE.CylinderGeometry(R + 0.2, R + 0.2, 0.5, 64, 1, true).translate(x, 0.25, z), world.MAT.darkGranite);
      world.acUnits(x - 1.5, z + 1.2, 3, ROT_H, 0.3);
      world.box(x + 2.2, z - 2.2, 2.4, 2.0, 1.4, ROT_H, 0.3, world.MAT.steelWhite);
      // 朝南的入口雨篷
      world.addGeo(new THREE.BoxGeometry(4.2, 0.3, 2.2).translate(x, 3.2, z + R + 0.9), world.MAT.white);
    });

    // ---------- 学生食堂 ----------
    const [ox, oz] = W(OVAL.c[0], OVAL.c[1]);
    world.building({ id: "shitang1", name: "学生食堂（一食堂）", cat: "生活", ellipse: { c: [ox, oz], a: OVAL.a, b: OVAL.b, rot: OVAL.rot }, h: OVAL.h, style: "canteen", parapet: 1.0, label: true, labelY: 7 });
    {
      const cr = Math.cos(OVAL.rot), sr = Math.sin(OVAL.rot);
      // 东南侧弧形玻璃幕墙（底层）
      const band = new THREE.CylinderGeometry(1, 1, 4.2, 72, 1, true, Math.PI * 0.05, Math.PI * 0.95).scale(OVAL.a + 0.25, 1, OVAL.b + 0.25).rotateY(-OVAL.rot).translate(ox, 2.5, oz);
      world.addGeo(band, world.MAT.glassTeal);
      // 屋面：一排 4 个玻璃金字塔天窗（沿长轴，略偏北）+ 屋顶设备
      const skyMat = world.std({ color: 0xbfe3f0, roughness: 0.06, metalness: 0.35, envMapIntensity: 1.5 }, { key: "zk-skylight", noWeather: true });
      for (const u of [-10.5, -3.5, 3.5, 10.5]) {
        const x = ox + u * cr + 4.2 * sr, z = oz + u * sr - 4.2 * cr;
        world.addGeo(new THREE.BoxGeometry(6.6, 0.5, 5.4).rotateY(-OVAL.rot).translate(x, OVAL.h + 0.25, z), world.MAT.metal);
        world.addGeo(new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 1).rotateY(Math.PI / 4).scale(6.0, 2.0, 4.8).rotateY(-OVAL.rot).translate(x, OVAL.h + 1.5, z), skyMat);
      }
      const ex = ox - 6.5 * sr, ez = oz + 6.5 * cr;
      world.box(ex, ez, 11, 5, 0.5, OVAL.h, OVAL.rot, world.MAT.granite);
      world.acUnits(ex, ez, 5, OVAL.h + 0.5, OVAL.rot);
      world.box(ex + 4 * cr, ez + 4 * sr, 2.4, 2.0, 1.6, OVAL.h + 0.5, OVAL.rot, world.MAT.steelWhite);
      world.sign("学生食堂", ox, 6.0, oz + OVAL.b + 0.45, 0, 10, 1.8, { bg: "#8a2b1f", fg: "#f7ead2" });
    }
    // 北侧 3 层红砖楼 + 西端 2 层
    world.building({ id: "shitang1_n", name: "学生食堂北楼", poly: [[262, 750], [398, 728], [404, 772], [268, 794]], h: 12.6, style: "canteen", label: false });
    world.building({ id: "shitang1_w", poly: [[222, 770], [262, 762], [270, 806], [228, 814]], h: 8, style: "canteen" });
    world.box(...W(330, 760), 6, 5, 2.8, 12.6, -0.16, world.wallMat("brickplain"));
    world.acUnits(...W(370, 752), 4, 12.6, -0.16);
    // 西侧就餐平台（抬高 1 米）+ 台阶
    world.platform(pw([[212, 806], [258, 800], [266, 890], [214, 896]]), 1.0, "slab");
    { const [x, z] = W(240, 897); world.steps(x, z + 2.0, [0, -1], 12, 5, 0.2, 0.4); }
    // 东侧弧形商业翼（两层）：超市、书店、洗衣
    const wing = [];
    { const cx = 330, cy = 845;
      for (let i = 0; i <= 16; i++) { const t = (-48 + 84 * i / 16) * Math.PI / 180; wing.push([cx + 122 * Math.cos(t), cy + 122 * Math.sin(t)]); }
      for (let i = 16; i >= 0; i--) { const t = (-48 + 84 * i / 16) * Math.PI / 180; wing.push([cx + 92 * Math.cos(t), cy + 92 * Math.sin(t)]); }
    }
    world.building({ id: "chaoshi", name: "蒲公英学子超市 · 学子书店", cat: "生活", poly: wing, h: 8.6, style: "canteen", label: true, labelY: 3 });
    // 南侧底层商铺 + 长廊架
    world.building({ id: "shangye", name: "底层商铺", cat: "生活", poly: [[220, 905], [458, 918], [456, 939], [218, 927]], h: 5.6, style: "shop", parapet: 0.6 });
    world.pergola(W(226, 897), W(452, 910), 3.6, 3.4);
    // 店招（朝南 / 朝东南）
    const signAt = (text, px, py, y, nx, nz, w, bg) => { const [x, z] = W(px, py); world.sign(text, x + nx * 0.2, y, z + nz * 0.2, Math.atan2(nx, nz), w * 1.35, 1.35, { bg: bg || "#a0262a", fg: "#ffffff" }); };
    const sN = [0.054, 0.9985];   // 南排商铺南立面法向（近似朝南）
    signAt("医务室", 250, 929, 4.3, sN[0], sN[1], 4.2, "#1f7a4c");
    signAt("辰鑫糕点", 315, 933, 4.3, sN[0], sN[1], 5, "#b5651d");
    signAt("晨曦洗衣", 375, 936, 4.3, sN[0], sN[1], 5, "#2c6aa0");
    signAt("蜜雪冰城", 432, 939, 4.3, sN[0], sN[1], 5, "#d7262e");
    { const t1 = 8 * Math.PI / 180, t2 = 28 * Math.PI / 180;
      signAt("蒲公英学子超市", 330 + 122.5 * Math.cos(t1), 845 + 122.5 * Math.sin(t1), 4.6, Math.cos(t1), Math.sin(t1), 7.5);
      signAt("学子书店", 330 + 122.5 * Math.cos(t2), 845 + 122.5 * Math.sin(t2), 4.6, Math.cos(t2), Math.sin(t2), 4.6, "#3b5a7a"); }

    // ---------- 球场：围网、篮球架、场线 ----------
    courtPolys.forEach((ct) => {
      world.decalRect(ct.x, ct.z, 28, 15, slabAng, 0.12, "white");
      world.decalLine(ct.P(0, -7.5), ct.P(0, 7.5), 0.12, "white");
      world.hoop(...ct.P(-14.6, 0), slabAng); world.hoop(...ct.P(14.6, 0), slabAng + Math.PI);
      world.fence([ct.P(-16, -9.5), ct.P(16, -9.5), ct.P(16, 9.5), ct.P(-16, 9.5), ct.P(-16, -9.5)], 3.2);
    });

    // ---------- 小品：路灯、长椅 ----------
    world.along(pw(ringN), 30, 7, 10).forEach((p) => world.lamp(p.x, p.z));
    world.along(pw(ringS), 30, -7, 10).forEach((p) => world.lamp(p.x, p.z));
    world.along(pw(midRoad), 30, -6, 10).forEach((p) => world.lamp(p.x, p.z));
    lanes.forEach((l) => world.along(pw(l), 26, -2.6, 8).forEach((p) => world.lamp(p.x, p.z, "garden")));
    ROT.forEach((r) => { const [x, z] = W(r.c[0], r.c[1]); world.bench(x - 6, z + 12.2, 0); world.bench(x + 6, z + 12.2, 0); });
    { const [x, z] = W(500, 900); world.bench(x, z, 0.9); world.bench(x + 4, z + 6, 0.9); }

    // ================= 植物 =================
    // 银杏：A4 西侧南段一丛、A3–A2 楼间南段一丛、A1 东侧几株
    [[492, 790], [497, 806], [503, 822], [508, 838], [514, 854], [488, 822], [496, 846]].forEach(([px, py]) => K.plantPx("ginkgo", px, py));
    [[716, 812], [730, 826], [744, 812], [722, 840], [752, 832], [737, 846]].forEach(([px, py]) => K.plantPx("ginkgo", px, py));
    [[980, 744], [988, 768], [996, 792]].forEach(([px, py]) => K.plantPx("ginkgo", px, py));
    // 食堂南面（环校路南侧）的银杏行
    K.street("ginkgo", pw([[214, 953], [512, 959]]), 9, 9.2, 1.0);
    // 球场一侧的树带（女贞 / 香樟），球场另一侧绿篱
    courtPolys.forEach((ct) => {
      K.row("privet", [ct.P(-15, -12.2), ct.P(15, -12.2)], 5, 0);
      K.hedgeRow([ct.P(-16, 10.8), ct.P(16, 10.8)], 0);
    });
    // 圆形场馆周边：灌木球、花丛
    ROT.forEach((r) => {
      const [x, z] = W(r.c[0], r.c[1]), R = ROT_R * 0.4 + 4.6;
      for (let i = 0; i < 6; i++) { const a = -0.4 + i * 0.55 + Math.PI; const px = x + Math.cos(a) * R, pz = z + Math.sin(a) * R; if (K.greenOK(px, pz, 0.8, 0.8)) K.plant(i % 2 ? "flowerbed" : "shrub_ball", px, pz); }
    });
    // 行道树：环校路两侧香樟、中央步道两侧香樟
    K.street("camphor", pw(ringN), 11, 8.6); K.street("camphor", pw(ringN), 11, -8.6);
    K.street("camphor", pw(ringS), 11, -8.6);
    K.street("camphor", pw(midRoad), 10, 7); K.street("camphor", pw(midRoad), 10, -7);
    // 楼间绿地：香樟、女贞、桂花、樱花散植；灌木球与花丛点缀
    const [ax0, az0] = W(200, 560), [ax1, az1] = W(1010, 980);
    // 只在板块范围内散植：中央步道以南是中心草坪，环校路以南是别的楼
    const fillIn = pw([[195, 600], [1015, 500], [1015, 822], [669, 900], [626, 944], [520, 944], [195, 940]]);
    K.fill({ keys: [["camphor", 4], ["privet", 3], ["osmanthus", 3], ["cherry", 1]], area: [ax0, az0, ax1, az1], inside: fillIn, n: 320, minDist: 6, clear: 1.8, bmargin: 3.2 });
    K.fill({ keys: [["osmanthus", 2], ["shrub_ball", 3], ["flowerbed", 1]], area: [ax0, az0, ax1, az1], inside: fillIn, n: 60, minDist: 4.5, clear: 1.0, bmargin: 2 });
    // 板楼西侧小径边绿篱
    SLABS.forEach((s) => K.hedgeRow(pw([addPx(addPx(s.poly[0], E, -12), D, 4), addPx(s.poly[3], E, -12)]), 0));
    world.bake();

    // ================= 小动物 =================
    const A = (key, px, py) => { const [x, z] = W(px, py); K.animal(key, x, z); };
    A("cat", 470, 905); A("cat", 620, 800); A("cat", 860, 790); A("cat", 290, 905); A("cat", 700, 900);
    A("magpie", 590, 760); A("magpie", 820, 700); A("magpie", 950, 720);
    A("sparrow", 480, 880); A("sparrow", 486, 884); A("sparrow", 236, 850); A("sparrow", 242, 846); A("sparrow", 640, 912);
    A("butterfly", 526, 930); A("butterfly", 652, 906); A("butterfly", 735, 828); A("butterfly", 500, 820);
  }

  // 世界坐标下的旋转矩形（中心、长 w 沿 ang、宽 d）
  function rectW(cx, cz, w, d, ang) {
    const c = Math.cos(ang), s = Math.sin(ang);
    return [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]].map(([u, v]) => [cx + u * c - v * s, cz + u * s + v * c]);
  }

  ZK.start({
    zoneId: "dorm_life", title: "A 区宿舍生活区", icon: "🏠",
    intro: "四栋红砖板楼自西向东错开排列，楼南端立着乒乓球馆、健美操馆和武术 / 跆拳道馆三座圆形场馆；西边的学生食堂是椭圆形就餐大厅，屋顶一排玻璃天窗，底层是超市、书店、洗衣店和奶茶店。楼间草坪散植香樟、女贞和桂花，还有两块红色球场。",
    highlights: ["桂花", "女贞", "银杏", "楼间绿地", "圆形场馆"],
    region: [180, 540, 1040, 1000], bounds: [195, 560, 1015, 985], res: 0.3,
    maxDistance: 560,
    catalog: ["ginkgo", "camphor", "cherry", "osmanthus", "privet", "shrub_ball", "hedge", "flowerbed", "cat", "magpie", "sparrow", "butterfly"],
    storageKey: "dorm-a-species-demo:dorm_life",
    build,
    views: {
      "官方视角": { icon: "🗺️", t: [610, 790, 0], d: 290, el: 31, az: -14 },
      "俯视": { icon: "⬇️", t: [605, 785, 0], d: 380, el: 89, az: 0 },
      "学生食堂": { icon: "🍜", t: [330, 845, 4], d: 105, el: 30, az: -14 },
      "圆形场馆": { icon: "🏓", t: [650, 870, 3], d: 125, el: 24, az: -20 },
      "楼间球场": { icon: "🏀", t: [790, 745, 2], d: 90, el: 30, az: -40 },
      "编辑俯瞰": { hidden: true, t: [600, 810, 0], d: 260, el: 60, az: -14 },
    },
    info: {
      shitang1: "学生食堂（一食堂）：椭圆形就餐大厅，平屋面中间一排 4 个玻璃金字塔天窗，北侧连着 3 层红砖楼，西侧是抬高的就餐平台；底层与东侧弧形商业翼有超市、书店、洗衣店和奶茶店。",
      chaoshi: "东侧弧形商业翼：底层是蒲公英学子超市和学子书店，北端是晨曦洗衣，门前是红砖铺装的前广场。",
      shangye: "食堂南侧的一排底层商铺与长廊架：蜜雪冰城、辰鑫糕点、晨曦洗衣收衣点、医务室。",
      pingpang: "乒乓球馆：A4 公寓南端的单层圆形场馆，玻璃外墙、灰色平屋面。",
      jianmeicao: "健美操馆：A3 公寓南端的单层圆形场馆，玻璃外墙、灰色平屋面。",
      wushu: "武术 / 跆拳道馆：A2 公寓南端的单层圆形场馆，玻璃外墙、灰色平屋面。",
      A1: "A1 学生公寓：约 6 层红砖板楼，平屋面带楼梯间，东侧草坪有几株银杏。",
      A2: "A2 学生公寓：约 6 层红砖板楼，南端是武术 / 跆拳道馆，东西两侧楼间各有一块红色球场。",
      A3: "A3 学生公寓：约 6 层红砖板楼，南端是健美操馆，东侧楼间南段一丛银杏。",
      A4: "A4 学生公寓：约 6 层红砖板楼，南端是乒乓球馆，西侧一丛银杏，西南紧邻学生食堂前广场。",
    },
    labels: (K) => COURTS.map(([px, py], i) => { const [x, z] = K.W(px, py); return { id: "court" + i, name: "楼间球场", pos: new V3(x, 5, z), dist: 90 }; }),
    tourSpeed: 10,
    tour: [
      { name: "环校路 · 生活区", cap: "四栋红砖板楼自西向东错开排列", t: [620, 760, 6], d: 170, el: 26, az: -14 },
      { name: "学生食堂", cap: "椭圆形就餐大厅，屋顶一排玻璃金字塔天窗", t: [312, 838, 6], d: 70, el: 26, az: -20 },
      { name: "就餐平台", cap: "食堂西侧抬高的平台，北侧是 3 层红砖楼", t: [240, 845, 3], d: 45, el: 16, az: -70 },
      { name: "商业翼", cap: "蒲公英学子超市、学子书店，门前红砖前广场", t: [440, 860, 4], d: 50, el: 14, az: 40 },
      { name: "南侧商铺", cap: "蜜雪冰城、辰鑫糕点和长廊架", t: [340, 925, 3], d: 42, el: 10, az: 5 },
      { name: "乒乓球馆", cap: "A4 公寓南端的单层圆形场馆", t: [525, 902, 3], d: 40, el: 16, az: -10 },
      { name: "健美操馆", cap: "玻璃外墙、灰色平屋面", t: [652, 878, 3], d: 40, el: 16, az: -20 },
      { name: "武术 / 跆拳道馆", cap: "旁边一丛银杏，秋天满树金黄", t: [760, 845, 3], d: 46, el: 16, az: -30 },
      { name: "楼间球场", cap: "A3、A2 之间的红色塑胶球场", t: [741, 762, 2], d: 55, el: 24, az: -60 },
      { name: "全景", cap: "A 区宿舍生活区：板楼、圆形场馆、食堂与楼间绿地", t: [620, 830, 0], d: 360, el: 30, az: -14 },
    ],
  }).catch((e) => { console.error(e); const p = document.querySelector(".zk-loader p"); if (p) p.textContent = "场景加载失败：" + e.message; });
})();
