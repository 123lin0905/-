/*
 * 板块细节场景 · 动植物增删适配层（ZoneSpecies，仿 lawn/lawn-species.js，接通用编辑器 js/species-editor.js）
 * ------------------------------------------------------------------
 * 图书馆、中心草坪（lawn2）等用 zone-engine.js 的板块共用；板块差异全部来自布局 window.ZONE_LAYOUT：
 *   LAY.catalog  本场景可用的物种 key（zones.json 里该板块的 detail_scene 指向本场景时，以 zones.json 的 catalog 为准）
 *   LAY.seeds    场景原有、可编辑的个体：{ key: [[平面图 x, y, 缩放?], …] }（seed_ref = key#序号）
 *   LAY.scene    本场景相对 campus3d/ 的路径（如 library/library.html），用于判断 zones.json 是否已指向本场景
 * 物种目录：乔木（香樟、银杏、桂花、樱花、紫薇、垂柳，zone-flora.js 的同一套生长算法）、草花花丛、灌木球、芦苇、睡莲；
 *          校园小猫、蝴蝶、喜鹊、麻雀、白鹭、锦鲤、蜻蜓（zone-fauna.js 的低多边形模型与行为）。
 * 放置规则：Z.classAt（地面分类：草坪 / 林下 / 花境 / 园路 / 沥青 / 广场…）、Z.waterAt / waterDist（水面）、
 *          Z.buildingAt（建筑占地）、Z.staticAt（背景树干、路灯、旗杆）；台地花田上只能种草花。
 * 保存：/api/zones/{zoneId}/species（GET 列表 / POST 新增 / PUT 移植 / DELETE 移除），坐标为本场景世界米（x 东、z 南，原点 = LAY.origin）。
 *       后端不可用时由编辑器切到 localStorage 演示模式。
 */
(function () {
  "use strict";
  const Z = window.ZONE;
  if (!Z || !window.SpeciesEditor || !window.ZoneFauna) return;
  const THREE = Z.THREE, V3 = THREE.Vector3, LAY = Z.LAY;
  const Q = new URLSearchParams(location.search);
  const API = Q.get("speciesApi") || "../../api/zones/";
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  function hashStr(s) { let h = 2166136261; s = String(s); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  let editor = null, fauna = null;
  const WL = () => (LAY.waterLevel != null ? LAY.waterLevel : 0);

  // ---------------- 个体外观 ----------------
  const CAT_COATS = [{ catBody: 0xf2a24a, catBelly: 0xfaf6ee }, { catBody: 0x3b3a3f, catBelly: 0xf7f4ee }, { catBody: 0xa7adb5, catBelly: 0xf4f1ea }, { catBody: 0xf6efe2, catBelly: 0xf9d3c8 }];
  const BF_WINGS = [0xffd84d, 0xfdfcf4, 0x6fb6f2, 0xf59a3c, 0xf4a6c6];
  const KOI_COATS = [{ koi: 0xf06a2a, koiWhite: 0xfaf3ea }, { koi: 0xfaf3ea, koiWhite: 0xe2462c }, { koi: 0xf2b23a, koiWhite: 0xfaf3ea }, { koi: 0xd8352a, koiWhite: 0x2c2a2a }];
  const tagOf = (ind) => (ind && ((ind.ref || "") + "|" + (ind.rec && ind.rec.id || ""))) || String(Math.random());
  function makeAnimal(key, ind) {
    const h = hashStr(tagOf(ind));
    const colors = key === "cat" ? CAT_COATS[h % CAT_COATS.length] : key === "butterfly" ? { bfWing: BF_WINGS[h % BF_WINGS.length] } : key === "koi" ? KOI_COATS[h % KOI_COATS.length] : null;
    return fauna.make(key, { colors });
  }

  // ---------------- 放置规则 ----------------
  const LAND_PLANT = { grass: 1, mulch: 1, bed: 1 };
  const WALK = { grass: 1, mulch: 1, bed: 1, path: 1, plaza: 1, pave: 1 };
  function grassAround(x, z, r, ok) {
    ok = ok || LAND_PLANT;
    for (const [dx, dz] of [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r], [r * 0.7, r * 0.7], [-r * 0.7, r * 0.7], [r * 0.7, -r * 0.7], [-r * 0.7, -r * 0.7]]) if (!ok[Z.classAt(x + dx, z + dz)]) return false;
    return true;
  }
  const onTerrace = (x, z) => Z.surfaceAt(x, z) - Z.heightAt(x, z) > 0.05;
  const okGround = (x, z) => !!WALK[Z.classAt(x, z)] && !Z.waterAt(x, z) && !Z.buildingAt(x, z, 0.3);
  const okWade = (x, z) => okGround(x, z) || (!!Z.waterAt(x, z) && Z.waterDist(x, z) > -1.2);
  const okDeep = (x, z) => !!Z.waterAt(x, z) && Z.waterDist(x, z) < -0.7;
  const hasWater = () => !!(LAY.water && LAY.water.length);
  const WHAT = { road: "车行道上", path: "园路上", plaza: "广场铺装上", pave: "铺装路缘上", hedge: "绿篱里", building: "建筑上", out: "板块范围外" };

  function canPlace(e, x, z) {
    const cls = Z.classAt(x, z);
    if (cls === "out") return { ok: false, reason: "超出本板块模型范围" };
    const r = e.radius || 0.4, wd = Z.waterDist(x, z), inWater = !!Z.waterAt(x, z);
    if (Z.buildingAt(x, z, e.type === "plant" ? r * 0.6 : 0.2)) return { ok: false, reason: "这里是建筑" };
    switch (e.key) {
      case "waterlily": return inWater && wd < -0.4 ? { ok: true } : { ok: false, reason: "睡莲只能种在池塘水面上" };
      case "koi": return inWater && wd < -1.0 ? { ok: true } : { ok: false, reason: inWater ? "离岸太近，锦鲤要放在稍深的水里" : "锦鲤只能放在池塘里" };
      case "reed": return wd > -1.4 && wd < 1.2 && !Z.staticAt(x, z, 0.3) ? { ok: true } : { ok: false, reason: "芦苇只能种在池边浅水或岸边" };
      case "dragonfly": return !hasWater() || wd < 5 ? { ok: true } : { ok: false, reason: "蜻蜓只在池塘附近活动" };
      case "butterfly": return { ok: true };
      case "egret": return okWade(x, z) || (inWater && wd > -1.6) ? { ok: true } : { ok: false, reason: "白鹭放在草地或池边浅水里" };
    }
    if (inWater) return { ok: false, reason: e.type === "plant" ? "不能种在水里" : "不能放在水里" };
    if (e.type === "plant") {
      if (!LAND_PLANT[cls]) return { ok: false, reason: "不能种在" + (WHAT[cls] || "这里") + "，只能种在草坪 / 林下 / 花境" };
      if (wd < 1.0) return { ok: false, reason: "离水边太近" };
      if (e.anim === "tree" && onTerrace(x, z)) return { ok: false, reason: "台地花田上只能种草花，不能种树" };
      if (!grassAround(x, z, Math.max(0.3, r * 0.55))) return { ok: false, reason: "离道路 / 铺装太近，往草坪里面挪一点" };
      if (Z.staticAt(x, z, r * 0.5)) return { ok: false, reason: "这里已有原有的树木 / 路灯，换个空地吧" };
      return { ok: true };
    }
    if (!WALK[cls]) return { ok: false, reason: "不能放在" + (WHAT[cls] || "这里") + "，请放在草坪或园路上" };
    return { ok: true };
  }
  function surfaceY(x, z, e) {
    if (e) {
      if (e.key === "waterlily") return WL() + 0.01;
      if (e.key === "koi") return WL() + 0.02;
      if (e.key === "reed") return Z.waterAt(x, z) ? WL() - 0.1 : Z.surfaceAt(x, z);
      if (e.hover) return (Z.waterAt(x, z) ? WL() : Z.surfaceAt(x, z)) + e.hover;
      if (e.type === "animal" && Z.waterAt(x, z)) return WL() - 0.15;
    }
    return Z.surfaceAt(x, z);
  }
  const _pk = new V3();
  function pick(rc) { const p = Z.pickGround(rc, _pk); return p ? { x: p.x, y: p.y, z: p.z } : null; }

  // ---------------- 物种目录 ----------------
  const RULE_LAND = "只能种在草坪 / 林下 / 花境上（不能在道路、铺装、水面和建筑上）";
  function tree(key, name, icon, radius, desc, extra) {
    return Object.assign({ key, name, type: "plant", icon, anim: "tree", radius, hitRadius: radius * 0.8, desc, rule: RULE_LAND, plantDur: 3.0, moveDur: 3.0, scaleRange: [0.85, 1.1],
      make: () => Z.flora.makeTree(key) }, extra || {});
  }
  function animal(key, name, icon, radius, hitY, desc, rule, beh, extra) {
    return Object.assign({ key, name, type: "animal", icon, radius, hitRadius: Math.max(radius, 0.4), hitY, previewH: 0.4, desc, rule,
      idle: (ind, dt) => fauna.idle[key](ind, dt, ctx), make: (ind) => makeAnimal(key, ind),
      center: (ind, v) => (ind.obj ? v.set(ind.obj.position.x, ind.obj.position.y + hitY, ind.obj.position.z) : v.set(ind.x, surfaceY(ind.x, ind.z) + hitY, ind.z)) }, beh, extra || {});
  }
  let CATALOG = [];
  function buildCatalog() {
    const SP = Z.flora.SP;
    const hy = (k) => (SP[k] ? SP[k].h * 0.45 : 2);
    const walker = fauna.walker(2.4, okGround);
    CATALOG = [
      tree("camphor", "香樟", "🌳", 3.0, "四季常绿的校园主景树，树冠浓密圆整，夏季遮阴", { hitY: hy("camphor") }),
      tree("ginkgo", "银杏", "🍂", 2.2, "落叶乔木，扇形叶；秋季满树金黄，冬季落叶", { hitY: hy("ginkgo") }),
      tree("osmanthus", "桂花", "🌼", 1.6, "常绿小乔木，秋季开金黄小花，满园飘香", { hitY: hy("osmanthus"), plantDur: 2.6 }),
      tree("cherry", "樱花", "🌸", 2.4, "落叶乔木，春季粉白花朵铺满树冠", { hitY: hy("cherry") }),
      tree("crapemyrtle", "紫薇", "🌺", 1.5, "多干小乔木，夏季满树粉紫色圆锥花序，花期长达百日", { hitY: hy("crapemyrtle"), plantDur: 2.6 }),
      tree("willow", "垂柳", "🌿", 3.0, "落叶乔木，枝条细长下垂，最宜种在池边", { hitY: hy("willow") }),
      { key: "flowerbed", name: "草花花丛", type: "plant", icon: "💐", anim: "shrub", radius: 0.8, hitRadius: 0.8, hitY: 0.25, plantDur: 2.2, desc: "花境里的一年生草花：矮牵牛、万寿菊、鼠尾草，四季轮换", rule: "草坪、花境、台地花田上都可以种",
        make: (ind) => Z.flora.makeFlowerClump(hashStr(tagOf(ind))) },
      { key: "shrub_ball", name: "灌木球", type: "plant", icon: "🟢", anim: "shrub", radius: 0.7, hitRadius: 0.7, hitY: 0.5, plantDur: 2.2, desc: "修剪成球形的小叶女贞 / 红叶石楠，点缀园路边", rule: RULE_LAND,
        make: () => Z.flora.makeShrubBall() },
      { key: "reed", name: "芦苇", type: "plant", icon: "🌾", anim: "shrub", radius: 0.5, hitRadius: 0.6, hitY: 0.7, plantDur: 2.0, desc: "池边浅水里的芦苇、再力花，夏绿秋黄，随风摇曳", rule: "只能种在池边浅水或岸边",
        make: () => Z.flora.makeReed() },
      { key: "waterlily", name: "睡莲", type: "plant", icon: "🪷", anim: "floating", radius: 0.5, hitRadius: 0.6, hitY: 0.05, plantDur: 2.0, desc: "浮叶植物，圆叶带缺口，夏季开白色睡莲花", rule: "只能种在池塘水面上",
        make: (ind) => Z.flora.makeLily(hashStr(tagOf(ind)) % 3 !== 0, hashStr(tagOf(ind)) % 97 + 1) },
      animal("cat", "校园小猫", "🐱", 0.3, 0.25, "橘猫、奶牛猫、狸花猫……晴天在草坪上追蝴蝶，看到蝴蝶会压低身子扑过去", "放在草坪或园路上", walker),
      animal("butterfly", "蝴蝶", "🦋", 0.18, 0.0, "菜粉蝶、黄钩蛱蝶、柑橘凤蝶，绕着花丛忽高忽低地飞", "在草坪、花境上空飞舞", fauna.flyer({ dur: 2.4, hover: 0.55, flap: 24, butterfly: true, arc: 1.5 }), { hover: 0.55 }),
      animal("magpie", "喜鹊", "🐦", 0.25, 0.25, "黑白相间的长尾巴喜鹊，在草地上一跳一跳地找虫子", "放在草坪或园路上", fauna.flyer({ dur: 2.2, flap: 16 })),
      animal("sparrow", "麻雀", "🐤", 0.15, 0.15, "成群的树麻雀，啄草籽、蹦蹦跳跳", "放在草坪或园路上", fauna.flyer({ dur: 1.8, flap: 28 })),
      animal("egret", "白鹭", "🕊️", 0.35, 0.6, "从翠湖飞来的白鹭，在池边浅水和草地上慢慢踱步觅食", "放在草地或池边浅水里", fauna.flyer({ dur: 2.8, flap: 9, arc: 1.8 })),
      animal("koi", "锦鲤", "🐟", 0.35, 0.0, "红白、黄金、大正三色锦鲤，在睡莲叶间缓缓巡游", "只能放在池塘里（离岸 1 米以上）", fauna.swimmer(), { water: true }),
      animal("dragonfly", "蜻蜓", "🪰", 0.15, 0.0, "红蜻蜓、碧伟蜓，在水面上空悬停，忽地换个位置", "在池塘上空或岸边飞", fauna.flyer({ dur: 2.0, hover: 0.7, flap: 60, arc: 1.0, overWater: true }), { hover: 0.7 }),
    ];
    return CATALOG;
  }
  const ctx = { okGround, okWade, okDeep, get editor() { return editor; }, active: (key) => (editor ? editor.inds.filter((i) => i.key === key && i.status === "active" && i.obj && !i.anim) : []) };

  // ---------------- 右侧“板块生态”清单 + 飞到物种 ----------------
  let zoneCatalog = [];
  function renderList(counts) {
    const body = document.getElementById("zs-eco-body"); if (!body) return;
    const groups = [["plant", "植物"], ["animal", "动物"]];
    body.innerHTML = groups.map(([t, title]) => {
      const items = zoneCatalog.filter((c) => c.type === t && !c.hidden);
      if (!items.length) return "";
      return "<h3>" + title + " <small>" + items.length + " 种</small></h3><ul>" + items.map((c) =>
        '<li><button type="button" class="zs-sp" data-k="' + esc(c.key) + '"><span class="zs-sp-icon">' + esc(c.icon) + '</span><span class="zs-sp-main"><b>' + esc(c.name) +
        '<i class="zs-n" data-n="' + esc(c.key) + '">×' + ((counts && counts[c.key]) || 0) + "</i></b><span>" + esc(c.desc) + "</span></span></button></li>").join("") + "</ul>";
    }).join("");
    body.querySelectorAll(".zs-sp").forEach((b) => (b.onclick = () => flyToSpecies(b.getAttribute("data-k"), b)));
  }
  function updateCounts(c) { document.querySelectorAll(".zs-n[data-n]").forEach((el) => { el.textContent = "×" + (c[el.getAttribute("data-n")] || 0); }); }
  const flyIdx = {};
  function flyToSpecies(key, btn) {
    document.querySelectorAll(".zs-sp.is-active").forEach((x) => x.classList.remove("is-active"));
    if (btn) btn.classList.add("is-active");
    const list = editor ? editor.inds.filter((i) => i.key === key && i.status === "active" && i.obj) : [];
    const e = editor && editor.byKey[key];
    if (!list.length) { Z.toast("场景里暂时没有「" + (e ? e.name : key) + "」" + (editor && editor.ED.allowed ? "，可以用“✏️ 管理动植物”添加" : "")); return null; }
    if (Z.tour && Z.tour.on) Z.stopTour();
    const i = (flyIdx[key] = ((flyIdx[key] == null ? -1 : flyIdx[key]) + 1) % list.length), ind = list[i];
    const p = ind.obj.position, h = ind.obj.userData.height || 1;
    const dist = e.type === "animal" ? (e.key === "koi" || e.key === "dragonfly" || e.key === "butterfly" ? 6 : 8) : Math.max(10, Math.min(36, h * (ind.scale || 1) * 2.2));
    Z.flyToPoint(p.x, p.z, dist, 1100, e.type === "plant" && e.anim === "tree" ? p.y + h * 0.25 : p.y);
    Z.toast(e.icon + " " + e.name + (list.length > 1 ? "（第 " + (i + 1) + " / " + list.length + " " + (e.type === "animal" ? "只" : "株") + "）" : ""));
    if (editor && editor.ED.on) editor.select(ind);
    return ind;
  }

  // ---------------- 创建编辑器 ----------------
  Z.ready.then(({ zone }) => {
    const B = Z.bounds; Z.cx = (B.x0 + B.x1) / 2; Z.cz = (B.z0 + B.z1) / 2;
    fauna = window.ZoneFauna.create(Z); Z.fauna = fauna;
    buildCatalog();
    // zones.json 的板块 catalog 只有在该板块已指向本场景时才生效（避免旧配置把本场景的物种过滤掉）
    const zoneOwns = zone && zone.detail_scene && LAY.scene && zone.detail_scene === LAY.scene && Array.isArray(zone.catalog);
    const allowed = zoneOwns ? zone.catalog : (LAY.catalog || CATALOG.map((c) => c.key));
    zoneCatalog = allowed.map((k) => CATALOG.find((c) => c.key === k)).filter(Boolean);
    for (const c of CATALOG) if (zoneCatalog.indexOf(c) < 0 && LAY.seeds && LAY.seeds[c.key]) zoneCatalog.push(Object.assign({}, c, { hidden: true }));
    // 原有个体
    const seeds = [];
    for (const key in LAY.seeds || {}) {
      const e = zoneCatalog.find((c) => c.key === key); if (!e) { console.info("[zone-species] 目录里没有原有个体的物种：", key); continue; }
      LAY.seeds[key].forEach((s, i) => {
        const [x, z] = Z.toW(s[0], s[1]), ref = key + "#" + i;
        const chk = canPlace(e, x, z); if (!chk.ok) console.info("[zone-species] 原有个体位置需调整：", ref, chk.reason);
        const ind0 = { ref };
        const obj = e.make(ind0);
        const rot = (hashStr(ref) % 628) / 100, sc = s[2] || (e.type === "plant" ? 0.92 + (hashStr(ref + "s") % 16) / 100 : 1);
        obj.position.set(x, surfaceY(x, z, e), z); obj.rotation.y = rot; obj.scale.setScalar(sc);
        Z.scene.add(obj);
        seeds.push({ ref, key, obj, x, z, rot, scale: sc });
      });
    }
    renderList(null);
    editor = window.SpeciesEditor.create({
      zoneId: Z.zoneId, zoneName: zone ? zone.name : LAY.name, apiBase: API, storageKey: "zone-species-demo:" + Z.zoneId,
      THREE, scene: Z.scene, camera: Z.camera, dom: Z.renderer.domElement, catalog: zoneCatalog, seeds, canPlace, pick, surfaceY,
      hooks: { onToggle: (on) => { document.body.classList.toggle("se-editing", on); if (on && LAY.views && LAY.views.edit) Z.goView("edit", 900); } },
      onCounts: (c) => updateCounts(c),
    });
    Z.editor = editor;
    if (!zone || zone.editable !== false) editor.buildUI(document.getElementById("zs-se-host"));
    window.__se = editor;
    updateCounts(editor.counts());
    editor.load().then((n) => { window.__seLoaded = true; window.__seRows = n; updateCounts(editor.counts()); })
      .catch((err) => { console.warn(err); window.__seLoaded = true; });
    // 动画时钟：跟随场景主循环；自动化测试可设 window.__seManual = true 后用 __se.update(dt) 手动推进
    Z.onFrame((dt) => { if (!window.__seManual) editor.update(dt); });
  });
  window.ZoneSpecies = { get CATALOG() { return CATALOG; }, canPlace, surfaceY, flyToSpecies, get editor() { return editor; } };
})();
