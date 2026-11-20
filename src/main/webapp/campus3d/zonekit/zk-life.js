/*
 * 板块细节场景工具包 · 小动物与天气粒子（ZKLife）
 * ------------------------------------------------------------------------------
 * 写实画风的小动物（与全景 eco-life.js 的小猫、蝴蝶、飞鸟同一造型思路，按真实尺寸）：
 *   校园小猫（橘猫 / 狸花 / 奶牛猫 / 白猫，闲逛、坐下摇尾、看到蝴蝶压低身子靠近再扑击）、
 *   喜鹊 / 麻雀（地面啄食、小跳、偶尔起飞换地方）、蝴蝶（绕花丛忽高忽低），以及天上盘旋的雀鸟群（Boids，不可编辑）。
 * 粒子：雨 / 雪 / 春季花瓣 / 秋季落叶（GPU 粒子，与全景同法）。
 * 导出 window.ZKLife.create(scene, { look, groundOk(x, z), groundY(x, z) })
 */
(function (global) {
  "use strict";
  const THREE = global.THREE;
  const V3 = THREE.Vector3;
  const rnd = (a, b) => a + (b - a) * Math.random();
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function create(scene, opts) {
    const look = opts.look, patch = look.patch;
    const groundOk = opts.groundOk || (() => true);
    const groundY = opts.groundY || (() => 0);
    const std = (p, k) => patch(new THREE.MeshStandardMaterial(p), { key: k || "zklife", noWeather: true });

    // ---------------------------------------------------------------- 小猫
    const COATS = [
      { body: ["#c8742b", "#dd9447", "#f1d9b6"], stripe: "rgba(120,58,18,0.55)", white: 0xf1e7d8 },      // 橘猫
      { body: ["#5d5a52", "#7a756a", "#cbc3b2"], stripe: "rgba(30,28,24,0.6)", white: 0xe9e3d6 },        // 狸花
      { body: ["#1e1d20", "#2a292d", "#f1ede6"], stripe: "rgba(0,0,0,0)", white: 0xf4f1ea },             // 奶牛猫
      { body: ["#efe9dd", "#f6f1e8", "#fbf8f2"], stripe: "rgba(0,0,0,0)", white: 0xfbf8f2 },             // 白猫
    ];
    const furMats = COATS.map((c, i) => {
      const cv = makeCanvas(256, 128), g = cv.getContext("2d");
      const grd = g.createLinearGradient(0, 0, 0, 128); grd.addColorStop(0, c.body[0]); grd.addColorStop(0.55, c.body[1]); grd.addColorStop(1, c.body[2]);
      g.fillStyle = grd; g.fillRect(0, 0, 256, 128);
      for (let k = 0; k < 16; k++) { g.strokeStyle = c.stripe; g.lineWidth = 3 + (k % 3) * 2; g.beginPath(); const x = k * 16 + 4; g.moveTo(x, 0); g.bezierCurveTo(x + 6, 30, x - 6, 50, x + 3, 70); g.stroke(); }
      for (let k = 0; k < 900; k++) { g.fillStyle = `rgba(${k % 2 ? "255,235,200" : "60,40,20"},0.1)`; g.fillRect(Math.random() * 256, Math.random() * 128, 1, 3); }
      return { fur: std({ map: canvasTex(cv, true), roughness: 0.95, envMapIntensity: 0.5 }, "zkfur" + i), white: std({ color: c.white, roughness: 0.95, envMapIntensity: 0.5 }, "zkfurw" + i) };
    });
    const darkEye = new THREE.MeshStandardMaterial({ color: 0x15140f, roughness: 0.2 });
    const pink = new THREE.MeshStandardMaterial({ color: 0xd88d90, roughness: 0.6 });
    function makeCat(coat) {
      const M = furMats[coat % furMats.length], fur = M.fur, white = M.white;
      const cat = new THREE.Group();
      const mesh = (geo, m) => { const me = new THREE.Mesh(geo, m); me.castShadow = true; return me; };
      const bodyG = new THREE.Group(); cat.add(bodyG);
      const body = mesh(new THREE.CapsuleGeometry(0.085, 0.25, 6, 12).rotateX(Math.PI / 2), fur); body.position.set(0, 0.25, 0); bodyG.add(body);
      const chest = mesh(new THREE.SphereGeometry(0.075, 12, 8), white); chest.position.set(0, 0.225, 0.15); bodyG.add(chest);
      const head = new THREE.Group(); head.position.set(0, 0.37, 0.22); bodyG.add(head);
      const skull = mesh(new THREE.SphereGeometry(0.075, 16, 12), fur); skull.scale.set(1.05, 0.92, 1); head.add(skull);
      const muzzle = mesh(new THREE.SphereGeometry(0.038, 12, 8), white); muzzle.scale.set(1.2, 0.8, 0.9); muzzle.position.set(0, -0.022, 0.06); head.add(muzzle);
      const nose = mesh(new THREE.SphereGeometry(0.009, 8, 6), pink); nose.position.set(0, -0.01, 0.095); head.add(nose);
      [-0.033, 0.033].forEach((x) => {
        const e = mesh(new THREE.SphereGeometry(0.013, 10, 8), darkEye); e.position.set(x, 0.012, 0.062); head.add(e);
        const ear = mesh(new THREE.ConeGeometry(0.028, 0.06, 4), fur); ear.position.set(x * 1.45, 0.07, -0.005); ear.rotation.set(-0.15, Math.PI / 4, x > 0 ? -0.25 : 0.25); head.add(ear);
      });
      const legs = [];
      [[-0.045, 0.135], [0.045, 0.135], [-0.045, -0.125], [0.045, -0.125]].forEach(([x, z], i) => {
        const pivot = new THREE.Group(); pivot.position.set(x, 0.21, z);
        const leg = mesh(new THREE.CapsuleGeometry(0.02, 0.15, 4, 8), i < 2 ? white : fur); leg.position.y = -0.1; pivot.add(leg);
        bodyG.add(pivot); legs.push(pivot);
      });
      const tail = new THREE.Group(); tail.position.set(0, 0.29, -0.2); bodyG.add(tail);
      const seg1 = mesh(new THREE.CapsuleGeometry(0.018, 0.15, 4, 8).rotateX(Math.PI / 2), fur); seg1.position.z = -0.085; tail.add(seg1);
      const tail2 = new THREE.Group(); tail2.position.z = -0.165; tail.add(tail2);
      const seg2 = mesh(new THREE.CapsuleGeometry(0.016, 0.13, 4, 8).rotateX(Math.PI / 2), fur); seg2.position.z = -0.075; tail2.add(seg2);
      cat.userData.pose = { legs, tail, tail2, head, bodyG };
      cat.userData.kind = "cat";
      return cat;
    }

    // ---------------------------------------------------------------- 喜鹊 / 麻雀
    const birdMats = {
      magpie: { body: std({ color: 0x15171c, roughness: 0.45, metalness: 0.15 }, "zkmag"), belly: std({ color: 0xf2f2ee, roughness: 0.7 }, "zkmagw"), wing: std({ color: 0x1d2a44, roughness: 0.35, metalness: 0.3, side: THREE.DoubleSide }, "zkmagwing") },
      sparrow: { body: std({ color: 0x7a5636, roughness: 0.85 }, "zkspa"), belly: std({ color: 0xd9cbb3, roughness: 0.9 }, "zkspaw"), wing: std({ color: 0x5e4128, roughness: 0.85, side: THREE.DoubleSide }, "zkspawing") },
    };
    const beakMat = std({ color: 0x2a2620, roughness: 0.5 }, "zkbeak");
    function makeBird(kind) {
      const s = kind === "magpie" ? 1 : 0.42, M = birdMats[kind];
      const g = new THREE.Group();
      const mesh = (geo, m) => { const me = new THREE.Mesh(geo, m); me.castShadow = true; return me; };
      const bodyG = new THREE.Group(); g.add(bodyG);
      const body = mesh(new THREE.SphereGeometry(0.1 * s, 12, 8).scale(0.85, 0.8, 1.5), M.body); body.position.y = 0.17 * s; bodyG.add(body);
      const belly = mesh(new THREE.SphereGeometry(0.085 * s, 10, 8).scale(0.8, 0.7, 1.1), M.belly); belly.position.set(0, 0.14 * s, 0.02 * s); bodyG.add(belly);
      const head = new THREE.Group(); head.position.set(0, 0.25 * s, 0.13 * s); bodyG.add(head);
      head.add(mesh(new THREE.SphereGeometry(0.06 * s, 12, 8), M.body));
      const beak = mesh(new THREE.ConeGeometry(0.018 * s, 0.07 * s, 6).rotateX(Math.PI / 2), beakMat); beak.position.z = 0.07 * s; head.add(beak);
      const tail = mesh(new THREE.BoxGeometry(0.06 * s, 0.012 * s, (kind === "magpie" ? 0.3 : 0.12) * s).translate(0, 0, -0.12 * s), M.wing); tail.position.set(0, 0.18 * s, -0.12 * s); tail.rotation.x = -0.25; bodyG.add(tail);
      const wingGeo = new THREE.PlaneGeometry(0.22 * s, 0.13 * s).translate(0.11 * s, 0, 0).rotateX(-Math.PI / 2);
      const wl = mesh(wingGeo, M.wing), wr = mesh(wingGeo, M.wing); wr.scale.x = -1;
      wl.position.set(0.05 * s, 0.21 * s, 0); wr.position.set(-0.05 * s, 0.21 * s, 0); bodyG.add(wl, wr);
      [-0.025, 0.025].forEach((x) => { const leg = mesh(new THREE.CylinderGeometry(0.004 * s, 0.004 * s, 0.09 * s, 4), beakMat); leg.position.set(x * s, 0.045 * s, 0.01); bodyG.add(leg); });
      g.userData.pose = { head, wl, wr, tail, bodyG };
      g.userData.kind = kind;
      return g;
    }

    // ---------------------------------------------------------------- 蝴蝶
    const BF_COLORS = [["#f2b632", "#2a1a0a"], ["#ffffff", "#3a3a3a"], ["#5aa6e6", "#14243a"], ["#f08bb4", "#3a1424"], ["#ef8a2a", "#2a120a"]];
    const bfMats = BF_COLORS.map(([c1, c2]) => {
      const cv = makeCanvas(64, 64), g = cv.getContext("2d");
      g.fillStyle = c1; g.beginPath(); g.ellipse(26, 22, 24, 18, -0.3, 0, 6.28); g.fill(); g.beginPath(); g.ellipse(22, 46, 16, 13, 0.4, 0, 6.28); g.fill();
      g.strokeStyle = c2; g.lineWidth = 3; g.beginPath(); g.ellipse(26, 22, 24, 18, -0.3, 0, 6.28); g.stroke(); g.beginPath(); g.ellipse(22, 46, 16, 13, 0.4, 0, 6.28); g.stroke();
      g.fillStyle = c2; for (let k = 0; k < 4; k++) { g.beginPath(); g.arc(36 + k * 4, 12 + k * 5, 2.5, 0, 6.28); g.fill(); }
      return new THREE.MeshStandardMaterial({ map: canvasTex(cv, true), side: THREE.DoubleSide, alphaTest: 0.5, roughness: 0.6 });
    });
    const bfBody = new THREE.MeshStandardMaterial({ color: 0x1e1a16, roughness: 0.7 });
    const bfWing = new THREE.PlaneGeometry(0.06, 0.055).translate(0.03, 0, 0).rotateX(-Math.PI / 2);
    function makeButterfly(i) {
      const g = new THREE.Group(), m = bfMats[i % bfMats.length];
      const wl = new THREE.Mesh(bfWing, m), wr = new THREE.Mesh(bfWing, m); wr.scale.x = -1;
      const b = new THREE.Mesh(new THREE.CapsuleGeometry(0.0035, 0.03, 4, 6).rotateX(Math.PI / 2), bfBody);
      g.add(wl, wr, b);
      g.userData.pose = { wl, wr };
      g.userData.kind = "butterfly";
      return g;
    }

    // ---------------------------------------------------------------- 动物行为（编辑器个体 ind：{ obj, x, z, ai }）
    const face = (o, dx, dz) => { if (Math.abs(dx) + Math.abs(dz) > 1e-5) o.rotation.y = Math.atan2(dx, dz); };
    const turnTo = (o, dx, dz, k) => { if (Math.abs(dx) + Math.abs(dz) < 1e-5) return; let a = Math.atan2(dx, dz) - o.rotation.y; a = Math.atan2(Math.sin(a), Math.cos(a)); o.rotation.y += a * Math.min(1, k); };
    function wanderTarget(ind, rad) {
      for (let k = 0; k < 12; k++) { const a = Math.random() * 6.28, r = rnd(0.8, rad), x = ind.x + Math.cos(a) * r, z = ind.z + Math.sin(a) * r; if (groundOk(x, z, ind.key)) return [x, z]; }
      return [ind.x, ind.z];
    }
    let active = true;   // 夜间 / 雨雪：小猫打盹、鸟不下地、蝴蝶隐藏
    let getInds = () => [];
    function catIdle(ind, dt) {
      const o = ind.obj, P = o.userData.pose, S = ind.scale || 1;
      const a = ind.ai || (ind.ai = { st: "sit", t: rnd(0.5, 2.5), ph: Math.random() * 6 });
      a.ph += dt; const p = o.position;
      if (!active && a.st !== "nap") { a.st = "nap"; }
      if (a.st === "nap") {
        P.legs.forEach((l) => (l.rotation.x = 0)); P.bodyG.position.y += (-0.12 - P.bodyG.position.y) * Math.min(1, dt * 3);
        P.head.rotation.x = 0.35; P.tail.rotation.y = Math.sin(a.ph * 1.2) * 0.3;
        if (active) { a.st = "sit"; a.t = 1; P.bodyG.position.y = 0; P.head.rotation.x = 0; }
        return;
      }
      p.y = groundY(p.x, p.z);
      if (a.st === "sit") {
        P.legs.forEach((l, i) => (l.rotation.x = i >= 2 ? 0.5 : 0)); P.bodyG.rotation.x = -0.25; P.bodyG.position.y = -0.03;
        P.tail.rotation.y = Math.sin(a.ph * 2.2) * 0.45; P.tail.rotation.x = 0.2; P.head.rotation.y = Math.sin(a.ph * 0.6) * 0.4; P.head.rotation.x = 0.2;
        a.t -= dt;
        if (a.t <= 0) {
          P.bodyG.rotation.x = 0; P.bodyG.position.y = 0; P.head.rotation.set(0, 0, 0);
          let best = null, bd = 6;
          for (const b of getInds()) if (b.key === "butterfly" && b.status === "active" && b.obj && !b.anim) { const d = Math.hypot(b.obj.position.x - p.x, b.obj.position.z - p.z); if (d < bd) { bd = d; best = b; } }
          if (best && Math.random() < 0.7) { a.st = "stalk"; a.target = best; a.t = 7; }
          else { const t = wanderTarget(ind, 6); a.st = "walk"; a.tx = t[0]; a.tz = t[1]; a.t = 10; }
        }
      } else if (a.st === "walk" || a.st === "stalk") {
        let tx = a.tx, tz = a.tz, sp = 0.55 * S;
        if (a.st === "stalk") {
          if (!a.target || a.target.status !== "active" || !a.target.obj) { a.st = "sit"; a.t = 1; return; }
          tx = a.target.obj.position.x; tz = a.target.obj.position.z; sp = 0.35 * S;
        }
        const dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz);
        turnTo(o, dx, dz, dt * 5);
        const step = Math.min(d, sp * dt), nx = p.x + Math.sin(o.rotation.y) * step, nz = p.z + Math.cos(o.rotation.y) * step;
        if (groundOk(nx, nz, "cat")) { p.x = nx; p.z = nz; } else { a.st = "sit"; a.t = rnd(1, 2); }
        const ph = a.ph * (a.st === "stalk" ? 9 : 12);
        P.legs.forEach((l, i) => (l.rotation.x = Math.sin(ph + (i === 0 || i === 3 ? 0 : Math.PI)) * 0.6));
        P.tail.rotation.x = a.st === "stalk" ? -0.2 : 0.5; P.bodyG.position.y = a.st === "stalk" ? -0.04 : 0; P.head.rotation.x = a.st === "stalk" ? 0.15 : 0;
        a.t -= dt;
        if (a.st === "stalk" && d < 0.6) {
          a.st = "pounce"; a.k = 0; a.p0 = [p.x, p.z]; const r = Math.min(d + 0.15, 0.7); a.p1 = [p.x + (dx / (d || 1)) * r, p.z + (dz / (d || 1)) * r];
          if (a.target.ai) a.target.ai.flee = 1.8;
        } else if (d < 0.05 || a.t <= 0) { a.st = "sit"; a.t = rnd(2, 6); }
      } else if (a.st === "pounce") {
        a.k = Math.min(1, a.k + dt / 0.5);
        const k = a.k; p.x = a.p0[0] + (a.p1[0] - a.p0[0]) * k; p.z = a.p0[1] + (a.p1[1] - a.p0[1]) * k;
        p.y = groundY(p.x, p.z) + Math.sin(Math.PI * k) * 0.28;
        P.bodyG.rotation.x = -0.45 * Math.cos(Math.PI * k);
        P.legs.forEach((l, i) => (l.rotation.x = (i < 2 ? -1 : 1) * Math.sin(k * Math.PI) * 0.9));
        if (a.k >= 1) { P.bodyG.rotation.x = 0; a.st = "sit"; a.t = rnd(2.5, 4.5); }
      }
    }
    function birdIdle(ind, dt) {
      const o = ind.obj, P = o.userData.pose, small = ind.key === "sparrow";
      const a = ind.ai || (ind.ai = { st: "peck", t: rnd(0.5, 2), ph: Math.random() * 6 });
      a.ph += dt; const p = o.position;
      if (a.st === "peck") {
        P.wl.rotation.z = P.wr.rotation.z = 0; P.head.rotation.x = Math.max(0, Math.sin(a.ph * (small ? 9 : 6))) * 0.7; p.y = groundY(p.x, p.z);
        a.t -= dt;
        if (a.t <= 0) {
          if (Math.random() < 0.2) { const tg = wanderTarget(ind, 7); a.st = "fly"; a.k = 0; a.p0 = [p.x, p.z]; a.p1 = tg; a.dur = 1.8; face(o, tg[0] - p.x, tg[1] - p.z); }
          else { const tg = wanderTarget(ind, small ? 1.2 : 2); a.st = "hop"; a.p0 = [p.x, p.z]; a.p1 = tg; a.k = 0; face(o, tg[0] - p.x, tg[1] - p.z); }
        }
      } else if (a.st === "hop") {
        const D = Math.hypot(a.p1[0] - a.p0[0], a.p1[1] - a.p0[1]), hops = Math.max(1, Math.ceil(D / (small ? 0.15 : 0.3)));
        a.k = Math.min(1, a.k + dt / (hops * 0.22));
        const k = a.k, f = (k * hops) % 1;
        p.x = a.p0[0] + (a.p1[0] - a.p0[0]) * k; p.z = a.p0[1] + (a.p1[1] - a.p0[1]) * k; p.y = groundY(p.x, p.z) + Math.sin(Math.PI * f) * (small ? 0.05 : 0.09);
        P.head.rotation.x = 0; P.wl.rotation.z = Math.sin(Math.PI * f) * 0.5; P.wr.rotation.z = -P.wl.rotation.z;
        if (a.k >= 1) { a.st = "peck"; a.t = rnd(1.2, 3.5); }
      } else if (a.st === "fly") {
        a.k = Math.min(1, a.k + dt / a.dur); const k = a.k, e = k * k * (3 - 2 * k);
        p.x = a.p0[0] + (a.p1[0] - a.p0[0]) * e; p.z = a.p0[1] + (a.p1[1] - a.p0[1]) * e; p.y = groundY(p.x, p.z) + Math.sin(Math.PI * k) * 1.6;
        const fl = Math.sin(a.ph * (small ? 32 : 18)) * 1.0; P.wl.rotation.z = fl; P.wr.rotation.z = -fl; P.head.rotation.x = 0;
        if (a.k >= 1) { a.st = "peck"; a.t = rnd(1, 3); }
      }
    }
    function butterflyIdle(ind, dt) {
      const o = ind.obj, P = o.userData.pose;
      const a = ind.ai || (ind.ai = { ph: Math.random() * 20, s: Math.random() * 6, flee: 0, lift: 0 });
      a.ph += dt; a.flee = Math.max(0, a.flee - dt);
      a.lift += ((a.flee > 0 ? 1.8 : 0) - a.lift) * Math.min(1, dt * 2.5);
      const t = a.ph * 0.9;
      const x = ind.x + Math.sin(t * 0.55 + a.s) * 1.8 + Math.sin(t * 1.7) * 0.3;
      const z = ind.z + Math.cos(t * 0.43 + a.s * 1.3) * 1.5 + Math.cos(t * 2.1) * 0.25;
      const y = groundY(x, z) + 0.6 + 0.25 * Math.sin(t * 1.9 + a.s) + a.lift;
      turnTo(o, x - o.position.x, z - o.position.z, dt * 8);
      o.position.set(x, y, z);
      const fl = 0.25 + Math.sin(a.ph * 24) * 0.95; P.wl.rotation.z = fl; P.wr.rotation.z = -fl;
      o.visible = active;
    }

    // ---------------------------------------------------------------- 天上的雀鸟群（Boids，简化）
    const NB = 24;
    const flockMat = std({ color: 0x3a332c, roughness: 0.85, side: THREE.DoubleSide }, "zkflock");
    const bodyGeo = new THREE.SphereGeometry(0.12, 8, 6).scale(0.55, 0.5, 1.5);
    const wingG = (s) => { const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0.13, 0, 0, -0.1, 0.38 * s, 0.01, 0.06, 0, 0, -0.1, 0.7 * s, 0.02, -0.08, 0.38 * s, 0.01, 0.06], 3)); g.computeVertexNormals(); return g; };
    const fb = new THREE.InstancedMesh(bodyGeo, flockMat, NB), fl = new THREE.InstancedMesh(wingG(1), flockMat, NB), fr = new THREE.InstancedMesh(wingG(-1), flockMat, NB);
    [fb, fl, fr].forEach((m) => { m.frustumCulled = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(m); look.noReflect.push(m); });
    const home = opts.home || new V3(0, 0, 0);
    const flock = [];
    for (let i = 0; i < NB; i++) flock.push({ p: new V3(home.x + rnd(-30, 30), 38 + rnd(0, 12), home.z + rnd(-30, 30)), v: new V3(rnd(-1, 1), 0, rnd(-1, 1)).setLength(7), ph: rnd(0, 6), rate: rnd(7, 10) });
    const goal = new V3(), tD = new V3(), tA = new V3(), tB = new V3(), tC = new V3(), mb = new THREE.Matrix4(), mw = new THREE.Matrix4(), mr = new THREE.Matrix4(), look4 = new THREE.Matrix4(), up = new V3(0, 1, 0);
    let flockVis = 1;
    function updateFlock(dt, t) {
      goal.set(home.x + Math.sin(t * 0.06) * (opts.flockR || 110), 42 + Math.sin(t * 0.2) * 8, home.z + Math.sin(t * 0.11) * (opts.flockR || 110) * 0.7);
      const shown = Math.round(NB * flockVis);
      for (let i = 0; i < NB; i++) {
        const b = flock[i];
        tA.set(0, 0, 0); tB.set(0, 0, 0); tC.set(0, 0, 0); let n = 0;
        for (let j = 0; j < NB; j++) {
          if (j === i) continue; const o = flock[j]; const d = b.p.distanceTo(o.p);
          if (d < 14) { tB.add(o.v); tC.add(o.p); n++; if (d < 3) tA.addScaledVector(tD.copy(b.p).sub(o.p), 1 / Math.max(d * d, 0.1)); }
        }
        if (n) { tB.multiplyScalar(1 / n).sub(b.v).multiplyScalar(0.6); tC.multiplyScalar(1 / n).sub(b.p).multiplyScalar(0.25); b.v.addScaledVector(tB, dt).addScaledVector(tC, dt); }
        b.v.addScaledVector(tA, dt * 2);
        b.v.addScaledVector(tD.copy(goal).sub(b.p).setLength(2.5), dt);
        b.v.y *= 0.98; b.v.clampLength(5, 10);
        b.p.addScaledVector(b.v, dt);
        b.ph += dt * b.rate;
        const flap = Math.sin(b.ph) * 0.9;
        look4.lookAt(tC.copy(b.p).add(b.v), b.p, up); mb.copy(look4).setPosition(b.p);
        const sc = i < shown ? 1 : 0;
        mb.scale(new V3(sc, sc, sc));
        fb.setMatrixAt(i, mb);
        mr.makeRotationZ(flap); mw.multiplyMatrices(mb, mr); fl.setMatrixAt(i, mw);
        mr.makeRotationZ(-flap); mw.multiplyMatrices(mb, mr); fr.setMatrixAt(i, mw);
      }
      fb.instanceMatrix.needsUpdate = fl.instanceMatrix.needsUpdate = fr.instanceMatrix.needsUpdate = true;
    }

    // ---------------------------------------------------------------- GPU 粒子（雨 / 雪 / 花瓣 / 落叶）
    function particleSystem(o) {
      const n = o.count, seeds = new Float32Array(n * 4);
      for (let i = 0; i < n * 4; i++) seeds[i] = Math.random();
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
      g.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 4));
      const u = { uTime: { value: 0 }, uCenter: { value: new V3() }, uArea: { value: o.area }, uHeight: { value: o.height }, uSpeed: { value: o.speed }, uSway: { value: o.sway || 0 },
        uSize: { value: o.size }, uPR: { value: 1 }, uColor: { value: new THREE.Color(o.color) }, uColor2: { value: new THREE.Color(o.color2 || o.color) }, uOpacity: { value: 0 },
        uWind: { value: new THREE.Vector2() }, uLight: { value: 1 } };
      const m = new THREE.ShaderMaterial({ uniforms: u, transparent: true, depthWrite: false,
        vertexShader: [
          "attribute vec4 aSeed; uniform float uTime, uArea, uHeight, uSpeed, uSway, uSize, uPR; uniform vec3 uCenter; uniform vec2 uWind; varying float vRot; varying float vMix;",
          "void main(){ float sp = uSpeed * (0.75 + 0.5 * aSeed.w); float y = mod(aSeed.y * uHeight - uTime * sp, uHeight);",
          " vec2 xz = aSeed.xz * uArea + uWind * (uHeight - y) * 0.12 + vec2(sin(uTime * (0.6 + aSeed.w) + aSeed.w * 40.0), cos(uTime * (0.5 + aSeed.y) + aSeed.x * 30.0)) * uSway;",
          " xz = mod(xz - uCenter.xz + uArea * 0.5, uArea) + uCenter.xz - uArea * 0.5; vRot = aSeed.w * 6.28 + uTime * (aSeed.x - 0.5) * 4.0; vMix = aSeed.z;",
          " vec4 mv = modelViewMatrix * vec4(xz.x, y + uCenter.y, xz.y, 1.0); gl_PointSize = min(uSize * uPR * (60.0 / max(-mv.z, 0.5)), 24.0 * uPR); gl_Position = projectionMatrix * mv; }",
        ].join("\n"),
        fragmentShader: [
          "uniform vec3 uColor; uniform vec3 uColor2; uniform float uOpacity; uniform float uLight; varying float vRot; varying float vMix;",
          "void main(){ vec2 c = gl_PointCoord - 0.5; float a;",
          o.shape === "streak" ? " a = (1.0 - smoothstep(0.015, 0.05, abs(c.x))) * (1.0 - smoothstep(0.25, 0.5, abs(c.y))) * (0.5 + c.y);"
            : o.shape === "petal" ? " float cs = cos(vRot), sn = sin(vRot); vec2 r = vec2(c.x*cs - c.y*sn, c.x*sn + c.y*cs); a = 1.0 - smoothstep(0.18, 0.24, length(r * vec2(1.0, 2.2)));"
            : " a = 1.0 - smoothstep(0.15, 0.5, length(c));",
          " gl_FragColor = vec4(mix(uColor, uColor2, step(0.5, vMix)) * uLight, a * uOpacity); if (gl_FragColor.a < 0.01) discard;",
          " #include <tonemapping_fragment>\n #include <colorspace_fragment>\n}",
        ].join("\n") });
      const p = new THREE.Points(g, m); p.frustumCulled = false; p.visible = false; scene.add(p); look.noReflect.push(p);
      return { points: p, u, n };
    }
    const rain = particleSystem({ count: 7000, area: 160, height: 60, speed: 32, size: 1.4, color: "#9fb0c2", shape: "streak" });
    const snow = particleSystem({ count: 5000, area: 160, height: 60, speed: 1.6, sway: 1.2, size: 0.8, color: "#f4f7fb" });
    const petals = particleSystem({ count: 900, area: 120, height: 14, speed: 0.6, sway: 1.2, size: 1.2, color: "#f3c3d3", color2: "#fbe1ea", shape: "petal" });
    const leaves = particleSystem({ count: 900, area: 120, height: 14, speed: 0.9, sway: 1.5, size: 1.4, color: "#e2b02c", color2: "#c9881f", shape: "petal" });

    const env = { night: 0, rain: 0, snow: 0, fog: 0, season: "autumn", wind: 8, quality: "clear" };
    function setEnvironment(e) { Object.assign(env, e); }
    const center = new V3();
    function update(dt, t, camera, target) {
      active = env.night < 0.6 && env.rain < 0.3 && env.snow < 0.3;
      const pr = (opts.renderer && opts.renderer.getPixelRatio()) || 1;
      center.copy(target).lerp(camera.position, 0.5); center.y = Math.max(0, camera.position.y - 30);
      [rain, snow, petals, leaves].forEach((p) => { p.u.uTime.value = t; p.u.uPR.value = pr; p.u.uCenter.value.copy(center); });
      petals.u.uCenter.value.set(target.x, 0, target.z); leaves.u.uCenter.value.set(target.x, 0, target.z);
      const day = 1 - env.night * 0.88, k = env.quality === "clear" ? 1 : env.quality === "eco" ? 0.3 : 0.55;
      const wx = (env.wind || 8) * 0.12; rain.u.uWind.value.set(wx, wx * 0.3);
      rain.points.visible = env.rain > 0.01; rain.u.uOpacity.value = 0.25 + env.rain * 0.4; rain.u.uLight.value = day * 0.9 + 0.1;
      rain.points.geometry.setDrawRange(0, Math.floor(rain.n * clamp(env.rain + 0.15, 0, 1) * k));
      snow.points.visible = env.snow > 0.01; snow.u.uOpacity.value = 0.9 * env.snow; snow.u.uLight.value = day; snow.points.geometry.setDrawRange(0, Math.floor(snow.n * k));
      const fallOK = env.rain < 0.3 && env.snow < 0.1, near = clamp((260 - camera.position.distanceTo(target)) / 120, 0, 1);
      petals.points.visible = env.season === "spring" && fallOK && near > 0; petals.u.uOpacity.value = 0.9 * near; petals.u.uLight.value = day;
      leaves.points.visible = env.season === "autumn" && fallOK && near > 0; leaves.u.uOpacity.value = 0.95 * near; leaves.u.uLight.value = day;
      flockVis += ((env.night > 0.5 || env.rain > 0.5 || env.snow > 0.5 ? 0.15 : 1) - flockVis) * Math.min(1, dt * 0.5);
      updateFlock(Math.min(dt, 0.05), t);
    }
    return {
      makeCat, makeBird, makeButterfly, catIdle, birdIdle, butterflyIdle, setEnvironment, update,
      setInds: (f) => (getInds = f), get active() { return active; }, face,
    };
  }
  global.ZKLife = { create };
})(window);
