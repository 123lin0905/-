/*
 * 中心草坪 · 动植物增删适配层（仿 pond/pond-species.js，接通用编辑器 js/species-editor.js）
 * ------------------------------------------------------------------
 * 物种目录：银杏（秋季金黄）、桂花（秋季开花）、樱花（春季粉）、香樟、草花花丛 / 花境、灌木球；
 *          校园小猫（扑蝶）、蝴蝶、喜鹊、麻雀、白鹭。全部为低多边形扁平风，由 lawn-scene.js 的实例化图元绘制。
 * 放置规则：只能种 / 放在草地上（底图 lawn-ground.png 的草地类别），不能在道路、白色铺地、广场、水面和建筑上，
 *          不能压住周边的装饰树；植物之间由编辑器保持间距。
 * 原有个体：按官网平面图在草坪上散植（seed_ref 如 ginkgo#0），可选中、移植、移除，状态保存到 /api/zones/central_lawn/species。
 * 动画：植物沿用编辑器的开坑土粒 → 幼苗 → 成株、带土球弧线移植、连根拔起（扁平风土粒 fx.flat）；
 *      动物：小猫走进来 / 走开、追蝴蝶扑击；蝴蝶盘旋飞入 / 飞走；喜鹊、麻雀、白鹭飞来落地 / 起飞离开，平时觅食跳动。
 */
(function () {
  "use strict";
  const L = window.LAWN;
  if (!L || !window.SpeciesEditor) return;
  const THREE = L.THREE, V3 = THREE.Vector3;
  const Q = new URLSearchParams(location.search);
  const ZONE = "central_lawn";
  const API = Q.get("speciesApi") || "../../api/zones/";
  const rnd = (a, b) => a + (b - a) * Math.random();
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  let editor = null;

  function hashStr(s) { let h = 2166136261; s = String(s); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  const CAT_COATS = [{ catBody: 0xf2a24a, catBelly: 0xfaf6ee }, { catBody: 0x3b3a3f, catBelly: 0xf7f4ee }, { catBody: 0xa7adb5, catBelly: 0xf4f1ea }, { catBody: 0xf6efe2, catBelly: 0xf9d3c8 }];
  const BF_WINGS = [0xffd84d, 0xfdfcf4, 0x6fb6f2, 0xf59a3c, 0xf4a6c6];
  function makeProxy(key, ind) {
    const tag = ind && (ind.ref || "") + "|" + (ind.rec && ind.rec.id || "");
    const colors = key === "cat" ? CAT_COATS[hashStr(tag) % CAT_COATS.length] : key === "butterfly" ? { bfWing: BF_WINGS[hashStr(tag) % BF_WINGS.length] } : null;
    return L.createProxy(key, { colors });
  }

  // ---------------- 动物行为 ----------------
  const face = (o, dx, dz) => { if (Math.abs(dx) + Math.abs(dz) > 1e-4) o.rotation.y = Math.atan2(-dz, dx); };
  const turnTo = (o, dx, dz, k) => {
    if (Math.abs(dx) + Math.abs(dz) < 1e-4) return;
    let a = Math.atan2(-dz, dx) - o.rotation.y; a = Math.atan2(Math.sin(a), Math.cos(a)); o.rotation.y += a * Math.min(1, k);
  };
  const okGround = (x, z) => L.classAt(x, z) === "grass" && !L.buildingAt(x, z, 0.3);
  function wanderTarget(ind, rad) {
    for (let k = 0; k < 10; k++) { const a = Math.random() * 6.28, r = rnd(0.6, rad), x = ind.x + Math.cos(a) * r, z = ind.z + Math.sin(a) * r; if (okGround(x, z)) return [x, z]; }
    return [ind.x, ind.z];
  }
  function activeOf(key) { return editor ? editor.inds.filter((i) => i.key === key && i.status === "active" && i.obj && !i.anim) : []; }

  // 小猫：坐着摇尾巴 → 闲逛 → 看到附近的蝴蝶就压低身子靠近 → 扑起来 → 蝴蝶受惊飞高
  function catIdle(ind, dt) {
    const o = ind.obj, P = o.userData.pose;
    const a = ind.ai || (ind.ai = { st: "sit", t: rnd(0.5, 2), ph: Math.random() * 6 });
    a.ph += dt;
    const p = o.position;
    if (a.st === "sit") {
      P.leg = 0; P.tail = 0.25 + Math.sin(a.ph * 2.2) * 0.35; P.body = 0.18; P.bodyY = -0.02; P.head = Math.sin(a.ph * 0.7) * 0.15; p.y = 0;
      a.t -= dt;
      if (a.t <= 0) {
        let best = null, bd = 3.4;
        for (const b of activeOf("butterfly")) { const d = Math.hypot(b.obj.position.x - p.x, b.obj.position.z - p.z); if (d < bd && Math.hypot(b.obj.position.x - ind.x, b.obj.position.z - ind.z) < 4.5) { bd = d; best = b; } }
        if (best && Math.random() < 0.75) { a.st = "stalk"; a.target = best; a.t = 6; }
        else { const t = wanderTarget(ind, 2.6); a.st = "walk"; a.tx = t[0]; a.tz = t[1]; a.t = 8; }
      }
    } else if (a.st === "walk" || a.st === "stalk") {
      let tx = a.tx, tz = a.tz, sp = 0.75;
      if (a.st === "stalk") {
        if (!a.target || a.target.status !== "active" || !a.target.obj) { a.st = "sit"; a.t = 1; return; }
        tx = a.target.obj.position.x; tz = a.target.obj.position.z; sp = 0.5;
      }
      const dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz);
      turnTo(o, dx, dz, dt * 6);
      const step = Math.min(d, sp * dt), nx = p.x + Math.cos(o.rotation.y) * step, nz = p.z - Math.sin(o.rotation.y) * step;
      if (okGround(nx, nz)) { p.x = nx; p.z = nz; } else { a.st = "sit"; a.t = rnd(1, 2); }
      P.leg = Math.sin(a.ph * (a.st === "stalk" ? 9 : 12)) * 0.5; P.tail = a.st === "stalk" ? -0.2 : 0.35 + Math.sin(a.ph * 3) * 0.15;
      P.body = 0; P.bodyY = a.st === "stalk" ? -0.04 : 0; P.head = a.st === "stalk" ? -0.1 : 0;
      a.t -= dt;
      if (a.st === "stalk" && d < 1.0) {
        a.st = "pounce"; a.k = 0; a.p0 = [p.x, p.z]; const r = Math.min(d + 0.2, 1.1); a.p1 = [p.x + (dx / d) * r, p.z + (dz / d) * r];
        if (a.target.ai) a.target.ai.flee = 1.6;
      } else if (d < 0.05 || a.t <= 0) { a.st = "sit"; a.t = rnd(2, 5); }
    } else if (a.st === "pounce") {
      a.k = Math.min(1, a.k + dt / 0.55);
      const k = a.k, x = a.p0[0] + (a.p1[0] - a.p0[0]) * k, z = a.p0[1] + (a.p1[1] - a.p0[1]) * k;
      if (okGround(x, z)) { p.x = x; p.z = z; }
      p.y = Math.sin(Math.PI * k) * 0.42;
      P.body = 0.45 * Math.cos(Math.PI * k); P.leg = (k < 0.5 ? 0.8 : -0.6); P.tail = 0.8;
      if (a.k >= 1) { p.y = 0; a.st = "sit"; a.t = rnd(2.5, 4.5); if (editor) editor.helpers.burstSoil(p.x, 0, p.z, 6, 0.35); }
    }
  }
  // 蝴蝶：围绕栖息点忽高忽低地盘旋，被猫扑时飞高
  function butterflyIdle(ind, dt) {
    const o = ind.obj, P = o.userData.pose;
    const a = ind.ai || (ind.ai = { ph: Math.random() * 20, s: Math.random() * 6, flee: 0, lift: 0 });
    a.ph += dt; a.flee = Math.max(0, a.flee - dt);
    a.lift += ((a.flee > 0 ? 1.5 : 0) - a.lift) * Math.min(1, dt * 2.5);
    const t = a.ph * 0.9;
    const x = ind.x + Math.sin(t * 0.55 + a.s) * 1.5 + Math.sin(t * 1.7) * 0.25;
    const z = ind.z + Math.cos(t * 0.43 + a.s * 1.3) * 1.2 + Math.cos(t * 2.1) * 0.2;
    const y = 0.5 + 0.22 * Math.sin(t * 1.9 + a.s) + a.lift;
    turnTo(o, x - o.position.x, z - o.position.z, dt * 8);
    o.position.set(x, y, z);
    P.wing = 0.25 + Math.sin(a.ph * 24) * 0.95;
  }
  // 喜鹊 / 麻雀：低头啄食、小跳几步，偶尔起飞换个地方
  function birdIdle(ind, dt) {
    const o = ind.obj, P = o.userData.pose, small = ind.key === "sparrow";
    const a = ind.ai || (ind.ai = { st: "peck", t: rnd(0.5, 2), ph: Math.random() * 6 });
    a.ph += dt; const p = o.position;
    if (a.st === "peck") {
      P.wing = 0; P.head = Math.max(0, Math.sin(a.ph * (small ? 9 : 6))) * -0.55; P.headY = P.head * 0.04; P.tail = Math.sin(a.ph * 4) * 0.1; p.y = 0;
      a.t -= dt;
      if (a.t <= 0) {
        if (Math.random() < 0.18) { const tg = wanderTarget(ind, 3); a.st = "fly"; a.k = 0; a.p0 = [p.x, p.z]; a.p1 = tg; a.dur = 1.6; face(o, tg[0] - p.x, tg[1] - p.z); }
        else { const tg = wanderTarget(ind, small ? 1.2 : 1.8); a.st = "hop"; a.p0 = [p.x, p.z]; a.p1 = tg; a.k = 0; a.n = 0; face(o, tg[0] - p.x, tg[1] - p.z); }
      }
    } else if (a.st === "hop") {
      const D = Math.hypot(a.p1[0] - a.p0[0], a.p1[1] - a.p0[1]), hops = Math.max(1, Math.ceil(D / (small ? 0.18 : 0.3)));
      a.k = Math.min(1, a.k + dt / (hops * 0.22));
      const k = a.k, f = (k * hops) % 1;
      p.x = a.p0[0] + (a.p1[0] - a.p0[0]) * k; p.z = a.p0[1] + (a.p1[1] - a.p0[1]) * k; p.y = Math.sin(Math.PI * f) * (small ? 0.06 : 0.09);
      P.head = 0; P.wing = Math.sin(Math.PI * f) * 0.4; P.tail = 0.15;
      if (a.k >= 1) { p.y = 0; a.st = "peck"; a.t = rnd(1.2, 3.5); }
    } else if (a.st === "fly") {
      a.k = Math.min(1, a.k + dt / a.dur); const k = a.k, e = k * k * (3 - 2 * k);
      p.x = a.p0[0] + (a.p1[0] - a.p0[0]) * e; p.z = a.p0[1] + (a.p1[1] - a.p0[1]) * e; p.y = Math.sin(Math.PI * k) * 1.1;
      P.wing = Math.sin(a.ph * (small ? 30 : 18)) * 0.9; P.head = 0;
      if (a.k >= 1) { p.y = 0; a.st = "peck"; a.t = rnd(1, 3); }
    }
  }
  // 白鹭：慢慢踱步，伸颈探头
  function egretIdle(ind, dt) {
    const o = ind.obj, P = o.userData.pose;
    const a = ind.ai || (ind.ai = { st: "stand", t: rnd(1, 3), ph: Math.random() * 6 });
    a.ph += dt; const p = o.position;
    if (a.st === "stand") {
      P.leg = 0; P.wing = 0; P.neck = Math.sin(a.ph * 0.8) * 0.1; P.head = 0; p.y = 0;
      a.t -= dt;
      if (a.t <= 0) { const tg = wanderTarget(ind, 2.2); a.st = "walk"; a.tx = tg[0]; a.tz = tg[1]; a.t = 10; }
    } else {
      const dx = a.tx - p.x, dz = a.tz - p.z, d = Math.hypot(dx, dz);
      turnTo(o, dx, dz, dt * 3);
      const step = Math.min(d, 0.32 * dt);
      p.x += Math.cos(o.rotation.y) * step; p.z -= Math.sin(o.rotation.y) * step;
      P.leg = Math.sin(a.ph * 4) * 0.35; P.neck = 0.18 * Math.sin(a.ph * 4); P.head = 0;
      a.t -= dt;
      if (d < 0.05 || a.t <= 0) { a.st = "stand"; a.t = rnd(2, 5); }
    }
  }

  // ---------------- 动物入场 / 离场 / 移植动画 ----------------
  function walkPath(ind, x0, z0, x1, z1, dur, api, opt) {
    const o = ind.obj, P = o.userData.pose, S = ind.scale || 1;
    opt = opt || {};
    face(o, x1 - x0, z1 - z0); o.position.set(x0, 0, z0);
    let puff = false;
    return api.helpers.play({ dur, update: (t) => {
      const k = api.helpers.ease(t);
      o.position.set(x0 + (x1 - x0) * k, 0, z0 + (z1 - z0) * k);
      P.leg = Math.sin(t * dur * 13) * 0.55; P.tail = 0.35; P.body = 0; P.bodyY = 0;
      const sc = opt.fadeIn ? Math.min(1, t * 5) : opt.fadeOut ? 1 - api.helpers.ease(clamp((t - 0.7) / 0.3, 0, 1)) : 1;
      o.scale.setScalar(Math.max(0.0001, S * sc));
      if (!puff && t > 0.08) { puff = true; api.helpers.burstSoil(x0, 0, z0, 8, 0.45); }
    }, end: () => { o.position.set(x1, 0, z1); o.scale.setScalar(opt.fadeOut ? 0.0001 : S); P.leg = 0; ind.ai = null; if (!opt.fadeOut) api.helpers.burstSoil(x1, 0, z1, 6, 0.35); opt.done && opt.done(); } });
  }
  function flyPath(ind, p0, p1, dur, api, opt) {
    const o = ind.obj, P = o.userData.pose, S = ind.scale || 1;
    opt = opt || {};
    const mid = p0.clone().lerp(p1, 0.5); mid.y = Math.max(p0.y, p1.y) + (opt.arc || 1.2);
    const cur = new THREE.QuadraticBezierCurve3(p0, mid, p1), fl = opt.flap || 18;
    o.position.copy(p0);
    return api.helpers.play({ dur, update: (t) => {
      const k = api.helpers.ease(t), p = cur.getPoint(k), tg = cur.getTangent(Math.min(0.999, k + 0.001));
      o.position.copy(p); face(o, tg.x, tg.z);
      const glide = opt.landing && t > 0.85;
      P.wing = glide ? -0.2 : Math.sin(t * dur * fl) * 0.9 + (opt.butterfly ? 0.25 : 0);
      P.leg = 0; P.head = 0;
      const sc = opt.fadeIn ? Math.min(1, t * 4) : opt.fadeOut ? 1 - api.helpers.ease(clamp((t - 0.6) / 0.4, 0, 1)) : 1;
      o.scale.setScalar(Math.max(0.0001, S * sc));
    }, end: () => {
      o.position.copy(p1); o.scale.setScalar(opt.fadeOut ? 0.0001 : S); P.wing = 0; ind.ai = null;
      if (opt.landing) api.helpers.burstSoil(p1.x, 0, p1.z, 6, 0.3);
      opt.done && opt.done();
    } });
  }
  const outward = (x, z) => { const c = L.toW(860, 1075), a = Math.atan2(z - c[1], x - c[0]) + rnd(-0.5, 0.5); return [Math.cos(a), Math.sin(a)]; };
  function walker(dur) {
    return {
      enter(ind, done, api) { const [ux, uz] = outward(ind.x, ind.z); let x0 = ind.x + ux * 3.2, z0 = ind.z + uz * 3.2; if (!okGround(x0, z0)) { x0 = ind.x - ux * 3.2; z0 = ind.z - uz * 3.2; } return walkPath(ind, x0, z0, ind.x, ind.z, dur, api, { fadeIn: true, done }); },
      exit(ind, done, api) { const o = ind.obj, [ux, uz] = outward(o.position.x, o.position.z); return walkPath(ind, o.position.x, o.position.z, o.position.x + ux * 3.2, o.position.z + uz * 3.2, dur, api, { fadeOut: true, done }); },
      transplant(ind, x1, z1, done, api) { const o = ind.obj, d = Math.hypot(x1 - o.position.x, z1 - o.position.z); return walkPath(ind, o.position.x, o.position.z, x1, z1, clamp(d / 1.6, 0.8, 5), api, { done }); },
    };
  }
  function flyer(opt) {
    const hover = opt.hover || 0;
    return {
      enter(ind, done, api) { const p1 = new V3(ind.x, hover, ind.z), p0 = p1.clone().add(new V3(rnd(-5, 5), 4.5, rnd(-5, 5))); return flyPath(ind, p0, p1, opt.dur, api, Object.assign({}, opt, { fadeIn: true, landing: !hover, done })); },
      exit(ind, done, api) { const p0 = ind.obj.position.clone(), p1 = p0.clone().add(new V3(rnd(-5, 5), 4.5, rnd(-5, 5))); return flyPath(ind, p0, p1, opt.dur, api, Object.assign({}, opt, { fadeOut: true, done })); },
      transplant(ind, x1, z1, done, api) { const p0 = ind.obj.position.clone(), p1 = new V3(x1, hover, z1); return flyPath(ind, p0, p1, clamp(p0.distanceTo(p1) / 3, 1.2, 3.5), api, Object.assign({}, opt, { landing: !hover, done })); },
    };
  }

  // ---------------- 物种目录 ----------------
  const plant = (key, name, icon, radius, hitY, desc, extra) => Object.assign({ key, name, type: "plant", icon, anim: radius > 0.6 ? "tree" : "shrub", radius, hitY, desc, rule: "只能种在草坪 / 花境上（不能在道路、铺地和建筑上）", make: (ind) => makeProxy(key, ind) }, extra || {});
  const animal = (key, name, icon, radius, hitY, desc, rule, beh, idle, extra) => Object.assign({ key, name, type: "animal", icon, radius, hitRadius: Math.max(radius, 0.35), hitY, previewH: 0.4, desc, rule, idle, make: (ind) => makeProxy(key, ind),
    center: (ind, v) => (ind.obj ? v.set(ind.obj.position.x, ind.obj.position.y + hitY, ind.obj.position.z) : v.set(ind.x, hitY, ind.z)) }, beh, extra || {});
  const CATALOG = [
    plant("ginkgo", "银杏", "🌳", 1.0, 1.8, "落叶乔木，扇形叶；秋季满树金黄，树下铺一层落叶", { plantDur: 3.0, moveDur: 3.0, scaleRange: [0.9, 1.1], hitRadius: 1.0 }),
    plant("osmanthus", "桂花", "🌼", 0.75, 1.1, "常绿小乔木，秋季开金黄小花，满园飘香", { plantDur: 2.6, scaleRange: [0.9, 1.1] }),
    plant("cherry", "樱花", "🌸", 0.95, 1.5, "落叶乔木，春季粉白花朵铺满树冠，花瓣落满草地", { plantDur: 2.8, moveDur: 2.8, scaleRange: [0.9, 1.1] }),
    plant("camphor", "香樟", "🌲", 1.25, 1.8, "四季常绿的校园行道树，树冠浓密圆整", { plantDur: 3.0, moveDur: 3.0, scaleRange: [0.9, 1.05], hitRadius: 1.2 }),
    plant("flowerbed", "草花花丛", "💐", 0.55, 0.2, "花境里的一年生草花：矮牵牛、万寿菊、鼠尾草，四季轮换", { anim: "shrub", plantDur: 2.2, hitRadius: 0.55 }),
    plant("shrub_ball", "灌木球", "🟢", 0.45, 0.4, "修剪成球形的小叶女贞 / 红叶石楠，点缀步道边", { anim: "shrub", plantDur: 2.2 }),
    animal("cat", "校园小猫", "🐱", 0.3, 0.25, "橘猫、奶牛猫、狸花猫……晴天在草坪上追蝴蝶，看到蝴蝶会压低身子扑过去", "放在草坪上", walker(2.4), catIdle),
    animal("butterfly", "蝴蝶", "🦋", 0.18, 0.0, "菜粉蝶、黄钩蛱蝶、柑橘凤蝶，绕着花丛忽高忽低地飞", "在草坪上空飞舞", flyer({ dur: 2.4, hover: 0.55, flap: 24, butterfly: true, arc: 1.5 }), butterflyIdle),
    animal("magpie", "喜鹊", "🐦", 0.25, 0.25, "黑白相间的长尾巴喜鹊，在草地上一跳一跳地找虫子", "放在草坪上", flyer({ dur: 2.2, flap: 16 }), birdIdle),
    animal("sparrow", "麻雀", "🐤", 0.15, 0.15, "成群的树麻雀，啄草籽、蹦蹦跳跳", "放在草坪上", flyer({ dur: 1.8, flap: 28 }), birdIdle),
    animal("egret", "白鹭", "🕊️", 0.35, 0.6, "偶尔从翠湖飞来草坪觅食的白鹭，慢慢踱步", "放在草坪上", flyer({ dur: 2.8, flap: 9, arc: 1.8 }), egretIdle),
  ];

  // ---------------- 原有个体：按平面图草坪范围散植（平面图像素坐标） ----------------
  const SEED_PX = {
    ginkgo: [[722, 938], [800, 921], [880, 903], [958, 887]],
    osmanthus: [[688, 1000], [692, 1085], [1088, 1015]],
    cherry: [[1012, 958], [1068, 1062], [800, 1112]],
    camphor: [[930, 1335], [702, 948]],
    flowerbed: [[835, 1028], [868, 1042], [902, 1028], [1078, 1112]],
    shrub_ball: [[690, 1040], [700, 1125], [684, 962], [1075, 958], [1118, 1060]],
    cat: [[862, 1078], [960, 1150]],
    butterfly: [[868, 1052], [902, 1000], [985, 1105], [790, 1048]],
    magpie: [[965, 1000], [760, 1010]],
    sparrow: [[822, 982], [834, 992], [1022, 1150]],
    egret: [[935, 1190]],
  };

  function canPlace(e, x, z) {
    const W2 = L.W / 2 - 1, D2 = L.D / 2 - 1;
    if (Math.abs(x) > W2 || Math.abs(z) > D2) return { ok: false, reason: "超出中心草坪模型范围" };
    const cls = L.classAt(x, z);
    const what = { road: "道路上", white: "铺装地面上", plaza: "广场上", water: "水里", out: "范围外" }[cls];
    const r = e.radius || 0.4;
    if (L.buildingAt(x, z, e.type === "plant" ? r * 0.6 : 0.2)) return { ok: false, reason: "这里是建筑" };
    if (what) return { ok: false, reason: e.type === "plant" ? "不能种在" + what + "，只能种在草坪 / 花境" : "不能放在" + what + "，请放在草坪上" };
    if (e.type === "plant") {
      if (!L.grassAround(x, z, Math.max(0.3, r * 0.55))) return { ok: false, reason: "离道路 / 铺地太近，往草坪里面挪一点" };
      if (L.staticAt(x, z, r * 0.6)) return { ok: false, reason: "这里已有原有的树木 / 灌木，换个空地吧" };
    } else if (e.key !== "butterfly" && !L.grassAround(x, z, 0.25)) return { ok: false, reason: "离道路太近，请放在草坪上" };
    return { ok: true };
  }
  const plane = new THREE.Plane(new V3(0, 1, 0), 0), hit = new V3();
  function pick(rc) {
    if (!rc.ray.intersectPlane(plane, hit)) return null;
    if (Math.abs(hit.x) > L.W / 2 || Math.abs(hit.z) > L.D / 2) return null;
    return { x: hit.x, y: 0, z: hit.z };
  }
  const surfaceY = () => 0;

  // ---------------- 右侧“中心草坪生态”清单 ----------------
  let zoneCatalog = CATALOG;
  function renderList(counts) {
    const body = document.getElementById("lz-eco-body"); if (!body) return;
    const groups = [["plant", "植物"], ["animal", "动物"]];
    body.innerHTML = groups.map(([t, title]) => {
      const items = zoneCatalog.filter((c) => c.type === t && !c.hidden);
      return "<h3>" + title + " <small>" + items.length + " 种</small></h3><ul>" + items.map((c) =>
        '<li><button type="button" class="lz-sp" data-k="' + esc(c.key) + '"><span class="lz-sp-icon">' + esc(c.icon) + '</span><span class="lz-sp-main"><b>' + esc(c.name) +
        '<i class="lz-n" data-n="' + esc(c.key) + '">×' + ((counts && counts[c.key]) || 0) + "</i></b><span>" + esc(c.desc) + "</span></span></button></li>").join("") + "</ul>";
    }).join("");
    body.querySelectorAll(".lz-sp").forEach((b) => (b.onclick = () => flyToSpecies(b.getAttribute("data-k"), b)));
  }
  function updateCounts(c) {
    document.querySelectorAll(".lz-n[data-n]").forEach((el) => { el.textContent = "×" + (c[el.getAttribute("data-n")] || 0); });
  }
  const flyIdx = {};
  function flyToSpecies(key, btn) {
    document.querySelectorAll(".lz-sp.is-active").forEach((x) => x.classList.remove("is-active"));
    if (btn) btn.classList.add("is-active");
    const list = editor ? editor.inds.filter((i) => i.key === key && i.status === "active" && i.obj) : [];
    const e = editor && editor.byKey[key];
    if (!list.length) { L.toast("场景里暂时没有「" + (e ? e.name : key) + "」，可以用“✏️ 管理动植物”添加"); return; }
    const i = (flyIdx[key] = ((flyIdx[key] == null ? -1 : flyIdx[key]) + 1) % list.length), ind = list[i];
    const p = ind.obj.position;
    L.flyToPoint(p.x, p.z, e.type === "animal" ? 9 : 15, 1100);
    L.toast(e.icon + " " + e.name + (list.length > 1 ? "（第 " + (i + 1) + " / " + list.length + " " + (e.type === "animal" ? "只" : "株") + "）" : ""));
    if (editor && editor.ED.on) editor.select(ind);
  }

  // ---------------- 创建编辑器 ----------------
  L.ready.then(({ zone }) => {
    const allowed = zone && Array.isArray(zone.catalog) ? zone.catalog : null;
    zoneCatalog = allowed ? CATALOG.filter((c) => allowed.indexOf(c.key) >= 0) : CATALOG;
    for (const c of CATALOG) if (zoneCatalog.indexOf(c) < 0 && SEED_PX[c.key]) zoneCatalog.push(Object.assign({}, c, { hidden: true }));
    const seeds = [];
    for (const key in SEED_PX) {
      const e = zoneCatalog.find((c) => c.key === key); if (!e) continue;
      SEED_PX[key].forEach(([px, py], i) => {
        const [x, z] = L.toW(px, py), ref = key + "#" + i;
        const chk = canPlace(e, x, z); if (!chk.ok) console.info("[lawn] 原有个体位置需调整：", ref, chk.reason);
        const obj = makeProxy(key, { ref });
        const rot = (hashStr(ref) % 628) / 100, sc = e.type === "plant" ? 0.92 + (hashStr(ref + "s") % 16) / 100 : 1;
        obj.position.set(x, e.key === "butterfly" ? 0.55 : 0, z); obj.rotation.y = rot; obj.scale.setScalar(sc);
        L.scene.add(obj);
        seeds.push({ ref, key, obj, x, z, rot, scale: sc });
      });
    }
    renderList(null);
    editor = window.SpeciesEditor.create({
      zoneId: ZONE, zoneName: zone ? zone.name : "中心草坪", apiBase: API, storageKey: "lawn-species-demo:" + ZONE,
      THREE, scene: L.scene, camera: L.camera, dom: L.renderer.domElement, catalog: zoneCatalog, seeds, canPlace, pick, surfaceY,
      fx: { flat: true, soilColor: 0xa47b52, soilSize: 3.2, holeColor: 0x7a5636, ballColor: 0x936a45, rootColor: 0xe8d6ad },
      hooks: {
        onToggle: (on) => { document.body.classList.toggle("se-editing", on); if (on) L.goView("edit", 900); },
      },
      onCounts: (c) => updateCounts(c),
    });
    if (!zone || zone.editable !== false) editor.buildUI(document.getElementById("lz-se-host"));
    window.__se = editor;
    updateCounts(editor.counts());
    editor.load().then((n) => { window.__seLoaded = true; window.__seRows = n; updateCounts(editor.counts()); })
      .catch((e) => { console.warn(e); window.__seLoaded = true; });
    // 动画时钟：跟随场景主循环；自动化测试可设 window.__seManual = true 后用 __se.update(dt) 手动推进
    L.onFrame((dt) => { if (!window.__seManual) editor.update(dt); });
  });
  window.LawnSpecies = { CATALOG, SEED_PX, canPlace, flyToSpecies, get editor() { return editor; } };
})();
