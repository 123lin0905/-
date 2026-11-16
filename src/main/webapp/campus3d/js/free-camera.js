/*
 * campus3d/js/free-camera.js —— 三个三维场景共用的“自由镜头”（校园全景 ecohome、池塘细节 pond、中心草坪 lawn）
 *
 * 模型：一个可在地面上任意移动的观察点（target）+ 球坐标（距离 r、极角 phi、方位角 theta），相机始终看向观察点。
 *   左键拖动          旋转（绕观察点）
 *   右键拖动 / Shift 或 Ctrl + 左键拖动   平移观察点（沿地面，“抓住地面拖”的手感）
 *   滚轮              朝光标所指位置缩放
 *   WASD / 方向键     水平移动观察点（按镜头朝向），Shift 加速
 *   Q / E（PageDown / PageUp，空格上升）  降低 / 升高
 *   双击地面 / 水面    平滑飞过去并聚焦
 *   触屏              单指旋转、双指捏合缩放 + 平移
 * 限位：观察点在场景范围内（bounds）、相机在 camBounds 内、相机高于 floor(x, z)（地面 / 水面 + 余量），
 *       距离 [minDistance, maxDistance]，极角 [minPolar, maxPolar]（不会转到地面以下）；可选 losGround 检查视线不穿过地形。
 * 其他代码（飞行动画、巡游、电影镜头）直接改了 camera.position / target 时，下一次 update 自动从当前画面接管，不跳变；
 * 接管时若当前状态超出限位（例如近景特写比最小距离还近、从水下视角接管），限位暂时放宽到当前值，用户往回操作时再逐步收紧。
 * 每帧不分配对象（全部复用预先创建的向量）。
 * 用法：const fc = FreeCam.create({ THREE, camera, dom, target, ... }); 每帧 fc.update(dt)。
 */
(function () {
  "use strict";
  const MOVE_KEYS = {
    KeyW: "f", ArrowUp: "f", KeyS: "b", ArrowDown: "b", KeyA: "l", ArrowLeft: "l", KeyD: "r", ArrowRight: "r",
    KeyE: "u", PageUp: "u", Space: "u", KeyQ: "d", PageDown: "d",
  };
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  function create(o) {
    const THREE = o.THREE || window.THREE, cam = o.camera, dom = o.dom;
    const target = o.target || new THREE.Vector3();
    const opt = Object.assign({
      minDistance: 1, maxDistance: 100, minPolar: 0.05, maxPolar: 1.45,
      rotateSpeed: 1, panSpeed: 1, zoomSpeed: 1, smooth: 12, focusSmooth: 3.2,
      keys: true, dblclick: true, losSamples: 5, keyMap: null,
    }, o);
    const B = opt.bounds || null, CB = opt.camBounds || null;
    const keyMap = Object.assign({}, MOVE_KEYS, opt.keyMap || {});
    for (const k in keyMap) if (!keyMap[k]) delete keyMap[k];
    const enabled = typeof opt.enabled === "function" ? opt.enabled : () => opt.enabled !== false;

    // 当前（显示用）与目标（输入写入）状态
    const cur = { r: 10, phi: 1, theta: 0 }, goal = { r: 10, phi: 1, theta: 0 };
    const goalT = target.clone();
    const soft = { rMin: opt.minDistance, rMax: opt.maxDistance, phiMin: opt.minPolar, phiMax: opt.maxPolar, slack: 0 };
    const lastCam = new THREE.Vector3(), lastT = new THREE.Vector3();
    const off = new THREE.Vector3(), v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), hit = new THREE.Vector3();
    const sph = new THREE.Spherical(), ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
    const keys = Object.create(null);
    const listeners = { start: [], change: [] };
    let written = false, focusing = false, lastInput = 0;
    let drag = null;                                   // { mode, id, x, y }
    const touches = new Map();                         // pointerId -> {x, y}
    let pinch = null;                                  // { d, mx, my }

    function emit(type) { for (const f of listeners[type]) f({ type, target: api }); }
    function userStart() { focusing = false; lastInput = performance.now(); emit("start"); if (opt.onStart) opt.onStart(); }

    function floorAt(x, z) { return opt.floor ? opt.floor(x, z) : -Infinity; }
    function tFloorAt(x, z) { return opt.targetFloor ? opt.targetFloor(x, z) : (B && B.minY !== undefined ? B.minY : -Infinity); }

    // 从相机正前方取观察点（池塘：其他镜头只改相机，不维护 target）
    function deriveTarget() {
      cam.updateMatrixWorld();                         // 别的镜头刚改过 position / quaternion，矩阵可能还没更新
      ndc.set(0, 0); ray.setFromCamera(ndc, cam);
      const p = opt.pick ? opt.pick(ray, hit) : null;
      let d = p ? p.distanceTo(cam.position) : (opt.defaultFocus || opt.minDistance * 4);
      d = clamp(d, Math.max(opt.minDistance, 0.05), opt.deriveMax || opt.maxDistance * 0.6);
      target.copy(cam.position).addScaledVector(ray.ray.direction, d);
    }
    function syncFromCamera(derive) {
      if (derive) deriveTarget();
      off.subVectors(cam.position, target);
      if (off.lengthSq() < 1e-10) off.set(0, 1e-3, 1e-3);
      sph.setFromVector3(off);
      cur.r = goal.r = sph.radius; cur.phi = goal.phi = sph.phi; cur.theta = goal.theta = sph.theta;
      goalT.copy(target);
      // 接管时放宽限位到当前值（例如特写比最小距离还近、仰视），之后只收紧不放宽
      soft.rMin = Math.min(opt.minDistance, cur.r); soft.rMax = Math.max(opt.maxDistance, cur.r);
      soft.phiMin = Math.min(opt.minPolar, cur.phi); soft.phiMax = Math.max(opt.maxPolar, cur.phi);
      soft.slack = Math.max(0, floorAt(cam.position.x, cam.position.z) - cam.position.y);
      focusing = false;
    }
    function externallyMoved() {
      return !written || cam.position.distanceToSquared(lastCam) > 1e-8 || target.distanceToSquared(lastT) > 1e-8;
    }

    function setNDC(e) {
      const r = dom.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      cam.updateMatrixWorld();
      ray.setFromCamera(ndc, cam);
    }
    function ensureSynced() { if (externallyMoved()) { syncFromCamera(!!opt.deriveTarget); written = true; lastCam.copy(cam.position); lastT.copy(target); } }

    // ---------------- 输入 ----------------
    function rotateBy(dx, dy) {
      const h = dom.clientHeight || 600;
      goal.theta -= (2 * Math.PI * dx / h) * 0.75 * opt.rotateSpeed;
      goal.phi -= (2 * Math.PI * dy / h) * 0.75 * opt.rotateSpeed;
    }
    function panBy(dx, dy) {
      const h = dom.clientHeight || 600;
      const wpp = (2 * goal.r * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2)) / h * opt.panSpeed;
      const st = Math.sin(goal.theta), ct = Math.cos(goal.theta);
      const fwdK = dy * wpp / Math.max(0.3, Math.cos(goal.phi));
      // right = (cos t, 0, -sin t)，forward（水平，朝观察点方向）= (-sin t, 0, -cos t)
      goalT.x += -dx * wpp * ct + fwdK * -st;
      goalT.z += dx * wpp * st + fwdK * -ct;
      focusing = false;
    }
    function zoomAt(scale, e) {
      const r0 = goal.r, r1 = clamp(r0 * scale, soft.rMin, soft.rMax), s = r1 / r0;
      if (Math.abs(s - 1) < 1e-6) return;
      goal.r = r1;
      if (e && opt.pick) {
        setNDC(e);
        const p = opt.pick(ray, hit);
        if (p) { goalT.sub(p).multiplyScalar(s).add(p); }      // 朝光标所指的点缩放（相机沿与该点的连线移动）
      }
      focusing = false;
    }
    function focus(p, dist) {
      ensureSynced();
      goalT.copy(p);
      goal.r = clamp(dist !== undefined ? dist : Math.min(goal.r, opt.focusDistance || goal.r), soft.rMin, soft.rMax);
      focusing = true;
    }

    function onPointerDown(e) {
      if (!enabled()) return;
      if (e.pointerType === "touch") {
        touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
        try { dom.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
        ensureSynced(); userStart();
        if (touches.size === 1) drag = { mode: "rotate", id: e.pointerId, x: e.clientX, y: e.clientY };
        else { drag = null; pinch = pinchState(); }
        return;
      }
      let mode = null;
      if (e.button === 0) mode = e.shiftKey || e.ctrlKey || e.metaKey ? "pan" : "rotate";
      else if (e.button === 2) mode = "pan";
      else if (e.button === 1) mode = "dolly";
      if (!mode) return;
      if (e.button === 1) e.preventDefault();
      ensureSynced();
      drag = { mode, id: e.pointerId, x: e.clientX, y: e.clientY };
      try { dom.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
      userStart();
    }
    function pinchState() {
      const a = [...touches.values()];
      if (a.length < 2) return null;
      return { d: Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y), mx: (a[0].x + a[1].x) / 2, my: (a[0].y + a[1].y) / 2 };
    }
    function onPointerMove(e) {
      if (e.pointerType === "touch" && touches.has(e.pointerId)) {
        touches.get(e.pointerId).x = e.clientX; touches.get(e.pointerId).y = e.clientY;
        if (!enabled()) return;
        if (touches.size >= 2 && pinch) {
          const p = pinchState();
          if (p.d > 1 && pinch.d > 1) zoomAt(pinch.d / p.d, null);
          panBy(p.mx - pinch.mx, p.my - pinch.my);
          pinch = p; lastInput = performance.now();
          return;
        }
      }
      if (!drag || drag.id !== e.pointerId || !enabled()) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      drag.x = e.clientX; drag.y = e.clientY;
      if (drag.mode === "rotate") rotateBy(dx, dy);
      else if (drag.mode === "pan") panBy(dx, dy);
      else zoomAt(Math.exp(dy * 0.005 * opt.zoomSpeed), null);
      lastInput = performance.now();
    }
    function onPointerUp(e) {
      if (e.pointerType === "touch") { touches.delete(e.pointerId); pinch = touches.size >= 2 ? pinchState() : null; if (touches.size === 1) { const [id, t] = [...touches.entries()][0]; drag = { mode: "rotate", id, x: t.x, y: t.y }; return; } }
      if (drag && drag.id === e.pointerId) drag = null;
    }
    function onWheel(e) {
      if (!enabled()) return;
      e.preventDefault();
      ensureSynced(); userStart();
      const dy = e.deltaY * (e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 400 : 1);
      zoomAt(Math.exp(clamp(dy, -300, 300) * 0.0012 * opt.zoomSpeed), e);
    }
    function onDblClick(e) {
      if (!enabled() || !opt.dblclick || !opt.pick) return;
      setNDC(e);
      const p = opt.pick(ray, hit);
      if (!p) return;
      userStart();
      v2.copy(p);
      focus(v2, Math.min(goal.r, opt.focusDistance || goal.r));
      if (opt.onFocus) opt.onFocus(v2);
    }
    function typing(e) { const t = e.target; return t && (t.isContentEditable || /^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName)); }
    function onKeyDown(e) {
      const k = keyMap[e.code];
      if (!k || !opt.keys || typing(e) || e.ctrlKey || e.metaKey || e.altKey) return;
      if (opt.keyFilter && !opt.keyFilter(e)) return;
      if (!enabled()) return;
      if (e.code === "Space" || e.code.startsWith("Arrow") || e.code.startsWith("Page")) e.preventDefault();
      if (!keys[k]) { ensureSynced(); userStart(); }
      keys[k] = true;
    }
    function onKeyUp(e) { const k = keyMap[e.code]; if (k) keys[k] = false; }
    function clearKeys() { for (const k in keys) keys[k] = false; drag = null; touches.clear(); pinch = null; }

    dom.addEventListener("pointerdown", onPointerDown);
    dom.addEventListener("pointermove", onPointerMove);
    dom.addEventListener("pointerup", onPointerUp);
    dom.addEventListener("pointercancel", onPointerUp);
    dom.addEventListener("wheel", onWheel, { passive: false });
    dom.addEventListener("dblclick", onDblClick);
    dom.addEventListener("contextmenu", (e) => e.preventDefault());
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", clearKeys);
    document.addEventListener("visibilitychange", clearKeys);
    dom.style.touchAction = "none";

    // ---------------- 每帧 ----------------
    function anyKey() { return !!anyMove(); }
    function applyKeys(dt) {
      const fast = keys.shift ? 2.6 : 1;
      const sp = (opt.moveSpeed ? opt.moveSpeed(goal.r) : Math.max(1, goal.r * 0.7)) * fast * dt;
      const st = Math.sin(goal.theta), ct = Math.cos(goal.theta);
      let f = 0, r = 0, u = 0;
      if (keys.f) f += 1; if (keys.b) f -= 1; if (keys.r) r += 1; if (keys.l) r -= 1; if (keys.u) u += 1; if (keys.d) u -= 1;
      if (f || r) { const n = 1 / Math.hypot(f, r); goalT.x += (f * -st + r * ct) * n * sp; goalT.z += (f * -ct - r * st) * n * sp; focusing = false; }
      if (u) { goalT.y += u * sp * (opt.verticalSpeed || 0.6); focusing = false; }
    }
    function clampGoal() {
      goal.r = clamp(goal.r, soft.rMin, soft.rMax);
      goal.phi = clamp(goal.phi, soft.phiMin, soft.phiMax);
      if (B) {
        goalT.x = clamp(goalT.x, B.minX, B.maxX); goalT.z = clamp(goalT.z, B.minZ, B.maxZ);
        if (B.maxY !== undefined) goalT.y = Math.min(goalT.y, B.maxY);
      }
      const tf = tFloorAt(goalT.x, goalT.z);
      if (goalT.y < tf) goalT.y = tf;
      // 相机盒：超出则缩短距离
      off.setFromSphericalCoords(goal.r, goal.phi, goal.theta);
      if (CB) {
        let s = 1;
        if (goalT.x + off.x > CB.maxX) s = Math.min(s, (CB.maxX - goalT.x) / off.x); if (goalT.x + off.x < CB.minX) s = Math.min(s, (CB.minX - goalT.x) / off.x);
        if (goalT.z + off.z > CB.maxZ) s = Math.min(s, (CB.maxZ - goalT.z) / off.z); if (goalT.z + off.z < CB.minZ) s = Math.min(s, (CB.minZ - goalT.z) / off.z);
        if (CB.maxY !== undefined && goalT.y + off.y > CB.maxY && off.y > 0) s = Math.min(s, (CB.maxY - goalT.y) / off.y);
        if (s < 1) { goal.r = Math.max(Math.min(soft.rMin, goal.r), goal.r * Math.max(0.05, s)); off.setFromSphericalCoords(goal.r, goal.phi, goal.theta); }
      }
      // 地面 / 水面：相机不低于 floor（从水下等位置接管时允许的余量逐步收回）
      const cx = goalT.x + off.x, cz = goalT.z + off.z;
      let fl = floorAt(cx, cz) - soft.slack;
      if (goalT.y + off.y < fl) {
        const need = fl - goalT.y;
        if (need >= goal.r) { goal.r = Math.min(soft.rMax, need + 0.01); goal.phi = soft.phiMin; }
        else goal.phi = Math.max(soft.phiMin, Math.min(goal.phi, Math.acos(need / goal.r)));
        off.setFromSphericalCoords(goal.r, goal.phi, goal.theta);
      }
      soft.slack = Math.min(soft.slack, Math.max(0, floorAt(goalT.x + off.x, goalT.z + off.z) - (goalT.y + off.y)));
      // 视线不穿过地形：观察点到相机的连线若有采样点埋在地下，抬高镜头
      if (opt.losGround) {
        for (let pass = 0; pass < 4; pass++) {
          let blocked = false;
          for (let i = 1; i <= opt.losSamples; i++) {
            const t = i / (opt.losSamples + 1);
            const x = goalT.x + off.x * t, y = goalT.y + off.y * t, z = goalT.z + off.z * t;
            if (y < opt.losGround(x, z)) { blocked = true; break; }
          }
          if (!blocked || goal.phi <= soft.phiMin + 1e-3) break;
          goal.phi = Math.max(soft.phiMin, goal.phi - 0.06);
          off.setFromSphericalCoords(goal.r, goal.phi, goal.theta);
        }
      }
      // 放宽过的限位：用户往回操作时收紧
      if (soft.rMin < opt.minDistance) soft.rMin = Math.min(opt.minDistance, Math.max(soft.rMin, goal.r));
      if (soft.rMax > opt.maxDistance) soft.rMax = Math.max(opt.maxDistance, Math.min(soft.rMax, goal.r));
      if (soft.phiMin < opt.minPolar) soft.phiMin = Math.min(opt.minPolar, Math.max(soft.phiMin, goal.phi));
      if (soft.phiMax > opt.maxPolar) soft.phiMax = Math.max(opt.maxPolar, Math.min(soft.phiMax, goal.phi));
    }
    function update(dt) {
      dt = Math.min(Math.max(dt || 0, 0), 0.1);
      if (externallyMoved()) syncFromCamera(!!opt.deriveTarget);
      if (!enabled()) { clearDrag(); lastCam.copy(cam.position); lastT.copy(target); return false; }
      if (anyMove()) applyKeys(dt);
      clampGoal();
      const k = 1 - Math.exp(-dt * (focusing ? opt.focusSmooth : opt.smooth));
      target.lerp(goalT, k);
      cur.r = Math.exp(Math.log(cur.r) + (Math.log(goal.r) - Math.log(cur.r)) * k);
      let dth = goal.theta - cur.theta;
      if (dth > Math.PI || dth < -Math.PI) { dth = Math.atan2(Math.sin(dth), Math.cos(dth)); goal.theta = cur.theta + dth; }
      cur.theta += dth * k;
      cur.phi += (goal.phi - cur.phi) * k;
      if (focusing && target.distanceToSquared(goalT) < 1e-4 && Math.abs(cur.r - goal.r) < 1e-3) focusing = false;
      off.setFromSphericalCoords(cur.r, cur.phi, cur.theta);
      cam.position.copy(target).add(off);
      const fl = floorAt(cam.position.x, cam.position.z) - soft.slack;
      if (cam.position.y < fl) cam.position.y = fl;
      cam.lookAt(target);
      const moved = cam.position.distanceToSquared(lastCam) > 1e-10 || target.distanceToSquared(lastT) > 1e-10;
      lastCam.copy(cam.position); lastT.copy(target); written = true;
      if (moved) emit("change");
      return moved;
    }
    function anyMove() { return keys.f || keys.b || keys.l || keys.r || keys.u || keys.d; }
    function clearDrag() { drag = null; }
    window.addEventListener("keydown", (e) => { if (e.key === "Shift") keys.shift = true; });
    window.addEventListener("keyup", (e) => { if (e.key === "Shift") keys.shift = false; });

    const api = {
      target, update, focus,
      sync(t) { if (t) target.copy(t); syncFromCamera(!t && !!opt.deriveTarget); written = true; lastCam.copy(cam.position); lastT.copy(target); },
      addEventListener(type, f) { (listeners[type] || (listeners[type] = [])).push(f); },
      clearKeys,
      get goalTarget() { return goalT; },
      get distance() { return cur.r; },
      get polar() { return cur.phi; },
      get azimuth() { return cur.theta; },
      get busy() { return !!drag || anyKey() || focusing || performance.now() - lastInput < 400; },
      get focusing() { return focusing; },
      options: opt,
    };
    return api;
  }

  // 一次性操作提示（每个场景只出现一次，localStorage 记住）
  const HINT = "左键拖动旋转 · 右键 / Shift+拖动平移 · 滚轮朝光标缩放 · WASD / 方向键移动 · Q / E 升降 · 双击地面聚焦";
  function hintOnce(key, show) {
    try { if (localStorage.getItem("campus.freecam.hint." + key)) return false; localStorage.setItem("campus.freecam.hint." + key, "1"); } catch (_) { /* storage unavailable */ }
    show(HINT); return true;
  }
  window.FreeCam = { create, HINT, hintOnce };
})();
