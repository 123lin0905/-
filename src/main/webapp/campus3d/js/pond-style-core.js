/*
 * 池塘画风 · 共享核心（自动生成，请勿手改 —— 由 tools/build_pond.py 从池塘场景源码中逐字抽出）
 * ------------------------------------------------------------------------------
 * 来源：开源项目 Koi Pond Garden（https://github.com/souranyp-stack/koi-pond-garden，Copyright (c) 2026 Sourany Phomhome，
 *       MIT License，许可全文见 campus3d/pond/LICENSE-koi-pond-garden.txt）及本项目的校园化改造。
 * 校园全景（ecohome）与池塘细节场景（pond/pond.html）都加载本文件，所以两边的噪声、程序化纹理（草地、花岗岩、卵石、
 * 木纹、树皮、灰瓦、水面法线）、叶片卡（香樟/垂柳/水杉/灌木…）、几何工具、天空（Preetham + 云层 + 星月）、色温、
 * 天气预设、叶片透光、积雪/湿润/秋色着色、风动和 ACES 色调映射完全一致。
 * 依赖：全局 THREE（lib/three-r160.min.js）。经典脚本，定义全局函数 / 常量。
 */
'use strict';
let pondStyleProgress = async () => {};   // buildTextures() 的进度回调，由使用方替换
// ==== 1-3. 数学/噪声、程序化纹理、几何工具 ====
/* ------------------------------------------------------------------ 1. MATH / NOISE */
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
let rng = mulberry32(20240917);
const rand = () => rng();
const rr = (a, b) => a + (b - a) * rng();
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const DEG = Math.PI / 180;

function hash3i(x, y, z, s) {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(z | 0, 0x9e3779b1) ^ Math.imul(s | 0, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}
const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
// 3D value noise in [-1, 1]
function vnoise3(x, y, z, s = 0) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const u = fade(x - xi), v = fade(y - yi), w = fade(z - zi);
  const h = (a, b, c) => hash3i(xi + a, yi + b, zi + c, s);
  return lerp(
    lerp(lerp(h(0, 0, 0), h(1, 0, 0), u), lerp(h(0, 1, 0), h(1, 1, 0), u), v),
    lerp(lerp(h(0, 0, 1), h(1, 0, 1), u), lerp(h(0, 1, 1), h(1, 1, 1), u), v), w) * 2 - 1;
}
function fbm3(x, y, z, oct = 4, s = 0) {
  let a = 0.5, f = 1, sum = 0, n = 0;
  for (let o = 0; o < oct; o++) { sum += a * vnoise3(x * f, y * f, z * f, s + o * 17); n += a; a *= 0.5; f *= 2.03; }
  return sum / n;
}
// 2D value noise, periodic with integer period p (for seamless textures)
function vnoise2P(x, y, p, s) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const u = fade(x - xi), v = fade(y - yi);
  const X0 = ((xi % p) + p) % p, Y0 = ((yi % p) + p) % p, X1 = (X0 + 1) % p, Y1 = (Y0 + 1) % p;
  return lerp(lerp(hash3i(X0, Y0, 0, s), hash3i(X1, Y0, 0, s), u), lerp(hash3i(X0, Y1, 0, s), hash3i(X1, Y1, 0, s), u), v) * 2 - 1;
}
function fbm2P(x, y, p, oct, s, gain = 0.5) {
  let a = 0.5, f = 1, sum = 0, n = 0;
  for (let o = 0; o < oct; o++) { sum += a * vnoise2P(x * f, y * f, p * f, s + o * 31); n += a; a *= gain; f *= 2; }
  return sum / n;
}
// Periodic Worley noise: writes F1/F2 into WOR
const WOR = { f1: 0, f2: 0, id: 0 };
function worleyP(x, y, p, s) {
  const xi = Math.floor(x), yi = Math.floor(y);
  let f1 = 1e9, f2 = 1e9, id = 0;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const cx = xi + i, cy = yi + j;
    const wx = ((cx % p) + p) % p, wy = ((cy % p) + p) % p;
    const px = cx + hash3i(wx, wy, 1, s), py = cy + hash3i(wx, wy, 2, s);
    const dx = px - x, dy = py - y, d = Math.sqrt(dx * dx + dy * dy);
    if (d < f1) { f2 = f1; f1 = d; id = hash3i(wx, wy, 3, s); } else if (d < f2) f2 = d;
  }
  WOR.f1 = f1; WOR.f2 = f2; WOR.id = id;
  return WOR;
}
function srgbHex(hex) { return [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255]; }
function mix3(a, b, t) { return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]; }

/* ------------------------------------------------------------------ 2. PROCEDURAL TEXTURES */
let MAX_ANISO = 8;
function dataTex(data, w, h, srgb) {
  const t = new THREE.DataTexture(data, w, h, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true; t.anisotropy = MAX_ANISO;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.needsUpdate = true;
  return t;
}
function canvasTex(cv, srgb = true) {
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = MAX_ANISO; t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}
function makeCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
// Height field (0..1, wrapping) -> tangent-space normal map. DataTexture rows run along +v.
function heightToNormal(H, w, h, strength) {
  const out = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const xl = (x - 1 + w) % w, xr = (x + 1) % w, yd = (y - 1 + h) % h, yu = (y + 1) % h;
    const dx = (H[y * w + xr] - H[y * w + xl]) * 0.5 * strength;
    const dy = (H[yu * w + x] - H[yd * w + x]) * 0.5 * strength;
    let nx = -dx, ny = -dy, nz = 1; const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    const i = (y * w + x) * 4;
    out[i] = nx * 127.5 + 127.5; out[i + 1] = ny * 127.5 + 127.5; out[i + 2] = nz * 127.5 + 127.5; out[i + 3] = 255;
  }
  return out;
}
// Generic "albedo + height" generator: fn(u, v) returns [r,g,b (sRGB 0..255), height 0..1, rough 0..1]
function genSurface(size, fn, normalStrength) {
  const alb = new Uint8Array(size * size * 4), H = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const r = fn(x / size, y / size, x, y);
    const i = (y * size + x) * 4;
    alb[i] = r[0]; alb[i + 1] = r[1]; alb[i + 2] = r[2]; alb[i + 3] = clamp(r[4] === undefined ? 200 : r[4] * 255, 0, 255);
    H[y * size + x] = r[3];
  }
  return { map: dataTex(alb, size, size, true), normalMap: dataTex(heightToNormal(H, size, size, normalStrength), size, size, false) };
}

const TEX = {};
async function buildTextures() {
  const S = 256;

  // --- Water detail normal: tileable FBM ripples
  {
    const N = 512, H = new Float32Array(N * N);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const u = x / N, v = y / N;
      H[y * N + x] = fbm2P(u * 8, v * 8, 8, 5, 11, 0.55) * 0.6 + fbm2P(u * 16 + 3.1, v * 16, 16, 3, 29) * 0.25;
    }
    TEX.waterNormal = dataTex(heightToNormal(H, N, N, 26), N, N, false);
  }
  await pondStyleProgress(0.08, '生成水面波纹');

  // --- Caustics: Voronoi cell-edge network, softened (two copies are multiplied in-shader)
  {
    const N = 512, data = new Uint8Array(N * N * 4); let sum = 0;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const u = x / N * 7, v = y / N * 7;
      // domain-warp for organic, non-polygonal cells
      const wu = u + fbm2P(x / N * 4, y / N * 4, 4, 3, 5) * 0.35, wv = v + fbm2P(x / N * 4 + 7, y / N * 4, 4, 3, 6) * 0.35;
      worleyP(wu, wv, 7, 77);
      const edge = WOR.f2 - WOR.f1;
      const c = Math.pow(1 - smoothstep(0.0, 0.34, edge), 2.2) * 0.85 + 0.15 * (1 - WOR.f1);
      const i = (y * N + x) * 4; const b = clamp(c, 0, 1) * 255;
      data[i] = data[i + 1] = data[i + 2] = b; data[i + 3] = 255; sum += c;
    }
    TEX.caustics = dataTex(data, N, N, false);
    TEX.causticMean = sum / (N * N);
  }
  await pondStyleProgress(0.16, '生成水下焦散');

  // --- Granite: speckled feldspar/quartz/biotite with subtle grain
  {
    TEX.granite = genSurface(512, (u, v) => {
      const base = fbm2P(u * 6, v * 6, 6, 4, 101) * 0.5 + 0.5;
      const sp = hash3i(Math.floor(u * 512), Math.floor(v * 512), 7, 3);
      const sp2 = fbm2P(u * 96, v * 96, 96, 2, 7) * 0.5 + 0.5;
      let c = mix3(srgbHex(0x837f79), srgbHex(0x9c978e), base);
      if (sp2 > 0.74) c = mix3(c, srgbHex(0x3a3836), smoothstep(0.74, 0.82, sp2) * 0.65);   // biotite flecks
      else if (sp > 0.95) c = mix3(c, srgbHex(0xcdc8bd), 0.45);                             // quartz glints
      else if (sp2 < 0.3) c = mix3(c, srgbHex(0xa08a7a), 0.35);                             // pink feldspar tint
      const h = base * 0.4 + sp2 * 0.5 + sp * 0.1;
      return [c[0], c[1], c[2], h, 0.78];
    }, 5);
    TEX.boulder = genSurface(512, (u, v) => {
      const b = fbm2P(u * 5, v * 5, 5, 5, 211) * 0.5 + 0.5;
      const f = fbm2P(u * 40, v * 40, 40, 3, 17) * 0.5 + 0.5;
      const lich = smoothstep(0.62, 0.72, fbm2P(u * 9, v * 9, 9, 4, 303) * 0.5 + 0.5);
      let c = mix3(srgbHex(0x6d6860), srgbHex(0x958d80), b * 0.7 + f * 0.3);
      c = mix3(c, srgbHex(0xa7a48f), lich * 0.55);
      return [c[0], c[1], c[2], b * 0.6 + f * 0.4, 0.8];
    }, 6);
    TEX.moss = genSurface(256, (u, v) => {
      const a = fbm2P(u * 16, v * 16, 16, 4, 404) * 0.5 + 0.5, b = hash3i(u * 256 | 0, v * 256 | 0, 1, 9);
      const c = mix3(srgbHex(0x3f5a1c), srgbHex(0x7f9a34), a * 0.8 + b * 0.2);
      return [c[0], c[1], c[2], a * 0.7 + b * 0.3, 0.9];
    }, 4);
  }
  await pondStyleProgress(0.26, '生成石材与苔藓');

  // --- Gravel: dense pebbles (Worley domes), fine & high-frequency normal
  {
    TEX.gravel = genSurface(512, (u, v) => {
      // two interleaved pebble sizes bedded in coarse sand
      worleyP(u * 14, v * 14, 14, 55); const f1a = WOR.f1, ea = WOR.f2 - WOR.f1, ida = WOR.id;
      worleyP(u * 27 + 0.37, v * 27 + 0.11, 27, 56); const f1b = WOR.f1, eb = WOR.f2 - WOR.f1, idb = WOR.id;
      const domeA = smoothstep(0.6, 0.12, f1a) * smoothstep(0.0, 0.16, ea);
      const domeB = smoothstep(0.58, 0.12, f1b) * smoothstep(0.0, 0.14, eb) * 0.92;
      const useA = domeA >= domeB, dome = useA ? domeA : domeB, id = useA ? ida : idb;
      const tones = [0x9c907c, 0x847a6a, 0x6f685f, 0xb0a792, 0x5e5850, 0x93806a, 0xa89f8f, 0x77746c];
      const fine = fbm2P(u * 96, v * 96, 96, 2, 8) * 0.5 + 0.5;
      let peb = srgbHex(tones[Math.floor(id * tones.length)]).map((q) => q * (0.86 + 0.2 * fine));
      const sand = mix3(srgbHex(0x6e6556), srgbHex(0x958a76), hash3i(u * 512 | 0, v * 512 | 0, 4, 2) * 0.6 + fine * 0.4);
      const c = mix3(sand, peb, smoothstep(0.04, 0.3, dome));
      return [c[0], c[1], c[2], Math.pow(dome, 0.6) * 0.85 + fine * 0.08, 0.92];
    }, 7);
  }
  await pondStyleProgress(0.34, '铺设池底卵石');

  // --- Ground: fine moss/grass lawn with soil patches
  {
    TEX.ground = genSurface(512, (u, v, x, y) => {
      const patch = fbm2P(u * 4, v * 4, 4, 4, 606) * 0.5 + 0.5;
      const blade = hash3i(x, y >> 1, 3, 1);
      const fine = fbm2P(u * 48, v * 48, 48, 3, 88) * 0.5 + 0.5;
      let c = mix3(srgbHex(0x34461c), srgbHex(0x56692c), fine * 0.6 + blade * 0.4);
      c = mix3(c, srgbHex(0x2b3a17), smoothstep(0.4, 0.2, patch) * 0.6);   // dense moss
      c = mix3(c, srgbHex(0x6b6a3a), smoothstep(0.6, 0.75, patch) * 0.45); // drier grass
      c = mix3(c, srgbHex(0x4f4232), smoothstep(0.78, 0.9, patch) * 0.6);  // bare soil
      return [c[0], c[1], c[2], fine * 0.5 + blade * 0.5, 0.95];
    }, 3);
  }
  await pondStyleProgress(0.4, '铺设草地');

  // --- Wood (cedar): grain stretched along u, annual rings, pores
  {
    TEX.wood = genSurface(512, (u, v) => {
      // flat-sawn cedar: warped annual rings with dark latewood, fine fibres along the grain, occasional knots
      const warp = fbm2P(u * 2, v * 6, 2, 3, 71) * 0.9 + fbm2P(u * 8, v * 16, 8, 2, 13) * 0.15;
      let kd = 9;
      for (const [kx, ky] of [[0.23, 0.31], [0.71, 0.77]]) { const dx = (((u - kx + 1.5) % 1) - 0.5) * 3, dy = (((v - ky + 1.5) % 1) - 0.5) * 9; kd = Math.min(kd, Math.hypot(dx, dy)); }
      const ring = Math.sin((v * 26 + warp * 5 + 0.6 / (kd + 0.25)) * Math.PI * 2) * 0.5 + 0.5, late = Math.pow(ring, 6);
      const fibre = fbm2P(u * 96, v * 384, 96, 2, 3) * 0.5 + 0.5, blot = fbm2P(u * 3, v * 3, 3, 3, 21) * 0.5 + 0.5;
      let c = mix3(srgbHex(0xab6c42), srgbHex(0x86492a), late * 0.75 + (1 - fibre) * 0.25);
      c = mix3(c, srgbHex(0xc48a58), smoothstep(0.55, 0.75, blot) * 0.3);
      const knot = smoothstep(0.32, 0.06, kd); c = mix3(c, srgbHex(0x40200f), knot * 0.85);
      return [c[0], c[1], c[2], late * 0.35 + fibre * 0.45 + knot * 0.3, 0.6];
    }, 3);
  }
  // --- Bark: deep vertical fissures
  {
    TEX.bark = genSurface(512, (u, v) => {
      // furrowed bark: long, slightly wandering vertical fissures that break the surface into small elongated plates,
      // flaking edges, grey-green lichen patches and a few specks of moss (no big regular "snakeskin" cells)
      const warp = fbm2P(u * 6, v * 2, 6, 3, 12) * 0.05;
      worleyP((u + warp) * 22, v * 6, 22, 515);
      const plateEdge = smoothstep(0.0, 0.09, WOR.f2 - WOR.f1), id = WOR.id;
      const fis = Math.abs(fbm2P((u + warp) * 18, v * 1.5, 18, 3, 7));
      const furrow = smoothstep(0.0, 0.16, fis);
      const flake = fbm2P(u * 64, v * 32, 64, 3, 9) * 0.5 + 0.5, grain = fbm2P(u * 96, v * 12, 96, 2, 21) * 0.5 + 0.5;
      const lich = smoothstep(0.62, 0.75, fbm2P(u * 5, v * 3, 5, 4, 31) * 0.5 + 0.5) * smoothstep(0.3, 0.6, flake);
      const h = furrow * (0.55 + 0.45 * plateEdge) * (0.8 + 0.2 * flake);
      let c = mix3(srgbHex(0x1c1714), mix3(srgbHex(0x4d443c), srgbHex(0x736a60), id * 0.5 + grain * 0.5), h);
      c = mix3(c, srgbHex(0x8a7a66), smoothstep(0.75, 0.95, flake) * h * 0.3);          // paler freshly exposed bark
      c = mix3(c, srgbHex(0x8a937a), lich * 0.7);                                          // crustose lichen
      c = mix3(c, srgbHex(0x3f5226), smoothstep(0.8, 0.92, fbm2P(u * 9, v * 5, 9, 3, 41) * 0.5 + 0.5) * (1 - h) * 0.6);   // moss in the furrows
      return [c[0], c[1], c[2], h * 0.85 + flake * 0.15, 0.92 - lich * 0.1];
    }, 7);
  }
  // --- Roof tiles (kawara): rows of round-profile pan tiles
  {
    TEX.roof = genSurface(512, (u, v) => {
      const cols = 16, rows = 12;
      const cu = (u * cols) % 1, rv = (v * rows) % 1;
      const barrel = Math.sin(cu * Math.PI);                 // round tile profile
      const lap = smoothstep(0.0, 0.18, rv) * (1 - 0.35 * rv); // overlap step at each course
      const n = fbm2P(u * 32, v * 32, 32, 3, 44) * 0.5 + 0.5;
      const h = barrel * 0.6 + lap * 0.4;
      let c = mix3(srgbHex(0x2f3336), srgbHex(0x4b5054), barrel * 0.7 + n * 0.3);
      c = mix3(c, srgbHex(0x1c1e20), (1 - lap) * 0.6);
      return [c[0], c[1], c[2], h, 0.55 + n * 0.2];
    }, 8);
  }
  await pondStyleProgress(0.48, '生成木纹、树皮与瓦片');

  // --- Leaf-card atlases (drawn on canvas with alpha)
  TEX.mapleLeaves = leafCard('maple');
  TEX.pineNeedles = leafCard('pine');
  TEX.greenLeaves = leafCard('deciduous');
  TEX.shrubLeaves = leafCard('shrub');
  TEX.bloomLeaves = leafCard('bloom');
  TEX.conifer = leafCard('conifer');
  TEX.sakura = leafCard('willow');   // 校园版：原樱花叶卡换成垂柳叶卡
  TEX.hydrangea = leafCard('hydrangea'); TEX.bigleaf = leafCard('bigleaf'); TEX.camellia = leafCard('camellia'); TEX.bambooLeaves = leafCard('bamboo'); TEX.kikyo = leafCard('kikyo');
  // cherry bark: smooth, dark red-brown with horizontal lenticel dashes and peeling coppery bands
  TEX.sakuraBark = genSurface(512, (u, v) => {
    const n = fbm2P(u * 6, v * 6, 6, 4, 31) * 0.5 + 0.5, fine = fbm2P(u * 48, v * 48, 48, 2, 32) * 0.5 + 0.5;
    const row = v * 30, rid = Math.floor(row), fr = row - rid, cols = 5, off = hash3i(rid, 0, 1, 77) * cols;
    const cu = (u * cols + off) % 1, len = 0.25 + 0.5 * hash3i(rid, Math.floor(u * cols + off), 2, 78);
    const lent = smoothstep(0.2, 0.08, Math.abs(fr - 0.5)) * smoothstep(0.0, 0.06, cu) * smoothstep(len, len - 0.06, cu);
    const band = smoothstep(0.62, 0.72, fbm2P(u * 2, v * 3, 2, 3, 33) * 0.5 + 0.5);
    let c = mix3(srgbHex(0x2e2224), srgbHex(0x4d3a38), n * 0.7 + fine * 0.3);
    c = mix3(c, srgbHex(0x6e4232), band * 0.55);
    c = mix3(c, srgbHex(0x8c7a68), lent * 0.8);
    c = mix3(c, srgbHex(0x7c8472), smoothstep(0.7, 0.85, fbm2P(u * 12, v * 12, 12, 3, 34) * 0.5 + 0.5) * 0.45);   // grey-green lichen
    return [c[0], c[1], c[2], 0.5 + fine * 0.15 + lent * 0.25 - band * 0.05, 0.75 - band * 0.2];
  }, 5);
  TEX.lily = lilyTex();
  await pondStyleProgress(0.56, '生成枝叶');
}

// Palmate maple, pine needle tufts, etc. Each card holds a cluster of leaves on transparent ground.
function leafCard(kind) {
  const N = 512, cv = makeCanvas(N, N), g = cv.getContext('2d');
  const R = mulberry32(kind.length * 977 + 13);
  const rr2 = (a, b) => a + (b - a) * R();
  g.clearRect(0, 0, N, N);
  g.lineCap = 'round';
  function palmate(x, y, s, rot, col) {
    // Acer palmatum: seven pointed, finely serrated lobes; darker base, lighter tips, pale veins
    g.save(); g.translate(x, y); g.rotate(rot);
    const lobes = 7, path = new Path2D();
    for (let i = 0; i <= 280; i++) {
      const a = (i / 280) * Math.PI * 2;
      const lobe = Math.pow(Math.abs(Math.cos(a * lobes / 2)), 2.2);
      const serr = 1 + 0.045 * Math.sin(a * 90) * lobe;
      const r = s * (0.24 + 0.76 * lobe) * serr * (a > Math.PI * 0.8 && a < Math.PI * 1.2 ? 0.45 : 1);
      const px = Math.sin(a) * r, py = -Math.cos(a) * r;
      i ? path.lineTo(px, py) : path.moveTo(px, py);
    }
    const grd = g.createRadialGradient(0, 0, 1, 0, 0, s);
    const shade = (dl) => col.replace(/,([\d.]+)%,([\d.]+)\)$/, (m0, l, al) => `,${Math.max(8, +l + dl)}%,${al})`);
    grd.addColorStop(0, shade(-10)); grd.addColorStop(1, shade(8));
    g.fillStyle = grd; g.fill(path);
    g.strokeStyle = 'rgba(255,190,170,0.28)'; g.lineWidth = 1;
    for (let k = 0; k < lobes; k++) { const a = (k / lobes) * Math.PI * 2 + Math.PI / lobes; if (Math.abs(a - Math.PI) < 0.5) continue; g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.sin(a) * s * 0.85, -Math.cos(a) * s * 0.85); g.stroke(); }
    g.strokeStyle = 'rgba(60,20,10,0.8)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(0, s * 0.2); g.lineTo(0, s * 0.55); g.stroke();
    g.restore();
  }
  function ovate(x, y, w, h, rot, col, vein = true) {
    g.save(); g.translate(x, y); g.rotate(rot); g.fillStyle = col; g.beginPath();
    g.moveTo(0, -h); g.bezierCurveTo(w, -h * 0.5, w * 0.8, h * 0.6, 0, h); g.bezierCurveTo(-w * 0.8, h * 0.6, -w, -h * 0.5, 0, -h); g.fill();
    if (vein) { g.strokeStyle = 'rgba(0,0,0,0.18)'; g.lineWidth = Math.max(1, w * 0.08); g.beginPath(); g.moveTo(0, -h * 0.9); g.lineTo(0, h); g.stroke(); }
    g.restore();
  }
  const hsl = (h, s, l, a = 1) => `hsla(${h},${s}%,${l}%,${a})`;
  if (kind === 'maple') {
    // twigs then ~34 leaves
    g.strokeStyle = '#3a2418'; g.lineWidth = 3;
    for (let i = 0; i < 6; i++) { g.beginPath(); g.moveTo(N / 2, N / 2); g.lineTo(rr2(40, N - 40), rr2(40, N - 40)); g.stroke(); }
    for (let i = 0; i < 38; i++) {
      const a = R() * Math.PI * 2, d = Math.sqrt(R()) * N * 0.38;
      palmate(N / 2 + Math.cos(a) * d, N / 2 + Math.sin(a) * d, rr2(34, 58), R() * 6.28, hsl(rr2(352, 370) % 360, rr2(58, 76), rr2(30, 45)));
    }
  } else if (kind === 'pine') {
    for (let t = 0; t < 9; t++) {
      const cx = rr2(90, N - 90), cy = rr2(90, N - 90);
      g.strokeStyle = '#3b2c20'; g.lineWidth = 5; g.beginPath(); g.moveTo(cx, cy + 60); g.lineTo(cx, cy); g.stroke();
      for (let i = 0; i < 90; i++) {
        const a = -Math.PI / 2 + rr2(-1.5, 1.5), len = rr2(40, 95);
        g.strokeStyle = hsl(rr2(95, 125), rr2(30, 45), rr2(16, 28)); g.lineWidth = rr2(1.6, 2.8);
        g.beginPath(); g.moveTo(cx, cy); g.quadraticCurveTo(cx + Math.cos(a) * len * 0.5, cy + Math.sin(a) * len * 0.5 - 6, cx + Math.cos(a) * len, cy + Math.sin(a) * len); g.stroke();
      }
    }
  } else if (kind === 'deciduous') {
    g.strokeStyle = '#3a3020'; g.lineWidth = 3;
    for (let i = 0; i < 5; i++) { g.beginPath(); g.moveTo(N / 2, N * 0.9); g.lineTo(rr2(40, N - 40), rr2(40, N - 60)); g.stroke(); }
    for (let i = 0; i < 70; i++) {
      const a = R() * Math.PI * 2, d = Math.sqrt(R()) * N * 0.4;
      ovate(N / 2 + Math.cos(a) * d, N / 2 + Math.sin(a) * d, rr2(14, 22), rr2(26, 40), R() * 6.28, hsl(rr2(75, 100), rr2(38, 55), rr2(24, 40)));
    }
  } else if (kind === 'shrub' || kind === 'bloom') {
    for (let i = 0; i < 150; i++) {
      const a = R() * Math.PI * 2, d = Math.sqrt(R()) * N * 0.44;
      ovate(N / 2 + Math.cos(a) * d, N / 2 + Math.sin(a) * d, rr2(8, 13), rr2(15, 22), R() * 6.28, hsl(rr2(85, 110), rr2(35, 50), rr2(18, 32)), false);
    }
    if (kind === 'bloom') {
      // five-petal azalea flowers only (white; tinted per instance), laid over the shrub shell
      g.clearRect(0, 0, N, N);
      for (let i = 0; i < 30; i++) {
        const a = R() * Math.PI * 2, d = Math.sqrt(R()) * N * 0.38, x = N / 2 + Math.cos(a) * d, y = N / 2 + Math.sin(a) * d, s = rr2(18, 28);
        for (let p = 0; p < 5; p++) ovate(x + Math.cos(p * 1.2566) * s * 0.55, y + Math.sin(p * 1.2566) * s * 0.55, s * 0.45, s * 0.6, p * 1.2566 + Math.PI / 2, hsl(0, 0, rr2(88, 96)), false);
        g.fillStyle = 'rgba(120,40,60,0.8)'; g.beginPath(); g.arc(x, y, s * 0.18, 0, 6.28); g.fill();
      }
    }
  } else if (kind === 'willow') {
    // 垂柳：从上往下垂的细长柳条，条上挂满狭长披针形叶
    g.lineCap = 'round';
    for (let k = 0; k < 15; k++) {
      const x0 = rr2(30, N - 30), sway = rr2(-40, 40), len = rr2(N * 0.55, N * 0.98);
      g.strokeStyle = hsl(rr2(55, 75), 30, 26); g.lineWidth = rr2(1.2, 2.2);
      g.beginPath(); g.moveTo(x0, 0); g.quadraticCurveTo(x0 + sway * 0.3, len * 0.5, x0 + sway, len); g.stroke();
      for (let t = 0.04; t < 1.0; t += rr2(0.035, 0.06)) {
        const yy = len * t, xx = x0 + sway * t * t, side = (k + Math.round(t * 40)) % 2 ? 1 : -1;
        ovate(xx + side * 7, yy + 4, rr2(2.6, 4.2), rr2(13, 20), side * rr2(0.25, 0.55), hsl(rr2(78, 100), rr2(42, 60), rr2(30, 48)), false);
      }
    }
  } else if (kind === 'sakura') {
    // Somei-yoshino: clusters of 3-5 pale blush flowers on long pedicels, notched petals, pink centres and stamens,
    // deep-pink buds and a few bronze young leaves along dark twigs
    g.lineCap = 'round';
    for (let i = 0; i < 4; i++) { g.strokeStyle = '#4a3430'; g.lineWidth = rr2(1.5, 3); g.beginPath(); g.moveTo(N / 2 + rr2(-50, 50), N * 0.97); g.quadraticCurveTo(rr2(80, N - 80), rr2(160, 360), rr2(30, N - 30), rr2(30, N - 80)); g.stroke(); }
    for (let i = 0; i < 4; i++) ovate(rr2(60, N - 60), rr2(60, N - 60), rr2(8, 12), rr2(16, 24), R() * 6.28, hsl(rr2(14, 36), rr2(40, 55), rr2(30, 40)));
    const flower = (x, y, s, rot, squash) => {
      g.save(); g.translate(x, y); g.rotate(rot); g.scale(1, squash);
      for (let p = 0; p < 5; p++) {
        g.save(); g.rotate(p * 1.2566 + rr2(-0.08, 0.08));
        const L = s * rr2(0.92, 1.05), W = s * 0.62;
        const grd = g.createLinearGradient(0, 0, 0, -L); grd.addColorStop(0, '#ef8fae'); grd.addColorStop(0.3, '#fbd5e0'); grd.addColorStop(1, '#fff3f6');
        g.fillStyle = grd; g.beginPath(); g.moveTo(0, 0);
        g.bezierCurveTo(W * 0.9, -L * 0.25, W * 0.75, -L * 0.95, W * 0.2, -L); g.lineTo(0, -L * 0.86); g.lineTo(-W * 0.2, -L);
        g.bezierCurveTo(-W * 0.75, -L * 0.95, -W * 0.9, -L * 0.25, 0, 0); g.fill();
        g.strokeStyle = 'rgba(225,140,165,0.3)'; g.lineWidth = 0.6; g.beginPath(); g.moveTo(0, -2); g.lineTo(0, -L * 0.8); g.stroke();
        g.restore();
      }
      g.fillStyle = '#c84a70'; g.beginPath(); g.arc(0, 0, s * 0.2, 0, 6.28); g.fill();
      for (let k = 0; k < 14; k++) { const a = k * 0.449 + rr2(-0.1, 0.1), r = s * rr2(0.3, 0.45); g.strokeStyle = 'rgba(250,240,235,0.9)'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(a) * r, Math.sin(a) * r); g.stroke(); g.fillStyle = '#d9b25c'; g.beginPath(); g.arc(Math.cos(a) * r, Math.sin(a) * r, 1.3, 0, 6.28); g.fill(); }
      g.restore();
    };
    for (let c = 0; c < 24; c++) {
      const cx = rr2(60, N - 60), cy = rr2(60, N - 60), nF = 3 + (R() * 3 | 0);
      for (let f = 0; f < nF; f++) {
        const a = R() * 6.28, L = rr2(16, 34), fx = cx + Math.cos(a) * L, fy = cy + Math.sin(a) * L;
        g.strokeStyle = '#8a5048'; g.lineWidth = 1.0; g.beginPath(); g.moveTo(cx, cy); g.lineTo(fx, fy); g.stroke();
        if (R() < 0.12) { g.fillStyle = hsl(rr2(340, 350), 60, 62); g.beginPath(); g.ellipse(fx, fy, 5, 8, a + 1.57, 0, 6.28); g.fill(); }
        else flower(fx, fy, rr2(14, 20), R() * 6.28, rr2(0.55, 1.0));
      }
    }
  } else if (kind === 'hydrangea') {
    // mophead: densely packed four-sepal florets (near-white; tinted blue / purple / pink per instance)
    for (let i = 0; i < 120; i++) {
      const a = R() * Math.PI * 2, d = Math.sqrt(R()) * N * 0.43, x = N / 2 + Math.cos(a) * d, y = N / 2 + Math.sin(a) * d, s = rr2(20, 30), rot = R() * 6.28, l = rr2(78, 94);
      for (let p = 0; p < 4; p++) {
        const pa = rot + p * Math.PI / 2;
        g.save(); g.translate(x + Math.cos(pa) * s * 0.42, y + Math.sin(pa) * s * 0.42); g.rotate(pa + Math.PI / 2);
        const grd = g.createRadialGradient(0, s * 0.3, 1, 0, 0, s * 0.6); grd.addColorStop(0, hsl(0, 0, l - 12)); grd.addColorStop(1, hsl(0, 0, l));
        g.fillStyle = grd; g.beginPath(); g.ellipse(0, 0, s * 0.36, s * 0.46, 0, 0, 6.28); g.fill();
        g.strokeStyle = 'rgba(0,0,0,0.08)'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(0, s * 0.35); g.lineTo(0, -s * 0.35); g.stroke();
        g.restore();
      }
      g.fillStyle = 'rgba(40,40,60,0.45)'; g.beginPath(); g.arc(x, y, 2.2, 0, 6.28); g.fill();
    }
  } else if (kind === 'bigleaf') {
    // broad ovate leaves with an acuminate tip, fine serration and pinnate veins (hydrangea / peony foliage)
    for (let i = 0; i < 26; i++) {
      const a = R() * Math.PI * 2, d = Math.sqrt(R()) * N * 0.34, x = N / 2 + Math.cos(a) * d, y = N / 2 + Math.sin(a) * d, w = rr2(26, 40), h = rr2(50, 72), rot = R() * 6.28;
      g.save(); g.translate(x, y); g.rotate(rot);
      const path = new Path2D(), side = (sgn) => { for (let k = 0; k <= 40; k++) { const t = k / 40, hw = w * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.75)), 0.85) * (1 + 0.05 * ((k % 2) ? 1 : -1) * Math.min(1, t * 3)); path.lineTo(sgn * hw, h - 2 * h * t); } };
      path.moveTo(0, h); side(1); for (let k = 40; k >= 0; k--) { const t = k / 40, hw = w * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.75)), 0.85) * (1 + 0.05 * ((k % 2) ? 1 : -1) * Math.min(1, t * 3)); path.lineTo(-hw, h - 2 * h * t); }
      const grd = g.createLinearGradient(-w, 0, w, 0); const L0 = rr2(18, 26); grd.addColorStop(0, hsl(rr2(92, 108), 45, L0 - 3)); grd.addColorStop(0.5, hsl(rr2(92, 105), 42, L0 + 4)); grd.addColorStop(1, hsl(rr2(95, 110), 48, L0 - 5));
      g.fillStyle = grd; g.fill(path);
      g.strokeStyle = 'rgba(190,220,150,0.28)'; g.lineWidth = 1.3; g.beginPath(); g.moveTo(0, h); g.lineTo(0, -h * 0.95); g.stroke();
      g.lineWidth = 0.7; for (let k = 1; k <= 6; k++) { const yy = h - k * h * 0.28; for (const sg of [1, -1]) { g.beginPath(); g.moveTo(0, yy); g.quadraticCurveTo(sg * w * 0.45, yy - h * 0.12, sg * w * 0.78, yy - h * 0.3); g.stroke(); } }
      g.restore();
    }
  } else if (kind === 'camellia') {
    // Camellia japonica: glossy dark elliptic leaves, crimson cup-shaped flowers with a golden stamen boss
    for (let i = 0; i < 64; i++) {
      const a = R() * Math.PI * 2, d = Math.sqrt(R()) * N * 0.44;
      ovate(N / 2 + Math.cos(a) * d, N / 2 + Math.sin(a) * d, rr2(14, 19), rr2(28, 36), R() * 6.28, hsl(rr2(105, 125), rr2(40, 55), rr2(14, 24)));
    }
    for (let i = 0; i < 5; i++) { g.strokeStyle = 'rgba(230,255,220,0.25)'; g.lineWidth = 3; g.beginPath(); const x = rr2(60, N - 60), y = rr2(60, N - 60); g.arc(x, y, 14, 3.6, 4.6); g.stroke(); }
    for (let f = 0; f < 1; f++) {
      const x = rr2(120, N - 120), y = rr2(120, N - 120), s = rr2(42, 52);
      for (let p = 0; p < 6; p++) { const pa = p * 1.047 + R() * 0.3; g.save(); g.translate(x + Math.cos(pa) * s * 0.42, y + Math.sin(pa) * s * 0.42); g.rotate(pa + Math.PI / 2);
        const grd = g.createRadialGradient(0, s * 0.3, 2, 0, 0, s * 0.62); grd.addColorStop(0, '#7a0614'); grd.addColorStop(0.6, '#b8102a'); grd.addColorStop(1, '#d42a40');
        g.fillStyle = grd; g.beginPath(); g.ellipse(0, 0, s * 0.42, s * 0.5, 0, 0, 6.28); g.fill(); g.restore(); }
      g.fillStyle = '#f2e6a0'; g.beginPath(); g.arc(x, y, s * 0.2, 0, 6.28); g.fill();
      for (let k = 0; k < 28; k++) { const aa = R() * 6.28, rr0 = s * rr2(0.08, 0.2); g.fillStyle = '#e8b820'; g.beginPath(); g.arc(x + Math.cos(aa) * rr0, y + Math.sin(aa) * rr0, 2.4, 0, 6.28); g.fill(); }
    }
  } else if (kind === 'bamboo') {
    // sprays of long lanceolate leaves hanging from thin twigs
    for (let sp = 0; sp < 5; sp++) {
      const x0 = rr2(120, N - 120), y0 = rr2(40, 160);
      g.strokeStyle = '#6a7a3a'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x0 + rr2(-40, 40), y0 + 90); g.stroke();
      for (let l = 0; l < 7; l++) {
        const ang = Math.PI / 2 + rr2(-1.1, 1.1), L = rr2(130, 190), W = rr2(11, 16), bx = x0 + rr2(-20, 20), by = y0 + rr2(20, 90);
        g.save(); g.translate(bx, by); g.rotate(ang - Math.PI / 2);
        const grd = g.createLinearGradient(0, 0, 0, L); grd.addColorStop(0, hsl(rr2(80, 95), 40, 26)); grd.addColorStop(1, hsl(rr2(75, 90), 45, 38));
        g.fillStyle = grd; g.beginPath(); g.moveTo(0, 0); g.bezierCurveTo(W, L * 0.15, W * 0.8, L * 0.7, 0, L); g.bezierCurveTo(-W * 0.8, L * 0.7, -W, L * 0.15, 0, 0); g.fill();
        g.strokeStyle = 'rgba(220,240,180,0.3)'; g.lineWidth = 1; g.beginPath(); g.moveTo(0, 2); g.lineTo(0, L * 0.95); g.stroke();
        g.restore();
      }
    }
  } else if (kind === 'kikyo') {
    // Platycodon: open five-pointed violet-blue stars with darker veins, balloon buds, slender leaves
    for (let i = 0; i < 26; i++) ovate(rr2(40, N - 40), rr2(60, N - 20), rr2(7, 10), rr2(18, 26), rr2(-0.6, 0.6), hsl(rr2(90, 110), 40, rr2(22, 32)));
    for (let f = 0; f < 9; f++) {
      const x = rr2(60, N - 60), y = rr2(50, N - 120), s = rr2(26, 36);
      if (R() < 0.3) { g.fillStyle = hsl(260, 45, 58); g.beginPath(); g.ellipse(x, y, s * 0.35, s * 0.42, 0, 0, 6.28); g.fill(); continue; }
      g.save(); g.translate(x, y); g.rotate(R() * 6.28);
      const path = new Path2D(); for (let k = 0; k <= 10; k++) { const aa = k / 10 * Math.PI * 2 - Math.PI / 2, r = k % 2 ? s * 0.45 : s; path.lineTo(Math.cos(aa) * r, Math.sin(aa) * r); }
      const grd = g.createRadialGradient(0, 0, 2, 0, 0, s); grd.addColorStop(0, '#d8d2f0'); grd.addColorStop(0.35, '#7a62c8'); grd.addColorStop(1, '#5a44b0');
      g.fillStyle = grd; g.fill(path); g.strokeStyle = 'rgba(40,20,90,0.5)'; g.lineWidth = 0.8;
      for (let k = 0; k < 5; k++) { const aa = k / 5 * Math.PI * 2 - Math.PI / 2; g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(aa) * s * 0.9, Math.sin(aa) * s * 0.9); g.stroke(); }
      g.fillStyle = '#f4f0e0'; g.beginPath(); g.arc(0, 0, s * 0.1, 0, 6.28); g.fill(); g.restore();
    }
  } else if (kind === 'conifer') {
    for (let i = 0; i < 260; i++) {
      const x = rr2(30, N - 30), y = rr2(30, N - 30), a = rr2(-2.6, -0.5), len = rr2(30, 70);
      g.strokeStyle = hsl(rr2(110, 140), rr2(25, 40), rr2(12, 22)); g.lineWidth = rr2(2, 4);
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len); g.stroke();
    }
  }
  return canvasTex(cv, true);
}

function lilyTex() {
  const N = 256, cv = makeCanvas(N, N), g = cv.getContext('2d');
  const grd = g.createRadialGradient(N / 2, N / 2, 4, N / 2, N / 2, N / 2);
  grd.addColorStop(0, '#5f7a2c'); grd.addColorStop(0.8, '#3f5f22'); grd.addColorStop(1, '#6b3a2a');
  g.fillStyle = grd; g.fillRect(0, 0, N, N);
  g.strokeStyle = 'rgba(160,190,90,0.35)'; g.lineWidth = 1.5;
  for (let i = 0; i < 26; i++) { const a = (i / 26) * Math.PI * 2; g.beginPath(); g.moveTo(N / 2, N / 2); g.lineTo(N / 2 + Math.cos(a) * N / 2, N / 2 + Math.sin(a) * N / 2); g.stroke(); }
  return canvasTex(cv, true);
}

/* ------------------------------------------------------------------ 3. GEOMETRY HELPERS */
function mergeGeos(geos) {
  let nv = 0, ni = 0; const hasColor = geos.some((g) => g.attributes.color), hasBox = geos.some((g) => g.attributes.aBox);
  for (const g of geos) { nv += g.attributes.position.count; ni += g.index ? g.index.count : g.attributes.position.count; }
  const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), uv = new Float32Array(nv * 2);
  const col = hasColor ? new Float32Array(nv * 3).fill(1) : null, idx = new Uint32Array(ni);
  const box = hasBox ? new Float32Array(nv * 3) : null, half = hasBox ? new Float32Array(nv * 4) : null;
  let vo = 0, io = 0;
  for (const g of geos) {
    if (!g.attributes.normal) g.computeVertexNormals();
    const n = g.attributes.position.count;
    pos.set(g.attributes.position.array.subarray(0, n * 3), vo * 3);
    nor.set(g.attributes.normal.array.subarray(0, n * 3), vo * 3);
    if (g.attributes.uv) uv.set(g.attributes.uv.array.subarray(0, n * 2), vo * 2);
    if (col && g.attributes.color) col.set(g.attributes.color.array.subarray(0, n * 3), vo * 3);
    if (box && g.attributes.aBox) { box.set(g.attributes.aBox.array.subarray(0, n * 3), vo * 3); half.set(g.attributes.aHalf.array.subarray(0, n * 4), vo * 4); }
    if (g.index) { const a = g.index.array; for (let i = 0; i < a.length; i++) idx[io++] = a[i] + vo; }
    else for (let i = 0; i < n; i++) idx[io++] = i + vo;
    vo += n;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  if (col) out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  if (box) { out.setAttribute('aBox', new THREE.BufferAttribute(box, 3)); out.setAttribute('aHalf', new THREE.BufferAttribute(half, 4)); }
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  out.computeBoundingSphere(); out.computeBoundingBox();
  return out;
}
// Weld coincident vertices (position only) so displaced shapes stay closed and shade smoothly.
function weld(geo, tol = 1e-4) {
  const p = geo.attributes.position, map = new Map(), newPos = [], remap = new Uint32Array(p.count);
  for (let i = 0; i < p.count; i++) {
    const key = Math.round(p.getX(i) / tol) + '_' + Math.round(p.getY(i) / tol) + '_' + Math.round(p.getZ(i) / tol);
    let k = map.get(key);
    if (k === undefined) { k = newPos.length / 3; map.set(key, k); newPos.push(p.getX(i), p.getY(i), p.getZ(i)); }
    remap[i] = k;
  }
  const src = geo.index ? geo.index.array : Array.from({ length: p.count }, (_, i) => i);
  const idx = new Uint32Array(src.length); for (let i = 0; i < src.length; i++) idx[i] = remap[src[i]];
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(newPos, 3));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}
// Box with chamfered/rounded edges and slight chisel irregularity (for cut granite)
function roundedBox(sx, sy, sz, r, seed) {
  const g = new THREE.BoxGeometry(1, 1, 1, 4, 4, 4);
  const p = g.attributes.position, h = [sx / 2, sy / 2, sz / 2];
  const remap = (u, hh) => { const a = Math.abs(u), s = Math.sign(u); if (a > 0.49) return s * hh; if (a > 0.24) return s * (hh - r); return 0; };
  for (let i = 0; i < p.count; i++) {
    const v = [p.getX(i), p.getY(i), p.getZ(i)].map((u, k) => remap(u, h[k]));
    const c = v.map((x, k) => clamp(x, -(h[k] - r), h[k] - r));
    const d = [v[0] - c[0], v[1] - c[1], v[2] - c[2]], l = Math.hypot(d[0], d[1], d[2]);
    if (l > 1e-6) for (let k = 0; k < 3; k++) v[k] = c[k] + (d[k] / l) * r;
    p.setXYZ(i, v[0], v[1], v[2]);
  }
  const w = weld(g, 1e-4);
  const wp = w.attributes.position;
  for (let i = 0; i < wp.count; i++) {
    const x = wp.getX(i), y = wp.getY(i), z = wp.getZ(i);
    const n = fbm3(x * 9 + seed, y * 9, z * 9, 3, seed) * 0.006;
    wp.setXYZ(i, x * (1 + n / sx), y * (1 + n / sy), z * (1 + n / sz));
  }
  w.computeVertexNormals();
  return w;
}
// Noise-displaced icosphere boulder with a flattened base
function rockGeo(seed, detail = 4, flat = -0.35, angular = 0, flatTop = true) {
  const g = weld(new THREE.IcosahedronGeometry(1, detail), 1e-5);
  const p = g.attributes.position, R = mulberry32(Math.floor(seed * 1000) + 7);
  // a few fracture planes give the stone flat faces and edges instead of a blob
  const cuts = [];
  for (let k = 0; k < 5 + angular * 6; k++) {
    const u = R() * 2 - 1, a = R() * Math.PI * 2, sq = Math.sqrt(1 - u * u);
    cuts.push([sq * Math.cos(a), u * 0.7, sq * Math.sin(a), (0.62 + R() * 0.22) * (1 - angular * 0.18)]);
  }
  if (angular && flatTop) cuts.push([0, 1, 0, 0.45 + R() * 0.2]);   // flat, weathered top
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const d = 1 + 0.24 * fbm3(x * 1.2 + seed, y * 1.2, z * 1.2, 4, seed) + 0.07 * fbm3(x * 3.5, y * 3.5 + seed, z * 3.5, 3, seed + 1)
      + 0.02 * fbm3(x * 9, y * 9, z * 9 + seed, 2, seed + 2);
    x *= d; y *= d; z *= d;
    for (const [nx, ny, nz, k] of cuts) {
      const t = x * nx + y * ny + z * nz;
      if (t > k) { const q = (t - k) * (0.85 + angular * 0.15); x -= nx * q; y -= ny * q; z -= nz * q; }
    }
    if (y < flat) y = flat + (y - flat) * 0.25;
    p.setXYZ(i, x, y, z);
  }
  g.computeVertexNormals();
  return g;
}
// Tapered tube along a curve (branches / trunks). uv.y runs along length in metres * uvScale.
function taperTube(curve, tubSeg, radSeg, r0, r1, uvScale = 1) {
  const frames = curve.computeFrenetFrames(tubSeg, false), len = curve.getLength();
  const pos = [], nor = [], uv = [], idx = [], P = new THREE.Vector3();
  for (let i = 0; i <= tubSeg; i++) {
    const t = i / tubSeg; curve.getPointAt(t, P);
    const N = frames.normals[i], B = frames.binormals[i], r = lerp(r0, r1, Math.pow(t, 0.8));
    for (let j = 0; j <= radSeg; j++) {
      const a = (j / radSeg) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      const nx = N.x * c + B.x * s, ny = N.y * c + B.y * s, nz = N.z * c + B.z * s;
      pos.push(P.x + nx * r, P.y + ny * r, P.z + nz * r); nor.push(nx, ny, nz);
      uv.push(j / radSeg * Math.max(1, Math.round((2 * Math.PI * r0) / 0.3)), t * len * uvScale);
    }
  }
  for (let i = 0; i < tubSeg; i++) for (let j = 0; j < radSeg; j++) {
    const a = i * (radSeg + 1) + j, b = a + radSeg + 1;
    idx.push(a, a + 1, b, b, a + 1, b + 1);          // outward-facing winding (matches the explicit normals)
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}
// Box whose UVs are scaled by face size so wood grain density is uniform (grain along local x)
// Timber member with chamfered edges (grain along local x). aBox = local position, aHalf = half extents + board seed
// (+2 when the board is nailed) so the shader can add per-board tint, edge wear and nail heads.
function woodBox(lx, ly, lz, grainScale = 1, flags = 0) {
  const g = new THREE.BoxGeometry(lx, ly, lz, 4, 4, 4);
  const p = g.attributes.position, uv = g.attributes.uv, n = g.attributes.normal, h = [lx / 2, ly / 2, lz / 2];
  const r = Math.min(0.004, Math.min(lx, ly, lz) * 0.16), seed = rand();
  const box = new Float32Array(p.count * 3), half = new Float32Array(p.count * 4);
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i));
    let su, sv;
    if (ax > 0.5) { su = lz; sv = ly; } else if (ay > 0.5) { su = lx; sv = lz; } else { su = lx; sv = ly; }
    uv.setXY(i, uv.getX(i) * su * 0.6 * grainScale, uv.getY(i) * sv * 2.5 * grainScale);
    const v = [p.getX(i), p.getY(i), p.getZ(i)].map((u, k) => { const a2 = Math.abs(u) / h[k]; return a2 > 0.99 ? Math.sign(u) * h[k] : a2 > 0.49 ? Math.sign(u) * (h[k] - r) : u; });
    const c = v.map((x, k) => clamp(x, -(h[k] - r), h[k] - r)), d = [v[0] - c[0], v[1] - c[1], v[2] - c[2]], l = Math.hypot(d[0], d[1], d[2]);
    if (l > 1e-7) for (let k = 0; k < 3; k++) v[k] = c[k] + (d[k] / l) * r;
    p.setXYZ(i, v[0], v[1], v[2]);
    box.set(v, i * 3); half.set([h[0], h[1], h[2], seed + flags], i * 4);
  }
  g.setAttribute('aBox', new THREE.BufferAttribute(box, 3));
  g.setAttribute('aHalf', new THREE.BufferAttribute(half, 4));
  g.computeVertexNormals();
  return g;
}
function placed(geo, pos, rotY = 0, rotX = 0, rotZ = 0) {
  const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rotX, rotY, rotZ, 'YXZ'));
  m.setPosition(pos.x, pos.y, pos.z);
  return geo.applyMatrix4(m);
}
function setLayer(obj, layer) { obj.traverse((o) => o.layers.set(layer)); return obj; }
// ---- Signed-distance modelling helpers + naive Surface Nets extraction (used for the hand and the frog)
const SDFK = {
  len: (x, y, z) => Math.sqrt(x * x + y * y + z * z),
  smin(a, b, k) { const h = clamp(0.5 + 0.5 * (b - a) / k, 0, 1); return lerp(b, a, h) - k * h * (1 - h); },
  smax(a, b, k) { return -SDFK.smin(-a, -b, k); },
  sphere(p, c, r) { return SDFK.len(p[0] - c[0], p[1] - c[1], p[2] - c[2]) - r; },
  ellipsoid(p, c, r) {
    const x = (p[0] - c[0]) / r[0], y = (p[1] - c[1]) / r[1], z = (p[2] - c[2]) / r[2];
    const k0 = Math.sqrt(x * x + y * y + z * z), k1 = Math.sqrt(x * x / (r[0] * r[0]) + y * y / (r[1] * r[1]) + z * z / (r[2] * r[2]));
    return k0 * (k0 - 1) / (k1 || 1e-6);
  },
  // capsule with linearly varying radius between a and b (Quilez round cone, approximated per segment)
  cone(p, a, b, ra, rb) {
    const bax = b[0] - a[0], bay = b[1] - a[1], baz = b[2] - a[2], pax = p[0] - a[0], pay = p[1] - a[1], paz = p[2] - a[2];
    const h = clamp((pax * bax + pay * bay + paz * baz) / (bax * bax + bay * bay + baz * baz), 0, 1);
    return SDFK.len(pax - bax * h, pay - bay * h, paz - baz * h) - lerp(ra, rb, h);
  },
  roundBox(p, c, h, r) {
    const qx = Math.abs(p[0] - c[0]) - h[0] + r, qy = Math.abs(p[1] - c[1]) - h[1] + r, qz = Math.abs(p[2] - c[2]) - h[2] + r;
    return SDFK.len(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, Math.max(qy, qz)), 0) - r;
  },
};
// Naive surface nets: one vertex per sign-changing cell (mean of edge crossings), quads across sign-changing edges,
// normals from the field gradient. Returns an indexed BufferGeometry.
function surfaceNets(f, min, max, cell) {
  const nx = Math.ceil((max[0] - min[0]) / cell) + 1, ny = Math.ceil((max[1] - min[1]) / cell) + 1, nz = Math.ceil((max[2] - min[2]) / cell) + 1;
  const V = new Float32Array(nx * ny * nz), id = (i, j, k) => (k * ny + j) * nx + i, P3 = [0, 0, 0];
  // coarse pass (every 4th node); fine evaluation only inside a narrow band around the surface
  const C = 4, cx = Math.ceil((nx - 1) / C) + 1, cy = Math.ceil((ny - 1) / C) + 1, cz = Math.ceil((nz - 1) / C) + 1, VC = new Float32Array(cx * cy * cz), band = cell * C * 2.5;
  for (let k = 0; k < cz; k++) for (let j = 0; j < cy; j++) for (let i = 0; i < cx; i++) { P3[0] = min[0] + i * C * cell; P3[1] = min[1] + j * C * cell; P3[2] = min[2] + k * C * cell; VC[(k * cy + j) * cx + i] = f(P3); }
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const c = VC[(Math.round(k / C) * cy + Math.round(j / C)) * cx + Math.round(i / C)];
    if (Math.abs(c) > band) { V[id(i, j, k)] = c; continue; }
    P3[0] = min[0] + i * cell; P3[1] = min[1] + j * cell; P3[2] = min[2] + k * cell; V[id(i, j, k)] = f(P3);
  }
  const vert = new Int32Array(nx * ny * nz).fill(-1), pos = [];
  const E = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const cv = new Float32Array(8), co = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
  for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    let neg = 0;
    for (let c = 0; c < 8; c++) { cv[c] = V[id(i + co[c][0], j + co[c][1], k + co[c][2])]; if (cv[c] < 0) neg++; }
    if (neg === 0 || neg === 8) continue;
    let sx = 0, sy = 0, sz = 0, n = 0;
    for (const [a, b] of E) {
      if ((cv[a] < 0) === (cv[b] < 0)) continue;
      const t = cv[a] / (cv[a] - cv[b]);
      sx += co[a][0] + (co[b][0] - co[a][0]) * t; sy += co[a][1] + (co[b][1] - co[a][1]) * t; sz += co[a][2] + (co[b][2] - co[a][2]) * t; n++;
    }
    vert[id(i, j, k)] = pos.length / 3;
    pos.push(min[0] + (i + sx / n) * cell, min[1] + (j + sy / n) * cell, min[2] + (k + sz / n) * cell);
  }
  const idx = [], nor = new Float32Array(pos.length), e = cell * 0.5, Q = [0, 0, 0];
  for (let v = 0; v < pos.length / 3; v++) {
    const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
    const g = (dx, dy, dz) => { Q[0] = x + dx; Q[1] = y + dy; Q[2] = z + dz; return f(Q); };
    let gx = g(e, 0, 0) - g(-e, 0, 0), gy = g(0, e, 0) - g(0, -e, 0), gz = g(0, 0, e) - g(0, 0, -e); const l = Math.hypot(gx, gy, gz) || 1;
    nor[v * 3] = gx / l; nor[v * 3 + 1] = gy / l; nor[v * 3 + 2] = gz / l;
  }
  const quad = (a, b, c, d) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    // orient by the field gradient
    const ax = pos[b * 3] - pos[a * 3], ay = pos[b * 3 + 1] - pos[a * 3 + 1], az = pos[b * 3 + 2] - pos[a * 3 + 2];
    const bx = pos[c * 3] - pos[a * 3], by = pos[c * 3 + 1] - pos[a * 3 + 1], bz = pos[c * 3 + 2] - pos[a * 3 + 2];
    const fx = ay * bz - az * by, fy = az * bx - ax * bz, fz = ax * by - ay * bx;
    if (fx * (nor[a * 3] + nor[c * 3]) + fy * (nor[a * 3 + 1] + nor[c * 3 + 1]) + fz * (nor[a * 3 + 2] + nor[c * 3 + 2]) >= 0) idx.push(a, b, c, a, c, d);
    else idx.push(a, c, b, a, d, c);
  };
  for (let k = 1; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
    const s0 = V[id(i, j, k)] < 0;
    if (s0 !== (V[id(i + 1, j, k)] < 0)) quad(vert[id(i, j - 1, k - 1)], vert[id(i, j, k - 1)], vert[id(i, j, k)], vert[id(i, j - 1, k)]);
    if (s0 !== (V[id(i, j + 1, k)] < 0)) quad(vert[id(i - 1, j, k - 1)], vert[id(i, j, k - 1)], vert[id(i, j, k)], vert[id(i - 1, j, k)]);
    if (s0 !== (V[id(i, j, k + 1)] < 0)) quad(vert[id(i - 1, j - 1, k)], vert[id(i, j - 1, k)], vert[id(i, j, k)], vert[id(i - 1, j, k)]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setIndex(idx);
  return g;
}

// ==== 植被：叶片卡 addCard、递归分枝 growTree ====
const LEAVES = { maple: [], pine: [], green: [], conifer: [], shrub: [], bloom: [], sakura: [], hydrangea: [], bigleaf: [], camellia: [], kikyo: [] };
const BARK = [];
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _z = new THREE.Vector3(0, 0, 1), _s = new THREE.Vector3();
function addCard(list, p, n, size, color) {
  _q.setFromUnitVectors(_z, n.clone().normalize());
  _q2.setFromAxisAngle(_z, rand() * Math.PI * 2);
  _q.multiply(_q2);
  _s.set(size, size, size);
  list.push({ m: new THREE.Matrix4().compose(p, _q, _s), c: color });
}
function randDir() { const u = rr(-1, 1), a = rr(0, Math.PI * 2), s = Math.sqrt(1 - u * u); return new THREE.Vector3(s * Math.cos(a), u, s * Math.sin(a)); }
// Recursive branching; returns branch curves and tip points
function growTree(o) {
  const branches = [], tips = [];
  function grow(start, dir, len, rad, lvl) {
    const pts = [start.clone()], d = dir.clone(), p = start.clone(), segs = lvl === 0 ? 6 : 4;
    for (let i = 1; i <= segs; i++) {
      d.addScaledVector(randDir(), o.wiggle[lvl] ?? 0.2);
      d.y += o.gravity[lvl] ?? 0; d.normalize();
      p.addScaledVector(d, len / segs); pts.push(p.clone());
    }
    const curve = new THREE.CatmullRomCurve3(pts), rEnd = rad * o.radDecay;
    branches.push({ curve, r0: rad, r1: lvl >= o.depth ? rad * 0.3 : rEnd, lvl });
    if (lvl >= o.depth) { tips.push({ p: p.clone(), d: d.clone(), lvl }); return; }
    const nC = o.children[lvl];
    for (let c = 0; c < nC; c++) {
      const t = lerp(o.childStart[lvl], 0.98, (c + rand()) / nC);
      const sp = curve.getPointAt(t), tan = curve.getTangentAt(t);
      const axis = randDir().cross(tan).normalize();
      const nd = tan.clone().applyAxisAngle(axis, o.spread[lvl] * rr(0.7, 1.2));
      nd.y = lerp(nd.y, o.upBias[lvl] ?? nd.y, 0.5); nd.normalize();
      grow(sp, nd, len * o.lenDecay * rr(0.8, 1.1), lerp(rad, rEnd, t) * 0.78, lvl + 1);
    }
    if (lvl >= o.depth - 1) tips.push({ p: p.clone(), d: d.clone(), lvl });
  }
  grow(o.base, o.dir, o.len, o.rad, 0);
  tips.branches = branches;
  for (const b of branches) {
    const tub = b.lvl === 0 ? 28 : b.lvl === 1 ? 12 : 6, rad = b.lvl === 0 ? 12 : b.lvl === 1 ? 8 : 5;
    if (b.r0 < 0.008) continue;
    BARK.push(taperTube(b.curve, tub, rad, b.r0, b.r1, 1.2));
  }
  return tips;
}

// ==== 天空着色器 SKY_VS / SKY_FS ====
/* --- Sky: Preetham analytic daylight (after three.js examples/Sky.js, MIT) + procedural FBM cloud deck */
const SKY_VS = /* glsl */`
uniform vec3 sunPosition;
uniform float rayleigh;
uniform float turbidity;
uniform float mieCoefficient;
uniform vec3 up;
varying vec3 vWorldPosition;
varying vec3 vSunDirection;
varying float vSunfade;
varying vec3 vBetaR;
varying vec3 vBetaM;
varying float vSunE;
const float e = 2.71828182845904523536028747135266249775724709369995957;
const float pi = 3.141592653589793238462643383279502884197169;
const vec3 totalRayleigh = vec3( 5.804542996261093E-6, 1.3562911419845635E-5, 3.0265902468824876E-5 );
const vec3 MieConst = vec3( 1.8399918514433978E14, 2.7798023919660528E14, 4.0790479543861094E14 );
const float cutoffAngle = 1.6110731556870734;
const float steepness = 1.5;
const float EE = 1000.0;
float sunIntensity( float zenithAngleCos ) {
  zenithAngleCos = clamp( zenithAngleCos, -1.0, 1.0 );
  return EE * max( 0.0, 1.0 - pow( e, -( ( cutoffAngle - acos( zenithAngleCos ) ) / steepness ) ) );
}
vec3 totalMie( float T ) {
  float c = ( 0.2 * T ) * 10E-18;
  return 0.434 * c * MieConst;
}
void main() {
  vec4 worldPosition = modelMatrix * vec4( position, 1.0 );
  vWorldPosition = worldPosition.xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
  gl_Position.z = gl_Position.w; // pin to the far plane
  vSunDirection = normalize( sunPosition );
  vSunE = sunIntensity( dot( vSunDirection, up ) );
  vSunfade = 1.0 - clamp( 1.0 - exp( ( sunPosition.y / 450000.0 ) ), 0.0, 1.0 );
  float rayleighCoefficient = rayleigh - ( 1.0 * ( 1.0 - vSunfade ) );
  vBetaR = totalRayleigh * rayleighCoefficient;
  vBetaM = totalMie( turbidity ) * mieCoefficient;
}`;
const SKY_FS = /* glsl */`
varying vec3 vWorldPosition;
varying vec3 vSunDirection;
varying float vSunfade;
varying vec3 vBetaR;
varying vec3 vBetaM;
varying float vSunE;
uniform float mieDirectionalG;
uniform vec3 up;
uniform float uSkyScale;
uniform float uSunDisk;
uniform float uTime;
uniform float uCloudCover;
uniform float uCloudBright;
uniform float uOvercast;
uniform vec3 uOvercastCol;
uniform float uNight;
uniform vec3 uMoonDir;
const float pi = 3.141592653589793238462643383279502884197169;
const float rayleighZenithLength = 8.4E3;
const float mieZenithLength = 1.25E3;
const float sunAngularDiameterCos = 0.99995;
const float THREE_OVER_SIXTEENPI = 0.05968310365946075;
const float ONE_OVER_FOURPI = 0.07957747154594767;
float rayleighPhase( float cosTheta ) { return THREE_OVER_SIXTEENPI * ( 1.0 + pow( cosTheta, 2.0 ) ); }
float hgPhase( float cosTheta, float g ) {
  float g2 = pow( g, 2.0 );
  float inverse = 1.0 / pow( 1.0 - 2.0 * g * cosTheta + g2, 1.5 );
  return ONE_OVER_FOURPI * ( ( 1.0 - g2 ) * inverse );
}
// value-noise FBM for the cloud deck
float h12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(h12(i), h12(i+vec2(1,0)), u.x), mix(h12(i+vec2(0,1)), h12(i+1.0), u.x), u.y); }
float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 6; i++){ s += a * vn(p); p = p * 2.03 + 17.1; a *= 0.5; } return s; }
void main() {
  vec3 direction = normalize( vWorldPosition - cameraPosition );
  float zenithAngle = acos( max( 0.0, dot( up, direction ) ) );
  float inverse = 1.0 / ( cos( zenithAngle ) + 0.15 * pow( 93.885 - ( ( zenithAngle * 180.0 ) / pi ), -1.253 ) );
  float sR = rayleighZenithLength * inverse;
  float sM = mieZenithLength * inverse;
  vec3 Fex = exp( -( vBetaR * sR + vBetaM * sM ) );
  float cosTheta = dot( direction, vSunDirection );
  float rPhase = rayleighPhase( cosTheta * 0.5 + 0.5 );
  vec3 betaRTheta = vBetaR * rPhase;
  float mPhase = hgPhase( cosTheta, mieDirectionalG );
  vec3 betaMTheta = vBetaM * mPhase;
  vec3 Lin = pow( vSunE * ( ( betaRTheta + betaMTheta ) / ( vBetaR + vBetaM ) ) * ( 1.0 - Fex ), vec3( 1.5 ) );
  Lin *= mix( vec3( 1.0 ), pow( vSunE * ( ( betaRTheta + betaMTheta ) / ( vBetaR + vBetaM ) ) * Fex, vec3( 1.0 / 2.0 ) ), clamp( pow( 1.0 - dot( up, vSunDirection ), 5.0 ), 0.0, 1.0 ) );
  vec3 L0 = vec3( 0.1 ) * Fex;
  float sundisk = smoothstep( sunAngularDiameterCos, sunAngularDiameterCos + 0.00002, cosTheta );
  L0 += ( vSunE * 19000.0 * Fex ) * sundisk * uSunDisk * (1.0 - uOvercast);
  vec3 texColor = ( Lin + L0 ) * 0.04 + vec3( 0.0, 0.0003, 0.00075 );
  vec3 col = pow( texColor, vec3( 1.0 / ( 1.2 + ( 1.2 * vSunfade ) ) ) );
  // Preetham's gamma-like compression washes the blue out; restore saturation away from the sun disc
  float skyL = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = max(mix(vec3(skyL), col, 1.9), vec3(0.0)) * (1.0 - sundisk) + col * sundisk;

  // Cloud deck: FBM on a plane, lit brighter toward the sun, soft self-shadowed interiors
  if (direction.y > 0.0) {
    vec2 cp = direction.xz / (direction.y + 0.1) * 1.4 + vec2(uTime * 0.006, uTime * 0.002);
    float n = fbm(cp);
    float cov = smoothstep(0.58 - uCloudCover * 0.2, 0.74, n) * smoothstep(0.0, 0.12, direction.y);
    // crude self-shadowing: sample the deck a little toward the sun; denser there -> darker base
    float toward = fbm(cp + vSunDirection.xz * 0.12);
    float shade = clamp(1.0 - (toward - n) * 4.0, 0.35, 1.0);
    float silver = pow(max(cosTheta, 0.0), 8.0);
    vec3 cloudCol = vec3(1.0, 0.985, 0.96) * uCloudBright * (mix(0.55, 1.05, shade) + silver * 0.9);
    col = mix(col, cloudCol, cov);
  }
  // Below the horizon: fade to a dim ground bounce so the IBL has a sensible lower hemisphere
  // overcast: a flat, soft grey deck, a little brighter overhead
  col = mix(col, uOvercastCol * (0.85 + 0.3 * smoothstep(0.0, 0.8, direction.y)) * (0.92 + 0.08 * fbm(direction.xz / (direction.y + 0.2) * 2.0 + uTime * 0.004)), uOvercast * smoothstep(-0.1, 0.12, direction.y));
  float below = smoothstep(0.0, -0.25, direction.y);
  col = mix(col, vec3(0.03, 0.034, 0.02) * uCloudBright, below);
  col *= uSkyScale;
  if (uNight > 0.001) {   // 校园夜空：深蓝渐变 + 星星 + 月亮，阴天/雨天时星月被云遮住
    float hy = clamp(direction.y, 0.0, 1.0);
    vec3 nsky = mix(vec3(0.020, 0.030, 0.060), vec3(0.004, 0.008, 0.022), pow(hy, 0.6));
    vec2 sp = direction.xz / (direction.y + 1.05) * 260.0;
    vec2 cell = floor(sp); float hs = h12(cell);
    float star = step(0.985, hs) * smoothstep(0.5, 0.0, length(fract(sp) - 0.5)) * (0.6 + 0.4 * sin(uTime * 2.0 + hs * 40.0));
    float clear = 1.0 - clamp(uOvercast * 1.25 + uCloudCover * 0.35, 0.0, 1.0);
    nsky += vec3(0.75, 0.8, 1.0) * star * 0.18 * smoothstep(0.02, 0.25, direction.y) * clear;
    float md = dot(direction, normalize(uMoonDir));
    nsky += vec3(0.95, 0.95, 0.85) * smoothstep(0.99955, 0.99975, md) * 2.4 * clear;
    nsky += vec3(0.35, 0.42, 0.6) * pow(max(md, 0.0), 60.0) * 0.12 * (0.4 + clear);
    nsky = mix(nsky, vec3(0.025, 0.028, 0.035), clamp(uOvercast, 0.0, 1.0) * 0.8);
    nsky = mix(nsky, vec3(0.006, 0.008, 0.006), smoothstep(0.0, -0.25, direction.y));
    col = mix(col, nsky, uNight);
  }
  gl_FragColor = vec4( col, 1.0 );
}`;

// ==== 色温 kelvinToRGB ====
// Kelvin -> sRGB (Tanner Helland fit)
function kelvinToRGB(k) {
  const t = k / 100; let r, g, b;
  if (t <= 66) { r = 255; g = 99.4708025861 * Math.log(t) - 161.1195681661; b = t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307; }
  else { r = 329.698727446 * Math.pow(t - 60, -0.1332047592); g = 288.1221695283 * Math.pow(t - 60, -0.0755148492); b = 255; }
  return [clamp(r, 0, 255) / 255, clamp(g, 0, 255) / 255, clamp(b, 0, 255) / 255];
}

// ==== 叶片透光 LEAF_POST_LIGHTS ====
// Leaves: transmission-free subsurface approximation — back-lit leaves glow with the (shadowed) sun colour
const LEAF_POST_LIGHTS = /* glsl */`
{
  vec3 Lv = normalize((viewMatrix * vec4(uSunDir, 0.0)).xyz);
  float toSun = max(dot(-geometryViewDir, Lv), 0.0);
  float thru = clamp(dot(-geometryNormal, Lv) * 0.6 + 0.4, 0.0, 1.0);
  float back = pow(toSun, 4.0) * 1.3 + 0.42;
  reflectedLight.directDiffuse += diffuseColor.rgb * directLight.color * back * thru * uTransl;
  // light scattered through the canopy reaches even self-shadowed leaves (seen from below they glow, not go black)
  reflectedLight.indirectDiffuse += diffuseColor.rgb * uSunColor * uTransl * 0.07 * (0.4 + 0.6 * thru);
}
`;

// ==== 积雪/湿润/秋色 WEATHER_ALBEDO ====
const WEATHER_ALBEDO = /* glsl */`
float wxSnow = 0.0, wxWet = 0.0;
{
  float wAbove = smoothstep(uWaterY + 0.004, uWaterY + 0.025, vUwPos.y);
  float wUp = normalize(vWNrm).y;
  float up = smoothstep(0.2, 0.8, wUp);
  #ifdef LEAFMAT
    up = max(up, 0.45 * smoothstep(-0.3, 0.5, wUp));               // foliage cards catch snow on any upward-ish face
    if (uAutumn > 0.001 && uDecid > 0.0) {
      // deciduous leaves turn: only the green parts change, colour picked per ~1 m patch so crowns go mottled
      float gr = clamp((diffuseColor.g - max(diffuseColor.r, diffuseColor.b)) / max(diffuseColor.g, 0.02) * 3.5, 0.0, 1.0);
      float n = wxh(floor(vUwPos.xz * 0.9) + floor(vUwPos.y * 0.9) * 7.1);
      vec3 pal = n < 0.45 ? mix(vec3(0.7, 0.06, 0.03), vec3(0.88, 0.2, 0.04), n / 0.45) : n < 0.8 ? mix(vec3(0.92, 0.34, 0.04), vec3(0.95, 0.5, 0.06), (n - 0.45) / 0.35) : mix(vec3(0.9, 0.66, 0.08), vec3(0.72, 0.5, 0.12), (n - 0.8) / 0.2);
      float lum = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11));
      diffuseColor.rgb = mix(diffuseColor.rgb, pal * (lum * 3.2 + 0.02), uAutumn * uDecid * gr);
    }
  #endif
  float sn = wxn(vUwPos.xz * 2.3) * 0.55 + wxn(vUwPos.xz * 9.0 + 3.1) * 0.3 + wxn(vUwPos.xz * 31.0) * 0.15;
  wxSnow = uSnowCover * wAbove * smoothstep(0.3, 0.5, up * (0.5 + 0.65 * sn));
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.86, 0.89, 0.94) * (0.94 + 0.1 * sn), wxSnow);
  wxWet = uWet * wAbove * (1.0 - wxSnow);
  diffuseColor.rgb *= mix(1.0, 0.58 + 0.22 * (1.0 - up), wxWet);  // porous surfaces darken when soaked
}
`;

// ==== 积雪/湿润粗糙度 WEATHER_ROUGH ====
const WEATHER_ROUGH = /* glsl */`
roughnessFactor = mix(roughnessFactor, 0.8, wxSnow);
roughnessFactor = mix(roughnessFactor, roughnessFactor * 0.3 + 0.05, wxWet * smoothstep(0.3, 0.9, normalize(vWNrm).y));   // puddle sheen
roughnessFactor = mix(roughnessFactor, roughnessFactor * 0.7, wxWet * 0.5);
`;

// ==== 天气预设 WX_PRESETS ====
const WX_PRESETS = {
  Sunny:  { tod: 10.5, cloud: 0.55, turb: 2.0, skyScale: 0.34, cloudBright: 1.0, overcast: 0.0, sunMul: 1.0, hemiMul: 1.0, fog: 0.004, fogCol: [0.5, 0.58, 0.68], rain: 0, wet: 0, snow: 0, cover: 0, autumn: 0, ice: 0, wind: 0.35, expo: 0.9, grade: [1.035, 1.0, 0.955] },
  Rain:   { tod: 13.0, cloud: 1.0, turb: 6.0, skyScale: 0.22, cloudBright: 0.52, overcast: 0.85, sunMul: 0.1, hemiMul: 2.1, fog: 0.02, fogCol: [0.2, 0.225, 0.25], rain: 1, wet: 1, snow: 0, cover: 0, autumn: 0, ice: 0, wind: 0.55, expo: 1.15, grade: [0.97, 1.0, 1.03] },
  Autumn: { tod: 15.7, cloud: 0.42, turb: 4.5, skyScale: 0.34, cloudBright: 1.05, overcast: 0.0, sunMul: 0.95, hemiMul: 1.0, fog: 0.013, fogCol: [0.62, 0.52, 0.4], rain: 0, wet: 0, snow: 0, cover: 0, autumn: 1, ice: 0, wind: 0.45, expo: 0.95, grade: [1.07, 1.0, 0.9] },
  Winter: { tod: 11.5, cloud: 0.95, turb: 3.0, skyScale: 0.3, cloudBright: 0.95, overcast: 0.7, sunMul: 0.3, hemiMul: 1.9, fog: 0.024, fogCol: [0.56, 0.6, 0.66], rain: 0, wet: 0, snow: 1, cover: 1, autumn: 0.75, ice: 1, wind: 0.2, expo: 1.0, grade: [0.95, 1.0, 1.06] },
};

// ==== 风动 windOffset（GLSL）====
const PONDSTYLE_WIND_GLSL = /* glsl */`
vec3 windOffset(vec3 wp, float w){
  float ph = dot(wp.xz, uWindDir) * 0.35;
  float gustWave = 0.55 + 0.45 * sin(uTime * 0.9 - ph * 1.3) * sin(uTime * 0.37 - ph * 0.6 + 1.7);
  float sway = sin(uTime * 1.25 + ph + wp.y * 0.3) * 0.55 + sin(uTime * 2.3 + ph * 1.7) * 0.25;
  float amp = uWind * (0.35 + uGust * gustWave);
  vec2 o = uWindDir * (amp * 0.6 + amp * 0.5 * sway) * w;
  float fl = sin(uTime * (6.5 + fract(wp.x * 3.1) * 3.0) + dot(wp, vec3(4.1, 3.3, 5.7))) * 0.018 * (0.3 + uWind) * w;
  return vec3(o.x + fl, -abs(o.x + o.y) * 0.18 * w + fl * 0.6, o.y - fl);
}
`;

// ==== ACES 电影色调映射 + sRGB（GLSL，合成 pass 用）====
const PONDSTYLE_TONEMAP_GLSL = /* glsl */`
vec3 RRTAndODTFit(vec3 v){ vec3 a = v * (v + 0.0245786) - 0.000090537; vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081; return a / b; }
vec3 acesFilmic(vec3 c){
  const mat3 IN = mat3(0.59719, 0.07600, 0.02840, 0.35458, 0.90834, 0.13383, 0.04823, 0.01566, 0.83777);
  const mat3 OUT = mat3(1.60475, -0.10208, -0.00327, -0.53108, 1.10813, -0.07276, -0.07367, -0.00605, 1.07602);
  return clamp(OUT * RRTAndODTFit(IN * c), 0.0, 1.0);
}
vec3 toSRGB(vec3 c){ return mix(pow(c, vec3(1.0 / 2.4)) * 1.055 - 0.055, c * 12.92, vec3(lessThanEqual(c, vec3(0.0031308)))); }
`;
