/*
 * 生态板块 · 动植物增删编辑器（通用模块，与具体场景解耦）
 * ------------------------------------------------------------------
 * 场景只需注册：
 *   1. 物种目录 catalog：[{ key, name, type: 'plant'|'animal', icon, desc, anim, radius, make(ind) → Object3D, ... }]
 *      anim 决定动画：'tree' / 'shrub'（地面栽种：开坑土粒 → 幼苗破土 → 长成）、'aquatic'（水下冒出 + 涟漪）、
 *      'floating'（浮叶：水下浮上 + 涟漪）、'koi' / 'frog' / 'turtle' / 'dragonfly'（动物入场 / 离场，见 animals 钩子）。
 *   2. 放置规则 canPlace(entry, x, z) → { ok, reason }（如水生植物只能在水里、乔木只能在岸上）；
 *   3. 拾取 pick(raycaster) → { x, y, z } | null（射线与地面 / 水面的交点）、surfaceY(x, z) 地表高度；
 *   4. 原有个体 seeds：[{ ref: 'willow#0', key, obj, ... }]（可选中、移植、移除）；
 *   5. 钩子 hooks：attach / detach / moveTo（由场景接管的个体，如锦鲤、浮叶）、ripple / splash（水面效果）等。
 * 编辑器负责：编辑模式开关、目录选择、放置预览（合法绿 / 非法红）、选中 / 拖动移植 / 删除确认 / 撤销、
 * 栽种 / 移植 / 移除动画（土粒粒子、土球、弧线、回填、涟漪），以及保存到后端 /api/zones/{id}/species；
 * 后端不可用（503 / 网络错误）时切到 localStorage 演示模式并明确提示“演示模式，未保存到服务器”。
 * 依赖：全局 THREE。经典脚本，导出 window.SpeciesEditor。
 */
(function () {
  "use strict";
  const THREE = window.THREE;
  const V3 = THREE.Vector3;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const ease = (t) => t * t * (3 - 2 * t);
  const easeOutBack = (t) => { const c1 = 1.4, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const rnd = (a, b) => a + (b - a) * Math.random();

  const CSS = `
  .se-btn{display:inline-flex;align-items:center;gap:6px;padding:6px 10px;border-radius:9px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.08);color:#eef5f0;font:600 12px/1.2 inherit;cursor:pointer}
  .se-btn:hover{background:rgba(255,255,255,.16)} .se-btn.is-on{background:#2f8f5b;border-color:#58c08a} .se-btn[disabled]{opacity:.45;cursor:default}
  .se-btn.danger{background:rgba(220,70,70,.25);border-color:rgba(255,120,120,.45)}
  .se-panel{margin-top:8px;padding:8px;border-radius:10px;background:rgba(0,0,0,.18);font-size:12px;color:#dfe9e3}
  .se-panel[hidden]{display:none}
  .se-mode{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:6px}
  .se-cat{display:grid;grid-template-columns:repeat(4,1fr);gap:5px;margin:6px 0}
  .se-cat button{display:flex;flex-direction:column;align-items:center;gap:2px;padding:6px 2px;border-radius:8px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.06);color:#eef5f0;font-size:11px;cursor:pointer}
  .se-cat button span{font-size:18px;line-height:1} .se-cat button.is-on{border-color:#7ee2a8;background:rgba(80,190,130,.28)}
  .se-cat h4{grid-column:1/-1;margin:4px 0 0;font-size:11px;font-weight:600;color:#a9c4b4}
  .se-status{margin:6px 0 0;min-height:1.3em;color:#cfe3d7} .se-status.bad{color:#ffb3a8} .se-status.ok{color:#a6f0c3}
  .se-save{margin-top:6px;font-size:11px;color:#b9cdc1} .se-save.demo{color:#ffd27a} .se-save.err{color:#ffb3a8}
  .se-count{float:right;font-weight:700;color:#bff0d2;margin-left:6px}
  .se-confirm{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:60;min-width:260px;padding:16px 18px;border-radius:14px;background:rgba(18,28,24,.92);color:#eef5f0;box-shadow:0 18px 50px rgba(0,0,0,.45);font-size:13px}
  .se-confirm p{margin:0 0 12px} .se-confirm div{display:flex;gap:8px;justify-content:flex-end}
  .se-badge{position:fixed;left:50%;top:14px;transform:translateX(-50%);z-index:40;padding:5px 12px;border-radius:999px;background:rgba(30,110,70,.85);color:#fff;font-size:12px;pointer-events:none}
  .se-badge.demo{background:rgba(160,100,10,.9)}
  `;

  function create(opts) {
    const o = Object.assign({ hooks: {}, seeds: [], apiBase: null, zoneId: "zone", zoneName: "", storageKey: null }, opts);
    const { scene, camera, dom } = o;
    const H = o.hooks;
    const catalog = o.catalog;
    const byKey = {};
    catalog.forEach((c) => (byKey[c.key] = c));
    const storageKey = o.storageKey || "species-demo:" + o.zoneId;

    // ---------------- 状态 ----------------
    const inds = [];            // 个体：{ uid, ref, key, entry, obj, x, z, rot, scale, status, rec, seed, anim, ctl }
    let uidSeq = 1;
    const undoStack = [];
    const ED = { on: false, mode: "select", placing: null, sel: null, drag: null, saveMode: "server", canEdit: false, user: null, busy: 0 };
    const anims = new Set();
    const tmpV = new V3();

    // ---------------- 视觉辅助：预览环、选中环、土粒粒子、坑、涟漪环、土球 ----------------
    const helpers = new THREE.Group(); helpers.name = "species-editor-helpers"; scene.add(helpers);
    const ringGeo = new THREE.RingGeometry(0.86, 1, 48).rotateX(-Math.PI / 2);
    const discGeo = new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2);
    const mkBasic = (color, opacity) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, fog: false, toneMapped: false, side: THREE.DoubleSide });
    const preview = new THREE.Group();
    const pvRing = new THREE.Mesh(ringGeo, mkBasic(0x5ef59a, 0.9)), pvDisc = new THREE.Mesh(discGeo, mkBasic(0x5ef59a, 0.18));
    const pvStake = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1, 8).translate(0, 0.5, 0), mkBasic(0x5ef59a, 0.85));
    const pvTip = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.12, 12).rotateX(Math.PI).translate(0, 1.06, 0), mkBasic(0x5ef59a, 0.95));
    preview.add(pvRing, pvDisc, pvStake, pvTip); preview.visible = false; preview.renderOrder = 10; helpers.add(preview);
    const selRing = new THREE.Mesh(ringGeo, mkBasic(0xffe27a, 0.95)); selRing.visible = false; selRing.renderOrder = 10; helpers.add(selRing);
    if (o.layer != null) { helpers.traverse((x) => x.layers.set(o.layer)); }
    function setPreviewColor(ok) {
      const c = ok ? 0x5ef59a : 0xff5a4a;
      [pvRing, pvDisc, pvStake, pvTip].forEach((m) => m.material.color.setHex(c));
    }

    // 土粒粒子（实例化小块，弹道 + 重力 + 落地停住）
    const SOIL_N = 260;
    const soilMat = new THREE.MeshStandardMaterial({ color: 0x5b4330, roughness: 0.95 });
    const soilGeo = new THREE.IcosahedronGeometry(0.018, 0);
    const soil = new THREE.InstancedMesh(soilGeo, soilMat, SOIL_N); soil.count = 0; soil.frustumCulled = false; soil.castShadow = false;
    if (o.layer != null) soil.layers.set(o.layer);
    helpers.add(soil);
    const parts = [];
    const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new V3(), _p = new V3(), _e = new THREE.Euler();
    function burstSoil(x, y, z, n, power, inward) {
      for (let i = 0; i < n; i++) {
        if (parts.length >= SOIL_N) parts.shift();
        const a = Math.random() * Math.PI * 2, sp = rnd(0.4, 1.0) * power, r = inward ? rnd(0.25, 0.45) : rnd(0, 0.08);
        const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
        const v = inward ? new V3(-Math.cos(a) * sp * 0.6, rnd(0.6, 1.2) * power, -Math.sin(a) * sp * 0.6) : new V3(Math.cos(a) * sp, rnd(1.0, 1.9) * power, Math.sin(a) * sp);
        parts.push({ p: new V3(px, y + 0.02, pz), v, life: rnd(0.9, 1.5), age: 0, y0: y, s: rnd(0.6, 1.5), rot: new V3(Math.random() * 6, Math.random() * 6, 0), dark: Math.random() });
      }
    }
    function updateSoil(dt) {
      let k = 0;
      for (let i = parts.length - 1; i >= 0; i--) {
        const q = parts[i]; q.age += dt;
        if (q.age > q.life) { parts.splice(i, 1); continue; }
        if (q.p.y > q.y0 || q.v.y > 0) { q.v.y -= 6.5 * dt; q.p.addScaledVector(q.v, dt); q.rot.x += dt * 6; q.rot.y += dt * 4; }
        if (q.p.y < q.y0) { q.p.y = q.y0; q.v.set(0, 0, 0); }
      }
      for (const q of parts) {
        const fade = 1 - clamp((q.age - q.life + 0.35) / 0.35, 0, 1);
        _e.set(q.rot.x, q.rot.y, 0); _q.setFromEuler(_e); _s.setScalar(q.s * fade); _m.compose(q.p, _q, _s);
        soil.setMatrixAt(k, _m); k++;
      }
      soil.count = k; soil.instanceMatrix.needsUpdate = true;
    }
    // 坑（深色圆盘，开坑放大、回填缩小）
    const holeMat = new THREE.MeshStandardMaterial({ color: 0x2b2018, roughness: 1, transparent: true, opacity: 0.92, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    function makeHole(x, y, z, r) {
      const m = new THREE.Mesh(discGeo, holeMat.clone()); m.position.set(x, y + 0.012, z); m.scale.setScalar(0.001); m.renderOrder = 2;
      if (o.layer != null) m.layers.set(o.layer);
      helpers.add(m); m.userData.r = r; return m;
    }
    // 土球（移植 / 拔起时可见的根系土团）
    const ballMat = new THREE.MeshStandardMaterial({ color: 0x5a412c, roughness: 0.95 });
    const rootMat = new THREE.MeshStandardMaterial({ color: 0xc9b48a, roughness: 0.8 });
    function makeRootBall(r) {
      const g = new THREE.Group();
      const ball = new THREE.Mesh(new THREE.SphereGeometry(r, 18, 12), ballMat); ball.scale.set(1, 0.72, 1); ball.position.y = -r * 0.45; ball.castShadow = true; g.add(ball);
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2 + Math.random() * 0.4, len = r * rnd(0.6, 1.2);
        const pts = [new V3(Math.cos(a) * r * 0.55, -r * 0.6, Math.sin(a) * r * 0.55), new V3(Math.cos(a) * r * 0.85, -r * 0.9 - len * 0.4, Math.sin(a) * r * 0.85), new V3(Math.cos(a) * r * 0.7, -r * 1.0 - len, Math.sin(a) * r * 0.7)];
        g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 6, r * 0.05, 5, false), rootMat));
      }
      if (o.layer != null) g.traverse((x) => x.layers.set(o.layer));
      return g;
    }
    // 涟漪环（叠加在场景自己的水面涟漪之上，保证低画质也看得见）
    function ringRipple(x, y, z, r0, r1, dur) {
      const m = new THREE.Mesh(ringGeo, mkBasic(0xe6f6ff, 0.55)); m.position.set(x, y + 0.004, z); m.scale.setScalar(r0); m.renderOrder = 3;
      if (o.layer != null) m.layers.set(o.layer);
      helpers.add(m);
      play({ dur, update: (t) => { m.scale.setScalar(r0 + (r1 - r0) * ease(t)); m.material.opacity = 0.55 * (1 - t); }, end: () => { helpers.remove(m); m.material.dispose(); } });
      if (H.ripple) H.ripple(x, z, r0, r1);
    }

    // ---------------- 动画调度（可打断：同一个体的新操作先把旧动画快进到终点） ----------------
    function play(a) { a.t = 0; anims.add(a); return a; }
    function finish(a) { if (!a || !anims.has(a)) return; anims.delete(a); try { if (a.update) a.update(1); if (a.end) a.end(); } catch (e) { console.warn(e); } }
    function interrupt(ind) { if (ind && ind.anim) { const a = ind.anim; ind.anim = null; finish(a); } }
    function update(dt) {
      dt = Math.min(dt, 0.1);
      for (const a of Array.from(anims)) {
        a.t = Math.min(1, a.t + dt / a.dur);
        try { a.update && a.update(a.t, dt); } catch (e) { console.warn(e); anims.delete(a); continue; }
        if (a.t >= 1) { anims.delete(a); try { a.end && a.end(); } catch (e) { console.warn(e); } }
      }
      updateSoil(dt);
      for (const ind of inds) if (ind.status === "active" && !ind.anim && ind.entry.idle) ind.entry.idle(ind, dt);
      if (ED.sel && ED.sel.obj) {
        const r = selRadius(ED.sel);
        selRing.visible = ED.on; selRing.position.set(ED.sel.x, o.surfaceY(ED.sel.x, ED.sel.z) + 0.02, ED.sel.z); selRing.scale.setScalar(r);
        selRing.material.opacity = 0.65 + 0.3 * Math.sin(performance.now() / 180);
      } else selRing.visible = false;
    }
    const selRadius = (ind) => (ind.entry.radius || 0.4) * (ind.scale || 1);

    // ---------------- 个体管理 ----------------
    function addInd(d) {
      const ind = Object.assign({ uid: uidSeq++, rot: 0, scale: 1, status: "active", anim: null, rec: null }, d);
      ind.entry = byKey[ind.key];
      inds.push(ind); return ind;
    }
    function attachNew(ind, instant) {
      const e = ind.entry;
      if (e.spawn) { e.spawn(ind, instant); return; }      // 由场景接管的个体（锦鲤、浮叶…）
      ind.obj = e.make(ind);
      ind.obj.position.set(ind.x, o.surfaceY(ind.x, ind.z, e), ind.z);
      ind.obj.rotation.y = ind.rot; ind.obj.scale.setScalar(ind.scale);
      ind.obj.userData.speciesUid = ind.uid;
      (H.add || ((x) => scene.add(x)))(ind.obj, ind);
    }
    function detachObj(ind) {
      const e = ind.entry;
      if (e.despawn) { e.despawn(ind); return; }
      if (ind.obj) { (H.remove || ((x) => x.parent && x.parent.remove(x)))(ind.obj, ind); }
    }
    function setPos(ind, x, z) {
      ind.x = x; ind.z = z;
      if (ind.entry.moveTo) ind.entry.moveTo(ind, x, z);
      else if (ind.obj) ind.obj.position.set(x, o.surfaceY(x, z, ind.entry), z);
    }
    function counts() {
      const c = {};
      for (const ind of inds) if (ind.status === "active") c[ind.key] = (c[ind.key] || 0) + (ind.quantity || 1);
      return c;
    }

    // ---------------- 动画：栽种 / 移植 / 移除 / 动物入场离场 ----------------
    function animPlant(ind, done) {
      const e = ind.entry, x = ind.x, z = ind.z, gy = o.surfaceY(x, z, e), S = ind.scale || 1, obj = ind.obj;
      const anim = e.anim;
      if (anim === "aquatic" || anim === "floating") {
        // 水生：从水下冒出 + 涟漪
        const y1 = obj.position.y, y0 = y1 - (anim === "floating" ? 0.25 : 0.5);
        obj.position.y = y0; obj.scale.setScalar(S * 0.3);
        ringRipple(x, gy, z, 0.1, 0.9 * S, 1.8);
        if (H.splash) H.splash(x, z, 0.35);
        let r2 = false;
        return play({ dur: 2.0, update: (t) => {
          const k = ease(clamp(t / 0.75, 0, 1));
          obj.position.y = y0 + (y1 - y0) * k;
          obj.scale.setScalar(S * (0.3 + 0.7 * easeOutBack(clamp((t - 0.2) / 0.8, 0, 1))));
          if (t > 0.45 && !r2) { r2 = true; ringRipple(x, gy, z, 0.15, 0.6 * S, 1.2); }
        }, end: () => { obj.position.y = y1; obj.scale.setScalar(S); done && done(); } });
      }
      // 地面：开坑（土粒飞溅）→ 幼苗破土 → 长成；坑随后回填
      const hr = (e.radius || 0.4) * 0.55 * S, hole = makeHole(x, gy, z, hr);
      obj.scale.set(0.0001, 0.0001, 0.0001);
      const H0 = obj.position.y;
      let burst1 = false, burst2 = false;
      return play({ dur: e.plantDur || 2.6, update: (t) => {
        // 0~0.3 开坑
        const dig = ease(clamp(t / 0.25, 0, 1));
        hole.scale.setScalar(Math.max(0.001, hr * dig * (1 - 0.85 * ease(clamp((t - 0.7) / 0.3, 0, 1)))));
        hole.material.opacity = 0.92 * (1 - 0.6 * clamp((t - 0.8) / 0.2, 0, 1));
        if (!burst1 && t > 0.02) { burst1 = true; burstSoil(x, gy, z, 40, 1.0); }
        if (!burst2 && t > 0.68) { burst2 = true; burstSoil(x, gy, z, 26, 0.6, true); }   // 回填
        // 0.28~0.5 幼苗破土（细高、从地下升起）
        const sprout = ease(clamp((t - 0.28) / 0.22, 0, 1));
        const grow = easeOutBack(clamp((t - 0.48) / 0.52, 0, 1));
        const sxz = S * (0.06 + 0.12 * sprout + 0.82 * grow), sy = S * (0.04 + 0.2 * sprout + 0.76 * grow);
        obj.scale.set(sxz, sy, sxz);
        obj.position.y = H0 - (1 - sprout) * 0.15;
        obj.rotation.z = Math.sin(t * 18) * 0.04 * (1 - t);
      }, end: () => { obj.scale.setScalar(S); obj.position.y = H0; obj.rotation.z = 0; helpers.remove(hole); hole.material.dispose(); done && done(); } });
    }
    function animRemovePlant(ind, done) {
      const e = ind.entry, obj = ind.obj, x = ind.x, z = ind.z, gy = o.surfaceY(x, z, e), S = obj ? obj.scale.x : 1;
      if (!obj) { done && done(); return null; }
      if (e.anim === "aquatic" || e.anim === "floating") {
        const y0 = obj.position.y;
        ringRipple(x, gy, z, 0.1, 0.8 * S, 1.6);
        return play({ dur: 1.8, update: (t) => { obj.position.y = y0 - 0.45 * ease(t); obj.scale.setScalar(S * (1 - 0.9 * ease(clamp((t - 0.2) / 0.8, 0, 1)))); },
          end: () => { obj.scale.setScalar(S); obj.position.y = y0; done && done(); } });
      }
      // 连根拔起：土球露出 → 向上提起并缩小淡出 → 坑回填
      const h = obj.userData.height || 2;
      const ball = makeRootBall(clamp((e.radius || 0.4) * 0.45, 0.12, 0.5)); obj.add(ball); ball.scale.setScalar(1 / Math.max(S, 0.01));
      const hole = makeHole(x, gy, z, (e.radius || 0.4) * 0.5 * S); const Y0 = obj.position.y;
      let b1 = false, b2 = false;
      return play({ dur: 2.2, update: (t) => {
        if (!b1) { b1 = true; burstSoil(x, gy, z, 34, 0.9); }
        const lift = ease(clamp(t / 0.55, 0, 1));
        obj.position.y = Y0 + lift * Math.min(1.2, 0.35 + h * 0.18);
        obj.rotation.z = 0.25 * lift;
        obj.scale.setScalar(S * (1 - ease(clamp((t - 0.45) / 0.55, 0, 1)) * 0.999));
        hole.scale.setScalar(Math.max(0.001, (e.radius || 0.4) * 0.5 * S * (t < 0.6 ? ease(clamp(t / 0.2, 0, 1)) : 1 - ease((t - 0.6) / 0.4))));
        if (!b2 && t > 0.62) { b2 = true; burstSoil(x, gy, z, 24, 0.55, true); }
      }, end: () => { obj.remove(ball); helpers.remove(hole); hole.material.dispose(); obj.scale.setScalar(S); obj.position.y = Y0; obj.rotation.z = 0; done && done(); } });
    }
    function animTransplant(ind, x1, z1, done) {
      const e = ind.entry, obj = ind.obj, x0 = ind.x, z0 = ind.z;
      if (e.transplant) return e.transplant(ind, x1, z1, done, api);      // 场景自定义（锦鲤游过去、浮叶漂过去）
      if (!obj) { setPos(ind, x1, z1); done && done(); return null; }
      if (e.detach) e.detach(ind);
      const g0 = o.surfaceY(x0, z0, e), g1 = o.surfaceY(x1, z1, e), S = obj.scale.x, h = obj.userData.height || 1.2;
      const aquatic = e.anim === "aquatic" || e.anim === "floating";
      const lift = aquatic ? 0.55 : Math.min(1.4, 0.45 + h * 0.2), Y0 = obj.position.y, Y1 = Y0 - g0 + g1;
      const ball = aquatic ? null : makeRootBall(clamp((e.radius || 0.4) * 0.45, 0.12, 0.5));
      if (ball) { obj.add(ball); ball.scale.setScalar(1 / Math.max(S, 0.01)); }
      const hole0 = aquatic ? null : makeHole(x0, g0, z0, (e.radius || 0.4) * 0.5 * S);
      const hole1 = aquatic ? null : makeHole(x1, g1, z1, (e.radius || 0.4) * 0.5 * S);
      if (aquatic) { ringRipple(x0, g0, z0, 0.1, 0.7, 1.4); if (H.splash) H.splash(x0, z0, 0.3); }
      else burstSoil(x0, g0, z0, 30, 0.85);
      let landed = false, fill = false;
      const ctrl = new V3((x0 + x1) / 2, Math.max(Y0, Y1) + lift * 1.6, (z0 + z1) / 2);
      return play({ dur: e.moveDur || 2.6, update: (t) => {
        // 0~0.2 提起（土球露出）；0.2~0.75 沿弧线移动；0.75~0.9 落下；0.9~1 回填
        const up = ease(clamp(t / 0.2, 0, 1)), mv = ease(clamp((t - 0.2) / 0.55, 0, 1)), down = ease(clamp((t - 0.75) / 0.15, 0, 1));
        let px, py, pz;
        if (t < 0.2) { px = x0; pz = z0; py = Y0 + lift * up; }
        else if (t < 0.75) {
          const a = new V3(x0, Y0 + lift, z0), b = new V3(x1, Y1 + lift, z1), u = mv;
          px = (1 - u) * (1 - u) * a.x + 2 * (1 - u) * u * ctrl.x + u * u * b.x; py = (1 - u) * (1 - u) * a.y + 2 * (1 - u) * u * ctrl.y + u * u * b.y; pz = (1 - u) * (1 - u) * a.z + 2 * (1 - u) * u * ctrl.z + u * u * b.z;
        } else { px = x1; pz = z1; py = Y1 + lift * (1 - down); }
        obj.position.set(px, py, pz);
        obj.rotation.z = Math.sin(t * Math.PI) * 0.12; obj.rotation.x = Math.sin(t * Math.PI * 2) * 0.05;
        if (hole0) { hole0.scale.setScalar(Math.max(0.001, hole0.userData.r * (t < 0.5 ? up : 1 - ease(clamp((t - 0.5) / 0.4, 0, 1))))); }
        if (hole1) { hole1.scale.setScalar(Math.max(0.001, hole1.userData.r * (t < 0.6 ? ease(clamp((t - 0.4) / 0.2, 0, 1)) : 1 - ease(clamp((t - 0.88) / 0.12, 0, 1))))); }
        if (!landed && t >= 0.9) {
          landed = true;
          if (aquatic) { ringRipple(x1, g1, z1, 0.1, 0.8, 1.4); if (H.splash) H.splash(x1, z1, 0.35); }
          else burstSoil(x1, g1, z1, 26, 0.5, true);
        }
        if (!fill && t > 0.5 && !aquatic) { fill = true; burstSoil(x0, g0, z0, 18, 0.45, true); }
      }, end: () => {
        if (ball) obj.remove(ball);
        [hole0, hole1].forEach((hh) => { if (hh) { helpers.remove(hh); hh.material.dispose(); } });
        obj.rotation.z = obj.rotation.x = 0;
        setPos(ind, x1, z1);
        if (e.attach) e.attach(ind);
        done && done();
      } });
    }
    function animEnter(ind, done) {
      const e = ind.entry;
      if (e.enter) return e.enter(ind, done, api);
      return animPlant(ind, done);
    }
    function animExit(ind, done) {
      const e = ind.entry;
      if (e.exit) return e.exit(ind, done, api);
      return animRemovePlant(ind, done);
    }

    // ---------------- 持久化：后端 / localStorage 演示模式 ----------------
    const API = o.apiBase ? o.apiBase.replace(/\/?$/, "/") + encodeURIComponent(o.zoneId) + "/species" : null;
    async function http(method, url, body) {
      const r = await fetch(url, { method, credentials: "same-origin", headers: body ? { "Content-Type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined });
      let j = null; try { j = await r.json(); } catch (e) { /* not json */ }
      if (!r.ok) { const err = new Error((j && j.message) || "HTTP " + r.status); err.status = r.status; err.code = j && j.error; throw err; }
      return j;
    }
    function demoLoad() { try { return JSON.parse(localStorage.getItem(storageKey) || "[]"); } catch (e) { return []; } }
    function demoSave() {
      const rows = inds.filter((i) => !i.seed || i.dirtySeed || i.status !== "active").map(recOf);
      try { localStorage.setItem(storageKey, JSON.stringify(rows)); } catch (e) { /* quota */ }
    }
    function recOf(ind) {
      return { id: ind.rec && ind.rec.id || null, species_type: ind.entry.type, species_key: ind.key, species_name: ind.entry.name, seed_ref: ind.seed ? ind.ref : null,
        quantity: ind.quantity || 1, x: +ind.x.toFixed(3), z: +ind.z.toFixed(3), rotation: +(ind.rot || 0).toFixed(3), scale: +(ind.scale || 1).toFixed(3), status: ind.status };
    }
    function setSaveMode(m, msg) {
      ED.saveMode = m;
      if (ui.save) {
        ui.save.className = "se-save " + (m === "demo" ? "demo" : m === "error" ? "err" : "");
        ui.save.textContent = msg || (m === "demo" ? "⚠ 演示模式，未保存到服务器（仅保存在本浏览器）" : m === "server" ? "已连接服务器：修改会实时保存" : "");
      }
      if (ui.badge) { ui.badge.classList.toggle("demo", m === "demo"); ui.badge.textContent = m === "demo" ? "演示模式 · 未保存到服务器" : "编辑模式 · 保存到服务器"; }
    }
    async function persist(ind, op) {
      if (ED.saveMode === "demo" || !API) { demoSave(); return; }
      try {
        let r;
        if (op === "delete" && ind.rec && ind.rec.id) r = await http("DELETE", API + "/" + ind.rec.id);
        else if (ind.rec && ind.rec.id) r = await http("PUT", API + "/" + ind.rec.id, recOf(ind));
        else r = await http("POST", API, recOf(ind));
        if (r && r.item) ind.rec = r.item;
        setSaveMode("server", "已保存到服务器 · " + new Date().toLocaleTimeString("zh-CN", { hour12: false }));
      } catch (err) {
        if (err.status === 401 || err.status === 403) {
          setSaveMode("demo", "⚠ " + err.message + " —— 已切到演示模式，未保存到服务器");
        } else setSaveMode("demo", "⚠ 服务器保存失败（" + err.message + "）—— 演示模式，未保存到服务器");
        demoSave();
      }
    }
    // 读取状态并应用到场景（进入板块时恢复）
    async function load() {
      let rows = null;
      if (API) {
        try {
          const j = await http("GET", API);
          rows = j.items || []; ED.canEdit = !!j.can_edit; ED.user = j.user;
          ED.saveMode = j.can_edit ? "server" : "demo";
          ED.serverReason = j.can_edit ? "" : (j.user ? "当前账号无编辑权限" : "未登录（管理员 / 养护员登录后可保存到服务器）");
        } catch (err) { rows = null; ED.saveMode = "demo"; ED.serverReason = err.status === 503 ? "数据库不可用" : "无法连接服务器"; }
      } else { ED.saveMode = "demo"; ED.serverReason = "静态页面（无后端）"; }
      if (rows === null || ED.saveMode === "demo") {
        // 服务器的数据始终优先显示；演示模式的本地修改叠加在后面
        const local = demoLoad();
        rows = (rows || []).concat(local.map((r) => Object.assign({ _local: true }, r)));
      }
      applyRows(rows);
      return rows.length;
    }
    function applyRows(rows) {
      const seedMap = {};
      for (const s of inds) if (s.seed) seedMap[s.ref] = s;
      for (const r of rows) {
        if (!byKey[r.species_key]) continue;
        if (r.seed_ref) {
          const s = seedMap[r.seed_ref]; if (!s) continue;
          if (!r._local) s.rec = r;
          if (r.status === "removed") { if (s.status === "active") { s.status = "removed"; detachObj(s); } }
          else if (Math.abs(r.x - s.x) > 1e-3 || Math.abs(r.z - s.z) > 1e-3) { s.dirtySeed = true; setPos(s, r.x, r.z); }
          continue;
        }
        if (r.status === "removed") continue;
        const ind = addInd({ ref: "new#" + (r.id || uidSeq), key: r.species_key, x: r.x, z: r.z, rot: r.rotation || 0, scale: r.scale || 1, quantity: r.quantity || 1, rec: r._local ? null : r, local: !!r._local });
        attachNew(ind, true);
      }
      refreshCounts();
    }

    // ---------------- 操作（带撤销） ----------------
    function opAdd(key, x, z, fromUndo) {
      const e = byKey[key];
      const ind = addInd({ ref: "new#" + uidSeq, key, x, z, rot: Math.random() * Math.PI * 2, scale: e.scaleRange ? rnd(e.scaleRange[0], e.scaleRange[1]) : 1 });
      attachNew(ind, false);
      ind.anim = animEnter(ind, () => { ind.anim = null; });
      if (!fromUndo) undoStack.push({ type: "add", ind });
      persist(ind, "add"); refreshCounts();
      status("已" + (e.type === "animal" ? "放入" : "栽种") + "：" + e.name, "ok");
      return ind;
    }
    function opRemove(ind, fromUndo) {
      interrupt(ind);
      ind.status = "removed";
      if (ED.sel === ind) select(null);
      ind.anim = animExit(ind, () => { ind.anim = null; if (ind.status === "removed") detachObj(ind); });
      if (!fromUndo) undoStack.push({ type: "remove", ind });
      persist(ind, "delete"); refreshCounts();
      status("已移除：" + ind.entry.name, "ok");
    }
    function opRestore(ind) {      // 撤销移除
      interrupt(ind);
      ind.status = "active";
      if (ind.entry.spawn || !ind.obj || !ind.obj.parent) attachNew(ind, false);
      else if (ind.obj) { ind.obj.scale.setScalar(ind.scale || 1); setPos(ind, ind.x, ind.z); }
      ind.anim = animEnter(ind, () => { ind.anim = null; });
      persist(ind, "update"); refreshCounts();
    }
    function opMove(ind, x, z, fromUndo) {
      interrupt(ind);
      const from = [ind.x, ind.z];
      ind.anim = animTransplant(ind, x, z, () => { ind.anim = null; });
      ind.x = x; ind.z = z; if (ind.seed) ind.dirtySeed = true;
      if (!fromUndo) undoStack.push({ type: "move", ind, from });
      persist(ind, "update");
      status("已移植：" + ind.entry.name, "ok");
    }
    function undo() {
      const u = undoStack.pop();
      if (!u) { status("没有可撤销的操作"); return; }
      if (u.type === "add") opRemove(u.ind, true);
      else if (u.type === "remove") opRestore(u.ind);
      else if (u.type === "move") opMove(u.ind, u.from[0], u.from[1], true);
      status("已撤销上一步", "ok"); refreshUndo();
    }

    // ---------------- 拾取 ----------------
    const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
    function rayAt(ev) {
      const r = dom.getBoundingClientRect();
      ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      return ray;
    }
    function hitInd(rc) {
      let best = null, bd = Infinity;
      for (const ind of inds) {
        if (ind.status !== "active") continue;
        const c = ind.entry.center ? ind.entry.center(ind, tmpV) : tmpV.set(ind.x, o.surfaceY(ind.x, ind.z, ind.entry) + (ind.entry.hitY || 0.3) * (ind.scale || 1), ind.z);
        const r = (ind.entry.hitRadius || ind.entry.radius || 0.4) * (ind.scale || 1);
        const d2 = rc.ray.distanceSqToPoint(c);
        if (d2 > r * r) continue;
        const along = c.distanceTo(rc.ray.origin);
        if (along < bd) { bd = along; best = ind; }
      }
      return best;
    }
    function checkPlace(entry, x, z, ignore) {
      const res = o.canPlace(entry, x, z) || { ok: false, reason: "不可放置" };
      if (!res.ok) return res;
      const r = entry.radius || 0.4;
      for (const ind of inds) {
        if (ind === ignore || ind.status !== "active" || entry.type === "animal" || ind.entry.type === "animal") continue;
        const rr2 = Math.min(r, ind.entry.radius || 0.4) * 0.9;
        if (Math.hypot(ind.x - x, ind.z - z) < rr2) return { ok: false, reason: "离「" + ind.entry.name + "」太近" };
      }
      return res;
    }

    // ---------------- 指针事件（编辑模式下优先于场景镜头控制） ----------------
    let down = null;
    function onDown(ev) {
      if (!ED.on || ev.target !== dom || ev.button !== 0) return;
      const rc = rayAt(ev);
      down = { x: ev.clientX, y: ev.clientY, t: performance.now() };
      if (ED.mode === "add") { ev.stopImmediatePropagation(); down.consumed = true; return; }
      const hit = hitInd(rc);
      if (hit && (ED.mode === "move" || ED.mode === "select")) {
        select(hit);
        if (hit.entry.movable !== false) { ED.drag = { ind: hit, moved: false }; }
        ev.stopImmediatePropagation(); down.consumed = true;
      }
    }
    function onMove(ev) {
      if (!ED.on) return;
      const rc = rayAt(ev);
      if (ED.mode === "add" && ED.placing) {
        const p = o.pick(rc);
        if (!p) { preview.visible = false; return; }
        const res = checkPlace(ED.placing, p.x, p.z);
        showPreview(ED.placing, p, res);
        return;
      }
      if (ED.drag) {
        if (!ED.drag.moved && down && Math.hypot(ev.clientX - down.x, ev.clientY - down.y) < 6) return;
        ED.drag.moved = true;
        const p = o.pick(rc); if (!p) return;
        const res = checkPlace(ED.drag.ind.entry, p.x, p.z, ED.drag.ind);
        showPreview(ED.drag.ind.entry, p, res);
        ED.drag.target = res.ok ? p : null; ED.drag.reason = res.reason;
        ev.stopImmediatePropagation();
        return;
      }
      if (ED.mode !== "add") dom.style.cursor = hitInd(rc) ? "pointer" : "";
    }
    function onUp(ev) {
      if (!ED.on || !down) return;
      const click = Math.hypot(ev.clientX - down.x, ev.clientY - down.y) < 6;
      const consumed = down.consumed; down = null;
      if (ED.mode === "add" && ED.placing && click) {
        const p = o.pick(rayAt(ev));
        if (p) {
          const res = checkPlace(ED.placing, p.x, p.z);
          if (res.ok) opAdd(ED.placing.key, p.x, p.z); else status("这里不能放「" + ED.placing.name + "」：" + res.reason, "bad");
        }
        ev.stopImmediatePropagation(); return;
      }
      if (ED.drag) {
        const d = ED.drag; ED.drag = null; preview.visible = false;
        if (d.moved) {
          if (d.target) opMove(d.ind, d.target.x, d.target.z);
          else status("移植失败：" + (d.reason || "目标位置不合适"), "bad");
        }
        ev.stopImmediatePropagation(); return;
      }
      if (consumed) ev.stopImmediatePropagation();
    }
    function showPreview(entry, p, res) {
      preview.visible = true; setPreviewColor(res.ok);
      const r = entry.radius || 0.4;
      preview.position.set(p.x, p.y + 0.015, p.z);
      pvRing.scale.setScalar(r); pvDisc.scale.setScalar(r);
      const h = entry.previewH || (entry.type === "animal" ? 0.35 : 0.8);
      pvStake.scale.set(1, h, 1); pvTip.position.y = h - 1;
      status(res.ok ? "可以放在这里（点击" + (ED.drag ? "松开" : "") + "确定）" : "不能放这里：" + res.reason, res.ok ? "ok" : "bad");
    }
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("pointermove", onMove, true);
    window.addEventListener("pointerup", onUp, true);
    window.addEventListener("keydown", (ev) => {
      if (!ED.on) return;
      if ((ev.ctrlKey || ev.metaKey) && ev.code === "KeyZ") { ev.preventDefault(); undo(); }
      else if ((ev.code === "Delete" || ev.code === "Backspace") && ED.sel) { ev.preventDefault(); askRemove(ED.sel); }
      else if (ev.code === "Escape") { setMode("select"); }
    }, true);

    // ---------------- 界面 ----------------
    const ui = {};
    function buildUI(host, toggleHost) {
      if (!document.getElementById("se-style")) { const st = document.createElement("style"); st.id = "se-style"; st.textContent = CSS; document.head.appendChild(st); }
      const tb = document.createElement("button"); tb.type = "button"; tb.className = "se-btn"; tb.id = "se-toggle"; tb.textContent = "✏️ 管理动植物";
      tb.title = "增删 / 移植本板块的动植物（管理员、养护员登录后保存到服务器）";
      tb.onclick = () => toggle(); (toggleHost || host).appendChild(tb); ui.toggle = tb;
      const p = document.createElement("div"); p.className = "se-panel"; p.id = "se-panel"; p.hidden = true;
      const groups = [["plant", "🌿 植物"], ["animal", "🐟 动物"]];
      p.innerHTML =
        '<div class="se-mode"><button type="button" class="se-btn" data-m="add">＋ 新增</button><button type="button" class="se-btn" data-m="move">↔ 移植</button>' +
        '<button type="button" class="se-btn danger" id="se-del" disabled>🗑 删除</button><button type="button" class="se-btn" id="se-undo" disabled>↶ 撤销</button></div>' +
        '<div class="se-cat" id="se-cat">' + groups.map(([t, title]) => '<h4>' + title + '</h4>' + catalog.filter((c) => c.type === t && !c.hidden).map((c) =>
          '<button type="button" data-k="' + esc(c.key) + '" title="' + esc(c.desc || c.name) + '"><span>' + esc(c.icon || "•") + '</span>' + esc(c.name) + '<b class="se-count" data-c="' + esc(c.key) + '"></b></button>').join("")).join("") + "</div>" +
        '<p class="se-status" id="se-status">选择“新增”后点目录里的物种，再点场景放下；或点中已有个体拖动移植。</p><p class="se-save" id="se-save"></p>';
      host.appendChild(p); ui.panel = p;
      ui.status = p.querySelector("#se-status"); ui.save = p.querySelector("#se-save"); ui.undo = p.querySelector("#se-undo"); ui.del = p.querySelector("#se-del");
      p.querySelectorAll("[data-m]").forEach((b) => (b.onclick = () => setMode(b.getAttribute("data-m"))));
      p.querySelectorAll("[data-k]").forEach((b) => (b.onclick = () => { setMode("add"); choose(b.getAttribute("data-k")); }));
      ui.undo.onclick = undo; ui.del.onclick = () => ED.sel && askRemove(ED.sel);
      const badge = document.createElement("div"); badge.className = "se-badge"; badge.hidden = true; document.body.appendChild(badge); ui.badge = badge;
      refreshCounts();
    }
    function status(msg, cls) { if (ui.status) { ui.status.textContent = msg; ui.status.className = "se-status" + (cls ? " " + cls : ""); } }
    function refreshUndo() { if (ui.undo) ui.undo.disabled = !undoStack.length; }
    function refreshCounts() {
      const c = counts();
      if (ui.panel) ui.panel.querySelectorAll("[data-c]").forEach((b) => { const n = c[b.getAttribute("data-c")] || 0; b.textContent = n ? "×" + n : ""; });
      refreshUndo();
      if (o.onCounts) o.onCounts(c, inds);
    }
    function choose(key) {
      ED.placing = byKey[key] || null;
      ui.panel.querySelectorAll("[data-k]").forEach((b) => b.classList.toggle("is-on", b.getAttribute("data-k") === key));
      if (ED.placing) status("移动鼠标选择位置：绿色可放，红色不可放。" + (ED.placing.rule ? "（" + ED.placing.rule + "）" : ""));
    }
    function setMode(m) {
      ED.mode = m; ED.drag = null; preview.visible = false;
      if (m !== "add") { ED.placing = null; ui.panel && ui.panel.querySelectorAll("[data-k]").forEach((b) => b.classList.remove("is-on")); }
      ui.panel && ui.panel.querySelectorAll("[data-m]").forEach((b) => b.classList.toggle("is-on", b.getAttribute("data-m") === m));
      if (m === "move") status("点中要移植的个体，按住拖到新位置后松开。");
      if (m === "add" && !ED.placing) status("从目录里选一个物种。");
    }
    function select(ind) {
      ED.sel = ind;
      if (ui.del) ui.del.disabled = !ind;
      if (ind) status("已选中：" + ind.entry.name + (ind.seed ? "（场景原有）" : "") + " · 拖动可移植，按 Delete 或“删除”移除");
    }
    function askRemove(ind) {
      const box = document.createElement("div"); box.className = "se-confirm";
      box.innerHTML = "<p>确定移除这" + (ind.entry.type === "animal" ? "只" : "株") + "「" + esc(ind.entry.name) + "」吗？可以用“撤销”恢复。</p><div><button type=button class='se-btn' data-x=0>取消</button><button type=button class='se-btn danger' data-x=1>移除</button></div>";
      document.body.appendChild(box);
      box.querySelectorAll("button").forEach((b) => (b.onclick = () => { box.remove(); if (b.getAttribute("data-x") === "1") opRemove(ind); }));
    }
    function toggle(force) {
      ED.on = force != null ? !!force : !ED.on;
      ui.toggle.classList.toggle("is-on", ED.on); ui.toggle.textContent = ED.on ? "✔ 完成编辑" : "✏️ 管理动植物";
      ui.panel.hidden = !ED.on; ui.badge.hidden = !ED.on;
      if (!ED.on) { setMode("select"); select(null); preview.visible = false; dom.style.cursor = ""; }
      else {
        setSaveMode(ED.saveMode, ED.saveMode === "demo" ? "⚠ 演示模式，未保存到服务器（" + (ED.serverReason || "无法保存") + "；修改只保存在本浏览器）" : null);
        setMode("add");
      }
      if (H.onToggle) H.onToggle(ED.on);
    }

    // ---------------- 原有个体登记 ----------------
    for (const s of o.seeds) addInd(Object.assign({ seed: true }, s));

    const api = {
      ED, inds, catalog, update, load, toggle, undo, setMode, choose, select, counts, buildUI,
      add: opAdd, remove: opRemove, move: opMove, askRemove,
      helpers: { burstSoil, ringRipple, makeHole, makeRootBall, play, ease, easeOutBack, clamp },
      byKey,
    };
    return api;
  }

  window.SpeciesEditor = { create };
})();
