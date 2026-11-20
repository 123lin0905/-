/* ------------------------------------------------------------------ 校园版：自由镜头 + 全场景巡游电影镜头（由 tools/build_pond.py 插入 pond-main.js）
 * 翠湖水景按真实尺寸重建（湖长约 145 米），镜头范围随之放大：
 * 自由镜头：共用 ../js/free-camera.js（观察点 + 球坐标，左键旋转、右键 / Shift+左键平移、滚轮朝光标缩放、WASD/方向键移动、
 *   Q/E 升降、双击地面 / 水面飞过去聚焦）；观察点限在翠湖、翠湖广场、南岸半圆广场、两岸与周边宿舍范围内，最远 220 米；
 *   相机不低于水面 / 地面，不穿进建筑（建筑范围内最低高度 = 屋顶以上）和树干。电影镜头、清单飞行、抚摸 / 喂鱼特写、编辑俯瞰
 *   改动相机后，自由镜头从当前画面接管，不跳变。
 * 电影镜头：从东南高空（与官方鸟瞰图同一方向）开始，依次经过 南岸半圆广场 → 银杏与栾树 → 西岸蓝花楹 → 湖心岛 → 翠湖广场 →
 *   置石与石盘 → 东岸垂柳与 C 区宿舍 → 睡莲 → 锦鲤，连续平滑飞行；路径按地形、水面、树冠、建筑屋顶避让后重新平滑。 */
const POND_BOUNDS = { minX: -60, maxX: 75, minZ: -150, maxZ: 70, maxY: 60 };
const POND_CAMBOX = { minX: -140, maxX: 170, minZ: -240, maxZ: 150, maxY: 180 };
let FREECAM = null;
// 相机最低高度：水面以上 0.12 米、地面以上 0.3 米；建筑范围内不低于屋顶 + 1 米；树干附近不低于树顶（不穿树干）
function pondCamFloor(x, z) {
  const s = sdf(x, z);
  let f = s < 0 ? WATER_Y + 0.12 : terrainHeight(x, z) + 0.3;
  const bt = cuihuBuildingTop(x, z, 1.5);
  if (bt + 1.0 > f) f = bt + 1.0;
  for (const t of WORLD.trees || []) {
    const dx = x - t.x, dz = z - t.z;
    if (dx * dx + dz * dz < 0.81) f = Math.max(f, CUIHU.G + t.h + 0.5);
  }
  return f;
}
// 观察点最低高度：地面 / 湖底（相机自己不低于水面；从水下视角接管时观察点可以在水下）
function pondTargetFloor(x, z) { return terrainHeight(x, z) + (sdf(x, z) < 0 ? 0.05 : 0); }
// 视线检查用的地形高度（水面是透明的，不挡）
function pondLosGround(x, z) { const s = sdf(x, z); return s < 0 ? -1e9 : terrainHeight(x, z) + 0.02; }
// 光线与水面 / 地形求交（水面优先）：先等距放大步长行进，再二分细化
function pondPick(rc, out) {
  const o = rc.ray.origin, d = rc.ray.direction;
  if (o.y < WATER_Y) {                                   // 相机在水下（清单的“水下”视角）：与湖底 / 地形求交
    for (let t = 0.03, t0 = 0; t < 60; t0 = t, t += 0.03 + t * 0.03) {
      const x = o.x + d.x * t, y = o.y + d.y * t, z = o.z + d.z * t;
      if (y < terrainHeight(x, z) || y > WATER_Y) return out.set(x, y, z);
    }
    return null;
  }
  let tW = Infinity;
  if (d.y < -1e-6 && o.y > WATER_Y) { const t = (WATER_Y - o.y) / d.y, x = o.x + d.x * t, z = o.z + d.z * t; if (sdf(x, z) < 0) tW = t; }
  let t0 = 0, t = 0.05;
  const tMax = Math.min(tW, 600);
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
    THREE, camera, dom: canvas, target: cuihuV(372, 1420, 0),
    bounds: POND_BOUNDS, camBounds: POND_CAMBOX,
    minDistance: 0.5, maxDistance: 220, minPolar: 0.06, maxPolar: 1.53,
    floor: pondCamFloor, targetFloor: pondTargetFloor, losGround: pondLosGround, pick: pondPick,
    deriveTarget: true, deriveMax: 120, defaultFocus: 6, focusDistance: 8,
    moveSpeed: (r) => clamp(r * 0.55, 0.8, 30), verticalSpeed: 0.5,
    enabled: () => P.cameraMode === 'Manual' && !P.holdCamera && TWEEN.t >= 1 && !(FEED.active && FEED.shot) && !STROKE.active,
    keyFilter: () => P.cameraMode === 'Manual',
    onStart: () => { const cap = document.getElementById('caption'); if (cap) cap.style.opacity = '0'; },
  });
  window.FREECAM = FREECAM;
}

// ---------------------------------------------------------------- 电影镜头：全场景巡游
const TOUR = { pos: null, look: null, caps: [], N: 0, seg: 12, t: 0, blend: 1, resume: false, samples: null, capShown: '' };
const _tp = new THREE.Vector3(), _tl = new THREE.Vector3();
function buildTour() {
  const V = cuihuV, CP = window.CAMPUS_POND;
  const spots = [
    { cap: CP.zoneName || '翠湖水景', p: V(290, 1790, 75), l: V(380, 1420, 0) },        // 西南南方向高空斜俯视，与官方鸟瞰图同一方向
    { cap: '南岸半圆广场', p: V(380, 1694, 11), l: V(366, 1590, 2) },
    { cap: '银杏与栾树', p: V(314, 1612, 4.5), l: V(360, 1574, 4) },
    { cap: '西岸蓝花楹', p: V(318, 1470, 3.6), l: V(286, 1410, 5) },
    { cap: '湖心岛', p: V(345, 1440, 3.2), l: V(384, 1440, 5) },
    { cap: '翠湖广场', p: V(335, 1272, 7), l: V(334, 1110, 4) },
    { cap: '置石与石盘', p: V(352, 1246, 2.6), l: V(326, 1222, 1.2) },
    { cap: '东岸垂柳与 C 区宿舍', p: V(392, 1350, 5), l: V(478, 1384, 9) },
    { cap: '睡莲', p: V(400, 1488, 2.2), l: V(382, 1482, 0) },
    { cap: '锦鲤', p: new THREE.Vector3(1.6, 1.1, 8.8), l: new THREE.Vector3(0.2, -0.3, 1.5) },
  ];
  TOUR.N = spots.length; TOUR.caps = spots.map((s) => s.cap);
  const rawP = new THREE.CatmullRomCurve3(spots.map((s) => s.p), true, 'centripetal');
  TOUR.look = new THREE.CatmullRomCurve3(spots.map((s) => s.l), true, 'centripetal');
  // 避让：地面 / 水面 / 建筑屋顶 / 树干（pondCamFloor）+ 树冠（WORLD.trees，按树冠半径与树高），再重新平滑
  const obst = [];
  for (const t of WORLD.trees || []) obst.push([t.x, t.z, t.r + 0.8, CUIHU.G + t.h + 0.6]);
  const K = 10, M = TOUR.N * K, pts = [];
  for (let i = 0; i < M; i++) pts.push(rawP.getPoint(i / M, new THREE.Vector3()));
  const moved = new Uint8Array(M);
  // 路径穿过某个障碍圆（且低于树冠）的一段连续采样点，整段推到同一侧的圆周外，之后邻点平均平滑，循环几遍
  const avoid = () => {
    for (const [ox, oz, r, top] of obst) {
      const inside = (p) => p.y < top && Math.hypot(p.x - ox, p.z - oz) < r;
      for (let i0 = 0; i0 < M; i0++) {
        if (!inside(pts[i0]) || inside(pts[(i0 + M - 1) % M])) continue;
        let n = 0; while (n < M && inside(pts[(i0 + n) % M])) n++;
        const a = pts[(i0 + M - 1) % M], b = pts[(i0 + n) % M];
        let sx = (a.x + b.x) / 2 - ox, sz = (a.z + b.z) / 2 - oz, sl = Math.hypot(sx, sz);
        if (sl < 1e-3) { sx = -(b.z - a.z); sz = b.x - a.x; sl = Math.hypot(sx, sz) || 1; }
        sx /= sl; sz /= sl;
        for (let k = 0; k < n; k++) {
          const p = pts[(i0 + k) % M];
          const w = Math.sin(Math.PI * (k + 1) / (n + 1)) * r;
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
      if (i % K === 0 && !moved[i]) continue;                                       // 景点机位固定
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
