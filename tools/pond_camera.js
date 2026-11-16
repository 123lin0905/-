/* ------------------------------------------------------------------ 校园版：自由镜头 + 全场景巡游电影镜头（由 tools/build_pond.py 插入 pond-main.js）
 * 自由镜头：共用 ../js/free-camera.js（观察点 + 球坐标，左键旋转、右键 / Shift+左键平移、滚轮朝光标缩放、WASD/方向键移动、
 *   Q/E 升降、双击地面 / 水面飞过去聚焦）；限位为场景范围（垂柳、竹林、小亭、花境都在内）、不低于地面 / 水面、不进小亭屋顶和桥洞、
 *   最远 18 米（看不到世界边缘）。电影镜头、清单飞行、抚摸 / 喂鱼特写、编辑俯瞰改动相机后，自由镜头从当前画面接管，不跳变。
 * 电影镜头：绕池塘一圈依次经过 全景 → 岸边垂柳 → 石拱桥（荷花池版为满池荷叶）→ 小亭 → 竹林 → 垂柳 → 假山跌水 → 荷花 → 锦鲤 → 花境，
 *   连续平滑飞行（不再黑场切镜），路径预先按地形、水面、树木、小亭、石桥做避让后重新平滑。 */
const POND_BOUNDS = { minX: -13, maxX: 13, minZ: -15.5, maxZ: 10.5, maxY: 7 };
const POND_CAMBOX = { minX: -24, maxX: 24, minZ: -27, maxZ: 23, maxY: 18 };
let FREECAM = null;
// 相机最低高度：水面以上 0.12 米、地面以上 0.3 米；石桥桥面上方、小亭屋顶上方不钻进去
function pondCamFloor(x, z) {
  const s = sdf(x, z);
  let f = s < 0 ? WATER_Y + 0.12 : terrainHeight(x, z) + 0.3;
  if (window.CAMPUS_POND.bridge && Math.abs(z - BRIDGE.z) < BRIDGE.width / 2 + 0.35 && Math.abs(x) < BRIDGE.half + 0.2) f = Math.max(f, 1.2);
  const dp = Math.hypot(x - PAVILION.x, z - PAVILION.z);
  if (dp < PAVILION.r + 0.5) f = Math.max(f, 3.9);
  return f;
}
// 观察点最低高度：地面 / 池底（相机自己不低于水面；从水下视角接管时观察点可以在水下）
function pondTargetFloor(x, z) { return terrainHeight(x, z) + (sdf(x, z) < 0 ? 0.05 : 0); }
// 视线检查用的地形高度（水面是透明的，不挡）
function pondLosGround(x, z) { const s = sdf(x, z); return s < 0 ? -1e9 : terrainHeight(x, z) + 0.02; }
// 光线与水面 / 地形求交（水面优先）：先等距放大步长行进，再二分细化
function pondPick(rc, out) {
  const o = rc.ray.origin, d = rc.ray.direction;
  if (o.y < WATER_Y) {                                   // 相机在水下（清单的“水下”视角）：与池底 / 地形求交
    for (let t = 0.03, t0 = 0; t < 40; t0 = t, t += 0.03 + t * 0.03) {
      const x = o.x + d.x * t, y = o.y + d.y * t, z = o.z + d.z * t;
      if (y < terrainHeight(x, z) || y > WATER_Y) return out.set(x, y, z);
    }
    return null;
  }
  let tW = Infinity;
  if (d.y < -1e-6 && o.y > WATER_Y) { const t = (WATER_Y - o.y) / d.y, x = o.x + d.x * t, z = o.z + d.z * t; if (sdf(x, z) < 0) tW = t; }
  let t0 = 0, t = 0.05;
  const tMax = Math.min(tW, 120);
  while (t < tMax) {
    const x = o.x + d.x * t, y = o.y + d.y * t, z = o.z + d.z * t;
    if (y < pondLosGround(x, z) - 0.02 && sdf(x, z) >= 0) {
      for (let i = 0; i < 8; i++) { const m = (t0 + t) / 2, xm = o.x + d.x * m, zm = o.z + d.z * m; if (o.y + d.y * m < terrainHeight(xm, zm)) t = m; else t0 = m; }
      return out.set(o.x + d.x * t, o.y + d.y * t, o.z + d.z * t);
    }
    t0 = t; t += 0.04 + t * 0.03;
  }
  if (tW < Infinity) return out.set(o.x + d.x * tW, WATER_Y, o.z + d.z * tW);
  return null;
}
function setupFreeCam() {
  if (FREECAM || !window.FreeCam) return;
  FREECAM = FreeCam.create({
    THREE, camera, dom: canvas, target: new THREE.Vector3(0, 0, -1),
    bounds: POND_BOUNDS, camBounds: POND_CAMBOX,
    minDistance: 0.5, maxDistance: 18, minPolar: 0.06, maxPolar: 1.53,
    floor: pondCamFloor, targetFloor: pondTargetFloor, losGround: pondLosGround, pick: pondPick,
    deriveTarget: true, deriveMax: 18, defaultFocus: 4, focusDistance: 3.5,
    moveSpeed: (r) => clamp(r * 0.55, 0.8, 7), verticalSpeed: 0.5,
    enabled: () => P.cameraMode === 'Manual' && !P.holdCamera && TWEEN.t >= 1 && !(FEED.active && FEED.shot) && !STROKE.active,
    keyFilter: () => P.cameraMode === 'Manual',
    onStart: () => { const cap = document.getElementById('caption'); if (cap) cap.style.opacity = '0'; },
  });
  window.FREECAM = FREECAM;
}

// ---------------------------------------------------------------- 电影镜头：全场景巡游
const TOUR = { pos: null, look: null, caps: [], N: 0, seg: 10, t: 0, blend: 1, resume: false, samples: null, capShown: '' };
const _tp = new THREE.Vector3(), _tl = new THREE.Vector3();
function buildTour() {
  const V = (x, y, z) => new THREE.Vector3(x, y, z), CP = window.CAMPUS_POND;
  const W = WORLD.willows || [];
  const nearWillow = (x, z) => W.reduce((b, w) => (Math.hypot(w[0] - x, w[1] - z) < Math.hypot(b[0] - x, b[1] - z) ? w : b), W[0] || [x, z, 4.5]);
  const wE = nearWillow(5.3, 2.6), wW = nearWillow(-6.9, -1.0);
  const spots = [
    { cap: CP.zoneName || '池塘全景', p: V(0.5, 8.0, 12.5), l: V(0, 0, -2.2) },
    { cap: '岸边垂柳', p: V(wE[0] + 2.4, 1.5, wE[1] + 3.0), l: V(wE[0], 2.0, wE[1]) },
    CP.bridge ? { cap: '石拱桥', p: V(1.5, 1.3, -0.3), l: V(-0.2, 0.75, BRIDGE.z) } : { cap: '满池荷叶', p: V(3.2, 1.7, 0.4), l: V(-0.6, 0, -2.0) },
    { cap: '小亭', p: V(PAVILION.x + 4.0, 2.4, PAVILION.z + 3.3), l: V(PAVILION.x, 1.7, PAVILION.z) },
    { cap: '竹林', p: V(-3.2, 2.3, -7.4), l: V(-9.2, 2.6, -10.6) },
    { cap: '垂柳依依', p: V(wW[0] + 2.9, 1.3, wW[1] - 2.6), l: V(wW[0], 2.0, wW[1]) },
  ];
  if (WF.site) { const wp = wfWorld(1.45, 0.55, 0.62), wl = wfWorld(-0.45, 0, 0.35); wp.add(V(wp.x - wl.x, 0.5, wp.z - wl.z).multiplyScalar(0.6)); spots.push({ cap: '假山跌水', p: wp, l: wl }); }
  spots.push(
    { cap: CP.lotusExtra ? '荷叶田田' : '荷花', p: V(-1.3, 0.8, 1.1), l: V(-2.62, 0.35, -0.15) },
    { cap: '锦鲤', p: V(1.2, 0.8, 3.4), l: V(0.2, -0.2, 0.6) },
    { cap: '花境与驳岸', p: V(-2.4, 1.6, 7.4), l: V(-0.5, 0.3, 3.0) },
  );
  TOUR.N = spots.length; TOUR.caps = spots.map((s) => s.cap);
  const rawP = new THREE.CatmullRomCurve3(spots.map((s) => s.p), true, 'centripetal');
  TOUR.look = new THREE.CatmullRomCurve3(spots.map((s) => s.l), true, 'centripetal');
  // 避让：地面 / 水面 / 小亭 / 石桥（pondCamFloor）+ 树木（垂柳按树冠、其余按占位圆 WORLD.occ），再重新平滑
  const obst = [];
  for (const w of W) obst.push([w[0], w[1], 2.8, w[2] + 0.5]);                       // 垂柳：枝条垂到地面，按树冠半径避让
  for (const c of (WORLD.occ || [])) if (c[2] >= 0.5) obst.push([c[0], c[1], c[2] + 0.45, 4.5]);
  obst.push([PAVILION.x, PAVILION.z, PAVILION.r + 1.0, 4.3]);                          // 小亭：从旁边绕过，不从屋顶上跳过
  const K = 8, M = TOUR.N * K, pts = [];
  for (let i = 0; i < M; i++) pts.push(rawP.getPoint(i / M, new THREE.Vector3()));
  const moved = new Uint8Array(M);
  // 避让：路径穿过某个障碍圆（且低于树冠 / 屋顶）的一段连续采样点，整段推到同一侧的圆周外（按这段弦中点所在一侧），
  // 不会出现相邻两点被推到圆的两边造成的跳变；之后邻点平均平滑，循环几遍
  const avoid = () => {
    for (const [ox, oz, r, top] of obst) {
      const inside = (p) => p.y < top && Math.hypot(p.x - ox, p.z - oz) < r;
      for (let i0 = 0; i0 < M; i0++) {
        if (!inside(pts[i0]) || inside(pts[(i0 + M - 1) % M])) continue;            // 一段的起点
        let n = 0; while (n < M && inside(pts[(i0 + n) % M])) n++;
        const a = pts[(i0 + M - 1) % M], b = pts[(i0 + n) % M];
        let sx = (a.x + b.x) / 2 - ox, sz = (a.z + b.z) / 2 - oz, sl = Math.hypot(sx, sz);
        if (sl < 1e-3) { sx = -(b.z - a.z); sz = b.x - a.x; sl = Math.hypot(sx, sz) || 1; }
        sx /= sl; sz /= sl;
        for (let k = 0; k < n; k++) {
          const p = pts[(i0 + k) % M];
          const w = Math.sin(Math.PI * (k + 1) / (n + 1)) * r;                       // 两端少推、中间多推，保持连续
          let dx = p.x - ox + sx * w, dz = p.z - oz + sz * w; const d = Math.hypot(dx, dz) || 1;
          p.x = ox + dx / d * (r + 0.05); p.z = oz + dz / d * (r + 0.05); moved[(i0 + k) % M] = 1;
        }
      }
    }
    for (const p of pts) p.y = Math.max(p.y, pondCamFloor(p.x, p.z) + 0.15);
  };
  avoid();
  for (let pass = 0; pass < 6; pass++) {
    const q = pts.map((p) => p.clone());
    for (let i = 0; i < M; i++) {
      if (i % K === 0 && !moved[i]) continue;                                       // 景点机位固定（平滑会让整圈向内收缩）
      const a = q[(i + M - 1) % M], b = q[(i + 1) % M]; pts[i].set((a.x + q[i].x * 2 + b.x) / 4, (a.y + q[i].y * 2 + b.y) / 4, (a.z + q[i].z * 2 + b.z) / 4);
    }
    avoid();
  }
  TOUR.pos = new THREE.CatmullRomCurve3(pts, true, 'centripetal');
  TOUR.K = K;
  TOUR.samples = [];
  for (let i = 0; i < TOUR.N * 24; i++) TOUR.samples.push(tourPoint(i / (TOUR.N * 24) * TOUR.N * TOUR.seg, new THREE.Vector3(), null));
}
// 时间 -> 路径参数：每段在景点附近放慢（停留感），段间加速
function tourParam(t) {
  const T = TOUR.N * TOUR.seg, tt = ((t % T) + T) % T, i = Math.floor(tt / TOUR.seg), f = tt / TOUR.seg - i;
  const e = lerp(f, f * f * (3 - 2 * f), 0.55);
  return { u: (i + e) / TOUR.N, i, f };
}
function tourPoint(t, outP, outL) {
  const { u } = tourParam(t);
  TOUR.pos.getPoint(u, outP);
  if (outL) TOUR.look.getPoint(u, outL);
  return outP;
}
// 植被在第二阶段分帧补种：补完后按完整的树木占位重建一次路径（平滑接入，不跳）
document.addEventListener('pond:full', () => { if (TOUR.pos) { TOUR.pos = null; TOUR.blend = 0; } });
function updateTour(dt, t) {
  if (!TOUR.pos) buildTour();
  if (TOUR.resume) {                                         // 从自由镜头切回：从离当前相机最近的路径点继续，平滑接入
    TOUR.resume = false; TOUR.blend = 0;
    let bi = 0, bd = Infinity;
    for (let i = 0; i < TOUR.samples.length; i++) { const d = TOUR.samples[i].distanceToSquared(camera.position); if (d < bd) { bd = d; bi = i; } }
    TOUR.t = bi / TOUR.samples.length * TOUR.N * TOUR.seg;
  }
  TOUR.t += dt * P.pathSpeed;
  tourPoint(TOUR.t, _tp, _tl);
  _tp.x += Math.sin(t * 0.37) * 0.01; _tp.y += Math.sin(t * 0.53) * 0.007;          // 轻微手持晃动
  _tp.y = Math.max(_tp.y, pondCamFloor(_tp.x, _tp.z));
  _pm.lookAt(_tp, _tl, _up); _pq.setFromRotationMatrix(_pm);
  if (TOUR.blend < 1) {
    TOUR.blend = Math.min(1, TOUR.blend + dt / 2.5);
    const k = 1 - Math.exp(-dt * 2.5 / Math.max(0.05, 1 - TOUR.blend));
    camera.position.lerp(_tp, k); camera.quaternion.slerp(_pq, k);
  } else { camera.position.copy(_tp); camera.quaternion.copy(_pq); }
  MOVIE.fade = 0;                                                                       // 连续巡游，不黑场
  const { i, f } = tourParam(TOUR.t);
  const near = f < 0.5 ? i : (i + 1) % TOUR.N, a = f < 0.5 ? f : 1 - f;                // 离景点越近字幕越清楚
  const cap = document.getElementById('caption');
  if (cap) {
    const txt = TOUR.caps[near] || '';
    if (TOUR.capShown !== txt) { cap.textContent = txt; TOUR.capShown = txt; }
    cap.style.opacity = txt ? String(clamp(1 - (a - 0.18) / 0.17, 0, 1) * 0.92) : '0';
  }
}
