/*
 * 板块细节场景 · 动物模型与行为（ZoneFauna）—— 图书馆 / 中心草坪等板块共用
 * ------------------------------------------------------------------
 * 模型沿用中心草坪（lawn/lawn-scene.js）的低多边形部件定义：校园小猫、蝴蝶、喜鹊、麻雀、白鹭，另加锦鲤、蜻蜓；
 * 真实尺度（1 单位 = 1 米），每个动物是一个 Group，部件按 tag（wing / tail / legF / legB / head / neck / body）
 * 由 userData.pose 驱动（每帧 applyPose），材质走 zone-look.js 的 patch()（雾、昼夜、湿润与池塘一致）。
 * 行为（idle）由 zone-species.js 的物种目录调用：
 *   小猫：坐着摇尾巴 → 闲逛 → 看见附近蝴蝶就压低身子靠近、扑起；蝴蝶：绕栖息点忽高忽低盘旋，被扑时飞高；
 *   喜鹊 / 麻雀：低头啄食、小跳、偶尔短飞；白鹭：慢慢踱步、伸颈；锦鲤：在池里缓缓巡游、摆尾；蜻蜓：在水面上空悬停、突然换位。
 * 所有高度都贴合地形：Z.surfaceAt(x, z)（台地、土丘、坡地）；水生动物贴合水面 Z.LAY.waterLevel。
 */
(function (global) {
  "use strict";
  const THREE = global.THREE;
  const rnd = (a, b) => a + (b - a) * Math.random();

  // ---------------- 调色 ----------------
  const PAL = {
    catBody: 0xf2a24a, catBelly: 0xfaf6ee, catEye: 0x2d3a2a,
    magpie: 0x262a33, magpieWhite: 0xf4f6f6, magpieBlue: 0x3a5f9a,
    sparrow: 0x9a6b44, sparrowBelly: 0xe6d3b5, sparrowHead: 0x7a4e2e,
    beak: 0x3a3a3a, beakYellow: 0xf2b632, egret: 0xfcfcfa, leg: 0x2f2f2f,
    bfWing: 0xffd84d, bfBody: 0x3b3328,
    koi: 0xf06a2a, koiWhite: 0xfaf3ea, koiFin: 0xf7b48a,
    dfBody: 0xc8352a, dfWing: 0xe8f2f6, dfEye: 0x3a2a24,
  };

  // ---------------- 部件定义（面向 +x；与 lawn-scene.js 相同的坐标与比例） ----------------
  const MODELS = {
    cat: { height: 0.45, parts: [
      { p: "box", c: "catBody", pos: [0, 0.2, 0], s: [0.42, 0.18, 0.2], tag: "body" },
      { p: "box", c: "catBelly", pos: [0.02, 0.13, 0], s: [0.3, 0.05, 0.17], tag: "body" },
      { p: "gem", c: "catBody", pos: [0.25, 0.33, 0], s: [0.24, 0.21, 0.24], tag: "head" },
      { p: "gem", c: "catBelly", pos: [0.355, 0.3, 0], s: [0.08, 0.08, 0.12], tag: "head" },
      { p: "cone", c: "catBody", pos: [0.24, 0.47, 0.07], s: [0.08, 0.1, 0.07], tag: "head" },
      { p: "cone", c: "catBody", pos: [0.24, 0.47, -0.07], s: [0.08, 0.1, 0.07], tag: "head" },
      { p: "box", c: "catEye", pos: [0.36, 0.36, 0.055], s: [0.02, 0.035, 0.03], tag: "head" },
      { p: "box", c: "catEye", pos: [0.36, 0.36, -0.055], s: [0.02, 0.035, 0.03], tag: "head" },
      { p: "cyl", c: "catBody", pos: [-0.27, 0.32, 0], rot: [0, 0, 0.55], s: [0.045, 0.3, 0.045], tag: "tail" },
      { p: "box", c: "catBody", pos: [0.15, 0.07, 0.065], s: [0.05, 0.14, 0.05], tag: "legF" },
      { p: "box", c: "catBody", pos: [0.15, 0.07, -0.065], s: [0.05, 0.14, 0.05], tag: "legB" },
      { p: "box", c: "catBody", pos: [-0.15, 0.07, 0.065], s: [0.05, 0.14, 0.05], tag: "legB" },
      { p: "box", c: "catBody", pos: [-0.15, 0.07, -0.065], s: [0.05, 0.14, 0.05], tag: "legF" },
    ] },
    butterfly: { height: 0.1, parts: [
      { p: "cyl", c: "bfBody", pos: [0, 0, 0], rot: [0, 0, Math.PI / 2], s: [0.025, 0.16, 0.025] },
      { p: "wing", c: "bfWing", pos: [0, 0, 0.01], s: [0.2, 1, 0.2], tag: "wing" },
      { p: "wing", c: "bfWing", pos: [0, 0, -0.01], rot: [0, Math.PI, 0], s: [0.2, 1, 0.2], tag: "wing" },
    ] },
    magpie: { height: 0.35, parts: [
      { p: "gem", c: "magpie", pos: [0, 0.22, 0], s: [0.3, 0.17, 0.16], tag: "body" },
      { p: "gem", c: "magpieWhite", pos: [0.02, 0.18, 0], s: [0.2, 0.1, 0.17], tag: "body" },
      { p: "gem", c: "magpie", pos: [0.15, 0.32, 0], s: [0.13, 0.13, 0.12], tag: "head" },
      { p: "cone", c: "beak", pos: [0.24, 0.32, 0], rot: [0, 0, -Math.PI / 2], s: [0.04, 0.08, 0.04], tag: "head" },
      { p: "box", c: "magpie", pos: [-0.24, 0.27, 0], rot: [0, 0, 0.32], s: [0.26, 0.025, 0.07], tag: "tail" },
      { p: "box", c: "magpieBlue", pos: [-0.02, 0.25, 0.08], s: [0.18, 0.025, 0.2], tag: "wing" },
      { p: "box", c: "magpieBlue", pos: [-0.02, 0.25, -0.08], rot: [0, Math.PI, 0], s: [0.18, 0.025, 0.2], tag: "wing" },
      { p: "cyl", c: "leg", pos: [0.02, 0.06, 0.03], s: [0.015, 0.12, 0.015] },
      { p: "cyl", c: "leg", pos: [0.02, 0.06, -0.03], s: [0.015, 0.12, 0.015] },
    ] },
    sparrow: { height: 0.2, parts: [
      { p: "gem", c: "sparrow", pos: [0, 0.12, 0], s: [0.17, 0.12, 0.12], tag: "body" },
      { p: "gem", c: "sparrowBelly", pos: [0.02, 0.1, 0], s: [0.12, 0.08, 0.11], tag: "body" },
      { p: "gem", c: "sparrowHead", pos: [0.08, 0.18, 0], s: [0.09, 0.09, 0.085], tag: "head" },
      { p: "cone", c: "beak", pos: [0.135, 0.175, 0], rot: [0, 0, -Math.PI / 2], s: [0.03, 0.04, 0.03], tag: "head" },
      { p: "box", c: "sparrowHead", pos: [-0.11, 0.14, 0], rot: [0, 0, 0.3], s: [0.08, 0.015, 0.05], tag: "tail" },
      { p: "box", c: "sparrow", pos: [-0.01, 0.14, 0.05], s: [0.1, 0.015, 0.11], tag: "wing" },
      { p: "box", c: "sparrow", pos: [-0.01, 0.14, -0.05], rot: [0, Math.PI, 0], s: [0.1, 0.015, 0.11], tag: "wing" },
      { p: "cyl", c: "leg", pos: [0.0, 0.03, 0.02], s: [0.01, 0.06, 0.01] },
      { p: "cyl", c: "leg", pos: [0.0, 0.03, -0.02], s: [0.01, 0.06, 0.01] },
    ] },
    egret: { height: 0.9, parts: [
      { p: "gem", c: "egret", pos: [0, 0.5, 0], s: [0.36, 0.2, 0.18], tag: "body" },
      { p: "cyl", c: "egret", pos: [0.14, 0.68, 0], rot: [0, 0, -0.35], s: [0.05, 0.3, 0.05], tag: "neck" },
      { p: "gem", c: "egret", pos: [0.22, 0.86, 0], s: [0.11, 0.1, 0.1], tag: "head" },
      { p: "cone", c: "beakYellow", pos: [0.34, 0.85, 0], rot: [0, 0, -Math.PI / 2], s: [0.035, 0.17, 0.035], tag: "head" },
      { p: "box", c: "egret", pos: [-0.04, 0.53, 0.07], s: [0.26, 0.03, 0.3], tag: "wing" },
      { p: "box", c: "egret", pos: [-0.04, 0.53, -0.07], rot: [0, Math.PI, 0], s: [0.26, 0.03, 0.3], tag: "wing" },
      { p: "cyl", c: "leg", pos: [0, 0.2, 0.04], s: [0.018, 0.42, 0.018], tag: "legF" },
      { p: "cyl", c: "leg", pos: [0, 0.2, -0.04], s: [0.018, 0.42, 0.018], tag: "legB" },
    ] },
    // 锦鲤：纺锤形身体（红白相间）+ 摆动的尾鳍、胸鳍；原点在水面，身体略低于水面
    koi: { height: 0.12, parts: [
      { p: "gem", c: "koi", pos: [0, -0.06, 0], s: [0.5, 0.12, 0.16], tag: "body" },
      { p: "gem", c: "koiWhite", pos: [0.08, -0.04, 0], s: [0.22, 0.08, 0.13], tag: "body" },
      { p: "gem", c: "koi", pos: [0.2, -0.05, 0], s: [0.12, 0.09, 0.12], tag: "head" },
      { p: "gem", c: "koiFin", pos: [-0.3, -0.05, 0], s: [0.16, 0.015, 0.14], tag: "tail" },
      { p: "box", c: "koiFin", pos: [0.08, -0.08, 0.08], rot: [0, 0.5, 0], s: [0.07, 0.01, 0.06], tag: "legF" },
      { p: "box", c: "koiFin", pos: [0.08, -0.08, -0.08], rot: [0, -0.5, 0], s: [0.07, 0.01, 0.06], tag: "legB" },
    ] },
    // 蜻蜓：细长红色腹部 + 两对透明翅
    dragonfly: { height: 0.08, parts: [
      { p: "cyl", c: "dfBody", pos: [-0.04, 0, 0], rot: [0, 0, Math.PI / 2], s: [0.014, 0.16, 0.014] },
      { p: "gem", c: "dfBody", pos: [0.05, 0, 0], s: [0.04, 0.03, 0.03] },
      { p: "gem", c: "dfEye", pos: [0.075, 0.005, 0], s: [0.025, 0.025, 0.04] },
      { p: "box", c: "dfWing", pos: [0.03, 0.008, 0.06], s: [0.035, 0.003, 0.12], tag: "wing", alpha: 0.55 },
      { p: "box", c: "dfWing", pos: [0.03, 0.008, -0.06], rot: [0, Math.PI, 0], s: [0.035, 0.003, 0.12], tag: "wing", alpha: 0.55 },
      { p: "box", c: "dfWing", pos: [0.0, 0.008, 0.055], s: [0.03, 0.003, 0.11], tag: "wing", alpha: 0.55 },
      { p: "box", c: "dfWing", pos: [0.0, 0.008, -0.055], rot: [0, Math.PI, 0], s: [0.03, 0.003, 0.11], tag: "wing", alpha: 0.55 },
    ] },
  };

  function create(Z) {
    const look = Z.look;
    // 图元：单位尺寸（部件 s 直接缩放）
    const wingShape = new THREE.Shape();
    wingShape.moveTo(0, 0); wingShape.bezierCurveTo(0.6, 0.2, 0.9, 0.7, 0.55, 1.0); wingShape.bezierCurveTo(0.2, 1.05, 0.05, 0.6, 0, 0.45);
    wingShape.bezierCurveTo(-0.15, 0.75, -0.55, 0.85, -0.6, 0.55); wingShape.bezierCurveTo(-0.6, 0.25, -0.25, 0.05, 0, 0);
    const PRIM = {
      box: new THREE.BoxGeometry(1, 1, 1),
      gem: new THREE.IcosahedronGeometry(0.5, 1),
      cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 7),
      cone: new THREE.ConeGeometry(0.5, 1, 6),
      // 翅膀：在 xz 平面内向 +z 展开（y 方向几乎无厚度）
      wing: new THREE.ShapeGeometry(wingShape, 6).rotateX(Math.PI / 2),
    };
    const matCache = {};
    function mat(hex, alpha) {
      const k = hex + "|" + (alpha || 1);
      if (matCache[k]) return matCache[k];
      const m = look.patch(new THREE.MeshStandardMaterial({ color: hex, roughness: 0.7, flatShading: true, envMapIntensity: 0.6, side: THREE.DoubleSide,
        transparent: !!alpha, opacity: alpha || 1, depthWrite: !alpha }), { key: "zfauna" + (alpha ? "a" : "") });
      return (matCache[k] = m);
    }
    const REG = new Set();
    const _e = new THREE.Euler(0, 0, 0, "YXZ");

    // opts.colors：按个体覆盖调色（猫的毛色、蝴蝶翅色、锦鲤花色）
    function make(key, opts) {
      const def = MODELS[key];
      const g = new THREE.Group(); g.name = "fauna:" + key;
      g.userData.pose = {}; g.userData.height = def.height; g.userData.parts = [];
      const colors = (opts && opts.colors) || {};
      for (const p of def.parts) {
        const hex = colors[p.c] != null ? colors[p.c] : PAL[p.c];
        const m = new THREE.Mesh(PRIM[p.p], mat(hex, p.alpha));
        const rot = p.rot || [0, 0, 0];
        m.position.fromArray(p.pos); m.rotation.copy(_e.set(rot[0], rot[1], rot[2], "YXZ")); m.scale.fromArray(p.s);
        m.castShadow = !p.alpha; m.receiveShadow = true;
        g.add(m);
        if (p.tag) g.userData.parts.push({ m, p, rot });
      }
      REG.add(g);
      return g;
    }
    function applyPose(g) {
      const P = g.userData.pose;
      for (const { m, p, rot } of g.userData.parts) {
        let rx = rot[0], ry = rot[1], rz = rot[2], dx = 0, dy = 0;
        switch (p.tag) {
          case "wing": rx += P.wing || 0; break;
          case "tail": rz += P.tail || 0; ry += P.tailY || 0; break;
          case "legF": rz += P.leg || 0; break;
          case "legB": rz -= P.leg || 0; break;
          case "head": rz += P.head || 0; dy += P.headY || 0; ry += P.headTurn || 0; break;
          case "neck": rz += P.neck || 0; break;
          case "body": rz += P.body || 0; dy += P.bodyY || 0; break;
        }
        m.position.set(p.pos[0] + dx, p.pos[1] + dy, p.pos[2]);
        m.rotation.set(rx, ry, rz, "YXZ");
      }
    }
    Z.onFrame(() => { for (const g of REG) { if (!g.parent) { REG.delete(g); continue; } if (g.visible) applyPose(g); } });
    function dispose(g) { REG.delete(g); if (g.parent) g.parent.remove(g); }

    // ================= 行为 =================
    const ground = (x, z) => Z.surfaceAt(x, z);
    const WL = () => (Z.LAY.waterLevel != null ? Z.LAY.waterLevel : 0);
    const face = (o, dx, dz) => { if (Math.abs(dx) + Math.abs(dz) > 1e-4) o.rotation.y = Math.atan2(-dz, dx); };
    const turnTo = (o, dx, dz, k) => {
      if (Math.abs(dx) + Math.abs(dz) < 1e-4) return;
      let a = Math.atan2(-dz, dx) - o.rotation.y; a = Math.atan2(Math.sin(a), Math.cos(a)); o.rotation.y += a * Math.min(1, k);
    };
    function wanderTarget(ind, rad, ok) {
      for (let k = 0; k < 12; k++) { const a = Math.random() * 6.28, r = rnd(0.6, rad), x = ind.x + Math.cos(a) * r, z = ind.z + Math.sin(a) * r; if (ok(x, z)) return [x, z]; }
      return [ind.x, ind.z];
    }

    // 小猫：坐着摇尾巴 → 闲逛 → 看到附近的蝴蝶就压低身子靠近 → 扑起来 → 蝴蝶受惊飞高
    function catIdle(ind, dt, ctx) {
      const o = ind.obj, P = o.userData.pose, p = o.position;
      const a = ind.ai || (ind.ai = { st: "sit", t: rnd(0.5, 2), ph: Math.random() * 6 });
      a.ph += dt;
      if (a.st === "sit") {
        P.leg = 0; P.tail = 0.25 + Math.sin(a.ph * 2.2) * 0.35; P.body = 0.18; P.bodyY = -0.02; P.head = Math.sin(a.ph * 0.7) * 0.15; p.y = ground(p.x, p.z);
        a.t -= dt;
        if (a.t <= 0) {
          let best = null, bd = 3.4;
          for (const b of ctx.active("butterfly")) { const d = Math.hypot(b.obj.position.x - p.x, b.obj.position.z - p.z); if (d < bd && Math.hypot(b.obj.position.x - ind.x, b.obj.position.z - ind.z) < 4.5) { bd = d; best = b; } }
          if (best && Math.random() < 0.75) { a.st = "stalk"; a.target = best; a.t = 6; }
          else { const t = wanderTarget(ind, 2.6, ctx.okGround); a.st = "walk"; a.tx = t[0]; a.tz = t[1]; a.t = 8; }
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
        if (ctx.okGround(nx, nz)) { p.x = nx; p.z = nz; } else { a.st = "sit"; a.t = rnd(1, 2); }
        p.y = ground(p.x, p.z);
        P.leg = Math.sin(a.ph * (a.st === "stalk" ? 9 : 12)) * 0.5; P.tail = a.st === "stalk" ? -0.2 : 0.35 + Math.sin(a.ph * 3) * 0.15;
        P.body = 0; P.bodyY = a.st === "stalk" ? -0.04 : 0; P.head = a.st === "stalk" ? -0.1 : 0;
        a.t -= dt;
        if (a.st === "stalk" && d < 1.0) {
          a.st = "pounce"; a.k = 0; a.p0 = [p.x, p.z]; const r = Math.min(d + 0.2, 1.1); a.p1 = [p.x + (dx / Math.max(d, 1e-3)) * r, p.z + (dz / Math.max(d, 1e-3)) * r];
          if (a.target.ai) a.target.ai.flee = 1.6;
        } else if (d < 0.05 || a.t <= 0) { a.st = "sit"; a.t = rnd(2, 5); }
      } else if (a.st === "pounce") {
        a.k = Math.min(1, a.k + dt / 0.55);
        const k = a.k, x = a.p0[0] + (a.p1[0] - a.p0[0]) * k, z = a.p0[1] + (a.p1[1] - a.p0[1]) * k;
        if (ctx.okGround(x, z)) { p.x = x; p.z = z; }
        p.y = ground(p.x, p.z) + Math.sin(Math.PI * k) * 0.42;
        P.body = 0.45 * Math.cos(Math.PI * k); P.leg = (k < 0.5 ? 0.8 : -0.6); P.tail = 0.8;
        if (a.k >= 1) { p.y = ground(p.x, p.z); a.st = "sit"; a.t = rnd(2.5, 4.5); if (ctx.editor) ctx.editor.helpers.burstSoil(p.x, p.y, p.z, 6, 0.35); }
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
      const y = ground(x, z) + 0.55 + 0.22 * Math.sin(t * 1.9 + a.s) + a.lift;
      turnTo(o, x - o.position.x, z - o.position.z, dt * 8);
      o.position.set(x, y, z);
      P.wing = 0.25 + Math.sin(a.ph * 24) * 0.95;
    }
    // 喜鹊 / 麻雀：低头啄食、小跳几步，偶尔起飞换个地方
    function birdIdle(ind, dt, ctx) {
      const o = ind.obj, P = o.userData.pose, small = ind.key === "sparrow", p = o.position;
      const a = ind.ai || (ind.ai = { st: "peck", t: rnd(0.5, 2), ph: Math.random() * 6 });
      a.ph += dt;
      if (a.st === "peck") {
        P.wing = 0; P.head = Math.max(0, Math.sin(a.ph * (small ? 9 : 6))) * -0.55; P.headY = P.head * 0.04; P.tail = Math.sin(a.ph * 4) * 0.1; p.y = ground(p.x, p.z);
        a.t -= dt;
        if (a.t <= 0) {
          const fly = Math.random() < 0.18, tg = wanderTarget(ind, fly ? 3 : small ? 1.2 : 1.8, ctx.okGround);
          a.st = fly ? "fly" : "hop"; a.k = 0; a.p0 = [p.x, p.z]; a.p1 = tg; a.dur = 1.6; face(o, tg[0] - p.x, tg[1] - p.z);
        }
      } else if (a.st === "hop") {
        const D = Math.hypot(a.p1[0] - a.p0[0], a.p1[1] - a.p0[1]), hops = Math.max(1, Math.ceil(D / (small ? 0.18 : 0.3)));
        a.k = Math.min(1, a.k + dt / (hops * 0.22));
        const k = a.k, f = (k * hops) % 1;
        p.x = a.p0[0] + (a.p1[0] - a.p0[0]) * k; p.z = a.p0[1] + (a.p1[1] - a.p0[1]) * k; p.y = ground(p.x, p.z) + Math.sin(Math.PI * f) * (small ? 0.06 : 0.09);
        P.head = 0; P.wing = Math.sin(Math.PI * f) * 0.4; P.tail = 0.15;
        if (a.k >= 1) { p.y = ground(p.x, p.z); a.st = "peck"; a.t = rnd(1.2, 3.5); }
      } else {
        a.k = Math.min(1, a.k + dt / a.dur); const k = a.k, e = k * k * (3 - 2 * k);
        p.x = a.p0[0] + (a.p1[0] - a.p0[0]) * e; p.z = a.p0[1] + (a.p1[1] - a.p0[1]) * e; p.y = ground(p.x, p.z) + Math.sin(Math.PI * k) * 1.1;
        P.wing = Math.sin(a.ph * (small ? 30 : 18)) * 0.9; P.head = 0;
        if (a.k >= 1) { p.y = ground(p.x, p.z); a.st = "peck"; a.t = rnd(1, 3); }
      }
    }
    // 白鹭：慢慢踱步，伸颈探头（在水边时会站进浅水）
    function egretIdle(ind, dt, ctx) {
      const o = ind.obj, P = o.userData.pose, p = o.position;
      const a = ind.ai || (ind.ai = { st: "stand", t: rnd(1, 3), ph: Math.random() * 6 });
      a.ph += dt;
      const gy = (x, z) => (Z.waterAt(x, z) ? WL() - 0.15 : ground(x, z));
      if (a.st === "stand") {
        P.leg = 0; P.wing = 0; P.neck = Math.sin(a.ph * 0.8) * 0.1; P.head = Math.max(0, Math.sin(a.ph * 0.5)) * -0.3; p.y = gy(p.x, p.z);
        a.t -= dt;
        if (a.t <= 0) { const tg = wanderTarget(ind, 2.2, ctx.okWade); a.st = "walk"; a.tx = tg[0]; a.tz = tg[1]; a.t = 10; }
      } else {
        const dx = a.tx - p.x, dz = a.tz - p.z, d = Math.hypot(dx, dz);
        turnTo(o, dx, dz, dt * 3);
        const step = Math.min(d, 0.32 * dt), nx = p.x + Math.cos(o.rotation.y) * step, nz = p.z - Math.sin(o.rotation.y) * step;
        if (ctx.okWade(nx, nz)) { p.x = nx; p.z = nz; } else a.t = 0;
        p.y = gy(p.x, p.z);
        P.leg = Math.sin(a.ph * 4) * 0.35; P.neck = 0.18 * Math.sin(a.ph * 4); P.head = 0;
        a.t -= dt;
        if (d < 0.05 || a.t <= 0) { a.st = "stand"; a.t = rnd(2, 5); }
      }
    }
    // 锦鲤：在池中缓缓巡游，转向时摆尾，偶尔停下浮到水面
    function koiIdle(ind, dt, ctx) {
      const o = ind.obj, P = o.userData.pose, p = o.position;
      const a = ind.ai || (ind.ai = { tx: ind.x, tz: ind.z, t: 0, ph: Math.random() * 6, sp: rnd(0.35, 0.6), rest: 0 });
      a.ph += dt; a.t -= dt;
      if (a.t <= 0 || Math.hypot(a.tx - p.x, a.tz - p.z) < 0.4) { const tg = wanderTarget(ind, 4.5, ctx.okDeep); a.tx = tg[0]; a.tz = tg[1]; a.t = rnd(5, 10); a.rest = Math.random() < 0.2 ? rnd(1.5, 3) : 0; }
      if (a.rest > 0) { a.rest -= dt; P.tailY = Math.sin(a.ph * 3) * 0.2; P.leg = Math.sin(a.ph * 4) * 0.3; p.y = WL() + 0.04; return; }
      const dx = a.tx - p.x, dz = a.tz - p.z;
      const before = o.rotation.y; turnTo(o, dx, dz, dt * 1.6); const turn = o.rotation.y - before;
      const step = a.sp * dt, nx = p.x + Math.cos(o.rotation.y) * step, nz = p.z - Math.sin(o.rotation.y) * step;
      if (ctx.okDeep(nx, nz) || !ctx.okDeep(p.x, p.z)) { p.x = nx; p.z = nz; } else a.t = 0;
      p.y = WL() + 0.02 + Math.sin(a.ph * 0.7) * 0.02;   // 背鳍贴着水面，透过水面看得见
      P.tailY = Math.sin(a.ph * 7) * 0.35 - turn * 8; P.body = 0; P.leg = Math.sin(a.ph * 5) * 0.25;
    }
    // 蜻蜓：在栖息点附近悬停，隔几秒“嗖”地换个位置，翅膀高速振动
    function dragonflyIdle(ind, dt) {
      const o = ind.obj, P = o.userData.pose, p = o.position;
      const a = ind.ai || (ind.ai = { st: "hover", t: rnd(1, 3), ph: Math.random() * 6, hx: ind.x, hz: ind.z });
      a.ph += dt; P.wing = Math.sin(a.ph * 60) * 0.5;
      const base = (x, z) => (Z.waterAt(x, z) ? WL() : ground(x, z)) + 0.7;
      if (a.st === "hover") {
        p.set(a.hx + Math.sin(a.ph * 1.3) * 0.05, base(a.hx, a.hz) + Math.sin(a.ph * 2.1) * 0.06, a.hz + Math.cos(a.ph * 1.1) * 0.05);
        a.t -= dt;
        if (a.t <= 0) { const ang = Math.random() * 6.28, r = rnd(0.8, 2.2); a.p0 = [a.hx, a.hz]; a.p1 = [ind.x + Math.cos(ang) * r, ind.z + Math.sin(ang) * r]; a.k = 0; a.st = "dart"; face(o, a.p1[0] - a.hx, a.p1[1] - a.hz); }
      } else {
        a.k = Math.min(1, a.k + dt / 0.45); const e = a.k * a.k * (3 - 2 * a.k);
        a.hx = a.p0[0] + (a.p1[0] - a.p0[0]) * e; a.hz = a.p0[1] + (a.p1[1] - a.p0[1]) * e;
        p.set(a.hx, base(a.hx, a.hz) + Math.sin(Math.PI * a.k) * 0.2, a.hz);
        if (a.k >= 1) { a.st = "hover"; a.t = rnd(1.5, 4); }
      }
    }

    // ================= 入场 / 离场 / 移植动画 =================
    function walkPath(ind, x0, z0, x1, z1, dur, api, opt) {
      const o = ind.obj, P = o.userData.pose, S = ind.scale || 1;
      opt = opt || {};
      face(o, x1 - x0, z1 - z0); o.position.set(x0, ground(x0, z0), z0);
      let puff = false;
      return api.helpers.play({ dur, update: (t) => {
        const k = api.helpers.ease(t), x = x0 + (x1 - x0) * k, z = z0 + (z1 - z0) * k;
        o.position.set(x, opt.water ? WL() + 0.02 : ground(x, z), z);
        P.leg = Math.sin(t * dur * 13) * 0.55; P.tail = 0.35; P.tailY = Math.sin(t * dur * 7) * 0.35; P.body = 0; P.bodyY = 0;
        const sc = opt.fadeIn ? Math.min(1, t * 5) : opt.fadeOut ? 1 - api.helpers.ease(api.helpers.clamp((t - 0.7) / 0.3, 0, 1)) : 1;
        o.scale.setScalar(Math.max(0.0001, S * sc));
        if (!puff && t > 0.08 && !opt.water) { puff = true; api.helpers.burstSoil(x0, ground(x0, z0), z0, 8, 0.45); }
        if (!puff && opt.water) { puff = true; api.helpers.ringRipple(x0, WL(), z0, 0.1, 0.8, 1.4); }
      }, end: () => {
        o.position.set(x1, opt.water ? WL() + 0.02 : ground(x1, z1), z1); o.scale.setScalar(opt.fadeOut ? 0.0001 : S); P.leg = 0; ind.ai = null;
        if (opt.water) api.helpers.ringRipple(x1, WL(), z1, 0.1, 0.8, 1.4);
        else if (!opt.fadeOut) api.helpers.burstSoil(x1, ground(x1, z1), z1, 6, 0.35);
        opt.done && opt.done();
      } });
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
        const sc = opt.fadeIn ? Math.min(1, t * 4) : opt.fadeOut ? 1 - api.helpers.ease(api.helpers.clamp((t - 0.6) / 0.4, 0, 1)) : 1;
        o.scale.setScalar(Math.max(0.0001, S * sc));
      }, end: () => {
        o.position.copy(p1); o.scale.setScalar(opt.fadeOut ? 0.0001 : S); P.wing = 0; ind.ai = null;
        if (opt.landing) api.helpers.burstSoil(p1.x, p1.y, p1.z, 6, 0.3);
        opt.done && opt.done();
      } });
    }
    // 动物从板块中心向外的方向（入场 / 离场）
    const outward = (x, z) => { const a = Math.atan2(z - Z.cz, x - Z.cx) + rnd(-0.5, 0.5); return [Math.cos(a), Math.sin(a)]; };
    function walker(dur, okGround) {
      return {
        enter(ind, done, api) { const [ux, uz] = outward(ind.x, ind.z); let x0 = ind.x + ux * 3.2, z0 = ind.z + uz * 3.2; if (!okGround(x0, z0)) { x0 = ind.x - ux * 3.2; z0 = ind.z - uz * 3.2; } return walkPath(ind, x0, z0, ind.x, ind.z, dur, api, { fadeIn: true, done }); },
        exit(ind, done, api) { const o = ind.obj, [ux, uz] = outward(o.position.x, o.position.z); return walkPath(ind, o.position.x, o.position.z, o.position.x + ux * 3.2, o.position.z + uz * 3.2, dur, api, { fadeOut: true, done }); },
        transplant(ind, x1, z1, done, api) { const o = ind.obj, d = Math.hypot(x1 - o.position.x, z1 - o.position.z); return walkPath(ind, o.position.x, o.position.z, x1, z1, api.helpers.clamp(d / 1.6, 0.8, 5), api, { done }); },
      };
    }
    function flyer(opt) {
      const hover = opt.hover || 0, base = (x, z) => (opt.overWater && Z.waterAt(x, z) ? WL() : ground(x, z)) + hover;
      return {
        enter(ind, done, api) { const p1 = new THREE.Vector3(ind.x, base(ind.x, ind.z), ind.z), p0 = p1.clone().add(new THREE.Vector3(rnd(-5, 5), 4.5, rnd(-5, 5))); return flyPath(ind, p0, p1, opt.dur, api, Object.assign({}, opt, { fadeIn: true, landing: !hover, done })); },
        exit(ind, done, api) { const p0 = ind.obj.position.clone(), p1 = p0.clone().add(new THREE.Vector3(rnd(-5, 5), 4.5, rnd(-5, 5))); return flyPath(ind, p0, p1, opt.dur, api, Object.assign({}, opt, { fadeOut: true, done })); },
        transplant(ind, x1, z1, done, api) { const p0 = ind.obj.position.clone(), p1 = new THREE.Vector3(x1, base(x1, z1), z1); return flyPath(ind, p0, p1, api.helpers.clamp(p0.distanceTo(p1) / 3, 1.2, 3.5), api, Object.assign({}, opt, { landing: !hover, done })); },
      };
    }
    // 锦鲤：从深处浮上 / 潜下离开 / 游到新位置
    function swimmer() {
      return {
        enter(ind, done, api) { const o = ind.obj, S = ind.scale || 1; o.position.set(ind.x, WL() - 0.6, ind.z); api.helpers.ringRipple(ind.x, WL(), ind.z, 0.1, 0.9, 1.6);
          return api.helpers.play({ dur: 1.6, update: (t) => { const k = api.helpers.ease(t); o.position.y = WL() - 0.6 + 0.62 * k; o.scale.setScalar(Math.max(1e-4, S * Math.min(1, t * 3))); o.userData.pose.tailY = Math.sin(t * 20) * 0.4; },
            end: () => { o.scale.setScalar(S); ind.ai = null; done && done(); } }); },
        exit(ind, done, api) { const o = ind.obj, S = ind.scale || 1, y0 = o.position.y; api.helpers.ringRipple(o.position.x, WL(), o.position.z, 0.1, 0.9, 1.6);
          return api.helpers.play({ dur: 1.4, update: (t) => { const k = api.helpers.ease(t); o.position.y = y0 - 0.6 * k; o.scale.setScalar(Math.max(1e-4, S * (1 - k))); o.userData.pose.tailY = Math.sin(t * 24) * 0.45; },
            end: () => { o.scale.setScalar(1e-4); done && done(); } }); },
        transplant(ind, x1, z1, done, api) { const o = ind.obj, d = Math.hypot(x1 - o.position.x, z1 - o.position.z); return walkPath(ind, o.position.x, o.position.z, x1, z1, api.helpers.clamp(d / 0.8, 1, 6), api, { water: true, done }); },
      };
    }

    return { MODELS, make, dispose, applyPose, idle: { cat: catIdle, butterfly: butterflyIdle, magpie: birdIdle, sparrow: birdIdle, egret: egretIdle, koi: koiIdle, dragonfly: dragonflyIdle }, walker, flyer, swimmer };
  }

  global.ZoneFauna = { create, MODELS };
})(window);
