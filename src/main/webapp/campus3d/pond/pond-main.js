/*
 * 校园池塘板块细节场景 · 主脚本（自动生成，请勿手改 —— 由 tools/build_pond.py 从 koi-pond-garden 源码改造生成，
 * 渐进式加载部分见 tools/pond_init.js）。来源：https://github.com/souranyp-stack/koi-pond-garden （MIT，许可见同目录 LICENSE-koi-pond-garden.txt）
 */
'use strict';
(window.__pondT = window.__pondT || []).push([performance.now(), 'main-script-start']);
/* global THREE, dat */
/* =====================================================================================
   KOI POND GARDEN — real-time PBR scene, single file, three.js r160 (UMD).
   Sections:
     0. Parameters & constants        6. Terrain + basin             11. Koi
     1. Math / noise utilities        7. Stones (coping, boulders)   12. Post-processing
     2. Procedural textures           8. Bridge + pavilion           13. Camera, dive & audio
     3. Geometry helpers              9. Vegetation                  14. GUI, quality, main loop
     4. Renderer, sky, sun, env      10. Water (sim, shader, passes)
     5. Shared material injections
   ===================================================================================== */

/* ------------------------------------------------------------------ 0. PARAMETERS */
const P = {
  timeOfDay: 10.5,        // hours, 6..19
  sunAzimuth: 55,         // degrees, rotates the whole sun path
  windSpeed: 0.35,        // 0..1
  windDir: 35,            // degrees (0 = +x)
  waterClarity: 1.6,      // 0.3 (murky) .. 2 (crystal) — scales absorption & scattering inversely
  waveHeight: 1.0,        // multiplier on 0.5–2 cm Gerstner amplitudes
  causticStrength: 1.0,
  fishCount: window.CAMPUS_POND.fishCount,
  quality: window.CAMPUS_POND.quality,
  autoQuality: !window.CAMPUS_POND.test,
  exposure: 0.9,
  weather: 'Sunny',
  movie: true, letterbox: false, tourSeasons: false,
  dof: !window.CAMPUS_POND.lowPower, fStop: 8, dofStrength: 1, sharpen: 0.35,   // f/8: the whole garden in focus, like a daylight landscape photo
  bloomStrength: window.CAMPUS_POND.lowPower ? 0.22 : 0.3,
  bloomThreshold: 0.9,
  ssao: !window.CAMPUS_POND.lowPower,
  godRays: !window.CAMPUS_POND.lowPower,
  grain: 0.01,
  vignette: 0.32,
  cameraMode: 'Cinematic',
  holdCamera: false,       // hold the current shot (no camera motion at all)
  freezeScene: false,      // stop time: fish, water, wind, everything
  stayAbove: true,         // cinematic path skips the underwater dive unless enabled
  cleanView: false,        // screenshot mode: hides every overlay
  pathSpeed: 1.0,
  audio: !window.CAMPUS_POND.test,      // starts on the first click / key press (browser autoplay rules)
  volume: 0.7,
};
const WATER_Y = 0.0;
// Render layers: every camera sees layer 0 (lights); meshes live on exactly one of these.
const LAYER = { ABOVE: 1, UNDER: 2, BOTH: 3, WATER: 4, SKY: 5, SURFACE: 6 };   // SURFACE: lies on the water (pads, petals): never mirrored

const $ = (id) => document.getElementById(id);
const nextTick = () => new Promise((r) => setTimeout(r, 0));
async function progress(frac, msg) {
  (window.__pondT = window.__pondT || []).push([performance.now(), 'step:' + msg]);
  $('loadbar').style.width = (frac * 100).toFixed(0) + '%';
  $('loadmsg').textContent = msg;
  await nextTick();
}
function toast(msg) {
  const t = $('toast'); t.textContent = msg; t.style.opacity = 1;
  clearTimeout(toast._h); toast._h = setTimeout(() => (t.style.opacity = 0), 2200);
}

pondStyleProgress = progress;   // 共享纹理生成器（pond-style-core.js）的加载进度回调

/* ------------------------------------------------------------------ 4. RENDERER, SKY, SUN, ENVIRONMENT */
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
const TEST_STEP = window.CAMPUS_POND.test ? Math.min(0.2, parseFloat(new URLSearchParams(location.search).get('tstep')) || 0) : 0;
const RES = { scale: window.CAMPUS_POND.test ? (parseFloat(new URLSearchParams(location.search).get('res')) || 0.6) : 1 };   // adaptive resolution multiplier (1 .. 0.6)
renderer.setPixelRatio(Math.min(window.devicePixelRatio, window.CAMPUS_POND.maxDpr, 2) * RES.scale);
renderer.setSize(innerWidth, innerHeight, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;              // ACES is applied in our own composite pass
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate = false;                   // updated once per frame, not once per pass
MAX_ANISO = Math.min(8, renderer.capabilities.getMaxAnisotropy());

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(52, innerWidth / innerHeight, 0.02, 260);   // close near plane for macro shots
camera.position.set(-0.6, 0.4, 5.3);

// One global clip plane is always bound (a no-op in the main pass) so programs never recompile between passes.
const CLIP_NONE = new THREE.Plane(new THREE.Vector3(0, 1, 0), 1e4);
const CLIP_KEEP_ABOVE = new THREE.Plane(new THREE.Vector3(0, 1, 0), -WATER_Y + 0.02);
const CLIP_KEEP_BELOW = new THREE.Plane(new THREE.Vector3(0, -1, 0), WATER_Y + 0.04);
renderer.clippingPlanes = [CLIP_NONE];

// Shared uniforms referenced (not copied) by every patched material
const KOI_MAX = 20;                   // koi shadow slots in every underwater shader (the roster must fit)
const SH = {
  uTime: { value: 0 },
  uWaterY: { value: WATER_Y },
  uSunDir: { value: new THREE.Vector3(0, 1, 0) },
  uSunDirW: { value: new THREE.Vector3(0, 1, 0) },      // refracted sun direction below the surface
  uSunColor: { value: new THREE.Color() },              // colour * intensity
  uAbsorb: { value: new THREE.Vector3(0.35, 0.08, 0.04) },
  uScatter: { value: 0.04 },
  uInscatter: { value: new THREE.Color() },
  uCamUnder: { value: 0 },
  tCaustics: { value: null },
  uCausticStr: { value: 1 },
  uCausticNorm: { value: 1 },
  uWindDir: { value: new THREE.Vector2(1, 0) },
  uWind: { value: 0.35 },
  uGust: { value: 0 },
  uWavesS: { value: null },          // set to WAVES once built: floating objects follow the same surface
  tRippleS: { value: null },
  uSimS: { value: new THREE.Vector4() },
  // weather (section 13e)
  uSnowCover: { value: 0 }, uWet: { value: 0 }, uAutumn: { value: 0 }, uFogDensity: { value: 0.004 }, uFogColor: { value: new THREE.Color(0.5, 0.58, 0.68) },
  uRain: { value: 0 }, uIce: { value: 0 },
  // koi silhouettes for their soft underwater shadows (section 11): xyz + size, heading * girth + tail swing
  uKoiA: { value: Array.from({ length: KOI_MAX }, () => new THREE.Vector4()) },
  uKoiB: { value: Array.from({ length: KOI_MAX }, () => new THREE.Vector4()) },
};

const skyUniforms = {
  sunPosition: { value: new THREE.Vector3(0, 1, 0) },
  turbidity: { value: 2.0 }, rayleigh: { value: 2.1 }, mieCoefficient: { value: 0.003 }, mieDirectionalG: { value: 0.8 },
  up: { value: new THREE.Vector3(0, 1, 0) },
  uSkyScale: { value: 0.34 }, uSunDisk: { value: 1.0 }, uTime: SH.uTime,
  uCloudCover: { value: 0.55 }, uCloudBright: { value: 1.0 }, uOvercast: { value: 0 }, uOvercastCol: { value: new THREE.Color(1, 1, 1) },
  uNight: { value: 0 }, uMoonDir: { value: new THREE.Vector3(-0.35, 0.72, -0.6).normalize() },
};
const skyMat = new THREE.ShaderMaterial({ name: 'Sky', uniforms: skyUniforms, vertexShader: SKY_VS, fragmentShader: SKY_FS, side: THREE.BackSide, depthWrite: false });
const skyGeo = new THREE.BoxGeometry(1, 1, 1);
const sky = new THREE.Mesh(skyGeo, skyMat);
sky.scale.setScalar(900); sky.frustumCulled = false; sky.renderOrder = -10;
setLayer(sky, LAYER.SKY); scene.add(sky);

// Sun & fill
const sun = new THREE.DirectionalLight(0xffffff, 3.2);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
sun.shadow.bias = -0.00025;
sun.shadow.normalBias = 0.025;
{
  const c = sun.shadow.camera; c.left = -13; c.right = 13; c.top = 13; c.bottom = -13; c.near = 1; c.far = 90;
}
sun.target.position.set(0, 0, -1.5);
scene.add(sun, sun.target);
const hemi = new THREE.HemisphereLight(0x9cc4ef, 0x4b5a2c, 0.28);
scene.add(hemi);


// Environment: sky rendered to a cube (no sun disc — the DirectionalLight carries the sun), then PMREM for IBL.
const cubeRT = new THREE.WebGLCubeRenderTarget(128, { type: THREE.HalfFloatType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
const cubeCam = new THREE.CubeCamera(0.1, 1000, cubeRT);
const skyScene = new THREE.Scene();
{ const s2 = new THREE.Mesh(skyGeo, skyMat); s2.scale.setScalar(900); s2.frustumCulled = false; skyScene.add(s2); }
const pmrem = new THREE.PMREMGenerator(renderer);
let envRT = null, envDirty = true, envTimer = 0;
function updateEnv() {
  const prevClip = renderer.clippingPlanes; renderer.clippingPlanes = [];
  skyUniforms.uSunDisk.value = 0;
  cubeCam.update(renderer, skyScene);
  const rt = pmrem.fromCubemap(cubeRT.texture);
  if (envRT) envRT.dispose();
  envRT = rt; scene.environment = envRT.texture;
  skyUniforms.uSunDisk.value = 1;
  renderer.clippingPlanes = prevClip;
  envDirty = false;
}

const sunState = { elev: 0, intensity: 0 };
let CAMPUS_EXPO = 1;          // 夜晚提高曝光（由 pond-campus.js 写入 window.CAMPUS_SUN）
function updateSun() {
  const CS = window.CAMPUS_SUN;
  const f = clamp((P.timeOfDay - 6) / 13, 0, 1);
  let elev = Math.max(0.6 * DEG, Math.sin(Math.PI * f) * 62 * DEG);
  let az = (90 - 180 * f + P.sunAzimuth) * DEG;
  const night = CS ? clamp(CS.night, 0, 1) : 0;
  if (CS) { elev = clamp(CS.elev, 0.6, 70) * DEG; az = (55 - (CS.az - 180)) * DEG; }
  let d = new THREE.Vector3(Math.cos(elev) * Math.sin(az), Math.sin(elev), Math.cos(elev) * Math.cos(az)).normalize();
  // 光照模型与校园全景共用（js/pond-style.js → pondSunLight）
  const LIT = pondSunLight(d, elev, night, WX.cur.sunMul, WX.cur.hemiMul, skyUniforms.uMoonDir.value);
  d = LIT.dir; elev = LIT.elev;
  const [r, g, b] = LIT.color, inten = LIT.intensity;
  skyUniforms.uNight.value = night;
  CAMPUS_EXPO = LIT.expo;
  sun.color.setRGB(r, g, b, THREE.SRGBColorSpace);
  sun.intensity = inten;
  sun.position.copy(d).multiplyScalar(45).add(sun.target.position);
  skyUniforms.sunPosition.value.copy(d);
  skyUniforms.uCloudBright.value = LIT.cloudBrightK * WX.cur.cloudBright;
  SH.uSunDir.value.copy(d);
  SH.uSunColor.value.copy(sun.color).multiplyScalar(inten);
  // Snell: refracted sun direction under water (pointing up toward the sun)
  const sinT = Math.cos(elev) / 1.333, cosT = Math.sqrt(1 - sinT * sinT);
  const hx = d.x, hz = d.z, hl = Math.hypot(hx, hz) || 1;
  SH.uSunDirW.value.set((hx / hl) * sinT, cosT, (hz / hl) * sinT);
  hemi.intensity = LIT.hemiIntensity;
  hemi.color.setRGB(...LIT.hemiColor);
  sunState.elev = elev; sunState.intensity = inten;
  envDirty = true;
  if (typeof SHADOW !== 'undefined') SHADOW.dirty = true;
}

/* ------------------------------------------------------------------ 5. SHARED MATERIAL INJECTIONS
   patchMaterial() composes, in one onBeforeCompile:
     - world position / normal varyings (+ optional wind sway in a replaced project_vertex)
     - underwater lighting: Beer–Lambert on the sun path, caustics projected along the refracted sun ray,
       ambient attenuation with depth, and exponential teal fog when the camera is submerged
     - optional triplanar rock/hedge shading, leaf translucency, wood weathering, koi skinning (added later)
*/
const GLSL_NOISE = /* glsl */`
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(hash12(i), hash12(i+vec2(1,0)), u.x), mix(hash12(i+vec2(0,1)), hash12(i+1.0), u.x), u.y); }
`;
const UW_VS_PARS = /* glsl */`
uniform float uTime;
uniform vec2 uWindDir;
uniform float uWind;
uniform float uGust;
varying vec3 vUwPos;
varying vec3 vWNrm;
// Wind: slow sway scaled by a per-vertex weight, noise-like gusts travelling along the wind, fast leaf flutter
#ifdef FLOAT
uniform float uWaterY;
uniform vec4 uWavesS[4];
uniform sampler2D tRippleS;
uniform vec4 uSimS;
// height of the water surface at xz: the same Gerstner sum + ripple simulation the water mesh uses
float surfaceHeight(vec2 xz){
  float h = 0.0;
  for (int i = 0; i < 4; i++) {
    vec2 D = normalize(uWavesS[i].xy); float k = 6.2831853 / uWavesS[i].z;
    h += uWavesS[i].w * sin(k * (dot(D, xz) - sqrt(9.81 / k) * uTime));
  }
  return h + texture2D(tRippleS, (xz - uSimS.xy) / uSimS.z).r;
}
#endif
${PONDSTYLE_WIND_GLSL}`;
const UW_FS_PARS = /* glsl */`
uniform float uTime;
uniform float uWaterY;
uniform vec3 uSunDir;
uniform vec3 uSunDirW;
uniform vec3 uSunColor;
uniform vec3 uAbsorb;
uniform float uScatter;
uniform vec3 uInscatter;
uniform float uCamUnder;
uniform sampler2D tCaustics;
uniform float uCausticStr;
uniform float uCausticNorm;
varying vec3 vUwPos;
varying vec3 vWNrm;
uniform float uSnowCover;
uniform float uWet;
uniform float uAutumn;
uniform float uFogDensity;
uniform vec3 uFogColor;
float wxh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float wxn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(wxh(i), wxh(i + vec2(1, 0)), f.x), mix(wxh(i + vec2(0, 1)), wxh(i + vec2(1, 1)), f.x), f.y); }
// ---- Caustics: two counter-scrolling Voronoi-derived patterns, multiplied.
float causticSample(vec2 p){
  float a = texture2D(tCaustics, p * 0.52 + vec2(uTime * 0.022, uTime * 0.013)).r;
  float b = texture2D(tCaustics, (p * 0.67) * mat2(0.8, -0.6, 0.6, 0.8) - vec2(uTime * 0.016, -uTime * 0.025)).r;
  return a * b;
}
// Koi shadows, computed analytically every frame instead of through the shadow map: a single soft silhouette per
// fish on whatever lies beneath it, found by walking up the refracted sun ray to the fish's depth. The penumbra widens
// with distance (sun disc + the wavy surface scatter the light), and a koi never shadows itself.
uniform vec4 uKoiA[${KOI_MAX}];
uniform vec4 uKoiB[${KOI_MAX}];
float koiShadow(vec3 wp, float selfIdx){
  vec2 toSun = uSunDirW.xz / max(uSunDirW.y, 0.3);
  float sh = 1.0;
  for (int i = 0; i < ${KOI_MAX}; i++) {
    vec4 A = uKoiA[i];
    if (A.w <= 0.0 || abs(float(i) - selfIdx) < 0.5) continue;
    float h = A.y - wp.y;
    if (h < 0.015) continue;
    vec2 q = wp.xz + toSun * h - A.xz;
    float sz = A.w, pen = 0.012 + 0.05 * h;
    if (dot(q, q) > (0.85 * sz + pen) * (0.85 * sz + pen)) continue;
    vec4 B = uKoiB[i];
    float g = length(B.xy); vec2 dir = B.xy / g;
    float s = 0.5 - dot(q, dir) / sz;                                   // 0 snout .. 1 tail base
    float t = max(s - 0.3, 0.0) / 0.6;
    float v = dot(q, vec2(-dir.y, dir.x)) / sz - B.z * t * t;          // follows the swimming spine
    float e = (s - 0.37) / (s < 0.37 ? 0.39 : 0.68);
    float w = 0.115 * g * sqrt(max(1.0 - e * e, 0.0)) * step(0.0, s);
    w = max(w, 0.035 * smoothstep(0.93, 1.02, s) * (1.0 - smoothstep(1.22, 1.32, s)));   // the tail fan's thin edge-on shadow
    float k = 1.0 - smoothstep(-pen, pen, (abs(v) - w) * sz);
    sh *= 1.0 - k * 0.8 * exp(-h * 0.2);                                // umbra: the body blocks the direct sun
  }
  return sh;
}
// Projected from the refracted sun direction: walk up the light ray to where it crossed the surface.
vec3 causticsRGB(vec3 wp, float depth){
  vec2 p = wp.xz + uSunDirW.xz / max(uSunDirW.y, 0.3) * depth;
  float s = 0.003 + 0.004 * depth;          // slight chromatic dispersion that grows with depth
  return vec3(causticSample(p + vec2(s, 0.0)), causticSample(p), causticSample(p - vec2(s, 0.0))) * uCausticNorm;
}
`;
// Fragment: computed right before the light loop
const UW_PRE_LIGHTS = /* glsl */`
float uwD = uWaterY - vUwPos.y;
float uwMask = smoothstep(-0.015, 0.03, uwD);
float uwDepth = max(uwD, 0.0);
vec3 uwSunMod = vec3(1.0);
vec3 uwAmbMod = vec3(1.0);
if (uwMask > 0.0) {
  // Beer–Lambert on the refracted sun path down to this point
  vec3 sunT = exp(-uAbsorb * uwDepth / max(uSunDirW.y, 0.25));
  vec3 cau = causticsRGB(vUwPos, uwDepth);
  float cf = uCausticStr * exp(-uwDepth * 0.5) * smoothstep(0.02, 0.4, uwDepth);   // caustics need some depth to focus
  #ifdef KOI_SELF_IDX
    float koiSelf = KOI_SELF_IDX;
  #else
    float koiSelf = -1.0;
  #endif
  float koiSh = koiShadow(vUwPos, koiSelf);
  uwSunMod = mix(vec3(1.0), sunT * mix(vec3(1.0), cau, cf) * 0.96 * koiSh, uwMask);
  uwAmbMod = mix(vec3(1.0), exp(-uAbsorb * uwDepth * 1.7) * mix(0.95, 0.8, smoothstep(0.05, 0.6, uwDepth)) * mix(1.0, koiSh, 0.35), uwMask);   // a koi overhead also hides part of the sky
}
`;
const UW_POST_LIGHTS = /* glsl */`
// water (n=1.33) against stone/scales (n~1.5) reflects almost nothing: submerged surfaces lose their gloss
reflectedLight.directSpecular *= mix(1.0, 0.12, uwMask);
clearcoatSpecularDirect *= mix(1.0, 0.1, uwMask);
reflectedLight.indirectDiffuse *= uwAmbMod;
reflectedLight.indirectSpecular *= uwAmbMod * mix(1.0, 0.35, uwMask);
clearcoatSpecularIndirect *= uwAmbMod * mix(1.0, 0.35, uwMask);
sheenSpecularIndirect *= uwAmbMod;
`;
// Exponential absorption fog with the water's own extinction when the camera is submerged
const UW_FOG = /* glsl */`
if (uCamUnder > 0.5) {
  float fd = distance(vUwPos, cameraPosition);
  vec3 T = exp(-(uAbsorb + uScatter) * fd);
  gl_FragColor.rgb = gl_FragColor.rgb * T + uInscatter * (1.0 - T);
} else if (uFogDensity > 0.0) {
  // aerial perspective / mist: thicker near the ground, tinted by the weather
  float fd = distance(vUwPos, cameraPosition);
  float ff = (1.0 - exp(-fd * uFogDensity)) * mix(1.0, 0.45, smoothstep(1.0, 14.0, vUwPos.y));
  gl_FragColor.rgb = mix(gl_FragColor.rgb, uFogColor, ff);
}
`;
// Triplanar rock / hedge shading (world-space), moss by slope + AO proxy, wet band at the waterline
const TRI_FS_PARS = /* glsl */`
uniform sampler2D tAlb;
uniform sampler2D tNrm;
uniform sampler2D tMossAlb;
uniform float uTriScale;
uniform float uNrmStr;
uniform float uMoss;
uniform vec3 uTint;
uniform vec3 uBloomColor;
uniform float uBloom;
uniform float uWetAmt;
float th3(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float tnoise(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(th3(i), th3(i + vec3(1,0,0)), f.x), mix(th3(i + vec3(0,1,0)), th3(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(th3(i + vec3(0,0,1)), th3(i + vec3(1,0,1)), f.x), mix(th3(i + vec3(0,1,1)), th3(i + vec3(1,1,1)), f.x), f.y), f.z); }
`;
const TRI_MAP = /* glsl */`
vec3 tpW = pow(abs(normalize(vWNrm)), vec3(4.0)); tpW /= (tpW.x + tpW.y + tpW.z);
vec2 tuvX = vUwPos.zy * uTriScale, tuvY = vUwPos.xz * uTriScale, tuvZ = vUwPos.xy * uTriScale;
vec4 triA = texture2D(tAlb, tuvX) * tpW.x + texture2D(tAlb, tuvY) * tpW.y + texture2D(tAlb, tuvZ) * tpW.z;
vec4 triD = texture2D(tAlb, tuvX * 3.7) * tpW.x + texture2D(tAlb, tuvY * 3.7) * tpW.y + texture2D(tAlb, tuvZ * 3.7) * tpW.z;   // micro-detail layer
vec3 triAlb = triA.rgb * uTint * mix(vec3(1.0), triD.rgb * 1.7, 0.3);
float mossF = 0.0, wetF = 0.0, rockH = 0.0;
#ifdef HEDGE
  // flowers: bright Worley cells packed in the alpha channel
  triAlb = mix(triAlb, uBloomColor * (0.75 + 0.25 * triA.g), smoothstep(0.35, 0.6, triA.a) * uBloom);
#else
  vec3 wnT = normalize(vWNrm);
  float cav = tnoise(vUwPos * 3.1) * 0.6 + tnoise(vUwPos * 11.0) * 0.4;
  triAlb *= mix(0.84, 1.05, smoothstep(0.25, 0.75, cav)) * mix(0.82, 1.0, smoothstep(-0.5, 0.4, wnT.y));       // cavities, shaded undersides
  float streak = tnoise(vec3(vUwPos.x * 9.0, vUwPos.y * 1.2, vUwPos.z * 9.0));
  triAlb *= 1.0 - smoothstep(0.55, 0.8, streak) * 0.14 * (1.0 - abs(wnT.y));                                    // rain streaks on vertical faces
  float lich = tnoise(vUwPos * 16.0 + 13.0) * 0.6 + tnoise(vUwPos * 47.0) * 0.4;
  float lichM = smoothstep(0.7, 0.74, lich) * smoothstep(0.0, 0.5, wnT.y) * smoothstep(uWaterY + 0.15, uWaterY + 0.3, vUwPos.y) * uMoss;
  triAlb = mix(triAlb, mix(vec3(0.16, 0.17, 0.12), vec3(0.3, 0.15, 0.04), step(0.88, fract(lich * 13.0))), lichM * 0.35);   // linear colours   // lichen crusts
  // granite grain: dark mica and pale feldspar / quartz specks at millimetre scale
  float grain = tnoise(vUwPos * 260.0), grain2 = tnoise(vUwPos * 610.0 + 7.0);
  triAlb *= 1.0 + (smoothstep(0.72, 0.8, grain) * 0.16 - smoothstep(0.74, 0.82, grain2) * 0.22);
  // hairline crack network and small weathering pits (darker, and cut into the surface below)
  float cr = abs(tnoise(vUwPos * 5.5 + 3.0) - 0.5) + abs(tnoise(vUwPos * 13.0) - 0.5) * 0.35;
  float crack = (1.0 - smoothstep(0.0, 0.018, cr)) * smoothstep(0.35, 0.6, tnoise(vUwPos * 1.3 + 9.0));
  float pit = smoothstep(0.8, 0.88, tnoise(vUwPos * 85.0 + 2.0));
  triAlb *= 1.0 - crack * 0.45 - pit * 0.18;
  // pale crustose lichen rosettes (grey-green discs with brighter rims) on the sunny tops
  float lr = tnoise(vUwPos * 24.0 + 21.0) * 0.75 + tnoise(vUwPos * 70.0) * 0.25;
  float lichP = smoothstep(0.68, 0.71, lr) * smoothstep(0.45, 0.65, tnoise(vUwPos * 2.0 + 5.0)) * smoothstep(0.1, 0.6, wnT.y) * smoothstep(uWaterY + 0.2, uWaterY + 0.35, vUwPos.y) * uMoss;
  triAlb = mix(triAlb, mix(vec3(0.34, 0.36, 0.29), vec3(0.46, 0.48, 0.4), smoothstep(0.72, 0.8, lr)), lichP * 0.5);
  rockH = -crack * 0.0012 - pit * 0.0005 + tnoise(vUwPos * 40.0) * 0.00035 + grain * 0.00008 + lichP * 0.0002;
  float mN = tnoise(vUwPos * 2.2) * 0.7 + tnoise(vUwPos * 7.3 + 4.0) * 0.3;
  float upF = normalize(vWNrm).y;
  float lowLying = 1.0 - smoothstep(uWaterY + 0.05, uWaterY + 0.8, vUwPos.y);          // AO proxy
  float shade = 1.0 - clamp(dot(normalize(vWNrm), uSunDir), 0.0, 1.0);                // faces turned from the sun
  mossF = smoothstep(0.45, 0.85, upF * 0.75 + lowLying * 0.35 + shade * 0.3 + (mN - 0.5) * 0.8 - (1.0 - uMoss) * 0.9);
  mossF *= smoothstep(uWaterY + 0.07, uWaterY + 0.16, vUwPos.y);
  vec3 mossAlb = texture2D(tMossAlb, tuvY * 2.1).rgb * (0.8 + 0.3 * mN);
  triAlb = mix(triAlb, mossAlb, mossF);
  // wet stone: 35 % darker and glossy within ~10 cm of the waterline (and below it)
  float wetEdge = uWaterY + 0.07 + (mN - 0.5) * 0.04;
  wetF = 1.0 - smoothstep(wetEdge - 0.025, wetEdge + 0.02, vUwPos.y);
  triAlb *= mix(1.0, 0.65, wetF * uWetAmt);
  triAlb = mix(triAlb, triAlb * vec3(0.72, 0.88, 0.62), smoothstep(0.02, 0.3, uWaterY - vUwPos.y) * 0.55 * uWetAmt); // algae film
#endif
diffuseColor.rgb *= triAlb;
`;
const TRI_ROUGH = /* glsl */`
#ifdef HEDGE
  float roughnessFactor = roughness;
#else
  float roughnessFactor = roughness * triA.a / 0.78;
  roughnessFactor = mix(roughnessFactor, 0.92, mossF);
  roughnessFactor = mix(roughnessFactor, 0.3, wetF);
#endif
`;
const TRI_NORMAL = /* glsl */`
{
  vec3 wn = normalize(vWNrm);
  vec3 tnX = texture2D(tNrm, tuvX).xyz * 2.0 - 1.0;
  vec3 tnY = texture2D(tNrm, tuvY).xyz * 2.0 - 1.0;
  vec3 tnZ = texture2D(tNrm, tuvZ).xyz * 2.0 - 1.0;
  float ns = uNrmStr * (1.0 - 0.6 * mossF) * (1.0 - 0.5 * wetF);
  tnX.xy *= ns; tnY.xy *= ns; tnZ.xy *= ns;
  // whiteout blend of the three tangent-space normals into world space
  tnX = vec3(tnX.xy + wn.zy, abs(tnX.z) * wn.x);
  tnY = vec3(tnY.xy + wn.xz, abs(tnY.z) * wn.y);
  tnZ = vec3(tnZ.xy + wn.xy, abs(tnZ.z) * wn.z);
  vec3 nW = normalize(tnX.zyx * tpW.x + tnY.xzy * tpW.y + tnZ.xyz * tpW.z);
  normal = normalize((viewMatrix * vec4(nW, 0.0)).xyz);
  // procedural micro relief (cracks, pits, grain) as a screen-space derivative bump
  vec3 dpx = dFdx(-vViewPosition), dpy = dFdy(-vViewPosition);
  float dhx = dFdx(rockH), dhy = dFdy(rockH);
  vec3 r1 = cross(dpy, normal), r2 = cross(normal, dpx);
  float det = dot(dpx, r1);
  if (abs(det) > 1e-12) normal = normalize(abs(det) * normal - sign(det) * (dhx * r1 + dhy * r2) * (1.0 - mossF));
}
`;
// Timber: rails weather to silvery grey where they face the sky
const WOOD_VS = /* glsl */`
attribute vec3 aBox;
attribute vec4 aHalf;
varying vec3 vBox;
varying vec4 vHalf;
`;
const WOOD_MAP = /* glsl */`
float woodWear = 0.0, woodNail = 0.0, woodWet = 0.0;
{
  float wth = smoothstep(0.55, 0.95, normalize(vWNrm).y) * uWeather;
  float lum = dot(diffuseColor.rgb, vec3(0.3, 0.55, 0.15));
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(lum) * vec3(1.35, 1.32, 1.25) + 0.05, wth * 0.75);
  if (vHalf.x > 0.0) {
    // per-board colour, lighter worn arrises, darker grime where boards meet
    vec3 q = abs(vBox), dd = vHalf.xyz - q;
    float mn = min(dd.x, min(dd.y, dd.z)), mx = max(dd.x, max(dd.y, dd.z)), mid = dd.x + dd.y + dd.z - mn - mx;
    float sd = fract(vHalf.w);
    float n1 = fract(sin(dot(floor(vBox * 700.0), vec3(12.9898, 78.233, 37.719))) * 43758.5453);
    woodWear = 1.0 - smoothstep(0.0008, 0.008 + 0.006 * n1, mid);
    diffuseColor.rgb *= mix(vec3(0.8, 0.78, 0.76), vec3(1.12, 1.05, 1.0), sd) * (0.94 + 0.12 * fract(sd * 7.31));
    diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 1.28 + vec3(0.03, 0.025, 0.02), woodWear * 0.55);
    float endGrime = 1.0 - smoothstep(0.0, 0.03, vHalf.x - q.x);
    diffuseColor.rgb *= 1.0 - 0.25 * endGrime * (1.0 - woodWear);
    if (vHalf.w >= 2.0) {                                   // two nail heads at each plank end
      float ex = vHalf.x - 0.035, ez = vHalf.z * 0.45;
      float dn = min(length(vec2(q.x - ex, vBox.z - ez)), length(vec2(q.x - ex, vBox.z + ez)));
      float onTop = step(vHalf.y - 0.003, vBox.y);
      woodNail = (1.0 - smoothstep(0.0026, 0.0034, dn)) * onTop;
      float rust = (1.0 - smoothstep(0.0035, 0.009, dn)) * onTop;
      diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.5, 0.36, 0.26), rust * 0.55);
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.07, 0.065, 0.06), woodNail);
    }
  }
  // saturated timber at the waterline, algae film below it
  woodWet = 1.0 - smoothstep(uWaterY + 0.03, uWaterY + 0.14, vUwPos.y);
  diffuseColor.rgb *= mix(1.0, 0.58, woodWet);
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.55, 0.78, 0.4), smoothstep(0.0, 0.2, uWaterY - vUwPos.y) * 0.7);
}
`;
const WOOD_ROUGH = 'roughnessFactor = mix(roughnessFactor, 0.78, woodWear * 0.6); roughnessFactor = mix(roughnessFactor, 0.35, woodNail); roughnessFactor = mix(roughnessFactor, 0.28, woodWet);';

// Build the lights_fragment_begin chunk with the sun colour scaled by the underwater modifier.
const LIGHTS_BEGIN_UW = THREE.ShaderChunk.lights_fragment_begin.replace(
  'getDirectionalLightInfo( directionalLight, directLight );',
  'getDirectionalLightInfo( directionalLight, directLight );\n\t\tdirectLight.color *= uwSunMod;');
if (LIGHTS_BEGIN_UW === THREE.ShaderChunk.lights_fragment_begin) console.warn('lights chunk patch failed');

/**
 * opts: { key, uniforms, tri:bool, hedge:bool, leaf:bool, wood:bool, wind:'world'|'local'|null, windWeight:glsl,
 *         vsPars, vsNormal (glsl after beginnormal_vertex), vsBegin (glsl after begin_vertex), fsPars, fsMap (glsl after map_fragment) }
 */
function patchMaterial(mat, o = {}) {
  const U = Object.assign({}, o.uniforms || {});
  if (/^(koi|df|turt|frog|skin|drop|paddrop)/.test(o.key || '')) o = Object.assign({}, o, { noWeather: true });
  if (o.leaf && !U.uDecid) U.uDecid = { value: o.decid ?? 0 };
  mat.userData.uniforms = U;
  mat.customProgramCacheKey = () => 'pm-' + o.key;
  mat.onBeforeCompile = (sh) => {
    for (const k of Object.keys(SH)) sh.uniforms[k] = SH[k];
    Object.assign(sh.uniforms, U);
    let vs = sh.vertexShader, fs = sh.fragmentShader;
    const defs = (o.tri ? '#define TRI\n' : '') + (o.hedge ? '#define HEDGE\n' : '') + (o.wind ? '#define WIND\n' : '') + (o.float ? '#define FLOAT\n' : '');
    vs = vs.replace('#include <common>', defs + '#include <common>\n' + UW_VS_PARS + (o.vsPars || ''));
    if (o.vsNormal) vs = vs.replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\n' + o.vsNormal);
    if (o.vsBegin) vs = vs.replace('#include <begin_vertex>', '#include <begin_vertex>\n' + o.vsBegin);
    if (o.vsAfterUv) vs = vs.replace('#include <uv_vertex>', '#include <uv_vertex>\n' + o.vsAfterUv);
    vs = vs.replace('#include <project_vertex>', /* glsl */`
      vec4 wPos4 = vec4(transformed, 1.0);
      #ifdef USE_INSTANCING
        wPos4 = instanceMatrix * wPos4;
      #endif
      wPos4 = modelMatrix * wPos4;
      #ifdef WIND
        vec3 wWindP = ${o.windPos || 'wPos4.xyz'};
        wPos4.xyz += windOffset(wWindP, ${o.windWeight || '1.0'});
      #endif
      #ifdef FLOAT
        wPos4.y = uWaterY + surfaceHeight(wPos4.xz) + transformed.y + 0.0015;   // rides the local wave shape
      #endif
      vUwPos = wPos4.xyz;
      vec3 wN = objectNormal;
      #ifdef USE_INSTANCING
        wN = mat3(instanceMatrix) * wN;
      #endif
      vWNrm = normalize(mat3(modelMatrix) * wN);
      vec4 mvPosition = viewMatrix * wPos4;
      gl_Position = projectionMatrix * mvPosition;`);
    fs = fs.replace('#include <roughnessmap_fragment>', (o.noWeather ? '' : WEATHER_ALBEDO) + '#include <roughnessmap_fragment>');
    fs = fs.replace('#include <metalnessmap_fragment>', (o.noWeather ? '' : WEATHER_ROUGH) + '#include <metalnessmap_fragment>');
    fs = fs.replace('#include <common>', defs + (o.leaf ? '#define LEAFMAT\n' : '') + '#include <common>\n' + UW_FS_PARS + (o.tri ? TRI_FS_PARS : '') +
      (o.leaf ? 'uniform float uTransl;\nuniform float uDecid;\n' : '') + (o.wood ? 'uniform float uWeather;\n' : '') + (o.fsPars || ''));
    if (o.fsNormal) fs = fs.replace('#include <normal_fragment_maps>', o.fsNormal);
    if (o.tri) {
      fs = fs.replace('#include <map_fragment>', TRI_MAP);
      fs = fs.replace('#include <roughnessmap_fragment>', TRI_ROUGH);
      fs = fs.replace('#include <normal_fragment_maps>', TRI_NORMAL);
    } else if (o.fsMap || o.wood) {
      fs = fs.replace('#include <map_fragment>', '#include <map_fragment>\n' + (o.wood ? WOOD_MAP : '') + (o.fsMap || ''));
    }
    if (o.fsMetal) fs = fs.replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n' + o.fsMetal);
    if (o.fsRough) fs = fs.replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n' + o.fsRough);
    fs = fs.replace('#include <lights_fragment_begin>', (o.fsPreLights || '') + UW_PRE_LIGHTS + LIGHTS_BEGIN_UW);
    fs = fs.replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\n' + UW_POST_LIGHTS + (o.leaf ? LEAF_POST_LIGHTS : '') + (o.fsPostLights || ''));
    fs = fs.replace('#include <fog_fragment>', '#include <fog_fragment>\n' + UW_FOG);
    sh.vertexShader = vs; sh.fragmentShader = fs;
  };
  return mat;
}
// Depth material for shadow casting that repeats the same vertex deformation (wind / koi swimming)
function patchedDepth(o, map, alphaTest) {
  const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: map || null, alphaTest: alphaTest || 0, side: THREE.DoubleSide });
  m.customProgramCacheKey = () => 'pd-' + o.key;
  m.onBeforeCompile = (sh) => {
    for (const k of Object.keys(SH)) sh.uniforms[k] = SH[k];
    Object.assign(sh.uniforms, o.uniforms || {});
    let vs = sh.vertexShader;
    vs = vs.replace('#include <common>', (o.wind ? '#define WIND\n' : '') + '#include <common>\n' + UW_VS_PARS + (o.vsPars || ''));
    if (o.vsBeginDepth) vs = vs.replace('#include <begin_vertex>', '#include <begin_vertex>\n' + o.vsBeginDepth);
    vs = vs.replace('#include <project_vertex>', /* glsl */`
      vec4 wPos4 = vec4(transformed, 1.0);
      #ifdef USE_INSTANCING
        wPos4 = instanceMatrix * wPos4;
      #endif
      wPos4 = modelMatrix * wPos4;
      #ifdef WIND
        vec3 wWindP = ${o.windPos || 'wPos4.xyz'};
        wPos4.xyz += windOffset(wWindP, ${o.windWeight || '1.0'});
      #endif
      vec4 mvPosition = viewMatrix * wPos4;
      gl_Position = projectionMatrix * mvPosition;`);
    sh.vertexShader = vs;
  };
  return m;
}
function physical(params, patch) {
  const m = new THREE.MeshPhysicalMaterial(Object.assign({ envMapIntensity: 0.85 }, params));
  return patchMaterial(m, patch);
}
function rockMaterial(set, o) {
  return physical(Object.assign({ color: 0xffffff, roughness: o.rough ?? 0.78, metalness: 0, envMapIntensity: 0.7 }, o.params || {}), {
    key: o.key, tri: true, hedge: !!o.hedge,
    uniforms: {
      tAlb: { value: set.map }, tNrm: { value: set.normalMap }, tMossAlb: { value: TEX.moss.map },
      uTriScale: { value: o.scale ?? 1 }, uNrmStr: { value: o.nrm ?? 1 }, uMoss: { value: o.moss ?? 0.5 },
      uTint: { value: new THREE.Color(o.tint ?? 0xffffff) }, uBloomColor: { value: new THREE.Color(o.bloomColor ?? 0xffffff) }, uBloom: { value: o.bloom ?? 0 }, uWetAmt: { value: o.wet ?? 1 },
    },
  });
}

/* ------------------------------------------------------------------ POND SHAPE (closed Catmull-Rom spline + SDF) */
const POND_CTRL = [[0.0, 6.0], [3.1, 4.6], [2.5, 1.2], [3.0, -1.8], [1.8, -3.6], [1.6, -5.6], [-1.2, -6.0], [-1.8, -3.5], [-3.5, -1.0], [-3.4, 3.4]];
const pondCurve = new THREE.CatmullRomCurve3(POND_CTRL.map(([x, z]) => new THREE.Vector3(x, 0, z)), true, 'catmullrom', 0.5);
const NPOLY = 480;
const POLY = pondCurve.getSpacedPoints(NPOLY).slice(0, NPOLY).map((v) => [v.x, v.z]);
const POLY_CUM = [0];
for (let i = 0; i < NPOLY; i++) { const a = POLY[i], b = POLY[(i + 1) % NPOLY]; POLY_CUM.push(POLY_CUM[i] + Math.hypot(b[0] - a[0], b[1] - a[1])); }
const POLY_LEN = POLY_CUM[NPOLY];
let _area = 0;
for (let i = 0; i < NPOLY; i++) { const a = POLY[i], b = POLY[(i + 1) % NPOLY]; _area += a[0] * b[1] - b[0] * a[1]; }
const POLY_CCW = _area > 0;
// Point on the shoreline at arc length s, with tangent and outward normal
function shoreAt(s) {
  s = ((s % POLY_LEN) + POLY_LEN) % POLY_LEN;
  let lo = 0, hi = NPOLY;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (POLY_CUM[m] <= s) lo = m; else hi = m; }
  const a = POLY[lo], b = POLY[(lo + 1) % NPOLY], seg = POLY_CUM[lo + 1] - POLY_CUM[lo];
  const t = seg > 0 ? (s - POLY_CUM[lo]) / seg : 0;
  let tx = b[0] - a[0], tz = b[1] - a[1]; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
  const nx = POLY_CCW ? tz : -tz, nz = POLY_CCW ? -tx : tx;
  return { x: lerp(a[0], b[0], t), z: lerp(a[1], b[1], t), tx, tz, nx, nz, u: s / POLY_LEN };
}
function sdfExact(x, z) {
  let best = 1e18, inside = false;
  for (let i = 0, j = NPOLY - 1; i < NPOLY; j = i++) {
    const ax = POLY[j][0], az = POLY[j][1], bx = POLY[i][0], bz = POLY[i][1];
    const ex = bx - ax, ez = bz - az, wx = x - ax, wz = z - az;
    const t = clamp((wx * ex + wz * ez) / (ex * ex + ez * ez), 0, 1);
    const dx = wx - ex * t, dz = wz - ez * t, d = dx * dx + dz * dz;
    if (d < best) best = d;
    if ((az > z) !== (bz > z) && x < (bx - ax) * (z - az) / (bz - az) + ax) inside = !inside;
  }
  return inside ? -Math.sqrt(best) : Math.sqrt(best);
}
const SDF = { x0: -11, z0: -13, cell: 0.1, nx: 221, nz: 261, d: null };
function buildSDF() {
  SDF.d = new Float32Array(SDF.nx * SDF.nz);
  for (let j = 0; j < SDF.nz; j++) for (let i = 0; i < SDF.nx; i++) SDF.d[j * SDF.nx + i] = sdfExact(SDF.x0 + i * SDF.cell, SDF.z0 + j * SDF.cell);
}
function sdf(x, z) {
  const fx = (x - SDF.x0) / SDF.cell, fz = (z - SDF.z0) / SDF.cell;
  if (fx < 0 || fz < 0 || fx >= SDF.nx - 1 || fz >= SDF.nz - 1) {
    const cx = clamp(fx, 0, SDF.nx - 1.001), cz = clamp(fz, 0, SDF.nz - 1.001);
    return sdf(SDF.x0 + cx * SDF.cell, SDF.z0 + cz * SDF.cell) + Math.hypot((fx - cx) * SDF.cell, (fz - cz) * SDF.cell);
  }
  const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j, n = SDF.nx, d = SDF.d;
  return lerp(lerp(d[j * n + i], d[j * n + i + 1], u), lerp(d[(j + 1) * n + i], d[(j + 1) * n + i + 1], u), v);
}
const PAVILION = { x: 0.3, z: -9.2, r: 1.9 };
const BRIDGE = { z: -3.55, half: 2.75, width: 1.25 };
function pondDepth(x, z, d) { return 0.3 + 0.9 * Math.pow(smoothstep(0.0, 2.1, d), 0.85) + 0.05 * fbm3(x * 0.8, 0.3, z * 0.8, 3, 5) * smoothstep(0, 0.5, d); }
function groundHeight(x, z, s) {
  let h = lerp(0.085, 0.14, smoothstep(0.2, 0.9, s)) + 0.04 * fbm3(x * 0.6, 0, z * 0.6, 3, 9) * smoothstep(0.1, 0.6, s);
  h += 0.45 * smoothstep(0.9, 5.5, s) * (0.5 + 0.5 * fbm3(x * 0.16, 1, z * 0.16, 3, 21));   // soft garden mounds
  const r = Math.hypot(x * 0.9, z * 0.75);
  h += 4.0 * smoothstep(14, 45, r) * (0.55 + 0.45 * fbm3(x * 0.045, 2, z * 0.045, 3, 4)); // distant hills
  const dp = Math.hypot(x - PAVILION.x, z - PAVILION.z);
  h = lerp(0.24, h, smoothstep(PAVILION.r + 0.5, PAVILION.r + 2.2, dp));
  h += wfMound(x, z) * smoothstep(0.1, 0.55, s);                                         // waterfall mound                 // pavilion pad
  return h;
}
function terrainHeight(x, z) { const s = sdf(x, z); return s < 0 ? -pondDepth(x, z, -s) : groundHeight(x, z, s); }

/* ------------------------------------------------------------------ 6. TERRAIN + BASIN */
const WORLD = { noReflect: [], seasonal: [], leafMesh: {}, bloomMats: [] };
function axisCoords(inner, ext, step) {
  const a = [0]; let x = 0, s = step;
  while (x < ext) { if (x > inner) s *= 1.075; x = Math.min(ext, x + s); a.push(x); }
  return a.slice(1).reverse().map((v) => -v).concat(a);
}
function buildTerrain() {
  const xs = axisCoords(8.5, 90, 0.08), zs = axisCoords(12.5, 90, 0.08);
  const NX = xs.length, NZ = zs.length, NV = NX * NZ;
  const pos = new Float32Array(NV * 3), nor = new Float32Array(NV * 3), uv = new Float32Array(NV * 2), col = new Float32Array(NV * 3);
  const S = new Float32Array(NV), Y = new Float32Array(NV);
  for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
    const k = j * NX + i, x = xs[i], z = zs[j], s = sdf(x, z);
    const y = s < 0 ? -pondDepth(x, z, -s) : groundHeight(x, z, s);
    pos[k * 3] = x; pos[k * 3 + 1] = y; pos[k * 3 + 2] = z; uv[k * 2] = x; uv[k * 2 + 1] = z; S[k] = s; Y[k] = y;
    if (s < 0.05) {
      // gravel darkens and greens toward the deep centre (algae, less light)
      const t = smoothstep(0.25, 1.15, -y), n = 0.95 + 0.14 * fbm3(x * 0.7, 5, z * 0.7, 3, 2);
      col[k * 3] = (1 - 0.32 * t) * n; col[k * 3 + 1] = (1 - 0.22 * t) * n; col[k * 3 + 2] = (1 - 0.26 * t) * n * 0.95;
    } else {
      const n = fbm3(x * 0.16, 7, z * 0.16, 3, 8) * 1.6, n2 = fbm3(x * 1.3, 2, z * 1.3, 2, 3);
      const nearShore = 1 - smoothstep(0.1, 0.9, s);   // bare damp soil right behind the coping
      col[k * 3] = (0.92 + 0.2 * n + 0.06 * n2) * lerp(1, 1.1, nearShore);
      col[k * 3 + 1] = (0.98 + 0.12 * n + 0.06 * n2) * lerp(1, 0.86, nearShore);
      col[k * 3 + 2] = (0.86 + 0.1 * n) * lerp(1, 0.8, nearShore);
    }
  }
  for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
    const k = j * NX + i, i0 = Math.max(0, i - 1), i1 = Math.min(NX - 1, i + 1), j0 = Math.max(0, j - 1), j1 = Math.min(NZ - 1, j + 1);
    const dx = (Y[j * NX + i1] - Y[j * NX + i0]) / (xs[i1] - xs[i0]), dz = (Y[j1 * NX + i] - Y[j0 * NX + i]) / (zs[j1] - zs[j0]);
    const l = Math.hypot(dx, 1, dz); nor[k * 3] = -dx / l; nor[k * 3 + 1] = 1 / l; nor[k * 3 + 2] = -dz / l;
  }
  const under = [], wall = [], ground = [];
  for (let j = 0; j < NZ - 1; j++) for (let i = 0; i < NX - 1; i++) {
    const a = j * NX + i, b = a + 1, c = a + NX, d = c + 1;
    const minS = Math.min(S[a], S[b], S[c], S[d]), maxY = Math.max(Y[a], Y[b], Y[c], Y[d]);
    const list = minS < 0.02 ? (maxY < WATER_Y - 0.03 ? under : wall) : ground;
    list.push(a, c, b, b, c, d);
  }
  const attrs = {
    position: new THREE.BufferAttribute(pos, 3), normal: new THREE.BufferAttribute(nor, 3),
    uv: new THREE.BufferAttribute(uv, 2), color: new THREE.BufferAttribute(col, 3),
  };
  const mk = (idx) => { const g = new THREE.BufferGeometry(); for (const k in attrs) g.setAttribute(k, attrs[k]); g.setIndex(new THREE.BufferAttribute(new Uint32Array(idx), 1)); g.computeBoundingSphere(); return g; };
  TEX.ground.map.repeat.set(0.7, 0.7); TEX.ground.normalMap.repeat.set(0.7, 0.7);
  const basinMat = rockMaterial(TEX.gravel, { key: 'basin', scale: 1.5, moss: 0.0, rough: 0.9, nrm: 1.2, wet: 0.3, params: { vertexColors: true, envMapIntensity: 0.5 } });
  const groundMat = physical({ map: TEX.ground.map, normalMap: TEX.ground.normalMap, normalScale: new THREE.Vector2(0.9, 0.9), roughness: 0.95, vertexColors: true, envMapIntensity: 0.55, sheen: 0.4, sheenRoughness: 0.7, sheenColor: new THREE.Color(0x6f8a3a) }, { key: 'ground' });
  const mUnder = new THREE.Mesh(mk(under), basinMat), mWall = new THREE.Mesh(mk(wall), basinMat), mGround = new THREE.Mesh(mk(ground), groundMat);
  mUnder.receiveShadow = mWall.receiveShadow = mGround.receiveShadow = true;
  setLayer(mUnder, LAYER.UNDER); setLayer(mWall, LAYER.BOTH); setLayer(mGround, LAYER.ABOVE);
  scene.add(mUnder, mWall, mGround);
}

/* ------------------------------------------------------------------ 7. STONES */
function instanced(geo, mat, matrices, layer, cast = true) {
  const m = new THREE.InstancedMesh(geo, mat, Math.max(1, matrices.length));
  matrices.forEach((mm, i) => m.setMatrixAt(i, mm));
  m.count = matrices.length; m.castShadow = cast; m.receiveShadow = true;
  m.instanceMatrix.needsUpdate = true; m.computeBoundingSphere();
  setLayer(m, layer); scene.add(m);
  return m;
}
// Velvety moss: fur-style shells over the moss-covered parts of instanced rocks (same mask as the rock shader)
const MOSS_FS = /* glsl */`
uniform sampler2D tMossAlb;
uniform float uMoss;
uniform float uShell;
float mh3(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float mnoise(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(mh3(i), mh3(i + vec3(1,0,0)), f.x), mix(mh3(i + vec3(0,1,0)), mh3(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(mh3(i + vec3(0,0,1)), mh3(i + vec3(1,0,1)), f.x), mix(mh3(i + vec3(0,1,1)), mh3(i + vec3(1,1,1)), f.x), f.y), f.z); }
`;
const MOSS_MAP = /* glsl */`
{
  vec3 wn = normalize(vWNrm);
  float mN = mnoise(vUwPos * 2.2) * 0.7 + mnoise(vUwPos * 7.3 + 4.0) * 0.3;
  float lowLying = 1.0 - smoothstep(uWaterY + 0.05, uWaterY + 0.8, vUwPos.y);
  float shade = 1.0 - clamp(dot(wn, uSunDir), 0.0, 1.0);
  float mm = smoothstep(0.45, 0.85, wn.y * 0.75 + lowLying * 0.35 + shade * 0.3 + (mN - 0.5) * 0.8 - (1.0 - uMoss) * 0.9);
  mm *= smoothstep(uWaterY + 0.07, uWaterY + 0.16, vUwPos.y);
  float strand = mh3(floor(vUwPos * 950.0));
  if (strand * (0.4 + 0.75 * mm) < uShell * 0.8 + 0.12 || mm < 0.35) discard;
  vec3 mc = texture2D(tMossAlb, vUwPos.xz * 3.1).rgb;
  diffuseColor.rgb = mc * (0.55 + 0.75 * uShell) * mix(vec3(1.0), vec3(1.15, 1.1, 0.8), step(0.93, strand));   // occluded at the base, sunlit tips, a few sporophyte tips
}
`;
function addMossShells(src, moss, shells = 5, h = 0.011) {
  for (let k = 1; k <= shells; k++) {
    const f = k / shells;
    const m = physical({ roughness: 0.9, sheen: 0.8, sheenRoughness: 0.6, sheenColor: new THREE.Color(0x9ab85a), envMapIntensity: 0.5 }, {
      key: 'mossshell', uniforms: { tMossAlb: { value: TEX.moss.map }, uMoss: { value: moss }, uShell: { value: f } },
      vsBegin: `transformed += normalize(objectNormal) * ${(h * f).toFixed(4)} / max(0.2, length(instanceMatrix[1].xyz));`,
      fsPars: MOSS_FS, fsMap: MOSS_MAP });
    const sm = new THREE.InstancedMesh(src.geometry, m, src.count);
    sm.instanceMatrix = src.instanceMatrix; sm.count = src.count; sm.receiveShadow = true; sm.frustumCulled = false;
    setLayer(sm, LAYER.SURFACE); scene.add(sm);
  }
}
function buildStones() {
  const granite = rockMaterial(TEX.granite, { key: 'granite', scale: 1.5, moss: 0.35, rough: 0.78, nrm: 0.9 });
  const boulderMat = rockMaterial(TEX.boulder, { key: 'boulder', scale: 0.75, moss: 0.62, rough: 0.8, nrm: 1.3, tint: 0xb8b2a8 });
  WORLD.granite = granite;
  WORLD.boulderMat = boulderMat;
  granite.userData.uniforms.uTint.value.setScalar(0.97);
  const V = new THREE.Vector3(), Q = new THREE.Quaternion(), E = new THREE.Euler(), SC = new THREE.Vector3();
  const mtx = () => new THREE.Matrix4().compose(V, Q, SC);

  // Cut-granite coping blocks (60 x 20 x 30 cm) following the spline, 2 cm mortar gap, ±3° jitter
  const blocks = [];
  let s = 0.035 * POLY_LEN; const sEnd = 0.705 * POLY_LEN;
  while (s < sEnd) {
    const a0 = shoreAt(s), a1 = shoreAt(s + 0.6), bend = Math.acos(clamp(a0.tx * a1.tx + a0.tz * a1.tz, -1, 1));
    const len = bend > 0.16 ? rr(0.3, 0.38) : bend > 0.08 ? rr(0.42, 0.5) : rr(0.52, 0.66), sh = shoreAt(s + len / 2);
    const yaw = Math.atan2(-sh.tz, sh.tx) + rr(-3, 3) * DEG;
    V.set(sh.x + sh.nx * 0.09, 0.078 + rr(-0.012, 0.01), sh.z + sh.nz * 0.09);
    E.set(rr(-1, 1) * DEG, yaw, rr(-1, 1) * DEG, 'YXZ'); Q.setFromEuler(E);
    SC.set(len / 0.6, rr(0.94, 1.06), rr(0.95, 1.1));
    blocks.push(mtx());
    s += len + 0.02 + rr(-0.004, 0.012);
  }
  // abutment blocks under both bridge ends
  for (const sx of [-1, 1]) {
    V.set(sx * (BRIDGE.half - 0.1), 0.12, BRIDGE.z); E.set(0, Math.PI / 2 + rr(-2, 2) * DEG, 0); Q.setFromEuler(E); SC.set(2.4, 1.5, 1.6); blocks.push(mtx());
  }
  (WORLD.solids = WORLD.solids || []).push(instanced(roundedBox(0.6, 0.2, 0.3, 0.02, 3), granite, blocks, LAYER.BOTH));

  // Natural rounded boulders along the left / near shore, a second row behind, garden accents, submerged stones
  const variants = [0, 1, 2, 3].map((i) => rockGeo(i * 13.7 + 2, 4));
  const shore = [[], [], [], []], under = [[], [], [], []];
  let sb = 0.715 * POLY_LEN; const sbEnd = 1.03 * POLY_LEN;
  while (sb < sbEnd) {
    const r = rr(0.2, 0.42), sh = shoreAt(sb);
    if (nearWaterfall(sh.x, sh.z, 0.85)) { sb += 0.3; continue; }
    V.set(sh.x + sh.nx * r * 0.2, -0.1 + r * 0.45, sh.z + sh.nz * r * 0.2);
    E.set(rr(-0.2, 0.2), rand() * 6.28, rr(-0.2, 0.2)); Q.setFromEuler(E);
    SC.set(r * rr(1.0, 1.35), r * rr(0.62, 0.85), r * rr(0.9, 1.2));
    shore[(rand() * 4) | 0].push(mtx());
    if (rand() < 0.6) {
      const R = rr(0.28, 0.6), d = r * 0.8 + R * 0.7;
      V.set(sh.x + sh.nx * d, groundHeight(sh.x + sh.nx * d, sh.z + sh.nz * d, d) - 0.05 + R * 0.28, sh.z + sh.nz * d);
      E.set(rr(-0.15, 0.15), rand() * 6.28, rr(-0.15, 0.15)); Q.setFromEuler(E);
      SC.set(R * rr(1.1, 1.4), R * rr(0.55, 0.8), R * rr(0.9, 1.2));
      shore[(rand() * 4) | 0].push(mtx());
    }
    sb += r * rr(1.25, 1.6);
  }
  // garden accent rocks (larger, half buried)
  const accents = [[-5.6, 1.9, 0.75], [4.9, 0.2, 0.6], [-3.4, -7.8, 0.7], [3.6, -8.2, 0.55], [5.4, 4.4, 0.8], [-6.2, -2.4, 0.9], [-1.6, 7.6, 0.6]];
  for (const [x, z, R] of accents) {
    V.set(x, groundHeight(x, z, sdf(x, z)) - R * 0.25, z); E.set(rr(-0.2, 0.2), rand() * 6.28, rr(-0.2, 0.2)); Q.setFromEuler(E);
    SC.set(R * rr(1.1, 1.5), R * rr(0.7, 0.9), R * rr(0.9, 1.2)); shore[(rand() * 4) | 0].push(mtx());
  }
  let n = 0, guard = 0;
  while (n < 46 && guard++ < 5000) {
    const x = rr(-3.4, 3.1), z = rr(-6, 6), sd = sdf(x, z);
    if (sd > -0.25) continue;
    const r = rr(0.06, 0.22) * (rand() < 0.15 ? 2.0 : 1);
    V.set(x, -pondDepth(x, z, -sd) + r * 0.2, z); E.set(rr(-0.3, 0.3), rand() * 6.28, rr(-0.3, 0.3)); Q.setFromEuler(E);
    SC.set(r * rr(1, 1.5), r * rr(0.5, 0.8), r); under[(rand() * 4) | 0].push(mtx()); n++;
  }
  for (let i = 0; i < 4; i++) {
    const bm = instanced(variants[i], boulderMat, shore[i], LAYER.BOTH); WORLD.solids.push(bm); addMossShells(bm, 0.62);
    instanced(variants[i], boulderMat, under[i], LAYER.UNDER);
  }
}

/* ------------------------------------------------------------------ 8. BRIDGE + PAVILION */
function woodMaterials() {
  const tint = new THREE.Color(0xe2c4ad);
  WORLD.wood = physical({ map: TEX.wood.map, normalMap: TEX.wood.normalMap, normalScale: new THREE.Vector2(0.7, 0.7), roughness: 0.66, color: tint, envMapIntensity: 0.7 },
    { key: 'wood', wood: true, vsPars: WOOD_VS, vsBegin: 'vBox = aBox; vHalf = aHalf;', fsPars: 'varying vec3 vBox;\nvarying vec4 vHalf;\n', fsRough: WOOD_ROUGH, uniforms: { uWeather: { value: 0.35 } } });
  WORLD.rail = physical({ map: TEX.wood.map, normalMap: TEX.wood.normalMap, normalScale: new THREE.Vector2(0.5, 0.5), roughness: 0.5, color: tint,
    clearcoat: 0.3, clearcoatRoughness: 0.4, anisotropy: 0.4, envMapIntensity: 0.8 }, { key: 'rail', wood: true, vsPars: WOOD_VS, vsBegin: 'vBox = aBox; vHalf = aHalf;', fsPars: 'varying vec3 vBox;\nvarying vec4 vHalf;\n', fsRough: WOOD_ROUGH, uniforms: { uWeather: { value: 1.0 } } });
  // 中式小亭：朱红漆柱与栏杆
  WORLD.redLacquer = physical({ color: 0x8e2418, roughness: 0.42, clearcoat: 0.55, clearcoatRoughness: 0.3, envMapIntensity: 0.8 }, { key: 'lacquer' });
}
function meshOf(geos, mat, layer, cast = true) {
  const m = new THREE.Mesh(mergeGeos(geos), mat); m.castShadow = cast; m.receiveShadow = true; setLayer(m, layer); scene.add(m); return m;
}
function buildBridge() {
  const Z0 = BRIDGE.z, H = BRIDGE.half, W = BRIDGE.width;
  const deckY = (x) => 0.3 + 0.6 * (1 - (x / H) ** 2);
  const slope = (x) => Math.atan(-1.2 * x / (H * H));
  WORLD.deckY = deckY;
  const deck = [], rail = [], piers = [];
  const NS = 22;
  const along = (list, hOff, th, wd, zc) => {
    for (let i = 0; i < NS; i++) {
      const xa = -H + (2 * H) * i / NS, xb = -H + (2 * H) * (i + 1) / NS;
      const ya = deckY(xa) + hOff, yb = deckY(xb) + hOff, len = Math.hypot(xb - xa, yb - ya);
      const g = woodBox(len + 0.006, th, wd); g.rotateZ(Math.atan2(yb - ya, xb - xa)); g.translate((xa + xb) / 2, (ya + yb) / 2, zc); list.push(g);
    }
  };
  // stringers
  for (const zo of [-W / 2 + 0.07, W / 2 - 0.07, 0]) along(deck, -0.135, 0.2, 0.09, Z0 + zo);
  // deck planks, grain running across the bridge
  for (let x = -H + 0.07; x < H - 0.05;) {
    const g = woodBox(W + 0.12, 0.035, 0.125, 1, 2); g.rotateY(Math.PI / 2); g.rotateZ(slope(x)); g.translate(x, deckY(x) - 0.0175, Z0); deck.push(g);
    x += 0.14 * Math.cos(slope(x));
  }
  // posts with pyramid caps, top & bottom rails, square balusters
  const postX = [-H + 0.1, -H * 0.5, 0, H * 0.5, H - 0.1];
  for (const side of [-1, 1]) {
    const zc = Z0 + side * (W / 2 + 0.02);
    for (const px of postX) {
      const h = 0.98, g = woodBox(h, 0.1, 0.1); g.rotateZ(Math.PI / 2); g.translate(px, deckY(px) - 0.06 + h / 2, zc); rail.push(g);
      const cap = new THREE.ConeGeometry(0.085, 0.09, 4, 1); cap.rotateY(Math.PI / 4); cap.translate(px, deckY(px) - 0.06 + h + 0.045, zc); rail.push(cap);
    }
    along(rail, 0.84, 0.07, 0.1, zc);
    along(rail, 0.12, 0.05, 0.06, zc);
    for (let bx = -H + 0.2; bx < H - 0.15; bx += 0.15) {
      if (postX.some((px) => Math.abs(px - bx) < 0.08)) continue;
      const h = 0.66, g = woodBox(h, 0.032, 0.032); g.rotateZ(Math.PI / 2); g.translate(bx, deckY(bx) + 0.48, zc); rail.push(g);
    }
  }
  // piers standing in the water + cross beams
  for (const px of [-1.15, 1.15]) {
    for (const side of [-1, 1]) {
      const zc = Z0 + side * (W / 2 - 0.07), bottom = terrainHeight(px, zc) - 0.05, top = deckY(px) - 0.23, h = top - bottom;
      const g = woodBox(h, 0.14, 0.14); g.rotateZ(Math.PI / 2); g.translate(px, bottom + h / 2, zc); piers.push(g);
    }
    const cb = woodBox(W + 0.1, 0.14, 0.12); cb.rotateY(Math.PI / 2); cb.translate(px, deckY(px) - 0.3, Z0); piers.push(cb);
  }
  // 校园版：青石拱桥（石栏板、望柱）
  meshOf(deck, WORLD.granite, LAYER.ABOVE);
  meshOf(rail, WORLD.granite, LAYER.ABOVE);
  meshOf(piers, WORLD.granite, LAYER.BOTH);
}

function buildPavilion() {
  const C = PAVILION, R = C.r, baseTop = 0.62, floorY = baseTop + 0.06;
  const corner = (k, rad) => { const a = (30 + 60 * k) * DEG; return [C.x + rad * Math.sin(a), C.z + rad * Math.cos(a)]; };
  // granite plinth + entry steps
  const plinth = new THREE.CylinderGeometry(R + 0.45, R + 0.55, 0.62, 6, 1); plinth.rotateY(Math.PI / 6); plinth.translate(C.x, baseTop - 0.31, C.z);
  const step1 = roundedBox(1.4, 0.2, 0.45, 0.02, 7); step1.translate(C.x, 0.3, C.z + R + 0.62);
  const step2 = roundedBox(1.2, 0.2, 0.4, 0.02, 8); step2.translate(C.x, 0.48, C.z + R + 0.35);
  const stone = new THREE.Mesh(mergeGeos([weld(plinth), step1, step2].map((g) => { if (!g.attributes.normal) g.computeVertexNormals(); return g; })), WORLD.granite);
  stone.geometry.computeVertexNormals(); stone.castShadow = stone.receiveShadow = true; setLayer(stone, LAYER.ABOVE); scene.add(stone);

  const wood = [], rail = [];
  const floor = new THREE.CylinderGeometry(R + 0.22, R + 0.22, 0.06, 6); floor.rotateY(Math.PI / 6); floor.translate(C.x, baseTop + 0.03, C.z); wood.push(floor);
  const postH = 2.35;
  for (let k = 0; k < 6; k++) {
    const [x, z] = corner(k, R * 0.95);
    const g = woodBox(postH, 0.15, 0.15); g.rotateZ(Math.PI / 2); g.translate(x, floorY + postH / 2, z); rail.push(g);
    const [x2, z2] = corner(k + 1, R * 0.95), dx = x2 - x, dz = z2 - z, len = Math.hypot(dx, dz), yaw = Math.atan2(-dz, dx);
    const beam = woodBox(len + 0.16, 0.2, 0.13); beam.rotateY(yaw); beam.translate((x + x2) / 2, floorY + postH - 0.08, (z + z2) / 2); wood.push(beam);
    const tie = woodBox(len, 0.08, 0.08); tie.rotateY(yaw); tie.translate((x + x2) / 2, floorY + postH - 0.42, (z + z2) / 2); wood.push(tie);
    if (k === 5) continue; // open side faces the bridge (+z)
    for (const [hOff, th] of [[0.72, 0.06], [0.1, 0.05]]) { const r2 = woodBox(len, th, 0.08); r2.rotateY(yaw); r2.translate((x + x2) / 2, floorY + hOff, (z + z2) / 2); rail.push(r2); }
    const nb = Math.floor(len / 0.14);
    for (let b = 1; b < nb; b++) {
      const t = b / nb, bx = lerp(x, x2, t), bz = lerp(z, z2, t), g2 = woodBox(0.58, 0.03, 0.03); g2.rotateZ(Math.PI / 2); g2.translate(bx, floorY + 0.41, bz); rail.push(g2);
    }
    // bench along the inside
    const [ix, iz] = corner(k, R * 0.78), [ix2, iz2] = corner(k + 1, R * 0.78);
    const bench = woodBox(Math.hypot(ix2 - ix, iz2 - iz) * 0.9, 0.05, 0.32); bench.rotateY(yaw); bench.translate((ix + ix2) / 2, floorY + 0.42, (iz + iz2) / 2); wood.push(bench);
  }
  meshOf(wood, WORLD.wood, LAYER.ABOVE);
  meshOf(rail, WORLD.redLacquer, LAYER.ABOVE);   // 红柱
  buildRoof(C, floorY + postH - 0.02);
}
// Hexagonal hip roof: concave pitch, upturned eaves at the corners, tiled top, timber underside & fascia, hip ridges, finial
function buildRoof(C, eaveBase) {
  const RR = 2.85, apexY = eaveBase + 1.7, drop = 1.55, NA = 16, NRr = 14;
  const cornerXZ = (k) => { const a = (30 + 60 * k) * DEG; return [RR * Math.sin(a), RR * Math.cos(a)]; };
  const surf = (k, r, a, off = 0) => {
    const [x0, z0] = cornerXZ(k), [x1, z1] = cornerXZ(k + 1);
    const ex = lerp(x0, x1, a), ez = lerp(z0, z1, a), corner = Math.pow(Math.abs(2 * a - 1), 3);
    const y = apexY - drop * (1 - Math.pow(Math.max(0, 1 - r), 1.8)) + 0.42 * corner * Math.pow(r, 3.2) + 0.05 * Math.pow(r, 4) + off;
    return [C.x + ex * r, y, C.z + ez * r];
  };
  const top = { pos: [], uv: [], idx: [] }, under = { pos: [], uv: [], idx: [] };
  for (let k = 0; k < 6; k++) {
    const b0 = top.pos.length / 3;
    for (let ir = 0; ir <= NRr; ir++) for (let ia = 0; ia <= NA; ia++) {
      const r = ir / NRr, a = ia / NA, p = surf(k, r, a), q = surf(k, r, a, -0.07);
      top.pos.push(...p); under.pos.push(...q);
      top.uv.push((a - 0.5) * r * 3.4, r * 2.6); under.uv.push((a - 0.5) * r * 6, r * 4);
    }
    for (let ir = 0; ir < NRr; ir++) for (let ia = 0; ia < NA; ia++) {
      const v00 = b0 + ir * (NA + 1) + ia, v01 = v00 + 1, v10 = v00 + NA + 1, v11 = v10 + 1;
      top.idx.push(v00, v10, v01, v01, v10, v11);
      under.idx.push(v00, v01, v10, v01, v11, v10);
    }
  }
  const mk = (o) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(o.pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(o.uv, 2)); g.setIndex(o.idx); g.computeVertexNormals(); return g; };
  TEX.roof.map.wrapS = TEX.roof.map.wrapT = THREE.RepeatWrapping;
  const roofMat = physical({ map: TEX.roof.map, normalMap: TEX.roof.normalMap, normalScale: new THREE.Vector2(1.3, 1.3), roughness: 0.55, clearcoat: 0.12, clearcoatRoughness: 0.5, envMapIntensity: 0.8 }, { key: 'roof' });
  const roof = new THREE.Mesh(mk(top), roofMat); roof.castShadow = roof.receiveShadow = true; setLayer(roof, LAYER.ABOVE); scene.add(roof);
  const ceil = new THREE.Mesh(mk(under), WORLD.wood); ceil.receiveShadow = true; setLayer(ceil, LAYER.ABOVE); scene.add(ceil);
  // fascia boards, hip ridges
  const fas = [], ridges = [];
  for (let k = 0; k < 6; k++) {
    const pts = [];
    for (let i = 0; i <= NA; i++) pts.push(new THREE.Vector3(...surf(k, 1, i / NA, -0.05)));
    const curve = new THREE.CatmullRomCurve3(pts);
    const tube = taperTube(curve, NA, 4, 0.06, 0.06, 2); fas.push(tube);
    const hip = [];
    for (let i = 0; i <= 10; i++) hip.push(new THREE.Vector3(...surf(k, i / 10 * 1.02, 0, 0.05)));
    ridges.push(taperTube(new THREE.CatmullRomCurve3(hip), 20, 8, 0.075, 0.05, 3));
  }
  meshOf(fas, WORLD.wood, LAYER.ABOVE);
  const ridgeMat = physical({ color: 0x2b2f33, roughness: 0.5, map: TEX.roof.map, envMapIntensity: 0.8 }, { key: 'ridge' });
  meshOf(ridges, ridgeMat, LAYER.ABOVE);
  // finial (hōju)
  const bronze = physical({ color: 0xb08a3e, map: TEX.boulder.map, roughness: 0.35, metalness: 0.8, envMapIntensity: 1.0 }, { key: 'bronze' });   // 宝顶
  const f1 = new THREE.SphereGeometry(0.13, 20, 14); f1.translate(C.x, apexY + 0.2, C.z);
  const f2 = new THREE.ConeGeometry(0.07, 0.2, 16); f2.translate(C.x, apexY + 0.39, C.z);
  const f3 = new THREE.CylinderGeometry(0.1, 0.16, 0.14, 12); f3.translate(C.x, apexY + 0.05, C.z);
  meshOf([f1, f2, f3], bronze, LAYER.ABOVE);
}

/* ------------------------------------------------------------------ 9. VEGETATION */
function buildPlantTextures() {
  // dense clipped-azalea foliage (opaque, triplanar) with Worley flower cells packed in alpha
  TEX.hedge = genSurface(512, (u, v) => {
    worleyP(u * 44, v * 44, 44, 91);
    const leaf = Math.max(0, 1 - WOR.f1 * 1.5), id = WOR.id, gap = smoothstep(0.0, 0.1, WOR.f2 - WOR.f1);
    let c = mix3(srgbHex(0x2e4a1c), srgbHex(0x55752e), id * 0.7 + leaf * 0.3);
    c = mix3(c, srgbHex(0x16230d), (1 - gap) * 0.7);
    worleyP(u * 11, v * 11, 11, 17);
    const flower = smoothstep(0.42, 0.22, WOR.f1) * (WOR.id > 0.35 ? 1 : 0);
    return [c[0], c[1], c[2], leaf * gap, flower];
  }, 5);
  // grass / iris blade streaks
  const cv = makeCanvas(64, 256), g = cv.getContext('2d');
  const grd = g.createLinearGradient(0, 256, 0, 0); grd.addColorStop(0, '#2c3d17'); grd.addColorStop(0.5, '#5f7a2e'); grd.addColorStop(1, '#a6a55a');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 256);
  for (let i = 0; i < 40; i++) { g.strokeStyle = `rgba(${i % 2 ? '255,255,200' : '20,30,10'},0.12)`; g.lineWidth = 1; const x = Math.random() * 64; g.beginPath(); g.moveTo(x, 0); g.lineTo(x + (Math.random() - 0.5) * 4, 256); g.stroke(); }
  TEX.blade = canvasTex(cv);
  const cv2 = makeCanvas(64, 256), g2 = cv2.getContext('2d');
  const grd2 = g2.createLinearGradient(0, 256, 0, 0); grd2.addColorStop(0, '#34502a'); grd2.addColorStop(1, '#5e8a43');
  g2.fillStyle = grd2; g2.fillRect(0, 0, 64, 256);
  for (let i = 0; i < 26; i++) { const x = 2 + i * 2.4 + Math.random(); g2.strokeStyle = `rgba(${i % 3 ? '20,40,12' : '190,220,150'},${i % 3 ? 0.18 : 0.12})`; g2.lineWidth = 0.8; g2.beginPath(); g2.moveTo(x, 0); g2.lineTo(x, 256); g2.stroke(); }
  g2.strokeStyle = 'rgba(200,230,160,0.3)'; g2.lineWidth = 2; g2.beginPath(); g2.moveTo(32, 0); g2.lineTo(32, 256); g2.stroke();
  const tipG = g2.createLinearGradient(0, 0, 0, 40); tipG.addColorStop(0, 'rgba(150,120,60,0.55)'); tipG.addColorStop(1, 'rgba(150,120,60,0)');
  g2.fillStyle = tipG; g2.fillRect(0, 0, 64, 40);                      // dry, bronzed leaf tips
  TEX.iris = canvasTex(cv2);
  // iris petal: violet with a yellow signal
  const cv3 = makeCanvas(128, 128), g3 = cv3.getContext('2d');
  const grd3 = g3.createRadialGradient(64, 110, 4, 64, 64, 70); grd3.addColorStop(0, '#f2c230'); grd3.addColorStop(0.18, '#e6e0f5'); grd3.addColorStop(0.35, '#6a3fb0'); grd3.addColorStop(1, '#3b1f78');
  g3.fillStyle = grd3; g3.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 18; i++) { g3.strokeStyle = 'rgba(40,10,70,0.35)'; g3.beginPath(); g3.moveTo(64, 120); g3.lineTo(i * 7.5, 0); g3.stroke(); }
  TEX.irisPetal = canvasTex(cv3);
  // water-lily petal: white to blush pink
  const cv4 = makeCanvas(64, 128), g4 = cv4.getContext('2d');
  const grd4 = g4.createLinearGradient(0, 128, 0, 0); grd4.addColorStop(0, '#fff9e8'); grd4.addColorStop(0.6, '#fbe3ea'); grd4.addColorStop(1, '#e9a0b8');
  g4.fillStyle = grd4; g4.fillRect(0, 0, 64, 128);
  TEX.lilyPetal = canvasTex(cv4);
}

const ground = (x, z) => groundHeight(x, z, sdf(x, z));

async function buildVegetation() {
  const V3 = THREE.Vector3;
  await phase2Yield('种植垂柳、香樟与灌木');
  // --- Red-leaf Japanese maple leaning over the left shore
  {
    const bx = -4.75, bz = 0.9;
    const tips = growTree({ base: new V3(bx, ground(bx, bz) - 0.1, bz), dir: new V3(0.72, 1.0, -0.12).normalize(), len: 2.1, rad: 0.15, depth: 4,
      children: [5, 3, 3, 2], childStart: [0.45, 0.3, 0.35, 0.4], spread: [0.95, 0.85, 0.7, 0.6], upBias: [0.25, 0.1, 0.05, 0.1],
      lenDecay: 0.62, radDecay: 0.62, wiggle: [0.12, 0.25, 0.3, 0.35], gravity: [0.02, -0.06, -0.08, -0.05] });
    for (const t of tips) {
      const k = t.lvl >= 4 ? 7 : 3;
      for (let i = 0; i < k; i++) {
        const p = t.p.clone().add(new V3(rr(-0.45, 0.45), rr(-0.15, 0.18), rr(-0.45, 0.45)));
        const n = new V3(rr(-0.6, 0.6), 1.6, rr(-0.6, 0.6));
        addCard(LEAVES.green, p, n, rr(0.42, 0.62), new THREE.Color().setRGB(rr(0.75, 0.95), rr(0.9, 1.1), rr(0.7, 0.9)));   // 香樟（原红枫）
      }
    }
  }
  await phase2Yield('种植垂柳、香樟与灌木');
  // --- Tall Japanese black pine on the right, cloud-pruned pads
  {
    const bx = 5.3, bz = -1.3;
    const tips = growTree({ base: new V3(bx, ground(bx, bz) - 0.1, bz), dir: new V3(-0.18, 1, 0.05).normalize(), len: 6.4, rad: 0.24, depth: 2,
      children: [11, 4], childStart: [0.42, 0.35], spread: [1.25, 0.7], upBias: [0.05, 0.15], lenDecay: 0.34, radDecay: 0.45,
      wiggle: [0.09, 0.3, 0.3], gravity: [0.0, -0.04, 0.02] });
    for (const t of tips) {
      const padR = rr(0.45, 0.75), k = 22;
      for (let i = 0; i < k; i++) {
        const a = rand() * 6.28, r = Math.sqrt(rand()) * padR;
        const p = t.p.clone().add(new V3(Math.cos(a) * r, rr(-0.08, 0.16) + (1 - r / padR) * 0.12, Math.sin(a) * r));
        addCard(LEAVES.pine, p, new V3(rr(-0.4, 0.4), 1, rr(-0.4, 0.4)), rr(0.36, 0.5), new THREE.Color().setRGB(rr(0.85, 1.05), rr(0.9, 1.05), rr(0.85, 1.0)));
      }
    }
  }
  await phase2Yield('种植垂柳、香樟与灌木');
  // --- Background deciduous trees, red maples and a flowering tree; tall conifers behind
  const BG = [[-9, -4, 8, 'green'], [-8.8, 3.8, 6.5, 'green'], [-10, -10.5, 9, 'green'], [-5.5, -12.5, 10, 'green'], [3.6, -13.5, 9.5, 'green'],
    [8.7, -9.8, 7.5, 'green'], [10.2, -4.2, 9, 'green'], [9.6, 3.8, 7.5, 'green'], [-12.5, 8.5, 8, 'green'], [12, 9.5, 7, 'green'],
    [-6.4, -7.6, 5.5, 'green'], [7.2, -6.6, 6.5, 'green'], [-14, -1, 10, 'green'], [15, -1, 10, 'green'], [0.5, -15.5, 11, 'green'], [-3.2, -16.5, 9, 'green'], [6.4, 7.8, 6, 'green']];
  for (const [x, z, h, kind] of BG) {
    const tips = growTree({ base: new V3(x, ground(x, z) - 0.2, z), dir: new V3(rr(-0.1, 0.1), 1, rr(-0.1, 0.1)).normalize(), len: h * 0.45, rad: 0.05 + h * 0.022, depth: 3,
      children: [6, 3, 3], childStart: [0.35, 0.3, 0.3], spread: [0.8, 0.8, 0.7], upBias: [0.5, 0.35, 0.3], lenDecay: 0.58, radDecay: 0.6,
      wiggle: [0.08, 0.25, 0.3], gravity: [0, 0.02, -0.02] });
    const tint = kind === 'green' ? [rr(0.8, 1.15), rr(0.9, 1.1), rr(0.75, 1.0)] : [1, 1, 1];
    for (const t of tips) {
      const k = 6;
      for (let i = 0; i < k; i++) {
        const p = t.p.clone().add(randDir().multiplyScalar(rr(0.2, 0.9)));
        const n = randDir().add(new V3(0, 0.8, 0));
        if (kind === 'pink') addCard(LEAVES.sakura, p, n, rr(0.6, 0.85), new THREE.Color().setRGB(rr(0.98, 1.06), rr(0.84, 0.94), rr(0.88, 0.98)));
        else if (kind === 'maple') addCard(LEAVES.maple, p, n, rr(0.8, 1.1), new THREE.Color().setRGB(rr(0.9, 1.15), rr(0.6, 0.9), rr(0.7, 0.9)));
        else addCard(LEAVES.green, p, n, rr(0.95, 1.35), new THREE.Color().setRGB(tint[0] * rr(0.9, 1.1), tint[1] * rr(0.9, 1.1), tint[2] * rr(0.9, 1.1)));
      }
    }
  }
  await phase2Yield('种植垂柳、香樟与灌木');
  // distant ring of trees that closes the garden in (lower detail: two branch levels, big cards)
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2 + rr(-0.08, 0.08), r = rr(19, 27), x = Math.sin(a) * r, z = Math.cos(a) * r * 0.95 - 2;
    if (z > 8 && Math.abs(x) < 6) continue;                      // keep the near-shore view open
    const h = rr(8, 13);
    const tips = growTree({ base: new V3(x, ground(x, z) - 0.2, z), dir: new V3(rr(-0.1, 0.1), 1, rr(-0.1, 0.1)).normalize(), len: h * 0.5, rad: 0.1 + h * 0.02, depth: 2,
      children: [8, 4], childStart: [0.3, 0.25], spread: [0.8, 0.8], upBias: [0.45, 0.3], lenDecay: 0.6, radDecay: 0.6, wiggle: [0.08, 0.25], gravity: [0, 0.02] });
    const tint = [rr(0.75, 1.1), rr(0.85, 1.1), rr(0.7, 1.0)];
    for (const t of tips) for (let k = 0; k < 5; k++) {
      addCard(LEAVES.green, t.p.clone().add(randDir().multiplyScalar(rr(0.3, 1.3))), randDir().add(new V3(0, 0.6, 0)), rr(1.5, 2.1),
        new THREE.Color().setRGB(tint[0] * rr(0.9, 1.1), tint[1] * rr(0.9, 1.1), tint[2] * rr(0.9, 1.1)));
    }
  }
  const CONIFERS = [[-11, -14, 14], [-7, -17.5, 15], [5.5, -17.5, 13], [11.5, -13.5, 12], [14.5, -6, 13], [-15.5, -8, 12], [-2.5, -20, 16]];
  for (const [x, z, h] of CONIFERS) {
    const gy = ground(x, z);
    BARK.push(taperTube(new THREE.CatmullRomCurve3([new V3(x, gy - 0.2, z), new V3(x + 0.1, gy + h * 0.5, z), new V3(x, gy + h * 0.95, z)]), 16, 8, 0.28, 0.04, 1));
    for (let y = 1.2; y < h; y += 0.15) {
      const rad = Math.pow(1 - y / h, 0.85) * 2.1 + 0.25, cnt = Math.round(rad * 5 + 2);
      for (let i = 0; i < cnt; i++) {
        const a = rand() * 6.28, r = rad * Math.sqrt(rr(0.3, 1));
        addCard(LEAVES.conifer, new V3(x + Math.cos(a) * r, gy + y, z + Math.sin(a) * r), new V3(Math.cos(a), 0.9, Math.sin(a)), rr(1.2, 1.7),
          new THREE.Color().setRGB(rr(0.75, 0.95), rr(0.85, 1.0), rr(0.8, 1.0)));
      }
    }
  }

  await phase2Yield('种植垂柳、香樟与灌木');
  // ===== Cherry trees (Somei-yoshino and a weeping shidare-zakura), cloud-pruned niwaki, potted bonsai =====
  const OCC = [[-4.75, 0.9, 1.3], [5.3, -1.3, 1.5], [-4.3, -3.3, 0.6], [3.65, -6.9, 0.6], [PAVILION.x, PAVILION.z, PAVILION.r + 0.8],
    [-5.6, 1.9, 1.0], [4.9, 0.2, 0.8], [-3.4, -7.8, 0.9], [3.6, -8.2, 0.75], [5.4, 4.4, 1.0], [-6.2, -2.4, 1.1], [-1.6, 7.6, 0.8]];
  for (const [x, z] of BG) OCC.push([x, z, 1.2]);
  const free = (x, z, r) => !OCC.some(([ox, oz, or]) => Math.hypot(x - ox, z - oz) < or + r) && !nearWaterfall(x, z, 1.6 + r)
    && !(Math.abs(z - BRIDGE.z) < 1.0 + r && Math.abs(x) > BRIDGE.half - 0.4 && Math.abs(x) < BRIDGE.half + 3.0)
    && Math.hypot(x + 0.24, z - 5.3) > 2.2 + r;
  const SAK_BARK = [];
  SAKURA.spawn = [];
  const sakuraTree = (x, z, h, weeping) => {
    const gy = ground(x, z), nb = BARK.length;
    const lean = new V3(-sdfGradX(x, z), 0, -sdfGradZ(x, z)).multiplyScalar(0.28);          // lean toward the water
    const tips = weeping
      ? growTree({ base: new V3(x, gy - 0.1, z), dir: new V3(lean.x * 0.5, 1, lean.z * 0.5).normalize(), len: h * 0.42, rad: 0.12 + h * 0.012, depth: 4,
          children: [5, 3, 4, 2], childStart: [0.6, 0.3, 0.2, 0.2], spread: [1.05, 0.9, 0.5, 0.35], upBias: [0.45, 0.35, -0.6, -1.0],
          lenDecay: 0.86, radDecay: 0.6, wiggle: [0.08, 0.2, 0.12, 0.12], gravity: [0.0, -0.02, -0.28, -0.45] })
      : growTree({ base: new V3(x, gy - 0.1, z), dir: new V3(lean.x, 1, lean.z).normalize(), len: h * 0.36, rad: 0.1 + h * 0.013, depth: 4,
          children: [5, 3, 3, 2], childStart: [0.55, 0.3, 0.3, 0.3], spread: [1.05, 0.85, 0.75, 0.6], upBias: [0.3, 0.18, 0.12, 0.1],
          lenDecay: 0.66, radDecay: 0.62, wiggle: [0.1, 0.25, 0.3, 0.35], gravity: [0.0, -0.03, -0.05, -0.06] });
    SAK_BARK.push(...BARK.splice(nb));
    const col = () => new THREE.Color().setRGB(rr(0.85, 1.05), rr(0.92, 1.08), rr(0.8, 1.0));
    if (weeping) {
      // flowers strung along the hanging whips, denser toward their tips
      for (const b of tips.branches) {
        if (b.lvl < 2) continue;
        for (let t = 0.1; t <= 1.0; t += 0.075) {
          const p = b.curve.getPointAt(t), n = randDir().add(new V3(0, 0.3, 0));
          addCard(LEAVES.sakura, p.add(randDir().multiplyScalar(0.05)), new V3(n.x, n.y * 0.15, n.z), rr(0.34, 0.5), col());
          if (rand() < 0.3) SAKURA.spawn.push(p.clone());
        }
      }
    } else {
      for (const t of tips) {
        const k = t.lvl >= 4 ? 11 : 5;
        for (let i = 0; i < k; i++) {
          const p = t.p.clone().add(new V3(rr(-0.36, 0.36), rr(-0.14, 0.24), rr(-0.36, 0.36)));
          addCard(LEAVES.sakura, p, new V3(rr(-0.8, 0.8), 1.2, rr(-0.8, 0.8)), rr(0.38, 0.56), col());
          if (i === 0) SAKURA.spawn.push(p.clone());
        }
      }
      // blossom also clothes the outer limbs themselves, not only the twig ends
      for (const b of tips.branches) {
        if (b.lvl < 2) continue;
        for (let t = 0.3; t < 1.0; t += 0.2) addCard(LEAVES.sakura, b.curve.getPointAt(t).add(randDir().multiplyScalar(0.12)), randDir().add(new V3(0, 0.9, 0)), rr(0.32, 0.46), col());
      }
    }
    OCC.push([x, z, 0.8]); (WORLD.willows = WORLD.willows || []).push([x, z, h]);
  };
  const sdfGradX = (x, z) => (sdf(x + 0.05, z) - sdf(x - 0.05, z)) / 0.1, sdfGradZ = (x, z) => (sdf(x, z + 0.05) - sdf(x, z - 0.05)) / 0.1;
  sakuraTree(5.3, 2.6, 4.6, true);       // 垂柳（原樱花）
  sakuraTree(-6.9, -1.0, 5.0, true);
  sakuraTree(-3.6, -10.4, 5.0, true);
  sakuraTree(5.4, -8.7, 4.6, true);
  sakuraTree(-6.6, 3.3, 4.2, true);
  sakuraTree(1.9, -12.2, 4.4, true);

  await phase2Yield('种植垂柳、香樟与灌木');
  // cloud-pruned niwaki: an S-curved trunk, a few near-horizontal limbs, each ending in a flat-bottomed foliage cloud
  const padBase = rockGeo(5.1, 3, -0.2);
  const padGeos = [];
  const cloudPad = (c, rx, ry, rz, cardSize) => {
    const g = padBase.clone(), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const s2 = 1 + 0.06 * fbm3(p.getX(i) * 3 + c.x, p.getY(i) * 3, p.getZ(i) * 3 + c.z, 2, 3); p.setXYZ(i, p.getX(i) * rx * s2, p.getY(i) * ry * s2, p.getZ(i) * rz * s2); }
    g.computeVertexNormals(); g.translate(c.x, c.y, c.z); padGeos.push(g);
    const n = Math.round(24 + rx * rz * 260);
    for (let i = 0; i < n; i++) {
      const d = randDir(); if (d.y < 0) d.y *= -0.25;
      const nn = new V3(d.x / rx, d.y / ry, d.z / rz).normalize();
      addCard(LEAVES.pine, new V3(c.x + d.x * rx, c.y + d.y * ry, c.z + d.z * rz).addScaledVector(nn, cardSize * 0.08), nn.clone().add(new V3(0, 0.6, 0)), cardSize * rr(0.8, 1.1),
        new THREE.Color().setRGB(rr(0.8, 1.0), rr(0.9, 1.08), rr(0.8, 0.95)));
    }
  };
  const niwaki = (x, z, h, scale = 1) => {
    const gy = ground(x, z), ph = rand() * 6;
    const pts = [];
    for (let i = 0; i <= 6; i++) { const t = i / 6; pts.push(new V3(x + Math.sin(t * 3.4 + ph) * 0.13 * t * scale, gy - 0.05 + t * h, z + Math.cos(t * 2.9 + ph) * 0.11 * t * scale)); }
    const trunk = new THREE.CatmullRomCurve3(pts);
    BARK.push(taperTube(trunk, 30, 10, 0.05 + 0.03 * h * scale, 0.02 * scale, 1.2));
    const top = trunk.getPointAt(1);
    cloudPad(top.clone().add(new V3(0, 0.05 * scale, 0)), 0.3 * scale, 0.17 * scale, 0.28 * scale, 0.26 * scale);
    const nL = 4 + (rand() * 3 | 0);
    for (let k = 0; k < nL; k++) {
      const t = lerp(0.32, 0.86, k / (nL - 1)), s = trunk.getPointAt(t), a = k * 2.4 + ph, L = (0.35 + 0.45 * (1 - t)) * scale * rr(0.85, 1.15);
      const e = new V3(s.x + Math.cos(a) * L, s.y + rr(0.02, 0.1) * scale, s.z + Math.sin(a) * L);
      const mid = new V3(s.x + Math.cos(a) * L * 0.5, s.y - 0.03 * scale, s.z + Math.sin(a) * L * 0.5);
      BARK.push(taperTube(new THREE.CatmullRomCurve3([s, mid, e]), 10, 7, 0.028 * scale, 0.012 * scale, 1.2));
      const pr = (0.2 + 0.18 * (1 - t)) * scale;
      cloudPad(e.clone().add(new V3(0, 0.04 * scale, 0)), pr, pr * 0.45, pr * rr(0.8, 1.0), 0.22 * scale);
    }
    OCC.push([x, z, 0.9 * scale]);
  };
  niwaki(-2.5, -9.9, 1.9); niwaki(5.0, -5.2, 1.6); niwaki(-4.2, 5.8, 1.7); niwaki(2.6, -10.6, 1.4, 0.85);

  await phase2Yield('种植垂柳、香樟与灌木');
  // potted bonsai on a granite display bench by the bridge
  {
    const bx = 3.95, bz = -2.75, gy = ground(bx, bz), yaw = 0.35;
    const benchParts = [roundedBox(0.95, 0.07, 0.34, 0.012, 11).translate(0, 0.395, 0), roundedBox(0.14, 0.36, 0.3, 0.015, 12).translate(-0.33, 0.18, 0), roundedBox(0.14, 0.36, 0.3, 0.015, 13).translate(0.33, 0.18, 0)];
    const bench = new THREE.Mesh(mergeGeos(benchParts), WORLD.granite); bench.position.set(bx, gy - 0.01, bz); bench.rotation.y = yaw;
    bench.castShadow = bench.receiveShadow = true; setLayer(bench, LAYER.ABOVE); scene.add(bench);
    const potMat = [physical({ color: 0x2f3d4c, roughness: 0.32, clearcoat: 0.7, clearcoatRoughness: 0.2 }, { key: 'potglaze' }), physical({ color: 0x5b3a28, roughness: 0.8 }, { key: 'potclay' })];
    const soilMat = rockMaterial(TEX.moss ? TEX.moss : TEX.hedge, { key: 'bonsaimoss', scale: 6, moss: 1.0, rough: 0.95, nrm: 0.8 });
    [[-0.22, 0, 0.34, 0.24, 0], [0.24, 0.3, 0.3, 0.22, 1]].forEach(([ox, ry, pw, pd, mi], k) => {
      const c = Math.cos(yaw), s = Math.sin(yaw), px = bx + ox * c, pz = bz - ox * s, py = gy + 0.43;
      const pot = new THREE.Mesh(mergeGeos([roundedBox(pw, 0.075, pd, 0.012, 20 + k).translate(0, 0.0375 + 0.012, 0),
        roundedBox(0.04, 0.014, 0.04, 0.004, 1).translate(pw * 0.36, 0.006, pd * 0.34), roundedBox(0.04, 0.014, 0.04, 0.004, 2).translate(-pw * 0.36, 0.006, pd * 0.34),
        roundedBox(0.04, 0.014, 0.04, 0.004, 3).translate(pw * 0.36, 0.006, -pd * 0.34), roundedBox(0.04, 0.014, 0.04, 0.004, 4).translate(-pw * 0.36, 0.006, -pd * 0.34)]), potMat[mi]);
      pot.position.set(px, py, pz); pot.rotation.y = yaw + ry; pot.castShadow = pot.receiveShadow = true; setLayer(pot, LAYER.ABOVE); scene.add(pot);
      const soil = new THREE.Mesh(new THREE.BoxGeometry(pw - 0.03, 0.012, pd - 0.03).translate(0, 0.085, 0), soilMat); soil.position.copy(pot.position); soil.rotation.y = pot.rotation.y; soil.receiveShadow = true; setLayer(soil, LAYER.ABOVE); scene.add(soil);
      // informal-upright trunk with a dramatic lean, three to four branches and small foliage clouds
      const b0 = new V3(px, py + 0.085, pz), ph = k * 2.1 + 0.5, H = k ? 0.25 : 0.31;
      const pts = [];
      for (let i = 0; i <= 6; i++) { const t = i / 6; pts.push(new V3(b0.x + Math.sin(t * 4.2 + ph) * 0.06 * t + t * 0.05, b0.y + t * H, b0.z + Math.cos(t * 3.6 + ph) * 0.05 * t)); }
      const trunk = new THREE.CatmullRomCurve3(pts);
      BARK.push(taperTube(trunk, 24, 9, 0.04, 0.011, 3));
      // exposed surface roots (nebari)
      for (let r = 0; r < 5; r++) { const a = r * 1.26 + ph, e = new V3(b0.x + Math.cos(a) * 0.07, b0.y - 0.004, b0.z + Math.sin(a) * 0.07); BARK.push(taperTube(new THREE.CatmullRomCurve3([b0.clone().add(new V3(0, 0.03, 0)), b0.clone().add(new V3(Math.cos(a) * 0.03, 0.008, Math.sin(a) * 0.03)), e]), 6, 5, 0.012, 0.003, 3)); }
      const top = trunk.getPointAt(1);
      cloudPad(top.clone().add(new V3(0, 0.02, 0)), 0.1, 0.055, 0.09, 0.09);
      for (let j = 0; j < 4; j++) {
        const t = 0.36 + j * 0.15, sp = trunk.getPointAt(t), a = j * 2.3 + ph, L = 0.11 + 0.09 * (1 - t);
        const e = new V3(sp.x + Math.cos(a) * L, sp.y + 0.02, sp.z + Math.sin(a) * L);
        BARK.push(taperTube(new THREE.CatmullRomCurve3([sp, new V3(sp.x + Math.cos(a) * L * 0.5, sp.y - 0.01, sp.z + Math.sin(a) * L * 0.5), e]), 6, 5, 0.009, 0.004, 3));
        cloudPad(e.clone().add(new V3(0, 0.015, 0)), 0.08, 0.038, 0.07, 0.08);
      }
    });
    OCC.push([bx, bz, 0.7]);
  }
  if (padGeos.length) meshOf(padGeos, rockMaterial(TEX.hedge, { key: 'hedge', hedge: true, scale: 2.6, nrm: 1.4, rough: 0.72, bloom: 0 }), LAYER.ABOVE);

  await phase2Yield('种植垂柳、香樟与灌木');
  // --- Clipped azalea mounds (green, three in bloom)
  const AZ = [[3.7, 3.4, 0.7, 0.5, 0.6, null], [4.2, 1.5, 0.9, 0.6, 0.8, 0xe8702a], [3.9, 5.7, 0.6, 0.48, 0.6, null], [4.0, -2.1, 0.6, 0.48, 0.55, null],
    [3.2, -5.4, 0.8, 0.6, 0.7, 0xc0186a], [-3.0, -5.4, 0.7, 0.5, 0.7, null], [-3.5, -2.3, 0.55, 0.45, 0.5, 0xe9869f], [-4.4, 3.4, 0.7, 0.5, 0.6, null],
    [-4.9, -1.2, 0.6, 0.45, 0.6, null], [2.6, -7.3, 0.7, 0.52, 0.6, null], [-2.0, -7.5, 0.6, 0.5, 0.6, null], [6.3, -3.6, 1.0, 0.75, 0.9, null], [-6.5, -4.2, 1.1, 0.8, 1.0, null], [2.2, 7.4, 0.8, 0.55, 0.7, null]];
  await phase2Yield('种植垂柳、香樟与灌木');
  // more clipped shrubs: satsuki azalea mounds (some in bloom, white / pink / magenta / coral), low o-karikomi groups and boxwood balls
  {
    const blooms = [0xe9869f, 0xf4eef0, 0xc0186a, 0xe8702a, 0xf2a6c2];
    for (const [x, z, r] of AZ) OCC.push([x, z, r + 0.15]);
    let n = 0, guard = 0;
    while (n < 38 && guard++ < 6000) {
      const x = rr(-8.5, 8.5), z = rr(-12, 8.5), sd = sdf(x, z);
      if (sd < 0.9 || sd > 5.5) continue;
      const kind = rand(), group = kind < 0.25 ? 3 : 1;
      const r0 = kind > 0.8 ? rr(0.22, 0.32) : rr(0.4, 0.75);
      if (!free(x, z, r0 * (group > 1 ? 1.8 : 1))) continue;
      const bloom = kind > 0.8 ? null : rand() < 0.35 ? blooms[(rand() * blooms.length) | 0] : null;
      for (let g = 0; g < group; g++) {
        const a = g * 2.2 + rand(), d = g ? r0 * rr(0.8, 1.1) : 0, rx = r0 * (g ? rr(0.6, 0.8) : 1);
        const yy = kind > 0.8 ? rx * 0.95 : rx * rr(0.62, 0.75);
        AZ.push([x + Math.cos(a) * d, z + Math.sin(a) * d, rx, yy, rx * rr(0.85, 1.05), g ? null : bloom]);
      }
      OCC.push([x, z, r0 * (group > 1 ? 1.8 : 1)]); n++;
    }
  }
  const hedgeGreen = [];
  const base = rockGeo(3.3, 4, -0.25);
  for (const [ax, az, rx, ry, rz, bloom] of AZ) {
    if (nearWaterfall(ax, az, 1.5)) continue;
    let x = ax, z = az; const sd = sdf(x, z);
    if (sd < Math.max(rx, rz) + 0.35) { const g = 0.02, gx = (sdf(x + g, z) - sdf(x - g, z)) / (2 * g), gz = (sdf(x, z + g) - sdf(x, z - g)) / (2 * g), push = Math.max(rx, rz) + 0.35 - sd; x += gx * push; z += gz * push; }
    const gy = ground(x, z);
    const geo = base.clone(); const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) { const s2 = 1 + 0.04 * fbm3(p.getX(i) * 3 + x, p.getY(i) * 3, p.getZ(i) * 3, 2, 7); p.setXYZ(i, p.getX(i) * rx * s2 * 0.82, p.getY(i) * ry * s2 * 0.82, p.getZ(i) * rz * s2 * 0.82); }
    geo.computeVertexNormals(); geo.translate(x, gy + ry * 0.12, z);
    if (bloom) {
      const m = rockMaterial(TEX.hedge, { key: 'hedge', hedge: true, scale: 2.6, nrm: 1.4, rough: 0.72, bloom: 1, bloomColor: bloom }); WORLD.bloomMats.push(m);
      const mesh = new THREE.Mesh(geo, m); mesh.castShadow = mesh.receiveShadow = true; setLayer(mesh, LAYER.ABOVE); scene.add(mesh);
    } else hedgeGreen.push(geo);
    // leafy shell to break the silhouette (+ flower cards on blooming mounds)
    for (let i = 0; i < 80; i++) {
      const d = randDir(); if (d.y < -0.15) d.y = -d.y * 0.3;
      const e = new V3(d.x * rx * 0.82, d.y * ry * 0.82, d.z * rz * 0.82);
      const n = new V3(d.x / rx, d.y / ry, d.z / rz).normalize();
      const pp = e.add(new V3(x, gy + ry * 0.12, z)).addScaledVector(n, 0.02);
      addCard(LEAVES.shrub, pp, n, rr(0.2, 0.3), new THREE.Color().setRGB(rr(0.85, 1.1), rr(0.9, 1.1), rr(0.85, 1.0)));
      if (bloom && i % 2 === 0) addCard(LEAVES.bloom, pp.clone().addScaledVector(n, 0.03), n, rr(0.22, 0.32), new THREE.Color(bloom).multiplyScalar(rr(0.9, 1.15)));
    }
  }
  if (hedgeGreen.length) meshOf(hedgeGreen, rockMaterial(TEX.hedge, { key: 'hedge', hedge: true, scale: 2.6, nrm: 1.4, rough: 0.72, bloom: 0 }), LAYER.ABOVE);

  await buildBotanical(OCC, free, V3);

  await phase2Yield('种植垂柳、香樟与灌木');
  // --- Bark (all trees in one mesh)
  const barkMat = physical({ map: TEX.bark.map, normalMap: TEX.bark.normalMap, normalScale: new THREE.Vector2(1.5, 1.5), roughness: 0.92, color: 0xb8aaa0, envMapIntensity: 0.6 },
    { key: 'bark', wind: 'world', windWeight: 'clamp((wPos4.y - 1.5) * 0.05, 0.0, 0.35)' });
  const barkMesh = meshOf(BARK, barkMat, LAYER.ABOVE);
  barkMesh.customDepthMaterial = patchedDepth({ key: 'barkd', wind: true, windWeight: 'clamp((wPos4.y - 1.5) * 0.05, 0.0, 0.35)' });
  if (SAK_BARK.length) {
    const sm = physical({ map: TEX.sakuraBark.map, normalMap: TEX.sakuraBark.normalMap, normalScale: new THREE.Vector2(1.2, 1.2), roughness: 0.8, envMapIntensity: 0.6 },
      { key: 'barksak', wind: 'world', windWeight: 'clamp((wPos4.y - 1.5) * 0.05, 0.0, 0.35)' });
    const sbm = meshOf(SAK_BARK, sm, LAYER.ABOVE);
    sbm.customDepthMaterial = patchedDepth({ key: 'barkd', wind: true, windWeight: 'clamp((wPos4.y - 1.5) * 0.05, 0.0, 0.35)' });
  }

  await phase2Yield('种植垂柳、香樟与灌木');
  // --- Leaf-card instanced meshes (alpha-tested, double sided, translucent, wind-swayed)
  const cardGeo = new THREE.PlaneGeometry(1, 1, 4, 4);
  { const cp = cardGeo.attributes.position; for (let i = 0; i < cp.count; i++) { const x = cp.getX(i), y = cp.getY(i); cp.setZ(i, 0.2 * (x * x + y * y) - 0.05 * y); } cardGeo.computeVertexNormals(); }   // cupped, not flat
  const leafSets = [['maple', TEX.mapleLeaves, 0.45, 0x8a2a2a], ['pine', TEX.pineNeedles, 0.22, 0x5a7040], ['green', TEX.greenLeaves, 0.35, 0x86a050],
    ['conifer', TEX.conifer, 0.18, 0x4a6040], ['shrub', TEX.shrubLeaves, 0.25, 0x6a8a40], ['bloom', TEX.bloomLeaves, 0.4, 0xffc0d0], ['sakura', TEX.sakura, 0.95, 0xffd0dc], ['hydrangea', TEX.hydrangea, 0.55, 0xd0d8ff], ['bigleaf', TEX.bigleaf, 0.4, 0x90b060], ['camellia', TEX.camellia, 0.25, 0x406030], ['kikyo', TEX.kikyo, 0.5, 0xb0a0f0]];
  WORLD.leafMats = [];
  for (const [name, tex, transl, sheen] of leafSets) {
    const list = LEAVES[name]; if (!list.length) continue;
    const ww = 'clamp((wPos4.y - 0.2) * 0.2, 0.0, 1.3)';
    const mat = physical({ map: tex, alphaTest: 0.45, alphaToCoverage: P.quality === 'High', side: THREE.DoubleSide, roughness: 0.62, envMapIntensity: 0.55 },
      { key: 'leaf', leaf: true, wind: 'world', windWeight: ww, uniforms: { uTransl: { value: transl }, uDecid: { value: { maple: 0.6, green: 1, bigleaf: 1, shrub: 0.35 }[name] || 0 } },
        fsMap: 'diffuseColor.a *= smoothstep(0.2, 0.45, abs(dot(normalize(vNormal), normalize(vViewPosition))));' });   // hide cards seen edge-on
    WORLD.leafMats.push(mat);
    const im = new THREE.InstancedMesh(cardGeo, mat, list.length);
    list.forEach((e, i) => { im.setMatrixAt(i, e.m); im.setColorAt(i, e.c); });
    im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
    // low card shells sit on shadow-casting mounds already: their own shadow pass isn't worth its cost
    const low = ['bigleaf', 'hydrangea', 'kikyo', 'camellia'].includes(name);
    WORLD.leafMesh[name] = im;
    seasonal(im, { maple: 'SRA', green: 'SRA', sakura: 'SRA', bloom: 'SR', hydrangea: 'SRA', bigleaf: 'SRA', kikyo: 'SR' }[name] || 'SRAW');
    im.castShadow = !low; im.receiveShadow = true; if (low) WORLD.noReflect.push(im);
    im.customDepthMaterial = patchedDepth({ key: 'leafd', wind: true, windWeight: ww }, tex, 0.45);
    im.computeBoundingSphere();
    setLayer(im, LAYER.ABOVE); scene.add(im);
  }

  await phase2Yield('种植垂柳、香樟与灌木');
  // --- Shade plants along the banks: ferns (arching pinnate fronds) and variegated hostas
  {
    const M = new THREE.Matrix4(), Qb = new THREE.Quaternion(), Eb = new THREE.Euler(), Sb = new THREE.Vector3(), Pb = new THREE.Vector3();
    const fcv = makeCanvas(256, 512), fg = fcv.getContext('2d');
    fg.strokeStyle = '#3f5a22'; fg.lineWidth = 5; fg.beginPath(); fg.moveTo(128, 512); fg.lineTo(128, 6); fg.stroke();
    for (let k = 0; k < 26; k++) {
      const y = 500 - k * 19, len = 118 * Math.sin(Math.PI * Math.min(1, (k + 2) / 27)) * (1 - k / 34);
      for (const sd of [-1, 1]) {
        fg.fillStyle = `hsl(${88 + k * 0.8 + (sd > 0 ? 3 : 0)}, 45%, ${24 + k * 0.5}%)`;
        for (let j = 0; j < 9; j++) { const t = j / 9, x = 128 + sd * (8 + t * len), yy = y - t * 22 - 6, r = (1 - t) * 8 + 3; fg.beginPath(); fg.ellipse(x, yy, r * 1.1, r * 0.8, sd * 0.4, 0, Math.PI * 2); fg.fill(); }
      }
    }
    const fernTex = canvasTex(fcv);
    const fernMat = physical({ map: fernTex, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.55, sheen: 0.4, sheenColor: new THREE.Color(0xa8c070) },
      { key: 'fern', leaf: true, wind: 'local', windWeight: 'uv.y * uv.y * 0.6', uniforms: { uTransl: { value: 0.45 } } });
    const frond = (L, W) => {
      const nu = 10, pos = [], uv = [], idx = [];
      for (let i = 0; i <= nu; i++) { const t = i / nu, y = L * (0.9 * t - 0.75 * t * t * t), x = L * 0.85 * t, w = W * Math.sin(Math.PI * Math.min(1, t * 1.1 + 0.05));
        pos.push(x, y, -w / 2, x, y, w / 2); uv.push(0, t, 1, t); }
      for (let i = 0; i < nu; i++) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals(); return g;
    };
    const fernGeo = frond(0.55, 0.2), fm = [], fc = [];
    const spots = [[-4.1, 1.9], [-4.3, -0.4], [-3.7, -2.9], [-2.4, -6.4], [2.6, -6.2], [4.6, -2.4], [4.2, 4.6], [-3.6, 4.4], [1.2, 6.6], [-5.2, 2.8]];
    for (const [cx0, cz0] of spots) {
      if (nearWaterfall(cx0, cz0, 1.2)) continue;
      let cx = cx0, cz = cz0; const sd = sdf(cx, cz); if (sd < 0.45) { const e = 0.03, gx = (sdf(cx + e, cz) - sdf(cx - e, cz)) / (2 * e), gz = (sdf(cx, cz + e) - sdf(cx, cz - e)) / (2 * e); cx += gx * (0.6 - sd); cz += gz * (0.6 - sd); }
      const n = 10 + (rand() * 6 | 0), gy = ground(cx, cz) - 0.01;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + rr(-0.2, 0.2), sc = rr(0.7, 1.15);
        Pb.set(cx + Math.cos(a) * 0.04, gy, cz - Math.sin(a) * 0.04); Eb.set(0, a, rr(-0.15, 0.25), 'YXZ'); Qb.setFromEuler(Eb); Sb.set(sc, sc * rr(0.85, 1.15), sc);
        fm.push(M.compose(Pb, Qb, Sb).clone()); fc.push(new THREE.Color().setRGB(rr(0.85, 1.1), rr(0.9, 1.1), rr(0.8, 1.0)));
      }
    }
    const fim = new THREE.InstancedMesh(fernGeo, fernMat, fm.length);
    fm.forEach((mm, i) => { fim.setMatrixAt(i, mm); fim.setColorAt(i, fc[i]); });
    fim.castShadow = fim.receiveShadow = true; fim.customDepthMaterial = patchedDepth({ key: 'fernd', wind: true, windWeight: 'uv.y * uv.y * 0.6' }, fernTex, 0.45);
    fim.computeBoundingSphere(); setLayer(fim, LAYER.ABOVE); scene.add(fim);
    // hostas: broad heart-shaped leaves with creamy margins and curved parallel veins
    const hcv = makeCanvas(256, 256), hg2 = hcv.getContext('2d');
    hg2.fillStyle = '#e6e2b8'; hg2.beginPath(); hg2.moveTo(128, 250); hg2.bezierCurveTo(250, 200, 240, 40, 128, 6); hg2.bezierCurveTo(16, 40, 6, 200, 128, 250); hg2.fill();
    hg2.fillStyle = '#3d6a3a'; hg2.beginPath(); hg2.moveTo(128, 236); hg2.bezierCurveTo(228, 196, 220, 52, 128, 22); hg2.bezierCurveTo(36, 52, 28, 196, 128, 236); hg2.fill();
    hg2.strokeStyle = 'rgba(20,50,25,0.45)'; hg2.lineWidth = 2;
    for (let k = -5; k <= 5; k++) { hg2.beginPath(); hg2.moveTo(128, 240); hg2.quadraticCurveTo(128 + k * 22, 130, 128 + k * 4, 24); hg2.stroke(); }
    const hostaMat = physical({ map: canvasTex(hcv), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.45, clearcoat: 0.25, sheen: 0.3, sheenColor: new THREE.Color(0xc0e0b0) },
      { key: 'hosta', leaf: true, wind: 'local', windWeight: 'uv.y * 0.3', uniforms: { uTransl: { value: 0.35 } } });
    const hleaf = petalGeo(0.22, 0.075, 0.05, 1.2); hleaf.rotateX(-0.3);
    { const hu = hleaf.attributes.uv; for (let i = 0; i < hu.count; i++) hu.setXY(i, hu.getX(i), hu.getY(i)); }
    const hm = [];
    for (const [cx, cz] of [[-4.6, -1.6], [5.1, 1.5], [-2.2, -7.7], [2.9, 6.1], [-5.4, 0.6], [6.4, -1.2]]) {
      if (sdf(cx, cz) < 0.5) continue;
      const gy = ground(cx, cz);
      for (let i = 0; i < 14; i++) { const a = (i / 14) * Math.PI * 2 + rr(-0.2, 0.2); Pb.set(cx, gy + 0.02, cz); Eb.set(rr(-0.5, -0.1), a, 0, 'YXZ'); Qb.setFromEuler(Eb); const sc = rr(0.8, 1.2); Sb.set(sc, sc, sc); hm.push(M.compose(Pb, Qb, Sb).clone()); }
    }
    const him = new THREE.InstancedMesh(hleaf, hostaMat, hm.length);
    hm.forEach((mm, i) => him.setMatrixAt(i, mm));
    him.castShadow = him.receiveShadow = true; him.computeBoundingSphere(); setLayer(him, LAYER.ABOVE); scene.add(him);
  }
  await phase2Yield('种植垂柳、香樟与灌木');
  // --- Ornamental grasses (land) and iris at the waterline
  const blade = (h, w, bend, segs = 6) => {
    const pos = [], uv = [], idx = [];
    for (let i = 0; i <= segs; i++) {
      const t = i / segs, y = h * t * (1 - 0.15 * t * t), x = bend * t * t, wd = w * Math.pow(1 - t, 0.7) + 0.002;
      pos.push(x, y, -wd / 2, x, y, wd / 2); uv.push(0, t, 1, t);
    }
    for (let i = 0; i < segs; i++) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
    return g;
  };
  const grassM = [], irisM = [], grassC = [], irisC = [];
  const M = new THREE.Matrix4(), Qb = new THREE.Quaternion(), Eb = new THREE.Euler(), Sb = new THREE.Vector3(), Pb = new THREE.Vector3();
  const grassSpots = [0.06, 0.12, 0.2, 0.27, 0.33, 0.45, 0.52, 0.6, 0.66, 0.74, 0.97];
  for (const u of grassSpots) {
    const sh = shoreAt(u * POLY_LEN), d = rr(0.45, 0.8), cx = sh.x + sh.nx * d, cz = sh.z + sh.nz * d;
    if (Math.abs(cz - BRIDGE.z) < 0.9 && Math.abs(cx) < BRIDGE.half + 0.4) continue;
    const gy = ground(cx, cz); (WORLD.grass = WORLD.grass || []).push([cx, cz]);
    for (let i = 0; i < 70; i++) {
      const a = rand() * 6.28, r = Math.sqrt(rand()) * 0.22;
      Pb.set(cx + Math.cos(a) * r, gy - 0.02, cz + Math.sin(a) * r);
      Eb.set(0, a + rr(-0.4, 0.4), 0); Qb.setFromEuler(Eb);
      const hs = rr(0.7, 1.15); Sb.set(1, hs, 1);
      grassM.push(M.compose(Pb, Qb, Sb).clone()); grassC.push(new THREE.Color().setRGB(rr(0.85, 1.1), rr(0.85, 1.05), rr(0.7, 0.95)));
    }
  }
  await phase2Yield('种植垂柳、香樟与灌木');
  // Japanese water iris (Iris ensata / laevigata): equitant fans of sword leaves rising from the shallows
  const irisSpots = [0.78, 0.84, 0.9, 0.57, 0.64, 0.99];
  const irisClumps = [];
  for (const u of irisSpots) {
    const sh = shoreAt(u * POLY_LEN), cx = sh.x - sh.nx * 0.28, cz = sh.z - sh.nz * 0.28;
    irisClumps.push({ x: cx, z: cz, nx: sh.nx, nz: sh.nz }); WORLD.irisClumps = irisClumps;
    const fans = 4 + (rand() * 2 | 0);
    for (let f = 0; f < fans; f++) {
      const a = rand() * 6.28, r = Math.sqrt(rand()) * 0.11, fanYaw = rand() * Math.PI, nL = 4 + (rand() * 3 | 0);
      for (let i = 0; i < nL; i++) {
        const k = nL > 1 ? i / (nL - 1) * 2 - 1 : 0;                    // -1..1 across the fan
        // rooted in the pond floor (never floating in mid-water), tips at the same height above the surface
        const lx = cx + Math.cos(a) * r + k * 0.006, lz = cz + Math.sin(a) * r, floorY = Math.min(WATER_Y - 0.25, terrainHeight(lx, lz) - 0.02);
        Pb.set(lx, floorY, lz);
        Eb.set(k * 0.3 + rr(-0.05, 0.05), fanYaw + (rand() < 0.5 ? 0 : Math.PI), 0, 'YXZ'); Qb.setFromEuler(Eb);
        Sb.set(1, (1 - Math.abs(k) * 0.3) * rr(0.85, 1.12) - 0.25 - floorY, 1);
        irisM.push(M.compose(Pb, Qb, Sb).clone()); irisC.push(new THREE.Color().setRGB(rr(0.88, 1.04), rr(0.9, 1.05), rr(0.86, 1.0)));
      }
    }
  }
  const bladeMatFor = (tex, key, H) => {
    const ww = `pow(clamp(position.y / ${H.toFixed(2)}, 0.0, 1.0), 1.6)`;
    const m = physical({ map: tex, side: THREE.DoubleSide, roughness: 0.6, sheen: 0.4, sheenRoughness: 0.5, sheenColor: new THREE.Color(0xb0c070), envMapIntensity: 0.6 },
      { key, leaf: true, decid: 0.7, wind: 'local', windWeight: ww, uniforms: { uTransl: { value: 0.35 } } });
    return [m, patchedDepth({ key: key + 'd', wind: true, windWeight: ww })];
  };
  const mkBlades = (geo, tex, key, H, mats, cols, layer) => {
    const [m, dm] = bladeMatFor(tex, key, H);
    const im = new THREE.InstancedMesh(geo, m, mats.length);
    mats.forEach((mm, i) => { im.setMatrixAt(i, mm); im.setColorAt(i, cols[i]); });
    im.castShadow = im.receiveShadow = true; im.customDepthMaterial = dm; im.computeBoundingSphere();
    setLayer(im, layer); scene.add(im);
  };
  mkBlades(blade(0.62, 0.018, 0.32), TEX.blade, 'grass', 0.62, grassM, grassC, LAYER.ABOVE);
  await phase2Yield('种植垂柳、香樟与灌木');
  // short lawn tufts scattered around the pond so the ground holds up in close-ups
  {
    const parts = [];
    for (let b = 0; b < 7; b++) { const g = blade(rr(0.045, 0.1), rr(0.003, 0.005), rr(0.005, 0.03), 3); g.rotateY(rand() * Math.PI * 2); g.translate(rr(-0.02, 0.02), 0, rr(-0.02, 0.02)); parts.push(g); }
    const tuft = mergeGeos(parts);
    const [tm] = bladeMatFor(TEX.blade, 'tuft', 0.1);
    const mats = [], cols = [];
    const avoid = [[PAVILION.x, PAVILION.z, PAVILION.r + 0.9]];
    let guard = 0;
    while (mats.length < 2800 && guard++ < 40000) {
      const x = rr(-9, 9), z = rr(-12, 10), sd = sdf(x, z);
      if (sd < 0.35 || sd > 6.5 || nearWaterfall(x, z, 1.0) || avoid.some(([ax, az, r]) => Math.hypot(x - ax, z - az) < r)) continue;
      if (Math.abs(z - BRIDGE.z) < 0.9 && Math.abs(Math.abs(x) - BRIDGE.half) < 0.6) continue;
      const clumpy = fbm3(x * 0.8, 1, z * 0.8, 2, 44);
      if (clumpy < -0.05 && rand() < 0.7) continue;
      Pb.set(x, ground(x, z) - 0.005, z); Eb.set(rr(-0.1, 0.1), rand() * 6.28, rr(-0.1, 0.1)); Qb.setFromEuler(Eb); const sc = rr(0.7, 1.4); Sb.set(sc, sc * rr(0.8, 1.3), sc);
      mats.push(M.compose(Pb, Qb, Sb).clone()); cols.push(new THREE.Color().setRGB(rr(0.62, 0.85), rr(0.72, 0.95), rr(0.5, 0.7)));
    }
    const im = new THREE.InstancedMesh(tuft, tm, mats.length);
    mats.forEach((mm, i) => { im.setMatrixAt(i, mm); im.setColorAt(i, cols[i]); });
    im.receiveShadow = true; im.computeBoundingSphere(); setLayer(im, LAYER.ABOVE); scene.add(im);
  }
  await phase2Yield('种植垂柳、香樟与灌木');
  // sword leaf: parallel-sided with a keeled midrib, tapering only in the last quarter to a sharp tip; tips arch over
  const irisLeaf = (() => {
    const segs = 10, pos = [], uv = [], idx = [], h = 1.0, w = 0.024;
    for (let i = 0; i <= segs; i++) {
      const t = i / segs, y = h * t * (1 - 0.1 * t * t), x = 0.16 * Math.pow(t, 2.2), wd = w * (0.75 + 0.25 * smoothstep(0, 0.12, t)) * (1 - smoothstep(0.62, 1.0, t)) + 0.0008;
      const keel = 0.0035 * (1 - t);
      pos.push(x, y, -wd / 2, x - keel, y, 0, x, y, wd / 2); uv.push(0, t, 0.5, t, 1, t);
    }
    for (let i = 0; i < segs; i++) { const a = i * 3; idx.push(a, a + 3, a + 1, a + 1, a + 3, a + 4, a + 1, a + 4, a + 2, a + 2, a + 4, a + 5); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
    return g;
  })();
  mkBlades(irisLeaf, TEX.iris, 'irisleaf', 1.0, irisM, irisC, LAYER.BOTH);
  buildIrisFlowers(irisClumps);

  await buildPondLife();
}

/* ------------------------------------------------------------------ 9a2. JAPANESE IRIS FLOWERS */
// Hanashobu: every bloom sits on its own flowering stalk: a green scape rising above the leaves, two spathe bracts,
// the ovary and perianth tube, then 3 broad drooping falls (yellow signal in a white halo, violet veining),
// 3 small upright standards and 3 petaloid style arms arching over the falls. Buds on some stalks.
// Petal atlas regions (u across): falls 0-0.5, standards 0.5-0.66, style arms 0.66-0.83, green parts 0.83-1.
function irisAtlas() {
  const W = 512, H = 256, cv = makeCanvas(W, H), g = cv.getContext('2d');
  const R = Math.random;
  // --- falls
  let gr = g.createLinearGradient(0, H, 0, 0);
  gr.addColorStop(0, '#a09a52'); gr.addColorStop(0.08, '#7a4c8e'); gr.addColorStop(0.3, '#72388c'); gr.addColorStop(0.75, '#642e82'); gr.addColorStop(1, '#723e90');
  g.fillStyle = gr; g.fillRect(0, 0, 256, H);
  const edge = g.createLinearGradient(0, 0, 256, 0);
  edge.addColorStop(0, 'rgba(170,120,190,0.35)'); edge.addColorStop(0.2, 'rgba(0,0,0,0)'); edge.addColorStop(0.8, 'rgba(0,0,0,0)'); edge.addColorStop(1, 'rgba(170,120,190,0.35)');
  g.fillStyle = edge; g.fillRect(0, 0, 256, H);
  const vein = (x0, x1, y0, y1, col, lw) => { g.strokeStyle = col; g.lineWidth = lw; g.beginPath(); g.moveTo(x0, H - y0); const n = 10; for (let i = 1; i <= n; i++) { const t = i / n; g.lineTo(lerp(x0, x1, t) + Math.sin(t * 9 + x0) * 1.2, H - lerp(y0, y1, t)); } g.stroke(); };
  for (let i = 0; i < 70; i++) { const x = 4 + i * 3.6 + R() * 2; vein(x, x + (x - 128) * 0.08, 0, H * (0.75 + R() * 0.25), `rgba(38,10,78,${0.25 + R() * 0.25})`, 0.8 + R() * 0.7); }
  for (let i = 0; i < 34; i++) { const x = 80 + R() * 96; vein(x, x + (x - 128) * 0.35, 8, H * (0.28 + R() * 0.3), `rgba(245,240,255,${0.35 + R() * 0.3})`, 0.7 + R() * 0.8); }
  // white halo + yellow signal (a tapering blaze along the midline)
  let rg = g.createRadialGradient(128, H - 96, 4, 128, H - 96, 78); rg.addColorStop(0, 'rgba(250,248,255,0.95)'); rg.addColorStop(0.55, 'rgba(236,228,250,0.55)'); rg.addColorStop(1, 'rgba(236,228,250,0)');
  g.save(); g.translate(128, H - 96); g.scale(0.55, 1.3); g.translate(-128, -(H - 96)); g.fillStyle = rg; g.fillRect(0, 0, 256, H); g.restore();
  g.save(); g.translate(128, H - 96); g.scale(0.26, 1.25);
  rg = g.createRadialGradient(0, 0, 2, 0, 0, 58); rg.addColorStop(0, '#f6b820'); rg.addColorStop(0.6, '#f3cf3a'); rg.addColorStop(1, 'rgba(243,207,58,0)');
  g.fillStyle = rg; g.beginPath(); g.arc(0, 0, 58, 0, Math.PI * 2); g.fill(); g.restore();
  for (let i = 0; i < 9; i++) { const x = 118 + i * 2.5; vein(x, x, 30, 150, 'rgba(120,60,20,0.35)', 0.7); }
  // --- standards
  gr = g.createLinearGradient(0, H, 0, 0); gr.addColorStop(0, '#9a86b0'); gr.addColorStop(0.3, '#7a4a9c'); gr.addColorStop(1, '#6a3a90');
  g.fillStyle = gr; g.fillRect(256, 0, 84, H);
  for (let i = 0; i < 22; i++) { const x = 258 + i * 3.7; vein(x, x + (x - 298) * 0.1, 0, H * (0.7 + R() * 0.3), `rgba(40,12,80,${0.3 + R() * 0.2})`, 0.8); }
  // --- style arms (pale lavender, darker midline, fringed crest at the tip)
  gr = g.createLinearGradient(0, H, 0, 0); gr.addColorStop(0, '#e2dae8'); gr.addColorStop(0.5, '#c0a4d6'); gr.addColorStop(1, '#9a70b8');
  g.fillStyle = gr; g.fillRect(340, 0, 86, H);
  vein(383, 383, 0, H, 'rgba(90,50,150,0.6)', 3);
  for (let i = 0; i < 10; i++) { const x = 346 + i * 8; vein(x, x, H * 0.2, H, 'rgba(110,70,170,0.3)', 0.8); }
  // --- green parts: ovary, tube, spathes (papery bronze tips)
  gr = g.createLinearGradient(0, H, 0, 0); gr.addColorStop(0, '#3c6426'); gr.addColorStop(0.55, '#5c8436'); gr.addColorStop(0.82, '#8c9046'); gr.addColorStop(1, '#b09a68');
  g.fillStyle = gr; g.fillRect(426, 0, 86, H);
  for (let i = 0; i < 16; i++) { const x = 428 + i * 5.3; vein(x, x, 0, H, 'rgba(20,40,10,0.22)', 0.8); }
  const t = canvasTex(cv); t.anisotropy = 4; return t;
}
// A petal surface: centre line swept in the (radial, up) plane with a varying angle, cupped and ruffled across.
function irisPetal(o) {
  const nu = o.nu || 14, nv = o.nv || 8, pos = [], uv = [], idx = [];
  let r = o.r0 || 0, y = o.y0 || 0;
  const ds = o.L / nu;
  for (let i = 0; i <= nu; i++) {
    const u = i / nu, th = lerp(o.th0, o.th1, Math.pow(u, o.thP || 1.2));
    const nx = -Math.sin(th), ny = Math.cos(th);
    const wBody = u < o.wMax ? o.haft + (1 - o.haft) * Math.pow(Math.sin(Math.PI * 0.5 * u / o.wMax), 1.4) : Math.sqrt(Math.max(0, 1 - Math.pow((u - o.wMax) / (1 - o.wMax), 2.2)));
    const w = o.W * wBody + 0.0004;
    for (let j = 0; j <= nv; j++) {
      const v = j / nv * 2 - 1;
      let h = -o.cup * v * v * Math.min(1, u * 2) + (o.groove || 0) * Math.exp(-v * v * 12) * (1 - u);
      h += (o.ruffle || 0) * Math.sin(v * Math.PI * 2.5 + u * 7 + (o.seed || 0)) * Math.pow(Math.abs(v), 1.6) * smoothstep(0.3, 1, u);
      if (o.crest) h += o.crest * smoothstep(0.78, 1, u) * (0.4 + Math.abs(v));      // style-arm crest flips up
      pos.push(r + nx * h, y + ny * h, v * w);
      uv.push(lerp(o.ux0, o.ux1, v * 0.5 + 0.5), u);
    }
    r += Math.cos(th) * ds; y += Math.sin(th) * ds;
  }
  for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) { const a = i * (nv + 1) + j, b = a + nv + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}
function irisLathe(profile, ux0, ux1, seg = 10) {             // profile: [[radius, y], ...] bottom to top
  const pts = profile.map(([r, y]) => new THREE.Vector2(Math.max(r, 1e-4), y));
  const g = new THREE.LatheGeometry(pts, seg), uvA = g.attributes.uv;
  for (let i = 0; i < uvA.count; i++) uvA.setX(i, lerp(ux0, ux1, uvA.getX(i)));
  return g;
}
function irisBracts(len, h0, seed) {                            // two spathe bracts sheathing the ovary, pointed and papery at the tip
  const out = [];
  for (let k = 0; k < 2; k++) {
    const b = irisPetal({ L: len, W: 0.009, haft: 0.9, wMax: 0.35, th0: 1.5, th1: 1.28 + k * 0.08, cup: 0.004, ux0: 0.84, ux1: 0.99, nu: 6, nv: 4, seed });
    b.translate(0.0035, h0, 0); b.rotateY(k * Math.PI + seed); out.push(b);
  }
  return out;
}
function irisFlowerGeo(variant) {
  const parts = [], F = 0.83, G0 = 0.84, G1 = 0.99;
  // ovary + perianth tube (starts exactly at the stalk tip: y = 0)
  parts.push(irisLathe([[0.0032, 0], [0.0042, 0.006], [0.0048, 0.018], [0.0036, 0.028], [0.0024, 0.032], [0.0026, 0.042], [0.0036, 0.047]], G0, G1, 10));
  parts.push(...irisBracts(0.048, -0.004, variant * 1.3));
  const top = 0.046, spin = variant * 0.4;
  for (let k = 0; k < 3; k++) {
    const ang = k * Math.PI * 2 / 3 + spin;
    const fall = irisPetal({ L: 0.074 + variant * 0.004, W: 0.05, haft: 0.14, wMax: 0.62, th0: 0.5, th1: -0.95, thP: 1.3, cup: 0.006, groove: -0.002, ruffle: 0.0022, ux0: 0, ux1: 0.5, seed: k * 2.1 + variant });
    fall.translate(0.002, top, 0); fall.rotateY(ang); parts.push(fall);
    const style = irisPetal({ L: 0.036, W: 0.0095, haft: 0.6, wMax: 0.7, th0: 0.62, th1: 0.2, cup: -0.002, crest: 0.004, ux0: 0.66, ux1: F, nu: 8, nv: 4, seed: k });
    style.translate(0.0025, top + 0.004, 0); style.rotateY(ang); parts.push(style);
    const std = irisPetal({ L: 0.036, W: 0.016, haft: 0.25, wMax: 0.55, th0: 1.25, th1: 0.62, cup: 0.003, ruffle: 0.001, ux0: 0.5, ux1: 0.66, nu: 8, nv: 5, seed: k + 5 });
    std.translate(0.002, top + 0.002, 0); std.rotateY(ang + Math.PI / 3); parts.push(std);
  }
  return mergeGeos(parts);
}
function irisBudGeo() {
  const parts = [irisLathe([[0.0032, 0], [0.0045, 0.02], [0.006, 0.04], [0.0068, 0.058], [0.005, 0.075], [0.0015, 0.09], [0.0002, 0.095]], 0.5, 0.66, 10)];
  parts.push(...irisBracts(0.07, -0.004, 0.7));
  return mergeGeos(parts);
}
const IRIS = { flowers: [], buds: [] };
function buildIrisFlowers(clumps) {
  const atlas = irisAtlas();
  const stems = [], flowerM = [[], [], []], budM = [], cols = [[], [], []], _t = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
  const WY = WATER_Y.toFixed(3);
  // stalk sway and the bloom at its tip share one wind evaluation, so the flower never separates from its stem
  const ww = `pow(clamp((wWindP.y - ${WY}) / 0.9, 0.0, 1.0), 1.5) * 0.5`;
  for (const c of clumps) {
    const n = 2 + (rand() * 2 | 0), buds = 1 + (rand() * 2 | 0);
    for (let s = 0; s < n + buds; s++) {
      const isBud = s >= n, a = rand() * 6.28, r = rr(0.02, 0.1);
      const bx = c.x + Math.cos(a) * r, bz = c.z + Math.sin(a) * r;
      const H = isBud ? rr(0.55, 0.7) : rr(0.66, 0.86);
      // lean outward over the water (toward the light), a gentle S-curve
      const lx = -c.nx * rr(0.04, 0.12) + rr(-0.04, 0.04), lz = -c.nz * rr(0.04, 0.12) + rr(-0.04, 0.04);
      const fy = Math.min(WATER_Y - 0.25, terrainHeight(bx, bz) - 0.02);
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(bx, fy, bz), new THREE.Vector3(bx + lx * 0.15, WATER_Y + H * 0.3, bz + lz * 0.15),
        new THREE.Vector3(bx + lx * 0.6, WATER_Y + H * 0.72, bz + lz * 0.6), new THREE.Vector3(bx + lx, WATER_Y + H, bz + lz)]);
      stems.push(taperTube(curve, 18, 7, 0.0048, 0.0031, 2));
      // a clasping stem leaf part-way up the scape
      const t0 = rr(0.45, 0.6), p0 = curve.getPointAt(t0), yaw = rand() * 6.28;
      const sl = irisPetal({ L: rr(0.12, 0.18), W: 0.012, haft: 0.9, wMax: 0.3, th0: 1.45, th1: 1.05, cup: 0.003, ux0: 0, ux1: 1, nu: 8, nv: 4 });
      sl.translate(0.004, 0, 0); sl.rotateY(yaw); sl.translate(p0.x, p0.y, p0.z); stems.push(sl);
      const tip = curve.getPointAt(1); curve.getTangentAt(1, _t);
      const q = new THREE.Quaternion().setFromUnitVectors(_up, _t).multiply(new THREE.Quaternion().setFromAxisAngle(_up, rand() * 6.28));
      const sc = rr(0.92, 1.1);
      const m = new THREE.Matrix4().compose(tip, q, new THREE.Vector3(sc, sc, sc));
      if (isBud) { budM.push(m); IRIS.buds.push({ p: tip.clone(), t: _t.clone() }); }
      else {
        const v = rand() * 3 | 0; flowerM[v].push(m);
        cols[v].push(new THREE.Color().setHSL(rr(-0.02, 0.03) + 0.0, 0, 0).setRGB(rr(0.9, 1.05), rr(0.9, 1.0), rr(0.95, 1.08)));
        IRIS.flowers.push({ p: tip.clone(), q: q.clone() });
      }
    }
  }
  // stalks + stem leaves (world-space merge; uv.x of the stem leaf spans the iris-leaf texture)
  const stemMat = physical({ map: TEX.iris, color: 0xc8dca8, side: THREE.DoubleSide, roughness: 0.5, sheen: 0.3, sheenColor: new THREE.Color(0xc0d890) },
    { key: 'irisstem', leaf: true, wind: 'world', windWeight: ww, uniforms: { uTransl: { value: 0.3 } } });
  const stemMesh = new THREE.Mesh(mergeGeos(stems), stemMat);
  stemMesh.castShadow = stemMesh.receiveShadow = true; stemMesh.customDepthMaterial = patchedDepth({ key: 'irisstemd', wind: true, windWeight: ww });
  setLayer(stemMesh, LAYER.BOTH); scene.add(stemMesh);
  // blooms: wind evaluated at the instance origin (= stalk tip)
  const origin = '(modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz';
  const fm = physical({ map: atlas, side: THREE.DoubleSide, roughness: 0.46, color: 0xe6dcea, sheen: 0.45, sheenRoughness: 0.4, sheenColor: new THREE.Color(0xd8c0e8), envMapIntensity: 0.55 },
    { key: 'irisflower2', leaf: true, wind: 'world', windPos: origin, windWeight: ww, uniforms: { uTransl: { value: 0.6 } } });
  const fdm = patchedDepth({ key: 'irisflowerd', wind: true, windPos: origin, windWeight: ww });
  const put = (geo, mats, colors) => {
    if (!mats.length) return;
    const im = new THREE.InstancedMesh(geo, fm, mats.length);
    mats.forEach((mm, i) => { im.setMatrixAt(i, mm); if (colors) im.setColorAt(i, colors[i]); });
    im.castShadow = true; im.receiveShadow = true; im.customDepthMaterial = fdm; im.computeBoundingSphere(); setLayer(im, LAYER.ABOVE); scene.add(im);
    seasonal(im, 'SR');
  };
  for (let v = 0; v < 3; v++) put(irisFlowerGeo(v), flowerM[v], cols[v]);
  put(irisBudGeo(), budM, null);
}

/* ------------------------------------------------------------------ 9a3. SACRED LOTUS (Nelumbo nucifera) */
// After botanical references: ~22 broad, concave, spoon-shaped tepals in a spiral of four whorls forming an open bowl
// (outer ones spreading, inner ones upright and incurved), creamy white at the base flushing to rose at the tip and
// margins, with fine parallel veins converging on the tip; a golden, inverted-cone receptacle whose flat top carries
// ~19 pistils; a dense ring of ~170 stamens (slender filaments, long golden anthers, a pale club-shaped appendage);
// reflexed green sepals. Plus a closed teardrop bud and a nodding green seed pod ("showerhead") on their own stalks.
function lotusPetalTex() {
  const W = 256, H = 512, cv = makeCanvas(W, H), g = cv.getContext('2d');
  let gr = g.createLinearGradient(0, H, 0, 0);
  gr.addColorStop(0, '#efe6c4'); gr.addColorStop(0.18, '#fbf4ec'); gr.addColorStop(0.5, '#fbdfe7'); gr.addColorStop(0.78, '#f2aac2'); gr.addColorStop(0.93, '#e27aa0'); gr.addColorStop(1, '#d4608c');
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  const eg = g.createLinearGradient(0, 0, W, 0);
  eg.addColorStop(0, 'rgba(226,108,150,0.55)'); eg.addColorStop(0.2, 'rgba(226,108,150,0)'); eg.addColorStop(0.8, 'rgba(226,108,150,0)'); eg.addColorStop(1, 'rgba(226,108,150,0.55)');
  const vm = g.createLinearGradient(0, H, 0, 0); vm.addColorStop(0, 'rgba(0,0,0,0)'); vm.addColorStop(0.45, 'rgba(0,0,0,0.6)'); vm.addColorStop(1, 'rgba(0,0,0,1)');
  g.save(); g.globalAlpha = 1; g.fillStyle = eg; g.globalCompositeOperation = 'source-atop';
  // margins flush only toward the tip
  const tmp = makeCanvas(W, H), tg = tmp.getContext('2d'); tg.fillStyle = eg; tg.fillRect(0, 0, W, H); tg.globalCompositeOperation = 'destination-in'; tg.fillStyle = vm; tg.fillRect(0, 0, W, H);
  g.drawImage(tmp, 0, 0); g.restore();
  // parallel veins converging on the tip, strongest in the pink half
  const vg = g.createLinearGradient(0, H, 0, 0); vg.addColorStop(0, 'rgba(210,120,150,0.04)'); vg.addColorStop(0.5, 'rgba(206,92,132,0.22)'); vg.addColorStop(1, 'rgba(180,60,105,0.4)');
  g.strokeStyle = vg;
  for (let i = 0; i < 34; i++) {
    const x0 = W * (i + 0.5) / 34, xt = W / 2 + (x0 - W / 2) * 0.12;
    g.lineWidth = i % 3 === 0 ? 1.4 : 0.8;
    g.beginPath(); g.moveTo(x0 * 0.7 + W * 0.15, H); g.bezierCurveTo(x0, H * 0.6, x0 + (x0 - W / 2) * 0.05, H * 0.2, xt, 2); g.stroke();
  }
  g.strokeStyle = 'rgba(200,110,140,0.25)'; g.lineWidth = 2.2; g.beginPath(); g.moveTo(W / 2, H); g.lineTo(W / 2, 4); g.stroke();
  // faint satin texture
  for (let i = 0; i < 700; i++) { g.fillStyle = `rgba(255,255,255,${Math.random() * 0.025})`; g.fillRect(Math.random() * W, Math.random() * H, 1, 3 + Math.random() * 6); }
  const t = canvasTex(cv); t.wrapS = THREE.RepeatWrapping; t.anisotropy = 8; return t;
}
function lotusPodTopTex() {
  const N = 256, cv = makeCanvas(N, N), g = cv.getContext('2d');
  const gr = g.createRadialGradient(N / 2, N / 2, 4, N / 2, N / 2, N / 2); gr.addColorStop(0, '#9aa24c'); gr.addColorStop(0.85, '#7f8a3a'); gr.addColorStop(1, '#5f6a2a');
  g.fillStyle = gr; g.fillRect(0, 0, N, N);
  const holes = [[0, 0]]; for (let r = 1; r <= 2; r++) for (let i = 0; i < r * 7; i++) { const a = i / (r * 7) * Math.PI * 2 + r; holes.push([Math.cos(a) * r * 0.3, Math.sin(a) * r * 0.3]); }
  for (const [x, y] of holes) {
    const cx = N / 2 + x * N * 0.5, cy = N / 2 + y * N * 0.5, r = N * 0.052;
    g.fillStyle = '#3c4318'; g.beginPath(); g.arc(cx, cy, r, 0, 6.28); g.fill();
    const sg = g.createRadialGradient(cx - r * 0.3, cy - r * 0.3, 1, cx, cy, r * 0.8); sg.addColorStop(0, '#c4cc78'); sg.addColorStop(1, '#6f7a2e');
    g.fillStyle = sg; g.beginPath(); g.arc(cx, cy, r * 0.72, 0, 6.28); g.fill();
  }
  return canvasTex(cv);
}
function coloredCyl(r0, r1, len, col, from, dir) {
  const g = new THREE.CylinderGeometry(r1, r0, len, 5, 1); g.translate(0, len / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir)); g.translate(from.x, from.y, from.z);
  const n = g.attributes.position.count, c = new Float32Array(n * 3); for (let i = 0; i < n; i++) { c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b; }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3)); return g;
}
function buildSacredLotus(stemMat) {
  const tex = lotusPetalTex();
  const petalMat = physical({ map: tex, side: THREE.DoubleSide, roughness: 0.5, sheen: 0.7, sheenRoughness: 0.35, sheenColor: new THREE.Color(0xffe6ee), envMapIntensity: 0.6 },
    { key: 'lotuspetal2', leaf: true, uniforms: { uTransl: { value: 0.85 } } });
  const greenMat = physical({ color: 0x6f8a3c, roughness: 0.55, sheen: 0.4, sheenColor: new THREE.Color(0xc8dca0) }, { key: 'lotusgreen', leaf: true, uniforms: { uTransl: { value: 0.4 } } });
  const recMat = physical({ color: 0xd4c24a, roughness: 0.5, sheen: 0.3, sheenColor: new THREE.Color(0xfff0a0) }, { key: 'lotusrec' });
  const pistilMat = physical({ color: 0xe9d56a, roughness: 0.45 }, { key: 'lotuspistil' });
  const stamenMat2 = physical({ vertexColors: true, roughness: 0.55, sheen: 0.5, sheenColor: new THREE.Color(0xfff2b0) }, { key: 'lotusstamen2', leaf: true, uniforms: { uTransl: { value: 0.5 } } });
  const V3 = THREE.Vector3;
  const flower = (open) => {
    const grp = new THREE.Group(), parts = [];
    const whorls = [[5, 0.1, 0.034, 0.32, 0.5, 0.024], [6, 0.104, 0.035, 0.62, 0.86, 0.022], [6, 0.098, 0.033, 0.8, 1.0, 0.021], [5, 0.086, 0.029, 0.98, 1.18, 0.021]];   // W = half-width
    let k = 0;
    whorls.forEach(([n, L, W, t0, t1, r0], wi) => {
      for (let i = 0; i < n; i++, k++) {
        const pg = irisPetal({ L: L * rr(0.94, 1.05), W: W * rr(0.92, 1.06), haft: 0.5, wMax: 0.52, th0: lerp(1.35, t0, open) + rr(-0.05, 0.05), th1: lerp(1.6, t1, open) + rr(-0.06, 0.06),
          thP: 1.1, cup: -0.009, ruffle: 0.0005, ux0: 0, ux1: 1, nu: 16, nv: 10, seed: k, r0, y0: wi * 0.005 });
        pg.rotateY(k * 2.39996 + rr(-0.1, 0.1)); parts.push(pg);
      }
    });
    const pm = new THREE.Mesh(mergeGeos(parts), petalMat); pm.castShadow = true; grp.add(pm);
    const sep = [];
    for (let i = 0; i < 3; i++) { const g = irisPetal({ L: 0.034, W: 0.011, haft: 0.5, wMax: 0.5, th0: -0.1, th1: -0.7, cup: -0.004, ux0: 0, ux1: 1, nu: 6, nv: 4, r0: 0.01, y0: -0.012 }); g.rotateY(i * 2.1 + 0.4); sep.push(g); }
    grp.add(new THREE.Mesh(mergeGeos(sep), greenMat));
    // receptacle (inverted cone, flat top) and its pistils
    const rec = new THREE.LatheGeometry([[0.004, -0.03], [0.007, -0.02], [0.013, -0.008], [0.019, 0.004], [0.0225, 0.012], [0.022, 0.0152], [0.014, 0.0168], [0.0001, 0.0172]].map(([r, y]) => new THREE.Vector2(r, y)), 28);
    const rm = new THREE.Mesh(rec, recMat); rm.castShadow = true; grp.add(rm);
    const pis = [];
    for (let r = 0; r <= 2; r++) for (let i = 0; i < Math.max(1, r * 7); i++) { const a = i / Math.max(1, r * 7) * Math.PI * 2 + r, rad = r * 0.0068; const sg = new THREE.SphereGeometry(0.0021, 10, 6); sg.scale(1, 0.7, 1); sg.translate(Math.cos(a) * rad, 0.0178, Math.sin(a) * rad); pis.push(sg); }
    grp.add(new THREE.Mesh(mergeGeos(pis), pistilMat));
    // stamens
    const st = [], cFil = new THREE.Color(0xf2e6b0), cAnt = new THREE.Color(0xe2ae2c), cApp = new THREE.Color(0xf6efd8);
    for (let i = 0; i < 170; i++) {
      const a = i * 2.39996, rad = rr(0.017, 0.022), y = rr(-0.006, 0.006);
      const tilt = rr(0.35, 1.0) * (0.55 + 0.45 * open), d = new V3(Math.cos(a) * Math.sin(tilt), Math.cos(tilt), Math.sin(a) * Math.sin(tilt)).normalize();
      const b = new V3(Math.cos(a) * rad, y, Math.sin(a) * rad), lf = rr(0.008, 0.012), la = rr(0.01, 0.013);
      st.push(coloredCyl(0.00035, 0.0003, lf, cFil, b, d));
      const b2 = b.clone().addScaledVector(d, lf); st.push(coloredCyl(0.0008, 0.0009, la, cAnt, b2, d));
      const b3 = b2.clone().addScaledVector(d, la); st.push(coloredCyl(0.0009, 0.0005, 0.004, cApp, b3, d));
    }
    const sm = new THREE.Mesh(mergeGeos(st), stamenMat2); grp.add(sm);
    return grp;
  };
  const stalk = (x, z, top, r0, seasons = 'SR') => {
    const fy = Math.min(-0.3, terrainHeight(x, z) - 0.02);
    const sm = new THREE.Mesh(taperTube(new THREE.CatmullRomCurve3([new V3(x, fy, z), new V3(x + rr(-0.03, 0.03), (fy + top.y) * 0.5, z + rr(-0.03, 0.03)), top]), 14, 8, r0, r0 * 0.8, 3), stemMat);
    sm.castShadow = true; setLayer(sm, LAYER.BOTH); scene.add(sm); seasonal(sm, seasons);
  };
  // open flower
  const fl = flower(1); fl.position.set(-2.62, WATER_Y + 0.52, -0.15); fl.rotation.set(0.12, 0.3, -0.1); fl.scale.setScalar(1.05);
  setLayer(fl, LAYER.ABOVE); scene.add(fl); seasonal(fl, 'SR'); stalk(-2.62, -0.1, new V3(-2.62, 0.488, -0.15), 0.0065);
  // half-open second flower
  const fl2 = flower(0.35); fl2.position.set(-3.02, WATER_Y + 0.66, 0.36); fl2.rotation.set(-0.08, 1.4, 0.12); fl2.scale.setScalar(0.92);
  setLayer(fl2, LAYER.ABOVE); scene.add(fl2); seasonal(fl2, 'SR'); stalk(-3.0, 0.4, new V3(-3.02, 0.63, 0.36), 0.006);
  // closed bud: three visible petal faces flushed rose at the tip
  const bud = new THREE.LatheGeometry([[0.005, 0], [0.016, 0.012], [0.026, 0.035], [0.028, 0.056], [0.023, 0.08], [0.012, 0.1], [0.0008, 0.118]].map(([r, y]) => new THREE.Vector2(r, y)), 36);
  const bu = bud.attributes.uv; for (let i = 0; i < bu.count; i++) bu.setX(i, bu.getX(i) * 3);
  const bm = new THREE.Mesh(bud, petalMat); bm.castShadow = true; bm.position.set(-2.34, WATER_Y + 0.72, 0.18); bm.rotation.set(0.1, 0, -0.12);
  setLayer(bm, LAYER.ABOVE); scene.add(bm); seasonal(bm, 'SR'); stalk(-2.33, 0.2, new V3(-2.34, 0.72, 0.18), 0.0058);
  // seed pod after the petals have dropped: green showerhead with seeds set in its flat top, nodding on its stalk
  const pod = new THREE.Group();
  const podGeo = new THREE.LatheGeometry([[0.005, -0.04], [0.011, -0.026], [0.021, -0.008], [0.031, 0.007], [0.0345, 0.0145], [0.033, 0.0175], [0.0001, 0.018]].map(([r, y]) => new THREE.Vector2(r, y)), 32);
  const pm = new THREE.Mesh(podGeo, physical({ color: 0x7e8c3c, roughness: 0.55, sheen: 0.35, sheenColor: new THREE.Color(0xd8e6a8) }, { key: 'lotuspod' })); pm.castShadow = true; pod.add(pm);
  const topD = new THREE.Mesh(new THREE.CircleGeometry(0.0335, 40).rotateX(-Math.PI / 2).translate(0, 0.0182, 0), physical({ map: lotusPodTopTex(), roughness: 0.6 }, { key: 'lotuspodtop' })); pod.add(topD);
  pod.position.set(-2.24, WATER_Y + 0.4, -0.3); pod.rotation.set(0.55, 0.8, 0.25);
  setLayer(pod, LAYER.ABOVE); scene.add(pod); seasonal(pod, 'SRA');
  const podBase = new V3(0, -0.04, 0).applyEuler(pod.rotation).add(pod.position);
  stalk(-2.2, -0.24, podBase, 0.0058, 'SRA');
  WORLD.lotusFlower = fl;
  // 荷花池版：在新增荷叶旁再开一批荷花 / 花苞
  (WORLD.lotusSpots || []).forEach(([x, z, h], k) => {
    if (k % 2) return;
    const open = k % 4 === 0 ? rr(0.7, 1.0) : 0.35, f2 = flower(open), fx = x + rr(-0.12, 0.12), fz = z + rr(-0.12, 0.12), fy = WATER_Y + h + rr(0.12, 0.3);
    f2.position.set(fx, fy, fz); f2.rotation.set(rr(-0.15, 0.15), rand() * 6, rr(-0.15, 0.15)); f2.scale.setScalar(rr(0.85, 1.05));
    setLayer(f2, LAYER.ABOVE); scene.add(f2); seasonal(f2, 'SR'); stalk(fx, fz, new V3(fx, fy - 0.03, fz), 0.006);
  });
}

/* ------------------------------------------------------------------ 9h. BOTANICAL PLANTING + BAMBOO */
// A Japanese stroll-garden planting (after seasonal garden references): a Phyllostachys bamboo grove behind a
// kenninji-gaki fence and a clump by the waterfall, mophead hydrangeas (ajisai) in blue / purple / pink, a wisteria
// arbor (fujidana) hung with lavender racemes, tree peonies (botan), drifts of red spider lily (higanbana) along the
// banks, camellias (tsubaki) with whole fallen flowers on the ground, and clumps of balloon flower (kikyo).
function bambooCulmTex() {
  // one internode per repeat: smooth waxy green, fine vertical striations, white bloom band below the node, node ridge
  const W = 64, H = 256, cv = makeCanvas(W, H), g = cv.getContext('2d');
  const gr = g.createLinearGradient(0, H, 0, 0);
  gr.addColorStop(0, '#46692a'); gr.addColorStop(0.5, '#557a30'); gr.addColorStop(0.84, '#5e8236'); gr.addColorStop(0.9, '#a9b690'); gr.addColorStop(0.95, '#8ea070'); gr.addColorStop(0.975, '#3e5a22'); gr.addColorStop(0.99, '#8a9a5a'); gr.addColorStop(1, '#46692a');
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 40; i++) { g.strokeStyle = `rgba(${i % 2 ? '230,240,200' : '20,40,10'},${0.05 + Math.random() * 0.06})`; g.lineWidth = 0.8; const x = Math.random() * W; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
  for (let i = 0; i < 30; i++) { g.fillStyle = `rgba(200,190,120,${Math.random() * 0.12})`; g.fillRect(Math.random() * W, Math.random() * H * 0.8 + H * 0.05, 2 + Math.random() * 5, 8 + Math.random() * 30); }
  const t = canvasTex(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}
function splitBambooTex() {
  const W = 64, H = 512, cv = makeCanvas(W, H), g = cv.getContext('2d');
  const gr = g.createLinearGradient(0, 0, W, 0); gr.addColorStop(0, '#8a7a50'); gr.addColorStop(0.5, '#b8a672'); gr.addColorStop(1, '#8a7a50');
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 30; i++) { g.strokeStyle = `rgba(70,55,30,${0.08 + Math.random() * 0.1})`; g.lineWidth = 0.8; const x = Math.random() * W; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
  for (const y of [70, 205, 350, 470]) { g.fillStyle = 'rgba(60,45,25,0.55)'; g.fillRect(0, y, W, 3); g.fillStyle = 'rgba(220,210,170,0.4)'; g.fillRect(0, y + 3, W, 2); }
  const t = canvasTex(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}
function wisteriaTex() {
  // a raceme: open lavender pea flowers at the top, paler and greener buds toward the pointed tip
  const W = 128, H = 512, cv = makeCanvas(W, H), g = cv.getContext('2d');
  g.strokeStyle = '#5a6a3a'; g.lineWidth = 2; g.beginPath(); g.moveTo(W / 2, 0); g.lineTo(W / 2, H * 0.97); g.stroke();
  for (let i = 0; i < 150; i++) {
    const t = Math.pow(Math.random(), 0.8), y = 8 + t * (H - 24), half = (1 - t) * W * 0.42 + 6, x = W / 2 + (Math.random() * 2 - 1) * half;
    const open = 1 - t, s = 5 + open * 7;
    const light = 55 + t * 22, sat = 45 - t * 15, hue = 265 - t * 30;
    g.fillStyle = `hsl(${hue},${sat}%,${light}%)`; g.beginPath(); g.ellipse(x, y, s * 0.9, s * 0.7, Math.random(), 0, 6.28); g.fill();
    if (open > 0.45) { g.fillStyle = `hsl(55,70%,70%)`; g.beginPath(); g.arc(x, y - s * 0.2, s * 0.18, 0, 6.28); g.fill(); g.fillStyle = `hsl(${hue - 10},${sat + 10}%,${light - 18}%)`; g.beginPath(); g.ellipse(x, y + s * 0.35, s * 0.5, s * 0.3, 0, 0, 6.28); g.fill(); }
  }
  const t = canvasTex(cv); t.anisotropy = 4; return t;
}
function paintGeo(geo, col) {
  const n = geo.attributes.position.count, c = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(c, 3)); return geo;
}
function spiderLilyGeo() {
  // Lycoris radiata: leafless scape topped by an umbel of ~6 flowers; six narrow, wavy, strongly recurved tepals
  // and six very long upcurved stamens per flower
  const parts = [], red = new THREE.Color(0xc0121c), dark = new THREE.Color(0x3a0a0a), stemC = new THREE.Color(0x4f6a2a), V3 = THREE.Vector3;
  const H = 0.46;
  parts.push(paintGeo(taperTube(new THREE.CatmullRomCurve3([new V3(0, 0, 0), new V3(0.004, H * 0.5, 0), new V3(0, H, 0)]), 8, 5, 0.0038, 0.003, 3), stemC));
  for (let f = 0; f < 6; f++) {
    // each flower is built around its own +Y axis, then turned to face outward and up from the top of the scape
    const az = f * 1.047 + 0.2, dir = new V3(Math.cos(az) * 0.8, 0.55, Math.sin(az) * 0.8).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(new V3(0, 1, 0), dir);
    const base = new V3(0, H + 0.004, 0), fb = base.clone().addScaledVector(dir, 0.02);
    parts.push(paintGeo(taperTube(new THREE.CatmullRomCurve3([base, base.clone().addScaledVector(dir, 0.01).add(new V3(0, 0.004, 0)), fb]), 3, 4, 0.0014, 0.0012, 3), stemC));
    for (let k = 0; k < 6; k++) {
      const tp = irisPetal({ L: 0.042, W: 0.0034, haft: 0.6, wMax: 0.4, th0: 0.35, th1: -2.0, thP: 1.1, cup: -0.0008, ruffle: 0.0005, ux0: 0, ux1: 1, nu: 18, nv: 4, seed: k + f * 6 });
      tp.rotateY(k * 1.047 + f); tp.applyQuaternion(q); tp.translate(fb.x, fb.y, fb.z); parts.push(paintGeo(tp, red));
    }
    for (let k = 0; k < 6; k++) {
      const a = k * 1.047 + 0.5, pts = [];
      for (let i = 0; i <= 5; i++) { const t = i / 5, rad = 0.004 + 0.022 * t * (1 - 0.35 * t); pts.push(new V3(Math.cos(a) * rad, 0.07 * t, Math.sin(a) * rad)); }
      const st = taperTube(new THREE.CatmullRomCurve3(pts), 8, 3, 0.0005, 0.0004, 3); st.applyQuaternion(q); st.translate(fb.x, fb.y, fb.z); parts.push(paintGeo(st, red));
      const tip = pts[5].clone().applyQuaternion(q).add(fb), an = new THREE.SphereGeometry(0.0012, 5, 4); an.scale(1.8, 0.8, 0.8); an.translate(tip.x, tip.y, tip.z); parts.push(paintGeo(an, dark));
    }
  }
  return mergeGeos(parts);
}
function peonyFlowerGeo() {
  // Paeonia suffruticosa: a large bowl of ~26 broad ruffled petals (outer spreading, inner cupped) and a golden boss
  const parts = [];
  const whorls = [[8, 0.07, 0.032, 0.2, 0.55], [9, 0.064, 0.03, 0.62, 0.95], [9, 0.05, 0.024, 1.05, 1.5]];
  let k = 0;
  whorls.forEach(([n, L, W, t0, t1], wi) => { for (let i = 0; i < n; i++, k++) {
    const pg = irisPetal({ L: L * rr(0.9, 1.08), W: W * rr(0.9, 1.1), haft: 0.3, wMax: 0.66, th0: t0 + rr(-0.08, 0.08), th1: t1 + rr(-0.12, 0.12), thP: 1.2, cup: -0.007, ruffle: 0.0035, ux0: 0, ux1: 1, nu: 12, nv: 10, seed: k * 1.7, r0: 0.012, y0: wi * 0.006 });
    pg.rotateY(k * 2.39996); parts.push(pg); } });
  return mergeGeos(parts);
}
function peonyPetalTex() {
  const W = 128, H = 256, cv = makeCanvas(W, H), g = cv.getContext('2d');
  const gr = g.createLinearGradient(0, H, 0, 0); gr.addColorStop(0, '#9a2050'); gr.addColorStop(0.16, '#e0a0b8'); gr.addColorStop(0.5, '#fbe4ec'); gr.addColorStop(1, '#fff4f7');
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 22; i++) { const x0 = W * (i + 0.5) / 22; g.strokeStyle = 'rgba(190,90,130,0.16)'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(W / 2 + (x0 - W / 2) * 0.3, H); g.quadraticCurveTo(x0, H * 0.5, x0 + (x0 - W / 2) * 0.1, 0); g.stroke(); }
  return canvasTex(cv);
}
async function buildBotanical(OCC, free, V3) {
  let nr0 = 0;
  const BOT = WORLD.botany = { hyd: [], cam: [], peony: [], kikyo: [], arbor: null, lily: [] };
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), S = new THREE.Vector3();
  const find = (pred, r, tries = 3000) => { for (let i = 0; i < tries; i++) { const x = rr(-11, 11), z = rr(-13, 9.5); if (pred(x, z, sdf(x, z)) && free(x, z, r)) return [x, z]; } return null; };
  const hedge = rockMaterial(TEX.hedge, { key: 'hedge', hedge: true, scale: 2.6, nrm: 1.4, rough: 0.72, bloom: 0 });
  const blob = rockGeo(7.7, 3, -0.3);
  const mounds = [];
  const mound = (x, z, rx, ry, rz, lift = 0.1) => { const gy = ground(x, z), g = blob.clone(); g.scale(rx, ry, rz); g.translate(x, gy + ry * lift, z); mounds.push(g); return gy + ry * lift; };
  const shell = (list, x, y0, z, rx, ry, rz, n, size, col) => {
    for (let i = 0; i < n; i++) { const d = randDir(); if (d.y < -0.1) d.y = -d.y * 0.3;
      const nn = new V3(d.x / rx, d.y / ry, d.z / rz).normalize();
      addCard(list, new V3(x + d.x * rx, y0 + d.y * ry, z + d.z * rz).addScaledVector(nn, 0.02), nn.clone().add(new V3(0, 0.4, 0)), size * rr(0.85, 1.15), col()); }
  };
  const green = () => new THREE.Color().setRGB(rr(0.85, 1.08), rr(0.9, 1.08), rr(0.85, 1.0));
  const darkGreen = () => new THREE.Color().setRGB(rr(0.6, 0.78), rr(0.7, 0.85), rr(0.55, 0.7));
  WORLD._free = free;

  await phase2Yield('布置花境与竹林');
  // --- Bamboo: a grove behind a kenninji-gaki fence (back left) and a clump beside the waterfall
  const culmTex = bambooCulmTex(), culms = [], nodes = [], branches = [], bambooLeaves = [];
  const culmAt = (x, z, H, r) => {
    const gy = ground(x, z), lean = new V3(rr(-0.06, 0.06), 1, rr(-0.06, 0.06)).normalize(), bend = new V3(rr(-0.3, 0.3), 0, rr(-0.3, 0.3));
    const pts = []; for (let i = 0; i <= 6; i++) { const t = i / 6; pts.push(new V3(x, gy - 0.05, z).addScaledVector(lean, H * t).addScaledVector(bend, t * t * 0.5)); }
    const curve = new THREE.CatmullRomCurve3(pts), inter = rr(0.26, 0.34);
    // young culms are vivid green, older ones age toward olive-yellow
    const age = rand(), tint = new THREE.Color().setRGB(lerp(0.95, 1.25, age), lerp(1.0, 1.08, age), lerp(0.95, 0.62, age));
    culms.push(paintGeo(taperTube(curve, Math.round(H * 5), 8, r, r * 0.55, 1 / inter), tint));
    const L = curve.getLength();
    for (let s = inter; s < L; s += inter) {
      const t = s / L, p = curve.getPointAt(t), tan = curve.getTangentAt(t), rr0 = lerp(r, r * 0.55, Math.pow(t, 0.8));
      const ring = new THREE.TorusGeometry(rr0 * 1.03, rr0 * 0.07, 3, 10); ring.rotateX(Math.PI / 2); ring.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new V3(0, 1, 0), tan)); ring.translate(p.x, p.y, p.z); nodes.push(paintGeo(ring, tint));
      if (t > 0.45) {
        for (const side of [1, -1]) {
          if (rand() < 0.35) continue;
          const az = rand() * 6.28 + (side > 0 ? 0 : Math.PI), bl = rr(0.35, 0.8) * (1.2 - t);
          const d0 = new V3(Math.cos(az), rr(0.5, 0.9), Math.sin(az)).normalize();
          const e = p.clone().addScaledVector(d0, bl), mid = p.clone().addScaledVector(d0, bl * 0.5); e.y -= bl * 0.2;
          branches.push(paintGeo(taperTube(new THREE.CatmullRomCurve3([p, mid, e]), 4, 4, 0.006, 0.002, 1), tint));
          for (let k = 0; k < 3; k++) { const q = new V3().lerpVectors(mid, e, k / 2).add(new V3(rr(-0.08, 0.08), rr(-0.12, 0.02), rr(-0.08, 0.08)));
            addCard(bambooLeaves, q, new V3(rr(-0.6, 0.6), 1, rr(-0.6, 0.6)), rr(0.42, 0.62), new THREE.Color().setRGB(rr(0.85, 1.05), rr(0.9, 1.05), rr(0.8, 0.95))); }
        }
      }
    }
  };
  let placed = 0, guard = 0;
  while (placed < 46 && guard++ < 4000) { const x = rr(-11.2, -7.0), z = rr(-13.2, -8.7); if (!free(x, z, 0.1)) continue; culmAt(x, z, rr(5.2, 8.2), rr(0.035, 0.06)); OCC.push([x, z, 0.16]); placed++; }
  const wfC = [-5.35, -5.3];
  for (let i = 0; i < 9; i++) { const x = wfC[0] + rr(-0.45, 0.45), z = wfC[1] + rr(-0.45, 0.45); if (free(x, z, 0.08)) { culmAt(x, z, rr(3.8, 5.5), rr(0.03, 0.045)); OCC.push([x, z, 0.12]); } }
  const culmWind = 'clamp((wPos4.y - 0.8) * 0.07, 0.0, 0.7)';
  const culmMat = physical({ map: culmTex, vertexColors: true, roughness: 0.32, clearcoat: 0.35, clearcoatRoughness: 0.3, envMapIntensity: 0.8 }, { key: 'bamboo', wind: 'world', windWeight: culmWind });
  const cm = meshOf(culms.concat(nodes, branches), culmMat, LAYER.ABOVE);
  const poleMat = physical({ map: culmTex, roughness: 0.4, clearcoat: 0.3, envMapIntensity: 0.8 }, { key: 'bamboopole' }); cm.customDepthMaterial = patchedDepth({ key: 'bambood', wind: true, windWeight: culmWind });
  {
    const leafTex = TEX.bambooLeaves, ww = culmWind + ' + 0.12';
    const cardGeo = new THREE.PlaneGeometry(1, 1, 3, 3);
    const mat = physical({ map: leafTex, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.55, envMapIntensity: 0.55 }, { key: 'bambooleaf', leaf: true, wind: 'world', windWeight: ww, uniforms: { uTransl: { value: 0.55 } } });
    const im = new THREE.InstancedMesh(cardGeo, mat, bambooLeaves.length);
    bambooLeaves.forEach((e, i) => { im.setMatrixAt(i, e.m); im.setColorAt(i, e.c); });
    im.castShadow = im.receiveShadow = true; im.customDepthMaterial = patchedDepth({ key: 'bambooleafd', wind: true, windWeight: ww }, leafTex, 0.45); im.computeBoundingSphere();
    setLayer(im, LAYER.ABOVE); scene.add(im);
  }
  await phase2Yield('布置花境与竹林');
  // kenninji-gaki: tightly packed vertical split-bamboo slats between charred posts, paired rails tied with black rope
  {
    const x0 = -10.6, x1 = -7.3, zf = -8.35, len = x1 - x0, Hf = 1.75;
    const slatMat = physical({ map: splitBambooTex(), roughness: 0.62, envMapIntensity: 0.6 }, { key: 'slat' });
    const ropeMat = physical({ color: 0x141210, roughness: 0.9 }, { key: 'rope' });
    const slats = [], rails = [], ropes = [];
    for (let x = x0 + 0.05; x < x1 - 0.03; x += 0.042) {
      const gy = ground(x, zf), g = new THREE.BoxGeometry(0.04, Hf, 0.012); g.translate(x, gy + Hf / 2 - 0.02, zf + (Math.round(x / 0.042) % 2 ? 0.003 : -0.003)); slats.push(g);
    }
    const gy0 = ground((x0 + x1) / 2, zf);
    for (const h of [0.32, 0.78, 1.24, 1.62]) for (const side of [1, -1]) {
      const g = new THREE.CylinderGeometry(0.018, 0.018, len, 8, 1, false, side > 0 ? 0 : Math.PI, Math.PI); g.rotateZ(Math.PI / 2); g.translate((x0 + x1) / 2, gy0 + h, zf + side * 0.012); rails.push(g);
      for (let x = x0 + 0.2; x < x1; x += 0.34) { const r = new THREE.BoxGeometry(0.035, 0.03, 0.06); r.translate(x, gy0 + h, zf); ropes.push(r); }
    }
    const cap = new THREE.CylinderGeometry(0.035, 0.035, len + 0.1, 10); cap.rotateZ(Math.PI / 2); cap.translate((x0 + x1) / 2, gy0 + Hf, zf); rails.push(cap);
    const posts = [];
    for (const x of [x0, (x0 + x1) / 2, x1]) { const g = new THREE.CylinderGeometry(0.055, 0.06, Hf + 0.2, 12); g.translate(x, ground(x, zf) + (Hf + 0.2) / 2 - 0.05, zf); posts.push(g); }
    meshOf(slats, slatMat, LAYER.ABOVE); meshOf(rails, poleMat, LAYER.ABOVE); meshOf(ropes, ropeMat, LAYER.ABOVE, false);
    meshOf(posts, physical({ color: 0x3a2e26, roughness: 0.85, map: TEX.bark.map }, { key: 'post' }), LAYER.ABOVE);
    OCC.push([(x0 + x1) / 2, zf, 0.3]);
  }

  await phase2Yield('布置花境与竹林');
  // --- Wisteria arbor (fujidana): timber posts and beams, a bamboo-pole lattice, gnarled vines, hanging racemes
  {
    const prefs = [[7.2, 0.6], [6.9, -3.4], [6.6, 4.6], [-5.9, 5.4], [4.6, 7.4]];
    const ok = prefs.find(([x, z]) => free(x, z, 1.25)) || find((x, z, sd) => sd > 2.5 && sd < 7, 1.4);
    if (ok) {
      const [ax, az] = ok, W = 2.6, D = 1.8, Ht = 2.25, gy = ground(ax, az), wood = [];
      for (const [px, pz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const g = woodBox(Ht, 0.11, 0.11); g.rotateZ(Math.PI / 2); g.translate(ax + px * W / 2, gy + Ht / 2 - 0.05, az + pz * D / 2); wood.push(g); }
      for (const pz of [-1, 1]) { const g = woodBox(W + 0.5, 0.12, 0.09); g.translate(ax, gy + Ht, az + pz * D / 2); wood.push(g); }
      for (let i = 0; i < 6; i++) { const g = woodBox(D + 0.4, 0.07, 0.06); g.rotateY(Math.PI / 2); g.translate(ax - W / 2 + i * W / 5, gy + Ht + 0.095, az); wood.push(g); }
      meshOf(wood, WORLD.wood, LAYER.ABOVE);
      const poles = []; for (let i = 0; i < 8; i++) { const g = new THREE.CylinderGeometry(0.014, 0.014, W + 0.3, 8); g.rotateZ(Math.PI / 2); g.translate(ax, gy + Ht + 0.145, az - D / 2 + i * D / 7); poles.push(g); }
      meshOf(poles, poleMat, LAYER.ABOVE);
      // two old vines twisting up the front posts and spreading over the top
      for (const px of [-1, 1]) {
        const b = new V3(ax + px * W / 2 + 0.12, gy - 0.05, az + D / 2 + 0.1), pts = [];
        for (let i = 0; i <= 10; i++) { const t = i / 10; pts.push(new V3(b.x + Math.cos(t * 9) * 0.08, b.y + t * (Ht + 0.2), b.z + Math.sin(t * 9) * 0.08)); }
        for (let i = 1; i <= 5; i++) pts.push(new V3(b.x - px * i * 0.35, gy + Ht + 0.22 + Math.sin(i) * 0.05, b.z - i * 0.25));
        BARK.push(taperTube(new THREE.CatmullRomCurve3(pts), 60, 8, 0.05, 0.015, 1.2));
      }
      for (let i = 0; i < 110; i++) addCard(LEAVES.green, new V3(ax + rr(-W / 2 - 0.2, W / 2 + 0.2), gy + Ht + rr(0.18, 0.4), az + rr(-D / 2 - 0.2, D / 2 + 0.2)), new V3(rr(-0.3, 0.3), 1, rr(-0.3, 0.3)), rr(0.4, 0.6), new THREE.Color().setRGB(rr(0.9, 1.05), rr(0.95, 1.1), rr(0.7, 0.85)));
      // racemes: two crossed vertical planes each, hanging from the lattice
      const rTex = wisteriaTex();
      const rMat = physical({ map: rTex, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.55, sheen: 0.5, sheenColor: new THREE.Color(0xe0d0ff) },
        { key: 'wisteria', leaf: true, wind: 'local', windWeight: 'clamp(-position.y * 1.6, 0.0, 0.9)', uniforms: { uTransl: { value: 0.7 } } });
      const rg = mergeGeos([new THREE.PlaneGeometry(0.12, 1, 1, 6).translate(0, -0.5, 0), new THREE.PlaneGeometry(0.12, 1, 1, 6).translate(0, -0.5, 0).rotateY(Math.PI / 2)]);
      const rm = [];
      for (let i = 0; i < 150; i++) { const L = rr(0.3, 0.6); E.set(rr(-0.06, 0.06), rand() * 6.28, rr(-0.06, 0.06)); Q.setFromEuler(E); S.set(rr(0.9, 1.2), L, rr(0.9, 1.2));
        rm.push(new THREE.Matrix4().compose(new V3(ax + rr(-W / 2, W / 2), gy + Ht + 0.12, az + rr(-D / 2, D / 2)), Q, S)); }
      seasonal(instanced(rg, rMat, rm, LAYER.ABOVE, false), 'SR');
      OCC.push([ax, az, 1.6]); BOT.arbor = [ax, az];
    }
  }
  nr0 = PHASE2.stage ? -1 - PHASE2.added.length : scene.children.length;                            // everything below is low planting away from the water
  await phase2Yield('布置花境与竹林');
  // --- Hydrangeas (ajisai): big-leaved mounds with ball-shaped mopheads, mostly blue and purple (acid soil), some pink
  const hydColors = [0x6c8ee0, 0x8a78d8, 0x7aa0e8, 0xb07cd0, 0xe48ab0, 0x9fb4f0];
  for (let i = 0; i < 10; i++) {
    const s = find((x, z, sd) => sd > 1.0 && sd < 6, 0.6); if (!s) continue;
    const [x, z] = s, rx = rr(0.5, 0.7), ry = rr(0.5, 0.65), rz = rr(0.5, 0.7), y0 = mound(x, z, rx * 0.8, ry * 0.8, rz * 0.8, 0.2);
    shell(LEAVES.bigleaf, x, y0, z, rx * 0.88, ry * 0.88, rz * 0.88, 190, 0.24, darkGreen);
    const base = new THREE.Color(hydColors[(rand() * hydColors.length) | 0]);
    const heads = 14 + (rand() * 8 | 0);
    for (let h = 0; h < heads; h++) {
      const d = randDir(); if (d.y < 0.05) d.y = 0.05 + rand() * 0.6; d.normalize();
      const c = new V3(x + d.x * rx, y0 + d.y * ry + 0.03, z + d.z * rz), hr = rr(0.08, 0.11);
      const col = base.clone().offsetHSL(rr(-0.03, 0.03), rr(-0.08, 0.05), rr(-0.05, 0.08));
      for (let k = 0; k < 9; k++) { const n = randDir(); if (n.y < -0.3) n.y = -n.y; addCard(LEAVES.hydrangea, c.clone().addScaledVector(n, hr * 0.6), n, hr * rr(1.2, 1.5), col.clone().multiplyScalar(rr(0.9, 1.05))); }
    }
    OCC.push([x, z, 0.75]); BOT.hyd.push([x, z]);
  }

  await phase2Yield('布置花境与竹林');
  // --- Camellias: glossy upright shrubs with crimson flowers; whole flowers dropped on the moss below
  const fallen = [];
  const fallenGeo = (() => { const parts = [];
    for (let k = 0; k < 6; k++) { const g = irisPetal({ L: 0.028, W: 0.013, haft: 0.5, wMax: 0.6, th0: 0.55, th1: 0.95, cup: -0.004, ruffle: 0.0008, ux0: 0, ux1: 1, nu: 6, nv: 5, r0: 0.004 }); g.rotateY(k * 1.047 + rr(-0.1, 0.1)); parts.push(paintGeo(g, new THREE.Color(0xa80c22))); }
    const boss = new THREE.CylinderGeometry(0.008, 0.006, 0.014, 12); boss.translate(0, 0.009, 0); parts.push(paintGeo(boss, new THREE.Color(0xf0cc40)));
    return mergeGeos(parts); })();
  for (let i = 0; i < 4; i++) {
    const s = find((x, z, sd) => sd > 2.4 && sd < 6.5, 1.0); if (!s) break;
    const [x, z] = s, rx = rr(0.6, 0.8), ry = rr(0.9, 1.2), rz = rr(0.6, 0.8), y0 = mound(x, z, rx * 0.85, ry * 0.85, rz * 0.85, 0.55);
    shell(LEAVES.camellia, x, y0, z, rx, ry, rz, 120, 0.34, green);
    shell(LEAVES.shrub, x, y0, z, rx * 0.98, ry * 0.98, rz * 0.98, 160, 0.3, darkGreen);
    for (let k = 0; k < 14; k++) { const a = rand() * 6.28, r = rr(0.3, 1.1) * Math.max(rx, rz); const fx = x + Math.cos(a) * r, fz = z + Math.sin(a) * r;
      E.set(rr(-0.3, 0.3), rand() * 6.28, rr(-0.3, 0.3)); Q.setFromEuler(E); S.setScalar(rr(0.9, 1.15)); fallen.push(new THREE.Matrix4().compose(new V3(fx, ground(fx, fz) + 0.002, fz), Q, S)); }
    OCC.push([x, z, 0.95]); BOT.cam.push([x, z]);
  }
  if (fallen.length) instanced(fallenGeo, physical({ vertexColors: true, roughness: 0.45, sheen: 0.5, sheenColor: new THREE.Color(0xff8090) }, { key: 'camfallen' }), fallen, LAYER.ABOVE);

  await phase2Yield('布置花境与竹林');
  // --- Tree peonies (botan): leafy bushes carrying big ruffled blooms (white-pink, rose, deep magenta)
  {
    const pMat = physical({ map: peonyPetalTex(), side: THREE.DoubleSide, roughness: 0.5, sheen: 0.8, sheenRoughness: 0.4, sheenColor: new THREE.Color(0xfff0f4), envMapIntensity: 0.6 }, { key: 'peony', leaf: true, uniforms: { uTransl: { value: 0.75 } } });
    const bossGeo = (() => { const parts = []; const b = new THREE.SphereGeometry(0.016, 12, 8); b.scale(1, 0.6, 1); b.translate(0, 0.012, 0); parts.push(b);
      for (let k = 0; k < 40; k++) { const a = k * 2.4, r = rr(0.008, 0.017); const c = new THREE.CylinderGeometry(0.0012, 0.0008, 0.012, 4); c.rotateZ(rr(0.3, 0.9)); c.rotateY(a); c.translate(Math.cos(a) * r, 0.018, Math.sin(a) * r); parts.push(c); } return mergeGeos(parts); })();
    const blooms = [], bosses = [], cols = [], tints = [0xffffff, 0xffd8e4, 0xf29ab8, 0xd8507a, 0xfff4e8];
    for (let i = 0; i < 6; i++) {
      const s = find((x, z, sd) => sd > 1.4 && sd < 4.5, 0.5); if (!s) break;
      const [x, z] = s, rx = rr(0.38, 0.48), ry = rr(0.38, 0.5), y0 = mound(x, z, rx * 0.7, ry * 0.75, rx * 0.7, 0.3);
      shell(LEAVES.bigleaf, x, y0, z, rx, ry, rx, 120, 0.2, darkGreen);
      const tint = new THREE.Color(tints[(rand() * tints.length) | 0]);
      for (let b = 0; b < 4 + (rand() * 3 | 0); b++) {
        const d = randDir(); d.y = Math.abs(d.y) * 0.8 + 0.3; d.normalize();
        const p = new V3(x + d.x * rx * 0.9, y0 + d.y * ry * 0.9 + 0.02, z + d.z * rx * 0.9);
        Q.setFromUnitVectors(new V3(0, 1, 0), d.clone().lerp(new V3(0, 1, 0), 0.5).normalize()).multiply(new THREE.Quaternion().setFromAxisAngle(new V3(0, 1, 0), rand() * 6.28));
        const sc = rr(1.0, 1.25); S.setScalar(sc); blooms.push(new THREE.Matrix4().compose(p, Q, S)); bosses.push(new THREE.Matrix4().compose(p, Q, S)); cols.push(tint.clone().offsetHSL(0, 0, rr(-0.04, 0.03)));
      }
      OCC.push([x, z, 0.5]); BOT.peony.push([x, z]);
    }
    if (blooms.length) {
      const im = instanced(peonyFlowerGeo(), pMat, blooms, LAYER.ABOVE); blooms.forEach((m, i) => im.setColorAt(i, cols[i])); im.instanceColor.needsUpdate = true; seasonal(im, 'SR');
      seasonal(instanced(bossGeo, physical({ color: 0xe8bc2c, roughness: 0.5 }, { key: 'peonyboss' }), bosses, LAYER.ABOVE), 'SR');
    }
  }

  await phase2Yield('布置花境与竹林');
  // --- Red spider lilies: drifts of bare scarlet umbels along the banks
  {
    const geo = spiderLilyGeo(), mats = [];
    for (let d = 0; d < 9; d++) {
      const s0 = rand() * POLY_LEN, sh0 = shoreAt(s0);
      if (nearWaterfall(sh0.x, sh0.z, 1.2) || (Math.abs(sh0.z - BRIDGE.z) < 1.2 && Math.abs(sh0.x) > BRIDGE.half - 0.8)) continue;
      const nStem = 14 + (rand() * 10 | 0);
      for (let k = 0; k < nStem; k++) {
        const sh = shoreAt(s0 + rr(-0.7, 0.7)), off = rr(0.7, 2.0), x = sh.x + sh.nx * off + rr(-0.08, 0.08), z = sh.z + sh.nz * off + rr(-0.08, 0.08);
        if (!free(x, z, 0.02)) continue;
        E.set(rr(-0.08, 0.08), rand() * 6.28, rr(-0.08, 0.08)); Q.setFromEuler(E); S.setScalar(rr(0.85, 1.15));
        mats.push(new THREE.Matrix4().compose(new V3(x, ground(x, z) - 0.01, z), Q, S)); BOT.lily.push([x, z]);
      }
    }
    if (mats.length) seasonal(instanced(geo, physical({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.42, sheen: 0.7, sheenColor: new THREE.Color(0xff5050), envMapIntensity: 0.6 },
      { key: 'higanbana', leaf: true, wind: 'local', windWeight: 'clamp(position.y * 1.2, 0.0, 0.5)', uniforms: { uTransl: { value: 0.6 } } }), mats, LAYER.ABOVE), 'SRA');
  }

  await phase2Yield('布置花境与竹林');
  // --- Balloon flower (kikyo) clumps
  for (let i = 0; i < 10; i++) {
    const s = find((x, z, sd) => sd > 0.9 && sd < 4.5, 0.3); if (!s) break;
    const [x, z] = s, gy = ground(x, z);
    for (let k = 0; k < 7; k++) addCard(LEAVES.kikyo, new V3(x + rr(-0.15, 0.15), gy + rr(0.2, 0.42), z + rr(-0.15, 0.15)), new V3(rr(-0.7, 0.7), 0.8, rr(-0.7, 0.7)), rr(0.3, 0.4), new THREE.Color(1, 1, 1));
    OCC.push([x, z, 0.3]); BOT.kikyo.push([x, z]);
  }

  if (mounds.length) meshOf(mounds, hedge, LAYER.ABOVE);
  await phase2Yield('布置花境与竹林');
  // ground-level plantings well back from the water never show in its reflection (the bank hides them)
  for (const o of (nr0 < 0 ? PHASE2.added.slice(-1 - nr0) : scene.children.slice(nr0))) WORLD.noReflect.push(o);
}

/* ------------------------------------------------------------------ 9b. POND LIFE: lily pads, water lilies, lotus, floating leaves, frog */
function padTextures() {
  const N = 512, cv = makeCanvas(N, N), g = cv.getContext('2d'), hv = makeCanvas(N, N), hg = hv.getContext('2d');
  const img = g.createImageData(N, N), d = img.data;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const u = x / N - 0.5, v = y / N - 0.5, r = Math.hypot(u, v) * 2;
    const m = fbm2P(x / N * 6, y / N * 6, 6, 4, 71) * 0.5 + 0.5, fine = fbm2P(x / N * 40, y / N * 40, 40, 2, 5) * 0.5 + 0.5;
    let c = mix3(srgbHex(0x55812f), srgbHex(0x3f6a24), smoothstep(0.1, 0.95, r) * 0.7 + m * 0.3);
    c = mix3(c, srgbHex(0x7b8a34), smoothstep(0.66, 0.8, m) * 0.35);                 // sun-bleached patches
    c = mix3(c, srgbHex(0x6a4a24), smoothstep(0.8, 0.9, fbm2P(x / N * 14, y / N * 14, 14, 3, 9) * 0.5 + 0.5) * 0.5);  // small brown blemishes
    c = mix3(c, srgbHex(0x6b2e2a), smoothstep(0.9, 0.99, r) * 0.7);                  // reddish margin
    c = c.map((q) => q * (0.94 + 0.12 * fine));
    const i = (y * N + x) * 4; d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  // veins: primary rays from the centre forking twice, drawn into colour (lighter) and height (raised)
  hg.fillStyle = '#000'; hg.fillRect(0, 0, N, N);
  const R = mulberry32(77);
  const vein = (x0, y0, a, len, w, depth) => {
    let x = x0, y = y0; const steps = 12;
    for (let s = 0; s < steps; s++) {
      a += (R() - 0.5) * 0.08;
      const nx = x + Math.cos(a) * len / steps, ny = y + Math.sin(a) * len / steps, ww = w * (1 - s / steps * 0.6);
      for (const [ctx, col] of [[g, 'rgba(160,190,105,0.16)'], [hg, 'rgba(255,255,255,0.5)']]) { ctx.strokeStyle = col; ctx.lineWidth = ww; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(nx, ny); ctx.stroke(); }
      x = nx; y = ny;
      if (depth < 2 && s === Math.floor(steps * 0.55)) { vein(x, y, a + 0.35, len * 0.45, ww * 0.6, depth + 1); vein(x, y, a - 0.35, len * 0.45, ww * 0.6, depth + 1); }
    }
  };
  const nV = 21;
  for (let k = 0; k < nV; k++) vein(N / 2, N / 2, (k / nV) * Math.PI * 2 + R() * 0.1, N * 0.46, 3.2, 0);
  const tex = canvasTex(cv, true);
  const hd = hg.getImageData(0, 0, N, N).data, H = new Float32Array(N * N);
  for (let i = 0; i < N * N; i++) H[i] = hd[i * 4] / 255 * 0.6 + (fbm2P((i % N) / N * 30, Math.floor(i / N) / N * 30, 30, 2, 3) * 0.5 + 0.5) * 0.2;
  const nrm = dataTex(heightToNormal(H, N, N, 2.2), N, N, false);
  nrm.wrapS = nrm.wrapT = THREE.ClampToEdgeWrapping; tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  return { map: tex, normalMap: nrm };
}
function petalTexture(inner, outer, tip) {
  const cv = makeCanvas(128, 256), g = cv.getContext('2d');
  const grd = g.createLinearGradient(0, 256, 0, 0);
  grd.addColorStop(0, inner); grd.addColorStop(0.55, outer); grd.addColorStop(1, tip);
  g.fillStyle = grd; g.fillRect(0, 0, 128, 256);
  g.globalAlpha = 0.18; g.strokeStyle = '#ffffff';
  for (let i = 0; i < 22; i++) { const x = 64 + (i - 11) * 5; g.beginPath(); g.moveTo(64, 256); g.quadraticCurveTo(x, 128, 64 + (i - 11) * 3.2, 4); g.stroke(); }
  return canvasTex(cv, true);
}
// Pointed petal (lanceolate) as a curved strip; bend lifts the tip, cup curls the sides
function petalGeo(len, wid, bend, cup) {
  const nu = 8, nv = 4, pos = [], uv = [], idx = [];
  for (let i = 0; i <= nu; i++) for (let j = 0; j <= nv; j++) {
    const u = i / nu, v = j / nv - 0.5, w = wid * Math.sin(Math.PI * Math.pow(u, 0.7)) * (1 - 0.15 * u) * 2 * v;
    const y = bend * u * u + cup * Math.abs(v) * Math.sin(Math.PI * u) * wid;
    pos.push(w, y, -u * len); uv.push(v + 0.5, u);
  }
  for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) { const a = i * (nv + 1) + j, b = a + nv + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}
function waterLilyGeo(scale, open) {
  const parts = [];
  const rings = [[14, 0.075, 0.028, 0.5, 0.35], [12, 0.066, 0.025, 0.9, 0.5], [10, 0.055, 0.022, 1.25, 0.6], [8, 0.042, 0.018, 1.6, 0.7]];
  rings.forEach(([n, L, W, lift, cup], r) => {
    for (let i = 0; i < n; i++) {
      const g = petalGeo(L * scale, W * scale, 0.012 * scale, cup);
      g.rotateX(-(0.12 + lift * open * 0.55 + (1 - open) * 1.25));
      g.rotateY((i / n) * Math.PI * 2 + r * 0.31);
      g.translate(0, 0.004 * scale + r * 0.003 * scale, 0);
      parts.push(g);
    }
  });
  return mergeGeos(parts);
}
function stamenGeo(scale) {
  const parts = [];
  const disc = new THREE.CylinderGeometry(0.012 * scale, 0.014 * scale, 0.008 * scale, 16); disc.translate(0, 0.012 * scale, 0); parts.push(disc);
  for (let i = 0; i < 46; i++) {
    const a = rand() * Math.PI * 2, r0 = rr(0.009, 0.016) * scale, h = rr(0.014, 0.022) * scale;
    const c = new THREE.CatmullRomCurve3([new THREE.Vector3(Math.cos(a) * r0 * 0.8, 0.012 * scale, Math.sin(a) * r0 * 0.8), new THREE.Vector3(Math.cos(a) * r0 * 1.1, 0.012 * scale + h * 0.6, Math.sin(a) * r0 * 1.1), new THREE.Vector3(Math.cos(a) * r0 * 1.5, 0.012 * scale + h, Math.sin(a) * r0 * 1.5)]);
    parts.push(taperTube(c, 4, 4, 0.0012 * scale, 0.0018 * scale, 1));
  }
  return mergeGeos(parts);
}
// Floating pad: polar grid with a notch, wavy margin, slightly upturned rim
function padGeo(r, seed, lotus) {
  const NR = 16, NA = 72, notch = lotus ? 0 : 0.32, pos = [], uv = [], idx = [];
  for (let i = 0; i <= NR; i++) for (let j = 0; j <= NA; j++) {
    const t = i / NR, a = notch / 2 + (j / NA) * (Math.PI * 2 - notch);
    const wav = 1 + 0.02 * Math.sin(a * 7 + seed) + 0.012 * Math.sin(a * 13 + seed * 2);
    const rr2 = r * Math.max(0.01, t) * wav;
    const y = lotus ? r * 0.28 * t * t - r * 0.02 * Math.sin(a * 9 + seed) * t * t * t : 0.0045 * Math.pow(t, 5) + 0.0015 * Math.sin(a * 5 + seed) * t * t * t + 0.001 * (1 - t);
    pos.push(Math.cos(a) * rr2, y, Math.sin(a) * rr2);
    uv.push(0.5 + Math.cos(a) * t * wav * 0.49, 0.5 + Math.sin(a) * t * wav * 0.49);
  }
  for (let i = 0; i < NR; i++) for (let j = 0; j < NA; j++) { const a = i * (NA + 1) + j, b = a + NA + 1; idx.push(a, a + 1, b, a + 1, b + 1, b); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}
function padSurfaceY(r, x, z) { const t = clamp(Math.hypot(x, z) / r, 0, 1); return 0.0045 * Math.pow(t, 5) + 0.001 * (1 - t); }

async function buildPondLife() {
  const PT = padTextures();
  const padMat = physical({ map: PT.map, normalMap: PT.normalMap, normalScale: new THREE.Vector2(0.4, 0.4), roughness: 0.38, clearcoat: 0.45, clearcoatRoughness: 0.25,
    sheen: 0.3, sheenColor: new THREE.Color(0xb8d890), side: THREE.DoubleSide, envMapIntensity: 0.9 }, {
    key: 'pad2', leaf: true, float: true, decid: 0.5, uniforms: { uTransl: { value: 0.25 } },
    fsMap: 'if (!gl_FrontFacing) diffuseColor.rgb *= vec3(0.85, 0.45, 0.42);',                         // purple-red underside
  });
  const lotusMat = physical({ map: PT.map, normalMap: PT.normalMap, normalScale: new THREE.Vector2(0.6, 0.6), color: 0xb9d6c2, roughness: 0.5, sheen: 0.9, sheenRoughness: 0.35,
    sheenColor: new THREE.Color(0xd9ecf2), side: THREE.DoubleSide, envMapIntensity: 1.0 }, { key: 'lotusleaf', leaf: true, decid: 1, uniforms: { uTransl: { value: 0.35 } } });
  const dropMat = physical({ color: 0xcfe2ea, roughness: 0.02, clearcoat: 1, clearcoatRoughness: 0.0, transparent: true, opacity: 0.55, envMapIntensity: 1.8, specularIntensity: 1 }, { key: 'drop' });
  const padDropMat = physical({ color: 0xcfe2ea, roughness: 0.02, clearcoat: 1, clearcoatRoughness: 0.0, transparent: true, opacity: 0.55, envMapIntensity: 1.8, specularIntensity: 1 }, { key: 'paddrop', float: true });
  const lilyPetal = petalTexture('#fff6e8', '#f7cddb', '#e98fb2');
  const lilyMat = physical({ map: lilyPetal, side: THREE.DoubleSide, roughness: 0.42, sheen: 0.8, sheenRoughness: 0.4, sheenColor: new THREE.Color(0xffe2ec), envMapIntensity: 0.8 },
    { key: 'lilypetal', leaf: true, uniforms: { uTransl: { value: 0.75 } } });
  const stamenMat = physical({ color: 0xf2c02a, roughness: 0.55, sheen: 0.6, sheenColor: new THREE.Color(0xfff0a0) }, { key: 'stamen', leaf: true, uniforms: { uTransl: { value: 0.5 } } });
  const stemMat = physical({ color: 0x5f7f3a, map: TEX.blade, roughness: 0.5 }, { key: 'stem' });
  WORLD.lilies = [];
  await phase2Yield('种下睡莲与荷花');
  // Clusters of pads (sizes vary; some overlap) + the frog's big pad in the near shallows
  const pads = [[-1.05, 3.85, 0.27, 'frog'], [-0.72, 4.18, 0.17], [-1.38, 3.55, 0.19, 'flower'], [-1.3, 4.25, 0.14],
    [-2.3, 2.2, 0.22], [-2.6, 1.05, 0.18], [-1.85, 1.5, 0.24, 'flower'], [-2.9, 1.8, 0.15], [-2.35, 1.55, 0.13], [-2.05, 2.55, 0.16],
    [1.9, 3.9, 0.2], [2.25, 3.3, 0.16, 'bud'], [1.6, 3.45, 0.13], [-0.8, -4.9, 0.22, 'flower'], [0.3, -5.25, 0.18], [-0.2, -4.7, 0.14]];
  pads.forEach(([x, z, r, kind], i) => {
    const grp = new THREE.Group();
    const m = new THREE.Mesh(padGeo(r, i * 1.7, false), padMat); m.castShadow = true; m.receiveShadow = true; grp.add(m);
    // beaded water droplets on top (as in the reference)
    const dg = [];
    for (let k = 0; k < Math.round(3 + r * 22); k++) {
      const a = rand() * Math.PI * 2, rad = Math.sqrt(rand()) * r * 0.82, px = Math.cos(a) * rad, pz = Math.sin(a) * rad;
      if (Math.abs(Math.atan2(pz, px)) < 0.25) continue;
      if (kind === 'frog' && rad < 0.08) continue;
      const s = rr(0.0025, 0.0075), sg = new THREE.SphereGeometry(1, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2);
      sg.scale(s, s * 0.62, s * rr(0.9, 1.15)); sg.translate(px, padSurfaceY(r, px, pz), pz); dg.push(sg);
    }
    if (dg.length) { const dm = new THREE.Mesh(mergeGeos(dg), padDropMat); grp.add(dm); }
    if (kind === 'flower' || kind === 'bud') {
      const open = kind === 'bud' ? 0.12 : rr(0.75, 1.0), sc = rr(0.9, 1.15);
      const fl = new THREE.Group();
      const pm2 = new THREE.Mesh(waterLilyGeo(sc, open), lilyMat); pm2.castShadow = true; fl.add(pm2);
      if (kind !== 'bud') { const st = new THREE.Mesh(stamenGeo(sc), stamenMat); fl.add(st); }
      fl.position.set(r * 0.35, padSurfaceY(r, r * 0.35, 0) + 0.002, -r * 0.2); fl.rotation.y = rand() * 6; fl.userData.flower = true;
      grp.add(fl);
    }
    setLayer(grp, LAYER.SURFACE); grp.traverse((o) => { if (o.userData.flower) { setLayer(o, LAYER.ABOVE); seasonal(o, 'SR'); } }); scene.add(grp);
    seasonal(grp, 'SRA');
    const lily = { mesh: grp, x, z, r, rot: rand() * 6.28, ph: rand() * 10, kind };
    WORLD.lilies.push(lily);
    if (kind === 'frog') WORLD.frogPad = lily;
  });
  await phase2Yield('种下睡莲与荷花');
  // Emergent sacred-lotus leaves (peltate, cupped, above the water on stalks) and a lotus flower
  const LOT = [[-2.75, 0.3, 0.2, 0.34], [-3.0, -0.25, 0.16, 0.24], [-2.5, -0.6, 0.23, 0.42], [-2.95, 0.75, 0.13, 0.18]];
  WORLD.lotusSpots = [];
  if (window.CAMPUS_POND.lotusExtra) {           // 图书馆·荷花池：成片荷叶（避开青蛙所在睡莲与锦鲤主游区中心）
    let guard = 0;
    while (LOT.length < 4 + window.CAMPUS_POND.lotusExtra && guard++ < 4000) {
      const x = rr(-3.4, 3.0), z = rr(-5.8, 5.6), d = sdf(x, z);
      if (d > -0.3 || d < -2.2 || Math.hypot(x + 1.05, z - 3.85) < 0.7 || Math.hypot(x - 0.3, z - 0.2) < 1.3) continue;
      if (LOT.some(([ox, oz]) => Math.hypot(x - ox, z - oz) < 0.36)) continue;
      LOT.push([x, z, rr(0.15, 0.25), rr(0.18, 0.5)]);
    }
  }
  WORLD.lotus = [];
  LOT.forEach(([x, z, r, h], i) => {
    const grp = new THREE.Group();
    const leaf = new THREE.Mesh(padGeo(r, i * 2.3 + 5, true), lotusMat); leaf.castShadow = leaf.receiveShadow = true;
    leaf.position.y = h; leaf.rotation.set(rr(-0.25, 0.25), rand() * 6, rr(-0.25, 0.25)); grp.add(leaf);
    const dg = [];
    for (let k = 0; k < 4; k++) { const s = rr(0.004, 0.011), a = rand() * 6, rd = rand() * r * 0.3, sg = new THREE.SphereGeometry(1, 16, 10); sg.scale(s, s * 0.8, s); sg.translate(Math.cos(a) * rd, r * 0.28 * (rd / r) ** 2 + s * 0.7, Math.sin(a) * rd); dg.push(sg); }
    const dm = new THREE.Mesh(mergeGeos(dg), dropMat); leaf.add(dm);
    const stalk = taperTube(new THREE.CatmullRomCurve3([new THREE.Vector3(0, -0.45, 0), new THREE.Vector3(rr(-0.03, 0.03), h * 0.5, rr(-0.03, 0.03)), new THREE.Vector3(0, h, 0)]), 10, 6, 0.006, 0.004, 3);
    const sm = new THREE.Mesh(stalk, stemMat); sm.castShadow = true; grp.add(sm);
    grp.position.set(x, WATER_Y, z);
    setLayer(grp, LAYER.BOTH); scene.add(grp); seasonal(grp, 'SRA');
    WORLD.lotus.push({ leaf, base: leaf.rotation.clone(), ph: rand() * 6, h });
    if (i >= 4) WORLD.lotusSpots.push([x, z, h]);
  });
  buildSacredLotus(stemMat);
  await phase2Yield('种下睡莲与荷花');
  // Fallen maple leaves and petals drifting on the surface
  {
    const cv = makeCanvas(128, 128), g = cv.getContext('2d');
    g.fillStyle = '#b8261c'; g.beginPath();
    for (let i = 0; i <= 120; i++) { const a = (i / 120) * Math.PI * 2, lobe = Math.pow(Math.abs(Math.cos(a * 3.5)), 0.6), r = 56 * (0.3 + 0.7 * lobe) * (a > Math.PI * 0.75 && a < Math.PI * 1.25 ? 0.5 : 1); const px = 64 + Math.sin(a) * r, py = 64 - Math.cos(a) * r; i ? g.lineTo(px, py) : g.moveTo(px, py); }
    g.fill(); g.strokeStyle = 'rgba(70,10,10,0.5)'; g.lineWidth = 1.5;
    for (let k = 0; k < 7; k++) { const a = (k / 7) * Math.PI * 2; g.beginPath(); g.moveTo(64, 64); g.lineTo(64 + Math.sin(a) * 50, 64 - Math.cos(a) * 50); g.stroke(); }
    const lm = physical({ map: canvasTex(cv), alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.4, clearcoat: 0.4 }, { key: 'floatleaf', leaf: true, float: true, uniforms: { uTransl: { value: 0.4 } } });
    const petalFloatMat = physical({ map: lilyPetal, side: THREE.DoubleSide, roughness: 0.42, sheen: 0.8, sheenRoughness: 0.4, sheenColor: new THREE.Color(0xffe2ec) }, { key: 'floatpetal', leaf: true, float: true, uniforms: { uTransl: { value: 0.75 } } });
    const lg = new THREE.PlaneGeometry(0.075, 0.075); lg.rotateX(-Math.PI / 2);
    const pg = petalGeo(0.035, 0.014, 0.003, 0.3);
    WORLD.floaters = [];
    for (let i = 0; i < 18; i++) {
      const isPetal = i >= 12;
      let x, z, guard = 0;
      do { x = isPetal ? rr(-2.9, -1.8) : rr(-3.1, -1.4); z = isPetal ? rr(-1.2, 0.8) : rr(-0.6, 2.8); } while (sdf(x, z) > -0.25 && guard++ < 50);
      const mesh = new THREE.Mesh(isPetal ? pg : lg, isPetal ? petalFloatMat : lm);
      mesh.receiveShadow = true; setLayer(mesh, LAYER.SURFACE); scene.add(mesh); seasonal(mesh, isPetal ? 'SR' : 'A');
      WORLD.floaters.push({ mesh, x, z, rot: rand() * 6.28, vx: rr(-0.008, 0.008), vz: rr(-0.008, 0.008), ph: rand() * 6, s: rr(0.75, 1.25) });
    }
  }
  buildFrog();
}
function updatePondLife(t, dt) {
  // a hand in the water nudges floating pads aside instead of passing through them
  const H = FEED.hand, handIn = H && H.root.visible && HANDCOL.pts.length;
  for (const L of WORLD.lilies || []) {
    if (handIn && L.mesh.visible) {
      let px = 0, pz = 0;
      for (const [p, r] of HANDCOL.pts) {
        if (p.y > WATER_Y + 0.03 + r) continue;
        const dx = L.mesh.position.x - p.x, dz = L.mesh.position.z - p.z, d = Math.hypot(dx, dz) + 1e-4, reach = L.r + r + 0.01;
        if (d < reach) { px += dx / d * (reach - d); pz += dz / d * (reach - d); }
      }
      const pl = Math.hypot(px, pz), cap = 0.35 * dt;                   // pads drift aside at a gentle pace
      if (pl > 1e-5) { const k = Math.min(pl, cap) / pl; L.x += px * k; L.z += pz * k; }
    }
    const x = L.x + 0.03 * Math.sin(t * 0.09 + L.ph), z = L.z + 0.03 * Math.cos(t * 0.07 + L.ph);
    let y = waterHeightAt(x, z, t) + 0.002;
    if (L.dipT !== undefined && L.dipT < 3) { L.dipT += dt; y -= 0.012 * Math.exp(-L.dipT * 2.5) * Math.cos(L.dipT * 11); }
    const e = Math.max(0.08, L.r * 0.7);
    const sx = (waterHeightAt(x + e, z, t) - waterHeightAt(x - e, z, t)) / (2 * e), sz = (waterHeightAt(x, z + e, t) - waterHeightAt(x, z - e, t)) / (2 * e);
    L.mesh.position.set(x, y, z); L.mesh.rotation.set(sz, L.rot + 0.1 * Math.sin(t * 0.05 + L.ph), -sx, 'YXZ');
  }
  for (const L of WORLD.lotus || []) { L.leaf.rotation.x = L.base.x + 0.05 * Math.sin(t * 0.8 + L.ph) * P.windSpeed * (0.5 + SH.uGust.value); L.leaf.rotation.z = L.base.z + 0.04 * Math.sin(t * 0.63 + L.ph * 1.3) * P.windSpeed; }
  if (WORLD.lotusFlower) WORLD.lotusFlower.rotation.z = 0.04 * Math.sin(t * 0.7) * P.windSpeed;
  for (const F of WORLD.floaters || []) {
    F.x += (F.vx + SH.uWindDir.value.x * 0.004 * P.windSpeed) * dt; F.z += (F.vz + SH.uWindDir.value.y * 0.004 * P.windSpeed) * dt;
    if (sdf(F.x, F.z) > -0.15) { F.vx = -F.vx; F.vz = -F.vz; F.x += F.vx * dt * 3; F.z += F.vz * dt * 3; }
    F.rot += dt * 0.02 * Math.sin(F.ph);
    F.mesh.position.set(F.x, waterHeightAt(F.x, F.z, t) + 0.0015, F.z); F.mesh.rotation.set(0, F.rot, 0); F.mesh.scale.setScalar(F.s);
  }
  updateFrog(t, dt);
  updateTurtle(t, dt);
}

/* --- The frog: a Japanese pond frog (Pelophylax nigromaculatus, "tonosama-gaeru") sitting on a pad. SDF-modelled
       anatomy, procedural skin (green-to-olive with black blotches, pale vertebral stripe, cream dorsolateral folds and
       lip line, barred limbs, cream belly), gold eyes with horizontal pupils, blinking lids, breathing throat, idle life. */
const FROG_PIVOT = [0.012, 0.031, 0];      // neck pivot for head turns
const FROG_VS = /* glsl */`
varying vec3 vLoc;
varying vec3 vLocN;
uniform float uBreath;
uniform float uCroak;
uniform vec2 uHead;
vec3 fRotY(vec3 v, float a){ float c = cos(a), s = sin(a); return vec3(c * v.x + s * v.z, v.y, -s * v.x + c * v.z); }
vec3 fRotZ(vec3 v, float a){ float c = cos(a), s = sin(a); return vec3(c * v.x - s * v.y, s * v.x + c * v.y, v.z); }
float frogHeadW(vec3 p){ return smoothstep(0.004, 0.024, p.x) * smoothstep(0.014, 0.03, p.y); }
`;
const FROG_VS_NORMAL = /* glsl */`
vLocN = objectNormal;
{ float hw = frogHeadW(position); objectNormal = fRotZ(fRotY(objectNormal, uHead.x * hw), uHead.y * hw); }
`;
const FROG_VS_BEGIN = /* glsl */`
vLoc = position;
{
  // throat pumps with each breath and balloons into paired vocal sacs when croaking; flanks breathe slowly
  float thr = smoothstep(0.018, 0.0, length((position - vec3(0.03, 0.021, 0.0)) * vec3(1.0, 1.5, 0.9)));
  float sacs = smoothstep(0.012, 0.0, length((vec3(position.x, position.y, abs(position.z)) - vec3(0.016, 0.028, 0.019))));
  transformed += vLocN * (thr * (0.0008 * (0.5 + 0.5 * sin(uBreath)) + 0.004 * uCroak) + sacs * 0.006 * uCroak);
  float fl = smoothstep(0.024, 0.0, length((position - vec3(-0.012, 0.024, 0.0)) * vec3(1.0, 1.0, 0.75)));
  transformed += vLocN * fl * 0.0006 * sin(uBreath * 0.23);
  float hw = frogHeadW(position);
  vec3 q = transformed - vec3(${FROG_PIVOT.join(', ')});
  q = fRotZ(fRotY(q, uHead.x * hw), uHead.y * hw);
  transformed = vec3(${FROG_PIVOT.join(', ')}) + q;
}
`;
const FROG_FS_PARS = /* glsl */`
varying vec3 vLoc;
varying vec3 vLocN;
float fh(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float fnoise(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(fh(i), fh(i + vec3(1,0,0)), f.x), mix(fh(i + vec3(0,1,0)), fh(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(fh(i + vec3(0,0,1)), fh(i + vec3(1,0,1)), f.x), mix(fh(i + vec3(0,1,1)), fh(i + vec3(1,1,1)), f.x), f.y), f.z); }
float segDist(vec3 p, vec3 a, vec3 b){ vec3 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h); }
`;
const FROG_MAP = /* glsl */`
vec3 lp = vLoc, ap = vec3(lp.x, lp.y, abs(lp.z));
vec3 ln = normalize(vLocN);
float mott = fnoise(lp * 300.0) * 0.6 + fnoise(lp * 800.0) * 0.4;
// black blotches (irregular, larger on the back, bars on the limbs)
float bl = fnoise(lp * 165.0 + 3.1) * 0.65 + fnoise(lp * 340.0 + 7.0) * 0.35;
float limbs = smoothstep(0.016, 0.024, ap.z) * (1.0 - smoothstep(0.024, 0.03, lp.y));
float bars = smoothstep(0.55, 0.8, sin(dot(ap.xz, vec2(620.0, 260.0)) + bl * 3.0) * 0.5 + 0.5) * limbs;
float blot = max(smoothstep(0.66, 0.7, bl + mott * 0.05) * (1.0 - limbs), bars * 0.85);
float dorsal = smoothstep(-0.5, 0.2, ln.y) * smoothstep(0.004, 0.016, lp.y);
// green on the head and shoulders grading to olive-bronze toward the rump
vec3 green = mix(vec3(0.30, 0.46, 0.12), vec3(0.48, 0.6, 0.2), mott);
vec3 olive = mix(vec3(0.36, 0.34, 0.14), vec3(0.48, 0.44, 0.2), mott);
vec3 back = mix(olive, green, smoothstep(-0.02, 0.025, lp.x));
vec3 cream = mix(vec3(0.88, 0.85, 0.7), vec3(0.95, 0.93, 0.82), mott);
vec3 col = mix(cream, back, dorsal);
col = mix(col, vec3(0.07, 0.06, 0.035), blot * dorsal * 0.85);
// pale vertebral stripe, cream-bronze dorsolateral folds
float vert = (1.0 - smoothstep(0.0012, 0.0024, ap.z)) * smoothstep(0.03, 0.036, lp.y) * smoothstep(0.05, 0.035, lp.x);
col = mix(col, vec3(0.62, 0.72, 0.36), vert * 0.85);
float fold = 1.0 - smoothstep(0.0012, 0.0026, min(segDist(ap, vec3(0.02, 0.0375, 0.0118), vec3(-0.004, 0.0335, 0.0138)), segDist(ap, vec3(-0.004, 0.0335, 0.0138), vec3(-0.026, 0.0275, 0.0152))));
col = mix(col, vec3(0.78, 0.7, 0.42), fold * 0.8);
// cream upper-lip line along the jaw, brown tympanum disc behind the eye
float lip = 1.0 - smoothstep(0.0008, 0.0022, segDist(ap, vec3(0.058, 0.0276, 0.0), vec3(0.012, 0.0302, 0.0205)) - 0.0012);
col = mix(col, cream * vec3(1.0, 0.97, 0.85), lip * step(0.0282, lp.y) * 0.8);
float tymp = 1.0 - smoothstep(0.0036, 0.0046, length(ap - vec3(0.0165, 0.0365, 0.0205)));
col = mix(col, vec3(0.32, 0.24, 0.12), tymp * 0.85);
// cream belly and throat, flesh-toned toe tips
float belly = smoothstep(0.1, -0.5, ln.y) + smoothstep(0.018, 0.0, length((lp - vec3(0.03, 0.02, 0.0)) * vec3(1.0, 1.4, 0.8)));
col = mix(col, cream, clamp(belly, 0.0, 1.0) * 0.95);
float toe = smoothstep(0.004, 0.0022, lp.y) * smoothstep(0.03, 0.045, length(lp.xz));
col = mix(col, vec3(0.72, 0.6, 0.4), toe * 0.6);
diffuseColor.rgb = pow(clamp(col, 0.0, 1.0), vec3(2.2));
`;
// Fine granular skin (smooth on the back, grainier on the flanks) as a derivative bump
const FROG_NORMAL = /* glsl */`
{
  float flank = smoothstep(0.1, 0.7, abs(normalize(vLocN).z));
  float hgt = (fnoise(vLoc * 900.0) * (0.35 + 0.65 * flank) + fnoise(vLoc * 2200.0) * 0.25 + smoothstep(0.6, 0.85, fnoise(vLoc * 330.0)) * 0.5 * flank) * 0.00022;
  vec3 dpx = dFdx(-vViewPosition), dpy = dFdy(-vViewPosition);
  float dhx = dFdx(hgt), dhy = dFdy(hgt);
  vec3 r1 = cross(dpy, normal), r2 = cross(normal, dpx);
  float det = dot(dpx, r1);
  vec3 grad = sign(det) * (dhx * r1 + dhy * r2);
  normal = normalize(abs(det) * normal - grad);
}
`;
const FROG = { root: null };
function frogEyeTexture() {
  // polar texture: rows = angle from the gaze axis, columns = azimuth; horizontal oval pupil in a gold iris
  const W = 256, H = 128, cv = makeCanvas(W, H), g = cv.getContext('2d'), img = g.createImageData(W, H), d = img.data;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const th = y / H, ph = (x / W) * Math.PI * 2;
    const pupilR = 0.13 * (1 + 0.55 * Math.cos(2 * ph)), iris = 0.42;
    let c;
    if (th < pupilR) c = [6, 6, 6];
    else if (th < iris) {
      const t = (th - pupilR) / (iris - pupilR), vein = hash3i(x >> 1, y >> 1, 3, 1);
      c = mix3(mix3([205, 150, 40], [238, 196, 92], Math.sin(t * Math.PI)), [70, 40, 12], (vein > 0.8 ? 0.6 : 0) + smoothstep(0.75, 1, t) * 0.7);
      if (th < pupilR + 0.015) c = mix3(c, [250, 215, 120], 0.6);          // bright rim around the pupil
    } else c = mix3([40, 36, 18], [70, 88, 36], smoothstep(0.42, 0.6, th));
    const i = (y * W + x) * 4; d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return canvasTex(cv, true);
}
function buildFrog() {
  const S = SDFK, P3 = [0, 0, 0];
  const mkFrog = (leap) => (p) => {
    const x = p[0], y = p[1], z = Math.abs(p[2]); P3[0] = x; P3[1] = y; P3[2] = z;
    const c = Math.cos(-0.3), s = Math.sin(-0.3), tx = x + 0.006, ty = y - 0.022;
    let d = S.ellipsoid([tx * c - ty * s, tx * s + ty * c, z], [0, 0, 0], [0.034, 0.0165, 0.021]);          // torso, raised at the front
    d = S.smin(d, S.ellipsoid(P3, [-0.025, 0.016, 0], [0.022, 0.015, 0.022]), 0.01);                       // rump on the haunches
    d = S.smin(d, S.ellipsoid(P3, [0.027, 0.033, 0], [0.023, 0.0115, 0.0205]), 0.01);                     // flat head
    d = S.smin(d, S.ellipsoid(P3, [0.047, 0.03, 0], [0.013, 0.0082, 0.0125]), 0.007);                     // rounded, pointed snout
    d = S.smin(d, S.ellipsoid(P3, [0.029, 0.024, 0], [0.02, 0.0085, 0.018]), 0.008);                      // lower jaw & throat
    d = S.smin(d, S.sphere(P3, [0.029, 0.0365, 0.0098], 0.0058), 0.005);                                   // eye mounds (the eyeballs bulge above them)
    d = S.smin(d, S.cone(P3, [0.02, 0.0375, 0.0118], [-0.004, 0.0335, 0.0138], 0.0015, 0.0013), 0.002);    // dorsolateral folds, following the back
    d = S.smin(d, S.cone(P3, [-0.004, 0.0335, 0.0138], [-0.026, 0.0275, 0.0152], 0.0013, 0.001), 0.002);
    // front legs: upper arm, forearm, four slender fingers with slightly swollen tips
    d = S.smin(d, S.cone(P3, [0.018, 0.022, 0.016], [0.024, 0.01, 0.022], 0.0046, 0.0036), 0.005);
    d = S.smin(d, S.cone(P3, [0.024, 0.01, 0.022], [0.033, 0.0022, 0.02], 0.0036, 0.003), 0.002);
    for (const [a, L] of [[-0.55, 0.008], [-0.15, 0.011], [0.25, 0.01], [0.65, 0.0075]]) {
      const ex = 0.033 + Math.cos(a) * L, ez = 0.02 + Math.sin(a) * L;
      d = S.smin(d, S.cone(P3, [0.033, 0.0022, 0.02], [ex, 0.0015, ez], 0.0013, 0.0011), 0.0012);
      d = S.smin(d, S.sphere(P3, [ex, 0.0016, ez], 0.0015), 0.0006);
    }
    if (leap) {
      // mid-leap: hind legs kicked straight back, toes fanned and webbing spread
      d = S.smin(d, S.cone(P3, [-0.026, 0.016, 0.017], [-0.056, 0.011, 0.029], 0.0085, 0.0062), 0.006);
      d = S.smin(d, S.cone(P3, [-0.056, 0.011, 0.029], [-0.089, 0.006, 0.034], 0.0062, 0.0038), 0.003);
      d = S.smin(d, S.cone(P3, [-0.089, 0.006, 0.034], [-0.108, 0.0035, 0.036], 0.0038, 0.0028), 0.002);
      for (const [a, L] of [[-0.62, 0.01], [-0.3, 0.015], [0.02, 0.021], [0.33, 0.026], [0.62, 0.017]]) {
        const ex = -0.108 - Math.cos(a * 0.8) * L, ez = 0.036 + Math.sin(a * 0.8) * L;
        d = S.smin(d, S.cone(P3, [-0.108, 0.0035, 0.036], [ex, 0.003, ez], 0.0012, 0.001), 0.0012);
        d = S.smin(d, S.sphere(P3, [ex, 0.003, ez], 0.0014), 0.0006);
      }
      d = S.smin(d, S.ellipsoid(P3, [-0.122, 0.0032, 0.037], [0.011, 0.0006, 0.009]), 0.0015);
    } else {
    // hind legs folded along the body: thigh, shank, long foot, five webbed toes
    d = S.smin(d, S.cone(P3, [-0.028, 0.016, 0.017], [0.004, 0.017, 0.032], 0.0085, 0.0062), 0.006);
    d = S.smin(d, S.cone(P3, [0.004, 0.017, 0.032], [-0.034, 0.0085, 0.031], 0.006, 0.0038), 0.003);
    d = S.smin(d, S.cone(P3, [-0.034, 0.0085, 0.031], [-0.012, 0.0026, 0.043], 0.0038, 0.0028), 0.002);
    for (const [a, L] of [[-0.62, 0.01], [-0.3, 0.015], [0.02, 0.021], [0.33, 0.026], [0.62, 0.017]]) {
      const ex = -0.012 + Math.cos(a) * L, ez = 0.043 + Math.sin(a) * L;
      d = S.smin(d, S.cone(P3, [-0.012, 0.0026, 0.043], [ex, 0.0015, ez], 0.0012, 0.001), 0.0012);
      d = S.smin(d, S.sphere(P3, [ex, 0.0015, ez], 0.0014), 0.0006);
    }
    d = S.smin(d, S.ellipsoid(P3, [0.0, 0.0017, 0.052], [0.011, 0.0006, 0.009]), 0.0015);                 // toe webbing
    }
    // mouth line, nostrils and a slightly recessed tympanum
    d = S.smax(d, -S.cone(P3, [0.0585, 0.0276, 0.0], [0.012, 0.0302, 0.0205], 0.0006, 0.0008), 0.0007);
    d = S.smax(d, -S.sphere(P3, [0.0535, 0.0352, 0.0042], 0.0011), 0.0006);
    d = S.smax(d, -S.sphere([x, y, z], [0.0165, 0.0365, 0.0236], 0.0042), 0.0012);
    return d;
  };
  const geo = surfaceNets(mkFrog(false), [-0.06, -0.002, -0.075], [0.07, 0.056, 0.075], 0.0007);
  const geoLeap = surfaceNets(mkFrog(true), [-0.14, -0.002, -0.056], [0.07, 0.056, 0.056], 0.0008);
  const mat = physical({ roughness: 0.3, clearcoat: 0.9, clearcoatRoughness: 0.14, sheen: 0.2, sheenRoughness: 0.4, sheenColor: new THREE.Color(0xe8f0c0), envMapIntensity: 1.0 }, {
    key: 'frog2', uniforms: { uBreath: { value: 0 }, uCroak: { value: 0 }, uHead: { value: new THREE.Vector2() } },
    vsPars: FROG_VS, vsNormal: FROG_VS_NORMAL, vsBegin: FROG_VS_BEGIN, fsPars: FROG_FS_PARS, fsMap: FROG_MAP, fsNormal: FROG_NORMAL,
    fsRough: 'roughnessFactor = mix(0.26, 0.42, blot * 0.5 + belly * 0.3);', fsPostLights: KOI_BODY_POST,
  });
  const body = new THREE.Mesh(geo, mat); body.castShadow = true; body.receiveShadow = true;
  const root = new THREE.Group(), head = new THREE.Group();
  const bodyLeap = new THREE.Mesh(geoLeap, mat); bodyLeap.castShadow = true; bodyLeap.visible = false;
  root.add(body, bodyLeap); head.position.set(...FROG_PIVOT); root.add(head);
  const eyeMat = physical({ map: frogEyeTexture(), roughness: 0.15, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 1.4 }, { key: 'frogeye2' });
  const lidMat = physical({ color: 0x6f8a36, roughness: 0.35, clearcoat: 0.7, clearcoatRoughness: 0.2 }, { key: 'froglid2' });
  const eyes = [];
  for (const side of [1, -1]) {
    const socket = new THREE.Group();
    socket.position.set(0.031 - FROG_PIVOT[0], 0.0402 - FROG_PIVOT[1], side * 0.0136);
    const gz = new THREE.Vector3(0.42, 0.55, side * 0.72).normalize(), ax = new THREE.Vector3(-gz.z, 0, gz.x).normalize(), up = new THREE.Vector3().crossVectors(ax, gz);
    socket.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(ax, gz, up));   // y = gaze, z = up across the eye
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.0066, 32, 20), eyeMat); eye.castShadow = true;
    const lid = new THREE.Mesh(new THREE.SphereGeometry(0.0072, 28, 12, 0, Math.PI * 2, 0, Math.PI * 0.5), lidMat); lid.castShadow = true;
    socket.add(eye, lid); head.add(socket);
    eyes.push({ socket, eye, lid, side, rest: socket.position.clone() });
  }
  root.traverse((o) => o.layers.set(LAYER.ABOVE));
  const pad = WORLD.frogPad;
  root.position.set(0.02, padSurfaceY(pad.r, 0, 0) - 0.0003, 0.0);
  root.scale.setScalar(1.15);
  pad.mesh.add(root);
  Object.assign(FROG, { root, body, bodyLeap, mat, head, eyes, yaw: 0, yawT: 0, breath: 0, croak: 0, croakT: rr(8, 16), croakN: 0, blinkT: rr(2, 5), blink: 0,
    look: new THREE.Vector2(), lookT: new THREE.Vector2(), sacT: 1, headT: new THREE.Vector2(), headV: new THREE.Vector2(), shuffleT: rr(10, 20) });
  FROG.baseYaw = 0;
}
const _fv = new THREE.Vector3(), _fq = new THREE.Quaternion(), _fe = new THREE.Euler();
function updateFrog(t, dt) {
  if (!FROG.root) return;
  const F = FROG, u = F.mat.userData.uniforms;
  if (F.jump) { updateFrogJump(t, dt); if (F.jump) return; }
  // face roughly toward the start camera; occasional small shuffles on the pad
  if (F.baseYaw === 0) F.baseYaw = Math.atan2(-(5.3 - WORLD.frogPad.z), (-0.6 - WORLD.frogPad.x)) + 1e-6;   // world yaw toward the opening view
  F.shuffleT -= dt;
  if (F.shuffleT < 0) { F.shuffleT = rr(9, 22); F.yawT = rr(-0.45, 0.45); }
  F.yaw = lerp(F.yaw, F.yawT, 1 - Math.exp(-dt * 2.2));
  F.root.rotation.set(0, F.baseYaw + F.yaw - WORLD.frogPad.mesh.rotation.y, 0);
  F.root.position.y = padSurfaceY(WORLD.frogPad.r, 0, 0) - 0.0005 - 0.0006 * Math.abs(F.yawT - F.yaw);
  // breathing and croaks (two or three throat pulses)
  F.breath += dt * (5.5 + F.croak * 4);
  F.croakT -= dt;
  if (F.croakT < 0) { F.croakN = 2 + (rand() * 2 | 0); F.croakT = rr(14, 32); F.croakPulse = 0; if (typeof audioEvent === 'function') audioEvent('croak', F.croakN); }
  if (F.croakN > 0) { F.croakPulse += dt; const ph = F.croakPulse % 0.62; F.croak = Math.sin(clamp(ph / 0.45, 0, 1) * Math.PI); if (F.croakPulse > 0.62 * F.croakN) { F.croakN = 0; F.croak = 0; } }
  u.uBreath.value = F.breath; u.uCroak.value = F.croak;
  // eyes: track the camera when it is near, otherwise small saccades; blink every few seconds
  F.root.getWorldPosition(_fv);
  const near = camera.position.distanceTo(_fv) < 2.5;
  F.sacT -= dt;
  if (F.sacT < 0) { F.sacT = rr(0.8, 3); F.lookT.set(rr(-0.3, 0.3), rr(-0.15, 0.2)); F.headT.set(rr(-0.18, 0.18), rr(-0.08, 0.1)); }
  if (near) {
    F.root.worldToLocal(_fv.copy(camera.position));
    const yawTo = Math.atan2(-_fv.z, _fv.x), pitchTo = Math.atan2(_fv.y - 0.05, Math.hypot(_fv.x, _fv.z));
    F.headT.set(clamp(yawTo * 0.35, -0.3, 0.3), clamp(pitchTo * 0.3, -0.1, 0.18));
    F.lookT.set(clamp(yawTo * 0.5, -0.4, 0.4), clamp(pitchTo * 0.4, -0.2, 0.25));
  }
  F.headV.lerp(F.headT, 1 - Math.exp(-dt * 2.5));
  u.uHead.value.copy(F.headV);
  F.head.rotation.set(0, F.headV.x, F.headV.y, 'ZYX');
  F.look.lerp(F.lookT, 1 - Math.exp(-dt * 10));
  F.blinkT -= dt;
  if (F.blinkT < 0) { F.blinkT = rr(2.5, 7); F.blink = 1e-3; }
  if (F.blink > 0) { F.blink += dt / 0.28; if (F.blink >= 1) F.blink = 0; }
  const lidClose = F.blink > 0 ? Math.sin(F.blink * Math.PI) : 0;
  for (const E of F.eyes) {
    E.eye.rotation.set(F.look.y, 0, -F.look.x * E.side);
    E.lid.rotation.set(-(1 - lidClose) * 1.6, 0, 0); E.lid.visible = lidClose > 0.02;                      // lower lid sweeps up over the eye
    E.socket.position.copy(E.rest).y -= 0.0014 * lidClose;                  // frogs retract their eyes when blinking
  }
}

/* ------------------------------------------------------------------ 9e. POND SLIDER TURTLE */
// A yellow-bellied slider (Trachemys scripta scripta), after the reference photo: olive-brown oval carapace with
// keeled vertebrals, a yellow bar on every costal scute, growth annuli and serrated rear marginals; a yellow plastron
// with dark smudges; near-black skin with yellow neck, leg and chin stripes and the broad yellow blotch behind the eye;
// webbed feet with long front claws. Rigid SDF parts (shell, head+neck, four limbs, tail) are posed per frame.
// Behaviour: basks on a low rock in the pond, walks down the ramp and plops in, swims and paddles underwater,
// surfaces to breathe, then climbs back out and basks again (dry shell -> wet and glossy -> slowly dries).
const TURTLE = { root: null, rocks: [], state: 'bask', timer: 14, pos: new THREE.Vector3(), yaw: 0, pitch: 0, roll: 0, speed: 0, wet: 0.2,
  gait: 0, stroke: 0, ext: 1, headYaw: 0, headPitch: 0, lookT: 0, lookYaw: 0, lookPitch: 0.2, wp: new THREE.Vector3(), swimT: 0, breathed: false };
const TURT_ROCK = { x: 1.45, z: 1.75 };
const TURT_PIV = { head: [0.083, 0.024, 0], fl: [0.066, 0.019, 0.05], hl: [-0.066, 0.018, 0.047], tail: [-0.098, 0.017, 0] };

function turtleEyeTexture() {
  // polar map around the gaze axis (+y of the sphere): round pupil crossed by the slider's dark horizontal bar
  const W = 256, H = 128, cv = makeCanvas(W, H), g = cv.getContext('2d'), img = g.createImageData(W, H), d = img.data;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const th = y / H, ph = (x / W) * Math.PI * 2;
    const bar = Math.abs(Math.sin(ph)) < 0.28 && th < 0.36;
    let c;
    if (th < 0.12 || bar) c = [8, 8, 6];
    else if (th < 0.36) {
      const t = (th - 0.12) / 0.24, v = hash3i(x >> 1, y >> 1, 7, 2);
      c = mix3(mix3([150, 150, 60], [196, 186, 88], Math.sin(t * Math.PI)), [50, 44, 16], (v > 0.82 ? 0.5 : 0) + smoothstep(0.7, 1, t) * 0.75);
    } else c = mix3([26, 26, 16], [36, 38, 22], smoothstep(0.36, 0.6, th));
    const i = (y * W + x) * 4; d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return canvasTex(cv, true);
}
const TURT_VS = /* glsl */`
varying vec3 vTL;
varying vec3 vTN;
`;
const TURT_VS_BEGIN = 'vTL = position; vTN = objectNormal;';
const TURT_FS_PARS = /* glsl */`
varying vec3 vTL;
varying vec3 vTN;
uniform float uTWet;
float tH = 0.0;          // micro height (m) for the derivative bump
float th3(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float tn3(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(th3(i), th3(i + vec3(1,0,0)), f.x), mix(th3(i + vec3(0,1,0)), th3(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(th3(i + vec3(0,0,1)), th3(i + vec3(1,0,1)), f.x), mix(th3(i + vec3(0,1,1)), th3(i + vec3(1,1,1)), f.x), f.y), f.z); }
// cellular scales: distance to the nearest / second-nearest feature point
vec2 tvor(vec3 x){ vec3 i = floor(x), f = fract(x); float d1 = 8.0, d2 = 8.0;
  for (int k = -1; k <= 1; k++) for (int j = -1; j <= 1; j++) for (int h = -1; h <= 1; h++) {
    vec3 o = vec3(float(h), float(j), float(k)); vec3 r = o + vec3(th3(i + o), th3(i + o + 13.1), th3(i + o + 27.7)) - f; float d = dot(r, r);
    if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d; }
  return vec2(sqrt(d1), sqrt(d2)); }
`;
const TURT_BUMP = /* glsl */`
{
  vec3 dpx = dFdx(-vViewPosition), dpy = dFdy(-vViewPosition);
  float dhx = dFdx(tH), dhy = dFdy(tH);
  vec3 r1 = cross(dpy, normal), r2 = cross(normal, dpx);
  float det = dot(dpx, r1);
  vec3 grad = sign(det) * (dhx * r1 + dhy * r2);
  normal = normalize(abs(det) * normal - grad);
}
`;
// Carapace scutes are laid out in an unfolded dome parameter (u forward, w across; rho = 1 at the rim).
const TURT_SHELL_MAP = /* glsl */`
vec3 p = vTL, n = normalize(vTN);
vec3 col;
float mott = tn3(p * 260.0) * 0.6 + tn3(p * 900.0) * 0.4;
bool plast = p.y < 0.0125 && (p.x * p.x / 0.0104 + p.z * p.z / 0.0046) < 1.08 && n.y < 0.2;
if (plast) {
  // plastron: warm yellow, dark smudges on the anterior scutes (yellow-bellied), seams, faint growth rings
  float seam = abs(p.z);
  float xs[5] = float[5](0.074, 0.047, 0.008, -0.03, -0.066);
  for (int i = 0; i < 5; i++) seam = min(seam, abs(p.x - xs[i]));
  vec3 q = vec3(p.x, 0.0, abs(p.z));
  float sm = 0.0;
  sm = max(sm, 1.0 - smoothstep(0.004, 0.0105, length(q.xz - vec2(0.064, 0.016)) + (tn3(p * 700.0) - 0.5) * 0.006));
  sm = max(sm, 1.0 - smoothstep(0.003, 0.009, length(q.xz - vec2(0.03, 0.03)) + (tn3(p * 650.0 + 3.0) - 0.5) * 0.006) * 0.8);
  sm = max(sm, (1.0 - smoothstep(0.002, 0.006, length(q.xz - vec2(-0.012, 0.042)) + (tn3(p * 600.0 + 7.0) - 0.5) * 0.004)) * 0.6);
  col = mix(vec3(0.78, 0.68, 0.34), vec3(0.88, 0.78, 0.42), mott);
  col *= 0.94 + 0.06 * sin(seam * 2600.0);
  col = mix(col, vec3(0.16, 0.13, 0.07), sm * 0.9);
  float sl = 1.0 - smoothstep(0.0004, 0.0011, seam);
  col = mix(col, vec3(0.3, 0.24, 0.12), sl * 0.8);
  tH = -sl * 0.00035 + mott * 0.00004;
} else {
  vec3 qd = vec3((p.x - 0.004) / 0.112, (p.y - 0.02) / 0.058, p.z / (0.082 * (1.0 + 0.05 * (-p.x / 0.112))));
  float qlen = length(qd); qd /= max(qlen, 1e-4);
  float rho = acos(clamp(qd.y, -1.0, 1.0)) / 1.5708;
  float phi = atan(qd.z, qd.x);
  float u = rho * cos(phi), w = rho * sin(phi), aw = abs(w);
  const float RING = 0.86;
  float seam, cid, kind, cu = 0.5, cv = 0.5;
  if (rho > RING) {
    float a = abs(phi), nM = 12.0, fa = a / 3.14159 * nM + 0.5, fr = fract(fa);
    seam = min(min(fr, 1.0 - fr) * 3.14159 / nM * 0.11, (rho - RING) * 0.12);
    cid = floor(fa) + (w < 0.0 ? 20.0 : 0.0); kind = 2.0; cu = fr; cv = (rho - RING) / (1.0 - RING);
  } else {
    float wv = 0.25 + 0.025 * cos((u + 0.46) / 0.3325 * 6.2832);
    if (aw < wv) {
      float idx = u > 0.54 ? 0.0 : u > 0.2 ? 1.0 : u > -0.13 ? 2.0 : u > -0.47 ? 3.0 : 4.0;
      float dU = min(min(abs(u - 0.54), abs(u - 0.2)), min(abs(u + 0.13), abs(u + 0.47)));
      seam = min(min(dU, wv - aw), RING - rho) * 0.12;
      cid = 40.0 + idx; kind = 0.0; cv = aw / wv;
    } else {
      float sk = (aw - wv);
      float c0 = 0.38 - sk * 0.35, c1 = 0.03 - sk * 0.08, c2 = -0.32 + sk * 0.3;
      float idx = u > c0 ? 0.0 : u > c1 ? 1.0 : u > c2 ? 2.0 : 3.0;
      float dU = min(min(abs(u - c0), abs(u - c1)), abs(u - c2));
      seam = min(min(dU, aw - wv), RING - rho) * 0.12;
      cid = 50.0 + idx + (w < 0.0 ? 10.0 : 0.0); kind = 1.0;
      float lo = idx == 0.0 ? c0 : idx == 1.0 ? c1 : idx == 2.0 ? c2 : -RING;
      float hi = idx == 0.0 ? RING : idx == 1.0 ? c0 : idx == 2.0 ? c1 : c2;
      cu = (u - lo) / max(hi - lo, 1e-3); cv = (aw - wv) / max(RING - wv, 1e-3);
    }
  }
  float hs = fract(sin(cid * 12.9898 + 1.3) * 43758.5453);
  // olive-brown ground, each scute its own shade, darker toward the seams
  col = mix(vec3(0.21, 0.19, 0.11), vec3(0.3, 0.26, 0.15), hs * 0.6 + mott * 0.4);
  col *= 0.78 + 0.22 * smoothstep(0.0, 0.012, seam);
  // yellow markings: a vertical bar on every costal, a bar on each marginal, fine vermiculation on the vertebrals
  vec3 yel = mix(vec3(0.5, 0.46, 0.2), vec3(0.62, 0.55, 0.26), mott);
  float edgeN = (tn3(p * 520.0) - 0.5) * 0.18;
  if (kind == 1.0) col = mix(col, yel, (1.0 - smoothstep(0.05, 0.12, abs(cu - 0.5 + (cv - 0.5) * 0.12) + edgeN * 0.6)) * smoothstep(0.08, 0.35, cv) * smoothstep(1.0, 0.8, cv) * 0.7);
  if (kind == 2.0) {
    col = mix(col, yel, (1.0 - smoothstep(0.06, 0.13, abs(cu - 0.5) + edgeN * 0.6)) * 0.45);
    // marginal underside: yellow with a dark ocellus on each scute
    float under = smoothstep(0.2, -0.4, n.y) + step(p.y, 0.0135);
    vec3 ucol = mix(vec3(0.76, 0.66, 0.32), vec3(0.18, 0.15, 0.08), 1.0 - smoothstep(0.12, 0.26, length(vec2(cu - 0.5, (cv - 0.6) * 0.6)) + edgeN * 0.5));
    col = mix(col, ucol, clamp(under, 0.0, 1.0));
  }
  if (kind == 0.0) col = mix(col, yel * 0.85, smoothstep(0.62, 0.8, tn3(p * 340.0 + cid)) * 0.45);
  // growth annuli parallel to the seams; seams as dark grooves
  float ann = 0.5 + 0.5 * sin(seam * 2300.0 + mott * 2.0);
  col *= 0.93 + 0.07 * ann * (1.0 - smoothstep(0.004, 0.02, seam));
  float sl = 1.0 - smoothstep(0.0005, 0.0013, seam);
  col = mix(col, vec3(0.08, 0.075, 0.04), sl * 0.85);
  tH = -sl * 0.0005 + ann * 0.00006 * (1.0 - smoothstep(0.004, 0.02, seam)) + mott * 0.00005;
  // dry: a dusty grey bloom of dried mineral film; algae along the rear margin
  float dust = (1.0 - uTWet) * smoothstep(0.35, 0.8, tn3(p * 90.0) * 0.7 + mott * 0.3) * smoothstep(-0.2, 0.6, n.y);
  col = mix(col, vec3(0.5, 0.49, 0.42), dust * 0.4);
  col = mix(col, vec3(0.2, 0.26, 0.1), smoothstep(0.7, 0.95, tn3(p * 150.0 + 5.0)) * smoothstep(-0.02, -0.09, p.x) * 0.35);
}
col *= mix(1.0, 0.78, uTWet);                      // wet surfaces darken
diffuseColor.rgb = pow(clamp(col, 0.0, 1.0), vec3(2.2));
`;
// Skin: near-black olive with yellow stripes; TPART 0 head+neck, 1 front leg, 2 hind leg, 3 tail
const TURT_SKIN_MAP = /* glsl */`
vec3 p = vTL, n = normalize(vTN);
float mott = tn3(p * 700.0);
vec3 skin = mix(vec3(0.07, 0.08, 0.045), vec3(0.13, 0.14, 0.075), mott);
vec3 yel = mix(vec3(0.74, 0.66, 0.26), vec3(0.86, 0.78, 0.34), tn3(p * 300.0));
float stripe = 0.0, horn = 0.0, scl = 0.0;
float wob = (tn3(p * 260.0) - 0.5) * 1.2;
#if TPART == 0
  float a = atan(p.z, p.y - 0.004);
  float neck = 1.0 - smoothstep(0.048, 0.06, p.x);
  stripe = smoothstep(0.72, 0.86, 0.5 + 0.5 * sin(a * 11.0 + wob + p.x * 30.0)) * neck;
  // broad yellow postorbital blotch, a stripe from the nostril under the eye, chin stripes and spots
  float az = abs(p.z);
  float blot = 1.0 - smoothstep(0.0, 0.002, length(vec2((p.x - 0.061) / 0.8, p.y - 0.009)) - 0.0072 + wob * 0.002);
  blot *= smoothstep(0.008, 0.012, az);
  float snoutS = 1.0 - smoothstep(0.0007, 0.0014, abs(p.y - (0.004 + (p.x - 0.06) * 0.12)) + wob * 0.0005);
  snoutS *= smoothstep(0.058, 0.066, p.x) * (1.0 - smoothstep(0.094, 0.099, p.x)) * smoothstep(0.004, 0.009, az);
  float chin = smoothstep(0.002, -0.004, p.y) * smoothstep(0.045, 0.058, p.x);
  float chinS = smoothstep(0.55, 0.8, 0.5 + 0.5 * sin(az * 900.0 + wob));
  float crown = 1.0 - smoothstep(0.0006, 0.0014, az - 0.0006) ;
  stripe = max(stripe, max(blot, max(snoutS, chin * chinS)));
  stripe = max(stripe, crown * smoothstep(0.05, 0.06, p.x) * smoothstep(0.012, 0.018, p.y) * 0.8);
  // horny beak along the jaws
  float lipZ = abs(p.y - (0.0035 + (p.x - 0.06) * 0.04));
  horn = (1.0 - smoothstep(0.0012, 0.003, lipZ)) * smoothstep(0.066, 0.078, p.x);
  horn = max(horn, smoothstep(0.093, 0.098, p.x));
  // neck skin folds (across the axis) and fine granular head scales
  tH = (0.5 + 0.5 * sin(p.x * 1500.0 + wob * 2.0)) * 0.00007 * neck + tn3(p * 3000.0) * 0.000025;
#else
  float a = atan(p.z, p.y);
  #if TPART == 3
    stripe = smoothstep(0.7, 0.86, 0.5 + 0.5 * sin(a * 6.0 + wob));
  #else
    // front and hind legs: stripes along the limb, big scales on the leading edge, claws
    stripe = smoothstep(0.74, 0.88, 0.5 + 0.5 * sin(a * 5.0 + wob + p.x * 20.0)) * (1.0 - smoothstep(0.03, 0.04, p.x));
    vec2 vv = tvor(p * vec3(260.0, 320.0, 320.0));
    scl = 1.0 - smoothstep(0.0, 0.12, vv.y - vv.x);
    #if TPART == 1
      vec2 hc = vec2(0.046, 0.0); float tipR = 0.0162;
    #else
      vec2 hc = vec2(0.05, 0.0); float tipR = 0.0195;
    #endif
    horn = smoothstep(tipR - 0.0008, tipR + 0.0012, length(p.xz - hc)) * step(hc.x, p.x);
    tH = -scl * 0.00012 + tn3(p * 2500.0) * 0.00002;
  #endif
#endif
vec3 col = mix(skin, yel, stripe);
col = mix(col, col * 0.6 + vec3(0.03), scl * 0.5);
col = mix(col, vec3(0.2, 0.18, 0.12) * (0.8 + 0.4 * mott), horn);
col = mix(col, col * vec3(1.15, 1.1, 0.9) + vec3(0.03, 0.03, 0.0), smoothstep(0.1, -0.6, n.y) * 0.5);   // paler undersides
col *= mix(1.0, 0.85, uTWet);
diffuseColor.rgb = pow(clamp(col, 0.0, 1.0), vec3(2.2));
`;
function turtleShellSDF() {
  const S = SDFK, P3 = [0, 0, 0];
  return (p) => {
    const x = p[0], y = p[1], z = p[2], az = Math.abs(z);
    P3[0] = x; P3[1] = y; P3[2] = az;
    // carapace dome: oval, a touch wider behind the middle; serrated rear marginals
    const ang = Math.atan2(az, x), rear = smoothstep(0.45, 1.0, -x / 0.112) * smoothstep(0.03, 0.02, y);
    const notch = 1 - 0.045 * rear * Math.pow(0.5 + 0.5 * Math.cos(ang * 24), 6);
    const zw = 1 + 0.05 * (-x / 0.112);
    let d = S.ellipsoid([x / notch, y, az / (zw * notch)], [0.004, 0.02, 0], [0.112, 0.058, 0.082]) * Math.min(notch, zw);
    d -= 0.0016 * Math.exp(-(az * az) / 0.0002) * clamp((y - 0.05) / 0.02, 0, 1);                       // low vertebral keel
    d = S.smax(d, 0.012 - y, 0.0025);                                                                   // flat underside of the margins
    // openings under the front and rear margins for head, limbs and tail
    d = S.smax(d, -S.ellipsoid(P3, [0.118, 0.012, 0], [0.034, 0.012, 0.046]), 0.004);
    d = S.smax(d, -S.ellipsoid(P3, [0.074, 0.012, 0.062], [0.026, 0.0095, 0.03]), 0.004);
    d = S.smax(d, -S.ellipsoid(P3, [-0.112, 0.012, 0], [0.028, 0.011, 0.05]), 0.004);
    d = S.smax(d, -S.ellipsoid(P3, [-0.074, 0.012, 0.058], [0.026, 0.0095, 0.03]), 0.004);
    // plastron: a flat plate with a truncated front lobe and a rear notch; bridges join it to the carapace
    let pl = S.smax(S.ellipsoid(P3, [0.0, 0.007, 0], [0.101, 0.02, 0.066]), Math.abs(y - 0.0072) - 0.0052, 0.003);
    pl = S.smax(pl, -S.sphere(P3, [-0.105, 0.006, 0], 0.013), 0.003);
    pl = S.smax(pl, x - 0.094, 0.006);
    pl = S.smin(pl, S.roundBox(P3, [0.0, 0.012, 0.064], [0.042, 0.006, 0.014], 0.004), 0.004);
    return S.smin(d, pl, 0.003);
  };
}
function turtleHeadSDF() {
  const S = SDFK, P3 = [0, 0, 0];
  return (p) => {
    const x = p[0], y = p[1], z = p[2]; P3[0] = x; P3[1] = y; P3[2] = Math.abs(z);
    let d = S.cone(P3, [-0.035, -0.001, 0], [0.046, 0.004, 0], 0.0172, 0.0146);                      // neck (runs back into the shell)
    d = S.smin(d, S.ellipsoid(P3, [0.062, 0.0085, 0], [0.025, 0.015, 0.0166]), 0.009);             // cranium
    d = S.smin(d, S.ellipsoid(P3, [0.083, 0.0068, 0], [0.0145, 0.0098, 0.0102]), 0.007);             // snout
    d = S.smin(d, S.ellipsoid(P3, [0.069, -0.0005, 0], [0.023, 0.0085, 0.0128]), 0.006);             // lower jaw
    d = S.smax(d, -S.sphere(P3, [0.0765, 0.0132, 0.0112], 0.0047), 0.0014);                          // eye sockets
    d = S.smin(d, S.ellipsoid(P3, [0.0755, 0.0172, 0.0098], [0.007, 0.0026, 0.0038]), 0.002);        // brow over the eye
    d = S.smax(d, -S.cone(P3, [0.0985, 0.0036, 0], [0.058, 0.0052, 0.0138], 0.0005, 0.0009), 0.0007); // mouth line
    d = S.smax(d, -S.sphere(P3, [0.0968, 0.0092, 0.0023], 0.00085), 0.0005);                         // nostrils
    return d;
  };
}
function turtleLegSDF(hind) {
  const S = SDFK, P3 = [0, 0, 0];
  const R = hind ? { r0: 0.0145, r1: 0.0122, r2: 0.0098, e1: 0.02, e2: 0.037, hc: 0.05, hr: [0.0145, 0.0042, 0.0148], n: 4, spread: 0.3, tip: 0.0195, claw: 0.0055 }
                 : { r0: 0.013, r1: 0.011, r2: 0.0092, e1: 0.019, e2: 0.035, hc: 0.046, hr: [0.0118, 0.0046, 0.0112], n: 5, spread: 0.25, tip: 0.0162, claw: 0.0095 };
  return (p) => {
    const x = p[0], y = p[1], z = p[2]; P3[0] = x; P3[1] = y; P3[2] = z;
    let d = S.cone(P3, [-0.016, 0, 0], [R.e1, -0.002, 0], R.r0, R.r1);
    const fp = [x, (y + 0.003) / 0.72 - 0.003, z];                                                    // flattened forearm / shank
    d = S.smin(d, S.cone(fp, [R.e1, -0.002, 0], [R.e2, -0.004, 0], R.r1, R.r2), 0.006);
    d = S.smin(d, S.ellipsoid(P3, [R.hc, -0.0045, 0], R.hr), 0.006);                                  // webbed paddle
    for (let i = 0; i < R.n; i++) {
      const a = (i - (R.n - 1) / 2) * R.spread, cx = R.hc + Math.cos(a) * R.tip, cz = Math.sin(a) * R.tip;
      d = S.smin(d, S.cone(P3, [R.hc + Math.cos(a) * 0.006, -0.0045, Math.sin(a) * 0.006], [cx, -0.0048, cz], 0.0026, 0.0019), 0.002);
      const ex = cx + Math.cos(a) * R.claw, ez = cz + Math.sin(a) * R.claw;                          // curved claws
      d = S.smin(d, S.cone(P3, [cx, -0.0048, cz], [lerp(cx, ex, 0.6), -0.0052, lerp(cz, ez, 0.6)], 0.0016, 0.001), 0.0008);
      d = S.smin(d, S.cone(P3, [lerp(cx, ex, 0.6), -0.0052, lerp(cz, ez, 0.6)], [ex, -0.0078, ez], 0.001, 0.00028), 0.0005);
    }
    return d;
  };
}
function turtleTailSDF() {
  const S = SDFK;
  return (p) => S.cone(p, [-0.012, 0, 0], [0.042, -0.004, 0], 0.0092, 0.0012);
}
function turtleRockHeight(x, z) {
  _trO.set(x, 1.5, z); _tray.set(_trO, _trD); _tray.far = 3;
  const h = _tray.intersectObjects(TURTLE.rocks, false)[0];
  return h ? h.point.y + 0.004 : -Infinity;
}
const _tray = new THREE.Raycaster(), _trO = new THREE.Vector3(), _trD = new THREE.Vector3(0, -1, 0);
_tray.layers.set(LAYER.BOTH);
function buildTurtle() {
  // --- the basking rock: a low boulder with a weathered flat top and a tilted slab running down into the pond
  const boulderMat = WORLD.boulderMat;
  const rk = new THREE.Matrix4(), q = new THREE.Quaternion();
  const put = (geo, pos, quat, scl) => { geo.computeBoundingBox(); const bb = geo.boundingBox; pos.y -= scl.y * bb.max.y; return instanced(geo, boulderMat, [rk.compose(pos, quat, scl).clone()], LAYER.BOTH); };
  const D = new THREE.Vector3(-0.62, 0, 0.78).normalize();                                // ramp faces the viewer's side of the pond
  TURTLE.rampDir = D;
  const main = put(rockGeo(41.3, 5, -0.35, 0.7, false), new THREE.Vector3(TURT_ROCK.x, 0.15, TURT_ROCK.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0.05, 0.6, -0.04)), new THREE.Vector3(0.42, 0.3, 0.36));
  const sc = new THREE.Vector3(TURT_ROCK.x + D.x * 0.36, 0, TURT_ROCK.z + D.z * 0.36);
  const slabQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.atan2(-D.z, D.x), 0)).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0.05, 0, -0.24)));
  const slab = put(rockGeo(17.9, 5, -0.35, 0.6), sc.clone().setY(0.06), slabQ, new THREE.Vector3(0.33, 0.16, 0.26));
  // submerged base that carries both down to the pond floor
  const bx = TURT_ROCK.x + D.x * 0.15, bz = TURT_ROCK.z + D.z * 0.15, fl = pondDepth(bx, bz, Math.max(0.01, -sdf(bx, bz)));
  const baseGeo = rockGeo(8.3, 4, -0.35, 0.2); baseGeo.computeBoundingBox();
  const bsy = (fl - 0.06) / (baseGeo.boundingBox.max.y - baseGeo.boundingBox.min.y);
  const base = put(baseGeo, new THREE.Vector3(bx, -0.1, bz), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 1.3, 0)), new THREE.Vector3(0.62, bsy, 0.5));
  for (const m of [main, slab]) { m.castShadow = true; addMossShells(m, 0.45); }
  TURTLE.rocks = [main, slab, base]; WORLD.solids.push(main, slab);
  WORLD.obstacles = (WORLD.obstacles || []).concat([{ x: TURT_ROCK.x, z: TURT_ROCK.z, r: 0.5 }, { x: sc.x, z: sc.z, r: 0.3 }]);
  // basking spot = highest point near the rock centre; entry point = where the ramp passes under the water
  let best = -1, bt = 0;
  for (let t = -0.1; t < 0.3; t += 0.01) { const h = turtleRockHeight(TURT_ROCK.x + D.x * t, TURT_ROCK.z + D.z * t); if (h > best) { best = h; bt = t; } }
  TURTLE.B = new THREE.Vector3(TURT_ROCK.x + D.x * bt, best, TURT_ROCK.z + D.z * bt);
  let et = bt;
  for (let t = bt; t < 1.2; t += 0.01) { et = t; if (turtleRockHeight(TURT_ROCK.x + D.x * t, TURT_ROCK.z + D.z * t) < WATER_Y - 0.06) break; }
  TURTLE.E = new THREE.Vector3(TURT_ROCK.x + D.x * et, WATER_Y - 0.06, TURT_ROCK.z + D.z * et);

  // --- the animal
  const wet = { value: 0.2 };
  const shellMat = physical({ roughness: 0.55, clearcoat: 0.3, clearcoatRoughness: 0.25, envMapIntensity: 0.9 }, {
    key: 'turtshell', uniforms: { uTWet: wet }, vsPars: TURT_VS, vsBegin: TURT_VS_BEGIN, fsPars: TURT_FS_PARS, fsMap: TURT_SHELL_MAP, fsNormal: TURT_BUMP,
    fsRough: 'roughnessFactor = mix(0.62, 0.2, uTWet);', fsPreLights: '#ifdef USE_CLEARCOAT\n material.clearcoat = mix(0.12, 0.95, uTWet);\n#endif\n' });
  const skinMat = (part) => physical({ roughness: 0.5, clearcoat: 0.3, clearcoatRoughness: 0.3, sheen: 0.2, sheenRoughness: 0.5, sheenColor: new THREE.Color(0xc8d0a0), envMapIntensity: 0.9 }, {
    key: 'turtskin' + part, uniforms: { uTWet: wet }, vsPars: TURT_VS, vsBegin: TURT_VS_BEGIN, fsPars: `#define TPART ${part}\n` + TURT_FS_PARS, fsMap: TURT_SKIN_MAP, fsNormal: TURT_BUMP,
    fsRough: 'roughnessFactor = mix(0.55, 0.24, uTWet); roughnessFactor = mix(roughnessFactor, 0.3, horn);', fsPreLights: '#ifdef USE_CLEARCOAT\n material.clearcoat = mix(0.15, 0.9, uTWet);\n#endif\n' });
  const mesh = (geo, mat) => { const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.receiveShadow = true; return m; };
  const root = new THREE.Group();
  const shell = mesh(surfaceNets(turtleShellSDF(), [-0.126, -0.002, -0.096], [0.126, 0.084, 0.096], 0.0011), shellMat);
  root.add(shell);
  const head = new THREE.Group(); head.position.set(...TURT_PIV.head);
  head.add(mesh(surfaceNets(turtleHeadSDF(), [-0.054, -0.019, -0.021], [0.102, 0.027, 0.021], 0.00055), skinMat(0)));
  const eyeMat = physical({ map: turtleEyeTexture(), roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 1.4 }, { key: 'turteye' });
  for (const s of [1, -1]) {
    const e = mesh(new THREE.SphereGeometry(0.0044, 24, 16), eyeMat);
    e.position.set(0.0768, 0.0132, s * 0.0112);
    e.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0.42, 0.22, s * 0.88).normalize());
    head.add(e);
  }
  root.add(head);
  const fGeo = surfaceNets(turtleLegSDF(false), [-0.032, -0.02, -0.032], [0.078, 0.018, 0.032], 0.0006);
  const hGeo = surfaceNets(turtleLegSDF(true), [-0.034, -0.021, -0.036], [0.082, 0.02, 0.036], 0.0006);
  const fMat = skinMat(1), hMat = skinMat(2);
  const legs = [];
  for (const [hind, s] of [[0, 1], [0, -1], [1, 1], [1, -1]]) {
    const g = new THREE.Group(), pv = hind ? TURT_PIV.hl : TURT_PIV.fl;
    g.position.set(pv[0], pv[1], s * pv[2]); g.rotation.order = 'YZX';
    g.add(mesh(hind ? hGeo : fGeo, hind ? hMat : fMat)); root.add(g);
    legs.push({ g, hind: !!hind, s, cur: new THREE.Vector3(), phase: (hind ? (s > 0 ? Math.PI : 0) : (s > 0 ? 0 : Math.PI)) });
  }
  const tail = new THREE.Group(); tail.position.set(...TURT_PIV.tail); tail.rotation.set(0, Math.PI, 0);
  tail.add(mesh(surfaceNets(turtleTailSDF(), [-0.024, -0.013, -0.012], [0.046, 0.011, 0.012], 0.0006), skinMat(3)));
  root.add(tail);
  root.rotation.order = 'YZX';
  setLayer(root, LAYER.BOTH); scene.add(root);
  Object.assign(TURTLE, { root, head, legs, tail, wetU: wet });
  // start basking, turned three-quarters toward the opening view
  TURTLE.pos.copy(TURTLE.B);
  TURTLE.baskYaw = Math.atan2(-(5.3 - TURTLE.B.z), -0.24 - TURTLE.B.x) + 0.7;
  TURTLE.yaw = TURTLE.baskYaw;
}
// leg pose targets: [roll, yaw (outward/back sweep), pitch (tip up +)]
function turtleLegPose(L, mode, ph, amt) {
  const s = L.s, v = L.cur;
  let roll = 0, yaw, pitch;
  if (mode === 'bask') {
    if (L.hind) { yaw = 2.5; pitch = -0.2; roll = -1.0; }             // hind legs stretched back, soles turned up
    else { yaw = 1.05; pitch = -0.28; roll = 0.15; }
  } else if (mode === 'walk') {
    const c = Math.cos(ph), sw = Math.max(0, Math.sin(ph));
    if (L.hind) { yaw = 2.1 + 0.35 * c; pitch = -0.42 + 0.3 * sw; roll = -0.2; }
    else { yaw = 0.95 - 0.38 * c; pitch = -0.5 + 0.3 * sw; roll = 0.15; }
  } else {                                                                 // swim: power stroke face-on, recovery feathered
    const c = Math.cos(ph), sn = Math.sin(ph), k = amt;
    if (L.hind) { yaw = 2.35 + 0.5 * c * k; pitch = -0.08 + 0.12 * sn * k; roll = -0.25 + 1.1 * Math.max(0, sn) * k; }
    else { yaw = 1.25 - 0.85 * c * k; pitch = 0.02 + 0.2 * sn * k; roll = 1.2 * Math.max(0, sn) * k; }
  }
  return [roll * s, -yaw * s, pitch];
}
function turtleWaypoint() {
  for (let g = 0; g < 60; g++) {
    const x = rr(-2.6, 2.5), z = rr(-4.8, 4.8), sd = sdf(x, z);
    if (sd > -0.6 || Math.hypot(x - TURT_ROCK.x, z - TURT_ROCK.z) < 0.7 || Math.hypot(x - TURTLE.pos.x, z - TURTLE.pos.z) < 1.0) continue;
    const floor = pondDepth(x, z, -sd);
    TURTLE.wp.set(x, -Math.min(rr(0.22, 0.5), floor - 0.12), z); return;
  }
  TURTLE.wp.set(0, -0.35, 0);
}
function updateTurtle(t, dt) {
  const T = TURTLE;
  if (!T.root || dt <= 0 || T.off) return;
  T.timer -= dt;
  const fx = Math.cos(T.yaw), fz = -Math.sin(T.yaw);
  let legMode = 'swim', stroke = 0, targetExt = 0.75, hPitch = 0, hYaw = 0, wantPitch = 0, wantRoll = 0;
  const onRock = (st) => st === 'walkDown' || st === 'climb' || st === 'turn' || st === 'turnDown' || (st === 'bask' && !T.settled);
  if (onRock(T.state)) {
    if (T.state === 'bask') T.settleT = (T.settleT || 0) + dt; else T.settleT = 0;
    if (T.settleT > 1.5) T.settled = true;
    // follow the rock surface under the shell; pitch / roll from the ground slope
    const hF = turtleRockHeight(T.pos.x + fx * 0.08, T.pos.z + fz * 0.08), hB = turtleRockHeight(T.pos.x - fx * 0.08, T.pos.z - fz * 0.08);
    const hR = turtleRockHeight(T.pos.x - fz * 0.06, T.pos.z + fx * 0.06), hL = turtleRockHeight(T.pos.x + fz * 0.06, T.pos.z - fx * 0.06);
    const valid = (h) => h > -1;
    const hc = Math.max(valid(hF) ? hF : -1, valid(hB) ? hB : -1, turtleRockHeight(T.pos.x, T.pos.z));
    if (valid(hF) && valid(hB)) wantPitch = Math.atan2(hF - hB, 0.16);
    if (valid(hL) && valid(hR)) wantRoll = Math.atan2(hL - hR, 0.12);
    const lift = T.state === 'bask' ? 0.0 : 0.01;
    const ty = (valid(hF) && valid(hB) ? (hF + hB) * 0.5 : hc) + lift - 0.003;
    T.pos.y = lerp(T.pos.y, Math.max(ty, hc - 0.02), 1 - Math.exp(-dt * 10));
  }
  if (T.state === 'bask') {
    legMode = 'bask'; targetExt = 1;
    T.wet = Math.max(0, T.wet - dt / 70);
    T.lookT -= dt;
    if (T.lookT < 0) { T.lookT = rr(2.5, 6); T.lookYaw = rr(-0.55, 0.55); T.lookPitch = rr(0.05, 0.35); }
    hYaw = T.lookYaw; hPitch = T.lookPitch;
    if (T.timer < 0) { T.state = 'turnDown'; T.settled = false; }
  }
  if (T.state === 'turnDown' || T.state === 'turn') {
    legMode = 'walk';
    const want = T.state === 'turnDown' ? Math.atan2(-T.rampDir.z, T.rampDir.x) : T.baskYaw;
    let dh = want - T.yaw; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
    T.yaw += clamp(dh, -0.7 * dt, 0.7 * dt); T.gait += dt * 5;
    if (Math.abs(dh) < 0.03) {
      if (T.state === 'turnDown') T.state = 'walkDown';
      else { T.state = 'bask'; T.timer = rr(28, 45); }
    }
  }
  if (T.state === 'walkDown') {
    legMode = 'walk'; targetExt = 0.9; hPitch = -0.15;
    const v = 0.05;
    T.pos.x += fx * v * dt; T.pos.z += fz * v * dt; T.gait += dt * v * 110;
    if (T.pos.y < WATER_Y - 0.035 || turtleRockHeight(T.pos.x + fx * 0.1, T.pos.z + fz * 0.1) < -1) {
      T.state = 'dive'; T.timer = 1.6; T.speed = 0.22; T.wet = 1;
      if (typeof spawnSplash === 'function') spawnSplash(T.pos.x + fx * 0.05, T.pos.z + fz * 0.05, 0.9);
      addDrop(T.pos.x, T.pos.z, 0.14, -0.01); addDrop(T.pos.x + fx * 0.1, T.pos.z + fz * 0.1, 0.1, -0.006);
      splashAt(T.pos.x, WATER_Y, T.pos.z, 1.0);
      bubbleBurst(T.pos.x + fx * 0.05, WATER_Y - 0.04, T.pos.z + fz * 0.05, 70, 0.08, 0.0005, 0.006, 0.5);
      turtleWaypoint(); T.swimT = rr(32, 45); T.breathed = false;
    }
  }
  const inWater = T.state === 'dive' || T.state === 'swim' || T.state === 'surface' || T.state === 'return' || T.state === 'approach';
  if (inWater) {
    T.wet = 1;
    let target = T.wp, spd = 0.12, rise = 0;
    if (T.state === 'dive') { spd = 0.16; if (T.timer < 0) T.state = 'swim'; }
    if (T.state === 'swim') {
      T.swimT -= dt;
      if (Math.hypot(T.pos.x - T.wp.x, T.pos.z - T.wp.z) < 0.35) turtleWaypoint();
      if (!T.breathed && T.swimT < 18) { T.state = 'surface'; T.wp.set(T.pos.x + fx * 0.5, WATER_Y - 0.05, T.pos.z + fz * 0.5); T.timer = 9; }
      if (T.swimT < 0) T.state = 'return';
    }
    if (T.state === 'surface') {
      spd = 0.07; rise = 1;
      if (T.pos.y > WATER_Y - 0.075) { spd = 0.012; hPitch = 0.45; targetExt = 1; }
      else if (!T.exhaled && T.pos.y > WATER_Y - 0.2) { T.exhaled = true; bubbleBurst(T.pos.x + fx * 0.16, T.pos.y + 0.03, T.pos.z + fz * 0.16, 14, 0.01, 0.0008, 0.004, 0); }
      if (T.timer < 0) { T.breathed = true; T.exhaled = false; T.state = 'swim'; turtleWaypoint(); addDrop(T.pos.x + fx * 0.12, T.pos.z + fz * 0.12, 0.05, -0.003); }
    }
    if (T.state === 'return') {
      const D = T.rampDir;
      target = _tv1.set(T.E.x + D.x * 0.5, -0.12, T.E.z + D.z * 0.5);
      if (Math.hypot(T.pos.x - target.x, T.pos.z - target.z) < 0.12) T.state = 'approach';
    }
    if (T.state === 'approach') {
      target = _tv1.copy(T.E); spd = 0.07;
      if (Math.hypot(T.pos.x - T.E.x, T.pos.z - T.E.z) < 0.06) { T.state = 'climb'; addDrop(T.pos.x, T.pos.z, 0.08, -0.004); }
    }
    // steering: turn toward the target, avoid the banks, the bridge piers and the rock
    let dx = target.x - T.pos.x, dz = target.z - T.pos.z;
    const dl = Math.hypot(dx, dz) + 1e-4; dx /= dl; dz /= dl;
    const look = 0.35, lx = T.pos.x + fx * look, lz = T.pos.z + fz * look, sd = sdf(lx, lz);
    if (sd > -0.55) { const e = 0.03, gx = (sdf(lx + e, lz) - sdf(lx - e, lz)) / (2 * e), gz = (sdf(lx, lz + e) - sdf(lx, lz - e)) / (2 * e); dx -= gx * (sd + 0.55) * 5; dz -= gz * (sd + 0.55) * 5; }
    const avoid = T.state === 'approach' || T.state === 'return' ? [] : (WORLD.obstacles || []);
    for (const o of avoid.concat([{ x: -1.15, z: BRIDGE.z, r: 0.5 }, { x: 1.15, z: BRIDGE.z, r: 0.5 }])) {
      const ox = T.pos.x - o.x, oz = T.pos.z - o.z, d = Math.hypot(ox, oz); if (d < o.r + 0.3) { dx += ox / d * (o.r + 0.3 - d) * 4; dz += oz / d * (o.r + 0.3 - d) * 4; }
    }
    let dh = Math.atan2(-dz, dx) - T.yaw; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
    T.yaw += clamp(dh * 1.2, -0.75, 0.75) * dt;
    T.speed = lerp(T.speed, spd * (0.55 + 0.45 * Math.cos(clamp(dh, -1.5, 1.5))), 1 - Math.exp(-dt * 1.5));
    T.pos.x += fx * T.speed * dt; T.pos.z += fz * T.speed * dt;
    const floor = -pondDepth(T.pos.x, T.pos.z, Math.max(0.01, -sdf(T.pos.x, T.pos.z))) + 0.05;
    const ty = Math.max(floor, target.y), vy = clamp((ty - T.pos.y) * 0.8, -0.06, rise ? 0.07 : 0.05);
    T.pos.y = Math.min(T.pos.y + vy * dt, WATER_Y - 0.055);
    wantPitch = clamp(Math.atan2(vy, Math.max(T.speed, 0.05)) * 0.8, -0.5, 0.5); wantRoll = clamp(-dh * 0.4, -0.3, 0.3);
    stroke = clamp(T.speed / 0.12, 0.25, 1.2);
    T.gait += dt * (2.2 + 4.5 * stroke);
    if (T.state !== 'surface') { hYaw = Math.sin(t * 0.4) * 0.15; hPitch = -wantPitch * 0.4; }
  }
  if (T.state === 'climb') {
    legMode = 'walk'; targetExt = 0.95; hPitch = 0.1;
    const bx = T.B.x - T.pos.x, bz = T.B.z - T.pos.z, bd = Math.hypot(bx, bz);
    let dh = Math.atan2(-bz, bx) - T.yaw; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
    T.yaw += clamp(dh, -0.8 * dt, 0.8 * dt);
    const v = 0.035; T.pos.x += fx * v * dt; T.pos.z += fz * v * dt; T.gait += dt * v * 120;
    if (T.pos.y > WATER_Y + 0.005 && rand() < dt * 3) addDrop(T.pos.x - fx * 0.1, T.pos.z - fz * 0.1, 0.03, -0.0015);   // dripping
    if (bd < 0.02) { T.state = 'turn'; }
  }
  // pose the body
  T.pitch = lerp(T.pitch, wantPitch, 1 - Math.exp(-dt * 4)); T.roll = lerp(T.roll, wantRoll, 1 - Math.exp(-dt * 4));
  const bob = legMode === 'walk' ? Math.abs(Math.sin(T.gait)) * 0.003 : legMode === 'swim' ? Math.sin(T.gait * 2) * 0.002 * stroke : 0;
  T.root.position.set(T.pos.x, T.pos.y + bob, T.pos.z);
  T.root.rotation.set(T.roll, T.yaw, T.pitch);
  // limbs: ease toward the pose target so state changes never pop
  for (const L of T.legs) {
    const [r, y, p] = turtleLegPose(L, legMode, T.gait + L.phase, stroke);
    const k = 1 - Math.exp(-dt * (legMode === 'bask' ? 2.5 : 12));
    L.cur.x = lerp(L.cur.x, r, k); L.cur.y = lerp(L.cur.y, y, k); L.cur.z = lerp(L.cur.z, p, k);
    L.g.rotation.set(L.cur.x, L.cur.y, L.cur.z);
  }
  T.ext = lerp(T.ext, targetExt, 1 - Math.exp(-dt * 2));
  T.headYaw = lerp(T.headYaw, hYaw, 1 - Math.exp(-dt * 1.8)); T.headPitch = lerp(T.headPitch, hPitch, 1 - Math.exp(-dt * 1.8));
  T.head.position.set(TURT_PIV.head[0] + (T.ext - 0.75) * 0.04, TURT_PIV.head[1] + T.headPitch * 0.006, 0);
  T.head.rotation.set(0, T.headYaw, T.headPitch, 'YZX');
  T.tail.rotation.set(0, Math.PI + Math.sin(T.gait * 0.5) * 0.25 * (legMode === 'bask' ? 0.1 : 1), -0.15);
  T.wetU.value = lerp(T.wetU.value, T.wet, 1 - Math.exp(-dt * 3));
}
const _tv1 = new THREE.Vector3();

/* ------------------------------------------------------------------ 9f. FALLING CHERRY PETALS */
// Petals let go from the cherry crowns, flutter down tumbling on the breeze, then settle: on the pond they float
// and drift with the waves for a while before sinking; on land they rest on the grass. Airborne petals are
// mirrored in the water; settled ones use the surface layer (never mirrored).
const SAKURA = { spawn: [], list: [], air: null, rest: null, n: 320 };
function buildFallingPetals() {
  if (!SAKURA.spawn.length) return;
  const cv = makeCanvas(64, 64), g = cv.getContext('2d');
  const grd = g.createRadialGradient(32, 58, 2, 32, 28, 34); grd.addColorStop(0, '#f4a8c0'); grd.addColorStop(0.35, '#fcdde6'); grd.addColorStop(1, '#fff4f7');
  g.fillStyle = grd; g.beginPath(); g.moveTo(32, 62); g.bezierCurveTo(60, 46, 62, 12, 42, 3); g.lineTo(32, 11); g.lineTo(22, 3); g.bezierCurveTo(2, 12, 4, 46, 32, 62); g.fill();
  g.strokeStyle = 'rgba(230,150,175,0.35)'; g.lineWidth = 0.7;
  for (let i = -3; i <= 3; i++) { g.beginPath(); g.moveTo(32, 60); g.quadraticCurveTo(32 + i * 5, 34, 32 + i * 7, 10); g.stroke(); }
  const tex = canvasTex(cv);
  // autumn: a palmate maple leaf, tinted per instance
  const lc = makeCanvas(64, 64), lg = lc.getContext('2d'); lg.fillStyle = '#ffffff'; lg.beginPath();
  for (let i = 0; i <= 90; i++) { const a = (i / 90) * Math.PI * 2, lobe = Math.pow(Math.abs(Math.cos(a * 3.5)), 0.6), r = 29 * (0.32 + 0.68 * lobe) * (a > Math.PI * 0.8 && a < Math.PI * 1.2 ? 0.5 : 1); lg.lineTo(32 + Math.sin(a) * r, 32 - Math.cos(a) * r); }
  lg.fill(); lg.strokeStyle = 'rgba(80,30,10,0.45)'; for (let k = 0; k < 7; k++) { const a = (k / 7) * Math.PI * 2; lg.beginPath(); lg.moveTo(32, 32); lg.lineTo(32 + Math.sin(a) * 25, 32 - Math.cos(a) * 25); lg.stroke(); }
  SAKURA.petalTex = tex; SAKURA.leafTex = canvasTex(lc); SAKURA.scale = 1;
  const mat = physical({ map: tex, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.5, sheen: 0.7, sheenColor: new THREE.Color(0xffe4ec), envMapIntensity: 0.6 },
    { key: 'sakurapetal', leaf: true, uniforms: { uTransl: { value: 0.85 } } });
  const geo = new THREE.PlaneGeometry(0.016, 0.018, 2, 2); geo.rotateX(-Math.PI / 2);
  const gp = geo.attributes.position; for (let i = 0; i < gp.count; i++) gp.setY(i, 1.6 * (gp.getX(i) ** 2 + gp.getZ(i) ** 2));   // gently cupped
  geo.computeVertexNormals();
  SAKURA.air = new THREE.InstancedMesh(geo, mat, SAKURA.n); SAKURA.rest = new THREE.InstancedMesh(geo, mat, SAKURA.n);
  for (const m of [SAKURA.air, SAKURA.rest]) { m.frustumCulled = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.receiveShadow = true; }
  SAKURA.air.castShadow = true;
  for (let i = 0; i < SAKURA.n; i++) { SAKURA.air.setColorAt(i, new THREE.Color(1, 1, 1)); SAKURA.rest.setColorAt(i, new THREE.Color(1, 1, 1)); }
  setLayer(SAKURA.air, LAYER.ABOVE); setLayer(SAKURA.rest, LAYER.SURFACE); scene.add(SAKURA.air, SAKURA.rest);
  for (let i = 0; i < SAKURA.n; i++) {
    const q = { p: new THREE.Vector3(), v: new THREE.Vector3(), axis: randDir(), ang: rand() * 6.28, spin: rr(3, 8), ph: rand() * 6.28, s: rr(0.8, 1.25), state: 0, t: 0, yaw: 0 };
    petalRespawn(q);
    // pre-age so the garden already has petals in the air, on the water and on the grass
    const r = rand();
    if (r < 0.45) q.p.y -= rr(0, Math.max(0.1, q.p.y - 0.3));
    else {
      if (r < 0.8) {                                   // already afloat: somewhere on the pond off the tree's shore
        const k = sdf(q.p.x, q.p.z) + rr(0.3, 1.6);
        q.p.x -= sdfGx(q.p.x, q.p.z) * k; q.p.z -= sdfGz(q.p.x, q.p.z) * k;
      }
      settlePetal(q, rr(0, 1));
    }
    SAKURA.list.push(q);
  }
}
function petalRespawn(q) {
  const s = SAKURA.spawn[(rand() * SAKURA.spawn.length) | 0];
  q.p.set(s.x + rr(-0.25, 0.25), s.y + rr(-0.15, 0.1), s.z + rr(-0.25, 0.25)); q.v.set(0, 0, 0);
  q.state = 0; q.t = 0; q.axis.copy(randDir()); q.spin = rr(3, 8);
}
function settlePetal(q, age) {
  const sd = sdf(q.p.x, q.p.z);
  q.state = sd < -0.05 ? 1 : 2;                       // 1 floating on the pond, 2 resting on land
  q.life = q.state === 1 ? rr(35, 60) : rr(18, 35); q.t = age * q.life; q.yaw = rand() * 6.28; q.tilt = rr(-0.25, 0.25);
  if (q.state === 2) q.p.y = ground(q.p.x, q.p.z) + 0.004;
}
const _sm4 = new THREE.Matrix4(), _sq4 = new THREE.Quaternion(), _sq5 = new THREE.Quaternion(), _ss4 = new THREE.Vector3(), _se4 = new THREE.Euler();
const _ZERO_M = new THREE.Matrix4().makeScale(0, 0, 0);
function updateFallingPetals(t, dt) {
  if (!SAKURA.air || dt <= 0 || SAKURA.off) return;
  const wind = P.windSpeed, wx = SH.uWindDir.value.x, wz = SH.uWindDir.value.y, gust = 0.6 + SH.uGust.value;
  for (let i = 0; i < SAKURA.n; i++) {
    const q = SAKURA.list[i];
    if (q.state === 0) {
      // flutter: sinking at ~0.3 m/s with a side-slip that follows the tumble, carried by the breeze
      const flutter = Math.sin(t * 2.3 + q.ph), sway = Math.cos(t * 1.7 + q.ph * 1.3);
      q.v.x = lerp(q.v.x, wx * wind * 0.35 * gust + sway * 0.14, 1 - Math.exp(-dt * 2));
      q.v.z = lerp(q.v.z, wz * wind * 0.35 * gust + flutter * 0.12, 1 - Math.exp(-dt * 2));
      // the cool air over the pond draws a light breeze off the banks: petals near the water drift out over it
      const sd0 = sdf(q.p.x, q.p.z);
      if (sd0 > -0.3 && sd0 < 3.5) { const k = 0.09 * dt; q.v.x -= sdfGx(q.p.x, q.p.z) * k * 1.6; q.v.z -= sdfGz(q.p.x, q.p.z) * k * 1.6; }
      q.v.y = lerp(q.v.y, -0.26 - 0.1 * Math.abs(flutter), 1 - Math.exp(-dt * 3));
      q.p.addScaledVector(q.v, dt); q.ang += q.spin * dt;
      const sd = sdf(q.p.x, q.p.z);
      const floor = sd < -0.05 ? waterHeightAt(q.p.x, q.p.z, t) + 0.002 : ground(q.p.x, q.p.z) + 0.004;
      if (q.p.y <= floor) {
        q.p.y = floor; settlePetal(q, 0);
        if (q.state === 1 && rand() < 0.3) addDrop(q.p.x, q.p.z, 0.025, -0.0006);
      }
      _sq4.setFromAxisAngle(q.axis, q.ang); _ss4.setScalar(q.s * SAKURA.scale);
      SAKURA.air.setMatrixAt(i, _sm4.compose(q.p, _sq4, _ss4)); SAKURA.rest.setMatrixAt(i, _ZERO_M);
    } else {
      q.t += dt;
      if (q.state === 1) {                             // drift with the breeze and ride the waves, then sink away
        q.p.x += wx * wind * 0.02 * dt; q.p.z += wz * wind * 0.02 * dt;
        const sd = sdf(q.p.x, q.p.z); if (sd > -0.08) { q.p.x -= sdfGx(q.p.x, q.p.z) * (sd + 0.08); q.p.z -= sdfGz(q.p.x, q.p.z) * (sd + 0.08); }
        q.p.y = waterHeightAt(q.p.x, q.p.z, t) + 0.0015 - smoothstep(q.life - 4, q.life, q.t) * 0.02;
        q.yaw += dt * 0.05;
      }
      const fade = 1 - smoothstep(q.life - 3, q.life, q.t);
      _se4.set(q.tilt * 0.3, q.yaw, q.tilt * 0.2); _sq4.setFromEuler(_se4); _ss4.setScalar(q.s * SAKURA.scale * Math.max(0.001, fade));
      SAKURA.rest.setMatrixAt(i, _sm4.compose(q.p, _sq4, _ss4)); SAKURA.air.setMatrixAt(i, _ZERO_M);
      if (q.t > q.life) petalRespawn(q);
    }
  }
  SAKURA.air.instanceMatrix.needsUpdate = true; SAKURA.rest.instanceMatrix.needsUpdate = true;
}
const sdfGx = (x, z) => (sdf(x + 0.03, z) - sdf(x - 0.03, z)) / 0.06, sdfGz = (x, z) => (sdf(x, z + 0.03) - sdf(x, z - 0.03)) / 0.06;

// Touch the frog and it leaps to another pad: a short crouch, a ballistic arc with the hind legs kicked straight
// back (a second, leaping body mesh), a landing squash that dips the new pad, then it settles and faces where it went.
const _fj = new THREE.Vector3(), _fj2 = new THREE.Vector3();
function frogHit(ray) {
  if (!FROG.root || FROG.jump || !WORLD.frogPad.mesh.visible) return false;
  FROG.root.getWorldPosition(_fj); _fj.y += 0.025;
  return ray.distanceSqToPoint(_fj) < 0.06 * 0.06 && ray.origin.distanceTo(_fj) < 10;
}
function frogJump() {
  const F = FROG, cur = WORLD.frogPad;
  if (!F.root || F.jump) return;
  const cand = WORLD.lilies.filter((L) => L !== cur && L.r >= 0.13 && Math.hypot(L.mesh.position.x - cur.mesh.position.x, L.mesh.position.z - cur.mesh.position.z) < 1.25);
  if (!cand.length) return;
  // prefer a pad the viewer can see
  camera.getWorldDirection(_fj2);
  cand.sort((a, b) => (rand() - 0.5) * 0.6 - (_fj2.dot(_fj.subVectors(b.mesh.position, camera.position).normalize()) - _fj2.dot(_fj.subVectors(a.mesh.position, camera.position).normalize())));
  const to = cand[0], hasFlower = to.kind === 'flower' || to.kind === 'bud';
  F.root.getWorldPosition(_fj);
  F.jump = { t: 0, to, from: _fj.clone(), lx: hasFlower ? -to.r * 0.3 : rr(-0.03, 0.03), lz: hasFlower ? to.r * 0.2 : rr(-0.03, 0.03), crouch: 0.14 };
  const d = Math.hypot(to.mesh.position.x - _fj.x, to.mesh.position.z - _fj.z);
  F.jump.dur = 0.34 + d * 0.28; F.jump.h = 0.06 + d * 0.22;
  scene.attach(F.root); F.root.rotation.order = 'YZX';
  F.jump.yaw0 = F.root.rotation.y; F.jump.yaw1 = Math.atan2(-(to.mesh.position.z - _fj.z), to.mesh.position.x - _fj.x);
  { const fp = F.root.getWorldPosition(new THREE.Vector3()); splashAt(fp.x, WATER_Y, fp.z, 0.16); }
}
function updateFrogJump(t, dt) {
  const F = FROG, J = F.jump, u = F.mat.userData.uniforms, L = J.to;
  J.t += dt;
  // landing target moves with its pad
  _fj2.set(J.lx, padSurfaceY(L.r, J.lx, J.lz) - 0.0005, J.lz); L.mesh.localToWorld(_fj2);
  let dy = J.yaw1 - J.yaw0; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
  if (J.t < J.crouch) {                                // crouch and turn toward the target
    const k = J.t / J.crouch;
    F.root.rotation.set(0, J.yaw0 + dy * smoothstep(0, 1, k), -0.12 * k);
    F.root.scale.set(1.15, 1.15 * (1 - 0.12 * Math.sin(k * Math.PI * 0.5)), 1.15);
    return;
  }
  const k = clamp((J.t - J.crouch) / J.dur, 0, 1);
  F.root.position.lerpVectors(J.from, _fj2, k); F.root.position.y += J.h * 4 * k * (1 - k);
  F.root.rotation.set(0, J.yaw1, lerp(0.55, -0.45, k));
  const stretch = 0.92 * Math.sin(Math.min(1, k * 1.6) * Math.PI * 0.5) * (1 - smoothstep(0.75, 1, k));
  const air = k > 0.02 && k < 0.9;                    // legs kicked straight back while airborne
  F.body.visible = !air; F.bodyLeap.visible = air;
  F.root.scale.set(1.15 * (1 + 0.1 * stretch), 1.15 * (1 - 0.06 * stretch), 1.15);
  if (k === 0 || J.t - J.crouch < dt) { const fp = J.from; addDrop(fp.x, fp.z, 0.08, -0.004); cur_pad_kick(); }
  if (k >= 1) {
    // land: squash, dip the new pad, ripples, a soft slap
    L.mesh.attach(F.root); F.root.rotation.order = 'XYZ';
    F.body.visible = true; F.bodyLeap.visible = false;
    F.root.scale.setScalar(1.15);
    WORLD.frogPad = L; L.dipT = 0;
    F.baseYaw = J.yaw1; F.yaw = 0; F.yawT = 0; F.shuffleT = rr(6, 12);
    addDrop(_fj2.x, _fj2.z, 0.2, -0.006);
    if (typeof spawnSplash === 'function') spawnSplash(_fj2.x, _fj2.z, 0.25, WATER_Y, true);
    if (typeof audioEvent === 'function') audioEvent('frogLand');
    splashAt(_fj2.x, WATER_Y, _fj2.z, 0.3);
    bubbleBurst(_fj2.x + rr(-0.1, 0.1), WATER_Y - 0.01, _fj2.z + rr(-0.1, 0.1), 8, 0.05, 0.0004, 0.0016, 0.1);
    F.jump = null;
  }
  function cur_pad_kick() { const P0 = WORLD.frogPad; if (P0) P0.dipT = 0; }
}

/* ------------------------------------------------------------------ 9g. DRAGONFLIES */
// Three Japanese pond species: the red aki-akane (Sympetrum), the pruinose-blue shiokara-tombo (Orthetrum) and the
// large green ginyanma (Anax). SDF body (compound eyes, frons, slanted synthorax, ten-segment abdomen, folded legs),
// four veined, iridescent wings with a dark pterostigma. They patrol the pond in darts and hovers, skim the water,
// and (except the hawker Anax) settle on iris bud tips, sunny coping stones and the turtle's rock, taking off if the
// camera comes too close. Perched on a stalk, they ride its wind sway (CPU mirror of the shader wind).
const DRAGON = { list: [], perches: [] };
const DF_SPECIES = [
  { name: 'aki-akane', scale: 1.0, perch: true, speed: 0.8, eye: 0x6a2a1a },
  { name: 'aki-akane', scale: 0.95, perch: true, speed: 0.75, eye: 0x6a2a1a },
  { name: 'shiokara-tombo', scale: 1.25, perch: true, speed: 0.9, eye: 0x2a5a6a },
  { name: 'ginyanma', scale: 1.7, perch: false, speed: 1.3, eye: 0x3a7a5a },
];
function windOffsetJS(p, w, out) {
  // mirror of windOffset() in UW_VS_PARS
  const t = SH.uTime.value, wd = SH.uWindDir.value, uW = SH.uWind.value, uG = SH.uGust.value;
  const ph = (p.x * wd.x + p.z * wd.y) * 0.35;
  const gustWave = 0.55 + 0.45 * Math.sin(t * 0.9 - ph * 1.3) * Math.sin(t * 0.37 - ph * 0.6 + 1.7);
  const sway = Math.sin(t * 1.25 + ph + p.y * 0.3) * 0.55 + Math.sin(t * 2.3 + ph * 1.7) * 0.25;
  const amp = uW * (0.35 + uG * gustWave);
  const ox = wd.x * (amp * 0.6 + amp * 0.5 * sway) * w, oz = wd.y * (amp * 0.6 + amp * 0.5 * sway) * w;
  const fr = (p.x * 3.1) - Math.floor(p.x * 3.1);
  const fl = Math.sin(t * (6.5 + fr * 3.0) + p.x * 4.1 + p.y * 3.3 + p.z * 5.7) * 0.018 * (0.3 + uW) * w;
  return out.set(ox + fl, -Math.abs(ox + oz) * 0.18 * w + fl * 0.6, oz - fl);
}
function dragonflySDF() {
  const S = SDFK, P3 = [0, 0, 0];
  return (p) => {
    const x = p[0], y = p[1], z = Math.abs(p[2]); P3[0] = x; P3[1] = y; P3[2] = z;
    // head: frons and face between the eyes (the eyes themselves are separate glossy spheres)
    let d = S.ellipsoid(P3, [0.0096, -0.0006, 0], [0.0024, 0.0028, 0.0036]);
    d = S.smin(d, S.sphere(P3, [0.0071, 0.0, 0], 0.0019), 0.001);                                   // prothorax
    // synthorax, slanted back
    const c = Math.cos(0.45), s = Math.sin(0.45), tx = x - 0.0018, ty = y + 0.0003;
    d = S.smin(d, S.ellipsoid([tx * c - ty * s, tx * s + ty * c, z], [0, 0, 0], [0.0052, 0.0046, 0.0036]), 0.0012);
    // abdomen: ten segments with intersegmental grooves, swollen S1-3, slender middle, slight club at S7-8
    const ax = -0.0035, L = 0.03;
    if (x < ax + 0.002) {
      const u = clamp((ax - x) / L, 0, 1);
      const r = (0.0021 * (1 - smoothstep(0.0, 0.22, u)) + 0.00135 + 0.00032 * Math.exp(-(((u - 0.74) / 0.1) ** 2))) * (1 - 0.35 * smoothstep(0.9, 1.0, u));
      const seg = u * 10, groove = Math.exp(-(((seg - Math.round(seg)) / 0.09) ** 2)) * (u > 0.02 ? 1 : 0);
      const cy = -0.0004 - 0.0016 * u * u;                                                           // droops a little toward the tip
      const da = Math.hypot(y - cy, z) - r * (1 - 0.1 * groove);
      const cap = Math.max(x - (ax + 0.002), ax - L - x);                                             // ends
      d = S.smin(d, Math.max(da, cap), 0.0014);
    }
    // anal appendages
    d = S.smin(d, S.cone(P3, [-0.0335, -0.002, 0.0004], [-0.0365, -0.0022, 0.0009], 0.0004, 0.00022), 0.0003);
    // six legs folded forward under the thorax, spiny
    for (const [lx, a] of [[0.0048, 0.55], [0.0022, 0.35], [-0.0004, 0.15]]) {
      const hip = [lx, -0.0032, 0.0012], knee = [lx + 0.0035 * Math.cos(a), -0.0068, 0.0032], foot = [lx + 0.0062, -0.0084, 0.0022];
      d = S.smin(d, S.cone(P3, hip, knee, 0.00045, 0.0003), 0.0004);
      d = S.smin(d, S.cone(P3, knee, foot, 0.0003, 0.00016), 0.0002);
    }
    return d;
  };
}
const DF_VS = 'varying vec3 vDL;\n';
const DF_FS_PARS = /* glsl */`
varying vec3 vDL;
uniform float uSp;
float dh(float n){ return fract(sin(n) * 43758.5453); }
`;
const DF_MAP = /* glsl */`
vec3 p = vDL;
float abd = step(p.x, -0.003);
float u = clamp((-0.0035 - p.x) / 0.03, 0.0, 1.0);
float seg = u * 10.0, fs = fract(seg);
float ring = 1.0 - smoothstep(0.0, 0.12, min(fs, 1.0 - fs));
float top = smoothstep(-0.0015, 0.0012, p.y);
float legs = step(p.y, -0.0034) * step(-0.002, p.x);
vec3 col;
if (uSp < 0.5) {             // aki-akane: scarlet abdomen with dark segment lines and a black lateral keel, red-brown thorax
  vec3 abdC = mix(vec3(0.62, 0.1, 0.06), vec3(0.78, 0.16, 0.08), top);
  abdC = mix(abdC, vec3(0.12, 0.03, 0.02), clamp(ring * 0.7 + (1.0 - smoothstep(0.0, 0.0006, abs(p.y + 0.0006 + 0.0014 * u * u))) * step(0.3, u) * 0.5, 0.0, 1.0));
  vec3 thC = mix(vec3(0.42, 0.16, 0.08), vec3(0.6, 0.26, 0.12), top);
  thC = mix(thC, vec3(0.08, 0.04, 0.03), smoothstep(0.7, 0.9, sin(p.x * 2200.0 + p.y * 1600.0)) * 0.6);
  col = mix(thC, abdC, abd);
  col = mix(col, vec3(0.75, 0.3, 0.16), step(0.0075, p.x) * 0.8);                              // red face
} else if (uSp < 1.5) {      // shiokara-tombo: pale blue-grey bloom on S1-7, black S8-10, dark thorax
  vec3 abdC = mix(vec3(0.3, 0.37, 0.43), vec3(0.46, 0.54, 0.62), top);
  abdC = mix(abdC, vec3(0.05, 0.05, 0.06), clamp(smoothstep(0.66, 0.72, u) + ring * 0.35, 0.0, 1.0));
  vec3 thC = mix(vec3(0.12, 0.12, 0.1), vec3(0.34, 0.38, 0.42), top * 0.6);
  col = mix(thC, abdC, abd);
  col = mix(col, vec3(0.62, 0.62, 0.58), step(0.985, u));                                           // pale appendages
} else {                     // ginyanma: grass-green thorax, sky-blue S2, brown abdomen with dark dorsal marks
  vec3 thC = mix(vec3(0.32, 0.55, 0.14), vec3(0.5, 0.72, 0.2), top);
  vec3 abdC = mix(vec3(0.34, 0.24, 0.14), vec3(0.5, 0.36, 0.2), top);
  abdC = mix(abdC, vec3(0.2, 0.55, 0.78), (1.0 - smoothstep(0.08, 0.2, u)));
  abdC = mix(abdC, vec3(0.08, 0.06, 0.04), clamp(ring * 0.6 + smoothstep(0.6, 0.9, sin(fs * 6.2832) * top) * 0.5, 0.0, 1.0) * step(0.2, u));
  col = mix(thC, abdC, abd);
  col = mix(col, vec3(0.45, 0.62, 0.3), step(0.0075, p.x));
}
col = mix(col, vec3(0.05, 0.04, 0.035), legs);
diffuseColor.rgb = pow(clamp(col, 0.0, 1.0), vec3(2.2));
`;
function dragonflyWingTex(hind, amber) {
  // span along x (root at left), chord along y (leading edge at the top); membrane faint, veins dark, pterostigma
  const W = 512, H = 128, cv = makeCanvas(W, H), g = cv.getContext('2d');
  const R = mulberry32(hind ? 91 : 57);
  const outline = new Path2D();
  const chordAt = (t) => (hind ? 0.46 + 0.5 * Math.exp(-(((t - 0.18) / 0.22) ** 2)) : 0.42 + 0.12 * Math.sin(Math.PI * Math.min(1, t * 1.2))) * Math.sqrt(Math.max(0, 1 - Math.pow(t, 6)));
  outline.moveTo(0, 18);
  for (let i = 0; i <= 64; i++) { const t = i / 64; outline.lineTo(t * W, 14 + (1 - t) * 4); }
  for (let i = 64; i >= 0; i--) { const t = i / 64; outline.lineTo(t * W, 14 + chordAt(t) * (H - 20)); }
  outline.closePath();
  g.save(); g.clip(outline);
  const base = g.createLinearGradient(0, 0, W, 0);
  base.addColorStop(0, amber ? 'rgba(200,120,30,0.5)' : 'rgba(170,180,190,0.14)'); base.addColorStop(0.16, 'rgba(180,188,198,0.07)'); base.addColorStop(1, 'rgba(190,196,206,0.05)');
  g.fillStyle = base; g.fillRect(0, 0, W, H);
  // crossvein network: irregular cells, finer toward the trailing edge and the tip
  g.strokeStyle = 'rgba(30,26,22,0.55)'; g.lineWidth = 0.8;
  for (let i = 0; i < 520; i++) {
    const x = R() * W, y = 14 + R() * (H - 14), l = 4 + R() * 7;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + (R() - 0.5) * 3, y + l); g.stroke();
  }
  for (let k = 0; k < 9; k++) {                               // longitudinal veins
    const y0 = 16 + k * (H - 30) / 9;
    g.strokeStyle = `rgba(25,20,16,${0.75 - k * 0.05})`; g.lineWidth = k < 2 ? 2.2 : 1.1;
    g.beginPath(); g.moveTo(0, 17 + k * 2); g.quadraticCurveTo(W * 0.4, y0 + k * 1.5, W, 16 + k * 5 * (hind ? 1.2 : 1)); g.stroke();
  }
  g.fillStyle = 'rgba(25,18,12,0.95)'; g.fillRect(W * 0.84, 14, W * 0.07, 7);            // pterostigma
  g.fillStyle = 'rgba(30,22,16,0.9)'; g.fillRect(W * 0.52, 14, 3, 9);                    // nodus
  g.restore();
  g.strokeStyle = 'rgba(20,16,12,0.9)'; g.lineWidth = 1.2; g.stroke(outline);
  const t = canvasTex(cv); t.anisotropy = 4; return t;
}
function buildDragonflies() {
  // perches: iris bud tips (sway with the wind), sunny coping stones, the turtle's rock
  for (const b of IRIS.buds || []) DRAGON.perches.push({ p: b.p.clone().addScaledVector(b.t, 0.092), stalk: true, yawFree: true });
  for (let s = 0.05; s < 0.7; s += 0.035) { const sh = shoreAt(s * POLY_LEN); DRAGON.perches.push({ p: new THREE.Vector3(sh.x + sh.nx * 0.12, 0.181, sh.z + sh.nz * 0.12), stone: true, yaw: Math.atan2(sh.nz, -sh.nx) }); }
  if (TURTLE.B) DRAGON.perches.push({ p: TURTLE.B.clone().add(new THREE.Vector3(0.1, 0.012, -0.12)), stone: true, rock: true });
  const geo = surfaceNets(dragonflySDF(), [-0.039, -0.0105, -0.0062], [0.0135, 0.0062, 0.0062], 0.00022);
  const eyeGeo = new THREE.SphereGeometry(0.0031, 20, 14);
  const wingFore = [dragonflyWingTex(false, false), dragonflyWingTex(false, true)], wingHind = [dragonflyWingTex(true, false), dragonflyWingTex(true, true)];
  const wingGeo = (span, chord) => { const g = new THREE.PlaneGeometry(span, chord, 6, 2); g.translate(span / 2, -chord / 2 + chord * 0.08, 0); g.rotateX(-Math.PI / 2); return g; };   // root at the origin, span along +x, lying flat
  DF_SPECIES.forEach((sp, i) => {
    const bodyMat = physical({ roughness: 0.4, clearcoat: 0.45, clearcoatRoughness: 0.25, envMapIntensity: 0.8 }, {
      key: 'dfbody', uniforms: { uSp: { value: sp.name === 'aki-akane' ? 0 : sp.name === 'shiokara-tombo' ? 1 : 2 } }, vsPars: DF_VS, vsBegin: 'vDL = position;', fsPars: DF_FS_PARS, fsMap: DF_MAP });
    const eyeMat = physical({ color: sp.eye, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.05, iridescence: 0.5, iridescenceIOR: 1.4, envMapIntensity: 1.5 }, { key: 'dfeye' });
    const amber = sp.name === 'aki-akane' ? 1 : 0;
    const mkWingMat = (tex) => physical({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide, roughness: 0.1, metalness: 0, iridescence: 0.7, iridescenceIOR: 1.3,
      iridescenceThicknessRange: [250, 650], envMapIntensity: 0.55, specularIntensity: 0.6 }, { key: 'dfwing' });
    const root = new THREE.Group(), body = new THREE.Group();
    const bm = new THREE.Mesh(geo, bodyMat); bm.castShadow = true; body.add(bm);
    for (const s of [1, -1]) { const e = new THREE.Mesh(eyeGeo, eyeMat); e.position.set(0.0086, 0.0014, s * 0.0027); e.scale.set(1, 1.05, 0.95); body.add(e); }
    const wings = [];
    const span = 0.029, chord = 0.0075;
    for (const [hind, s] of [[0, 1], [0, -1], [1, 1], [1, -1]]) {
      const hinge = new THREE.Group(); hinge.position.set(hind ? -0.0006 : 0.0026, 0.0042, s * 0.0008);
      const m = new THREE.Mesh(wingGeo(hind ? span * 0.96 : span, hind ? chord * 1.25 : chord), mkWingMat(hind ? wingHind[amber] : wingFore[amber]));
      m.rotation.y = -s * Math.PI / 2;                                  // span out to the side (+z right / -z left)
      if (s < 0) m.scale.z = -1;
      m.renderOrder = 3; hinge.add(m); body.add(hinge);
      wings.push({ hinge, hind, s, mat: m.material });
    }
    root.add(body); root.scale.setScalar(sp.scale);
    setLayer(root, LAYER.ABOVE); scene.add(root);
    let x, z, g = 0; do { x = rr(-2.5, 2.5); z = rr(-4.5, 4.5); } while (sdf(x, z) > -0.3 && g++ < 50);
    DRAGON.list.push({ sp, root, body, wings, p: new THREE.Vector3(x, WATER_Y + rr(0.3, 0.8), z), v: new THREE.Vector3(), target: new THREE.Vector3(), state: 'fly', timer: rr(0.5, 3),
      legs: 0, yaw: rand() * 6.28, pitch: 0, roll: 0, flap: rand() * 6, hops: 0, perch: null, cool: rr(4, 12) });
  });
}
const _dv = new THREE.Vector3(), _dw = new THREE.Vector3(), _dq = new THREE.Quaternion();
function dfNewTarget(D) {
  const over = rand() < 0.8;
  let x, z, g = 0;
  do { x = D.p.x + rr(-2.2, 2.2); z = D.p.z + rr(-2.2, 2.2); } while ((over ? sdf(x, z) > -0.2 : sdf(x, z) > 1.5) && g++ < 40);
  if (g >= 40) { x = rr(-2, 2); z = rr(-4, 4); }
  const skim = rand() < 0.3;
  D.target.set(x, WATER_Y + (skim ? rr(0.06, 0.14) : rr(0.25, 1.1)), z);
  if (Math.abs(z - BRIDGE.z) < 1.0 && Math.abs(x) < BRIDGE.half + 0.3) D.target.z = BRIDGE.z + Math.sign(z - BRIDGE.z || 1) * 1.2;   // not under the bridge deck
}
function updateDragonflies(t, dt) {
  if (!DRAGON.list.length || dt <= 0 || DRAGON.off) return;
  for (const D of DRAGON.list) {
    D.timer -= dt; D.cool -= dt;
    const camD = camera.position.distanceTo(D.p);
    if (D.state === 'fly' || D.state === 'hover') {
      if (D.state === 'fly') {
        _dv.subVectors(D.target, D.p); const dist = _dv.length();
        const spd = D.sp.speed * (dist > 0.6 ? 1 : 0.4 + dist);
        _dv.normalize().multiplyScalar(spd);
        const acc = 3.5 * D.sp.scale;
        _dw.subVectors(_dv, D.v); const dl = _dw.length(); if (dl > acc * dt) _dw.multiplyScalar(acc * dt / dl);
        D.v.add(_dw);
        if (dist < 0.12) { D.state = 'hover'; D.timer = rr(0.4, 1.8); D.hops++; }
      } else {
        D.v.multiplyScalar(Math.exp(-dt * 6));
        D.v.x += rr(-1, 1) * dt * 0.8; D.v.y += rr(-1, 1) * dt * 0.5; D.v.z += rr(-1, 1) * dt * 0.8;
        if (D.timer < 0) {
          if (D.sp.perch && D.hops > 3 && D.cool < 0 && DRAGON.perches.length) {
            // pick a free perch within reach
            const cand = DRAGON.perches.filter((q) => !q.busy && q.p.distanceTo(D.p) < 4 && !(q.rock && TURTLE.pos.distanceTo(q.p) < 0.25));
            if (cand.length) { D.perch = cand[(rand() * cand.length) | 0]; D.perch.busy = true; D.state = 'approach'; D.hops = 0; continue; }
          }
          D.state = 'fly'; dfNewTarget(D);
        }
      }
      D.p.addScaledVector(D.v, dt);
      // never into the water or the ground
      const floor = sdf(D.p.x, D.p.z) < 0 ? WATER_Y + 0.04 : ground(D.p.x, D.p.z) + 0.15;
      if (D.p.y < floor) { D.p.y = floor; D.v.y = Math.abs(D.v.y) * 0.3; }
      if (D.p.y > 2.2) D.v.y -= dt * 2;
      if (Math.abs(D.p.z - BRIDGE.z) < BRIDGE.width / 2 + 0.25 && Math.abs(D.p.x) < BRIDGE.half + 0.2 && D.p.y < 1.45) D.v.y += dt * 4;   // hop over the bridge
      if (D.state === 'fly' && D.v.lengthSq() > 0.01) {
        const yw = Math.atan2(-D.v.z, D.v.x); let dy = yw - D.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
        D.yaw += dy * (1 - Math.exp(-dt * 10)); D.roll = lerp(D.roll, clamp(-dy * 2, -0.6, 0.6), 1 - Math.exp(-dt * 8));
        D.pitch = lerp(D.pitch, clamp(D.v.y * 0.6, -0.4, 0.4), 1 - Math.exp(-dt * 6));
      } else { D.roll = lerp(D.roll, 0, 1 - Math.exp(-dt * 5)); D.pitch = lerp(D.pitch, 0.12, 1 - Math.exp(-dt * 5)); }
    } else if (D.state === 'approach' || D.state === 'perch') {
      const q = D.perch; _dw.copy(q.p);
      if (q.stalk) _dw.add(windOffsetJS(q.p, Math.pow(clamp((q.p.y - WATER_Y) / 0.9, 0, 1), 1.5) * 0.5, _dv));
      _dw.y += 0.0078 * D.sp.scale;                                   // legs on the perch, not the body
      if (D.state === 'approach') {
        _dv.subVectors(_dw, D.p); const dist = _dv.length();
        const spd = Math.min(D.sp.speed, 0.15 + dist * 2);
        D.v.lerp(_dv.normalize().multiplyScalar(spd), 1 - Math.exp(-dt * 6));
        D.p.addScaledVector(D.v, dt);
        const yw = Math.atan2(-D.v.z, D.v.x); let dy = yw - D.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
        if (dist > 0.05) D.yaw += dy * (1 - Math.exp(-dt * 8));
        D.pitch = lerp(D.pitch, 0, 1 - Math.exp(-dt * 5)); D.roll = lerp(D.roll, 0, 1 - Math.exp(-dt * 5));
        if (dist < 0.01) { D.state = 'perch'; D.timer = rr(5, 14); D.v.set(0, 0, 0); }
      } else {
        D.p.lerp(_dw, 1 - Math.exp(-dt * 20));
        D.pitch = lerp(D.pitch, q.stalk ? 0.18 : 0.0, 1 - Math.exp(-dt * 4)); D.roll = lerp(D.roll, 0, 1 - Math.exp(-dt * 4));
        if (rand() < dt * 0.4) D.yaw += rr(-0.4, 0.4);                  // shuffles to face the sun
        if (D.timer < 0 || camD < 0.12) { q.busy = false; D.perch = null; D.state = 'fly'; D.cool = rr(10, 25); dfNewTarget(D); D.v.set(0, 1.2, 0).add(_dv.set(rr(-0.4, 0.4), 0, rr(-0.4, 0.4))); }
      }
    }
    D.root.position.copy(D.p);
    D.root.rotation.set(D.roll, D.yaw, D.pitch, 'YZX');
    // wings: a blur of fast strokes in flight (fore and hind out of phase), still when perched
    const flying = D.state !== 'perch';
    D.flap += dt * (flying ? 2 * Math.PI * 27 : 0);
    for (const w of D.wings) {
      let a;
      if (flying) a = 0.18 + 0.75 * Math.sin(D.flap + (w.hind ? 1.6 : 0));
      else a = D.sp.name === 'aki-akane' ? -0.12 : -0.03;                 // resting: level, the red darter's tilted slightly down and forward
      const sweep = flying ? 0 : (w.hind ? -0.12 : D.sp.name === 'aki-akane' ? 0.35 : 0.12);
      w.hinge.rotation.set(-w.s * a, w.s * sweep, 0, 'XYZ');
      w.mat.opacity = flying ? 0.55 : 1;
    }
  }
}

/* ------------------------------------------------------------------ 9c. WATERFALL, STONE LANTERNS, PETALS, MOUNTAINS */
// A small two-tier cascade on the upper-left bank (as in classic Japanese stroll gardens): a spring pool on a mossy
// mound, a first lip stone into a middle basin, a second lip into the pond. Local frame: a = into the pond, b = along shore.
const WF = { site: null, sheets: [], pools: [], impacts: [] };
function setupWaterfallSite() {
  let best = null, bd = 1e9;
  for (let s = 0; s < POLY_LEN; s += 0.04) { const sh = shoreAt(s); const d = Math.hypot(sh.x + 3.25, sh.z + 2.05); if (d < bd) { bd = d; best = sh; } }
  WF.site = best;
}
function wfMound(x, z) {
  const S = WF.site; if (!S) return 0;
  const cx = S.x + S.nx * 2.0, cz = S.z + S.nz * 2.0, d = Math.hypot(x - cx, z - cz);   // peak rises behind the spring pool
  return 0.8 * Math.exp(-((d / 1.3) ** 2));
}
function wfWorld(a, b, y) { const S = WF.site; return new THREE.Vector3(S.x - S.nx * a + S.tx * b, y, S.z - S.nz * a + S.tz * b); }
function nearWaterfall(x, z, r) { const S = WF.site; return S && Math.hypot(x - S.x, z - S.z) < r; }

const FALL_VS = /* glsl */`
varying vec2 vUv;
varying vec3 vWPos;
varying vec3 vN;
void main(){ vUv = uv; vec4 wp = modelMatrix * vec4(position, 1.0); vWPos = wp.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * wp; }`;
const FALL_FS = /* glsl */`
// === FALLING WATER SHEET: fast streaks scrolling down the sheet, ragged translucent edges, white water at the
//     lip and the impact, sky reflection by Fresnel and sparkling sun highlights
uniform float uTime;
uniform float uSpeed;
uniform float uSeed;
uniform sampler2D tNoise;
uniform samplerCube tSky;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uAmbient;
varying vec2 vUv;
varying vec3 vWPos;
varying vec3 vN;
void main(){
  float u = vUv.x, v = vUv.y, sp = uTime * uSpeed;
  // stretched noise = individual threads of falling water
  float s1 = texture2D(tNoise, vec2(u * 3.1 + uSeed, v * 0.35 - sp)).r;
  float s2 = texture2D(tNoise, vec2(u * 7.3 + uSeed * 2.0, v * 0.6 - sp * 1.4)).g;
  float s3 = texture2D(tNoise, vec2(u * 17.0 + uSeed * 3.0, v * 1.2 - sp * 2.0)).r;
  float strand = s1 * 0.45 + s2 * 0.35 + s3 * 0.2;
  float aer = smoothstep(0.06, 0.75, v);                                  // glassy at the lip, aerated lower down
  float edge = smoothstep(0.0, 0.14 + 0.1 * s2, u) * smoothstep(1.0, 0.86 - 0.1 * s1, u);
  float gaps = smoothstep(0.3 - 0.08 * aer, 0.52, strand + (1.0 - aer) * 0.3);   // the sheet tears into strands as it falls
  vec3 V = normalize(cameraPosition - vWPos), N = normalize(vN) * (gl_FrontFacing ? 1.0 : -1.0);
  N = normalize(N + vec3((s2 - 0.5) * 0.35, 0.0, (s3 - 0.5) * 0.35));
  float F = 0.04 + 0.96 * pow(1.0 - abs(dot(N, V)), 5.0);
  vec3 refl = textureCube(tSky, reflect(-V, N)).rgb;
  vec3 H = normalize(uSunDir + V);
  vec3 glass = mix(vec3(0.05, 0.085, 0.08) * uAmbient * 2.4, refl * 0.9, F) + uSunColor * pow(max(dot(N, H), 0.0), 140.0) * 0.9;
  vec3 white = vec3(0.93, 0.96, 0.96) * (uAmbient * 1.2 + uSunColor * 0.14) * (0.82 + 0.28 * s3);
  float whiteK = clamp(aer * (0.4 + 0.75 * smoothstep(0.45, 0.8, strand)) + smoothstep(0.86, 1.0, v) * 0.6 + (1.0 - smoothstep(0.0, 0.05, v)) * 0.45, 0.0, 1.0);
  vec3 col = mix(glass, white, whiteK);
  float alpha = mix(0.5, 0.93, whiteK) * gaps * edge;
  if (alpha < 0.02) discard;
  gl_FragColor = vec4(col, alpha);
}`;
const POOLFOAM_FS = /* glsl */`
// === SMALL POOL / IMPACT FOAM: reflective dark water with churning foam rings around where the water lands
uniform float uTime;
uniform sampler2D tNoise;
uniform samplerCube tSky;
uniform vec3 uAmbient;
uniform vec3 uSunColor;
uniform float uFoamOnly;
uniform vec2 uImpact;      // impact point in uv space
varying vec2 vUv;
varying vec3 vWPos;
varying vec3 vN;
void main(){
  vec2 d = vUv - uImpact; float r = length(d);
  vec2 dir = d / max(r, 1e-3);
  // foam is carried outward from the plunge point and breaks up as it spreads (cartesian noise: no radial streaks)
  float n1 = texture2D(tNoise, (vUv - dir * fract(uTime * 0.12) * 0.25) * 4.0 + uTime * 0.02).r;
  float n2 = texture2D(tNoise, (vUv - dir * fract(uTime * 0.12 + 0.5) * 0.25) * 4.0 - uTime * 0.02 + 0.37).r;
  float bl = abs(fract(uTime * 0.12) - 0.5) * 2.0;
  float n3 = texture2D(tNoise, vUv * 10.0 - uTime * 0.06).g;
  float n = mix(n1, n2, bl) * 0.65 + n3 * 0.35;
  float core = 1.0 - smoothstep(0.0, 0.26, r);
  float foam = smoothstep(0.52, 0.74, n + core * 0.6) * (1.0 - smoothstep(0.16, 0.46, r));
  foam = max(foam, core * core * 0.9);
  float bub = smoothstep(0.84, 0.92, texture2D(tNoise, vUv * 26.0 + vec2(uTime * 0.11, -uTime * 0.07)).r) * (1.0 - smoothstep(0.15, 0.4, r));
  foam = clamp(foam + bub * 0.5, 0.0, 1.0);
  vec2 ripple = dir * sin(r * 70.0 - uTime * 11.0) * 0.03 * (1.0 - smoothstep(0.05, 0.5, r));
  vec3 N = normalize(vec3(ripple.x + (n - 0.5) * 0.15, 1.0, ripple.y));
  vec3 V = normalize(cameraPosition - vWPos);
  float F = 0.02 + 0.98 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
  vec3 col = mix(vec3(0.012, 0.03, 0.028) * uAmbient * 3.0, textureCube(tSky, reflect(-V, N)).rgb * 0.35, F);
  col = mix(col, vec3(0.9, 0.93, 0.93) * (uAmbient * 1.1 + uSunColor * 0.1), foam);
  float edgeA = 1.0 - smoothstep(0.42, 0.5, length(vUv - 0.5));
  float alpha = uFoamOnly > 0.5 ? foam * 0.6 * edgeA : edgeA;
  if (alpha < 0.01) discard;
  gl_FragColor = vec4(col, alpha);
}`;
function buildWaterfall() {
  const S = WF.site;
  const rockM = rockMaterial(TEX.boulder, { key: 'wfrock', scale: 0.9, moss: 0.55, rough: 0.8, nrm: 1.4, tint: 0xa8a296 });
  const variants = [0, 1, 2, 3].map((i) => (i < 2 ? rockGeo(i * 5.3 + 11, 4, -0.35, 1) : rockGeo(i * 5.3 + 11, 5, -0.35, 0.45, false)));
  const lists = [[], [], [], []];
  const Q = new THREE.Quaternion(), E = new THREE.Euler(), yaw = Math.atan2(S.nz, -S.nx);
  const stone = (a, b, y, sx, sy, sz, rx = 0, rz = 0) => {
    const p = wfWorld(a, b, y); E.set(rx + rr(-0.05, 0.05), yaw + rr(-0.25, 0.25), rz + rr(-0.05, 0.05), 'YXZ'); Q.setFromEuler(E);
    lists[sy < 0.12 ? (rand() * 2) | 0 : 2 + ((rand() * 2) | 0)].push(new THREE.Matrix4().compose(p, Q, new THREE.Vector3(sx, sy, sz)));   // flat slabs only where water runs over them
  };
  // lower tier: lip slab, the face behind the sheet, flanking stones
  stone(-0.06, 0, 0.27, 0.27, 0.065, 0.3, 0, 0.08); stone(-0.2, 0, 0.08, 0.24, 0.26, 0.34);
  for (const sd of [1, -1]) { stone(-0.02, sd * 0.36, 0.1, 0.27, 0.3, 0.24); stone(-0.3, sd * 0.44, 0.22, 0.3, 0.36, 0.3); stone(0.12, sd * 0.52, 0.02, 0.22, 0.18, 0.2); }
  // middle basin floor and the upper tier
  stone(-0.32, 0, 0.19, 0.34, 0.1, 0.34); stone(-0.57, 0, 0.61, 0.21, 0.055, 0.24, 0, 0.06); stone(-0.7, 0, 0.4, 0.22, 0.3, 0.3);
  for (const sd of [1, -1]) { stone(-0.55, sd * 0.31, 0.5, 0.24, 0.34, 0.22); stone(-0.88, sd * 0.36, 0.6, 0.3, 0.34, 0.28); }
  // spring pool bed and the stones behind it
  stone(-0.97, 0, 0.55, 0.4, 0.1, 0.26); stone(-1.38, 0, 0.62, 0.36, 0.26, 0.42); stone(-1.15, 0.32, 0.72, 0.22, 0.2, 0.2); stone(-1.2, -0.3, 0.68, 0.25, 0.22, 0.2);
  for (let i = 0; i < 4; i++) { const wm = instanced(variants[i], rockM, lists[i], LAYER.BOTH); (WORLD.solids = WORLD.solids || []).push(wm); addMossShells(wm, 0.6, 6, 0.012); }
  // pools
  const poolMat = (foamOnly, impact) => new THREE.ShaderMaterial({ vertexShader: FALL_VS, fragmentShader: POOLFOAM_FS, transparent: true, depthWrite: !foamOnly,
    uniforms: { uTime: SH.uTime, tNoise: { value: TEX.waterNormal }, tSky: { value: cubeRT.texture }, uAmbient: { value: new THREE.Color() }, uSunColor: SH.uSunColor, uFoamOnly: { value: foamOnly ? 1 : 0 }, uImpact: { value: new THREE.Vector2(...impact) } } });
  const pool = (a0, a1, hw, y, impactA, foamOnly = false, layer = LAYER.ABOVE) => {
    const g = new THREE.CircleGeometry(0.5, 40); g.rotateX(-Math.PI / 2); g.scale(a1 - a0, 1, hw * 2);
    const m = new THREE.Mesh(g, poolMat(foamOnly, [0.5, 0.5 + (impactA - (a0 + a1) / 2) / (a1 - a0)]));
    const c = wfWorld((a0 + a1) / 2, 0, y); m.position.copy(c); m.rotation.y = yaw; m.renderOrder = 3;
    setLayer(m, layer); scene.add(m); WF.pools.push(m); return m;
  };
  pool(-1.2, -0.6, 0.17, 0.668, -0.9);
  pool(-0.48, -0.14, 0.17, 0.312, -0.45);
  pool(-0.25, 0.55, 0.42, WATER_Y + 0.004, 0.12, true, LAYER.SURFACE);          // impact foam on the pond
  // falling sheets (ballistic arcs), slightly bowed across their width
  const sheet = (aLip, yLip, yBase, width, vx) => {
    const T = Math.sqrt(2 * (yLip - yBase) / 9.81), nu = 10, nv = 16, pos = [], uv = [], idx = [];
    for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
      const v = j / nv, u = i / nu, tt = v * T, bw = width * (1 + 0.25 * v) * (u - 0.5);
      const a = aLip + vx * tt + 0.012 * Math.sin(u * Math.PI), y = yLip - 0.5 * 9.81 * tt * tt;
      const p = wfWorld(a, bw, y); pos.push(p.x, p.y, p.z); uv.push(u, v);
    }
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { const q = j * (nu + 1) + i; idx.push(q, q + nu + 1, q + 1, q + 1, q + nu + 1, q + nu + 2); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
    const m = new THREE.Mesh(g, new THREE.ShaderMaterial({ vertexShader: FALL_VS, fragmentShader: FALL_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      uniforms: { uTime: SH.uTime, uSpeed: { value: 1.6 + rand() * 0.4 }, uSeed: { value: rand() }, tNoise: { value: TEX.waterNormal }, tSky: { value: cubeRT.texture }, uSunDir: SH.uSunDir, uSunColor: SH.uSunColor, uAmbient: { value: new THREE.Color() } } }));
    m.renderOrder = 4; setLayer(m, LAYER.ABOVE); scene.add(m); WF.sheets.push(m);
    WF.impacts.push({ p: wfWorld(aLip + vx * T, 0, yBase), pond: yBase < 0.05 });
  };
  sheet(-0.57, 0.672, 0.338, 0.17, 0.34);
  sheet(-0.03, 0.338, WATER_Y, 0.26, 0.45);
  WF.mistT = 0;
}
function updateWaterfall(t, dt) {
  if (!WF.site) return;
  const amb = new THREE.Color().copy(SH.uSunColor.value).multiplyScalar(0.18).add(new THREE.Color(0.25, 0.28, 0.3).multiplyScalar(skyUniforms.uCloudBright.value * 0.6));
  for (const m of WF.sheets.concat(WF.pools)) m.material.uniforms.uAmbient.value.copy(amb);
  if (dt <= 0) return;
  // the lower fall keeps stirring the pond: ripples, a little mist
  const imp = WF.impacts[1];
  if (imp && rand() < 0.7) addDrop(imp.p.x + rr(-0.08, 0.08), imp.p.z + rr(-0.08, 0.08), 0.06, rr(-0.004, -0.0015));
  WF.mistT -= dt;
  if (WF.mistT < 0) { WF.mistT = 0.06; for (const I of WF.impacts) spawnSplash(I.p.x + rr(-0.06, 0.06), I.p.z + rr(-0.06, 0.06), I.pond ? 0.28 : 0.2, I.p.y, true); }
}

// Kasuga-style stone lanterns (tōrō): pedestal, post, platform, light box with openings, curved cap, jewel finial
const LANTERNS = [];
const LAMPS = { lights: [], heads: [] };
// 校园庭院灯（深灰金属灯杆 + 乳白灯罩，夜晚亮起并照亮周围）与木质长椅，替代原日式石灯笼
function buildLanterns() {
  const metal = physical({ color: 0x2a2f33, roughness: 0.45, metalness: 0.7, envMapIntensity: 0.8 }, { key: 'lampmetal' });
  const glow = new THREE.MeshBasicMaterial({ color: 0xffd9a0 });
  const spots = (window.CAMPUS_POND.lampSpots || [[-4.3, -3.3], [3.65, -6.9], [3.2, 5.6], [-3.6, 5.2]]).filter(([x, z]) => sdf(x, z) > 0.5);
  spots.forEach(([x, z], i) => {
    const gy = terrainHeight(x, z), parts = [];
    parts.push(new THREE.CylinderGeometry(0.11, 0.13, 0.12, 16).translate(0, 0.06, 0));
    parts.push(new THREE.CylinderGeometry(0.035, 0.05, 2.1, 12).translate(0, 1.17, 0));
    parts.push(new THREE.CylinderGeometry(0.16, 0.05, 0.08, 16).translate(0, 2.25, 0));
    parts.push(new THREE.CylinderGeometry(0.2, 0.2, 0.03, 20).translate(0, 2.62, 0));
    parts.push(new THREE.ConeGeometry(0.2, 0.12, 20).translate(0, 2.7, 0));
    const m = new THREE.Mesh(mergeGeos(parts), metal); m.position.set(x, gy - 0.02, z); m.castShadow = true; m.receiveShadow = true;
    setLayer(m, LAYER.ABOVE); scene.add(m);
    const head = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.13, 0.33, 20), glow.clone()); head.position.set(x, gy - 0.02 + 2.45, z);
    setLayer(head, LAYER.ABOVE); scene.add(head); LANTERNS.push(head);
    if (i < 3) {   // 只给前三盏配真实点光源，控制着色器开销
      const L = new THREE.PointLight(0xffc98a, 0, 7.5, 1.6); L.position.set(x, gy + 2.35, z); scene.add(L); LAMPS.lights.push(L);
    }
    // 灯旁一张校园长椅（面向水面）
    const sx = x - sdfGrad(x, z, 'x') * 0.9, sz = z - sdfGrad(x, z, 'z') * 0.9;
    if (sdf(sx, sz) > 0.35) buildBench(sx, sz, Math.atan2(-sdfGrad(x, z, 'x'), -sdfGrad(x, z, 'z')));
  });
}
function sdfGrad(x, z, ax) { return ax === 'x' ? (sdf(x + 0.05, z) - sdf(x - 0.05, z)) / 0.1 : (sdf(x, z + 0.05) - sdf(x, z - 0.05)) / 0.1; }
function buildBench(x, z, yaw) {
  const gy = terrainHeight(x, z), wood = [], iron = [];
  for (let k = 0; k < 4; k++) { const g = woodBox(1.5, 0.035, 0.085); g.translate(0, 0.43, -0.16 + k * 0.105); wood.push(g); }
  for (let k = 0; k < 3; k++) { const g = woodBox(1.5, 0.08, 0.03); g.rotateX(-0.22); g.translate(0, 0.58 + k * 0.1, -0.24 - k * 0.022); wood.push(g); }
  for (const sx of [-0.62, 0.62]) {
    iron.push(new THREE.BoxGeometry(0.05, 0.43, 0.05).translate(sx, 0.215, 0.12), new THREE.BoxGeometry(0.05, 0.8, 0.05).translate(sx, 0.4, -0.22),
      new THREE.BoxGeometry(0.05, 0.04, 0.42).translate(sx, 0.41, -0.05), new THREE.BoxGeometry(0.05, 0.04, 0.36).translate(sx, 0.63, -0.04));
  }
  const grp = new THREE.Group();
  const a = new THREE.Mesh(mergeGeos(wood), WORLD.rail); a.castShadow = a.receiveShadow = true; grp.add(a);
  const b = new THREE.Mesh(mergeGeos(iron), physical({ color: 0x23282b, roughness: 0.5, metalness: 0.6 }, { key: 'benchiron' })); b.castShadow = true; grp.add(b);
  grp.position.set(x, gy - 0.01, z); grp.rotation.y = yaw; setLayer(grp, LAYER.ABOVE); scene.add(grp);
  (WORLD.benches = WORLD.benches || []).push([x, z]);
}
function updateLanterns() {
  const dusk = 1 - smoothstep(4 * DEG, 18 * DEG, sunState.elev);
  const N = window.CAMPUS_SUN ? CAMPUS_SUN.night : 0, on = Math.max(N, dusk * 0.6);
  for (const L of LANTERNS) L.material.color.setRGB(0.25 + 4.5 * on, 0.22 + 3.4 * on, 0.18 + 1.9 * on);
  for (const L of LAMPS.lights) L.intensity = 9 * on;
}

// 萤火虫：夜晚在岸边草丛与水面上方缓缓飘动、明灭
const FIREFLY = { n: 70, pts: null, base: [] };
function buildFireflies() {
  const pos = new Float32Array(FIREFLY.n * 3), ph = new Float32Array(FIREFLY.n);
  for (let i = 0; i < FIREFLY.n; i++) {
    const sh = shoreAt(rand() * POLY_LEN), d = rr(-0.6, 1.6);
    FIREFLY.base.push([sh.x + sh.nx * d, rr(0.15, 1.3), sh.z + sh.nz * d, rand() * 6.28, rr(0.4, 1.0)]);
    ph[i] = rand() * 6.28;
  }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('aPh', new THREE.BufferAttribute(ph, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: SH.uTime, uOn: { value: 0 }, uScale: { value: innerHeight * 0.5 } },
    vertexShader: 'attribute float aPh; uniform float uTime; uniform float uScale; varying float vA; void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * mv; vA = 0.35 + 0.65 * pow(0.5 + 0.5 * sin(uTime * 2.3 + aPh * 3.0), 3.0); gl_PointSize = clamp(0.05 * uScale / -mv.z, 1.5, 14.0); }',
    fragmentShader: 'uniform float uOn; varying float vA; void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d); gl_FragColor = vec4(vec3(2.6, 3.2, 0.9) * a * vA * uOn, a * vA * uOn); }',
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  FIREFLY.pts = new THREE.Points(geo, mat); FIREFLY.pts.frustumCulled = false; setLayer(FIREFLY.pts, LAYER.ABOVE); scene.add(FIREFLY.pts);
}
function updateFireflies(t) {
  if (!FIREFLY.pts) return;
  const N = window.CAMPUS_SUN ? CAMPUS_SUN.night : 0, winter = WX.applied && WX_LETTER[WX.applied] === 'W';
  const on = winter ? 0 : smoothstep(0.35, 0.85, N) * (1 - clamp(SH.uRain.value, 0, 1) * 0.8);
  FIREFLY.pts.material.uniforms.uOn.value = on; FIREFLY.pts.visible = on > 0.01;
  if (!FIREFLY.pts.visible) return;
  FIREFLY.pts.material.uniforms.uScale.value = renderer.domElement.height * 0.5;
  const a = FIREFLY.pts.geometry.attributes.position;
  for (let i = 0; i < FIREFLY.n; i++) {
    const [x, y, z, p, s] = FIREFLY.base[i];
    a.setXYZ(i, x + Math.sin(t * 0.31 * s + p) * 0.5, y + Math.sin(t * 0.7 * s + p * 2) * 0.18, z + Math.cos(t * 0.27 * s + p) * 0.5);
  }
  a.needsUpdate = true;
}

// Cherry petals drifting on the surface (instanced, riding the waves, pushed by the wind, gathering along the edges)
const PETALS = { n: 220, list: [], mesh: null };
function buildPetals() {
  const cv = makeCanvas(64, 64), g = cv.getContext('2d');
  const grd = g.createRadialGradient(32, 50, 2, 32, 30, 32); grd.addColorStop(0, '#fbe6ec'); grd.addColorStop(1, '#f2a9c1');
  g.fillStyle = grd; g.beginPath(); g.moveTo(32, 62); g.bezierCurveTo(62, 44, 60, 10, 40, 4); g.lineTo(32, 12); g.lineTo(24, 4); g.bezierCurveTo(4, 10, 2, 44, 32, 62); g.fill();
  const mat = physical({ map: canvasTex(cv), alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.45, sheen: 0.7, sheenColor: new THREE.Color(0xffe0ea) },
    { key: 'petal', leaf: true, float: true, uniforms: { uTransl: { value: 0.8 } } });
  const geo = new THREE.PlaneGeometry(0.022, 0.024, 2, 2); geo.rotateX(-Math.PI / 2);
  const gp = geo.attributes.position; for (let i = 0; i < gp.count; i++) gp.setY(i, 0.0015 * (gp.getX(i) ** 2 + gp.getZ(i) ** 2) * 3000);
  geo.computeVertexNormals();
  PETALS.mesh = new THREE.InstancedMesh(geo, mat, PETALS.n); PETALS.mesh.frustumCulled = false; PETALS.mesh.receiveShadow = true;
  setLayer(PETALS.mesh, LAYER.SURFACE); scene.add(PETALS.mesh);
  for (let i = 0; i < PETALS.n; i++) {
    let x, z, guard = 0;
    do { x = rand() < 0.55 ? rr(-3.2, -1.2) : rr(-3.3, 3.0); z = rand() < 0.55 ? rr(-6, 1) : rr(-6, 5.5); } while (sdf(x, z) > -0.12 && guard++ < 60);
    PETALS.list.push({ x, z, rot: rand() * 6.28, spin: rr(-0.2, 0.2), s: rr(0.7, 1.3) });
  }
}
const _pm4 = new THREE.Matrix4(), _pq4 = new THREE.Quaternion(), _pe4 = new THREE.Euler(), _ps4 = new THREE.Vector3(), _pv4 = new THREE.Vector3();
function updatePetals(dt) {
  if (!PETALS.mesh) return;
  const wx = SH.uWindDir.value.x * P.windSpeed * 0.02, wz = SH.uWindDir.value.y * P.windSpeed * 0.02;
  PETALS.list.forEach((q, i) => {
    q.x += wx * dt * (0.6 + SH.uGust.value); q.z += wz * dt * (0.6 + SH.uGust.value); q.rot += q.spin * dt;
    const sd = sdf(q.x, q.z);
    if (sd > -0.08) { const e = 0.03, gx = (sdf(q.x + e, q.z) - sdf(q.x - e, q.z)) / (2 * e), gz = (sdf(q.x, q.z + e) - sdf(q.x, q.z - e)) / (2 * e); q.x -= gx * (sd + 0.08); q.z -= gz * (sd + 0.08); }
    _pv4.set(q.x, WATER_Y, q.z); _pe4.set(0, q.rot, 0); _pq4.setFromEuler(_pe4); _ps4.setScalar(q.s);
    PETALS.mesh.setMatrixAt(i, _pm4.compose(_pv4, _pq4, _ps4));
  });
  PETALS.mesh.instanceMatrix.needsUpdate = true;
}

// Distant mountain ridges with aerial perspective (they fade into the horizon haze)
const MOUNTAIN_FS = /* glsl */`
// === DISTANT RIDGES: forested slopes, colour pulled toward the horizon sky by distance (aerial perspective)
uniform vec3 uHaze;
uniform vec3 uForest;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uLayer;
varying vec2 vUv;
varying vec3 vWPos;
varying vec3 vN;
float hh(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main(){
  float trees = hh(floor(vWPos.xz * 0.6 + vWPos.y * 0.3)) * 0.25 + 0.75;
  vec3 N = normalize(vN);
  vec3 lit = uForest * trees * (0.35 + 0.65 * max(dot(N, uSunDir), 0.0)) * (uSunColor * 0.25 + 0.25);
  float haze = mix(0.55, 0.82, uLayer) + 0.12 * (1.0 - vUv.y);
  gl_FragColor = vec4(mix(lit, uHaze, clamp(haze, 0.0, 0.95)), 1.0);
}`;
function buildMountains() {
  const mats = [];
  for (let L = 0; L < 2; L++) {
    const R = 150 + L * 55, seg = 180, pos = [], uv = [], idx = [];
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2, n = fbm3(Math.cos(a) * 3 + L * 7, Math.sin(a) * 3, L, 5, 17 + L);
      const ridge = 1 - Math.abs(fbm3(Math.cos(a) * 6, Math.sin(a) * 6, 2 + L, 3, 5));
      const h = Math.max(6, (34 + 62 * (n * 0.5 + 0.5) + 22 * ridge) * (0.75 + 0.45 * L)) * (0.55 + 0.45 * smoothstep(0.2, -0.5, Math.cos(a)));   // taller behind the pavilion
      const x = Math.sin(a) * R, z = Math.cos(a) * R;
      pos.push(x, -2, z, x, h, z); uv.push(i / seg, 0, i / seg, 1);
    }
    for (let i = 0; i < seg; i++) { const q = i * 2; idx.push(q, q + 2, q + 1, q + 1, q + 2, q + 3); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
    const m = new THREE.ShaderMaterial({ vertexShader: FALL_VS, fragmentShader: MOUNTAIN_FS, side: THREE.DoubleSide,
      uniforms: { uHaze: { value: new THREE.Color() }, uForest: { value: new THREE.Color(0x2c3d2a) }, uSunDir: SH.uSunDir, uSunColor: SH.uSunColor, uLayer: { value: L } } });
    const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; mesh.renderOrder = -5; setLayer(mesh, LAYER.ABOVE); scene.add(mesh); mats.push(m);
  }
  WORLD.mountainMats = mats;
}
function updateMountains() {
  if (!WORLD.mountainMats) return;
  // haze colour ~ sky near the horizon (scaled like the sky shader output)
  const b = skyUniforms.uCloudBright.value;
  for (const m of WORLD.mountainMats) m.uniforms.uHaze.value.setRGB(0.3 * b, 0.36 * b, 0.44 * b).lerp(new THREE.Color().copy(SH.uSunColor.value).multiplyScalar(0.12), 1 - smoothstep(5 * DEG, 25 * DEG, sunState.elev)).lerp(SH.uFogColor.value, clamp(SH.uFogDensity.value * 28, 0, 0.9));
}

/* ------------------------------------------------------------------ 9d. UNDERWATER: lily rhizomes, roots & petioles, lotus tubers, submerged plants */
// Nymphaea grow from knobbly rhizomes creeping through the mud; each pad and flower rises on its own long, flexible
// petiole. Nelumbo (sacred lotus) grows from segmented tubers (renkon) with roots at every node.
const ROOTS = { stems: [], stemGeo: null };
function knobbly(geo, amp, freq, seed) {
  const p = geo.attributes.position, n = geo.attributes.normal;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), k = amp * fbm3(x * freq + seed, y * freq, z * freq, 3, seed | 0);
    p.setXYZ(i, x + n.getX(i) * k, y + n.getY(i) * k, z + n.getZ(i) * k);
  }
  geo.computeVertexNormals(); return geo;
}
function bottomY(x, z) { return terrainHeight(x, z); }
function buildUnderwaterLife() {
  const V3 = THREE.Vector3;
  const rhizomeMat = physical({ map: TEX.bark.map, normalMap: TEX.bark.normalMap, normalScale: new THREE.Vector2(1.0, 1.0), color: 0xe8cda4, roughness: 0.75 }, { key: 'rhizome' });
  const rootMat = physical({ color: 0xcdbb98, roughness: 0.6, sheen: 0.5, sheenColor: new THREE.Color(0xf0e6d0) }, { key: 'rootlets', leaf: true, uniforms: { uTransl: { value: 0.4 } } });
  const tuberMat = physical({ color: 0xc9a77e, map: TEX.boulder.map, roughness: 0.5, clearcoat: 0.3, sheen: 0.3, sheenColor: new THREE.Color(0xf5e2c8) }, { key: 'renkon' });
  const rhiz = [], roots = [], tubers = [];
  // ---- cluster the floating pads and give every cluster a rhizome on the floor
  const pads = WORLD.lilies || [], used = new Set(), clusters = [];
  pads.forEach((L, i) => {
    if (used.has(i)) return;
    const c = [i]; used.add(i);
    pads.forEach((M, j) => { if (!used.has(j) && Math.hypot(L.x - M.x, L.z - M.z) < 1.0) { c.push(j); used.add(j); } });
    clusters.push(c);
  });
  ROOTS.anchors = new Array(pads.length);
  for (const c of clusters) {
    const cx = c.reduce((s2, i) => s2 + pads[i].x, 0) / c.length, cz = c.reduce((s2, i) => s2 + pads[i].z, 0) / c.length;
    const ang = rand() * Math.PI, len = 0.35 + c.length * 0.12, pts = [];
    for (let k = 0; k <= 5; k++) {
      const t = k / 5 - 0.5, x = cx + Math.cos(ang) * len * t + rr(-0.04, 0.04), z = cz + Math.sin(ang) * len * t + rr(-0.04, 0.04);
      pts.push(new V3(x, bottomY(x, z) + 0.03, z));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    rhiz.push(knobbly(taperTube(curve, 28, 12, 0.038, 0.028, 6), 0.009, 45, cx * 3));
    // fibrous roots from the underside, spreading into the gravel
    for (let r = 0; r < 48; r++) {
      const p0 = curve.getPointAt(rand()), a = rand() * Math.PI * 2, L = rr(0.07, 0.24);
      const p1 = p0.clone().add(new V3(Math.cos(a) * L * 0.5, -0.004, Math.sin(a) * L * 0.5));
      const p2 = p0.clone().add(new V3(Math.cos(a) * L, 0, Math.sin(a) * L)); p2.y = bottomY(p2.x, p2.z) - 0.01;
      roots.push(taperTube(new THREE.CatmullRomCurve3([p0.clone().add(new V3(0, -0.02, 0)), p1, p2]), 7, 4, rr(0.0022, 0.0038), 0.0008, 4));
    }
    // leaf scars / growing tips along the rhizome
    for (let k = 0; k < 5; k++) { const p = curve.getPointAt(0.1 + k * 0.2); const g = new THREE.SphereGeometry(0.02, 10, 8); g.scale(1, 0.7, 1); g.translate(p.x, p.y + 0.014, p.z); rhiz.push(g); }
    for (const i of c) ROOTS.anchors[i] = curve.getPointAt(rand()).add(new V3(0, 0.015, 0));
  }
  // ---- sacred-lotus tubers (renkon) under the emergent leaves, with roots at the nodes
  const lotusBase = new V3(-2.8, 0, 0.05);
  {
    const ang = 0.6, pts = [];
    for (let k = 0; k < 5; k++) { const x = lotusBase.x + Math.cos(ang) * (k - 2) * 0.16, z = lotusBase.z + Math.sin(ang) * (k - 2) * 0.16; pts.push(new V3(x, bottomY(x, z) + 0.018, z)); }
    const curve = new THREE.CatmullRomCurve3(pts), N = 40, rad = 12, pos = [], uv = [], idx = [];
    const frames = curve.computeFrenetFrames(N, false), P = new V3();
    for (let i = 0; i <= N; i++) {
      const t = i / N; curve.getPointAt(t, P);
      const seg = (t * 4) % 1, r = 0.026 * (0.55 + 0.45 * Math.sqrt(Math.sin(Math.PI * seg)));   // constricted nodes
      for (let j = 0; j <= rad; j++) { const a = (j / rad) * Math.PI * 2, nx = frames.normals[i].x * Math.cos(a) + frames.binormals[i].x * Math.sin(a), ny = frames.normals[i].y * Math.cos(a) + frames.binormals[i].y * Math.sin(a), nz = frames.normals[i].z * Math.cos(a) + frames.binormals[i].z * Math.sin(a); pos.push(P.x + nx * r, P.y + ny * r, P.z + nz * r); uv.push(j / rad, t * 3); }
    }
    for (let i = 0; i < N; i++) for (let j = 0; j < rad; j++) { const a = i * (rad + 1) + j, b = a + rad + 1; idx.push(a, a + 1, b, a + 1, b + 1, b); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
    tubers.push(g);
    for (let k = 1; k < 4; k++) {
      const p0 = curve.getPointAt(k / 4);
      for (let r = 0; r < 14; r++) { const a = rand() * Math.PI * 2, L = rr(0.05, 0.14), p2 = p0.clone().add(new V3(Math.cos(a) * L, 0, Math.sin(a) * L)); p2.y = bottomY(p2.x, p2.z) - 0.012;
        roots.push(taperTube(new THREE.CatmullRomCurve3([p0.clone().add(new V3(0, -0.02, 0)), p0.clone().lerp(p2, 0.5).add(new V3(0, -0.01, 0)), p2]), 6, 4, 0.0022, 0.0007, 4)); }
    }
    // stalks of the emergent leaves and the flower reach down to the tuber
    ROOTS.lotusAnchor = curve;
  }
  const mk = (geos, mat) => { const m = new THREE.Mesh(mergeGeos(geos), mat); m.receiveShadow = true; m.castShadow = false; setLayer(m, LAYER.UNDER); scene.add(m); return m; };
  mk(rhiz, rhizomeMat); mk(roots, rootMat); mk(tubers, tuberMat);
  // ---- petioles (pads & flowers): one dynamic tube mesh, rebuilt each frame so the stems follow the drifting pads
  const petioleMat = physical({ color: 0xa89a5c, roughness: 0.38, sheen: 0.4, sheenColor: new THREE.Color(0xe0c8a0) }, { key: 'petiole', leaf: true, uniforms: { uTransl: { value: 0.7 } } });
  const SEG = 14, RAD = 6;
  pads.forEach((L, i) => {
    ROOTS.stems.push({ pad: L, anchor: ROOTS.anchors[i], r: 0.0068, ph: rand() * 6, flower: null });
    L.mesh.traverse((o) => { if (o.userData.flower) ROOTS.stems.push({ pad: L, anchor: ROOTS.anchors[i].clone().add(new V3(rr(-0.05, 0.05), 0, rr(-0.05, 0.05))), r: 0.0078, ph: rand() * 6, flower: o }); });
  });
  const nV = ROOTS.stems.length * (SEG + 1) * (RAD + 1), pos = new Float32Array(nV * 3), nor = new Float32Array(nV * 3), idx = [];
  ROOTS.stems.forEach((st, k) => { const b = k * (SEG + 1) * (RAD + 1); for (let i = 0; i < SEG; i++) for (let j = 0; j < RAD; j++) { const a = b + i * (RAD + 1) + j, c = a + RAD + 1; idx.push(a, a + 1, c, a + 1, c + 1, c); } });
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); g.setIndex(idx);
  g.attributes.position.setUsage(THREE.DynamicDrawUsage); g.attributes.normal.setUsage(THREE.DynamicDrawUsage);
  ROOTS.stemMesh = new THREE.Mesh(g, petioleMat); ROOTS.stemMesh.frustumCulled = false; ROOTS.stemMesh.receiveShadow = true;
  setLayer(ROOTS.stemMesh, LAYER.UNDER); scene.add(ROOTS.stemMesh); seasonal(ROOTS.stemMesh, 'SRA');
  Object.assign(ROOTS, { SEG, RAD });
  // lotus stalks extended to the tuber
  for (const Lt of WORLD.lotus || []) {
    const top = new V3(); Lt.leaf.getWorldPosition(top); const a = ROOTS.lotusAnchor.getPointAt(rand());
    const c = new THREE.CatmullRomCurve3([a, a.clone().lerp(top, 0.4).add(new V3(rr(-0.05, 0.05), 0, rr(-0.05, 0.05))), new V3(top.x, WATER_Y - 0.3, top.z)]);
    mk([taperTube(c, 12, 6, 0.0065, 0.006, 3)], petioleMat);
  }
  // ---- submerged plants: eelgrass ribbons and hornwort clumps; a few decaying leaves on the floor
  const ribbon = (h, w) => {
    const segs = 12, p2 = [], u2 = [], i2 = [];
    for (let i = 0; i <= segs; i++) { const t = i / segs, wd = w * (1 - 0.3 * t), x = 0.03 * Math.sin(t * 3) * t; p2.push(x, h * t, -wd / 2, x, h * t, wd / 2); u2.push(0, t, 1, t); }
    for (let i = 0; i < segs; i++) { const a = i * 2; i2.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.Float32BufferAttribute(p2, 3)); gg.setAttribute('uv', new THREE.Float32BufferAttribute(u2, 2)); gg.setIndex(i2); gg.computeVertexNormals(); return gg;
  };
  const eelMat = physical({ map: TEX.iris, color: 0x9ab87a, side: THREE.DoubleSide, roughness: 0.45, sheen: 0.4, sheenColor: new THREE.Color(0xc8e0a0) },
    { key: 'eelgrass', leaf: true, wind: 'local', windWeight: 'pow(uv.y, 1.5) * 1.6', uniforms: { uTransl: { value: 0.6 } } });
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), Sc = new V3(), Pp = new V3(), eel = [];
  let guard = 0, clumps = 0;
  while (clumps < 26 && guard++ < 3000) {
    const x = rr(-3.3, 3.0), z = rr(-5.8, 5.6), sd = sdf(x, z);
    if (sd > -0.35 || sd < -1.3 || Math.abs(z - BRIDGE.z) < 0.7) continue;
    clumps++;
    const n = 8 + (rand() * 10 | 0), depth = -bottomY(x, z);
    for (let i = 0; i < n; i++) {
      Pp.set(x + rr(-0.12, 0.12), bottomY(x, z) - 0.01, z + rr(-0.12, 0.12)); E.set(rr(-0.15, 0.15), rand() * 6.28, rr(-0.15, 0.15)); Q.setFromEuler(E);
      const hs = depth * rr(0.55, 0.95); Sc.set(1, hs, 1); eel.push(M.compose(Pp, Q, Sc).clone());
    }
  }
  const eim = new THREE.InstancedMesh(ribbon(1, 0.012), eelMat, eel.length); eel.forEach((m, i) => eim.setMatrixAt(i, m));
  eim.receiveShadow = true; eim.computeBoundingSphere(); setLayer(eim, LAYER.UNDER); scene.add(eim);
  // hornwort: whorls of fine needles on upright stems (alpha cards stacked around the stem)
  const hcv = makeCanvas(128, 256), hg = hcv.getContext('2d');
  hg.strokeStyle = '#3f5a24'; hg.lineWidth = 3; hg.beginPath(); hg.moveTo(64, 256); hg.lineTo(64, 0); hg.stroke();
  for (let y = 8; y < 256; y += 14) for (let k = 0; k < 9; k++) { const a = (k / 9) * Math.PI * 2 + y; hg.strokeStyle = `hsl(${95 + (y % 20)}, 45%, ${24 + (k % 3) * 4}%)`; hg.lineWidth = 1.6; hg.beginPath(); hg.moveTo(64, y); hg.lineTo(64 + Math.cos(a) * 34, y - 10 + Math.sin(a) * 6); hg.stroke(); }
  const hornMat = physical({ map: canvasTex(hcv), alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.6 }, { key: 'hornwort', leaf: true, wind: 'local', windWeight: 'uv.y * 0.8', uniforms: { uTransl: { value: 0.5 } } });
  const hcard = new THREE.PlaneGeometry(0.1, 0.32); hcard.translate(0, 0.16, 0);
  const horn = [];
  guard = 0; clumps = 0;
  while (clumps < 16 && guard++ < 3000) {
    const x = rr(-3.3, 3.0), z = rr(-5.8, 5.6), sd = sdf(x, z);
    if (sd > -0.3 || sd < -1.0) continue;
    clumps++;
    for (let i = 0; i < 9; i++) { Pp.set(x + rr(-0.08, 0.08), bottomY(x, z) - 0.01, z + rr(-0.08, 0.08)); E.set(0, rand() * 6.28, rr(-0.2, 0.2)); Q.setFromEuler(E); const s2 = rr(0.7, 1.4); Sc.set(s2, s2, s2); horn.push(M.compose(Pp, Q, Sc).clone()); }
  }
  const him = new THREE.InstancedMesh(hcard, hornMat, horn.length); horn.forEach((m, i) => him.setMatrixAt(i, m));
  him.receiveShadow = true; him.computeBoundingSphere(); setLayer(him, LAYER.UNDER); scene.add(him);
  // decaying leaves resting on the gravel
  const lcv = makeCanvas(64, 64), lg2 = lcv.getContext('2d');
  lg2.fillStyle = '#5a3a1e'; lg2.beginPath(); lg2.ellipse(32, 32, 14, 28, 0, 0, Math.PI * 2); lg2.fill(); lg2.strokeStyle = 'rgba(30,18,8,0.7)'; lg2.beginPath(); lg2.moveTo(32, 4); lg2.lineTo(32, 60); lg2.stroke();
  const deadMat = physical({ map: canvasTex(lcv), alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.8 }, { key: 'deadleaf' });
  const dg = new THREE.PlaneGeometry(0.06, 0.06); dg.rotateX(-Math.PI / 2);
  const dead = [];
  for (let i = 0; i < 70; i++) { let x, z, g2 = 0; do { x = rr(-3.3, 3.0); z = rr(-5.8, 5.6); } while (sdf(x, z) > -0.2 && g2++ < 50); Pp.set(x, bottomY(x, z) + 0.004, z); E.set(rr(-0.2, 0.2), rand() * 6.28, rr(-0.2, 0.2)); Q.setFromEuler(E); const s2 = rr(0.6, 1.3); Sc.set(s2, 1, s2); dead.push(M.compose(Pp, Q, Sc).clone()); }
  const dim = new THREE.InstancedMesh(dg, deadMat, dead.length); dead.forEach((m, i) => dim.setMatrixAt(i, m));
  dim.receiveShadow = true; dim.computeBoundingSphere(); setLayer(dim, LAYER.UNDER); scene.add(dim);
}
const _st = new THREE.Vector3(), _st2 = new THREE.Vector3(), _sb = new THREE.Vector3(), _sn = new THREE.Vector3(), _sT = new THREE.Vector3(), _sp = new THREE.Vector3();
function updateUnderwaterLife(t) {
  if (!ROOTS.stemMesh) return;
  const pos = ROOTS.stemMesh.geometry.attributes.position.array, nor = ROOTS.stemMesh.geometry.attributes.normal.array, SEG = ROOTS.SEG, RAD = ROOTS.RAD;
  let o = 0;
  for (const st of ROOTS.stems) {
    const a = st.anchor;
    if (st.flower) st.flower.getWorldPosition(_st2); else _st2.copy(st.pad.mesh.position);
    _st2.y = WATER_Y - 0.006;
    const L = Math.max(0.2, a.distanceTo(_st2));
    // cubic Bezier: rises from the rhizome, leans, and eases horizontally into the underside of the pad
    const c1x = a.x + Math.sin(st.ph + t * 0.2) * 0.05, c1y = a.y + L * 0.45, c1z = a.z + Math.cos(st.ph) * 0.05;
    const c2x = _st2.x + (a.x - _st2.x) * 0.25, c2y = _st2.y - L * 0.25, c2z = _st2.z + (a.z - _st2.z) * 0.25;
    for (let i = 0; i <= SEG; i++) {
      const u = i / SEG, iu = 1 - u, b0 = iu * iu * iu, b1 = 3 * iu * iu * u, b2 = 3 * iu * u * u, b3 = u * u * u;
      _sp.set(a.x * b0 + c1x * b1 + c2x * b2 + _st2.x * b3, a.y * b0 + c1y * b1 + c2y * b2 + _st2.y * b3, a.z * b0 + c1z * b1 + c2z * b2 + _st2.z * b3);
      const d0 = 3 * iu * iu, d1 = 6 * iu * u, d2 = 3 * u * u;
      _sT.set((c1x - a.x) * d0 + (c2x - c1x) * d1 + (_st2.x - c2x) * d2, (c1y - a.y) * d0 + (c2y - c1y) * d1 + (_st2.y - c2y) * d2, (c1z - a.z) * d0 + (c2z - c1z) * d1 + (_st2.z - c2z) * d2).normalize();
      _sn.set(0, 1, 0).cross(_sT); if (_sn.lengthSq() < 1e-6) _sn.set(1, 0, 0); _sn.normalize(); _sb.crossVectors(_sT, _sn);
      const r = st.r * (1 - 0.25 * u);
      for (let j = 0; j <= RAD; j++) {
        const ang = (j / RAD) * Math.PI * 2, cs = Math.cos(ang), sn = Math.sin(ang);
        const nx = _sn.x * cs + _sb.x * sn, ny = _sn.y * cs + _sb.y * sn, nz = _sn.z * cs + _sb.z * sn;
        pos[o] = _sp.x + nx * r; pos[o + 1] = _sp.y + ny * r; pos[o + 2] = _sp.z + nz * r; nor[o] = nx; nor[o + 1] = ny; nor[o + 2] = nz; o += 3;
      }
    }
  }
  ROOTS.stemMesh.geometry.attributes.position.needsUpdate = true; ROOTS.stemMesh.geometry.attributes.normal.needsUpdate = true;
}

/* ------------------------------------------------------------------ 10. WATER */
const FSQ_VS = /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const fsQuadGeo = new THREE.PlaneGeometry(2, 2);
const fsCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
class FSPass {
  constructor(material) { this.mesh = new THREE.Mesh(fsQuadGeo, material); this.mesh.frustumCulled = false; this.scene = new THREE.Scene(); this.scene.add(this.mesh); }
  get uniforms() { return this.mesh.material.uniforms; }
  render(target) { renderer.setRenderTarget(target); renderer.render(this.scene, fsCam); }
}
function shaderPass(fs, uniforms, defines = {}) {
  return new FSPass(new THREE.ShaderMaterial({ vertexShader: FSQ_VS, fragmentShader: fs, uniforms, defines, depthTest: false, depthWrite: false }));
}

// Ripple simulation domain (square so ripples stay circular); pond mask encodes the SDF in [-2, 2] m
const SIM = { N: window.CAMPUS_POND.simN, size: 13.4, x0: 0, z0: 0 };
SIM.x0 = -0.2 - SIM.size / 2; SIM.z0 = -0.02 - SIM.size / 2;
const WAVES = [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()];
const DROPS = [];            // pending {x, z, r, s}
let water, waterMat, simA, simB, simPass, maskTex;

const SIM_FS = /* glsl */`
// === RIPPLE SIMULATION ===========================================================
// 2D wave equation, height in .r, vertical velocity in .g; ping-ponged 256x256 half-float.
// Drops (cursor clicks, koi at the surface) add a smooth cosine bump; the shoreline is reflective.
uniform sampler2D tPrev;
uniform sampler2D tMask;
uniform vec2 uTexel;
uniform vec4 uDrops[16];     // x, z, radius, strength (m)
uniform int uNumDrops;
uniform vec4 uSim;           // x0, z0, size, -
uniform vec4 uPads[16];      // floating pads damp the ripples beneath them
uniform int uNumPads;
varying vec2 vUv;
void main(){
  vec4 info = texture2D(tPrev, vUv);
  vec2 dx = vec2(uTexel.x, 0.0), dy = vec2(0.0, uTexel.y);
  float avg = (texture2D(tPrev, vUv - dx).r + texture2D(tPrev, vUv + dx).r +
               texture2D(tPrev, vUv - dy).r + texture2D(tPrev, vUv + dy).r) * 0.25;
  info.g += (avg - info.r) * 1.8;   // accelerate toward the neighbour average
  info.g *= 0.986;                  // damping
  info.r += info.g;
  info.r *= 0.998;
  vec2 wp = uSim.xy + vUv * uSim.z;
  for (int i = 0; i < 16; i++) {
    if (i >= uNumDrops) break;
    vec4 d = uDrops[i];
    float f = max(0.0, 1.0 - length(wp - d.xy) / d.z);
    f = 0.5 - cos(f * 3.14159265) * 0.5;
    info.r += f * d.w;
  }
  for (int i = 0; i < 16; i++) {
    if (i >= uNumPads) break;
    float pd = length(wp - uPads[i].xy) / uPads[i].z;
    info.rg *= mix(0.55, 1.0, smoothstep(0.7, 1.05, pd));
  }
  float sd = texture2D(tMask, vUv).r * 4.0 - 2.0;
  if (sd > 0.0) info.rg = vec2(0.0);
  gl_FragColor = info;
}`;

const WATER_VS = /* glsl */`
// === WATER SURFACE: vertex ======================================================
// Sum of 4 Gerstner waves (0.5–2 cm, 0.4–3 m wavelengths, deep-water dispersion) + ripple-sim height.
uniform float uTime;
uniform vec4 uWaves[4];      // dir.xy, wavelength (m), amplitude (m)
uniform float uSteep;
uniform sampler2D tRipple;
uniform vec4 uSim;           // x0, z0, size, texel
varying vec3 vWPos;
varying vec3 vNrm;
varying vec2 vSimUv;
varying vec3 vViewPos;
void main(){
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vec2 xz = wp.xz;
  vec3 disp = vec3(0.0), n = vec3(0.0, 1.0, 0.0);
  for (int i = 0; i < 4; i++) {
    vec2 D = normalize(uWaves[i].xy);
    float k = 6.2831853 / uWaves[i].z, A = uWaves[i].w;
    float c = sqrt(9.81 / k);
    float f = k * (dot(D, xz) - c * uTime);
    float S = sin(f), C = cos(f);
    disp += vec3(uSteep * A * D.x * C, A * S, uSteep * A * D.y * C);
    n -= vec3(D.x * k * A * C, uSteep * k * A * S, D.y * k * A * C);
  }
  vSimUv = (xz - uSim.xy) / uSim.z;
  wp.xyz += disp;
  wp.y += texture2D(tRipple, vSimUv).r;
  vWPos = wp.xyz; vNrm = n;
  vec4 mv = viewMatrix * wp; vViewPos = mv.xyz;
  gl_Position = projectionMatrix * mv;
}`;

const WATER_FS = /* glsl */`
// === WATER SURFACE: fragment ====================================================
// Above: planar reflection + depth-aware refraction blended by Schlick Fresnel (F0 = 0.02),
//        Beer–Lambert absorption along the refracted path, shoreline foam, GGX sun glint.
// Below: Snell's window (refracted view of the world above) and total internal reflection.
#include <packing>
uniform float uTime;
uniform float uWaterY;
uniform float uUnder;
uniform float uNear;
uniform float uFar;
uniform float uReflDistort;
uniform float uRefrStr;
uniform float uDetail;
uniform float uSpecMax;
uniform vec2 uInvRes;
uniform vec2 uWind;
uniform float uGustW;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uAbsorb;
uniform float uScatter;
uniform vec3 uInscatter;
uniform vec3 uFoamColor;
uniform sampler2D tRefl;
uniform sampler2D tRefr;
uniform sampler2D tRefrDepth;
uniform sampler2D tNormal;
uniform sampler2D tRipple;
uniform sampler2D tMask;
uniform samplerCube tSky;
uniform mat4 uReflMatrix;
uniform mat4 uProj;
uniform vec4 uSim;
uniform float uRain;
uniform float uIce;
uniform float uSnowCover;
uniform float uFogDensity;
uniform vec3 uFogColor;
varying vec3 vWPos;
varying vec3 vNrm;
varying vec2 vSimUv;
varying vec3 vViewPos;

float linDepth(vec2 uv){ return -perspectiveDepthToViewZ(texture2D(tRefrDepth, uv).r, uNear, uFar); }
vec3 sky(vec3 d){ return textureCube(tSky, d).rgb; }
// GGX / Trowbridge-Reitz specular for the sun, with Smith-Schlick visibility and Schlick Fresnel
vec3 sunGGX(vec3 N, vec3 V, vec3 L, float rough){
  vec3 H = normalize(L + V);
  float NdL = max(dot(N, L), 0.0), NdV = max(dot(N, V), 1e-3), NdH = max(dot(N, H), 0.0), VdH = max(dot(V, H), 0.0);
  float a2 = rough * rough * rough * rough;
  float d = NdH * NdH * (a2 - 1.0) + 1.0;
  float D = a2 / (3.14159265 * d * d);
  float k = rough * rough * 0.5;
  float G = (NdL / (NdL * (1.0 - k) + k)) * (NdV / (NdV * (1.0 - k) + k));
  float F = 0.02 + 0.98 * pow(1.0 - VdH, 5.0);
  return uSunColor * D * G * F / (4.0 * NdV);
}

void main(){
  // Clip to the pond outline (mask = signed distance, metres)
  float sdM = texture2D(tMask, vSimUv).r * 4.0 - 2.0;
  if (sdM > 0.28) discard;

  float dist = length(vViewPos);
  // ---- Normal: Gerstner base + two scrolling FBM ripple layers + ripple-sim gradient
  vec3 N = normalize(vNrm);
  float fadeD = 1.0 / (1.0 + dist * 0.07);
  vec2 uv1 = vWPos.xz * 0.42 + uWind * uTime * 0.05;
  vec2 uv2 = (vWPos.xz * 1.07) * mat2(0.94, -0.34, 0.34, 0.94) + vec2(-uWind.y, uWind.x) * uTime * 0.021 + uWind * uTime * 0.03;
  vec3 d1 = texture2D(tNormal, uv1).xyz * 2.0 - 1.0;
  vec3 d2 = texture2D(tNormal, uv2).xyz * 2.0 - 1.0;
  vec2 detail = (d1.xy * 0.6 + d2.xy * 0.45) * uDetail * fadeD;
  // gust 'cat's paws': patches of stronger ripples drifting downwind
  float paws = smoothstep(0.42, 0.72, texture2D(tNormal, vWPos.xz * 0.045 - uWind * uTime * 0.035).r) * uGustW;
  detail *= 0.55 + 1.7 * paws;
  float tx = uSim.w, cell = uSim.z * tx;
  float hL = texture2D(tRipple, vSimUv - vec2(tx, 0.0)).r, hR = texture2D(tRipple, vSimUv + vec2(tx, 0.0)).r;
  float hD = texture2D(tRipple, vSimUv - vec2(0.0, tx)).r, hU = texture2D(tRipple, vSimUv + vec2(0.0, tx)).r;
  vec2 rip = vec2(hL - hR, hD - hU) / (2.0 * cell);
  N = normalize(vec3(N.x + detail.x + rip.x, N.y, N.z + detail.y + rip.y));
  // rain: every few centimetres a drop lands and throws an expanding ring (two jittered cell layers)
  if (uRain > 0.001) {
    vec2 rg = vec2(0.0);
    for (int L = 0; L < 2; L++) {
      vec2 p = vWPos.xz * (L == 0 ? 7.0 : 11.0) + float(L) * 3.7, ci = floor(p);
      for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
        vec2 c = ci + vec2(float(i), float(j));
        float h = fract(sin(dot(c, vec2(12.9898, 78.233))) * 43758.5453);
        vec2 cen = c + vec2(fract(h * 17.3), fract(h * 31.7));
        float t = fract(uTime * (0.8 + h * 0.7) + h * 7.0);
        vec2 dv = p - cen; float d = length(dv), r = t * 0.95;
        float ring = sin(clamp((d - r) * 26.0, -3.14159, 3.14159)) * (1.0 - t) * (1.0 - t) * step(abs(d - r), 0.12);
        rg += dv / max(d, 1e-3) * ring;
      }
    }
    N = normalize(N + vec3(rg.x, 0.0, rg.y) * 0.45 * uRain * fadeD);
  }

  vec3 V = normalize(cameraPosition - vWPos);
  vec2 suv = gl_FragCoord.xy * uInvRes;
  vec3 nV = (viewMatrix * vec4(N, 0.0)).xyz;
  vec3 col;

  if (uUnder < 0.5) {
    // ================= ABOVE THE SURFACE =================
    float NdV = max(dot(N, V), 0.0);
    float F = 0.02 + 0.98 * pow(1.0 - NdV, 5.0);                 // Schlick, F0 = 0.02

    // Planar reflection (mirrored camera), distorted by the surface normal
    vec4 rc = uReflMatrix * vec4(vWPos.x, uWaterY, vWPos.z, 1.0);
    vec2 ruv = rc.xy / rc.w + N.xz * uReflDistort;
    // clamp small overshoots at the frame edges (distortion) instead of falling back to the bright sky
    float outR = length(ruv - clamp(ruv, 0.0, 1.0));
    // A real surface never mirrors cleanly: blur with the local ripple roughness and distance, and smear the
    // image vertically (wave slopes stretch reflections toward the viewer), so it breaks up instead of copying.
    float rough = clamp(length(detail) * 2.4 + length(rip) * 0.08 + paws * 0.35 + dist * 0.012, 0.0, 1.0);
    float lod = 0.6 + rough * 3.2;
    vec2 st = vec2(0.0, 0.006 + 0.028 * rough) * (0.6 + 0.8 * abs(N.x + N.z));
    vec2 c0 = clamp(ruv, 0.001, 0.999);
    vec3 rs = textureLod(tRefl, c0, lod).rgb * 0.36
            + textureLod(tRefl, clamp(ruv + st, 0.001, 0.999), lod + 0.4).rgb * 0.2 + textureLod(tRefl, clamp(ruv - st, 0.001, 0.999), lod + 0.4).rgb * 0.2
            + textureLod(tRefl, clamp(ruv + st * 2.3, 0.001, 0.999), lod + 0.9).rgb * 0.12 + textureLod(tRefl, clamp(ruv - st * 2.3, 0.001, 0.999), lod + 0.9).rgb * 0.12;
    vec3 refl = mix(rs, sky(reflect(-V, N)), smoothstep(0.03, 0.12, outR));

    // Refraction. Apparent displacement grows with the depth of what is seen (a koi 7 cm down barely wobbles, the
    // floor a metre down swims), but a per-pixel depth factor jumps at every koi outline, tears the image there and
    // traces a translucent, stair-stepped second outline of the fish. So the depth factor is averaged over a small ring
    // of taps: it still falls to almost nothing over a shallow koi, yet changes smoothly across its edge, and one
    // single, continuous lookup is used - never a blend of two differently displaced images.
    float wz = -vViewPos.z;
    float z0 = linDepth(suv);
    float kd = clamp((z0 - wz) * 1.6, 0.0, 1.0) * 2.0;
    vec2 rr = uInvRes * (4.0 + 12.0 / max(wz, 0.5));
    for (int i = 0; i < 8; i++) {
      float a = float(i) * 0.7853982;
      kd += clamp((linDepth(suv + vec2(cos(a), sin(a)) * rr) - wz) * 1.6, 0.0, 1.0);
    }
    kd /= 10.0;
    vec2 roff = nV.xy * uRefrStr * kd * smoothstep(0.0, 0.45, -sdM) / (1.0 + wz * 0.12);
    vec2 ruv2 = clamp(suv + roff, vec2(0.001), vec2(0.999));
    float z1 = linDepth(ruv2);
    float rej = 1.0 - smoothstep(wz - 0.005, wz + 0.02, z1);
    vec3 refr = mix(texture2D(tRefr, ruv2).rgb, texture2D(tRefr, suv).rgb, rej);
    z1 = mix(z1, z0, rej);
    float path = max(z1 - wz, 0.0) * dist / max(wz, 1e-3);     // metres of water along the view ray

    // Beer–Lambert: red is absorbed first -> clear teal in the shallows, blue-green in the deep
    vec3 T = exp(-(uAbsorb + uScatter) * path);
    refr = refr * T + uInscatter * (1.0 - T);

    // Foam / bright edge where the water column is under 5 cm
    float vdepth = max(z0 - wz, 0.0) * dist / max(wz, 1e-3) * max(V.y, 0.05);
    float fn = texture2D(tNormal, vWPos.xz * 2.7 + uTime * 0.03).r;
    float foam = (1.0 - smoothstep(0.0, 0.035, vdepth)) * smoothstep(0.5, 0.75, fn + 0.15);
    foam *= 1.0 - smoothstep(0.35, 0.8, -sdM);                  // only along the shore / piers, never on koi backs

    // Sun glint (GGX, roughness ~0.05 widened a little with distance), soft-shouldered so it blooms without clipping
    vec3 spec = sunGGX(N, V, uSunDir, 0.05 + dist * 0.002) * step(0.0, uSunDir.y);
    spec = spec / (1.0 + spec / uSpecMax);

    col = mix(refr, refl, F) + spec;
    col = mix(col, uFoamColor, foam * 0.14);
    if (uIce > 0.001) {
      // winter: ice sheets creep out from the banks (ragged edge), frosted and dusted with snow, crazed with cracks
      float n1 = texture2D(tNormal, vWPos.xz * 0.23).r, n2 = texture2D(tNormal, vWPos.xz * 1.9).g;
      float edge = sdM + 0.85 * uIce + (n1 - 0.5) * 0.7;
      float ice = smoothstep(0.0, 0.05, edge) * uIce;
      float crack = smoothstep(0.47, 0.5, abs(texture2D(tNormal, vWPos.xz * 0.9).b - 0.5) + 0.46) * 0.5;
      vec3 amb = uFogColor * 1.3 + uSunColor * 0.03;
      vec3 iceCol = mix(vec3(0.55, 0.64, 0.7), vec3(0.8, 0.86, 0.9), n2) * amb * (1.0 - crack);
      iceCol = mix(iceCol, vec3(0.9, 0.92, 0.96) * amb * 1.15, uSnowCover * smoothstep(0.35, 0.75, n1 + n2 * 0.5 + edge * 0.6));
      col = mix(col, iceCol + refl * 0.08, ice);
    }
    col = mix(col, uFogColor, (1.0 - exp(-dist * uFogDensity)));
  } else {
    // ================= BELOW THE SURFACE =================
    N = normalize(mix(vec3(0.0, 1.0, 0.0), N, 0.55));   // seen from below the fine ripples read softer
    vec3 I = -V;                                   // camera -> surface (pointing up)
    vec3 Nd = -N;                                  // normal facing the viewer
    vec3 Tr = refract(I, Nd, 1.333);               // water -> air
    vec4 rc = uReflMatrix * vec4(vWPos.x, uWaterY, vWPos.z, 1.0);
    vec2 ruv = clamp(rc.xy / rc.w - N.xz * uReflDistort, 0.001, 0.999);
    vec3 tir = mix(uInscatter * 0.6, textureLod(tRefl, ruv, 2.0).rgb, 0.55);   // soft mirrored darkness of the pond
    if (dot(Tr, Tr) < 1e-4) {
      col = tir;                                   // beyond the critical angle (~48.6°): total internal reflection
    } else {
      float cosT = max(dot(Tr, N), 0.0);
      float F = 0.02 + 0.98 * pow(1.0 - cosT, 5.0);
      // Snell's window: find what the refracted ray sees in the above-water render, fall back to the sky
      vec4 cp = uProj * viewMatrix * vec4(vWPos + Tr * 6.0, 1.0);
      vec2 wuv = cp.xy / cp.w * 0.5 + 0.5;
      vec3 above = sky(Tr);
      if (cp.w > 0.0) {
        float inW = smoothstep(0.0, 0.04, wuv.x) * smoothstep(1.0, 0.96, wuv.x) * smoothstep(0.0, 0.04, wuv.y) * smoothstep(1.0, 0.96, wuv.y);
        above = mix(above, (texture2D(tRefr, clamp(wuv, 0.001, 0.999)).rgb * 0.5 + texture2D(tRefr, clamp(wuv + vec2(0.004, 0.003), 0.001, 0.999)).rgb * 0.25 + texture2D(tRefr, clamp(wuv - vec2(0.004, 0.003), 0.001, 0.999)).rgb * 0.25), inW);
      }
      float sd = max(dot(Tr, uSunDir), 0.0);
      above += uSunColor * (pow(sd, 1500.0) * 40.0 + pow(sd, 60.0) * 0.6);
      col = mix(above, tir, F);
    }
    // absorption + in-scattering along the path from the camera to the surface
    vec3 T = exp(-(uAbsorb + uScatter) * dist);
    col = col * T + uInscatter * (1.0 - T);
  }
  gl_FragColor = vec4(col, 1.0);
}`;

function updateWaves() {
  const base = P.windDir * DEG, offs = [0, 0.45, -0.5, 0.95], Ls = [2.9, 1.6, 0.85, 0.42], As = [0.016, 0.011, 0.007, 0.004];
  const w = (0.3 + P.windSpeed * 1.4) * P.waveHeight;
  for (let i = 0; i < 4; i++) WAVES[i].set(Math.cos(base + offs[i]), Math.sin(base + offs[i]), Ls[i], As[i] * w);
  SH.uWindDir.value.set(Math.cos(base), Math.sin(base));
  SH.uWind.value = P.windSpeed;
}
// CPU mirror of the Gerstner heights (for camera crossing, floating lily pads)
function waterHeightAt(x, z, t) {
  let h = WATER_Y;
  for (const w of WAVES) {
    const k = (Math.PI * 2) / w.z, c = Math.sqrt(9.81 / k), l = Math.hypot(w.x, w.y);
    h += w.w * Math.sin(k * ((w.x / l) * x + (w.y / l) * z - c * t));
  }
  return h;
}
function updateClarity() {
  const c = P.waterClarity;
  SH.uAbsorb.value.set(0.35, 0.08, 0.04).multiplyScalar(1 / c);
  SH.uScatter.value = 0.035 / c;
}

function buildWater() {
  // pond mask (signed distance) for the sim and the surface clip
  const N = SIM.N, md = new Uint8Array(N * N * 4);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = SIM.x0 + (i + 0.5) / N * SIM.size, z = SIM.z0 + (j + 0.5) / N * SIM.size;
    const v = clamp((sdf(x, z) + 2) / 4, 0, 1) * 255, k = (j * N + i) * 4;
    md[k] = md[k + 1] = md[k + 2] = v; md[k + 3] = 255;
  }
  maskTex = new THREE.DataTexture(md, N, N); maskTex.magFilter = maskTex.minFilter = THREE.LinearFilter; maskTex.needsUpdate = true;

  const rtOpts = { type: THREE.HalfFloatType, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, stencilBuffer: false };
  simA = new THREE.WebGLRenderTarget(N, N, rtOpts); simB = new THREE.WebGLRenderTarget(N, N, rtOpts);
  const drops = []; for (let i = 0; i < 16; i++) drops.push(new THREE.Vector4());
  simPass = shaderPass(SIM_FS, {
    tPrev: { value: null }, tMask: { value: maskTex }, uTexel: { value: new THREE.Vector2(1 / N, 1 / N) },
    uDrops: { value: drops }, uNumDrops: { value: 0 }, uPads: { value: Array.from({ length: 16 }, () => new THREE.Vector4()) }, uNumPads: { value: 0 }, uSim: { value: new THREE.Vector4(SIM.x0, SIM.z0, SIM.size, 0) },
  });
  renderer.setRenderTarget(simA); renderer.clear(); renderer.setRenderTarget(simB); renderer.clear(); renderer.setRenderTarget(null);

  let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
  for (const [x, z] of POLY) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z); }
  const m = 0.4, W = maxX - minX + 2 * m, D = maxZ - minZ + 2 * m;
  const geo = new THREE.PlaneGeometry(W, D, 256, 256); geo.rotateX(-Math.PI / 2);
  waterMat = new THREE.ShaderMaterial({
    name: 'Water', vertexShader: WATER_VS, fragmentShader: WATER_FS, side: THREE.DoubleSide,
    uniforms: {
      uTime: SH.uTime, uWaterY: SH.uWaterY, uUnder: { value: 0 }, uNear: { value: camera.near }, uFar: { value: camera.far },
      uReflDistort: { value: 0.035 }, uRefrStr: { value: 0.04 }, uDetail: { value: 0.32 }, uSpecMax: { value: 14 },
      uInvRes: { value: new THREE.Vector2() }, uWind: SH.uWindDir, uGustW: { value: 0.5 }, uSunDir: SH.uSunDir, uSunColor: SH.uSunColor,
      uAbsorb: SH.uAbsorb, uScatter: SH.uScatter, uInscatter: SH.uInscatter, uFoamColor: { value: new THREE.Color() },
      tRefl: { value: null }, tRefr: { value: null }, tRefrDepth: { value: null }, tNormal: { value: TEX.waterNormal },
      tRipple: { value: simA.texture }, tMask: { value: maskTex }, tSky: { value: cubeRT.texture },
      uReflMatrix: { value: new THREE.Matrix4() }, uProj: { value: new THREE.Matrix4() },
      uWaves: { value: WAVES }, uSteep: { value: 0.8 }, uRain: SH.uRain, uIce: SH.uIce, uSnowCover: SH.uSnowCover, uFogDensity: SH.uFogDensity, uFogColor: SH.uFogColor, uSim: { value: new THREE.Vector4(SIM.x0, SIM.z0, SIM.size, 1 / N) },
    },
  });
  SH.uWavesS.value = WAVES; SH.uSimS.value.set(SIM.x0, SIM.z0, SIM.size, 1 / N); SH.tRippleS.value = simA.texture;
  water = new THREE.Mesh(geo, waterMat);
  water.position.set((minX + maxX) / 2, WATER_Y, (minZ + maxZ) / 2);
  water.frustumCulled = false;
  setLayer(water, LAYER.WATER); scene.add(water);
}

function addDrop(x, z, r, s) { if (DROPS.length < 16) DROPS.push({ x, z, r, s }); }
let simTime = 0;
function stepRipples(dt) {
  simTime += dt;
  let steps = 0;
  while (simTime > 1 / 60 && steps < 3) {
    simTime -= 1 / 60; steps++;
    const u = simPass.uniforms;
    u.tPrev.value = simA.texture;
    u.uNumDrops.value = DROPS.length;
    DROPS.forEach((d, i) => u.uDrops.value[i].set(d.x, d.z, d.r, d.s));
    DROPS.length = 0;
    const pads = WORLD.lilies || [];
    u.uNumPads.value = Math.min(16, pads.length);
    for (let i = 0; i < u.uNumPads.value; i++) u.uPads.value[i].set(pads[i].mesh.position.x, pads[i].mesh.position.z, pads[i].r, 0);
    simPass.render(simB);
    const t = simA; simA = simB; simB = t;
  }
  if (simTime > 0.2) simTime = 0;
  waterMat.uniforms.tRipple.value = simA.texture; SH.tRippleS.value = simA.texture;
}

/* --- Render targets & water passes */
const RT = {};
const reflCam = new THREE.PerspectiveCamera(), refrCam = new THREE.PerspectiveCamera();
const shadowCam = new THREE.PerspectiveCamera(1, 1, 0.01, 0.02); shadowCam.position.set(0, -2000, 0); shadowCam.layers.enableAll(); shadowCam.updateMatrixWorld();
const reflMatrix = new THREE.Matrix4();
function makeTargets() {
  for (const k in RT) if (RT[k] && RT[k].dispose) RT[k].dispose();
  const pr = renderer.getPixelRatio(), w = Math.max(2, Math.floor(innerWidth * pr)), h = Math.max(2, Math.floor(innerHeight * pr));
  const div = P.quality === 'High' ? 2 : 4;
  const hf = { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter };
  RT.w = w; RT.h = h;
  RT.refl = new THREE.WebGLRenderTarget(Math.ceil(w / div), Math.ceil(h / div), Object.assign({}, hf, { generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter }));
  // the view into the water is most of the picture: full resolution (and multisampled on High) so koi, stems and
  // stones stay crisp instead of being upscaled into soft, stair-stepped edges
  RT.refr = new THREE.WebGLRenderTarget(w, h, Object.assign({ samples: 2, depthTexture: new THREE.DepthTexture(w, h) }, hf));
  // Low keeps anti-aliasing too (2x): an aliased frame reads as low quality far more than a few ms cost
  RT.main = new THREE.WebGLRenderTarget(w, h, Object.assign({ samples: P.quality === 'High' ? 4 : 2, depthTexture: new THREE.DepthTexture(w, h) }, hf));
  RT.tiny = new THREE.WebGLRenderTarget(1, 1);
  if (typeof onTargetsResized === 'function') onTargetsResized(w, h);
}
const _cp = new THREE.Vector3(), _rp = new THREE.Vector3(), _rv = new THREE.Vector3(), _look = new THREE.Vector3(), _tgt = new THREE.Vector3(), _rm = new THREE.Matrix4(), _up = new THREE.Vector3(0, 1, 0);
// Mirror a camera about the water plane (as in three's Reflector) and build the projective texture matrix
function mirrorCamera(cam, out) {
  _cp.setFromMatrixPosition(cam.matrixWorld);
  _rm.extractRotation(cam.matrixWorld);
  _rp.set(_cp.x, WATER_Y, _cp.z);
  _rv.subVectors(_rp, _cp).reflect(_up).negate().add(_rp);
  _look.set(0, 0, -1).applyMatrix4(_rm).add(_cp);
  _tgt.subVectors(_rp, _look).reflect(_up).negate().add(_rp);
  out.position.copy(_rv);
  out.up.set(0, 1, 0).applyMatrix4(_rm).reflect(_up);
  out.lookAt(_tgt);
  out.fov = cam.fov; out.aspect = cam.aspect; out.near = cam.near; out.far = cam.far;
  out.updateProjectionMatrix(); out.updateMatrixWorld();
  reflMatrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1).multiply(out.projectionMatrix).multiply(out.matrixWorldInverse);
}
function setCamLayers(cam, list) { cam.layers.disableAll(); cam.layers.enable(0); for (const l of list) cam.layers.enable(l); }

function renderWaterPasses(under) {
  water.visible = false;
  skyUniforms.uSunDisk.value = 0;                           // the sun glint is analytic (GGX) in the water shader
  // Reflection: mirrored camera, clip plane at the water level
  mirrorCamera(camera, reflCam);
  setCamLayers(reflCam, under ? [LAYER.UNDER, LAYER.BOTH] : [LAYER.ABOVE, LAYER.BOTH, LAYER.SKY]);
  renderer.clippingPlanes = [under ? CLIP_KEEP_BELOW : CLIP_KEEP_ABOVE];
  SH.uCamUnder.value = under ? 1 : 0;
  renderer.setClearColor(under ? SH.uInscatter.value : 0x000000, 1);
  // koi only ever break the surface by a few cm; mirroring those backs reads as a doubled fish, so above water they stay out
  const hideKoi = !under && KOI.body; if (hideKoi) KOI.body.visible = KOI.fins.visible = KOI.eyes.visible = false;
  if (!under) for (const o of WORLD.noReflect) o.visible = false;
  renderer.setRenderTarget(RT.refl); renderer.clear(); renderer.render(scene, reflCam);
  if (hideKoi) KOI.body.visible = KOI.fins.visible = KOI.eyes.visible = true;
  if (!under) for (const o of WORLD.noReflect) o.visible = true;
  // Refraction: the far side of the surface as seen by the real camera (+ its depth)
  refrCam.position.copy(camera.position); refrCam.quaternion.copy(camera.quaternion);
  refrCam.fov = camera.fov; refrCam.aspect = camera.aspect; refrCam.near = camera.near; refrCam.far = camera.far;
  refrCam.updateProjectionMatrix(); refrCam.updateMatrixWorld();
  setCamLayers(refrCam, under ? [LAYER.ABOVE, LAYER.BOTH, LAYER.SKY] : [LAYER.UNDER, LAYER.BOTH]);
  renderer.clippingPlanes = [under ? CLIP_KEEP_ABOVE : CLIP_KEEP_BELOW];
  SH.uCamUnder.value = 0;
  renderer.setClearColor(0x000000, 1);
  renderer.setRenderTarget(RT.refr); renderer.clear(); renderer.render(scene, refrCam);
  renderer.clippingPlanes = [CLIP_NONE];
  skyUniforms.uSunDisk.value = 1;
  water.visible = true;
}

/* ------------------------------------------------------------------ 11. KOI */
// Body outline (s = 0 nose .. 1 tail base; body length = 1 unit). Proportions follow a mature Sanke / Kohaku:
// deep rounded back, broad shoulders, blunt head with a protrusible mouth.
const KOI_TOP = [[0, 0.006], [0.015, 0.025], [0.05, 0.053], [0.1, 0.076], [0.17, 0.095], [0.26, 0.117], [0.36, 0.126], [0.48, 0.117], [0.62, 0.091], [0.76, 0.062], [0.9, 0.039], [1.0, 0.032]];
const KOI_BOT = [[0, -0.006], [0.015, -0.021], [0.05, -0.043], [0.1, -0.058], [0.17, -0.07], [0.28, -0.087], [0.42, -0.093], [0.56, -0.083], [0.7, -0.061], [0.84, -0.039], [1.0, -0.028]];
const KOI_W = [[0, 0.007], [0.015, 0.03], [0.05, 0.06], [0.1, 0.077], [0.17, 0.087], [0.27, 0.098], [0.37, 0.1], [0.5, 0.087], [0.64, 0.063], [0.78, 0.038], [0.91, 0.021], [1.0, 0.013]];
function crInterp(tab, s) {
  let i = 0; while (i < tab.length - 2 && tab[i + 1][0] < s) i++;
  const p0 = tab[Math.max(0, i - 1)], p1 = tab[i], p2 = tab[i + 1], p3 = tab[Math.min(tab.length - 1, i + 2)];
  const t = clamp((s - p1[0]) / (p2[0] - p1[0]), 0, 1);
  const m1 = (p2[1] - p0[1]) / (p2[0] - p0[0] || 1) * (p2[0] - p1[0]), m2 = (p3[1] - p1[1]) / (p3[0] - p1[0] || 1) * (p2[0] - p1[0]);
  const t2 = t * t, t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * p1[1] + (t3 - 2 * t2 + t) * m1 + (-2 * t3 + 3 * t2) * p2[1] + (t3 - t2) * m2;
}
const KOI_EYE = { s: 0.088, y: 0.014, r: 0.0175 };
function koiSection(s, th) {
  const bulk = smoothstep(0.03, 0.16, s) * (1 - 0.5 * smoothstep(0.7, 1.0, s));   // mature, broad-shouldered body
  const top = crInterp(KOI_TOP, s) * (1 + 0.06 * bulk), bot = crInterp(KOI_BOT, s) * (1 + 0.06 * bulk), w = crInterp(KOI_W, s) * (1 + 0.2 * bulk);
  const yc = (top + bot) / 2, at = top - yc, ab = yc - bot, c = Math.cos(th), sn = Math.sin(th);
  let y = yc + (c > 0 ? at * Math.pow(c, 0.92) : -ab * Math.pow(-c, 0.88));
  let z = w * Math.sign(sn) * Math.pow(Math.abs(sn), 0.9);
  // operculum: the gill cover stands a little proud with a crisp posterior edge
  const op = smoothstep(0.1, 0.2, s) * (1 - smoothstep(0.2, 0.215, s)) * smoothstep(0.55, 0.0, c);
  // eye bulge
  const eb = Math.exp(-(((s - KOI_EYE.s) / 0.028) ** 2) - (((c - 0.35) / 0.35) ** 2)) * Math.abs(sn);
  const k = 1 + 0.03 * op + 0.1 * eb;
  return [(y - yc) * k + yc, z * k];
}
function koiBodyGeo() {
  const NS = 104, NR = 56, pos = [], uv = [], lip = [], idx = [];
  const mouthY = -0.004, mouthR = 0.021;
  const ring = (fn) => { for (let j = 0; j <= NR; j++) fn(j, (j / NR) * Math.PI * 2); };
  // ring 0: lip ring (open-state positions, collapsed in the shader when the mouth is shut)
  ring((j, th) => { pos.push(0.5, mouthY + Math.cos(th) * mouthR * 0.9, Math.sin(th) * mouthR); uv.push(0, j / NR); lip.push(1); });
  for (let i = 1; i <= NS; i++) {
    const s = 0.012 + 0.988 * Math.pow((i - 1) / (NS - 1), 1.12);
    ring((j, th) => { const [y, z] = koiSection(s, th); pos.push(0.5 - s, y, z); uv.push(s, j / NR); lip.push(i === 1 ? 0.5 : 0); });
  }
  for (let i = 0; i < NS; i++) for (let j = 0; j < NR; j++) {
    const a = i * (NR + 1) + j, b = a + NR + 1;
    idx.push(a, a + 1, b, a + 1, b + 1, b);
  }
  // mouth interior: a recessed throat cone behind the lips
  const inner = pos.length / 3;
  ring((j, th) => { pos.push(0.5 - 0.02, mouthY + Math.cos(th) * mouthR * 0.55, Math.sin(th) * mouthR * 0.6); uv.push(0.005, j / NR); lip.push(2); });
  const throat = pos.length / 3; pos.push(0.5 - 0.04, mouthY, 0); uv.push(0.01, 0.5); lip.push(2);
  for (let j = 0; j < NR; j++) { idx.push(j, inner + j, j + 1, j + 1, inner + j, inner + j + 1); idx.push(inner + j, throat, inner + j + 1); }
  // tail cap
  const cap = pos.length / 3, last = NS * (NR + 1); pos.push(-0.5, (crInterp(KOI_TOP, 1) + crInterp(KOI_BOT, 1)) / 2, 0); uv.push(1, 0.5); lip.push(0);
  for (let j = 0; j < NR; j++) idx.push(last + j, last + j + 1, cap);
  // two pairs of barbels at the corners of the mouth (they ride forward with the lips)
  for (const side of [1, -1]) for (const [len, off, r0] of [[0.028, 0.0, 0.0024], [0.016, 0.012, 0.0017]]) {
    const base = pos.length / 3, segs = 7, rad = 6;
    for (let a = 0; a <= segs; a++) {
      const t = a / segs, cx = 0.5 - 0.008 - off - t * len * 0.55, cy = mouthY - 0.008 - t * len * 0.72, cz = side * (0.013 + t * len * 0.35), r = r0 * (1 - t * 0.75);
      for (let b = 0; b <= rad; b++) { const an = (b / rad) * Math.PI * 2; pos.push(cx + Math.cos(an) * r, cy, cz + Math.sin(an) * r); uv.push(0.02, 0.5); lip.push(0.5); }
    }
    for (let a = 0; a < segs; a++) for (let b = 0; b < rad; b++) { const p = base + a * (rad + 1) + b, q = p + rad + 1; idx.push(p, q, p + 1, p + 1, q, q + 1); }
  }
  for (let k = 0; k < idx.length; k += 3) { const tmp = idx[k + 1]; idx[k + 1] = idx[k + 2]; idx[k + 2] = tmp; }   // outward-facing winding
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('aLip', new THREE.Float32BufferAttribute(lip, 1));
  g.setIndex(idx); g.computeVertexNormals();
  // stitch the dorsal seam (first/last vertex of every ring share a position)
  const n = g.attributes.normal;
  for (let i = 0; i <= NS; i++) {
    const a = i * (NR + 1), b = a + NR;
    const x = n.getX(a) + n.getX(b), y = n.getY(a) + n.getY(b), z = n.getZ(a) + n.getZ(b), l = Math.hypot(x, y, z) || 1;
    n.setXYZ(a, x / l, y / l, z / l); n.setXYZ(b, x / l, y / l, z / l);
  }
  return g;
}
// Fins: aFin = (type, distance from root 0..1, across -1..1, -), aPivot = root pivot.
// types: 0 dorsal, 1 pectoral L, 2 pectoral R, 3 pelvic L, 4 pelvic R, 5 anal, 6 caudal
function koiFinGeo() {
  const pos = [], uv = [], fin = [], piv = [], idx = [];
  const grid = (nu, nv, fn, type, pivot) => {
    const b = pos.length / 3;
    for (let i = 0; i <= nu; i++) for (let j = 0; j <= nv; j++) {
      const u = i / nu, v = j / nv, p = fn(u, v);
      pos.push(p[0], p[1], p[2]); uv.push(u, v); fin.push(type, u, v * 2 - 1, 0); piv.push(...pivot);
    }
    for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) { const a = b + i * (nv + 1) + j, c = a + nv + 1; idx.push(a, c, a + 1, a + 1, c, c + 1); }
  };
  const top = (s) => crInterp(KOI_TOP, s), bot = (s) => crInterp(KOI_BOT, s), wid = (s) => crInterp(KOI_W, s);
  // dorsal: long, rising steeply at the front and tapering back
  grid(10, 30, (u, v) => {
    const s = lerp(0.37, 0.76, v), h = 0.078 * Math.pow(Math.sin(Math.PI * Math.pow(v, 0.5)), 0.75) * (1.2 - 0.55 * v);
    return [0.5 - s - u * 0.045 * (0.3 + v), top(s) - 0.004 + u * h, 0];
  }, 0, [0, 0, 0]);
  // caudal: broad forked tail with rounded lobes
  grid(14, 30, (u, v) => {
    const w = v * 2 - 1, aw = Math.abs(w);
    const L = (0.15 + 0.11 * Math.pow(aw, 1.3) - 0.045 * (1 - aw)) * (1 - 0.22 * Math.pow(aw, 8));
    const half = 0.026 + 0.17 * Math.pow(u, 0.85);
    return [-0.485 - L * u, w * half + 0.004, 0];
  }, 6, [-0.485, 0, 0]);
  // anal fin
  grid(6, 10, (u, v) => { const s = lerp(0.74, 0.86, v); return [0.5 - s - u * 0.03, bot(s) + 0.003 - u * 0.05 * Math.sin(Math.PI * Math.pow(v, 0.6)), 0]; }, 5, [0, 0, 0]);
  // paired fins: large fan pectorals behind the gill covers, smaller pelvics
  for (const side of [1, -1]) {
    for (const [s, L, W, type] of [[0.225, 0.2, 0.08, side > 0 ? 1 : 2], [0.5, 0.108, 0.042, side > 0 ? 3 : 4]]) {
      const pv = [0.5 - s, bot(s) * 0.62 + (type > 2 ? 0.004 : 0), side * wid(s) * (type > 2 ? 0.55 : 0.72)];
      const D1 = new THREE.Vector3(-0.55, -0.24, side * 0.8).normalize();
      const D2 = new THREE.Vector3(1, 0, 0).addScaledVector(D1, -D1.x).normalize();
      grid(10, 14, (u, v) => {
        // a rounded fan: rays radiate from a narrow base and end on a convex, scalloped margin (never a square tip)
        const w = v * 2 - 1, Leff = L * (0.48 + 0.52 * Math.sqrt(Math.max(0, 1 - w * w))) * (1 + 0.14 * w) * (1 + 0.015 * Math.sin(v * 40.0));
        const across = w * (0.005 + W * 0.92 * Math.pow(u, 0.95) * (1 - 0.15 * smoothstep(0.85, 1, u)));
        return [pv[0] + D1.x * Leff * u + D2.x * across, pv[1] + D1.y * Leff * u + D2.y * across, pv[2] + D1.z * Leff * u + D2.z * across];
      }, type, pv);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('aFin', new THREE.Float32BufferAttribute(fin, 4));
  g.setAttribute('aPivot', new THREE.Float32BufferAttribute(piv, 3));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
function koiEyeGeo() {
  const geos = [];
  for (const side of [1, -1]) {
    const [yb, zb] = koiSection(KOI_EYE.s, Math.PI / 2 - 0.42);
    const g = new THREE.SphereGeometry(KOI_EYE.r, 28, 20);
    g.rotateX(side > 0 ? Math.PI / 2 : -Math.PI / 2);          // pole (iris) faces outward
    const c = [0.5 - KOI_EYE.s, yb + 0.002, side * (Math.abs(zb) - KOI_EYE.r * 0.45)];
    g.translate(c[0], c[1], c[2]);
    const n = g.attributes.position.count, cc = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) cc.set(c, i * 3);
    g.setAttribute('aEyeC', new THREE.BufferAttribute(cc, 3));
    geos.push(g);
  }
  const m = mergeGeos(geos);
  const cc = new Float32Array(m.attributes.position.count * 3); let o = 0;
  for (const g of geos) { cc.set(g.attributes.aEyeC.array, o); o += g.attributes.aEyeC.array.length; }
  m.setAttribute('aEyeC', new THREE.BufferAttribute(cc, 3));
  return m;
}

// Variety palettes (sRGB) and pattern rules. The roster order puts the iconic varieties first.
const KOI_STYLES = {
  // flags: utsuri (sumi wraps the flanks, menware on the head), hajiro (white fin tips), doitsu (scaleless, mirror-scale rows)
  kohaku:   { steps: 3, base: 0xe8e4dc, hi: 0xe8481c, sumi: 0x151416, belly: 0xebe7e0, fin: 0xe6e2db, finBase: 0xef6a2a, hiCover: 0.56, sumiCover: 0, moto: 0.9 },
  sanke:    { steps: 3, base: 0xe8e4dc, hi: 0xea4d1e, sumi: 0x121214, belly: 0xebe7e0, fin: 0xe6e2db, finBase: 0xee6428, hiCover: 0.52, sumiCover: 0.3, moto: 0.85 },
  showa:    { base: 0xe5e0d8, hi: 0xdf3f1a, sumi: 0x0f0f11, belly: 0xe3ded6, fin: 0xe2ddd6, finBase: 0x141416, hiCover: 0.45, sumiCover: 0.62, moto: 1, utsuri: 1, hajiro: 0.35 },
  yamabuki: { base: 0xf6ae1c, hi: 0xf6ae1c, sumi: 0x000000, belly: 0xf9c95a, fin: 0xf7c35a, finBase: 0xf0a020, hiCover: 0, sumiCover: 0, moto: 0.4, metal: 1, irid: 0.55, retic: -0.32 },
  asagi:    { base: 0x6d8094, hi: 0xde5a26, sumi: 0x000000, belly: 0xe7dfd6, fin: 0xe9e4de, finBase: 0xde6a2e, hiCover: 0, sumiCover: 0, moto: 1, retic: 0.8, asagi: 1 },
  tancho:   { base: 0xebe8e2, hi: 0xd92a1b, sumi: 0x000000, belly: 0xedeae4, fin: 0xe8e4dc, finBase: 0xe8e4dc, hiCover: 0, sumiCover: 0, moto: 0, tancho: 1 },
  platinum: { base: 0xe4e2dc, hi: 0xe4e2dc, sumi: 0x000000, belly: 0xefede8, fin: 0xeae8e3, finBase: 0xdad7d0, hiCover: 0, sumiCover: 0, moto: 0.3, metal: 1, irid: 0.6, retic: 0.2 },
  chagoi:   { base: 0x7b5634, hi: 0x7b5634, sumi: 0x000000, belly: 0x9b7a55, fin: 0x8c6a48, finBase: 0x6e4c30, hiCover: 0, sumiCover: 0, moto: 0.6, retic: -0.7 },
  bekko:    { base: 0xe8e4dc, hi: 0xe8e4dc, sumi: 0x131315, belly: 0xebe7e0, fin: 0xe6e2db, finBase: 0x303032, hiCover: 0, sumiCover: 0.28, moto: 0.5 },
  orenji:   { base: 0xf86e12, hi: 0xf86e12, sumi: 0x000000, belly: 0xfa9a40, fin: 0xf4a052, finBase: 0xe46a18, hiCover: 0, sumiCover: 0, moto: 0.4, metal: 1, irid: 0.5, retic: -0.2 },   // Orenji Ogon
  karasu:   { base: 0x141316, hi: 0x141316, sumi: 0x0b0b0d, belly: 0x2e2a27, fin: 0x1b1a1d, finBase: 0x0e0e10, hiCover: 0, sumiCover: 0, moto: 0, retic: 0.3, hajiro: 0.9 },  // Karasugoi, 'crow' koi
  shiroutsuri: { base: 0xe9e6df, hi: 0xe9e6df, sumi: 0x0f0f11, belly: 0xe8e4dc, fin: 0xe6e2db, finBase: 0x121214, hiCover: 0, sumiCover: 0.55, moto: 1, utsuri: 1 },
  hiutsuri: { base: 0xdc4a1c, hi: 0xdc4a1c, sumi: 0x0f0f11, belly: 0xe8763e, fin: 0xec8a4a, finBase: 0x141416, hiCover: 0, sumiCover: 0.5, moto: 1, utsuri: 1 },
  kujaku:   { base: 0xe2e0da, hi: 0xf07024, sumi: 0x2a2a2e, belly: 0xecebe6, fin: 0xe9e7e2, finBase: 0xef7a30, hiCover: 0.5, sumiCover: 0, moto: 0.6, metal: 1, irid: 0.6, retic: -0.85 },  // peacock: metallic, matsuba net
  doitsu:   { steps: 2.5, base: 0xebe8e1, hi: 0xe64418, sumi: 0x151416, belly: 0xedeae4, fin: 0xe6e2db, finBase: 0xef6a2a, hiCover: 0.6, sumiCover: 0, moto: 0.9, doitsu: 1 },   // Doitsu Kohaku (German, scaleless)
  goshiki:  { base: 0xcfd1d4, hi: 0xc8341c, sumi: 0x000000, belly: 0xdcdad6, fin: 0xdcdad6, finBase: 0xc54020, hiCover: 0.5, sumiCover: 0, moto: 0.7, retic: -0.75 },
  benigoi:  { base: 0xd4461a, hi: 0xd4461a, sumi: 0x000000, belly: 0xe8814a, fin: 0xe07a42, finBase: 0xcc4a1c, hiCover: 0, sumiCover: 0, moto: 0.3, retic: -0.32 },
  ochiba:   { base: 0x8a97a4, hi: 0xa8662e, sumi: 0x000000, belly: 0xd9d6cf, fin: 0xc9ccd0, finBase: 0xa0602c, hiCover: 0.45, sumiCover: 0, moto: 0.6, retic: 0.55 },   // Ochiba Shigure, 'autumn leaves on water'
};
// The pond's collection: [variety, size class (S juvenile ~25 cm, M ~45 cm, L jumbo ~70 cm), options: fly = butterfly / long-fin, gin = Gin Rin sparkle scales]
const KOI_ROSTER_DEF = [
  ['kohaku', 'L'], ['sanke', 'M'], ['yamabuki', 'L'], ['showa', 'L'], ['orenji', 'M', { gin: 1 }], ['karasu', 'M'], ['tancho', 'M'], ['bekko', 'S'],
  ['sanke', 'S'], ['asagi', 'M'], ['platinum', 'M', { fly: 1 }], ['chagoi', 'L'], ['shiroutsuri', 'M'], ['hiutsuri', 'S'], ['kujaku', 'M', { fly: 1 }],
  ['doitsu', 'M'], ['goshiki', 'S'], ['benigoi', 'S'], ['ochiba', 'M'], ['kohaku', 'S', { gin: 1 }],
];
const KOI_ROSTER = KOI_ROSTER_DEF.map((r) => r[0]);
const KOI_N = KOI_ROSTER.length;
const KOI_SIZE_RANGE = { S: [0.21, 0.29], M: [0.38, 0.5], L: [0.62, 0.74] };

// Pattern fields per fish (resolution-independent edges are recovered in the shader):
// R = hi (red) field, G = sumi (black) field, B = fine tone variation, A = belly / ventral field. 0.5 = pattern edge.
function koiPatternAtlas() {
  const W = 256, H = 128, data = new Uint8Array(W * H * KOI_N * 4);
  for (let f = 0; f < KOI_N; f++) {
    const st = KOI_STYLES[KOI_ROSTER[f]], seed = 101 + f * 37;
    // coarse noise evaluated on a small grid and bilinearly upsampled (patterns are low frequency)
    const GW = 97, GH = 49, n1 = new Float32Array(GW * GH), n2 = new Float32Array(GW * GH), n3 = new Float32Array(GW * GH);
    for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) {
      const s = i / (GW - 1), th = (j / (GH - 1)) * Math.PI * 2, cy = Math.cos(th) * 1.25, sy = Math.sin(th) * 1.25;
      n1[j * GW + i] = fbm3(s * 4.2 + seed * 0.13, cy * 0.75, sy * 0.62, 4, seed);   // broad patches that wrap over the back
      n2[j * GW + i] = fbm3(s * 8.5, cy * 2.1 + seed * 0.07, sy * 2.1, 4, seed + 5);
      n3[j * GW + i] = fbm3(s * 16, cy * 3.5, sy * 3.5 + seed * 0.05, 2, seed + 9);
    }
    const samp = (arr, s, v) => { const x = s * (GW - 1), y = v * (GH - 1), i = Math.min(GW - 2, Math.floor(x)), j = Math.min(GH - 2, Math.floor(y)), u = x - i, w = y - j;
      return lerp(lerp(arr[j * GW + i], arr[j * GW + i + 1], u), lerp(arr[(j + 1) * GW + i], arr[(j + 1) * GW + i + 1], u), w); };
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const s = (x + 0.5) / W, v = (y + 0.5) / H, th = v * Math.PI * 2, dors = Math.cos(th);
      const a1 = samp(n1, s, v), a2 = samp(n2, s, v), a3 = samp(n3, s, v);
      const top = smoothstep(-0.42, 0.1, dors);
      let hi = 0, sumi = 0;
      if (st.hiCover > 0) {
        let fld = a1 + (st.hiCover - 0.5) * 0.55;
        if (st.steps) {                                   // 2-4 separate patches along the back with white 'windows' between
          const nS = st.steps + Math.floor(hash3i(f, 7, 1, 3) * 1.99) - 0.5, ph = hash3i(f, 8, 1, 3) * 0.6;
          fld = fld * 0.7 + 0.2 * Math.cos(((s - 0.1) / 0.8) * Math.PI * 2 * nS * 0.5 * 2 + ph) + 0.05 * (1 - smoothstep(0.08, 0.2, s));
        }
        hi = 0.5 + fld * 4.2;
        hi = lerp(-0.4, hi, top) * smoothstep(0.035, 0.085, s) * (1 - 0.8 * smoothstep(0.92, 1.0, s));   // clean white nose, fading at the peduncle
      }
      if (st.tancho) { const d = Math.hypot((s - 0.115) * 1.0, Math.acos(clamp(dors, -1, 1)) * 0.07 * 0.85); hi = 0.5 + (0.042 - d) / 0.01; }
      if (st.asagi) hi = 0.5 + (-dors - 0.25 + a1 * 0.35) * 3.2 + (s < 0.2 ? (0.2 - s) * 8 * smoothstep(0.6, -0.2, dors) : 0);
      if (st.sumiCover > 0) {
        const showa = !!st.utsuri;
        const zone = showa ? smoothstep(-0.7, -0.1, dors) : smoothstep(0.05, 0.45, dors) * smoothstep(0.2, 0.3, s);
        sumi = (0.5 + (a2 + (st.sumiCover - 0.5) * 0.6) * 4.5) * zone;
        if (showa) sumi = Math.max(sumi, (0.5 + (0.09 - Math.abs(s - 0.12 + 0.03 * dors)) / 0.02) * smoothstep(0.1, 0.5, dors) * 0.9); // menware stripe on the head
      }
      const belly = smoothstep(-0.3, -0.85, dors);
      const k = ((f * H + y) * W + x) * 4;
      data[k] = clamp(hi, 0, 1) * 255; data[k + 1] = clamp(sumi, 0, 1) * 255; data[k + 2] = clamp(0.5 + a3 * 0.9, 0, 1) * 255; data[k + 3] = belly * 255;
    }
  }
  const t = new THREE.DataTexture(data, W, H * KOI_N); t.colorSpace = THREE.NoColorSpace;
  t.wrapS = THREE.ClampToEdgeWrapping; t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.needsUpdate = true;
  return t;
}
// Overlapping cycloid scales. RG = normal xy, B = per-scale random id, A = exposed-rim mask.
function koiScaleTexture() {
  const N = 512, cols = 8, rows = 8, H = new Float32Array(N * N), ID = new Float32Array(N * N), RIM = new Float32Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const fx = (x / N) * cols, fy = (y / N) * rows;
    let bestC = 1e9, h = 0, id = 0, rim = 0;
    for (let r = Math.floor(fy) - 1; r <= Math.floor(fy) + 1; r++) {
      const off = (((r % 2) + 2) % 2) * 0.5;
      for (let c = Math.floor(fx - off) - 1; c <= Math.floor(fx - off) + 1; c++) {
        const cx = c + off + 0.5, cy = r + 0.5, dx = (fx - cx) / 0.95, dy = (fy - cy) / 0.78, d = Math.hypot(dx, dy);
        if (d < 1 && cx < bestC) {                         // the most anterior covering scale is on top
          bestC = cx;
          const wc = ((c % cols) + cols) % cols, wr = ((r % rows) + rows) % rows;
          id = hash3i(wc, wr, 5, 9);
          const post = smoothstep(-0.3, 0.9, dx);          // exposed posterior field lifts toward the free edge
          h = 0.25 + 0.6 * post - 0.55 * smoothstep(0.86, 1.0, d) + 0.025 * Math.sin(d * 34) * post + (id - 0.5) * 0.12 * dy;
          rim = smoothstep(0.62, 0.97, d) * smoothstep(-0.2, 0.35, dx);
        }
      }
    }
    H[y * N + x] = h; ID[y * N + x] = id; RIM[y * N + x] = rim;
  }
  const nrm = heightToNormal(H, N, N, 5.5);
  for (let i = 0; i < N * N; i++) { nrm[i * 4 + 2] = ID[i] * 255; nrm[i * 4 + 3] = RIM[i] * 255; }
  return dataTex(nrm, N, N, false);
}
// Fin membrane: R = membrane density, G = ray mask, A = opacity (ragged, thinner at the edge)
function koiFinTexture() {
  const W = 512, Hh = 256, cv = makeCanvas(W, Hh), g = cv.getContext('2d');
  const img = g.createImageData(W, Hh), d = img.data;
  const nRays = 22;
  for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) {
    const u = x / W, v = y / Hh;
    // rays fan out and fork two-thirds of the way to the edge; segmented joints
    let ray = 0;
    const k = v * nRays, base = Math.abs((k % 1) - 0.5);
    const fork = smoothstep(0.55, 0.75, u) * 0.22;
    const dr = Math.min(Math.abs(base - fork), Math.abs(base + fork));
    ray = (1 - smoothstep(0.035, 0.09 * (1 - u * 0.5), dr)) * (0.75 + 0.25 * Math.sin(u * 90 + Math.floor(k) * 1.7) ** 2);
    const mem = 0.42 + 0.18 * fbm2P(u * 6, v * 12, 6, 3, 7) - 0.2 * u;
    const fray = u > 0.86 ? smoothstep(1.0, 0.86, u + 0.06 * (hash3i(y >> 2, 1, 1, 3) - 0.5) + 0.05 * Math.sin(v * 140)) : 1;
    const a = clamp((mem * 1.2 + ray * 0.8) * fray, 0, 1);            // milky membrane, opaque white rays
    const i = (y * W + x) * 4;
    d[i] = clamp(mem, 0, 1) * 255; d[i + 1] = ray * 255; d[i + 2] = 255; d[i + 3] = a * 255;
  }
  g.putImageData(img, 0, 0);
  return canvasTex(cv, false);
}
function koiEyeTexture() {
  const cv = makeCanvas(256, 128), g = cv.getContext('2d');
  // v = 0 (top rows) is the outward pole: pupil, then golden iris ring, then dark sclera
  const grd = g.createLinearGradient(0, 0, 0, 128);
  grd.addColorStop(0, '#020202'); grd.addColorStop(0.19, '#040404'); grd.addColorStop(0.205, '#3a2a10'); grd.addColorStop(0.24, '#d8a93a');
  grd.addColorStop(0.3, '#f1d27a'); grd.addColorStop(0.36, '#b98a2c'); grd.addColorStop(0.4, '#2a2016'); grd.addColorStop(0.55, '#1a1512'); grd.addColorStop(1, '#0d0b0a');
  g.fillStyle = grd; g.fillRect(0, 0, 256, 128);
  g.globalAlpha = 0.35;
  for (let i = 0; i < 90; i++) { const x = Math.random() * 256; g.strokeStyle = Math.random() < 0.5 ? '#6b4a18' : '#fff0b0'; g.beginPath(); g.moveTo(x, 26); g.lineTo(x + (Math.random() - 0.5) * 3, 48); g.stroke(); }
  return canvasTex(cv, true);
}

const KOI_VS_PARS = /* glsl */`
attribute vec4 aSwim;      // tail phase, tail amplitude, turn bend, fish index
attribute vec4 aSwim2;     // pectoral phase L, pectoral phase R, girth, fin spread
attribute vec4 aSwim3;     // mouth open, gill phase, eye yaw, eye pitch
varying vec2 vBodyUv;
varying float vFishIdx;
varying float vMouthIn;
varying float vFinEdge;
varying float vFinType;
// lateral spine offset: travelling wave whose amplitude grows toward the tail + C-bend curvature in turns
float koiA(float s){ return aSwim.y * (0.05 + 0.95 * s * s); }
float koiLat(float s){ return koiA(s) * sin(s * 5.7 - aSwim.x) + aSwim.z * (s - 0.3) * (s - 0.3); }
float koiLatD(float s){
  float A = koiA(s), dA = aSwim.y * 1.9 * s;
  return dA * sin(s * 5.7 - aSwim.x) + A * 5.7 * cos(s * 5.7 - aSwim.x) + 2.0 * aSwim.z * (s - 0.3);
}
vec3 rotY(vec3 v, float a){ float c = cos(a), s = sin(a); return vec3(c * v.x + s * v.z, v.y, -s * v.x + c * v.z); }
vec3 rotX(vec3 v, float a){ float c = cos(a), s = sin(a); return vec3(v.x, c * v.y - s * v.z, s * v.y + c * v.z); }
vec3 rotZ(vec3 v, float a){ float c = cos(a), s = sin(a); return vec3(c * v.x - s * v.y, s * v.x + c * v.y, v.z); }
#ifdef KOI_BODY
  attribute float aLip;
#endif
#ifdef KOI_FIN
  attribute vec4 aFin;
  attribute vec3 aPivot;
  uniform float uDorsalFold[${KOI_N}];
  uniform float uFinLong[${KOI_N}];     // butterfly (hirenaga) koi: long, flowing fins
#endif
#ifdef KOI_EYE
  attribute vec3 aEyeC;
#endif
`;
const KOI_VS_NORMAL = /* glsl */`
float kS = 0.5 - position.x;
#ifdef KOI_EYE
  kS = 0.5 - aEyeC.x;
  float eSide = sign(aEyeC.z);
  objectNormal = rotX(rotY(objectNormal, aSwim3.z * eSide), aSwim3.w * eSide);
#endif
float kSlope = -koiLatD(kS);
objectNormal = normalize(vec3(objectNormal.x - kSlope * objectNormal.z, objectNormal.y, objectNormal.z));
vBodyUv = uv; vFishIdx = aSwim.w; vMouthIn = 0.0; vFinEdge = 0.0; vFinType = -1.0;
#ifdef KOI_BODY
  vMouthIn = step(1.5, aLip);
#endif
#ifdef KOI_FIN
  vFinEdge = aFin.y; vFinType = aFin.x;
#endif
`;
const KOI_VS_BEGIN = /* glsl */`
{
  vec3 p = transformed;
  #ifdef KOI_BODY
    float s0 = 0.5 - position.x, open = aSwim3.x;
    if (aLip > 0.25) {                      // protrusible mouth: the lips open into an 'O' and extend forward
      vec2 mc = vec2(-0.004, 0.0);
      if (aLip > 0.75) p.yz = mc + (p.yz - mc) * open;
      else p.yz = mc + (p.yz - mc) * (1.0 + 0.3 * open);          // lips roll outward
      p.x += 0.022 * open * (aLip > 0.75 ? 1.0 : 0.6);
    }
    float gill = exp(-pow((s0 - 0.19) / 0.03, 2.0)) * step(p.y, 0.035);
    p.yz *= 1.0 + gill * 0.03 * (0.5 + 0.5 * sin(aSwim3.y));        // gill covers breathe
    float gm = smoothstep(0.08, 0.35, s0) * (1.0 - smoothstep(0.72, 1.0, s0));
    p.yz *= mix(1.0, aSwim2.z, gm);                                   // girth varies fish to fish
  #endif
  #ifdef KOI_EYE
    float es = sign(aEyeC.z);
    p = aEyeC + rotX(rotY(p - aEyeC, aSwim3.z * es), aSwim3.w * es);  // eyes swivel in their sockets
  #endif
  #ifdef KOI_FIN
    vec3 q = p - aPivot;
    float t = aFin.x, fl = uFinLong[int(aSwim.w + 0.5)], fu = aFin.y;
    if (t > 0.5 && t < 4.5) q *= 1.0 + fl * (t < 2.5 ? 0.95 : 0.8) * fu;             // long flowing paired fins
    else if (t > 5.5) { q.x *= 1.0 + fl * 1.0 * fu; q.y *= 1.0 + fl * 0.4 * fu; }      // long veil tail
    else if (t < 0.5) { q.y += fl * 0.05 * fu; q.x -= fl * 0.035 * fu * (0.4 + aFin.z * 0.3 + 0.3); }
    else { q.y -= fl * 0.035 * fu; q.x -= fl * 0.03 * fu; }
    if (t > 0.5 && t < 4.5) {                                         // paired fins: fold back when fast, flare and scull when slow
      float side = (t < 1.5 || (t > 2.5 && t < 3.5)) ? 1.0 : -1.0;
      bool pect = t < 2.5;
      float ph = side > 0.0 ? aSwim2.x : aSwim2.y;
      float spread = aSwim2.w;
      q = rotY(q, -side * (1.0 - spread) * (pect ? 1.05 : 0.6));
      float flap = side * ((0.32 * sin(ph) * (0.35 + 0.65 * spread)) - 0.12) * (0.35 + 0.65 * aFin.y);
      q = rotX(q, flap);
      q.y += sin(ph * 1.3 + aFin.z * 2.5) * (0.004 + fl * 0.012 * fu) * aFin.y;          // membrane ripple (long fins billow)
    } else if (t > 5.5) {                                             // caudal: secondary wave lags the body
      q.z += sin(aSwim.x - 1.1 - aFin.y * 2.4) * (aSwim.y * 0.45 + 0.004) * aFin.y;
      q.z += sin(aSwim.x * 0.5 + aFin.z * 3.0) * 0.004 * aFin.y;
      q.z += sin(aSwim.x - 1.8 - fu * 3.2) * fl * (aSwim.y * 0.5 + 0.012) * fu * fu;          // veil tail trails and billows
    } else {                                                          // dorsal / anal flutter
      q.z += sin(aSwim.x * 0.9 - aFin.z * 5.0) * 0.007 * aFin.y;
      if (t < 0.5) { float fold = uDorsalFold[int(aSwim.w + 0.5)]; q.x -= aFin.y * 0.075 * fold; q.y -= aFin.y * 0.062 * fold; }   // laid flat when stroked
    }
    p = aPivot + q;
  #endif
  p.z += koiLat(0.5 - p.x);
  transformed = p;
}
`;
const KOI_FS_PARS = /* glsl */`
uniform sampler2D tPattern;
// per-fish palette rows: 0 base, 1 hi, 2 sumi, 3 belly, 4 fin, 5 fin base, 6 (metallic, reticulation, iridescence, motoguro),
// 7 (doitsu, gin rin, hajiro, long fins)
uniform sampler2D tPal;
#define KOI_NF ${KOI_N}.0
vec4 kPal(float fi, float k){ return texture2D(tPal, vec2((k + 0.5) / 8.0, (fi + 0.5) / KOI_NF)); }
varying vec2 vBodyUv;
varying float vFishIdx;
varying float vMouthIn;
varying float vFinEdge;
varying float vFinType;
`;
// Skin: pattern fields -> crisp colour edges scalloped by individual scales, sumi granular per scale,
// pearly white with faint scale pockets, reticulation for Asagi / Chagoi, head details, mouth interior.
const KOI_BODY_MAP = /* glsl */`
int fi = int(vFishIdx + 0.5);
float fiF = floor(vFishIdx + 0.5);
vec4 kInfo = kPal(fiF, 6.0), kInfo2 = kPal(fiF, 7.0);
float bs = vBodyUv.x, bth = vBodyUv.y * 6.2831853, cth = cos(bth), sth = sin(bth);
float pv = (vFishIdx + 0.01 + vBodyUv.y * 0.98) / KOI_NF;
vec4 pf = texture2D(tPattern, vec2(bs, pv));
vec4 sc = texture2D(normalMap, vNormalMapUv);
float scaleOn = smoothstep(0.19, 0.25, bs) * (1.0 - smoothstep(0.975, 1.0, bs));
// Doitsu: scaleless leather skin, with a row of large mirror scales either side of the dorsal ridge and along the lateral line
float doitsu = kInfo2.x;
if (doitsu > 0.5) {
  vec4 scB = texture2D(normalMap, vNormalMapUv * vec2(0.5, 0.5) + vec2(0.13, 0.0));
  float row = smoothstep(0.03, 0.09, abs(sth)) * (1.0 - smoothstep(0.55, 0.66, abs(sth))) * step(0.0, cth)
            + (1.0 - smoothstep(0.1, 0.18, abs(cth + 0.04)));
  sc = scB; scaleOn *= clamp(row, 0.0, 1.0) * smoothstep(0.24, 0.3, bs) * (1.0 - smoothstep(0.86, 0.94, bs));
}
float rim = sc.a * scaleOn, sid = sc.b;
float mirror = doitsu * scaleOn;                                   // doitsu mirror scales: large, glassy, clearly outlined
float scal = (sc.a - 0.35) * 0.14 * scaleOn;
// hi edges: crisp and scalloped scale by scale at the back of a patch (kiwa); soft and blurred at the front (sashi),
// where the translucent white scales in front overlap the red ones behind
float grd = texture2D(tPattern, vec2(bs + 0.012, pv)).r - pf.r;
float sashi = smoothstep(0.03, 0.2, grd) * scaleOn;
float fwh = max(fwidth(pf.r) * 1.3, 0.018), fws = max(fwidth(pf.g) * 1.3, 0.018);
float fwhS = mix(fwh, 0.13, sashi);
float hi = smoothstep(0.5 - fwhS, 0.5 + fwhS * (1.0 - 0.4 * sashi), pf.r + scal * (1.0 - sashi) + (sid - 0.5) * 0.1 * sashi);
float su = smoothstep(0.5 - fws, 0.5 + fws, pf.g + scal * 0.5 + (sid - 0.5) * 0.35 * scaleOn);   // sumi sits scale by scale
vec3 base = kPal(fiF, 0.0).rgb * (0.95 + 0.1 * pf.b);
vec3 col = mix(base, kPal(fiF, 3.0).rgb, pf.a * 0.8);
vec3 hiC = kPal(fiF, 1.0).rgb * (0.84 + 0.3 * pf.b) * (0.92 + 0.1 * sid);
hiC = mix(hiC, hiC * vec3(1.02, 1.12, 1.1) + 0.04, sashi * (1.0 - hi) * 0.8);      // pinkish veil where sashi fades out
col = mix(col, hiC, hi);
col = mix(col, kPal(fiF, 2.0).rgb * (0.8 + 0.4 * sid), su);
float ret = kInfo.y;
col *= 1.0 + rim * ret * 0.55;                                   // reticulated scale edges (Asagi, Chagoi, Kujaku net...)
col *= 1.0 - (1.0 - sc.a) * (0.08 + 0.04 * hi) * scaleOn;        // scale pockets, a touch deeper in the red
col *= 1.0 + rim * hi * 0.06;                                     // each red scale catches light on its free edge
col = mix(col, col * vec3(0.9, 0.95, 1.03), (1.0 - sc.a) * 0.45 * scaleOn * (1.0 - hi) * (1.0 - su));   // pearly, faintly blue in the pockets
col *= 1.0 - mirror * (0.16 * (1.0 - smoothstep(0.55, 0.9, sc.a)) * smoothstep(0.2, 0.5, sc.a) + 0.05);
// lateral line: a fine dashed row of pored scales along each flank
float lat = (1.0 - smoothstep(0.0, 0.03, abs(cth + 0.06))) * scaleOn * (1.0 - doitsu);
col *= 1.0 - 0.14 * lat * smoothstep(0.35, 0.8, sc.a);
// Gin Rin: reflective guanine deposits make individual scales flash like sequins
float gin = kInfo2.y * scaleOn * smoothstep(0.58, 0.66, sid) * (1.0 - smoothstep(0.1, 0.45, sc.a)) * smoothstep(-0.6, 0.2, cth);   // the scale's face, not its rim
col = mix(col, max(col, vec3(0.8)), gin * 0.05);
// head: lips, nostrils, gill slit
float lipM = 1.0 - smoothstep(0.0, 0.035, bs);
col = mix(col, col * vec3(1.0, 0.86, 0.82), lipM * (1.0 - hi) * 0.6);
float nos = min(length(vec2((bs - 0.048) / 0.0065, (bth - 0.62) / 0.07)), length(vec2((bs - 0.048) / 0.0065, (bth - 5.66) / 0.07)));
col *= 1.0 - 0.55 * (1.0 - smoothstep(0.6, 1.0, nos)) + 0.12 * (1.0 - smoothstep(1.0, 1.5, nos)) * smoothstep(0.9, 1.0, nos);
float gl = bs - (0.212 - 0.016 * cth);
col *= 1.0 - 0.35 * (1.0 - smoothstep(0.0, 0.0025 + fwidth(bs), abs(gl))) * smoothstep(0.7, 0.2, cth);
col = mix(col, vec3(0.42, 0.14, 0.13), vMouthIn);               // pink-red mouth interior
diffuseColor.rgb = col;
`;
const KOI_BODY_NORMAL = /* glsl */`
{
  vec2 nxy = (sc.xy * 2.0 - 1.0) * normalScale * scaleOn;
  vec3 mapN = vec3(nxy, sqrt(max(0.0, 1.0 - dot(nxy, nxy))));
  normal = normalize(tbn * mapN);
}
`;
const KOI_GIN_POST = /* glsl */`
{
  vec3 Lv = normalize((viewMatrix * vec4(uSunDir, 0.0)).xyz);
  // Gin Rin: each crystal-bearing scale is a tiny tilted mirror, so individual scales flash as the fish turns
  if (gin > 0.0) {
    vec3 nG = normalize(geometryNormal + (vec3(sid, fract(sid * 7.13), fract(sid * 3.71)) - 0.5) * 0.7);   // one flat, randomly tilted mirror per scale
    float gl = pow(max(dot(nG, normalize(Lv + normalize(vViewPosition))), 0.0), 48.0) * (0.3 + 0.7 * fract(sid * 13.7));
    reflectedLight.directSpecular += directLight.color * gin * (0.015 + 4.0 * gl) * mix(vec3(1.0), diffuseColor.rgb + 0.4, 0.4);
    reflectedLight.indirectSpecular += gin * 0.06 * mix(vec3(1.0), diffuseColor.rgb, 0.3);
  }

}
`;
const KOI_BODY_POST = /* glsl */`
{
  // wrap / subsurface: light bleeds past the terminator, warmer through red patches
  vec3 Lv = normalize((viewMatrix * vec4(uSunDir, 0.0)).xyz);
  float nl = dot(geometryNormal, Lv);
  float wrapL = max(0.0, (nl + 0.55) / 1.55) - max(0.0, nl);
  reflectedLight.directDiffuse += diffuseColor.rgb * directLight.color * wrapL * 0.4 * vec3(1.0, 0.7, 0.6);
}
`;
const KOI_FIN_MAP = /* glsl */`
float fiF = floor(vFishIdx + 0.5);
vec4 kInfo = kPal(fiF, 6.0), kInfo2 = kPal(fiF, 7.0);
vec4 ft = texture2D(map, vMapUv);
float mainFin = (vFinType > 0.5 && vFinType < 2.5) || vFinType > 5.5 ? 1.0 : 0.35;
// orange / black streaks radiate along the rays from the fin base (strongest on pectorals and tail)
float streak = ft.g * (1.0 - smoothstep(0.08, 0.55 + kInfo2.w * 0.15, vFinEdge)) * mainFin * kInfo.w;
vec3 fc = mix(kPal(fiF, 4.0).rgb, kPal(fiF, 5.0).rgb, streak);
fc = mix(fc, vec3(0.93, 0.92, 0.9), kInfo2.z * smoothstep(0.55, 0.9, vFinEdge) * mainFin);   // hajiro: white fin tips
fc = mix(fc * vec3(0.9, 0.94, 0.97), min(fc * 1.08 + 0.04, vec3(1.0)), ft.g);
diffuseColor.rgb = fc;
diffuseColor.a = opacity * ft.a * (1.0 - kInfo2.w * 0.3 * smoothstep(0.45, 1.0, vFinEdge));    // long fins thin to a gauze
`;

const KOI = { fish: [], body: null, fins: null, eyes: null };
function buildKoi() {
  const tPattern = koiPatternAtlas(), tScale = koiScaleTexture(), tFin = koiFinTexture(), tEye = koiEyeTexture();
  const bodyGeo = koiBodyGeo(), finGeo = koiFinGeo(), eyeGeo = koiEyeGeo();
  const a1 = new THREE.InstancedBufferAttribute(new Float32Array(KOI_N * 4), 4), a2 = new THREE.InstancedBufferAttribute(new Float32Array(KOI_N * 4), 4), a3 = new THREE.InstancedBufferAttribute(new Float32Array(KOI_N * 4), 4);
  for (const a of [a1, a2, a3]) a.setUsage(THREE.DynamicDrawUsage);
  for (const g of [bodyGeo, finGeo, eyeGeo]) { g.setAttribute('aSwim', a1); g.setAttribute('aSwim2', a2); g.setAttribute('aSwim3', a3); }
  tScale.repeat.set(4.5, 3);
  // per-fish palettes with individual variation (warmer/cooler red, creamier white, depth of black)
  const palData = new Float32Array(8 * KOI_N * 4);
  const put = (f, k, x, y, z, w) => palData.set([x, y, z, w], (f * 8 + k) * 4);
  const jit = (hex, f, a) => { const c = new THREE.Color(hex), h = {}; c.getHSL(h); c.setHSL(h.h + (hash3i(f, 1, 0, 3) - 0.5) * 0.03 * a, clamp(h.s * (0.9 + 0.2 * hash3i(f, 2, 0, 3)), 0, 1), clamp(h.l * (0.95 + 0.1 * hash3i(f, 3, 0, 3)), 0, 1)); return c; };
  const finLong = new Array(KOI_N).fill(0);
  KOI_ROSTER_DEF.forEach(([name, , opt = {}], f) => {
    const st = KOI_STYLES[name];
    [jit(st.base, f, 0.5), jit(st.hi, f, 1), new THREE.Color(st.sumi), jit(st.belly, f, 0.3), jit(st.fin, f, 0.3), jit(st.finBase, f, 1)].forEach((c, k) => put(f, k, c.r, c.g, c.b, 1));
    put(f, 6, st.metal || 0, st.retic || 0, st.irid ?? 0.1, st.moto || 0);
    put(f, 7, st.doitsu || 0, opt.gin || 0, st.hajiro || 0, opt.fly || 0);
    finLong[f] = opt.fly ? 1 : 0;
  });
  const tPal = new THREE.DataTexture(palData, 8, KOI_N, THREE.RGBAFormat, THREE.FloatType);
  tPal.magFilter = tPal.minFilter = THREE.NearestFilter; tPal.colorSpace = THREE.NoColorSpace; tPal.needsUpdate = true;
  const shared = { tPattern: { value: tPattern }, tPal: { value: tPal } };
  const bodyMat = physical({ normalMap: tScale, normalScale: new THREE.Vector2(0.75, 0.75), roughness: 0.36, metalness: 0,
    clearcoat: 0.6, clearcoatRoughness: 0.12, sheen: 0.12, sheenRoughness: 0.4, sheenColor: new THREE.Color(0xffffff),
    iridescence: 0.25, iridescenceIOR: 1.55, iridescenceThicknessRange: [180, 420], envMapIntensity: 1.05 }, {
    key: 'koibody2', uniforms: shared, vsPars: '#define KOI_BODY\n' + KOI_VS_PARS, vsNormal: KOI_VS_NORMAL, vsBegin: KOI_VS_BEGIN,
    fsPars: KOI_FS_PARS, fsMap: KOI_BODY_MAP, fsNormal: KOI_BODY_NORMAL,
    fsRough: 'roughnessFactor = mix(mix(roughnessFactor * (1.0 + (1.0 - rim) * 0.12 * scaleOn) * (1.0 - 0.25 * doitsu), 0.07, gin), 0.55, vMouthIn);',
    fsMetal: 'metalnessFactor = max(kInfo.x * 0.42, gin * 0.85);',
    fsPreLights: '#define KOI_SELF_IDX floor(vFishIdx + 0.5)\n#ifdef USE_CLEARCOAT\n material.clearcoat = mix(0.7, 1.0, max(kInfo.x, doitsu));\n#endif\n#ifdef USE_IRIDESCENCE\n material.iridescence = max(kInfo.z * (0.6 + 0.4 * rim), gin);\n#endif\n',
    fsPostLights: KOI_BODY_POST + KOI_GIN_POST,
  });
  const finMat = physical({ map: tFin, transparent: true, opacity: 0.86, side: THREE.DoubleSide, roughness: 0.4, depthWrite: false, sheen: 0.5, sheenRoughness: 0.4, sheenColor: new THREE.Color(0xffffff), envMapIntensity: 0.9 }, {
    key: 'koifin2', uniforms: Object.assign({ uTransl: { value: 0.55 }, uDorsalFold: { value: new Array(KOI_N).fill(0) }, uFinLong: { value: finLong } }, shared), vsPars: '#define KOI_FIN\n' + KOI_VS_PARS, vsNormal: KOI_VS_NORMAL, vsBegin: KOI_VS_BEGIN, leaf: true,
    fsPars: KOI_FS_PARS, fsMap: KOI_FIN_MAP, fsPreLights: '#define KOI_SELF_IDX floor(vFishIdx + 0.5)\n', fsRough: 'roughnessFactor = mix(0.3, 0.75, smoothstep(0.4, 1.0, vFinEdge));',
  });
  const eyeMat = physical({ map: tEye, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 1.3 }, {
    key: 'koieye', uniforms: shared, vsPars: '#define KOI_EYE\n' + KOI_VS_PARS, vsNormal: KOI_VS_NORMAL, vsBegin: KOI_VS_BEGIN,
  });
  KOI.body = new THREE.InstancedMesh(bodyGeo, bodyMat, KOI_N);
  KOI.fins = new THREE.InstancedMesh(finGeo, finMat, KOI_N);
  KOI.eyes = new THREE.InstancedMesh(eyeGeo, eyeMat, KOI_N);
  KOI.body.castShadow = false;       // shadows come from koiShadow() in the underwater lighting instead (see UW_FS_PARS)
  if (KOI_N > KOI_MAX) console.warn('koi roster exceeds shadow slots');
  for (const m of [KOI.body, KOI.fins, KOI.eyes]) { m.receiveShadow = true; m.frustumCulled = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); setLayer(m, LAYER.UNDER); scene.add(m); }   // always seen through the water (they never break the surface, see updateFish)
  KOI.body.customDepthMaterial = patchedDepth({ key: 'koid2', uniforms: shared, vsPars: '#define KOI_BODY\n' + KOI_VS_PARS, vsBeginDepth: KOI_VS_BEGIN });
  KOI.fins.renderOrder = 2;
  Object.assign(KOI, { a1, a2, a3 });

  for (let i = 0; i < KOI_N; i++) {
    let x, z, guard = 0;
    do { x = rr(-2.8, 2.6); z = rr(-5, 5); } while (sdf(x, z) > -0.7 && guard++ < 200);
    const [, cls] = KOI_ROSTER_DEF[i], sr = KOI_SIZE_RANGE[cls], size = rr(sr[0], sr[1]);
    const prefDepth = cls === 'S' ? rr(0.12, 0.5) : cls === 'L' ? rr(0.35, 0.9) : rr(0.15, 0.85);   // youngsters keep to the shallows
    KOI.fish.push({
      p: new THREE.Vector3(x, -Math.min(prefDepth, pondDepth(x, z, -sdf(x, z)) - 0.15), z),
      heading: rand() * Math.PI * 2, pitch: 0, roll: 0, speed: rr(0.05, 0.15), turnRate: 0, bend: 0,
      // juveniles are slim, jumbo koi deep-bodied
      prefDepth, size, girth: rr(0.96, 1.05) + (size - 0.46) * 0.5, variety: KOI_ROSTER[i], phase: rand() * 10, amp: 0.03,
      pecL: rand() * 6, pecR: rand() * 6, spread: 0.5, gill: rand() * 6, mouth: 0, mouthT: rr(1, 6),
      bursting: false, cycleT: rr(0.2, 2), thrust: rr(0.2, 0.3), wander: 0, hover: 0, hoverCool: rr(8, 30),
      rise: 0, riseCooldown: rr(10, 40), dropT: 0, eyeYaw: 0, eyePitch: 0, eyeT: rr(0.5, 3), eyeTY: 0, eyeTP: 0,
      feed: 0, react: 0, prevSpeed: 0, lastWake: 0,
    });
  }
}

// Locomotion: burst-and-glide swimming with rate-limited, angular-acceleration-smoothed turning,
// C-bend into turns, pectorals that fold when fast and scull when hovering; boids steering, soft
// boundary, depth preference, occasional surfacing; frenzied feeding driven by FEED (section 13c).
const _m4 = new THREE.Matrix4(), _qk = new THREE.Quaternion(), _ek = new THREE.Euler(), _sk = new THREE.Vector3(), _pk = new THREE.Vector3();
function updateFish(dt, t) {
  if (!KOI.body) return;
  const n = Math.min(P.fishCount | 0, KOI.fish.length);
  KOI.body.count = KOI.fins.count = KOI.eyes.count = n;
  const F = KOI.fish, feeding = typeof FEED !== 'undefined' && FEED.active;
  for (let i = 0; i < n; i++) {
    const f = F[i];
    const fx = Math.cos(f.heading), fz = -Math.sin(f.heading);
    // feeding excitement ramps up after a distance-based reaction delay and decays slowly afterwards
    if (feeding) { f.react -= dt; if (f.react <= 0) f.feed = Math.min(1, f.feed + dt * 1.6); }
    else f.feed = Math.max(0, f.feed - dt * 0.12);
    const fe = f.feed;
    let sx = 0, sz = 0, ax = 0, az = 0, cx = 0, cz = 0, nn = 0;
    for (let j = 0; j < n; j++) {
      if (j === i) continue;
      const o = F[j], dx = o.p.x - f.p.x, dz = o.p.z - f.p.z, d2 = dx * dx + dz * dz;
      if (d2 > 2.6) continue;
      const d = Math.sqrt(d2) + 1e-4, dy = Math.abs(o.p.y - f.p.y), sepR = (f.size + o.size) * 0.62 * (1 - 0.45 * fe);
      if (d < sepR && dy < 0.3) { const k = (sepR - d) / sepR; sx -= dx / d * k; sz -= dz / d * k; }
      ax += Math.cos(o.heading); az += -Math.sin(o.heading); cx += dx; cz += dz; nn++;
    }
    f.wander += rr(-1, 1) * dt * (2.0 + fe * 6); f.wander *= 0.995;
    let dx = fx + Math.cos(f.heading + f.wander) * 0.8, dz = fz - Math.sin(f.heading + f.wander) * 0.8;
    dx += sx * 2.4; dz += sz * 2.4;
    if (nn && fe < 0.5) { dx += (ax / nn) * 0.4 + (cx / nn) * 0.22; dz += (az / nn) * 0.4 + (cz / nn) * 0.22; }
    if (STATE.under && i % 3 === 0 && fe < 0.2) {                 // curious koi come to inspect a submerged camera
      const cdx = camera.position.x - f.p.x, cdz = camera.position.z - f.p.z, cd = Math.hypot(cdx, cdz) + 1e-3;
      if (cd < 3.5) { const k = cd > 0.8 ? 0.5 : -1.2; dx += cdx / cd * k; dz += cdz / cd * k; }
    }
    // food: rush toward the nearest floating pellet (or the hand) with a jostling, competitive line
    let foodT = null;
    if (fe > 0.05) {
      foodT = typeof nearestFood === 'function' ? nearestFood(f.p) : null;
      if (foodT) {
        const tdx = foodT.x - f.p.x, tdz = foodT.z - f.p.z, td = Math.hypot(tdx, tdz) + 1e-3;
        dx += (tdx / td) * 5 * fe; dz += (tdz / td) * 5 * fe;
        f.foodDist = td;
      }
    }
    if (f.stroke && STROKE.active) {
      // called to the hand: glide in, then lie alongside the bank, facing along it
      const tdx = STROKE.spot.x - f.p.x, tdz = STROKE.spot.z - f.p.z, td = Math.hypot(tdx, tdz) + 1e-3;
      const w = smoothstep(0.1, 0.5, td);
      dx = lerp(STROKE.along.x, tdx / td, w) * 4; dz = lerp(STROKE.along.z, tdz / td, w) * 4;
      f.strokeD = td;
    }
    // soft boundary (look ahead) and pier avoidance
    const look = 0.4 + f.speed * 1.5, lx = f.p.x + fx * look, lz = f.p.z + fz * look, sd = sdf(lx, lz);
    if (sd > -0.7 && !(f.stroke && STROKE.active && f.strokeD < 1.2)) {
      const e = 0.03, gx = (sdf(lx + e, lz) - sdf(lx - e, lz)) / (2 * e), gz = (sdf(lx, lz + e) - sdf(lx, lz - e)) / (2 * e), k = (sd + 0.7) * 6.0;
      dx -= gx * k; dz -= gz * k;
    }
    for (const px of [-1.15, 1.15]) { const ddx = f.p.x - px, ddz = f.p.z - BRIDGE.z, d = Math.hypot(ddx, ddz); if (d < 0.9) { dx += ddx / d * (0.9 - d) * 3; dz += ddz / d * (0.9 - d) * 3; } }
    for (const o of WORLD.obstacles || []) { const ddx = f.p.x - o.x, ddz = f.p.z - o.z, d = Math.hypot(ddx, ddz), R = o.r + 0.35; if (d < R) { dx += ddx / d * (R - d) * 4; dz += ddz / d * (R - d) * 4; } }
    if (TURTLE.root && TURTLE.pos.y < WATER_Y - 0.02) { const ddx = f.p.x - TURTLE.pos.x, ddz = f.p.z - TURTLE.pos.z, d = Math.hypot(ddx, ddz) + 1e-3; if (d < 0.5 && Math.abs(f.p.y - TURTLE.pos.y) < 0.25) { dx += ddx / d * (0.5 - d) * 3; dz += ddz / d * (0.5 - d) * 3; } }
    // heading: desired turn rate, limited by speed, with angular acceleration smoothing
    let dh = Math.atan2(-dz, dx) - f.heading; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
    const maxRate = 0.9 + 1.0 * clamp(1 - f.speed / 0.35, 0, 1) + fe * 2.4;
    const want = clamp(dh * (1.4 + fe * 3), -maxRate, maxRate), angAcc = 2.5 + fe * 9;
    f.turnRate += clamp(want - f.turnRate, -angAcc * dt, angAcc * dt);
    f.heading += f.turnRate * dt;
    // burst & glide: a few tail beats, then a coast; hungry fish beat almost continuously
    f.hoverCool -= dt;
    if (f.hover > 0) f.hover -= dt; else if (f.hoverCool < 0 && fe < 0.1) { f.hover = rr(2, 5); f.hoverCool = rr(15, 40); }
    f.cycleT -= dt;
    if (f.cycleT <= 0) {
      f.bursting = !f.bursting;
      f.cycleT = f.bursting ? (fe > 0.3 ? rr(0.5, 1.1) : rr(0.6, 1.5)) : (fe > 0.3 ? rr(0.05, 0.25) : rr(1.0, 3.2) * (f.hover > 0 ? 2 : 1));
      f.thrust = rr(0.18, 0.32);
    }
    if (!f.bursting && f.speed < 0.05 && f.hover <= 0 && fe < 0.1) f.cycleT = Math.min(f.cycleT, 0.2);
    let thrust = (f.bursting ? lerp(f.thrust, 1.15, fe) : lerp(0.015, 0.28, fe)) * (1 - 0.5 * SH.uIce.value * (1 - fe));   // sluggish in cold water
    if (f.hover > 0) thrust *= 0.15;
    thrust *= clamp(0.7 + 0.3 * f.size / 0.46, 0.8, 1.2);           // big koi cruise a little faster in m/s, slower in body lengths
    if (foodT && f.foodDist < 0.25) thrust *= 0.35;                // brake and jostle at the food
    if (f.stroke && STROKE.active) { thrust = f.strokeD < 0.3 ? 0.02 : f.strokeD < 0.8 ? 0.3 : 0.7; f.bursting = f.strokeD > 0.3; }
    f.prevSpeed = f.speed;
    f.speed += (thrust - 1.2 * f.speed - Math.abs(f.turnRate) * 0.12 * f.speed) * dt;
    f.speed = Math.max(0, f.speed);
    // tail kinematics: amplitude and frequency follow effort; turning adds a stroke
    const targetAmp = f.stroke && STROKE.active && f.strokeD < 0.35 ? 0.006 : (f.bursting ? 0.055 + thrust * 0.085 : 0.014) + Math.min(0.05, Math.abs(f.turnRate) * 0.025);
    f.amp = lerp(f.amp, targetAmp, 1 - Math.exp(-dt * 3.5));
    const freq = (f.bursting ? 1.1 + thrust * 2.6 : 0.55 + f.speed) * Math.sqrt(0.46 / f.size);   // small fish beat their tails faster
    f.phase += dt * Math.PI * 2 * freq;
    f.bend = lerp(f.bend, clamp(-f.turnRate * (0.07 + fe * 0.03), -0.3, 0.3), 1 - Math.exp(-dt * 5));
    // pectorals: folded when fast, flared when braking or hovering
    const braking = clamp((f.prevSpeed - f.speed) / Math.max(dt, 1e-3) * 3, 0, 1);
    f.spread = lerp(f.spread, clamp(1.1 - f.speed / 0.32 + braking * 0.8 + (f.hover > 0 ? 0.6 : 0), 0.12, 1), 1 - Math.exp(-dt * 3));
    const scull = 1.8 + clamp(1 - f.speed / 0.3, 0, 1) * 2.8;
    f.pecL += dt * (scull + 0.3 * Math.sin(t * 0.7 + i)); f.pecR += dt * (scull + 0.3 * Math.sin(t * 0.61 + i * 2));
    // depth: preference bounded by the floor; surfacing; feeding fish crowd the surface
    const floorD = pondDepth(f.p.x, f.p.z, Math.max(0.01, -sdf(f.p.x, f.p.z)));
    f.riseCooldown -= dt;
    if (f.riseCooldown < 0 && f.rise <= 0) { f.rise = rr(3, 6); f.riseCooldown = rr(20, 50); }
    let ty = -Math.min(f.prefDepth, floorD - 0.14);
    if (f.rise > 0) { f.rise -= dt; ty = WATER_Y - 0.06; }
    if (fe > 0.05) ty = lerp(ty, WATER_Y - 0.035 - f.size * 0.08 - (foodT ? 0 : 0.1), smoothstep(0, 1, fe) * (foodT && f.foodDist < 1.5 ? 1 : 0.6));
    const backTop = f.size * 0.14 * f.girth;                          // height of the dorsal ridge above the body axis
    if (f.stroke && STROKE.active) ty = WATER_Y - backTop - 0.022 - STROKE.touch * 0.005;   // back just under the surface, yields a little to the hand
    const vy = f.stroke && STROKE.active ? clamp((ty - f.p.y) * 1.8, -0.2, 0.2) : clamp((ty - f.p.y) * (0.6 + fe * 2.5), -0.15 - fe * 0.2, 0.15 + fe * 0.3);
    f.p.y += vy * dt;
    // the whole fish stays below the lowest wave trough, so the surface never slices it into above/below strips
    f.p.y = Math.min(f.p.y, WATER_Y - backTop - 0.022 - Math.max(0, Math.sin(f.pitch)) * f.size * 0.5);
    f.pitch = lerp(f.pitch, Math.atan2(vy, Math.max(f.speed, 0.06)) * 0.75 + (foodT && f.foodDist < 0.4 ? 0.12 * fe : 0), 1 - Math.exp(-dt * 3));
    f.p.x += fx * f.speed * dt; f.p.z += fz * f.speed * dt;
    if (sdf(f.p.x, f.p.z) > -0.15) { const e = 0.03, gx = (sdf(f.p.x + e, f.p.z) - sdf(f.p.x - e, f.p.z)) / (2 * e), gz = (sdf(f.p.x, f.p.z + e) - sdf(f.p.x, f.p.z - e)) / (2 * e); f.p.x -= gx * 0.012; f.p.z -= gz * 0.012; }
    // mouth: slow breathing gulps; rapid snapping at the surface when feeding
    f.mouthT -= dt;
    if (fe > 0.3 && foodT && f.foodDist < 0.5) {
      f.mouth = 0.55 + 0.45 * Math.max(0, Math.sin(t * 9 + i * 1.7));
      if (rand() < dt * 1.4) bubbleBurst(f.p.x - fx * f.size * 0.2, f.p.y - 0.02, f.p.z - fz * f.size * 0.2, 3 + (rand() * 4 | 0), 0.015, 0.0006, 0.0025, 0);   // air expelled through the gills
    }
    else if (f.mouthT < 0) { f.mouth = lerp(f.mouth, 0.25, 1 - Math.exp(-dt * 8)); if (f.mouthT < -0.35) f.mouthT = rr(2.5, 7); }
    else f.mouth = lerp(f.mouth, 0.0, 1 - Math.exp(-dt * 5));
    f.gill += dt * Math.PI * 2 * (0.9 + fe * 1.4 + f.speed * 2);
    // eyes: small saccades, or track the food
    f.eyeT -= dt;
    if (f.eyeT < 0) { f.eyeT = rr(0.6, 3); f.eyeTY = rr(-0.25, 0.25); f.eyeTP = rr(-0.18, 0.2); }
    if (foodT) { f.eyeTY = 0.15; f.eyeTP = 0.25; }
    f.eyeYaw = lerp(f.eyeYaw, f.eyeTY, 1 - Math.exp(-dt * 12)); f.eyePitch = lerp(f.eyePitch, f.eyeTP, 1 - Math.exp(-dt * 12));
    f.roll = lerp(f.roll, f.stroke && STROKE.active ? 0.22 * STROKE.touch : clamp(f.turnRate * 0.12, -0.28, 0.28), 1 - Math.exp(-dt * 2));   // leans into the hand
    if (f.stroke && STROKE.active) { f.spread = lerp(f.spread, 1, 1 - Math.exp(-dt * 3)); if (STROKE.touch > 0.5 && f.mouthT < 0) f.mouthT = 0; }
    // wakes: fish cruising near the surface leave a trail of tiny drops; hungry fish splash
    if (f.p.y > WATER_Y - 0.16 && f.speed > 0.06) {
      f.lastWake -= dt;
      if (f.lastWake < 0) {
        f.lastWake = fe > 0.3 ? rr(0.08, 0.18) : rr(0.2, 0.4);
        const tail = f.size * 0.5, depthK = smoothstep(-0.16, -0.03, f.p.y - WATER_Y);
        addDrop(f.p.x - fx * tail, f.p.z - fz * tail, 0.06 + f.size * 0.1, -(0.0015 + f.speed * 0.006 + fe * 0.004) * depthK);
        if (fe > 0.4 && typeof spawnSplash === 'function' && rand() < 0.35) spawnSplash(f.p.x + fx * f.size * 0.45, f.p.z + fz * f.size * 0.45, 0.4 + f.speed);
      }
    }
    if (f.rise > 0 && f.p.y > WATER_Y - 0.1) {
      f.dropT -= dt;
      if (f.dropT < 0) { f.dropT = rr(0.35, 0.8); addDrop(f.p.x + fx * f.size * 0.45, f.p.z + fz * f.size * 0.45, 0.09, -0.004); f.mouth = 0.8; }
    }
    KOI.a1.setXYZW(i, f.phase, f.amp, f.bend, i);
    KOI.a2.setXYZW(i, f.pecL, f.pecR, f.girth, f.spread);
    KOI.a3.setXYZW(i, f.mouth, f.gill, f.eyeYaw, f.eyePitch);
  }
  // hard overlap resolution so crowding fish never interpenetrate
  // bodies as three spheres along the spine (head, middle, tail): push apart wherever they overlap
  const spine = [0.3, 0, -0.3];
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const a = F[i], b = F[j];
    if (Math.abs(a.p.x - b.p.x) + Math.abs(a.p.z - b.p.z) > (a.size + b.size) * 1.2) continue;
    const ax = Math.cos(a.heading), az = -Math.sin(a.heading), bx = Math.cos(b.heading), bz = -Math.sin(b.heading), r = (a.size + b.size) * 0.1;
    for (const u of spine) for (const w of spine) {
      const dx = (b.p.x + bx * w * b.size) - (a.p.x + ax * u * a.size), dz = (b.p.z + bz * w * b.size) - (a.p.z + az * u * a.size), dy = (b.p.y - a.p.y) * 1.15;
      const d = Math.hypot(dx, dy, dz);
      if (d < r && d > 1e-4) { const k = (r - d) * 0.35 / d; a.p.x -= dx * k; a.p.z -= dz * k; b.p.x += dx * k; b.p.z += dz * k; a.p.y -= dy * k * 0.25; b.p.y += dy * k * 0.25; }
    }
  }
  for (let i = 0; i < n; i++) {
    const f = F[i];
    _ek.set(f.roll, f.heading, f.pitch, 'YZX'); _qk.setFromEuler(_ek);
    _sk.setScalar(f.size); _pk.copy(f.p);
    _m4.compose(_pk, _qk, _sk);
    KOI.body.setMatrixAt(i, _m4); KOI.fins.setMatrixAt(i, _m4); KOI.eyes.setMatrixAt(i, _m4);
  }
  const SA = SH.uKoiA.value, SB = SH.uKoiB.value;
  for (let i = 0; i < KOI_MAX; i++) {
    const f = F[i];
    if (!f || i >= n) { SA[i].set(0, 0, 0, 0); continue; }
    const latTail = f.amp * (0.05 + 0.95 * 0.81) * Math.sin(0.9 * 5.7 - f.phase) + f.bend * 0.36;
    SA[i].set(f.p.x, f.p.y, f.p.z, f.size);
    SB[i].set(Math.cos(f.heading) * f.girth, -Math.sin(f.heading) * f.girth, latTail, 0);
  }
  KOI.a1.needsUpdate = KOI.a2.needsUpdate = KOI.a3.needsUpdate = true;
  KOI.body.instanceMatrix.needsUpdate = KOI.fins.instanceMatrix.needsUpdate = KOI.eyes.instanceMatrix.needsUpdate = true;
}

/* ------------------------------------------------------------------ 12. POST-PROCESSING */
// Pipeline: main HDR (MSAA) -> [SSAO half-res + blur] -> [bloom prefilter + 5-level mip chain]
//           -> [god rays, DOF when submerged] -> composite (exposure, ACES, grade, vignette, grain, lens FX)
const SSAO_FS = /* glsl */`
// === SSAO: normal-oriented hemisphere samples reconstructed from the depth buffer (half resolution)
#include <packing>
uniform sampler2D tDepth;
uniform mat4 uProj;
uniform mat4 uInvProj;
uniform vec2 uTexel;
uniform float uRadius;
uniform float uIntensity;
uniform vec3 uKernel[12];
varying vec2 vUv;
vec3 viewPos(vec2 uv){
  float d = texture2D(tDepth, uv).r;
  vec4 p = uInvProj * vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
  return p.xyz / p.w;
}
float h12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
void main(){
  float d = texture2D(tDepth, vUv).r;
  if (d >= 0.99999) { gl_FragColor = vec4(1.0); return; }
  vec3 P = viewPos(vUv);
  // normal from the smaller of the forward/backward depth differences (robust at silhouettes)
  vec3 pr = viewPos(vUv + vec2(uTexel.x, 0.0)) - P, pl = P - viewPos(vUv - vec2(uTexel.x, 0.0));
  vec3 pu = viewPos(vUv + vec2(0.0, uTexel.y)) - P, pd = P - viewPos(vUv - vec2(0.0, uTexel.y));
  vec3 dx = abs(pr.z) < abs(pl.z) ? pr : pl, dy = abs(pu.z) < abs(pd.z) ? pu : pd;
  vec3 N = normalize(cross(dx, dy));
  float a = h12(gl_FragCoord.xy) * 6.2831853;
  vec3 rv = vec3(cos(a), sin(a), 0.0);
  vec3 T = normalize(rv - N * dot(rv, N)), B = cross(N, T);
  mat3 tbn = mat3(T, B, N);
  float radius = uRadius * clamp(-P.z * 0.08, 0.35, 1.6);   // grow with distance a little
  float occ = 0.0;
  for (int i = 0; i < 12; i++) {
    vec3 S = P + tbn * uKernel[i] * radius;
    vec4 c = uProj * vec4(S, 1.0);
    vec2 suv = c.xy / c.w * 0.5 + 0.5;
    float sz = viewPos(suv).z;
    float range = smoothstep(0.0, 1.0, radius / abs(P.z - sz));
    occ += (sz >= S.z + 0.015 * radius ? 1.0 : 0.0) * range;
  }
  gl_FragColor = vec4(vec3(clamp(1.0 - occ / 12.0 * uIntensity, 0.0, 1.0)), 1.0);
}`;
const BLUR4_FS = /* glsl */`
// === 4x4 box blur (removes the SSAO rotation noise)
uniform sampler2D tSrc;
uniform vec2 uTexel;
varying vec2 vUv;
void main(){
  float s = 0.0;
  for (int x = -2; x < 2; x++) for (int y = -2; y < 2; y++) s += texture2D(tSrc, vUv + (vec2(x, y) + 0.5) * uTexel).r;
  gl_FragColor = vec4(vec3(s / 16.0), 1.0);
}`;
const BLOOM_PRE_FS = /* glsl */`
// === BLOOM prefilter: soft-knee threshold on exposed colour, firefly clamp
uniform sampler2D tSrc;
uniform vec2 uTexel;
uniform float uThreshold;
uniform float uExpo;
varying vec2 vUv;
void main(){
  vec3 c = (texture2D(tSrc, vUv + vec2(-0.5, -0.5) * uTexel).rgb + texture2D(tSrc, vUv + vec2(0.5, -0.5) * uTexel).rgb +
            texture2D(tSrc, vUv + vec2(-0.5, 0.5) * uTexel).rgb + texture2D(tSrc, vUv + vec2(0.5, 0.5) * uTexel).rgb) * 0.25 * uExpo;
  c = min(c, vec3(40.0));
  float br = max(c.r, max(c.g, c.b)), knee = uThreshold * 0.5;
  float soft = clamp(br - uThreshold + knee, 0.0, 2.0 * knee); soft = soft * soft / (4.0 * knee + 1e-4);
  gl_FragColor = vec4(c * max(soft, br - uThreshold) / max(br, 1e-4), 1.0);
}`;
const BLOOM_DOWN_FS = /* glsl */`
// === BLOOM downsample: 13-tap (Jimenez) filter
uniform sampler2D tSrc;
uniform vec2 uTexel;
varying vec2 vUv;
vec3 t(vec2 o){ return texture2D(tSrc, vUv + o * uTexel).rgb; }
void main(){
  vec3 c = t(vec2(0.0)) * 0.125;
  c += (t(vec2(-1.0, -1.0)) + t(vec2(1.0, -1.0)) + t(vec2(-1.0, 1.0)) + t(vec2(1.0, 1.0))) * 0.125;
  c += (t(vec2(-2.0, -2.0)) + t(vec2(2.0, -2.0)) + t(vec2(-2.0, 2.0)) + t(vec2(2.0, 2.0))) * 0.03125;
  c += (t(vec2(-2.0, 0.0)) + t(vec2(2.0, 0.0)) + t(vec2(0.0, -2.0)) + t(vec2(0.0, 2.0))) * 0.0625;
  gl_FragColor = vec4(c, 1.0);
}`;
const BLOOM_UP_FS = /* glsl */`
// === BLOOM upsample: 9-tap tent on the smaller mip, added to the current level
uniform sampler2D tSrc;
uniform sampler2D tCur;
uniform vec2 uTexel;
varying vec2 vUv;
vec3 t(vec2 o){ return texture2D(tSrc, vUv + o * uTexel).rgb; }
void main(){
  vec3 c = t(vec2(0.0)) * 4.0;
  c += (t(vec2(-1.0, 0.0)) + t(vec2(1.0, 0.0)) + t(vec2(0.0, -1.0)) + t(vec2(0.0, 1.0))) * 2.0;
  c += t(vec2(-1.0, -1.0)) + t(vec2(1.0, -1.0)) + t(vec2(-1.0, 1.0)) + t(vec2(1.0, 1.0));
  gl_FragColor = vec4(texture2D(tCur, vUv).rgb + c / 16.0, 1.0);
}`;
const COMPOSITE_FS = /* glsl */`
// === FINAL COMPOSITE: AO, bloom, god rays, underwater lens + wet-lens droplets, exposure, ACES filmic,
//     restrained warm grade, vignette, film grain, sRGB out
uniform sampler2D tColor;
uniform sampler2D tBloom;
uniform sampler2D tAO;
uniform sampler2D tGod;
uniform float uExposure;
uniform float uVignette;
uniform float uGrain;
uniform float uTime;
uniform float uBloom;
uniform float uAOStr;
uniform float uGodStr;
uniform float uUnder;
uniform float uWet;
uniform float uAspect;
uniform float uMeniscus;   // screen-space y of the waterline when the near plane straddles the surface (-1 = none)
uniform float uMenSide;    // which side of the meniscus is submerged (+1 below the line)
uniform vec3 uUnderTint;
uniform vec2 uTexel;
uniform float uSharp;
uniform vec3 uGrade;
uniform float uFade;
uniform float uLetter;
varying vec2 vUv;
${PONDSTYLE_TONEMAP_GLSL}float h12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec2 h22(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
// Water droplets on the lens after surfacing: lens-shaped bumps that refract the image and slowly slide
vec2 droplets(vec2 uv, out float mask){
  vec2 p = uv * vec2(uAspect, 1.0) * 8.0;
  p.y += uTime * 0.05;
  vec2 i = floor(p), f = fract(p), off = vec2(0.0);
  mask = 0.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 n = vec2(x, y), c = h22(i + n);
    float r = 0.12 + 0.3 * h12(i + n + 7.1);
    if (h12(i + n + 3.7) < 0.25) continue;
    vec2 d = n + c - f;
    float l = length(d);
    if (l < r) { float h = sqrt(1.0 - (l * l) / (r * r)); off -= d * h * 0.07; mask = max(mask, smoothstep(r, r * 0.6, l)); }
  }
  return off;
}
void main(){
  vec2 uv = vUv;
  if (uUnder > 0.5) {                                // underwater: slight barrel distortion + refractive shimmer
    vec2 q = uv - 0.5; float r2 = dot(q, q);
    uv = 0.5 + q * (1.0 - 0.07 * r2) + 0.0014 * vec2(sin(uTime * 1.3 + uv.y * 11.0), cos(uTime * 1.1 + uv.x * 9.0));
  }
  float wm = 0.0;
  if (uWet > 0.001) uv += droplets(uv, wm) * uWet;
  vec3 c = texture2D(tColor, uv).rgb;
  if (uSharp > 0.0) {
    // limited unsharp mask: recovers the crispness lost to the render-scale upsample without ringing halos
    vec3 n = texture2D(tColor, uv + vec2(0.0, uTexel.y)).rgb, s2 = texture2D(tColor, uv - vec2(0.0, uTexel.y)).rgb;
    vec3 e = texture2D(tColor, uv + vec2(uTexel.x, 0.0)).rgb, w = texture2D(tColor, uv - vec2(uTexel.x, 0.0)).rgb;
    vec3 mn = min(c, min(min(n, s2), min(e, w))), mx = max(c, max(max(n, s2), max(e, w)));
    c = clamp(c + (c - (n + s2 + e + w) * 0.25) * uSharp * 1.6, mn, mx);
  }
  c *= mix(1.0, texture2D(tAO, uv).r, uAOStr);
  c += texture2D(tBloom, uv).rgb * uBloom;
  c += texture2D(tGod, uv).rgb * uGodStr;
  c = mix(c, c * 1.18 + 0.02, wm * uWet * 0.7);
  // near plane straddling the surface: tint the submerged part of the frame and draw a soft meniscus line
  if (uMeniscus > -0.5) {
    float sideV = (uv.y - uMeniscus) * -uMenSide;
    c = mix(c, c * uUnderTint * 3.0 + uUnderTint * 0.2, smoothstep(0.0, 0.01, sideV) * 0.8);
    c *= 1.0 - 0.55 * exp(-abs(uv.y - uMeniscus) * 180.0);
  }
  c *= uExposure / 0.6;
  c *= uGrade;                                        // white balance / grade set by the weather
  c *= 1.0 - uFade;                                   // cinematic cut: dip to black
  c = acesFilmic(c);
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(l), c, 0.95);                         // keep saturation realistic
  vec2 q = vUv - 0.5;
  c *= 1.0 - uVignette * smoothstep(0.2, 0.85, length(q * vec2(uAspect * 0.75, 1.0)) * 1.2);
  c = toSRGB(c);
  c += (h12(gl_FragCoord.xy + fract(uTime * 13.7) * 311.0) - 0.5) * uGrain * 2.0;
  if (abs(vUv.y - 0.5) > 0.5 - uLetter) c = vec3(0.0);  // letterbox bars in the movie tour
  gl_FragColor = vec4(c, 1.0);
}`;
const POST = { bloomMips: [] };
let compositePass, ssaoPass, blurPass, bloomPrePass, bloomDownPass, bloomUpPass;
const WHITE_TEX = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1); WHITE_TEX.needsUpdate = true;
const BLACK_TEX = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1); BLACK_TEX.needsUpdate = true;
function buildPost() {
  const kernel = [];
  for (let i = 0; i < 12; i++) {
    const v = new THREE.Vector3(rr(-1, 1), rr(-1, 1), rr(0.15, 1)).normalize();
    const s = lerp(0.15, 1, Math.pow(i / 12, 2)); kernel.push(v.multiplyScalar(s * rr(0.6, 1)));
  }
  ssaoPass = shaderPass(SSAO_FS, { tDepth: { value: null }, uProj: { value: new THREE.Matrix4() }, uInvProj: { value: new THREE.Matrix4() },
    uTexel: { value: new THREE.Vector2() }, uRadius: { value: 0.35 }, uIntensity: { value: 1.35 }, uKernel: { value: kernel } });
  blurPass = shaderPass(BLUR4_FS, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() } });
  bloomPrePass = shaderPass(BLOOM_PRE_FS, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uThreshold: { value: 0.9 }, uExpo: { value: 1 } });
  bloomDownPass = shaderPass(BLOOM_DOWN_FS, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() } });
  bloomUpPass = shaderPass(BLOOM_UP_FS, { tSrc: { value: null }, tCur: { value: null }, uTexel: { value: new THREE.Vector2() } });
  compositePass = shaderPass(COMPOSITE_FS, {
    tColor: { value: null }, tBloom: { value: BLACK_TEX }, tAO: { value: WHITE_TEX }, tGod: { value: BLACK_TEX },
    uExposure: { value: P.exposure }, uVignette: { value: P.vignette }, uGrain: { value: P.grain }, uTime: SH.uTime,
    uBloom: { value: P.bloomStrength }, uAOStr: { value: 0.85 }, uGodStr: { value: 0 }, uUnder: { value: 0 }, uWet: { value: 0 },
    uAspect: { value: 1 }, uTexel: { value: new THREE.Vector2() }, uSharp: { value: 0.35 }, uGrade: { value: new THREE.Vector3(1.035, 1, 0.955) }, uFade: { value: 0 }, uLetter: { value: 0 }, uMeniscus: { value: -1 }, uMenSide: { value: 1 }, uUnderTint: { value: new THREE.Color() },
  });
  onTargetsResized(RT.w, RT.h);
}
function onTargetsResized(w, h) {
  if (!compositePass) return;
  const hf = { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false };
  for (const k of ['ao', 'aoBlur']) if (POST[k]) POST[k].dispose();
  for (const m of POST.bloomMips) m.dispose();
  const hw = Math.max(1, w >> 1), hh = Math.max(1, h >> 1);
  POST.ao = new THREE.WebGLRenderTarget(hw, hh, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false });
  POST.aoBlur = new THREE.WebGLRenderTarget(hw, hh, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false });
  POST.bloomMips = [];
  for (let i = 0; i < 6; i++) POST.bloomMips.push(new THREE.WebGLRenderTarget(Math.max(1, w >> (i + 1)), Math.max(1, h >> (i + 1)), hf));
  POST.bloomUp = [];
  for (let i = 0; i < 5; i++) POST.bloomUp.push(new THREE.WebGLRenderTarget(Math.max(1, w >> (i + 1)), Math.max(1, h >> (i + 1)), hf));
  if (typeof onTargetsResized4 === 'function') onTargetsResized4(w, h);
}
function renderBloom(src) {
  const m = POST.bloomMips;
  bloomPrePass.uniforms.tSrc.value = src; bloomPrePass.uniforms.uTexel.value.set(1 / RT.w, 1 / RT.h);
  bloomPrePass.uniforms.uThreshold.value = P.bloomThreshold; bloomPrePass.uniforms.uExpo.value = P.exposure * CAMPUS_EXPO / 0.6;
  bloomPrePass.render(m[0]);
  for (let i = 1; i < m.length; i++) {
    bloomDownPass.uniforms.tSrc.value = m[i - 1].texture; bloomDownPass.uniforms.uTexel.value.set(1 / m[i - 1].width, 1 / m[i - 1].height);
    bloomDownPass.render(m[i]);
  }
  let low = m[m.length - 1].texture;
  for (let i = m.length - 2; i >= 0; i--) {
    const up = POST.bloomUp[i];
    bloomUpPass.uniforms.tSrc.value = low; bloomUpPass.uniforms.tCur.value = m[i].texture;
    bloomUpPass.uniforms.uTexel.value.set(1 / m[i + 1].width, 1 / m[i + 1].height);
    bloomUpPass.render(up); low = up.texture;
  }
  return low;
}
function renderSSAO() {
  const u = ssaoPass.uniforms;
  u.tDepth.value = RT.main.depthTexture;
  u.uProj.value.copy(camera.projectionMatrix); u.uInvProj.value.copy(camera.projectionMatrixInverse);
  u.uTexel.value.set(1 / POST.ao.width, 1 / POST.ao.height);
  ssaoPass.render(POST.ao);
  blurPass.uniforms.tSrc.value = POST.ao.texture; blurPass.uniforms.uTexel.value.set(1 / POST.ao.width, 1 / POST.ao.height);
  blurPass.render(POST.aoBlur);
  return POST.aoBlur.texture;
}
function renderPost() {
  const high = P.quality === 'High';
  const u = compositePass.uniforms;
  let color = RT.main.texture;
  if (typeof renderUnderwaterPost === 'function') color = renderUnderwaterPost(color, u);
  u.tColor.value = color;
  u.tAO.value = high && P.ssao ? renderSSAO() : WHITE_TEX;
  u.tBloom.value = P.bloomStrength > 0 ? renderBloom(RT.main.texture) : BLACK_TEX;
  u.uExposure.value = P.exposure * CAMPUS_EXPO; u.uVignette.value = P.vignette; u.uGrain.value = P.grain; u.uBloom.value = P.bloomStrength / 5;
  u.uAspect.value = RT.w / RT.h; u.uTexel.value.set(1 / RT.w, 1 / RT.h); u.uSharp.value = P.sharpen;
  const film = P.cameraMode === 'Cinematic' && P.movie && !P.holdCamera && !FEED.active && TWEEN.t >= 1;
  u.uFade.value = film ? MOVIE.fade : 0;
  u.uLetter.value = film && P.letterbox ? Math.max(0, (1 - (RT.w / RT.h) / 2.0) / 2) : 0;
  const cap = document.getElementById('caption'); if (cap && !film) cap.style.opacity = '0';
  compositePass.render(null);
}

/* ------------------------------------------------------------------ 13. CAMERA CONTROLS */
const CTRL = { yaw: 0.06, pitch: -0.07, keys: {}, dragging: false, moved: 0, lastX: 0, lastY: 0 };
const raycaster = new THREE.Raycaster(), _ndc = new THREE.Vector2(), waterPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -WATER_Y);
function setupControls() {
  addEventListener('keydown', (e) => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) return;
    if (e.metaKey || e.key === 'Meta' || e.key === 'OS') { screenshotGuard(); return; }   // e.g. Shift+Cmd+4: hold the shot, never treat it as movement
    CTRL.keys[e.code] = true;
    if (e.code !== 'KeyM') startAudio();
    if (e.code === 'KeyW' && window.PondCampus) { PondCampus.toggleDemo(); return; }
    if (e.code === 'Escape' && window.PondCampus) PondCampus.toggleDemo(false);
    if (e.code === 'KeyF' || e.code === 'KeyC') toggleCameraMode();
    if (e.code === 'KeyP') setHold(!P.holdCamera);
    if (e.code === 'KeyO') setFreeze(!P.freezeScene);
    if (e.code === 'KeyV' || (e.code === 'Escape' && P.cleanView)) setClean(!P.cleanView);
    if (e.code === 'KeyE') startFeeding();
    if (e.code === 'KeyT') cycleWeather();
    if (e.code === 'KeyG') startStroke();
    if (e.code === 'KeyM') setMuted(P.audio);
    if (e.code === 'KeyI') setGuide($('help').classList.contains('hidden'));
    if (e.code === 'KeyK') { if (P.cameraMode === 'Follow koi') FOLLOW.idx++; else P.cameraMode = 'Follow koi'; onCameraMode(); }
    if (e.code === 'KeyH') { const d = document.querySelector('.dg.ac'); if (d) { const show = d.style.display === 'none' || !d.classList.contains('shown'); d.classList.toggle('shown', show); d.style.display = show ? '' : 'none'; } }
  });
  addEventListener('keyup', (e) => { CTRL.keys[e.code] = false; if (e.key === 'Meta') clearKeys(); });
  // keys released while the page is not focused never send keyup: forget them so the camera can't drift
  addEventListener('blur', clearKeys);
  document.addEventListener('visibilitychange', clearKeys);
  canvas.addEventListener('pointerdown', (e) => { CTRL.dragging = true; CTRL.moved = 0; CTRL.lastX = e.clientX; CTRL.lastY = e.clientY; canvas.setPointerCapture(e.pointerId); startAudio(); });
  canvas.addEventListener('pointermove', (e) => {
    if (!CTRL.dragging) return;
    const dx = e.clientX - CTRL.lastX, dy = e.clientY - CTRL.lastY; CTRL.lastX = e.clientX; CTRL.lastY = e.clientY;
    CTRL.moved += Math.abs(dx) + Math.abs(dy);
    if (STROKE.active && STROKE.phaseStart >= 0) { STROKE.user = clamp((STROKE.user < 0 ? 0.3 : STROKE.user) + dx * 0.0025 * (STROKE.along.dot(_hr.crossVectors(camera.getWorldDirection(_hf), _up)) > 0 ? 1 : -1), 0.1, 0.85); return; }
    if (P.cameraMode === 'Manual' && !P.holdCamera) { CTRL.yaw -= dx * 0.0032; CTRL.pitch = clamp(CTRL.pitch - dy * 0.0032, -1.45, 1.45); }
  });
  canvas.addEventListener('wheel', (e) => { if (P.cameraMode !== 'Manual') return; e.preventDefault(); CTRL.speedMul = clamp((CTRL.speedMul || 1) * (e.deltaY > 0 ? 0.85 : 1.18), 0.05, 5); toast(`飞行速度 ×${CTRL.speedMul.toFixed(2)}`); }, { passive: false });
  canvas.addEventListener('pointerup', (e) => {
    CTRL.dragging = false; STROKE.user = -1;
    if (CTRL.moved < 5) {                               // a click: drop a ripple where the ray meets the water
      _ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
      raycaster.setFromCamera(_ndc, camera);
      if (frogHit(raycaster.ray)) { frogJump(); return; }
      const hit = raycaster.ray.intersectPlane(waterPlane, new THREE.Vector3());
      if (hit && sdf(hit.x, hit.z) < -0.05 && !STROKE.active) { addDrop(hit.x, hit.z, 0.16, -0.014); bubbleBurst(hit.x, WATER_Y - 0.01, hit.z, 10, 0.03, 0.0005, 0.003, 0.25); spawnSplash(hit.x, hit.z, 0.45, WATER_Y, true); splashAt(hit.x, WATER_Y, hit.z, 0.42); }
    }
  });
  canvas.addEventListener('pointermove', (e) => {           // hovering the cursor across the water leaves a faint wake
    if (CTRL.dragging) return;
    CTRL.hoverX = e.clientX; CTRL.hoverY = e.clientY; CTRL.hoverT = performance.now();
    _ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    raycaster.setFromCamera(_ndc, camera);
    canvas.style.cursor = frogHit(raycaster.ray) ? 'pointer' : '';
  });
}
let lastHoverDrop = 0;
function hoverRipples() {
  if (!CTRL.hoverT || performance.now() - CTRL.hoverT > 80 || performance.now() - lastHoverDrop < 70) return;
  _ndc.set((CTRL.hoverX / innerWidth) * 2 - 1, -(CTRL.hoverY / innerHeight) * 2 + 1);
  raycaster.setFromCamera(_ndc, camera);
  const hit = raycaster.ray.intersectPlane(waterPlane, new THREE.Vector3());
  if (hit && sdf(hit.x, hit.z) < -0.05 && hit.distanceTo(camera.position) < 25) { addDrop(hit.x, hit.z, 0.07, -0.0025); lastHoverDrop = performance.now(); }
}
const _fwd = new THREE.Vector3(), _right = new THREE.Vector3();
function clearKeys() { for (const k in CTRL.keys) CTRL.keys[k] = false; CTRL.dragging = false; }
let guardTimer = 0;
function screenshotGuard() {
  clearKeys();
  if (!P.holdCamera) { setHold(true, true); toast('已定格镜头便于截图 · 按 P 解除'); }
  clearTimeout(guardTimer); guardTimer = setTimeout(() => { if (P.holdCamera && P._autoHold) setHold(false); }, 12000);
}
function setHold(v, auto = false) {
  P.holdCamera = v; P._autoHold = v && auto;
  $('tb-hold').setAttribute('aria-pressed', String(v)); setBtnLabel('tb-hold', v ? '已定格' : '定格');
  if (!auto) toast(v ? '镜头已定格（P 解除）' : '镜头已解除定格');
  if (!v && P.cameraMode === 'Cinematic') PATH.blend = 0;
  if (GUI_CTRL.hold) GUI_CTRL.hold.updateDisplay();
}
function setFreeze(v) {
  P.freezeScene = v; $('tb-freeze').setAttribute('aria-pressed', String(v)); setBtnLabel('tb-freeze', v ? '已暂停' : '暂停');
  toast(v ? '时间已暂停 · 按 O 继续' : '时间继续');
  if (GUI_CTRL.freeze) GUI_CTRL.freeze.updateDisplay();
}
// toolbar buttons carry an icon + a label span; only the label changes
function setBtnLabel(id, text) { const b = $(id); if (!b) return; const l = b.querySelector('.lbl'); if (l) l.textContent = text; else b.textContent = text; }
// sound: one switch for all ambience and effects (M / toolbar / panel), remembered between visits
function setMuted(m) {
  P.audio = !m;
  if (m) { if (typeof stopAudio === 'function') stopAudio(); } else startAudio(true);
  const b = $('tb-sound');
  if (b) { b.setAttribute('aria-pressed', String(m)); b.setAttribute('aria-label', m ? '取消静音' : '静音'); b.title = (m ? '取消静音' : '静音') + '（M）'; setBtnLabel('tb-sound', m ? '已静音' : '声音'); }
  if (GUI_CTRL.audio) GUI_CTRL.audio.updateDisplay();
  try { localStorage.setItem('koi.muted', m ? '1' : '0'); } catch (e) { /* storage unavailable */ }
}
// the guide card (top left): I toggles it, the x hides it, a small ? brings it back; remembered between visits
function setGuide(show) {
  $('help').classList.toggle('hidden', !show); $('help').setAttribute('aria-hidden', String(!show));
  $('help-open').classList.toggle('shown', !show);
  try { localStorage.setItem('pond.guide', show ? '1' : '0'); } catch (e) { /* storage unavailable */ }
}
function setClean(v) {
  P.cleanView = v; document.body.classList.toggle('clean', v);
  if (v) { clearKeys(); const h = $('cleanhint'); h.style.opacity = 1; clearTimeout(setClean._t); setClean._t = setTimeout(() => (h.style.opacity = 0), 1800); }
}
function toggleCameraMode() { P.cameraMode = P.cameraMode === 'Cinematic' ? 'Manual' : 'Cinematic'; onCameraMode(); }
function updateFreeCamera(dt) {
  // WASD / arrows move, Q down, Space (or R) up, Shift sprint, Alt fine, mouse wheel sets base speed
  const k = CTRL.keys, sp = (k.ShiftLeft || k.ShiftRight ? 3.5 : 1.3) * (CTRL.speedMul || 1) * (k.AltLeft || k.AltRight ? 0.2 : 1) * dt;
  camera.rotation.set(CTRL.pitch, CTRL.yaw, 0, 'YXZ');
  camera.getWorldDirection(_fwd); _right.crossVectors(_fwd, camera.up).normalize();
  if (k.ArrowUp) camera.position.addScaledVector(_fwd, sp);
  if (k.ArrowDown) camera.position.addScaledVector(_fwd, -sp);
  if (k.ArrowLeft) camera.position.addScaledVector(_right, -sp);
  if (k.ArrowRight) camera.position.addScaledVector(_right, sp);
  if (k.KeyQ || k.PageDown) camera.position.y -= sp * 0.7;          // descend (dives when over the pond)
  if (k.Space || k.KeyR || k.PageUp) camera.position.y += sp * 0.7;
}
function onCameraMode() {
  if (P.cameraMode === 'Manual') {
    const e = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ'); CTRL.yaw = e.y; CTRL.pitch = e.x;
  } else PATH.blend = 0;
  if (GUI_CTRL.cam) GUI_CTRL.cam.updateDisplay();
  setBtnLabel('tb-cam', P.cameraMode === 'Cinematic' ? '自由镜头' : '电影镜头');
  toast(P.cameraMode === 'Manual' ? '自由镜头：拖动转向 · 方向键移动 · Q 下降 · 空格上升 · Shift 加速 · 滚轮调速' : P.cameraMode === 'Follow koi' ? '跟随锦鲤（按 K 换一条）' : P.cameraMode === 'Follow turtle' ? '跟随乌龟' : '电影镜头（自动巡游）');
}

/* ------------------------------------------------------------------ 13b. CINEMATIC PATH, DIVE EFFECTS & AUDIO */
// Closed Catmull-Rom path: low over the near shore looking at the bridge, glide right, descend through the
// surface to fish-eye level, look up into Snell's window, rise back out and return.
const PATH = {
  pos: new THREE.CatmullRomCurve3([
    [-0.6, 0.4, 5.3], [0.6, 0.42, 4.9], [1.7, 0.44, 3.9], [2.05, 0.36, 2.5], [1.75, 0.16, 1.5], [1.25, -0.2, 0.75],
    [0.55, -0.55, 0.05], [-0.25, -0.62, -0.75], [-0.75, -0.55, -1.7], [-0.7, -0.45, -2.35], [-0.35, -0.2, -1.7],
    [-0.1, 0.22, -0.75], [0.1, 0.62, 0.6], [-0.45, 0.62, 2.8], [-0.75, 0.3, 3.15], [-0.62, 0.15, 4.33],
  ].map((p) => new THREE.Vector3(...p)), true, 'centripetal'),
  look: new THREE.CatmullRomCurve3([
    [0.3, 0.9, -3.6], [0.6, 0.85, -3.5], [0.7, 0.6, -3.0], [0.4, 0.0, -1.0], [0.2, -0.45, -0.6], [-0.2, -0.65, -1.2],
    [-0.8, -0.62, -1.9], [-1.1, -0.55, -2.9], [-0.9, -0.2, -3.4], [-0.5, 1.2, -3.0], [0.0, 0.9, -2.8],
    [0.3, 0.8, -3.2], [0.3, 0.8, -3.6], [-0.4, 0.4, -1.0], [-1.0, 0.08, 3.8], [-1.05, 0.04, 3.86],
  ].map((p) => new THREE.Vector3(...p)), true, 'centripetal'),
  T: 88, t: 0, blend: 1,
};
// Above-water tour (default): past the bridge, down onto the koi, the waterfall, the lotus, and a close pass by the frog
PATH.above = {
  pos: new THREE.CatmullRomCurve3([[-0.6, 0.4, 5.3], [0.6, 0.45, 4.9], [1.05, 0.3, 2.85], [2.2, 0.85, 1.3], [1.2, 1.15, 0.1], [0.1, 0.95, -1.3],
    [-1.25, 0.6, -0.95], [-1.75, 0.48, 0.75], [-1.25, 0.36, 2.6], [-0.62, 0.16, 4.33]].map((p) => new THREE.Vector3(...p)), true, 'centripetal'),
  look: new THREE.CatmullRomCurve3([[0.3, 0.9, -3.6], [0.9, 0.5, -1.5], [1.45, 0.12, 1.75], [0.3, -0.25, 0.2], [0.0, -0.35, -0.9], [-1.4, 0.2, -2.0],
    [-3.0, 0.35, -1.95], [-2.8, 0.3, 0.0], [-1.05, 0.03, 3.85], [-1.05, 0.04, 3.86]].map((p) => new THREE.Vector3(...p)), true, 'centripetal'),
  T: 100,
};
const _pp = new THREE.Vector3(), _pl = new THREE.Vector3(), _pm = new THREE.Matrix4(), _pq = new THREE.Quaternion();
// A directed tour, cut like a short film: an aerial establishing crane over the whole garden, down into the bamboo
// grove, along the fence, under the wisteria, past the weeping cherry to the waterfall, the lotus, low over the koi,
// the turtle's rock, the flower beds, the bonsai, up into the cherry blossom, a close look at the frog, an optional
// dive, and an aerial pull-back. Cuts dip through black; letterbox bars and a lower-third caption name each place.
const MOVIE = { shots: [], i: 0, t: 0, fade: 0 };
function buildMovie() {
  const V = (x, y, z) => new THREE.Vector3(x, y, z), L = (a, b, u) => a.clone().lerp(b, u);
  const orbit = (c, r, h, a0, a1) => (u) => { const a = lerp(a0, a1, u); return V(c.x + Math.cos(a) * r, h, c.z + Math.sin(a) * r); };
  const B = () => WORLD.botany || {};
  const frogP = () => { const p = new THREE.Vector3(); if (FROG.root) FROG.root.getWorldPosition(p); return p; };
  MOVIE.shots = [
    // 1 — the garden from above
    { cap: window.CAMPUS_POND.zoneName || '池塘全景', T: 13, pos: (u) => V(Math.sin(lerp(-0.5, 0.35, u)) * 9, lerp(17, 12.5, u), Math.cos(lerp(-0.5, 0.35, u)) * 9 + 1), look: () => V(0, 0, -1.8) },
    // 2 — the pond and its water
    { cap: window.CAMPUS_POND.lotusExtra ? '满池荷叶' : '翠湖池塘', T: 11, pos: (u) => L(V(-0.35, 0.62, 5.4), V(0.15, 0.36, 3.3), u), look: (u) => L(V(0.2, 0.5, -3.6), V(0.0, 0.2, -3.2), u) },
    { cap: '锦鲤', T: 11, start: () => { const fs = KOI.fish.slice(0, Math.min(P.fishCount, KOI.fish.length)); MOVIE.koi = fs.reduce((b, f) => (f.p.y > b.p.y && sdf(f.p.x, f.p.z) < -0.8 ? f : b), fs[0]); },
      pos: (u) => { const f = MOVIE.koi || KOI.fish[0], a = f.heading + 2.4 + u * 0.6; return V(f.p.x + Math.cos(a) * 0.8, WATER_Y + lerp(0.6, 0.38, u), f.p.z - Math.sin(a) * 0.8); }, look: () => (MOVIE.koi || KOI.fish[0]).p.clone() },
    { cap: '荷花', T: 10, pos: orbit(V(-2.62, 0, -0.15), 0.95, 0.62, 0.35, 1.3), look: () => V(-2.62, 0.5, -0.1) },
    // 3 — bamboo and sakura
    { cap: '竹林', T: 12, pos: (u) => V(lerp(-5.9, -6.4, u), lerp(8.5, 1.5, Math.pow(u, 0.85)), lerp(-10.2, -11.4, u)), look: (u) => V(-9.4, lerp(7.0, 2.6, u), lerp(-10.8, -11.6, u)) },
    { cap: '垂柳依依', T: 10, pos: (u) => L(V(-4.6, 1.15, -3.3), V(-5.3, 1.3, -2.5), u), look: (u) => L(V(-6.9, 2.3, -1.0), V(-6.9, 1.8, -1.0), u) },
    { cap: '岸边垂柳', T: 11, pos: (u) => L(V(8.4, 0.9, 4.4), V(7.7, 1.15, 3.3), u), look: (u) => L(V(5.0, 1.9, 2.6), V(4.6, 1.6, 2.1), u) },
    // 4 — the pond's creatures, then below the surface
    { cap: '青蛙', T: 10, pos: (u) => { const p = frogP(), a = FROG.baseYaw + lerp(-0.4, 0.5, u); return V(p.x + Math.cos(a) * lerp(0.42, 0.24, u), p.y + lerp(0.14, 0.07, u), p.z - Math.sin(a) * lerp(0.42, 0.24, u)); }, look: () => frogP().add(V(0, 0.03, 0)), skip: () => !FROG.root || !WORLD.frogPad.mesh.visible },
    { cap: '晒背的乌龟', T: 9, pos: (u) => { const T0 = TURTLE.pos, a = TURTLE.yaw + 1.9 + u * 0.4, r = lerp(0.8, 0.5, u); return V(T0.x + Math.cos(a) * r, Math.max(WATER_Y + 0.35, T0.y + lerp(0.4, 0.22, u)), T0.z - Math.sin(a) * r); }, look: () => V(TURTLE.pos.x, TURTLE.pos.y + 0.04, TURTLE.pos.z), skip: () => !TURTLE.root || TURTLE.off },
    { cap: '水下世界', T: 13, under: true, pos: (u) => L(V(0.6, 0.35, 2.0), V(0.2, -0.5, 0.7), smoothstep(0, 0.45, u)).add(V(-u * 0.6, 0, -u * 0.8 * smoothstep(0.45, 1, u))), look: (u) => L(V(0.0, -0.3, 0.6), V(-0.6, -0.55, -1.4), u), skip: () => SH.uIce.value > 0.5 },
    // 5 — and back to the pond
    { cap: '', T: 11, pos: (u) => L(V(0.1, 0.4, 3.6), V(-0.3, 0.6, 5.6), u), look: (u) => L(V(0.1, 0.25, -3.2), V(0.2, 0.5, -3.6), u) },
  ];
}
function updateMovie(dt, t) {
  if (!MOVIE.shots.length) buildMovie();
  let sh = MOVIE.shots[MOVIE.i];
  let guard = 0;
  while (sh.skip && sh.skip() && guard++ < MOVIE.shots.length) { MOVIE.i = (MOVIE.i + 1) % MOVIE.shots.length; MOVIE.t = 0; sh = MOVIE.shots[MOVIE.i]; }
  if (MOVIE.started !== sh) { MOVIE.started = sh; if (sh.start) sh.start(); }
  MOVIE.t += dt * P.pathSpeed;
  const u = clamp(MOVIE.t / sh.T, 0, 1), e = lerp(u, u * u * (3 - 2 * u), 0.55);
  const p = sh.pos(e), l = sh.look(e);
  p.x += Math.sin(t * 0.37) * 0.01; p.y += Math.sin(t * 0.53) * 0.007;          // faint hand-held drift
  if (!sh.under) {                                                              // never inside the ground or the water
    const sd = sdf(p.x, p.z), floor = sd < 0 ? WATER_Y + 0.12 : ground(p.x, p.z) + 0.3;
    p.y = Math.max(p.y, floor);
  }
  camera.position.copy(p); camera.lookAt(l);
  const fin = 0.5, fout = 0.5;
  MOVIE.fade = clamp(Math.max(1 - MOVIE.t / fin, (MOVIE.t - (sh.T - fout)) / fout), 0, 1);
  const cap = document.getElementById('caption');
  if (cap) { if (cap.textContent !== sh.cap) cap.textContent = sh.cap; cap.style.opacity = sh.cap ? String(clamp(Math.min((MOVIE.t - 0.8) / 0.8, (sh.T - 1.2 - MOVIE.t) / 0.8), 0, 1) * 0.92) : '0'; }
  if (MOVIE.t >= sh.T) { MOVIE.i = (MOVIE.i + 1) % MOVIE.shots.length; MOVIE.t = 0; if (MOVIE.i === 0 && P.tourSeasons) cycleWeather(); }
}
function updateCinematic(dt, t) {
  if (P.movie) { updateMovie(dt, t); return; }
  PATH.t += dt * P.pathSpeed;
  const route = P.stayAbove ? PATH.above : PATH;                      // the underwater dive is optional
  if (route === PATH.above && FROG.root && !FROG.jump) {               // the closing frog shot follows the frog to whichever pad it is on
    FROG.root.getWorldPosition(_pl);
    route.look.points[8].set(_pl.x, _pl.y + 0.03, _pl.z); route.look.points[9].set(_pl.x, _pl.y + 0.04, _pl.z + 0.01);
    route.pos.points[8].set(_pl.x - 0.2, 0.36, _pl.z - 1.25); route.pos.points[9].set(_pl.x + 0.43, 0.16, _pl.z + 0.48);
  }
  const u = ((PATH.t / route.T) % 1 + 1) % 1;
  route.pos.getPoint(u, _pp); route.look.getPoint(u, _pl);
  _pp.x += Math.sin(t * 0.37) * 0.012; _pp.y += Math.sin(t * 0.53) * 0.008;   // faint hand-held drift
  _pm.lookAt(_pp, _pl, _up); _pq.setFromRotationMatrix(_pm);
  if (PATH.blend < 1) {                                                        // ease in from the free camera
    PATH.blend = Math.min(1, PATH.blend + dt / 2.5);
    const k = 1 - Math.exp(-dt * 2.5 / Math.max(0.05, 1 - PATH.blend));
    camera.position.lerp(_pp, k); camera.quaternion.slerp(_pq, k);
  } else { camera.position.copy(_pp); camera.quaternion.copy(_pq); }
}
// Follow-koi camera: shadows one fish from above the water (the classic top-down koi view), easing smoothly
const FOLLOW = { idx: 0, pos: new THREE.Vector3(), look: new THREE.Vector3(), init: false };
function updateFollow(dt) {
  const f = KOI.fish[FOLLOW.idx % Math.max(1, Math.min(P.fishCount, KOI.fish.length))];
  if (!f) return;
  const fx = Math.cos(f.heading), fz = -Math.sin(f.heading), sz = f.size;
  const tp = _pp.set(f.p.x - fx * sz * 1.2 + fz * sz * 0.9, Math.max(WATER_Y + 0.28, f.p.y + sz * 1.9), f.p.z - fz * sz * 1.2 - fx * sz * 0.9);
  const tl = _pl.set(f.p.x + fx * sz * 0.2, f.p.y, f.p.z + fz * sz * 0.2);
  if (!FOLLOW.init) { FOLLOW.pos.copy(camera.position); FOLLOW.look.copy(tl); FOLLOW.init = true; }
  FOLLOW.pos.lerp(tp, 1 - Math.exp(-dt * 1.4)); FOLLOW.look.lerp(tl, 1 - Math.exp(-dt * 3));
  camera.position.copy(FOLLOW.pos); camera.lookAt(FOLLOW.look);
}
// Turtle camera: a three-quarter view from its side; stays above the water and looks down through it while it swims
function updateFollowTurtle(dt) {
  const T = TURTLE; if (!T.root) return;
  const fx = Math.cos(T.yaw), fz = -Math.sin(T.yaw), under = T.pos.y < WATER_Y - 0.08;
  const d = under ? 0.5 : 0.36, side = 0.8;
  const tp = _pp.set(T.pos.x + fx * d * 0.55 + fz * d * side, under ? WATER_Y + 0.42 : T.pos.y + 0.16, T.pos.z + fz * d * 0.55 - fx * d * side);
  const tl = _pl.set(T.pos.x + fx * 0.05, T.pos.y + 0.035, T.pos.z + fz * 0.05);
  if (!FOLLOW.initT) { FOLLOW.tpos = camera.position.clone(); FOLLOW.tlook = tl.clone(); FOLLOW.initT = true; }
  FOLLOW.tpos.lerp(tp, 1 - Math.exp(-dt * 1.2)); FOLLOW.tlook.lerp(tl, 1 - Math.exp(-dt * 3));
  camera.position.copy(FOLLOW.tpos); camera.lookAt(FOLLOW.tlook);
}
// One-click close-up views (switch to free-fly and glide there)
const VIEWS = {
  '垂柳': () => { const w = (WORLD.willows || [[-6.9, -1.0, 5]])[1] || WORLD.willows[0], g = terrainHeight(w[0], w[1]); return [new THREE.Vector3(w[0] + 2.6, g + 1.5, w[1] - 2.2), new THREE.Vector3(w[0], g + w[2] * 0.45, w[1])]; },
  '鸢尾（花菖蒲）': () => { const c = (WORLD.irisClumps || [{ x: -2, z: 4 }])[0]; return [new THREE.Vector3(c.x - c.nx * 0.9, 0.55, c.z - c.nz * 0.9), new THREE.Vector3(c.x, 0.35, c.z)]; },
  '芒草': () => { const c = (WORLD.grass || [[3, 4]])[0]; const g = terrainHeight(c[0], c[1]); return [new THREE.Vector3(c[0] - 1.0, g + 0.9, c[1] + 1.0), new THREE.Vector3(c[0], g + 0.4, c[1])]; },
  '水杉': () => [new THREE.Vector3(-3.5, 2.2, -9.5), new THREE.Vector3(-7, 6.5, -17.5)],
  '黑松': () => [new THREE.Vector3(2.8, 2.0, 1.4), new THREE.Vector3(5.3, 3.4, -1.3)],
  '杜鹃': () => [new THREE.Vector3(2.4, 1.0, 2.6), new THREE.Vector3(4.2, 0.4, 1.5)],
  '石拱桥': () => [new THREE.Vector3(0.9, 1.05, -1.4), new THREE.Vector3(0.0, 0.7, -3.55)],
  '六角亭': () => [new THREE.Vector3(2.6, 2.0, -4.2), new THREE.Vector3(PAVILION.x, 1.8, PAVILION.z)],
  '庭院灯与长椅': () => { const b = (WORLD.benches || [[-4, -3]])[0], g = terrainHeight(b[0], b[1]); return [new THREE.Vector3(b[0] + 1.6, g + 1.2, b[1] + 1.6), new THREE.Vector3(b[0], g + 0.6, b[1])]; },
  '青蛙': () => { const p = new THREE.Vector3(); FROG.root.getWorldPosition(p); const y = FROG.baseYaw + 0.35; return [new THREE.Vector3(p.x + Math.cos(y) * 0.2, p.y + 0.07, p.z - Math.sin(y) * 0.2), new THREE.Vector3(p.x, p.y + 0.035, p.z)]; },
  '蜻蜓': () => { const D = DRAGON.list.find((d) => d.state === 'perch') || DRAGON.list[0], p = D.p, y = D.yaw + 2.2;
    return [new THREE.Vector3(p.x + Math.cos(y) * 0.13, p.y + 0.06, p.z - Math.sin(y) * 0.13), p.clone()]; },
  '竹林': () => [new THREE.Vector3(-5.6, 1.5, -11.2), new THREE.Vector3(-9.2, 2.8, -10.6)],
  '紫藤架': () => { const [x, z] = WORLD.botany.arbor || [7.2, 0.6], g = ground(x, z); return [new THREE.Vector3(x - 2.2, g + 1.35, z + 1.6), new THREE.Vector3(x, g + 1.9, z)]; },
  '绣球': () => { const [x, z] = WORLD.botany.hyd[0] || [4, 4], g = ground(x, z); return [new THREE.Vector3(x + 1.1, g + 1.0, z + 1.1), new THREE.Vector3(x, g + 0.55, z)]; },
  '石蒜': () => { const [x, z] = WORLD.botany.lily[0] || [0, 6], g = ground(x, z); return [new THREE.Vector3(x + 0.6, g + 0.55, z + 0.6), new THREE.Vector3(x, g + 0.4, z)]; },
  '牡丹': () => { const [x, z] = WORLD.botany.peony[0] || [3, 5], g = ground(x, z); return [new THREE.Vector3(x + 0.9, g + 0.8, z + 0.9), new THREE.Vector3(x, g + 0.45, z)]; },
  '山茶': () => { const [x, z] = WORLD.botany.cam[0] || [5, 5], g = ground(x, z); return [new THREE.Vector3(x + 1.6, g + 1.2, z + 1.6), new THREE.Vector3(x, g + 0.7, z)]; },
  '睡莲': () => [new THREE.Vector3(-1.45, 0.3, 2.25), new THREE.Vector3(-1.85, 0.0, 1.5)],
  '桥面': () => [new THREE.Vector3(0.9, 1.05, -2.85), new THREE.Vector3(0.3, 0.7, -3.55)],
  '驳岸石与苔藓': () => [new THREE.Vector3(-3.0, 0.55, 2.7), new THREE.Vector3(-3.5, 0.05, 2.0)],
  '荷花': () => [new THREE.Vector3(-2.0, 0.55, 0.5), new THREE.Vector3(-2.65, 0.4, -0.1)],
  '水下': () => [new THREE.Vector3(0.4, -0.55, 1.2), new THREE.Vector3(-0.3, -0.6, -0.5)],
  '睡莲根茎（水下）': () => [new THREE.Vector3(-0.3, -0.42, 3.05), new THREE.Vector3(-1.05, -0.78, 3.95)],
  '假山跌水': () => [wfWorld(1.45, 0.55, 0.62), wfWorld(-0.45, 0, 0.35)],
};
const TWEEN = { t: 1, from: new THREE.Vector3(), to: new THREE.Vector3(), q0: new THREE.Quaternion(), q1: new THREE.Quaternion() };
function goToView(name) {
  if (name === 'Turtle' || name === '乌龟') { P.cameraMode = 'Follow turtle'; FOLLOW.initT = false; onCameraMode(); return; }
  const v = VIEWS[name]; if (!v) return;
  const [pos, look] = v();
  P.cameraMode = 'Manual'; if (GUI_CTRL.cam) GUI_CTRL.cam.updateDisplay();
  TWEEN.from.copy(camera.position); TWEEN.q0.copy(camera.quaternion); TWEEN.to.copy(pos);
  _pm.lookAt(pos, look, _up); TWEEN.q1.setFromRotationMatrix(_pm); TWEEN.t = 0;
  toast(name);
  return true;
}
function updateCamera(dt, t) {
  if (P.holdCamera || (P.cleanView && P.cameraMode !== 'Manual')) return;   // hold the shot: nothing moves the camera
  if (TWEEN.t < 1) {
    TWEEN.t = Math.min(1, TWEEN.t + dt / 1.8); const k = TWEEN.t * TWEEN.t * (3 - 2 * TWEEN.t);
    camera.position.lerpVectors(TWEEN.from, TWEEN.to, k); camera.quaternion.slerpQuaternions(TWEEN.q0, TWEEN.q1, k);
    if (TWEEN.t >= 1) { const e = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ'); CTRL.yaw = e.y; CTRL.pitch = e.x; }
    return;
  }
  const crouch = FEED.shot && FEED.active ? FEED.shot : STROKE.active && STROKE.shot ? STROKE.shot : null;
  if (crouch) {                                          // feeding / stroking: ease to the crouched shore view in any mode
    _pm.lookAt(crouch.pos, crouch.look, _up); _pq.setFromRotationMatrix(_pm);
    const k = 1 - Math.exp(-dt * 2.2);
    camera.position.lerp(crouch.pos, k); camera.quaternion.slerp(_pq, k);
    return;
  }
  if (P.cameraMode === 'Follow koi') { updateFollow(dt); return; }
  if (P.cameraMode === 'Follow turtle') { updateFollowTurtle(dt); return; }
  FOLLOW.init = false; FOLLOW.initT = false;
  if (P.cameraMode === 'Manual') updateFreeCamera(dt);
  else if (FEED.shot) {                                   // feeding shot: ease over to a framed view of the spot
    _pm.lookAt(FEED.shot.pos, FEED.shot.look, _up); _pq.setFromRotationMatrix(_pm);
    const k = 1 - Math.exp(-dt * 1.6);
    camera.position.lerp(FEED.shot.pos, k); camera.quaternion.slerp(_pq, k);
  } else updateCinematic(dt, t);
}

/* --- Suspended particles (only while submerged): points wrapped in a box that follows the camera */
const PARTICLE_VS = /* glsl */`
// === UNDERWATER PARTICLES: slow drift, wrapped around the camera, size-attenuated
attribute vec3 aSeed;
uniform vec3 uCam;
uniform float uTime;
uniform float uBox;
uniform float uScale;
uniform float uWaterY;
varying float vA;
varying float vD;
void main(){
  vec3 p = aSeed * uBox + vec3(sin(uTime * 0.11 + aSeed.y * 20.0) * 0.12, uTime * 0.01 * (0.5 + aSeed.z), cos(uTime * 0.09 + aSeed.x * 17.0) * 0.12);
  p = uCam + mod(p - uCam + uBox * 0.5, uBox) - uBox * 0.5;
  vec4 mv = viewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float d = -mv.z; vD = d;
  gl_PointSize = min(uScale * (0.4 + aSeed.x * 0.8) / max(d, 0.05), 5.0);
  vA = step(p.y, uWaterY - 0.01) * smoothstep(uBox * 0.5, uBox * 0.25, d) * smoothstep(0.3, 0.8, d);
}`;
const PARTICLE_FS = /* glsl */`
uniform vec3 uColor;
uniform vec3 uAbsorb;
varying float vA;
varying float vD;
void main(){
  vec2 q = gl_PointCoord - 0.5; float r = dot(q, q);
  if (r > 0.25 || vA < 0.01) discard;
  float a = smoothstep(0.25, 0.0, r) * vA * 0.3;
  gl_FragColor = vec4(uColor * exp(-uAbsorb * vD), a);
}`;
let particles;
function buildParticles() {
  const N = 1600, seeds = new Float32Array(N * 3);
  for (let i = 0; i < N * 3; i++) seeds[i] = rand();
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 3));
  const m = new THREE.ShaderMaterial({ vertexShader: PARTICLE_VS, fragmentShader: PARTICLE_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uCam: { value: new THREE.Vector3() }, uTime: SH.uTime, uBox: { value: 6 }, uScale: { value: 6 }, uWaterY: SH.uWaterY, uColor: { value: new THREE.Color() }, uAbsorb: SH.uAbsorb } });
  particles = new THREE.Points(g, m); particles.frustumCulled = false; particles.renderOrder = 5;
  setLayer(particles, LAYER.UNDER); scene.add(particles);
}
function updateParticles() {
  if (!particles) return;
  particles.visible = STATE.under;
  const u = particles.material.uniforms;
  u.uCam.value.copy(camera.position);
  u.uScale.value = 0.005 * RT.h / (2 * Math.tan(camera.fov * DEG / 2));
  u.uColor.value.copy(SH.uInscatter.value).multiplyScalar(4).add(new THREE.Color(0.02, 0.025, 0.02).multiplyScalar(sunState.intensity));
}

/* --- God rays (radial blur from the sun's screen position) and depth of field */
const GOD_MASK_FS = /* glsl */`
// === GOD RAYS mask: bright sky (above) or the bright surface / Snell's window (below)
uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform mat4 uInvViewProj;
uniform float uUnder;
uniform float uWaterY;
uniform float uThresh;
varying vec2 vUv;
void main(){
  float d = texture2D(tDepth, vUv).r;
  vec3 c = texture2D(tColor, vUv).rgb;
  float m;
  if (uUnder > 0.5) {
    vec4 wp = uInvViewProj * vec4(vUv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0); wp.xyz /= wp.w;
    m = 1.0 - smoothstep(0.04, 0.14, abs(wp.y - uWaterY));
  } else m = step(0.99999, d);
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  gl_FragColor = vec4(min(c, vec3(4.0)) * m * smoothstep(uThresh, uThresh * 3.0, l), 1.0);
}`;
const GOD_BLUR_FS = /* glsl */`
// === GOD RAYS: radial blur toward the light (GPU Gems 3, ch. 13)
uniform sampler2D tSrc;
uniform vec2 uSun;
uniform float uDecay;
uniform float uDensity;
uniform float uWeight;
varying vec2 vUv;
void main(){
  vec2 uv = vUv, delta = (uv - uSun) * uDensity / 48.0;
  float illum = 1.0; vec3 acc = vec3(0.0);
  for (int i = 0; i < 48; i++) {
    uv -= delta;
    acc += texture2D(tSrc, clamp(uv, 0.001, 0.999)).rgb * illum * uWeight;
    illum *= uDecay;
  }
  gl_FragColor = vec4(acc, 1.0);
}`;
// === CAMERA LENS: physically based depth of field (thin lens, full-frame sensor, focal length from the FOV) with a
// GPU autofocus that racks focus smoothly in dioptres. Pipeline: half-res prefilter (colour + signed CoC) ->
// 43-tap disc bokeh gather with separate near / far fields -> 9-tap tent -> full-res combine that keeps
// in-focus pixels at native sharpness (no stair-stepped halos around edges).
const DOF_COMMON = /* glsl */`
#include <packing>
uniform sampler2D tDepth;
uniform sampler2D tFocus;
uniform float uNear;
uniform float uFar;
uniform float uFL;        // focal length (m)
uniform float uFN;        // f-number
uniform float uMaxCoc;    // max CoC radius, fraction of image height
float linZ(vec2 uv){ return -perspectiveDepthToViewZ(texture2D(tDepth, uv).r, uNear, uFar); }
float cocOf(float z, float F){
  // thin lens: blur-circle diameter on a 24 mm-high sensor, as a radius in image-height units; + far, - near
  float c = uFL * uFL / (uFN * max(F - uFL, 1e-3)) * (z - F) / max(z, 1e-3) / 0.024 * 0.5;
  return clamp(c, -uMaxCoc, uMaxCoc);
}
`;
const DOF_FOCUS_FS = /* glsl */`
#include <packing>
uniform sampler2D tDepth;
uniform sampler2D tPrev;
uniform float uNear;
uniform float uFar;
uniform float uSubject;   // > 0: a known subject under the AF point (m)
uniform float uRate;      // 1 - exp(-dt * speed)
uniform float uAspect;
varying vec2 vUv;
float linZ(vec2 uv){ return -perspectiveDepthToViewZ(texture2D(tDepth, uv).r, uNear, uFar); }
void main(){
  float target = uSubject;
  if (target <= 0.0) {
    // AF area: 13 points around the centre, weighted toward the nearest surfaces like a camera's closest-subject AF
    float ws = 0.0, zs = 0.0;
    for (int i = 0; i < 13; i++) {
      float a = float(i) * 2.39996, r = sqrt(float(i) / 13.0) * 0.045;
      float z = min(linZ(vec2(0.5) + vec2(cos(a) * r / uAspect, sin(a) * r)), 80.0);
      float w = 1.0 / (z * z + 0.01);
      zs += z * w; ws += w;
    }
    target = zs / ws;
  }
  target = clamp(target, 0.12, 80.0);
  float prev = texture2D(tPrev, vec2(0.5)).r;
  if (prev <= 0.0) prev = target;
  float d = mix(1.0 / prev, 1.0 / target, uRate);          // a focus motor moves in dioptres
  gl_FragColor = vec4(1.0 / d, 0.0, 0.0, 1.0);
}`;
const DOF_PRE_FS = DOF_COMMON + /* glsl */`
uniform sampler2D tColor;
uniform vec2 uTexel;      // full-res texel
varying vec2 vUv;
void main(){
  float F = texture2D(tFocus, vec2(0.5)).r;
  vec2 o = uTexel * 0.5;
  vec2 u0 = vUv + vec2(-o.x, -o.y), u1 = vUv + vec2(o.x, -o.y), u2 = vUv + vec2(-o.x, o.y), u3 = vUv + vec2(o.x, o.y);
  vec3 c0 = texture2D(tColor, u0).rgb, c1 = texture2D(tColor, u1).rgb, c2 = texture2D(tColor, u2).rgb, c3 = texture2D(tColor, u3).rgb;
  float k0 = cocOf(linZ(u0), F), k1 = cocOf(linZ(u1), F), k2 = cocOf(linZ(u2), F), k3 = cocOf(linZ(u3), F);
  float cmin = min(min(k0, k1), min(k2, k3)), cmax = max(max(k0, k1), max(k2, k3));
  float coc = (-cmin > cmax) ? cmin : cmax;
  // luma-weighted average tames fireflies so bright speculars bloom into round bokeh instead of flicker
  float w0 = 1.0 / (1.0 + max(c0.r, max(c0.g, c0.b))), w1 = 1.0 / (1.0 + max(c1.r, max(c1.g, c1.b))),
        w2 = 1.0 / (1.0 + max(c2.r, max(c2.g, c2.b))), w3 = 1.0 / (1.0 + max(c3.r, max(c3.g, c3.b)));
  vec3 c = (c0 * w0 + c1 * w1 + c2 * w2 + c3 * w3) / (w0 + w1 + w2 + w3);
  gl_FragColor = vec4(c, coc);
}`;
const DOF_BOKEH_FS = /* glsl */`
uniform sampler2D tSrc;
uniform vec2 uKernel[43];
uniform float uMaxCoc;
uniform float uAspect;
uniform vec2 uTexelH;     // half-res texel
varying vec2 vUv;
void main(){
  vec4 s0 = texture2D(tSrc, vUv);
  vec4 bg = vec4(0.0), fg = vec4(0.0);
  float margin = uTexelH.y * 2.0;
  for (int i = 0; i < 43; i++) {
    vec2 k = uKernel[i] * uMaxCoc; float dist = length(k);
    vec4 s = texture2D(tSrc, vUv + vec2(k.x / uAspect, k.y));
    float bw = clamp((max(min(s0.a, s.a), 0.0) - dist + margin) / margin, 0.0, 1.0);   // background never bleeds over a sharper pixel
    float fw = clamp((-s.a - dist + margin) / margin, 0.0, 1.0) * step(uTexelH.y, -s.a); // near blur spreads over what is behind it
    bg += vec4(s.rgb, 1.0) * bw; fg += vec4(s.rgb, 1.0) * fw;
  }
  bg.rgb /= bg.a + (bg.a == 0.0 ? 1.0 : 0.0);
  fg.rgb /= fg.a + (fg.a == 0.0 ? 1.0 : 0.0);
  float fa = clamp(fg.a * 3.14159265 / 43.0, 0.0, 1.0);
  vec3 bgc = bg.a > 0.0 ? bg.rgb : s0.rgb;
  gl_FragColor = vec4(mix(bgc, fg.rgb, fa), fa);
}`;
const DOF_TENT_FS = /* glsl */`
uniform sampler2D tSrc;
uniform vec2 uTexelH;
varying vec2 vUv;
void main(){
  vec4 d = uTexelH.xyxy * vec4(-0.5, -0.5, 0.5, 0.5);
  gl_FragColor = 0.25 * (texture2D(tSrc, vUv + d.xy) + texture2D(tSrc, vUv + d.zy) + texture2D(tSrc, vUv + d.xw) + texture2D(tSrc, vUv + d.zw));
}`;
const DOF_COMBINE_FS = DOF_COMMON + /* glsl */`
uniform sampler2D tColor;
uniform sampler2D tDof;
uniform vec2 uTexel;
varying vec2 vUv;
void main(){
  float F = texture2D(tFocus, vec2(0.5)).r;
  float coc = cocOf(linZ(vUv), F);
  vec4 dof = texture2D(tDof, vUv);
  float ffa = smoothstep(uTexel.y * 2.0, uTexel.y * 4.0, coc);      // far field: blurred only once the circle is visibly bigger than a pixel
  vec3 src = texture2D(tColor, vUv).rgb;
  gl_FragColor = vec4(mix(src, dof.rgb, ffa + dof.a - ffa * dof.a), 1.0);
}`;
const LENS = { focusIdx: 0, kernel: [], subject: -1 };
function buildLens() {
  // concentric-ring disc kernel: 1 + 7 + 14 + 21 samples
  LENS.kernel.push(new THREE.Vector2(0, 0));
  for (let ring = 1; ring <= 3; ring++) for (let i = 0; i < ring * 7; i++) {
    const a = (i / (ring * 7)) * Math.PI * 2 + ring * 0.3, r = ring / 3;
    LENS.kernel.push(new THREE.Vector2(Math.cos(a) * r, Math.sin(a) * r));
  }
  const common = () => ({ tDepth: { value: null }, tFocus: { value: null }, uNear: { value: 0.05 }, uFar: { value: 500 }, uFL: { value: 0.025 }, uFN: { value: 2.8 }, uMaxCoc: { value: 0.018 } });
  LENS.focusPass = shaderPass(DOF_FOCUS_FS, { tDepth: { value: null }, tPrev: { value: null }, uNear: { value: 0.05 }, uFar: { value: 500 }, uSubject: { value: -1 }, uRate: { value: 0.1 }, uAspect: { value: 1 } });
  LENS.prePass = shaderPass(DOF_PRE_FS, Object.assign(common(), { tColor: { value: null }, uTexel: { value: new THREE.Vector2() } }));
  LENS.bokehPass = shaderPass(DOF_BOKEH_FS, { tSrc: { value: null }, uKernel: { value: LENS.kernel }, uMaxCoc: { value: 0.018 }, uAspect: { value: 1 }, uTexelH: { value: new THREE.Vector2() } });
  LENS.tentPass = shaderPass(DOF_TENT_FS, { tSrc: { value: null }, uTexelH: { value: new THREE.Vector2() } });
  LENS.combinePass = shaderPass(DOF_COMBINE_FS, Object.assign(common(), { tColor: { value: null }, tDof: { value: null }, uTexel: { value: new THREE.Vector2() } }));
  const f1 = { type: THREE.FloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false };
  LENS.focusRT = [new THREE.WebGLRenderTarget(1, 1, f1), new THREE.WebGLRenderTarget(1, 1, f1)];
}
function resizeLens(w, h) {
  if (!LENS.prePass) return;
  for (const k of ['pre', 'bokeh', 'tent', 'out']) if (LENS[k]) LENS[k].dispose();
  const hf = { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false };
  const hw = Math.max(1, w >> 1), hh = Math.max(1, h >> 1);
  LENS.pre = new THREE.WebGLRenderTarget(hw, hh, hf); LENS.bokeh = new THREE.WebGLRenderTarget(hw, hh, hf); LENS.tent = new THREE.WebGLRenderTarget(hw, hh, hf);
  LENS.out = new THREE.WebGLRenderTarget(w, h, hf);
}
function renderLens(color, dt, under, subject) {
  if (!LENS.out || LENS.out.width !== RT.w || LENS.out.height !== RT.h) resizeLens(RT.w, RT.h);
  // focal length for a 24 mm-high sensor at the current vertical FOV; a touch wider aperture under water
  const fl = 0.012 / Math.tan(camera.fov * DEG / 2), fn = under ? 2.0 : P.fStop, maxCoc = 0.016 * P.dofStrength;
  const aspect = RT.w / RT.h, depth = RT.main.depthTexture;
  const F = LENS.focusRT[LENS.focusIdx], Fp = LENS.focusRT[1 - LENS.focusIdx];
  const fu = LENS.focusPass.uniforms;
  fu.tDepth.value = depth; fu.tPrev.value = Fp.texture; fu.uNear.value = camera.near; fu.uFar.value = camera.far;
  fu.uSubject.value = subject; fu.uRate.value = 1 - Math.exp(-Math.max(dt, 1 / 120) * 4.5); fu.uAspect.value = aspect;
  LENS.focusPass.render(F); LENS.focusIdx = 1 - LENS.focusIdx;
  for (const p of [LENS.prePass, LENS.combinePass]) {
    const u = p.uniforms; u.tDepth.value = depth; u.tFocus.value = F.texture; u.uNear.value = camera.near; u.uFar.value = camera.far;
    u.uFL.value = fl; u.uFN.value = fn; u.uMaxCoc.value = maxCoc;
  }
  LENS.prePass.uniforms.tColor.value = color; LENS.prePass.uniforms.uTexel.value.set(1 / RT.w, 1 / RT.h);
  LENS.prePass.render(LENS.pre);
  const bu = LENS.bokehPass.uniforms; bu.tSrc.value = LENS.pre.texture; bu.uMaxCoc.value = maxCoc; bu.uAspect.value = aspect; bu.uTexelH.value.set(1 / LENS.pre.width, 1 / LENS.pre.height);
  LENS.bokehPass.render(LENS.bokeh);
  const tu = LENS.tentPass.uniforms; tu.tSrc.value = LENS.bokeh.texture; tu.uTexelH.value.set(1 / LENS.pre.width, 1 / LENS.pre.height);
  LENS.tentPass.render(LENS.tent);
  const cu = LENS.combinePass.uniforms; cu.tColor.value = color; cu.tDof.value = LENS.tent.texture; cu.uTexel.value.set(1 / RT.w, 1 / RT.h);
  LENS.combinePass.render(LENS.out);
  return LENS.out.texture;
}
let godMaskPass, godBlurPass;
function buildDivePost() {
  godMaskPass = shaderPass(GOD_MASK_FS, { tColor: { value: null }, tDepth: { value: null }, uInvViewProj: { value: new THREE.Matrix4() }, uUnder: { value: 0 }, uWaterY: SH.uWaterY, uThresh: { value: 0.3 } });
  godBlurPass = shaderPass(GOD_BLUR_FS, { tSrc: { value: null }, uSun: { value: new THREE.Vector2() }, uDecay: { value: 0.955 }, uDensity: { value: 0.9 }, uWeight: { value: 0.06 } });
  buildLens();
  onTargetsResized4(RT.w, RT.h);
}
function onTargetsResized4(w, h) {
  if (!godMaskPass) return;
  for (const k of ['godMask', 'godBlur']) if (POST[k]) POST[k].dispose();
  const hf = { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false };
  POST.godMask = new THREE.WebGLRenderTarget(Math.max(1, w >> 2), Math.max(1, h >> 2), hf);
  POST.godBlur = new THREE.WebGLRenderTarget(Math.max(1, w >> 2), Math.max(1, h >> 2), hf);
  resizeLens(w, h);
}
const _sv = new THREE.Vector3(), _fw = new THREE.Vector3(), _ivp = new THREE.Matrix4(), _sj = new THREE.Vector3();
// Distance the lens must focus at for a subject point, seen through the surface where the ray crosses it
// (a camera above the water focuses on the refracted image, which sits ~1/1.33 as deep)
function focusDist(p, under) {
  const d = camera.position.distanceTo(p);
  const cy = camera.position.y, crosses = !under && p.y < WATER_Y && cy > WATER_Y;
  if (!crosses) return d;
  const k = (cy - WATER_Y) / (cy - p.y);
  return d * k + d * (1 - k) / 1.33;
}
function lensSubject(under) {
  let best = -1, bestCos = Math.cos(9 * DEG);
  const consider = (p, maxD) => {
    _sv.subVectors(p, camera.position); const d = _sv.length(); if (d > maxD || d < 0.05) return;
    const c = _sv.dot(_fw) / d; if (c > bestCos) { bestCos = c; best = focusDist(p, under); }
  };
  if (P.cameraMode === 'Follow koi') { const f = KOI.fish[FOLLOW.idx % Math.max(1, Math.min(P.fishCount, KOI.fish.length))]; if (f) return focusDist(f.p, under); }
  if (P.cameraMode === 'Follow turtle' && TURTLE.root) return focusDist(_sj.copy(TURTLE.pos).setY(TURTLE.pos.y + 0.04), under);
  if (FROG.root) { FROG.root.getWorldPosition(_sj); _sj.y += 0.03; consider(_sj, 2.5); }
  if (TURTLE.root) consider(_sj.copy(TURTLE.pos).setY(TURTLE.pos.y + 0.04), 4);
  for (let i = 0; i < Math.min(P.fishCount, KOI.fish.length); i++) consider(KOI.fish[i].p, 5);
  for (const D of DRAGON.list) consider(D.p, 2);
  return best;
}
function renderUnderwaterPost(color, u) {
  const high = P.quality === 'High', under = STATE.under;
  camera.getWorldDirection(_fw);
  // --- god rays
  let godStr = 0;
  if (high && P.godRays) {
    const sd = under ? SH.uSunDirW.value : SH.uSunDir.value;
    let facing = _fw.dot(sd);
    if (under && facing < 0.15) { _sv.set(0, 1, 0); facing = 0.15; } else _sv.copy(sd);   // looking away: shafts fall from straight above
    _sv.multiplyScalar(100).add(camera.position).project(camera);
    const sx = clamp(_sv.x * 0.5 + 0.5, -2, 3), sy = clamp(_sv.y * 0.5 + 0.5, -2, 3);
    godStr = under ? 1.0 : 0.28 * smoothstep(0.1, 0.6, facing) * smoothstep(3 * DEG, 20 * DEG, sunState.elev);
    if (godStr > 0.001) {
      _ivp.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse).invert();
      const gm = godMaskPass.uniforms;
      gm.tColor.value = RT.main.texture; gm.tDepth.value = RT.main.depthTexture; gm.uInvViewProj.value.copy(_ivp); gm.uUnder.value = under ? 1 : 0;
      gm.uThresh.value = under ? 0.22 : 0.6;
      godMaskPass.render(POST.godMask);
      const gb = godBlurPass.uniforms;
      gb.tSrc.value = POST.godMask.texture; gb.uSun.value.set(sx, sy);
      gb.uDecay.value = under ? 0.962 : 0.95; gb.uDensity.value = under ? 0.95 : 0.85; gb.uWeight.value = under ? 0.022 : 0.035;
      godBlurPass.render(POST.godBlur);
    }
  }
  u.tGod.value = godStr > 0.001 ? POST.godBlur.texture : BLACK_TEX;
  u.uGodStr.value = godStr;
  // --- camera lens: autofocus on whatever sits under the AF point; known subjects there take priority
  let out = color;
  if (P.dof) {
    const now = performance.now(), dt = LENS.lastT ? Math.min(0.1, (now - LENS.lastT) / 1000) : 0.016; LENS.lastT = now;
    out = renderLens(color, dt, under, lensSubject(under));
  }
  // --- lens: underwater distortion, droplets for 0.5 s after surfacing, meniscus when the near plane straddles the surface
  u.uUnder.value = under ? 1 : 0;
  u.uWet.value = under ? 0 : 1 - smoothstep(0, 0.5, STATE.exitT);
  const halfH = Math.tan(camera.fov * DEG / 2) * camera.near, upY = camera.up.clone().applyQuaternion(camera.quaternion).y;
  const cy = camera.position.y + _fw.y * camera.near, wh = waterHeightAt(camera.position.x, camera.position.z, SH.uTime.value);
  const vstar = Math.abs(upY) > 1e-3 ? (wh - cy) / (upY * halfH) : 9;
  const inPond = sdf(camera.position.x, camera.position.z) < 0.1;
  if (inPond && Math.abs(vstar) < 1 && !under) { u.uMeniscus.value = vstar * 0.5 + 0.5; u.uMenSide.value = upY > 0 ? 1 : -1; }
  else u.uMeniscus.value = -1;
  u.uUnderTint.value.copy(SH.uInscatter.value);
  return out;
}

/* --- Ambient soundscape (WebAudio, fully generated): lapping water, trickle, drips and plops, a shishi-odoshi,
       leaves in the wind, distant birds, frog croaks, feeding splashes; room reverb; muffled low-pass under water */
const AUDIO = { ctx: null };
function noiseBuffer(ctx, sec, kind) {
  const len = Math.floor(ctx.sampleRate * sec), buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch); let b0 = 0, b1 = 0, b2 = 0, br = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (kind === 'brown') { br = (br + 0.02 * w) / 1.02; d[i] = br * 3.5; }
      else if (kind === 'pink') { b0 = 0.99765 * b0 + w * 0.099; b1 = 0.963 * b1 + w * 0.2965; b2 = 0.57 * b2 + w * 1.0527; d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.12; }
      else d[i] = w * 0.5;
    }
    // crossfade the loop seam
    const f = Math.min(2000, len >> 3); for (let i = 0; i < f; i++) { const t = i / f; d[i] = d[i] * t + d[len - f + i] * (1 - t); }
  }
  return buf;
}
function startAudio(force) {
  if (!P.audio && !force) return;
  try {
    if (AUDIO.ctx) { AUDIO.ctx.resume(); AUDIO.master.gain.setTargetAtTime(P.volume, AUDIO.ctx.currentTime, 0.4); return; }
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const now = ctx.currentTime;
    // master chain: sources -> dry + reverb -> underwater low-pass -> master
    const master = ctx.createGain(); master.gain.value = 0;
    const under = ctx.createBiquadFilter(); under.type = 'lowpass'; under.frequency.value = 18000; under.Q.value = 0.6;
    const bus = ctx.createGain(), wet = ctx.createGain(); wet.gain.value = 0.28;
    const verb = ctx.createConvolver();
    { const len = ctx.sampleRate * 2.6, ir = ctx.createBuffer(2, len, ctx.sampleRate);
      for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2) * (i < 400 ? i / 400 : 1); }
      verb.buffer = ir; }
    bus.connect(under); bus.connect(verb); verb.connect(wet); wet.connect(under);
    under.connect(master); master.connect(ctx.destination);
    const pink = noiseBuffer(ctx, 6, 'pink'), brown = noiseBuffer(ctx, 6, 'brown'), white = noiseBuffer(ctx, 3, 'white');
    const loop = (buf, rate = 1) => { const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.playbackRate.value = rate; s.start(now + Math.random()); return s; };
    const lfo = (freq, depth, target, offset = 0) => { const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = freq; g.gain.value = depth; o.connect(g).connect(target); o.start(now + offset); return o; };
    // 1) gentle lapping: low band of brown noise swelling slowly
    const lap = ctx.createBiquadFilter(); lap.type = 'bandpass'; lap.frequency.value = 420; lap.Q.value = 0.7;
    const lapG = ctx.createGain(); lapG.gain.value = 0.22; lfo(0.13, 0.1, lapG.gain); lfo(0.31, 0.05, lapG.gain, 1.3);
    loop(brown).connect(lap).connect(lapG).connect(bus);
    // 2) a small trickle (bamboo spout): narrow band, fluttering amplitude
    const tri = ctx.createBiquadFilter(); tri.type = 'bandpass'; tri.frequency.value = 2300; tri.Q.value = 2.2;
    const triG = ctx.createGain(); triG.gain.value = 0.05; lfo(5.3, 0.025, triG.gain); lfo(1.7, 0.015, triG.gain);
    const triP = ctx.createStereoPanner(); triP.pan.value = 0.55;
    loop(white, 0.9).connect(tri).connect(triG).connect(triP).connect(bus);
    // 3) leaves in the wind: pink noise, band-limited, driven by the gusts
    const leafHP = ctx.createBiquadFilter(); leafHP.type = 'highpass'; leafHP.frequency.value = 900;
    const leafLP = ctx.createBiquadFilter(); leafLP.type = 'lowpass'; leafLP.frequency.value = 5200;
    const leafG = ctx.createGain(); leafG.gain.value = 0.05;
    loop(pink, 1.1).connect(leafHP).connect(leafLP).connect(leafG).connect(bus);
    // 4) underwater rumble (only audible below the surface)
    const rum = ctx.createBiquadFilter(); rum.type = 'lowpass'; rum.frequency.value = 160;
    const rumG = ctx.createGain(); rumG.gain.value = 0;
    loop(brown, 0.6).connect(rum).connect(rumG).connect(master);
    // 5) feeding activity bed: churned water
    const churn = ctx.createBiquadFilter(); churn.type = 'bandpass'; churn.frequency.value = 900; churn.Q.value = 0.8;
    const churnG = ctx.createGain(); churnG.gain.value = 0; lfo(7.1, 0.0, churnG.gain);
    loop(white, 1.3).connect(churn).connect(churnG).connect(bus);
    // 6) the waterfall: broadband splash + low body, placed in the stereo field and attenuated by distance
    const fallHi = ctx.createBiquadFilter(); fallHi.type = 'bandpass'; fallHi.frequency.value = 1600; fallHi.Q.value = 0.45;
    const fallLo = ctx.createBiquadFilter(); fallLo.type = 'lowpass'; fallLo.frequency.value = 420;
    const fallG = ctx.createGain(); fallG.gain.value = 0; const fallP = ctx.createStereoPanner();
    const fallLoG = ctx.createGain(); fallLoG.gain.value = 0.5;
    loop(white, 1.0).connect(fallHi).connect(fallG); loop(brown, 1.2).connect(fallLo).connect(fallLoG).connect(fallG);
    fallG.connect(fallP).connect(bus);
    // 7) rain: a soft broadband hiss on leaves and water
    const rainHP = ctx.createBiquadFilter(); rainHP.type = 'highpass'; rainHP.frequency.value = 700;
    const rainLP = ctx.createBiquadFilter(); rainLP.type = 'lowpass'; rainLP.frequency.value = 9000;
    const rainG = ctx.createGain(); rainG.gain.value = 0;
    loop(pink, 1.0).connect(rainHP).connect(rainLP).connect(rainG).connect(bus);
    master.gain.setTargetAtTime(P.volume, now, 0.8);
    Object.assign(AUDIO, { ctx, master, under, bus, lapG, leafG, rumG, churnG, white, fallG, fallP, rainG, nextBird: 1.5, nextDrip: 1, nextShishi: rr(12, 30), splashT: 0 });
  } catch (e) { console.warn('audio unavailable', e); }
}
function stopAudio() { if (AUDIO.ctx) AUDIO.master.gain.setTargetAtTime(0, AUDIO.ctx.currentTime, 0.25); }
// one-shot helpers
function tone(type, f0, f1, dur, gain, pan = 0, t0 = 0, dest) {
  const ctx = AUDIO.ctx, t = ctx.currentTime + t0, o = ctx.createOscillator(), g = ctx.createGain(), p = ctx.createStereoPanner();
  o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + Math.min(0.012, dur * 0.2)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  p.pan.value = pan; o.connect(g).connect(p).connect(dest || AUDIO.bus); o.start(t); o.stop(t + dur + 0.05);
}
function burst(freq, q, dur, gain, pan = 0, t0 = 0, sweepTo) {
  const ctx = AUDIO.ctx, t = ctx.currentTime + t0, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(), p = ctx.createStereoPanner();
  s.buffer = AUDIO.white; f.type = 'bandpass'; f.frequency.setValueAtTime(freq, t); if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur); f.Q.value = q;
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  p.pan.value = pan; s.connect(f).connect(g).connect(p).connect(AUDIO.bus); s.start(t, Math.random() * 2); s.stop(t + dur + 0.05);
}
// Birds: a Japanese bush-warbler style call, soft trills and short chirps, placed far off in the stereo field
function birdCall() {
  const pan = rr(-0.85, 0.85), kind = rand();
  if (kind < 0.35) {                                   // long rising whistle, then a quick descending flourish
    tone('sine', 1400, 1750, 0.9, 0.05, pan);
    tone('sine', 2600, 2100, 0.12, 0.05, pan, 1.0); tone('sine', 2400, 1700, 0.18, 0.05, pan, 1.14); tone('sine', 2000, 1500, 0.25, 0.04, pan, 1.35);
  } else if (kind < 0.7) {                             // trill
    const f = rr(3200, 4600), n = 6 + (rand() * 8 | 0);
    for (let i = 0; i < n; i++) tone('sine', f * rr(0.97, 1.03), f * 0.8, 0.05, 0.022, pan, i * 0.07);
  } else {                                             // two or three short chirps
    const f = rr(2400, 3800), n = 2 + (rand() * 2 | 0);
    for (let i = 0; i < n; i++) tone('sine', f, f * 1.35, 0.07, 0.03, pan, i * rr(0.12, 0.2));
  }
}
function shishiOdoshi() {                              // bamboo deer-scarer: a hollow wooden knock and its echo off the garden
  const pan = 0.6;
  tone('sine', 820, 700, 0.18, 0.14, pan); tone('triangle', 330, 290, 0.25, 0.1, pan); burst(1800, 6, 0.05, 0.12, pan);
  tone('sine', 820, 700, 0.12, 0.03, pan, 0.28);
  burst(600, 1.2, 0.5, 0.05, pan, 0.02, 300);          // water pouring out of the tipped stem
}
function audioEvent(name, arg) {
  if (!AUDIO.ctx || !P.audio) return;
  const ctx = AUDIO.ctx;
  if (name === 'plip') { tone('sine', rr(1800, 2600), rr(900, 1200), 0.06, 0.03, rr(-0.3, 0.3)); }
  else if (name === 'gulp') { tone('sine', rr(380, 480), rr(140, 180), 0.12, 0.09, rr(-0.3, 0.3)); burst(rr(700, 1100), 1.5, 0.12, 0.06, rr(-0.3, 0.3)); }
  else if (name === 'splash') { if (ctx.currentTime - AUDIO.splashT < 0.05) return; AUDIO.splashT = ctx.currentTime; burst(rr(900, 1500), 0.9, rr(0.15, 0.35), 0.05 * Math.min(1.5, arg || 1), rr(-0.4, 0.4), 0, 400); }
  else if (name === 'frogLand') { tone('sine', rr(170, 210), rr(90, 110), 0.09, 0.07, -0.2); burst(rr(1400, 2000), 1.2, 0.08, 0.025, -0.2, 0, 700); }
  else if (name === 'feedStart') { burst(3000, 2, 0.4, 0.02, 0.2, 0.3, 1500); }
  else if (name === 'croak') {
    const n = arg || 2, pan = -0.35;
    for (let k = 0; k < n; k++) {
      const t = k * 0.62, o = ctx.createOscillator(), f1 = ctx.createBiquadFilter(), f2 = ctx.createBiquadFilter(), g = ctx.createGain(), p = ctx.createStereoPanner();
      o.type = 'sawtooth'; o.frequency.setValueAtTime(95, ctx.currentTime + t); o.frequency.linearRampToValueAtTime(78, ctx.currentTime + t + 0.4);
      f1.type = 'bandpass'; f1.frequency.value = 520; f1.Q.value = 3; f2.type = 'bandpass'; f2.frequency.value = 1250; f2.Q.value = 4;
      const am = ctx.createOscillator(), amg = ctx.createGain(); am.frequency.value = 26; amg.gain.value = 0.04; am.connect(amg).connect(g.gain);
      g.gain.setValueAtTime(0.0001, ctx.currentTime + t); g.gain.exponentialRampToValueAtTime(0.09, ctx.currentTime + t + 0.05); g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.45);
      o.connect(f1).connect(g); o.connect(f2).connect(g); g.connect(p).connect(AUDIO.bus); p.pan.value = pan;
      o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.5); am.start(ctx.currentTime + t); am.stop(ctx.currentTime + t + 0.5);
    }
  }
}
function updateAudio(dt) {
  if (!AUDIO.ctx || !P.audio) return;
  const ctx = AUDIO.ctx, now = ctx.currentTime, ex = typeof FEED !== 'undefined' ? FEED.excite : 0;
  AUDIO.master.gain.setTargetAtTime(P.volume, now, 0.3);
  // underwater: everything muffled, a low rumble swells in
  AUDIO.under.frequency.setTargetAtTime(STATE.under ? 420 : 18000, now, STATE.under ? 0.05 : 0.15);
  AUDIO.rumG.gain.setTargetAtTime(STATE.under ? 0.35 : 0, now, 0.2);
  AUDIO.leafG.gain.setTargetAtTime(STATE.under ? 0.005 : 0.02 + 0.12 * P.windSpeed * (0.4 + SH.uGust.value), now, 0.4);
  AUDIO.lapG.gain.setTargetAtTime(0.16 + 0.1 * P.windSpeed + 0.15 * ex, now, 0.5);
  AUDIO.churnG.gain.setTargetAtTime(0.06 * ex, now, 0.3);
  if (AUDIO.rainG) {
    AUDIO.rainG.gain.setTargetAtTime(WX.cur.rain * (STATE.under ? 0.04 : 0.28), now, 0.5);
    if (WX.cur.rain > 0.2 && rand() < dt * 9 * WX.cur.rain) splashSound(0.03, rr(-0.9, 0.9), rr(0.1, 0.3));   // individual drops plinking on the pond
  }
  if (WF.site && AUDIO.fallG) {
    const I = WF.impacts[1] ? WF.impacts[1].p : wfWorld(0, 0, 0.2), dx = I.x - camera.position.x, dz = I.z - camera.position.z, d = Math.hypot(dx, dz, I.y - camera.position.y);
    camera.getWorldDirection(_fw); const rightX = -_fw.z, rightZ = _fw.x, rl = Math.hypot(rightX, rightZ) || 1;
    AUDIO.fallG.gain.setTargetAtTime((STATE.under ? 0.15 : 0.32) / (1 + d * d * 0.09), now, 0.2);
    AUDIO.fallP.pan.setTargetAtTime(clamp((dx * rightX + dz * rightZ) / rl / Math.max(d, 0.5), -0.9, 0.9), now, 0.2);
  }
  // sporadic events
  AUDIO.nextDrip -= dt;
  if (AUDIO.nextDrip < 0) { AUDIO.nextDrip = rr(1.5, 5) / (1 + ex * 3); if (rand() < 0.6) tone('sine', rr(900, 1400), rr(350, 500), rr(0.08, 0.14), rr(0.015, 0.035), rr(-0.7, 0.7)); else burst(rr(500, 900), 2, 0.1, 0.02, rr(-0.7, 0.7)); }
  AUDIO.nextShishi -= dt;
  if (AUDIO.nextShishi < 0) { AUDIO.nextShishi = 1e9; }   // 校园版：去掉日式竹筒“鹿威し”敲击声
  AUDIO.nextBird -= dt;
  if (AUDIO.nextBird < 0) { AUDIO.nextBird = rr(3, 11); if (!STATE.under && sunState.elev > 3 * DEG && WX.cur.rain < 0.3 && WX.cur.snow < 0.3) birdCall(); }
}

/* ------------------------------------------------------------------ 13c. FEEDING THE KOI */
// A hand reaches out over the water and sprinkles floating pellets; koi sense it (distance-delayed), rush in,
// crowd and gulp at the surface with splashes; excitement decays naturally once the food is gone.
const FEED = { active: false, t: 0, point: new THREE.Vector3(), toward: new THREE.Vector3(), side: new THREE.Vector3(),
  pellets: [], excite: 0, linger: 0, hand: null, shot: null, emitted: 0 };
const SKIN_SSS = /* glsl */`
{
  // skin: wrapped diffuse with a reddish scattering tint, strongest where light grazes or shines through fingers
  vec3 Lv = normalize((viewMatrix * vec4(uSunDir, 0.0)).xyz);
  float nl = dot(geometryNormal, Lv);
  float wrapL = max(0.0, (nl + 0.5) / 1.5) - max(0.0, nl);
  float thru = pow(max(dot(-geometryViewDir, Lv), 0.0), 6.0) * 0.6;
  reflectedLight.directDiffuse += diffuseColor.rgb * directLight.color * (wrapL * 0.55 + thru) * vec3(1.0, 0.45, 0.32);
}
`;
const SKIN_FS_PARS = /* glsl */`
varying vec3 vBind;
uniform vec3 uJoints[15];
float sk3(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float sknoise(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(sk3(i), sk3(i + vec3(1,0,0)), f.x), mix(sk3(i + vec3(0,1,0)), sk3(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(sk3(i + vec3(0,0,1)), sk3(i + vec3(1,0,1)), f.x), mix(sk3(i + vec3(0,1,1)), sk3(i + vec3(1,1,1)), f.x), f.y), f.z); }
// knuckle creases (bands across the finger, on the back of each joint) + faint dorsal veins + pores
float skinHeight(vec3 p){
  float h = 0.0;
  for (int i = 0; i < 15; i++) {
    vec3 d = p - uJoints[i];
    float near = (1.0 - smoothstep(0.003, 0.0085, length(d))) * smoothstep(-0.002, 0.004, d.y);
    h += near * (0.5 + 0.5 * sin(d.x * 2600.0 + sin(d.z * 900.0) * 1.5)) * 0.7;
    // flexion crease across the palm side of each joint
    float fold = (1.0 - smoothstep(0.0006, 0.0016, abs(d.x))) * (1.0 - smoothstep(0.006, 0.011, length(d.yz))) * smoothstep(0.001, -0.003, d.y);
    h -= fold * 2.2;
  }
  // the three main palm creases
  float palmS = smoothstep(-0.004, -0.011, p.y) * step(0.0, p.x) * step(p.x, 0.08);
  float cr = min(min(abs(p.z - 0.018 + p.x * 0.35), abs(p.z + 0.004 - p.x * 0.2)), abs(p.x - 0.05 + p.z * 0.5));
  h -= palmS * (1.0 - smoothstep(0.0005, 0.0015, cr)) * 1.6;
  float dorsal = smoothstep(0.004, 0.012, p.y) * smoothstep(0.075, 0.02, p.x) * smoothstep(-0.09, -0.02, p.x);
  float vein = smoothstep(0.9, 0.99, 1.0 - abs(sknoise(vec3(p.x * 60.0, 0.0, p.z * 140.0)) * 2.0 - 1.0)) * dorsal;
  float pores = sknoise(p * 2500.0) * 0.25 + smoothstep(0.7, 0.9, sknoise(p * 5200.0)) * 0.3;
  // fine skin relief: two crossing sets of shallow furrows (the diamond texture on the back of a hand)
  float n = sknoise(p * 300.0);
  float lines = pow(abs(sin((p.x * 0.7 + p.z) * 7000.0 + n * 3.0)), 8.0) + pow(abs(sin((p.x * 0.7 - p.z) * 6200.0 + n * 2.0)), 8.0);
  return (h * 0.35 - vein * 0.8 + pores - lines * 0.35) * 0.00012 + vein * 0.00018;
}
`;
const SKIN_MAP = /* glsl */`
{
  float dorsal = smoothstep(0.004, 0.012, vBind.y) * smoothstep(0.075, 0.02, vBind.x) * smoothstep(-0.09, -0.02, vBind.x);
  float vein = smoothstep(0.9, 0.99, 1.0 - abs(sknoise(vec3(vBind.x * 60.0, 0.0, vBind.z * 140.0)) * 2.0 - 1.0)) * dorsal;
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.82, 0.84, 0.98), vein * 0.5);          // faint bluish veins
  diffuseColor.rgb *= 0.96 + 0.08 * sknoise(vBind * 400.0);                                                  // blotchy skin tone
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.06, 0.9, 0.88), smoothstep(0.55, 0.8, sknoise(vBind * 140.0)) * 0.35);   // capillary flush
  // sun-tanned back of the forearm, paler inner side; redder knuckle skin; faint freckles
  float fore = smoothstep(-0.03, -0.2, vBind.x);
  diffuseColor.rgb *= mix(vec3(1.0), mix(vec3(0.9, 0.84, 0.8), vec3(1.03, 1.0, 0.98), smoothstep(0.0, -0.02, vBind.y)), fore);
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.8, 0.62, 0.56), smoothstep(0.82, 0.9, sknoise(vBind * 900.0)) * 0.25 * smoothstep(0.0, 0.01, vBind.y));
}
`;
const SKIN_NORMAL = /* glsl */`
{
  float hgt = skinHeight(vBind);
  vec3 dpx = dFdx(-vViewPosition), dpy = dFdy(-vViewPosition);
  float dhx = dFdx(hgt), dhy = dFdy(hgt);
  vec3 r1 = cross(dpy, normal), r2 = cross(normal, dpx);
  float det = dot(dpx, r1);
  normal = normalize(abs(det) * normal - sign(det) * (dhx * r1 + dhy * r2));
}
`;
function buildSkinTextures() {
  TEX.skin = genSurface(256, (u, v) => {
    const pores = hash3i(u * 256 | 0, v * 256 | 0, 2, 5) > 0.93 ? 0 : 1;
    const f = fbm2P(u * 24, v * 24, 24, 3, 12) * 0.5 + 0.5, lines = Math.abs(Math.sin((u * 30 + fbm2P(u * 4, v * 4, 4, 2, 3) * 2) * Math.PI));
    const h = f * 0.5 + pores * 0.3 + lines * 0.2;
    return [200, 150, 130, h, 0.5];
  }, 2.5);
  TEX.linen = genSurface(256, (u, v, x, y) => {
    const wx = Math.sin(x * Math.PI / 2) * 0.5 + 0.5, wy = Math.sin(y * Math.PI / 2) * 0.5 + 0.5, over = ((x >> 1) + (y >> 1)) % 2;
    const slub = fbm2P(u * 8, v * 64, 8, 2, 4) * 0.5 + 0.5;
    const h = over ? wx : wy, c = mix3(srgbHex(0x2c3c59), srgbHex(0x3a4e70), h * 0.18 + slub * 0.6 + fbm2P(u * 3, v * 3, 3, 2, 8) * 0.2);
    return [c[0], c[1], c[2], h * 0.5 + slub * 0.5, 0.9];
  }, 1.6);
}
// Procedural hand: one continuous SDF surface (palm, thenar/hypothenar pads, knuckles, tapered fingers and thumb,
// forearm) extracted with surface nets and skinned to a 16-bone rig; nails ride on the distal bones; linen sleeve.
function buildHand() {
  buildSkinTextures();
  TEX.skin.normalMap.repeat.set(3, 3);
  const joints = [];
  const skin = physical({ color: 0xffffff, vertexColors: true, roughness: 0.5, sheen: 0.22, sheenRoughness: 0.5,
    sheenColor: new THREE.Color(0xffc7ae), clearcoat: 0.05, clearcoatRoughness: 0.5, envMapIntensity: 0.8 }, { key: 'skin2', fsPostLights: SKIN_SSS,
    uniforms: { uJoints: { value: joints } }, vsPars: 'varying vec3 vBind;\n', vsBegin: 'vBind = position;',
    fsRough: 'roughnessFactor = clamp(0.44 + 0.16 * sknoise(vBind * 180.0) - 0.08 * smoothstep(0.004, 0.012, vBind.y), 0.3, 0.7);',
    fsPars: SKIN_FS_PARS, fsMap: SKIN_MAP, fsNormal: SKIN_NORMAL });
  const nailMat = physical({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.25, clearcoat: 0.85, clearcoatRoughness: 0.15, sheen: 0.3, sheenColor: new THREE.Color(0xffe0d8) }, { key: 'skinnail' });
  const sleeveMat = physical({ map: TEX.linen.map, normalMap: TEX.linen.normalMap, roughness: 0.88, sheen: 0.7, sheenRoughness: 0.6, sheenColor: new THREE.Color(0x8aa0c8), side: THREE.DoubleSide }, { key: 'sleeve' });
  TEX.linen.map.repeat.set(5, 2); TEX.linen.normalMap.repeat.set(5, 2);
  // ---- rig (rest pose)
  const X = new THREE.Vector3(1, 0, 0), rootBone = new THREE.Bone(), palmBone = new THREE.Bone(), bones = [rootBone, palmBone], segs = [];
  rootBone.add(palmBone);                        // wrist: the palm flexes on the forearm
  const FING = [['index', [0.081, 0.004, 0.03], 0.07, [0.043, 0.026, 0.021], [0.0088, 0.0081, 0.0074, 0.0066]],
    ['middle', [0.085, 0.004, 0.009], 0.0, [0.047, 0.029, 0.022], [0.0092, 0.0085, 0.0077, 0.0068]],
    ['ring', [0.081, 0.003, -0.012], -0.06, [0.044, 0.027, 0.021], [0.0085, 0.0079, 0.0072, 0.0064]],
    ['pinky', [0.073, 0.001, -0.031], -0.14, [0.034, 0.021, 0.018], [0.0074, 0.0068, 0.0062, 0.0056]]];
  const REST = [0.12, 0.16, 0.1];
  const J = {}, tips = {};
  const chain = (name, base, restQ, L, R) => {
    const b0 = new THREE.Bone(); b0.position.fromArray(base); b0.quaternion.copy(restQ); palmBone.add(b0);
    const b1 = new THREE.Bone(); b1.position.set(L[0], 0, 0); b0.add(b1);
    const b2 = new THREE.Bone(); b2.position.set(L[1], 0, 0); b1.add(b2);
    const tip = new THREE.Object3D(); tip.position.set(L[2], 0, 0); b2.add(tip);
    bones.push(b0, b1, b2); J[name] = [b0, b1, b2]; tips[name] = tip;
    return [b0, b1, b2];
  };
  for (const [name, base, splay, L, R] of FING) {
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, splay, -REST[0], 'YZX'));
    const [b0, b1, b2] = chain(name, base, q, L, R);
    b1.rotation.z = -REST[1]; b2.rotation.z = -REST[2];
    b0.userData = { restQ: q.clone(), L, R }; b1.userData = { L, R }; b2.userData = { L, R };
  }
  const tq = new THREE.Quaternion().setFromUnitVectors(X, new THREE.Vector3(0.62, -0.32, 0.72).normalize());
  const thumb = chain('thumb', [0.006, -0.009, 0.027], tq, [0.042, 0.032, 0.027], [0.0128, 0.011, 0.0098, 0.0088]);
  thumb[0].userData = { restQ: tq.clone() }; thumb[1].rotation.z = -0.15; thumb[2].rotation.z = -0.12;
  rootBone.updateMatrixWorld(true);
  for (const name of ['index', 'middle', 'ring', 'pinky', 'thumb']) for (let k = 0; k < 3; k++) joints.push(new THREE.Vector3().setFromMatrixPosition(J[name][k].matrixWorld));
  const wp = (o, x = 0) => new THREE.Vector3(x, 0, 0).applyMatrix4(o.matrixWorld).toArray();
  for (const [name, , , L, R] of FING) { const c = J[name]; for (let k = 0; k < 3; k++) segs.push({ bone: c[k], a: wp(c[k]), b: wp(c[k], L[k]), ra: R[k], rb: R[k + 1], finger: true }); }
  { const L = [0.042, 0.032, 0.027], R = [0.0128, 0.011, 0.0098, 0.0088]; for (let k = 0; k < 3; k++) segs.push({ bone: thumb[k], a: wp(thumb[k]), b: wp(thumb[k], L[k]), ra: R[k], rb: R[k + 1], finger: true }); }
  const armA = [-0.004, 0.002, 0], armB = [-0.62, 0.02, 0];
  // ---- field
  const f = (p) => {
    let d = SDFK.roundBox(p, [0.037, 0.0, 0.0], [0.046, 0.0125, 0.043], 0.011);
    d = SDFK.smin(d, SDFK.cone([p[0], p[1], p[2] * 0.8], armA, armB, 0.027, 0.037), 0.016);
    d = SDFK.smin(d, SDFK.ellipsoid(p, [0.014, -0.009, 0.029], [0.036, 0.016, 0.02]), 0.01);
    d = SDFK.smin(d, SDFK.ellipsoid(p, [0.022, -0.007, -0.031], [0.036, 0.013, 0.014]), 0.01);
    let fd = 1e9;
    for (const s of segs) {
      let sd = SDFK.cone(p, s.a, s.b, s.ra, s.rb);
      fd = SDFK.smin(fd, sd, 0.0035);
    }
    d = SDFK.smin(d, fd, 0.008);
    for (const [, base] of FING) d = SDFK.smin(d, SDFK.sphere(p, [base[0] - 0.002, base[1] + 0.006, base[2]], 0.0082), 0.005);   // knuckles
    // extensor tendons fanning from the wrist to each knuckle, standing just proud of the back of the hand
    for (const [, base] of FING) d = SDFK.smin(d, SDFK.cone(p, [-0.006, 0.0112, base[2] * 0.45], [base[0] - 0.012, base[1] + 0.0112, base[2]], 0.0024, 0.0021), 0.0035);
    d = SDFK.smin(d, SDFK.sphere(p, [-0.03, 0.004, -0.03], 0.0068), 0.006);                     // ulnar styloid at the wrist
    return d;
  };
  const geo = surfaceNets(f, [-0.64, -0.058, -0.068], [0.21, 0.056, 0.1], 0.0015);
  // ---- skin weights (inverse distance to each bone's segment, top four) and vertex tint
  const pa = geo.attributes.position, nV = pa.count, si = new Uint16Array(nV * 4), sw = new Float32Array(nV * 4), col = new Float32Array(nV * 3);
  const segD = (p, a, b) => { const bx = b[0] - a[0], by = b[1] - a[1], bz = b[2] - a[2]; const h = clamp(((p[0] - a[0]) * bx + (p[1] - a[1]) * by + (p[2] - a[2]) * bz) / (bx * bx + by * by + bz * bz), 0, 1); return [SDFK.len(p[0] - a[0] - bx * h, p[1] - a[1] - by * h, p[2] - a[2] - bz * h), h]; };
  const P = [0, 0, 0];
  for (let v = 0; v < nV; v++) {
    P[0] = pa.getX(v); P[1] = pa.getY(v); P[2] = pa.getZ(v);
    const cand = [];
    const [dr] = segD(P, [-0.4, 0, 0], [-0.012, 0, 0]), [dp] = segD(P, [-0.012, 0, 0], [0.07, 0, 0]);
    cand.push([0, Math.max(dr - 0.03, 0.0008)]); cand.push([1, Math.max(dp - 0.03, 0.0008)]);
    let tipK = 0;
    segs.forEach((s) => { const [d, h] = segD(P, s.a, s.b); cand.push([bones.indexOf(s.bone), Math.max(d - lerp(s.ra, s.rb, h), 0.0008)]); if (s.bone.children.some((c) => !c.isBone) && d < 0.013) tipK = Math.max(tipK, smoothstep(0.5, 1.0, h)); });
    cand.sort((a, b) => a[1] - b[1]);
    let sum = 0; const top = cand.slice(0, 4).map(([b, d]) => { const w = 1 / Math.pow(d, 3); sum += w; return [b, w]; });
    top.forEach(([b, w], k) => { si[v * 4 + k] = b; sw[v * 4 + k] = w / sum; });
    // colour: fingertips and knuckles flush pinker, palm side paler
    const palmSide = smoothstep(0.0, -0.012, P[1]) * smoothstep(-0.05, 0.02, P[0]);
    const knuck = FING.reduce((m, [, b]) => Math.max(m, 1 - smoothstep(0.004, 0.014, SDFK.len(P[0] - b[0], P[1] - b[1] - 0.008, P[2] - b[2]))), 0);
    const base = [0.88, 0.62, 0.5];
    col[v * 3] = base[0] * (1 + 0.06 * palmSide) * (1 + 0.04 * tipK + 0.03 * knuck);
    col[v * 3 + 1] = base[1] * (1 + 0.1 * palmSide) * (1 - 0.1 * tipK - 0.08 * knuck);
    col[v * 3 + 2] = base[2] * (1 + 0.12 * palmSide) * (1 - 0.08 * tipK - 0.08 * knuck);
  }
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col.map((c) => Math.pow(c, 2.2)), 3));
  // planar-ish UVs for the pore normal map
  const uvs = new Float32Array(nV * 2); for (let v = 0; v < nV; v++) { uvs[v * 2] = pa.getX(v) * 18; uvs[v * 2 + 1] = (pa.getZ(v) + pa.getY(v)) * 18; }
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  const hand = new THREE.SkinnedMesh(geo, skin);
  hand.add(rootBone);
  hand.bind(new THREE.Skeleton(bones));
  hand.castShadow = hand.receiveShadow = true; hand.frustumCulled = false;
  const root = new THREE.Group();
  root.add(hand);
  // nails on the distal bones
  for (const name of ['index', 'middle', 'ring', 'pinky', 'thumb']) {
    const b = J[name][2], L = name === 'thumb' ? 0.027 : FING.find((x) => x[0] === name)[3][2], R = name === 'thumb' ? 0.0098 : FING.find((x) => x[0] === name)[4][2];
    // nail plate: a thin curved shell set into the fingertip; lunula, pink nail bed, whiter free edge (vertex colours)
    const nu = 10, nw = 8, npos = [], ncol = [], nidx = [], Ln = L * 0.62, Wn = R * 0.78;
    for (let i = 0; i <= nu; i++) for (let j = 0; j <= nw; j++) {
      const u = i / nu, v = j / nw * 2 - 1, w = Wn * (u < 0.15 ? 0.82 + u * 1.2 : 1) * (u > 0.9 ? Math.sqrt(1 - ((u - 0.9) / 0.1) ** 2) * 0.3 + 0.7 : 1);
      const x = L * 0.4 + u * Ln, z = v * w, y = R * 0.9 - (z * z) / (R * 2.4) - (u - 0.5) ** 2 * R * 0.12 + (u > 0.88 ? (u - 0.88) * R * 0.25 : 0);
      npos.push(x, y, z);
      const lun = (1 - smoothstep(0.1, 0.22, Math.hypot(u, v * 0.35))), free = smoothstep(0.84, 0.92, u);
      const c = [lerp(lerp(0.86, 0.95, lun), 0.97, free), lerp(lerp(0.62, 0.86, lun), 0.95, free), lerp(lerp(0.6, 0.84, lun), 0.9, free)];
      ncol.push(Math.pow(c[0], 2.2), Math.pow(c[1], 2.2), Math.pow(c[2], 2.2));
    }
    for (let i = 0; i < nu; i++) for (let j = 0; j < nw; j++) { const a = i * (nw + 1) + j, c2 = a + nw + 1; nidx.push(a, a + 1, c2, a + 1, c2 + 1, c2); }
    const ng = new THREE.BufferGeometry(); ng.setAttribute('position', new THREE.Float32BufferAttribute(npos, 3)); ng.setAttribute('color', new THREE.Float32BufferAttribute(ncol, 3)); ng.setIndex(nidx); ng.computeVertexNormals();
    const nm = new THREE.Mesh(ng, nailMat); nm.castShadow = true; b.add(nm);
  }
  // sleeve with a rolled cuff and a closed far end
  const sl = new THREE.CylinderGeometry(0.052, 0.064, 0.7, 32, 10, true); sl.rotateZ(Math.PI / 2); sl.translate(-0.66, 0.016, 0);
  const sp = sl.attributes.position;
  for (let i = 0; i < sp.count; i++) { const a = Math.atan2(sp.getZ(i), sp.getY(i) - 0.016); sp.setY(i, sp.getY(i) + 0.004 * Math.sin(a * 5 + sp.getX(i) * 30)); sp.setZ(i, sp.getZ(i) * 1.12); }
  sl.computeVertexNormals();
  const cuff = new THREE.TorusGeometry(0.056, 0.012, 12, 40); cuff.rotateY(Math.PI / 2); cuff.scale(1, 1, 1.12); { const cp = cuff.attributes.position; for (let i = 0; i < cp.count; i++) { const a = Math.atan2(cp.getZ(i), cp.getY(i)); cp.setX(i, cp.getX(i) + 0.003 * Math.sin(a * 7)); } cuff.computeVertexNormals(); } cuff.translate(-0.31, 0.016, 0);   // rolled-up cuff
  const cap = new THREE.CircleGeometry(0.066, 24); cap.rotateY(-Math.PI / 2); cap.scale(1, 1, 1.12); cap.translate(-1.01, 0.016, 0);
  for (const g of [sl, cuff, cap]) { const m = new THREE.Mesh(g, sleeveMat); m.castShadow = m.receiveShadow = true; root.add(m); }
  root.visible = false;
  root.traverse((o) => o.layers.set(LAYER.BOTH));                   // fingers dipped in the water stay visible through it
  scene.add(root);
  FEED.hand = { root, J, tips, mesh: hand, palm: palmBone };
  // floating pellets
  const pg = new THREE.IcosahedronGeometry(0.0058, 2);
  const ppos = pg.attributes.position;
  for (let i = 0; i < ppos.count; i++) { const k = 1 + 0.12 * vnoise3(ppos.getX(i) * 900, ppos.getY(i) * 900, ppos.getZ(i) * 900, 4); ppos.setXYZ(i, ppos.getX(i) * k, ppos.getY(i) * k * 0.85, ppos.getZ(i) * k); }
  pg.computeVertexNormals();
  const pm = physical({ color: 0xc08a4e, map: TEX.boulder.map, roughness: 0.62, clearcoat: 0.35 }, { key: 'pellet' });
  FEED.pelletMesh = new THREE.InstancedMesh(pg, pm, 80); FEED.pelletMesh.count = 0; FEED.pelletMesh.castShadow = true; FEED.pelletMesh.frustumCulled = false;
  setLayer(FEED.pelletMesh, LAYER.SURFACE); scene.add(FEED.pelletMesh);
  buildSplashes();
}
// Poses (absolute flexion per joint): pinch holding food, rubbing thumb against fingers, relaxed/open
const _tq = new THREE.Quaternion(), _tq2 = new THREE.Quaternion(), _ty = new THREE.Vector3(0, 1, 0), _tz = new THREE.Vector3(0, 0, 1);
function poseHand(pinch, rub, t) {
  const J = FEED.hand.J, o = Math.sin(t * 18) * rub;
  const curl = (name, a, b, c) => {
    const j = J[name];
    _tq.setFromAxisAngle(_tz, -a + 0.12); j[0].quaternion.copy(j[0].userData.restQ).multiply(_tq);
    j[1].rotation.z = -b; j[2].rotation.z = -c;
  };
  curl('index', lerp(0.2, 0.72, pinch) + o * 0.1, lerp(0.2, 0.8, pinch) + o * 0.14, lerp(0.12, 0.45, pinch));
  curl('middle', lerp(0.22, 0.78, pinch) - o * 0.08, lerp(0.22, 0.82, pinch), lerp(0.12, 0.45, pinch));
  curl('ring', lerp(0.3, 1.0, pinch), lerp(0.3, 1.05, pinch), lerp(0.15, 0.65, pinch));
  curl('pinky', lerp(0.38, 1.1, pinch), lerp(0.35, 1.1, pinch), lerp(0.2, 0.7, pinch));
  const th = J.thumb;
  _tq.setFromAxisAngle(_ty, -0.55 * pinch + o * 0.18); _tq2.setFromAxisAngle(_tz, -0.25 * pinch);
  th[0].quaternion.copy(th[0].userData.restQ).multiply(_tq).multiply(_tq2);
  th[1].rotation.z = -(0.15 + pinch * 0.3); th[2].rotation.z = -(0.12 + pinch * 0.3 + o * 0.15);
}
// Relaxed open hand for stroking: fingers long and nearly straight, a little apart, softly following the curve below
function poseHandFlat(k, t) {
  const J = FEED.hand.J, br = Math.sin(t * 1.3) * 0.02;
  const set = (name, a, b, c, sp) => {
    const j = J[name];
    _tq.setFromAxisAngle(_tz, -a); _tq2.setFromAxisAngle(_ty, sp); j[0].quaternion.copy(j[0].userData.restQ).multiply(_tq2).multiply(_tq);
    j[1].rotation.z = -b; j[2].rotation.z = -c;
  };
  set('index', 0.02 + br, lerp(0.14, 0.06, k), lerp(0.1, 0.05, k), 0.06);
  set('middle', 0.03, lerp(0.16, 0.07, k), lerp(0.11, 0.05, k), 0.0);
  set('ring', 0.05 - br, lerp(0.2, 0.1, k), lerp(0.13, 0.07, k), -0.05);
  set('pinky', 0.08, lerp(0.26, 0.14, k), lerp(0.16, 0.09, k), -0.12);
  const th = J.thumb;
  _tq.setFromAxisAngle(_ty, 0.1); _tq2.setFromAxisAngle(_tz, 0.05);
  th[0].quaternion.copy(th[0].userData.restQ).multiply(_tq).multiply(_tq2);
  th[1].rotation.z = -0.08; th[2].rotation.z = -0.06;
}
const _hp = new THREE.Vector3(), _hq = new THREE.Quaternion(), _hm = new THREE.Matrix4(), _tip = new THREE.Vector3(), _tip2 = new THREE.Vector3();
const _hf = new THREE.Vector3(), _hr = new THREE.Vector3(), _hu = new THREE.Vector3(), _hh = new THREE.Vector3(), _ha = new THREE.Vector3(), _hs = new THREE.Vector3(), _hx = new THREE.Vector3(), _hy = new THREE.Vector3(), _hz = new THREE.Vector3();
// Feeding shot: crouched at the shore nearest to where you are, looking down at the water. The hand is first-person:
// it reaches in from the lower-right edge of the frame and the sleeve runs out of view past the camera.
function feedingShot(nx, nz) {
  let best = null, bd = 1e9;
  for (let s = 0; s < POLY_LEN; s += 0.05) {
    const sh = shoreAt(s); if (nearWaterfall(sh.x, sh.z, 1.5)) continue;
    if ((WORLD.irisClumps || []).some((c) => Math.hypot(c.x - sh.x, c.z - sh.z) < 1.1) || Math.hypot(sh.x + 2.6, sh.z + 0.1) < 1.4) continue;   // clear of iris and lotus
    if (Math.abs(sh.z - BRIDGE.z) < 1.0 && Math.abs(Math.abs(sh.x) - 1.8) < 0.9) continue;
    const d = Math.hypot(sh.x - nx, sh.z - nz); if (d < bd) { bd = d; best = sh; }
  }
  const sh = best, pos = new THREE.Vector3(sh.x + sh.nx * 0.12, 0, sh.z + sh.nz * 0.12);
  pos.y = Math.max(ground(pos.x, pos.z), 0.15) + 0.82;
  return { pos, look: new THREE.Vector3(sh.x - sh.nx * 1.15, WATER_Y - 0.1, sh.z - sh.nz * 1.15), drop: new THREE.Vector3(sh.x - sh.nx * 0.6, WATER_Y, sh.z - sh.nz * 0.6) };
}
function startFeeding() {
  if (!FEED.hand || FEED.active && FEED.t < 4.5 || STROKE.active) return;
  FEED.col = { lift: 0 }; FEED.hpInit = false;
  const shot = P.cameraMode === 'Cinematic' ? feedingShot(0.9, 5.8) : feedingShot(camera.position.x, camera.position.z);
  FEED.shot = shot; FEED.point.copy(shot.drop);
  FEED.toward.set(shot.pos.x - shot.drop.x, 0, shot.pos.z - shot.drop.z).normalize();
  FEED.side.set(-FEED.toward.z, 0, FEED.toward.x);
  FEED.active = true; FEED.t = 0; FEED.emitted = 0; FEED.linger = 0;
  if (P.holdCamera) setHold(false);
  for (let i = 0; i < KOI.fish.length; i++) { const f = KOI.fish[i]; f.react = Math.hypot(f.p.x - FEED.point.x, f.p.z - FEED.point.z) * 0.22 + rr(0.6, 1.4); }
  $('feedbtn').disabled = true;
  toast('正在喂锦鲤');
  if (typeof audioEvent === 'function') audioEvent('feedStart');
}
function nearestFood(pos) {
  let best = null, bd = 1e9;
  for (const q of FEED.pellets) {
    if (q.eaten || q.y > WATER_Y + 0.05) continue;
    const d = (q.x - pos.x) ** 2 + (q.z - pos.z) ** 2;
    if (d < bd) { bd = d; best = q; }
  }
  if (best) return best;
  return FEED.active ? FEED.point : null;
}
function updateFeeding(dt, t) {
  if (!FEED.hand) return;
  const H = FEED.hand;
  FEED.excite = lerp(FEED.excite, FEED.active ? 1 : 0, 1 - Math.exp(-dt * (FEED.active ? 2 : 0.35)));
  if (FEED.active) {
    FEED.t += dt;
    const T = FEED.t;
    // first-person hand: reaches in from the lower-right edge once the camera has settled, sprinkles, withdraws
    const Th = T - 1.0;
    camera.getWorldDirection(_hf); _hr.crossVectors(_hf, _up).normalize(); _hu.crossVectors(_hr, _hf);
    const hold = _hh.copy(camera.position).addScaledVector(_hf, 0.5).addScaledVector(_hr, 0.05).addScaledVector(_hu, -0.06);
    // retracted near the (off-screen) shoulder: never parked inside the bank
    const shoulderF = _hs.copy(camera.position).addScaledVector(_hr, 0.3).addScaledVector(_hu, -0.6).addScaledVector(_hf, -0.05);
    const away = _ha.copy(shoulderF).lerp(hold, 0.25);
    let k, pinch = 1, rub = 0;
    const sm = (x) => { x = clamp(x, 0, 1); return x * x * x * (x * (x * 6 - 15) + 10); };   // zero speed at both ends
    if (Th < 0) _hp.copy(away);
    else if (Th < 1.0) { k = sm(Th); _hp.lerpVectors(away, hold, k); }
    else if (Th < 3.0) { _hp.copy(hold); _hp.addScaledVector(_hu, Math.sin((Th - 1.0) * 5) * 0.004 * smoothstep(1.0, 1.4, Th)); rub = smoothstep(1.0, 1.35, Th) * (1 - smoothstep(2.7, 3.0, Th)); pinch = lerp(1, 0.55, smoothstep(1.2, 3.0, Th)); }
    else if (Th < 4.1) { k = sm((Th - 3.0) / 1.1); _hp.lerpVectors(hold, away, k); pinch = lerp(0.55, 0.2, k); }
    else _hp.copy(away);
    // follow-spring: the hand glides even while the camera is still settling into the shot
    // spring runs in camera space, so the first-person hand stays glued to the view while the camera is still gliding in
    _hp.sub(camera.position); const lx = _hp.dot(_hr), ly = _hp.dot(_hu), lz = _hp.dot(_hf);
    if (!FEED.hpInit || !H.root.visible) { FEED.hp = new THREE.Vector3(lx, ly, lz); FEED.hpInit = true; }
    else FEED.hp.lerp(_tip.set(lx, ly, lz), 1 - Math.exp(-dt * 14));
    _hp.copy(camera.position).addScaledVector(_hr, FEED.hp.x).addScaledVector(_hu, FEED.hp.y).addScaledVector(_hf, FEED.hp.z);
    H.root.visible = Th > -0.05 && Th < 4.1;
    if (H.root.visible) {
      H.root.position.copy(_hp);
      // forearm points from an off-screen shoulder (lower right, level with the camera) to the wrist; palm down
      const shoulder = _hs.copy(camera.position).addScaledVector(_hr, 0.3).addScaledVector(_hu, -0.6).addScaledVector(_hf, -0.05);
      const X = _hx.subVectors(_hp, shoulder).normalize(), Y = _hy.set(0, 1, 0).addScaledVector(X, -X.y).normalize(), Z = _hz.crossVectors(X, Y);
      H.root.quaternion.setFromRotationMatrix(_hm.makeBasis(X, Y, Z));
      H.root.rotateX(0.42 + 0.05 * Math.sin(T * 2.1));                                   // rolled thumb-side up: a natural three-quarter view
      H.palm.rotation.set(0, -0.1, -0.3 + 0.05 * Math.sin(T * 1.7));                      // wrist only gently flexed toward the water
      poseHand(pinch, rub, T);
      resolveHandCollisions(H, false, FEED.col || (FEED.col = { lift: 0 }), dt);   // never through koi, rocks or the bank
      // release pellets from between thumb and fingertips while rubbing
      if (rub > 0 && FEED.pellets.length < 70) {
        const want = Math.floor((Th - 1.0) * 24);
        while (FEED.emitted < want) {
          FEED.emitted++;
          H.J.index[2].children[0].getWorldPosition(_tip); H.J.thumb[2].children[0].getWorldPosition(_tip2);
          _tip.lerp(_tip2, 0.5);
          FEED.pellets.push({ x: _tip.x, y: _tip.y - 0.01, z: _tip.z, vx: rr(-0.25, 0.25) - FEED.toward.x * 0.15, vy: rr(-0.1, 0.1), vz: rr(-0.25, 0.25) - FEED.toward.z * 0.15, fl: false, eaten: false, rot: rand() * 6, ph: rand() * 6 });
        }
      }
    }
    const left = FEED.pellets.filter((q) => !q.eaten).length;
    if (T > 5.2 && left === 0) { FEED.linger += dt; if (FEED.linger > 2.5) endFeeding(); }
    if (T > 45) endFeeding();
  }
  // pellets: fall, splash, float and drift; nudged by fish; eaten when a mouth reaches them
  const F = KOI.fish, n = Math.min(P.fishCount | 0, F.length);
  let c = 0;
  for (const q of FEED.pellets) {
    if (q.eaten) continue;
    if (!q.fl) {
      q.vy -= 9.81 * dt; q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
      const wh = waterHeightAt(q.x, q.z, t);
      if (q.y <= wh) { q.fl = true; q.y = wh; q.vx *= 0.15; q.vz *= 0.15; addDrop(q.x, q.z, 0.035, -0.0018); if (typeof audioEvent === 'function' && rand() < 0.4) audioEvent('plip'); }
    } else {
      q.x += q.vx * dt; q.z += q.vz * dt; q.vx *= 0.99; q.vz *= 0.99;
      q.y = waterHeightAt(q.x, q.z, t) + 0.0015;
      if (sdf(q.x, q.z) > -0.08) { q.vx *= -0.5; q.vz *= -0.5; }
      for (let i = 0; i < n; i++) {
        const f = F[i], mx = f.p.x + Math.cos(f.heading) * f.size * 0.5, mz = f.p.z - Math.sin(f.heading) * f.size * 0.5;
        const d = Math.hypot(q.x - mx, q.z - mz), depth = WATER_Y - f.p.y;
        if (d < 0.05 + f.size * 0.05 && depth < 0.12 && f.feed > 0.3) {
          q.eaten = true; f.mouth = 1; f.mouthT = 0.4;
          addDrop(mx, mz, 0.08, -0.006); spawnSplash(mx, mz, 0.7);
          if (typeof audioEvent === 'function') audioEvent('gulp');
          break;
        }
        if (d < 0.25) { q.vx += (q.x - mx) / (d + 0.01) * 0.02 * dt * 60 * 0.03; q.vz += (q.z - mz) / (d + 0.01) * 0.02 * dt * 60 * 0.03; }
      }
    }
    if (q.eaten) continue;
    _hp.set(q.x, q.y, q.z); _hq.setFromEuler(new THREE.Euler(q.rot, q.rot * 1.3, 0)); _hm.compose(_hp, _hq, _sk.set(1, 1, 1));
    FEED.pelletMesh.setMatrixAt(c++, _hm);
  }
  FEED.pelletMesh.count = c; FEED.pelletMesh.instanceMatrix.needsUpdate = true;
  if (!FEED.active && FEED.pellets.length && FEED.pellets.every((q) => q.eaten)) FEED.pellets.length = 0;
  updateSplashes(dt);
}
/* ------------------------------------------------------------------ 13f. STROKE A KOI */
// Crouch at the bank, call the nearest koi and gently stroke its back. Tame koi really do this: the fish glides in,
// lies alongside the bank just under the surface, leans into the hand, fans its pectorals and mouths softly. The hand
// makes three slow strokes head-to-tail (or follows your drag across the fish), dimpling the surface where it touches.
const STROKE = { active: false, t: 0, fish: null, shot: null, spot: new THREE.Vector3(), along: new THREE.Vector3(), touch: 0, side: 1, user: -1, lastDrop: 0, lastSwish: 0, phaseStart: -1 };
// 校园版：抚摸点必须在水里（sdf < -0.3），镜头站在岸上（sdf > 0.02）；荷花池版避开荷叶密集处。
// 沿池岸逐点找离参考位置最近的合格岸边点（与 feedingShot 相同的避让：跌水、鸢尾、石拱桥桥头）。
function strokePads() { return (WORLD.lotus || []).map((L) => L.leaf.getWorldPosition(new THREE.Vector3())); }
function strokeSpotOK(x, z, pads) {
  if (sdf(x, z) > -0.3) return false;
  let near = 0;
  for (const p of pads) { const d = Math.hypot(p.x - x, p.z - z); if (d < 0.5) return false; if (d < 1.1) near++; }
  return near <= (window.CAMPUS_POND.lotusExtra ? 1 : 2);
}
function strokeShot(nx, nz) {
  const pads = strokePads();
  let best = null, bd = 1e9;
  for (let s = 0; s < POLY_LEN; s += 0.05) {
    const sh = shoreAt(s);
    if (nearWaterfall(sh.x, sh.z, 1.5)) continue;
    if ((WORLD.irisClumps || []).some((c) => Math.hypot(c.x - sh.x, c.z - sh.z) < 1.1)) continue;
    if (Math.abs(sh.z - BRIDGE.z) < 1.0 && Math.abs(Math.abs(sh.x) - 1.8) < 0.9) continue;
    const cx = sh.x + sh.nx * 0.12, cz = sh.z + sh.nz * 0.12;
    if (sdf(cx, cz) < 0.02) continue;                                  // 镜头必须在岸上
    for (const din of [0.55, 0.7, 0.85, 1.0]) {
      const x = sh.x - sh.nx * din, z = sh.z - sh.nz * din;
      if (!strokeSpotOK(x, z, pads)) continue;
      const d = Math.hypot(sh.x - nx, sh.z - nz) + din * 0.2;
      if (d < bd) { bd = d; best = { sh, x, z, cx, cz }; }
      break;
    }
  }
  return best;
}
function startStroke() {
  if (!FEED.hand || FEED.active || STROKE.active) return;
  const ref = P.cameraMode === 'Cinematic' ? [0.9, 5.8] : [camera.position.x, camera.position.z];
  const B = strokeShot(ref[0], ref[1]);
  if (!B) { toast('附近岸边没有合适的抚摸位置'); return; }
  const fwd = new THREE.Vector3(-B.sh.nx, 0, -B.sh.nz).normalize();     // 从岸上看向水面
  STROKE.along.set(-fwd.z, 0, fwd.x);                                  // the fish lies across the view, parallel to the bank
  STROKE.spot.set(B.x, WATER_Y, B.z);
  // crouch on the bank and look down on the fish（镜头在岸上，不再悬在水面上方）
  STROKE.shot = { pos: new THREE.Vector3(B.cx, Math.max(ground(B.cx, B.cz), 0.15) + 0.74, B.cz), look: STROKE.spot.clone().addScaledVector(fwd, 0.04).setY(WATER_Y - 0.05) };
  window.__strokeInfo = { spot: [B.x, B.z], spotSdf: sdf(B.x, B.z), cam: [B.cx, B.cz], camSdf: sdf(B.cx, B.cz), handT: -1, doneT: -1 };
  const all = KOI.fish.slice(0, Math.min(P.fishCount, KOI.fish.length)), tame = all.filter((f) => f.size > 0.36 && f.size < 0.66);
  const fs = tame.length ? tame : all;                                 // a juvenile is too shy (and too small) to come to the hand
  STROKE.fish = fs.reduce((b, f) => (f.p.distanceTo(STROKE.spot) < b.p.distanceTo(STROKE.spot) ? f : b), fs[0]);
  STROKE.fish.stroke = 1;
  STROKE.t = 0; STROKE.phaseStart = -1; STROKE.user = -1; STROKE.active = true; STROKE.touch = 0; STROKE.hpInit = false; STROKE.col = { lift: 0 };
  $('strokebtn').disabled = true; $('feedbtn').disabled = true;
  toast('一条锦鲤游向你的手……在它身上拖动来抚摸');
  startAudio();
}
function endStroke() {
  STROKE.active = false;
  if (KOI.fins && KOI.fins.material.userData.uniforms.uDorsalFold) KOI.fins.material.userData.uniforms.uDorsalFold.value.fill(0);
  if (STROKE.fish) { const f = STROKE.fish; f.stroke = 0; f.bursting = true; f.cycleT = 0.6; f.thrust = 0.3; f.heading += rr(-0.6, 0.6); }
  if (FEED.hand) FEED.hand.root.visible = false;
  STROKE.shot = null; $('strokebtn').disabled = false; $('feedbtn').disabled = false;
}
const _sk1 = new THREE.Vector3(), _sk2 = new THREE.Vector3(), _sk3 = new THREE.Vector3();
function updateStroke(dt, t) {
  if (!STROKE.active || dt <= 0) return;
  STROKE.t += dt;
  const f = STROKE.fish, H = FEED.hand, T = STROKE.t;
  const fx = Math.cos(f.heading), fz = -Math.sin(f.heading);
  // the hand only reaches in once the koi is alongside AND has risen to lie just under the surface
  const backTopY = f.p.y + f.size * 0.14 * f.girth;
  const arrived = Math.hypot(f.p.x - STROKE.spot.x, f.p.z - STROKE.spot.z) < 0.3 && backTopY > WATER_Y - 0.08;   // 到位判定放宽
  if (STROKE.phaseStart < 0 && T > 6 && !arrived) {
    // 等待上限 6 秒：鱼还没游到，直接把它引过来（平滑拉到手边、转成与岸平行、浮到水面下）
    const k = 1 - Math.exp(-dt * 5), th = Math.atan2(-STROKE.along.z, STROKE.along.x);
    f.p.x = lerp(f.p.x, STROKE.spot.x, k); f.p.z = lerp(f.p.z, STROKE.spot.z, k);
    f.p.y = lerp(f.p.y, WATER_Y - f.size * 0.14 * f.girth - 0.03, k);
    f.heading += Math.atan2(Math.sin(th - f.heading), Math.cos(th - f.heading)) * k;
  }
  if (STROKE.phaseStart < 0 && (arrived && T > 1.6 || T > 7.2)) { STROKE.phaseStart = T; if (window.__strokeInfo) __strokeInfo.handT = T; }
  const S = STROKE.phaseStart < 0 ? -1 : T - STROKE.phaseStart;       // time since the hand started
  const nStrokes = 3, cyc = 2.4, tIn = 1.7, tOut = 1.7, total = tIn + nStrokes * cyc + tOut, hover = 0.05;
  const ease = (x) => { x = clamp(x, 0, 1); return x * x * x * (x * (x * 6 - 15) + 10); };   // smootherstep: zero velocity and acceleration at both ends
  camera.getWorldDirection(_hf); _hr.crossVectors(_hf, _up).normalize(); _hu.crossVectors(_hr, _hf);
  // the hand starts (and ends) retracted just in front of the shoulder, off-screen and clear of the bank
  const shoulder0 = _hs.copy(camera.position).addScaledVector(_hr, 0.55).addScaledVector(_hu, -0.3).addScaledVector(_hf, 0.15);
  koiBackPoint(f, 0.2, _sk2); _sk2.y += hover;
  const away = _ha.copy(shoulder0).lerp(_sk2, 0.22);
  // One continuous path (every phase starts exactly where the previous one ended): reach in to hover just above
  // the koi's back behind its head, three slow head-to-tail strokes in contact with its exact back surface, each
  // lifting and returning to that same hover point, then withdraw from it.
  let touch = 0;
  const des = _sk1;
  if (S < 0) { H.root.visible = false; }
  else {
    H.root.visible = S < total;
    if (S < tIn) { koiBackPoint(f, 0.2, _sk2); _sk2.y += hover; des.lerpVectors(away, _sk2, ease(S / tIn)); }
    else if (S < tIn + nStrokes * cyc) {
      const c = ((S - tIn) % cyc) / cyc;
      let sb;
      if (STROKE.user >= 0) { sb = STROKE.user; touch = 1; }        // following the viewer's drag
      else { sb = c < 0.7 ? lerp(0.2, 0.74, ease(c / 0.7)) : lerp(0.74, 0.2, ease((c - 0.7) / 0.3)); touch = smoothstep(0.0, 0.1, c) * (1 - smoothstep(0.62, 0.72, c)); }
      koiBackPoint(f, sb, des); des.y += hover * (1 - touch);
      if (touch > 0.5 && T - STROKE.lastDrop > 0.12) { STROKE.lastDrop = T; addDrop(des.x, des.z, 0.05, -0.0012); }
      if (touch > 0.5 && T - STROKE.lastSwish > cyc * 0.8 && AUDIO.ctx) { STROKE.lastSwish = T; burst(rr(900, 1300), 0.8, 0.5, 0.02, 0.2, 0, 500); }
      if (touch < 0.2 && rand() < dt * 3 && AUDIO.ctx) tone('sine', rr(1500, 2300), rr(800, 1100), 0.06, 0.012, 0.25);   // drips off the fingers
    } else { koiBackPoint(f, 0.2, _sk2); _sk2.y += hover; des.lerpVectors(_sk2, away, ease((S - tIn - nStrokes * cyc) / tOut)); }
    if (S >= total) { if (window.__strokeInfo) __strokeInfo.doneT = T; endStroke(); }
  }
  STROKE.touch = lerp(STROKE.touch, touch, 1 - Math.exp(-dt * 8));
  if (KOI.fins && KOI.fins.material.userData.uniforms.uDorsalFold) { const fold = KOI.fins.material.userData.uniforms.uDorsalFold.value, i = KOI.fish.indexOf(f); if (i >= 0) fold[i] = lerp(fold[i], S >= 0 ? 1 : 0, 1 - Math.exp(-dt * 3)); }   // the koi lays its dorsal fin flat under the hand
  if (H.root.visible) {
    // a critically damped follow removes any residual kink (e.g. when a drag starts) so the hand always glides
    des.y = Math.max(des.y, WATER_Y - 0.035);                         // fingers dip a few centimetres at most
    if (!STROKE.hpInit) { STROKE.hp = des.clone(); STROKE.hpInit = true; }
    STROKE.hp.lerp(des, 1 - Math.exp(-dt * 12));
    const target = STROKE.hp;
    // wrist sits behind the palm; the arm reaches in from the right and rises out of the water toward the shoulder
    const shoulder = _hs.copy(camera.position).addScaledVector(_hr, 0.55).addScaledVector(_hu, -0.3).addScaledVector(_hf, 0.15);
    const X = _hx.subVectors(target, shoulder).normalize();
    const wrist = _sk3.copy(target).addScaledVector(X, -0.055); wrist.y += 0.012;
    H.root.position.copy(wrist);
    const Y = _hy.set(0, 1, 0).addScaledVector(X, -X.y).normalize(), Z = _hz.crossVectors(X, Y);
    H.root.quaternion.setFromRotationMatrix(_hm.makeBasis(X, Y, Z));
    H.root.rotateX(0.08);
    H.palm.rotation.set(0, 0, -0.08 - 0.1 * STROKE.touch);
    poseHandFlat(0.5 + 0.5 * STROKE.touch, T);
    resolveHandCollisions(H, false, STROKE.col, dt);                 // never through the koi, rocks or bank
  }
  if (T > 30) endStroke();
}
/* ------------------------------------------------------------------ 13g. HAND COLLISIONS */
// The hand is a rigid-bodied rig posed by animation; before every frame is drawn it is pushed clear of anything
// solid it would pass through: koi bodies (the exact analytic body the vertex shader draws: section profile,
// girth, the swimming spine wave and the fish's roll/pitch), the pond floor and banks, and the rocks.
const HANDCOL = { pts: [], o: new THREE.Vector3(), ray: new THREE.Raycaster(), inv: new THREE.Matrix4(), m: new THREE.Matrix4(), v: new THREE.Vector3(), down: new THREE.Vector3(0, -1, 0) };
HANDCOL.ray.layers.enableAll();
// the koi body surface in the fish's local frame (length 1): top and bottom of the section at (s, lateral z)
function koiSpan(f, s, lz) {
  if (s < 0 || s > 1) return null;
  const bulk = smoothstep(0.03, 0.16, s) * (1 - 0.5 * smoothstep(0.7, 1.0, s));
  const top = crInterp(KOI_TOP, s) * (1 + 0.06 * bulk), bot = crInterp(KOI_BOT, s) * (1 + 0.06 * bulk), w = crInterp(KOI_W, s) * (1 + 0.2 * bulk);
  const gm = smoothstep(0.08, 0.35, s) * (1 - smoothstep(0.72, 1.0, s)), g = lerp(1, f.girth, gm);
  const A = f.amp * (0.05 + 0.95 * s * s), lat = A * Math.sin(s * 5.7 - f.phase) + f.bend * (s - 0.3) * (s - 0.3);
  const z = Math.abs(lz - lat), W = w * g;
  if (z > W) return { W, top: g * (top + bot) / 2, bot: g * (top + bot) / 2, out: z - W };
  const sn = Math.pow(z / W, 1 / 0.9), c = Math.sqrt(Math.max(0, 1 - sn * sn)), yc = (top + bot) / 2;
  return { W, top: g * (yc + (top - yc) * Math.pow(c, 0.92)), bot: g * (yc - (yc - bot) * Math.pow(c, 0.88)), out: 0 };
}
// a point on the koi's back (top of the body the shader draws, on the swimming spine) at fraction s snout->tail
function koiBackPoint(f, s, out) {
  const A = f.amp * (0.05 + 0.95 * s * s), lat = A * Math.sin(s * 5.7 - f.phase) + f.bend * (s - 0.3) * (s - 0.3);
  const sp = koiSpan(f, s, lat);
  HANDCOL.m.compose(f.p, _qk.setFromEuler(_ek.set(f.roll, f.heading, f.pitch, 'YZX')), _sk.setScalar(f.size));
  return out.set(0.5 - s, (sp ? sp.top : 0.1) + 0.002, lat).applyMatrix4(HANDCOL.m);
}
// how far (world metres, straight up) a sphere at p with radius r must rise to clear this koi
function koiLift(f, p, r) {
  HANDCOL.m.compose(f.p, _qk.setFromEuler(_ek.set(f.roll, f.heading, f.pitch, 'YZX')), _sk.setScalar(f.size));
  HANDCOL.inv.copy(HANDCOL.m).invert();
  const l = HANDCOL.v.copy(p).applyMatrix4(HANDCOL.inv), rl = r / f.size;
  const sp = koiSpan(f, 0.5 - l.x, l.z);
  if (!sp || sp.out > rl) return 0;
  const clear = Math.sqrt(Math.max(0, rl * rl - sp.out * sp.out));
  if (l.y > sp.top + clear || l.y < sp.bot - clear) return 0;
  return (sp.top + clear - l.y) * f.size;
}
function handSamplePoints(H) {
  const P = HANDCOL.pts; P.length = 0;
  const add = (o, x, y, z, r) => { const v = new THREE.Vector3(x, y, z); o.localToWorld(v); P.push([v, r]); };
  for (const name of ['index', 'middle', 'ring', 'pinky', 'thumb']) {
    const j = H.J[name];
    add(H.tips[name], 0, 0, 0, 0.0075);
    add(j[2], 0, 0, 0, 0.0085); add(j[1], 0, 0, 0, 0.009); add(j[0], 0, 0, 0, 0.0095);
    add(j[2], 0.012, 0, 0, 0.008); add(j[1], 0.015, 0, 0, 0.0085);
  }
  for (const [x, z] of [[0.015, 0.03], [0.015, -0.03], [0.045, 0.034], [0.045, -0.03], [0.07, 0.02], [0.07, -0.02], [0.04, 0]]) add(H.palm, x, -0.004, z, 0.013);
  for (const x of [-0.04, -0.12, -0.2, -0.28]) add(H.root, x, 0.002, 0, 0.03 + (-x) * 0.02);
  return P;
}
// Resolve the posed hand against the scene; returns the lift applied (and how much of it came from a koi)
function resolveHandCollisions(H, skipFish, state, dt) {
  let total = 0, fishLift = 0;
  const y0 = H.root.position.y;
  for (let iter = 0; iter < 4; iter++) {
    H.root.updateMatrixWorld(true);
    const pts = handSamplePoints(H);
    let lift = 0, fl = 0;
    const fishes = skipFish ? [] : KOI.fish.slice(0, Math.min(P.fishCount, KOI.fish.length)).filter((f) => f.p.distanceTo(H.root.position) < f.size + 0.45);
    const solids = (WORLD.solids || []).filter((m) => m.visible);
    for (const [p, r] of pts) {
      for (const f of fishes) { const d = koiLift(f, p, r); if (d > lift) { lift = d; fl = d; } }
      const floor = terrainHeight(p.x, p.z) + r;                    // pond floor or bank
      if (floor - p.y > lift) lift = floor - p.y;
      if (solids.length) {
        HANDCOL.ray.set(HANDCOL.o.set(p.x, p.y + 0.6, p.z), HANDCOL.down); HANDCOL.ray.far = 0.6 + r;
        const hit = HANDCOL.ray.intersectObjects(solids, false)[0];
        if (hit && hit.point.y + r - p.y > lift) lift = hit.point.y + r - p.y;
      }
    }
    if (lift <= 1e-4) break;
    H.root.position.y += lift + 0.001; total += lift + 0.001; fishLift = Math.max(fishLift, fl);
  }
  if (state && dt > 0) {
    // filter the correction: rises quickly, relaxes slowly, and never lets more than 2 mm of overlap through
    const k = total > state.lift ? 1 - Math.exp(-dt * 30) : 1 - Math.exp(-dt * 4);
    state.lift = lerp(state.lift, total, k);
    H.root.position.y = y0 + Math.max(state.lift, total - 0.002);
  }
  H.root.updateMatrixWorld(true);
  return { total, fishLift };
}
function endFeeding() {
  FEED.active = false; FEED.hand.root.visible = false; FEED.shot = null;
  if (P.cameraMode === 'Manual') { const e = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ'); CTRL.yaw = e.y; CTRL.pitch = e.x; }
  FEED.pellets = FEED.pellets.filter((q) => !q.eaten);
  $('feedbtn').disabled = false;
  if (P.cameraMode !== 'Manual') PATH.blend = 0;
}

/* --- Splash droplets (CPU particles rendered as soft, lit points above the surface) */
const SPLASH = { n: 260, p: null, v: null, life: null, geo: null, pts: null, next: 0 };
function buildSplashes() {
  SPLASH.p = new Float32Array(SPLASH.n * 3); SPLASH.v = new Float32Array(SPLASH.n * 3); SPLASH.life = new Float32Array(SPLASH.n);
  SPLASH.geo = new THREE.BufferGeometry();
  SPLASH.geo.setAttribute('position', new THREE.BufferAttribute(SPLASH.p, 3));
  SPLASH.geo.setAttribute('aLife', new THREE.BufferAttribute(SPLASH.life, 1));
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uScale: { value: 1 }, uColor: { value: new THREE.Color() } },
    vertexShader: /* glsl */`
      // === SPLASH DROPLETS: size-attenuated points, fading with remaining life
      attribute float aLife; uniform float uScale; varying float vL;
      void main(){ vL = aLife; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = aLife > 0.0 ? uScale * (0.5 + aLife) / max(-mv.z, 0.05) : 0.0; }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor; varying float vL;
      void main(){ vec2 q = gl_PointCoord - 0.5; float r = dot(q, q); if (r > 0.25 || vL <= 0.0) discard;
        float rim = smoothstep(0.12, 0.25, r), spec = smoothstep(0.03, 0.0, dot(q - vec2(-0.12, -0.12), q - vec2(-0.12, -0.12)));
        gl_FragColor = vec4(uColor * (0.55 + rim * 0.6) + spec * 2.5, (0.35 + rim * 0.5) * min(1.0, vL * 3.0)); }`,
  });
  SPLASH.pts = new THREE.Points(SPLASH.geo, m); SPLASH.pts.frustumCulled = false; SPLASH.pts.renderOrder = 6;
  setLayer(SPLASH.pts, LAYER.ABOVE); scene.add(SPLASH.pts);
}
/* ------------------------------------------------------------------ 13e. WEATHER & SEASONS */
// Four moods, blended over a few seconds: a clear spring day; a June rain (tsuyu: overcast light, wet dark stone and
// glossy puddle sheen, rain streaks, drop rings all over the pond, mist, rain on leaves and water); autumn (low golden
// sun, deciduous foliage turning red / orange / gold, falling leaves instead of petals, warm haze, red dragonflies,
// spider lilies); winter (pale overcast, snow falling and settling on every upward surface, ice sheets creeping out
// from the banks, bare deciduous trees, camellias in bloom, the turtle and frog hibernating, koi slow and deep).
const WX = { name: 'Sunny', cur: JSON.parse(JSON.stringify(WX_PRESETS.Sunny)), from: null, t: 1, applied: 'Sunny' };
const WX_LETTER = { Sunny: 'S', Rain: 'R', Autumn: 'A', Winter: 'W' };
const WX_NAME_CN = { Sunny: '晴', Rain: '雨', Autumn: '秋', Winter: '冬雪' };
function seasonal(o, seasons) { if (o) WORLD.seasonal.push({ o, s: seasons }); return o; }
function setWeather(name) {
  if (!WX_PRESETS[name]) return;
  WX.from = JSON.parse(JSON.stringify(WX.cur)); WX.name = name; WX.t = 0; P.weather = name;
  if (GUI_CTRL.weather) GUI_CTRL.weather.updateDisplay();
  const cn = (WX_PRESETS[name] && WX_PRESETS[name].label) || WX_NAME_CN[name] || name;
  setBtnLabel('tb-weather', cn); const b = $('tb-weather'); if (b) b.title = '天气：' + cn + ' · T 切换（进入演示模式）';
  if (!WX_PRESETS[name].silent) toast({ Sunny: '晴天', Rain: '下雨', Autumn: '秋色', Winter: '冬日飘雪' }[name] || ('天气：' + cn));
}
function cycleWeather() { if (window.PondCampus) { PondCampus.cycleWeather(); return; } const k = ['Sunny', 'Rain', 'Autumn', 'Winter']; setWeather(k[(k.indexOf(WX.name) + 1) % k.length]); }
function updateWeather(dt) {
  if (WX.t < 1 && WX.from) {
    WX.t = Math.min(1, WX.t + dt / 4);
    const k = smoothstep(0, 1, WX.t), to = WX_PRESETS[WX.name];
    for (const key in to) {
      if (Array.isArray(to[key])) WX.cur[key] = to[key].map((v, i) => lerp(WX.from[key][i], v, k));
      else WX.cur[key] = lerp(WX.from[key], to[key], k);
    }
    if (WX.t >= 0.5 && WX.applied !== WX.name) applySeason(WX.name);
    applyWeather();
  }
}
function applyWeather() {
  const c = WX.cur;
  P.timeOfDay = c.tod; P.windSpeed = c.wind; P.exposure = c.expo;
  skyUniforms.uCloudCover.value = c.cloud; skyUniforms.turbidity.value = c.turb; skyUniforms.uSkyScale.value = c.skyScale;
  const nf = window.CAMPUS_SUN ? CAMPUS_SUN.night : 0, fc = pondNightFog(c.fogCol, nf);
  skyUniforms.uOvercast.value = c.overcast; skyUniforms.uOvercastCol.value.setRGB(fc[0] / c.skyScale, fc[1] / c.skyScale, fc[2] / c.skyScale);
  updateSun(); updateWaves();
  SH.uSnowCover.value = c.cover; SH.uWet.value = c.wet; SH.uAutumn.value = c.autumn; SH.uFogDensity.value = c.fog; SH.uFogColor.value.setRGB(...fc);
  SH.uRain.value = c.rain; SH.uIce.value = c.ice;
  if (compositePass) compositePass.uniforms.uGrade.value.set(...c.grade);
  for (const k of ['time', 'wind', 'expo']) if (GUI_CTRL[k]) GUI_CTRL[k].updateDisplay();
}
function applySeason(name) {
  WX.applied = name;
  const L = WX_LETTER[name], spring = L === 'S' || L === 'R', autumn = L === 'A', winter = L === 'W';
  for (const e of WORLD.seasonal) e.o.visible = e.s.includes(L);
  // cherry crowns: blossom in spring, turning foliage in autumn, bare in winter
  const sk = WORLD.leafMesh && WORLD.leafMesh.sakura;
  if (sk) { const tex = autumn ? TEX.greenLeaves : TEX.sakura; sk.material.map = tex; sk.customDepthMaterial.map = tex; sk.material.userData.uniforms.uDecid.value = autumn ? 1 : 0; }
  const hy = WORLD.leafMesh && WORLD.leafMesh.hydrangea;
  if (hy) hy.material.color.setRGB(...(autumn ? [0.78, 0.62, 0.5] : [1, 1, 1]));          // dried 'antique' heads in autumn
  for (const m of WORLD.bloomMats || []) m.userData.uniforms.uBloom.value = spring ? 1 : 0;
  if (PETALS.mesh) { PETALS.mesh.visible = autumn; PETALS.mesh.material.color.setRGB(...(autumn ? [1.0, 0.5, 0.25] : [1, 1, 1])); }
  if (SAKURA.air) {
    SAKURA.air.visible = SAKURA.rest.visible = autumn; SAKURA.off = !autumn;
    const tex = autumn ? SAKURA.leafTex : SAKURA.petalTex; SAKURA.air.material.map = tex;
    SAKURA.scale = autumn ? 2.4 : 1;
    const warm = [[0.85, 0.2, 0.08], [0.95, 0.45, 0.1], [0.9, 0.65, 0.15], [0.7, 0.15, 0.1]];
    for (let i = 0; i < SAKURA.n; i++) { const w = warm[i % 4]; SAKURA.air.setColorAt(i, autumn ? new THREE.Color(...w) : new THREE.Color(1, 1, 1)); SAKURA.rest.setColorAt(i, autumn ? new THREE.Color(...w) : new THREE.Color(1, 1, 1)); }
    SAKURA.air.instanceColor.needsUpdate = SAKURA.rest.instanceColor.needsUpdate = true;
  }
  DRAGON.off = !(L === 'S' || L === 'A') || (window.CAMPUS_SUN && CAMPUS_SUN.night > 0.5);
  for (const D of DRAGON.list) D.root.visible = !DRAGON.off;
  if (TURTLE.root) { TURTLE.off = winter; TURTLE.root.visible = !winter; }
  envDirty = true; SHADOW.dirty = true;
}

// --- precipitation: rain streaks (line segments) and snowflakes (soft points), in a box that follows the camera
const PRECIP = { nR: 3200, nS: 6500, rain: null, snow: null, R: [], S: [] };
const SNOW_VS = /* glsl */`
attribute float aSize;
uniform float uScale;
varying float vFade;
void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv;
  gl_PointSize = aSize * uScale / max(-mv.z, 0.1); vFade = smoothstep(0.15, 0.6, -mv.z) * (1.0 - smoothstep(9.0, 12.0, -mv.z)); }`;
const SNOW_FS = /* glsl */`
uniform vec3 uColor;
uniform float uOpacity;
varying float vFade;
void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.12, d) * uOpacity * vFade; if (a < 0.01) discard; gl_FragColor = vec4(uColor, a); }`;
function buildPrecip() {
  const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(PRECIP.nR * 6), 3));
  PRECIP.rain = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }));
  const sg = new THREE.BufferGeometry(), sz = new Float32Array(PRECIP.nS);
  sg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(PRECIP.nS * 3), 3));
  for (let i = 0; i < PRECIP.nS; i++) sz[i] = rr(0.016, 0.045);
  sg.setAttribute('aSize', new THREE.BufferAttribute(sz, 1));
  PRECIP.snow = new THREE.Points(sg, new THREE.ShaderMaterial({ vertexShader: SNOW_VS, fragmentShader: SNOW_FS, transparent: true, depthWrite: false,
    uniforms: { uScale: { value: 600 }, uColor: { value: new THREE.Color() }, uOpacity: { value: 0 } } }));
  for (const m of [PRECIP.rain, PRECIP.snow]) { m.frustumCulled = false; setLayer(m, LAYER.SURFACE); scene.add(m); }
  for (let i = 0; i < PRECIP.nR; i++) PRECIP.R.push(new THREE.Vector3(rr(-8, 8), rr(-4, 7), rr(-8, 8)));
  for (let i = 0; i < PRECIP.nS; i++) PRECIP.S.push({ p: new THREE.Vector3(rr(-7, 7), rr(-4, 6), rr(-7, 7)), ph: rand() * 6.28, v: rr(0.55, 1.0) });
}
function updatePrecip(t, dt) {
  if (!PRECIP.rain) return;
  const c = WX.cur, cam = camera.position, wx = SH.uWindDir.value.x * P.windSpeed, wz = SH.uWindDir.value.y * P.windSpeed;
  const wrap = (p, R, H) => {                               // keep every particle in a box around the camera
    if (p.x - cam.x > R) p.x -= 2 * R; else if (p.x - cam.x < -R) p.x += 2 * R;
    if (p.z - cam.z > R) p.z -= 2 * R; else if (p.z - cam.z < -R) p.z += 2 * R;
    if (p.y < Math.max(WATER_Y, cam.y - 5)) { p.y = cam.y + H * (0.6 + rand() * 0.4); p.x = cam.x + rr(-R, R); p.z = cam.z + rr(-R, R); }
    if (p.y > cam.y + H) p.y -= H;
  };
  const light = 0.6 + 0.5 * (SH.uSunColor.value.r + SH.uSunColor.value.g) * 0.2 + WX.cur.hemiMul * 0.2;
  // rain
  const rOn = c.rain > 0.01 && !STATE.under;
  PRECIP.rain.visible = rOn;
  if (rOn) {
    const n = Math.floor(PRECIP.nR * c.rain), a = PRECIP.rain.geometry.attributes.position.array, vy = 6.5, sx = wx * 1.8, sz = wz * 1.8;
    for (let i = 0; i < n; i++) {
      const p = PRECIP.R[i]; if (dt > 0) { p.y -= vy * dt; p.x += sx * dt; p.z += sz * dt; } wrap(p, 8, 7);
      const k = i * 6; a[k] = p.x; a[k + 1] = p.y; a[k + 2] = p.z; a[k + 3] = p.x - sx * 0.035; a[k + 4] = p.y + vy * 0.035; a[k + 5] = p.z - sz * 0.035;
    }
    PRECIP.rain.geometry.setDrawRange(0, n * 2); PRECIP.rain.geometry.attributes.position.needsUpdate = true;
    PRECIP.rain.material.opacity = 0.3 * c.rain; PRECIP.rain.material.color.setRGB(0.5 * light, 0.55 * light, 0.6 * light);
    // a few heavier drops leave proper ripples in the simulation too
    if (dt > 0 && rand() < dt * 6 * c.rain) { const x = cam.x + rr(-5, 5), z = cam.z + rr(-6, 3); if (sdf(x, z) < -0.1) addDrop(x, z, 0.05, -0.0015); }
  }
  // snow
  const sOn = c.snow > 0.01 && !STATE.under;
  PRECIP.snow.visible = sOn;
  if (sOn) {
    const n = Math.floor(PRECIP.nS * c.snow), a = PRECIP.snow.geometry.attributes.position.array;
    for (let i = 0; i < n; i++) {
      const q = PRECIP.S[i], p = q.p;
      if (dt > 0) { p.y -= q.v * dt; p.x += (wx * 0.6 + Math.sin(t * 0.9 + q.ph) * 0.25) * dt; p.z += (wz * 0.6 + Math.cos(t * 0.7 + q.ph * 1.3) * 0.25) * dt; }
      wrap(p, 7, 6);
      a[i * 3] = p.x; a[i * 3 + 1] = p.y; a[i * 3 + 2] = p.z;
    }
    PRECIP.snow.geometry.setDrawRange(0, n); PRECIP.snow.geometry.attributes.position.needsUpdate = true;
    const u = PRECIP.snow.material.uniforms; u.uOpacity.value = 0.85 * c.snow; u.uColor.value.setRGB(0.95 * light, 0.97 * light, 1.0 * light);
    u.uScale.value = RT.h * 0.55;
  }
}

/* ------------------------------------------------------------------ 13d. BUBBLES + PHYSICAL SPLASH AUDIO */
// Bubbles: silvery spheres (total internal reflection at the air/water interface), oblate and wobbling when big,
// rising at a size-dependent terminal speed (~0.1 m/s at 0.5 mm, ~0.25 m/s at 2 mm) with a zig-zag; entrained by
// splashes (a short downward plume first), released from koi gills after gulping air at the surface, by the turtle's
// plunge and exhalation, and constantly at the foot of the waterfall. They pop at the surface with a tiny ripple.
const BUB = { n: 700, next: 0, list: [], mesh: null };
const BUB_VS = /* glsl */`
varying vec3 vN;
varying vec3 vW;
void main(){
  vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
  vW = w.xyz; vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const BUB_FS = /* glsl */`
uniform vec3 uSunDirW;
uniform vec3 uInscatter;
uniform vec3 uSunColor;
uniform float uCamUnder;
varying vec3 vN;
varying vec3 vW;
void main(){
  vec3 n = normalize(vN), v = normalize(cameraPosition - vW);
  float ndv = clamp(dot(n, v), 0.0, 1.0);
  float rim = pow(1.0 - ndv, 2.2);                              // mirror-bright rim from total internal reflection
  float spec = pow(max(dot(reflect(-v, n), normalize(uSunDirW + vec3(0.0, 0.6, 0.0))), 0.0), 80.0);
  vec3 col = mix(uInscatter * 1.4, vec3(0.78, 0.9, 0.95) * (0.35 + uSunColor * 0.25), rim) + uSunColor * spec * 1.5;
  float dist = length(cameraPosition - vW);
  float a = (0.12 + 0.8 * rim + spec) * exp(-dist * 0.35);
  col = mix(uInscatter, col, exp(-dist * 0.45));
  gl_FragColor = vec4(col, clamp(a, 0.0, 0.95));
}`;
function buildBubbles() {
  const mat = new THREE.ShaderMaterial({ vertexShader: BUB_VS, fragmentShader: BUB_FS, transparent: true, depthWrite: false,
    uniforms: { uSunDirW: SH.uSunDirW, uInscatter: SH.uInscatter, uSunColor: SH.uSunColor, uCamUnder: SH.uCamUnder } });
  BUB.mesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 2), mat, BUB.n);
  BUB.mesh.frustumCulled = false; BUB.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); BUB.mesh.count = 0;
  setLayer(BUB.mesh, LAYER.UNDER); scene.add(BUB.mesh);
  for (let i = 0; i < BUB.n; i++) BUB.list.push({ p: new THREE.Vector3(), v: new THREE.Vector3(), r: 0, life: 0, ph: 0 });
}
// count bubbles around (x,y,z) within `spread`; radii rMin..rMax (m); initial downward speed `down` (plunge)
function bubbleBurst(x, y, z, count, spread = 0.03, rMin = 0.0005, rMax = 0.003, down = 0) {
  if (!BUB.mesh) return;
  for (let k = 0; k < count; k++) {
    const b = BUB.list[BUB.next]; BUB.next = (BUB.next + 1) % BUB.n;
    const r = Math.exp(lerp(Math.log(rMin), Math.log(rMax), Math.pow(rand(), 1.6)));
    b.p.set(x + rr(-spread, spread), Math.min(y + rr(-spread, spread) * 0.5, WATER_Y - 0.004), z + rr(-spread, spread));
    b.v.set(rr(-0.05, 0.05), -down * rr(0.4, 1.2), rr(-0.05, 0.05)); b.r = r; b.life = 12; b.ph = rand() * 6.28;
  }
}
const _bm = new THREE.Matrix4(), _bq = new THREE.Quaternion(), _bs = new THREE.Vector3(), _be = new THREE.Euler();
function updateBubbles(t, dt) {
  if (!BUB.mesh || dt <= 0) return;
  // waterfall plunge: a steady stream
  if (WF.impacts && WF.impacts.length) { BUB.wfT = (BUB.wfT || 0) - dt; if (BUB.wfT < 0) { BUB.wfT = 0.04; for (const I of WF.impacts) if (I.pond) bubbleBurst(I.p.x, WATER_Y - 0.03, I.p.z, 4, 0.07, 0.0005, 0.005, 0.45); } }
  let m = 0;
  for (const b of BUB.list) {
    if (b.life <= 0) continue;
    b.life -= dt;
    const vt = Math.min(0.28, 0.06 + b.r * 110);                        // terminal rise speed
    b.v.y += (vt - b.v.y) * Math.min(1, dt * 5);
    b.v.x *= Math.exp(-dt * 3); b.v.z *= Math.exp(-dt * 3);
    const wob = b.r > 0.0012 ? b.r * 1.6 : 0;                              // zig-zag / spiral of millimetre bubbles
    b.p.x += (b.v.x + Math.cos(t * 9 + b.ph) * wob * 9) * dt; b.p.z += (b.v.z + Math.sin(t * 9 + b.ph) * wob * 9) * dt; b.p.y += b.v.y * dt;
    const floor = terrainHeight(b.p.x, b.p.z) + b.r;
    if (b.p.y < floor) { b.p.y = floor; b.v.y = Math.abs(b.v.y) * 0.2; }
    const surf = waterHeightAt(b.p.x, b.p.z, t);
    if (b.p.y >= surf - b.r) { b.life = 0; if (b.r > 0.002 && rand() < 0.35) addDrop(b.p.x, b.p.z, 0.02, -0.0006); continue; }
    const obl = b.r > 0.0015 ? 0.72 + 0.1 * Math.sin(t * 20 + b.ph) : 1;
    _be.set(0.3 * Math.sin(t * 7 + b.ph), b.ph, 0); _bq.setFromEuler(_be); _bs.set(b.r / Math.sqrt(obl), b.r * obl, b.r / Math.sqrt(obl));
    BUB.mesh.setMatrixAt(m++, _bm.compose(b.p, _bq, _bs));
  }
  BUB.mesh.count = m; BUB.mesh.instanceMatrix.needsUpdate = true;
}
// --- Splash audio from first principles: an impact slap plus a cloud of bubble resonances (Minnaert: f = 3.26 / r)
// that chirp upward as each bubble rises and decay at van den Doel's damping rate; late droplet "plinks" follow.
function splashSound(size, pan = 0, gain = 1, t0 = 0) {
  const ctx = AUDIO.ctx; if (!ctx || !P.audio) return;
  const now = ctx.currentTime;
  if (now < (AUDIO.splashBusy || 0) && size < 0.6) return;                 // voice limiting in a feeding frenzy
  AUDIO.splashBusy = now + 0.035;
  const t = now + t0, out = ctx.createGain(), pn = ctx.createStereoPanner();
  out.gain.value = gain; pn.pan.value = clamp(pan, -1, 1); out.connect(pn).connect(AUDIO.bus);
  const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = AUDIO.white; f.type = 'bandpass'; f.frequency.value = 2200 - size * 1300; f.Q.value = 0.6;
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.05 + 0.12 * size, t + 0.003); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.045 + size * 0.14);
  s.connect(f).connect(g).connect(out); s.start(t, Math.random() * 2); s.stop(t + 0.3);
  const bubble = (r, onset, amp) => {
    const f0 = clamp(3.26 / r, 350, 9000), d = 0.13 * f0 + 0.0072 * Math.pow(f0, 1.5), dur = Math.min(0.3, 5 / d);
    const o = ctx.createOscillator(), bg = ctx.createGain();
    o.frequency.setValueAtTime(f0, onset); o.frequency.exponentialRampToValueAtTime(f0 * 1.35, onset + dur);
    bg.gain.setValueAtTime(0.0001, onset); bg.gain.linearRampToValueAtTime(amp, onset + 0.0015); bg.gain.exponentialRampToValueAtTime(0.0001, onset + dur);
    o.connect(bg).connect(out); o.start(onset); o.stop(onset + dur + 0.02);
  };
  const n = Math.round(5 + size * 26);
  for (let i = 0; i < n; i++) {
    const r = Math.exp(lerp(Math.log(0.0006), Math.log(0.0008 + 0.0045 * size), Math.pow(rand(), 1.4)));
    bubble(r, t + Math.pow(rand(), 2) * (0.03 + 0.22 * size), 0.018 * Math.pow(r / 0.002, 0.5) * rr(0.5, 1));
  }
  for (let i = 0; i < Math.round(size * 7); i++) bubble(rr(0.0008, 0.0022), t + 0.12 + rand() * (0.2 + 0.35 * size), 0.008 * rr(0.5, 1));
}
function splashAt(x, y, z, size) {
  if (!AUDIO.ctx) return;
  _sv.set(x - camera.position.x, y - camera.position.y, z - camera.position.z);
  const d = _sv.length(); if (d > 25) return;
  camera.getWorldDirection(_fw); const right = _sj.crossVectors(_fw, camera.up).normalize();
  splashSound(size, _sv.dot(right) / Math.max(d, 0.3) * 0.8, 1 / (1 + d * 0.45));
}

function spawnSplash(x, z, energy, y0 = WATER_Y, silent = false) {
  if (!SPLASH.p) return;
  if (!silent) splashAt(x, y0, z, clamp(energy * 0.6, 0.12, 1));
  if (y0 <= WATER_Y + 0.02) bubbleBurst(x, WATER_Y - 0.01, z, Math.round(3 + energy * 14), 0.02 + energy * 0.03, 0.0004, 0.0015 + energy * 0.002, 0.15 + energy * 0.35);
  const cnt = Math.round(4 + energy * 8);
  for (let k = 0; k < cnt; k++) {
    const i = SPLASH.next; SPLASH.next = (SPLASH.next + 1) % SPLASH.n;
    const a = rand() * Math.PI * 2, sp = rr(0.15, 0.55) * energy;
    SPLASH.p.set([x + Math.cos(a) * 0.02, y0 + 0.005, z + Math.sin(a) * 0.02], i * 3);
    SPLASH.v.set([Math.cos(a) * sp * 0.5, rr(0.5, 1.3) * energy, Math.sin(a) * sp * 0.5], i * 3);
    SPLASH.life[i] = rr(0.6, 1.0);
  }
}
function updateSplashes(dt) {
  if (!SPLASH.p) return;
  let any = false;
  for (let i = 0; i < SPLASH.n; i++) {
    if (SPLASH.life[i] <= 0) continue;
    any = true;
    SPLASH.v[i * 3 + 1] -= 9.81 * dt;
    SPLASH.p[i * 3] += SPLASH.v[i * 3] * dt; SPLASH.p[i * 3 + 1] += SPLASH.v[i * 3 + 1] * dt; SPLASH.p[i * 3 + 2] += SPLASH.v[i * 3 + 2] * dt;
    SPLASH.life[i] -= dt * 1.4;
    if (SPLASH.p[i * 3 + 1] < WATER_Y) { SPLASH.life[i] = 0; if (rand() < 0.3) addDrop(SPLASH.p[i * 3], SPLASH.p[i * 3 + 2], 0.025, -0.001); }
  }
  SPLASH.pts.visible = any;
  if (any) {
    SPLASH.geo.attributes.position.needsUpdate = true; SPLASH.geo.attributes.aLife.needsUpdate = true;
    const u = SPLASH.pts.material.uniforms;
    u.uScale.value = 0.006 * RT.h / (2 * Math.tan(camera.fov * DEG / 2));
    u.uColor.value.copy(SH.uInscatter.value).multiplyScalar(6).add(new THREE.Color(0.35, 0.38, 0.4).multiplyScalar(0.4 + sunState.intensity * 0.25));
  }
}

/* ------------------------------------------------------------------ 14. GUI, QUALITY, MAIN LOOP */
const GUI_CTRL = {};
function setQuality(q, silent) {
  P.quality = q;
  renderer.setPixelRatio(Math.min(2, (q === 'High' ? Math.min(devicePixelRatio, window.CAMPUS_POND.maxDpr) : Math.min(1.25, devicePixelRatio)) * RES.scale));   // 高：min(dpr,2)；低：min(dpr,1.25)，不再强制 ≤1   // near-native on Retina: crisp, still ~60-90 fps
  renderer.setSize(innerWidth, innerHeight, false);
  const smap = q === 'High' ? (window.CAMPUS_POND.lowPower ? 2048 : 4096) : (window.CAMPUS_POND.lowPower ? 1024 : 2048); sun.shadow.mapSize.set(smap, smap);
  if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
  for (const m of WORLD.leafMats || []) { m.alphaToCoverage = q === 'High'; m.needsUpdate = true; }
  makeTargets();
  if (GUI_CTRL.quality) GUI_CTRL.quality.updateDisplay();
}
function buildGUI() {
  const gui = new dat.GUI({ width: 290 });
  const fE = gui.addFolder('环境');
  GUI_CTRL.weather = fE.add(P, 'weather', { '晴': 'Sunny', '雨': 'Rain', '秋': 'Autumn', '冬雪': 'Winter' }).name('天气预设（演示）').onChange((v) => window.PondCampus ? PondCampus.setPreset(v) : setWeather(v));
  GUI_CTRL.wind = fE.add(P, 'windSpeed', 0, 1, 0.01).name('风力').onChange(updateWaves);
  fE.add(P, 'windDir', 0, 360, 1).name('风向').onChange(updateWaves);
  fE.open();
  const fW = gui.addFolder('水面');
  fW.add(P, 'waterClarity', 0.3, 2.0, 0.01).name('清澈度').onChange(updateClarity);
  fW.add(P, 'waveHeight', 0, 2.5, 0.01).name('波浪高度').onChange(updateWaves);
  fW.add(P, 'causticStrength', 0, 2, 0.01).name('焦散强度').onChange((v) => (SH.uCausticStr.value = v));
  fW.open();
  const fK = gui.addFolder('锦鲤');
  GUI_CTRL.fish = fK.add(P, 'fishCount', 0, KOI_N, 1).name('数量');
  fK.add({ feed: () => startFeeding() }, 'feed').name('喂锦鲤（E）');
  fK.open();
  const fR = gui.addFolder('渲染');
  GUI_CTRL.quality = fR.add(P, 'quality', { '低': 'Low', '高': 'High' }).name('画质').onChange(setQuality);
  fR.add(P, 'autoQuality').name('帧率低时自动降质');
  GUI_CTRL.expo = fR.add(P, 'exposure', 0.3, 2, 0.01).name('曝光');
  GUI_CTRL.bloom = fR.add(P, 'bloomStrength', 0, 1.5, 0.01).name('泛光');
  fR.add(P, 'bloomThreshold', 0.2, 3, 0.01).name('泛光阈值');
  GUI_CTRL.ssao = fR.add(P, 'ssao').name('环境光遮蔽');
  GUI_CTRL.god = fR.add(P, 'godRays').name('体积光');
  fR.add(P, 'grain', 0, 0.08, 0.001).name('胶片颗粒');
  fR.add(P, 'vignette', 0, 1, 0.01).name('暗角');
  fR.add(P, 'sharpen', 0, 1, 0.01).name('锐化');
  const fL = gui.addFolder('镜头（景深）');
  fL.add(P, 'dof').name('景深 + 自动对焦');
  fL.add(P, 'fStop', 1.4, 16, 0.1).name('光圈 f 值');
  fL.add(P, 'dofStrength', 0, 2, 0.01).name('最大虚化');
  const fC = gui.addFolder('镜头');
  fC.add(P, 'movie').name('电影镜头 = 巡游短片');
  fC.add(P, 'letterbox').name('电影黑边');
  fC.add(P, 'tourSeasons').name('每轮切换季节');
  GUI_CTRL.cam = fC.add(P, 'cameraMode', { '电影镜头': 'Cinematic', '自由镜头': 'Manual', '跟随锦鲤': 'Follow koi', '跟随乌龟': 'Follow turtle' }).name('模式').onChange(onCameraMode);
  const fV = gui.addFolder('近景');
  for (const name of ['乌龟', ...Object.keys(VIEWS)]) fV.add({ go: () => goToView(name) }, 'go').name(name);
  fV.add({ go: () => { P.cameraMode = 'Follow koi'; onCameraMode(); } }, 'go').name('跟随锦鲤（K）');
  fC.add(P, 'pathSpeed', 0.2, 3, 0.01).name('巡游速度');
  fC.add(P, 'stayAbove').name('不潜入水下');
  GUI_CTRL.hold = fC.add(P, 'holdCamera').name('定格（P）').onChange((v) => setHold(v));
  GUI_CTRL.freeze = fC.add(P, 'freezeScene').name('暂停时间（O）').onChange((v) => setFreeze(v));
  fC.add({ clean: () => setClean(true) }, 'clean').name('纯净画面（V）');
  fC.add(P, 'volume', 0, 1, 0.01).name('音量');
  GUI_CTRL.audio = fC.add(P, 'audio').name('声音').onChange((v) => setMuted(!v));
  fC.open();
  gui.close(); dat.GUI.TEXT_CLOSED = '收起参数'; dat.GUI.TEXT_OPEN = '高级参数'; gui.closed = true;
  { const d = document.querySelector('.dg.ac'); if (d) d.style.display = 'none'; }   // 默认隐藏，按 H 打开
  GUI_CTRL.gui = gui;
}

// Frame timing: FPS counter + automatic drop to Low when frame time > 25 ms for 2 s
const perf = { ms: 16.7, fps: 60, slow: 0, acc: 0, frames: 0, sinceStart: 0 };
function pondDegraded(msg) { if (window.PondCampus && PondCampus.degraded) PondCampus.degraded(msg); else toast(msg); }
function updatePerf(rawDt) {
  perf.sinceStart += rawDt; perf.acc += rawDt; perf.frames++;
  if (rawDt > 0.25) return;                 // tab was hidden or a shader compiled: not a steady-state frame
  perf.ms = lerp(perf.ms, rawDt * 1000, 0.08);
  if (perf.acc >= 0.5) { perf.fps = perf.frames / perf.acc; perf.acc = 0; perf.frames = 0; }
  if (P.autoQuality && perf.sinceStart > 8) {
    // first trade resolution smoothly (down to 70 %), and only then drop to Low quality
    perf.slow = perf.ms > 22 ? perf.slow + rawDt : 0;
    perf.fast = perf.ms < 13 ? (perf.fast || 0) + rawDt : 0;
    if (perf.slow > 1.5) {
      perf.slow = 0;
      if (RES.scale > 0.76 && P.quality === 'High') { RES.scale = Math.max(0.75, RES.scale - 0.1); setQuality(P.quality, true); }
      else if (P.quality === 'High') { setQuality('Low'); pondDegraded('帧率偏低，已自动切换到“流畅”画质'); }
      else if (P.ssao || P.godRays || P.dof || P.bloomStrength > 0) { P.ssao = P.godRays = P.dof = false; P.bloomStrength = 0; pondDegraded('帧率偏低，已关闭景深 / 体积光等特效'); }
    } else if (perf.fast > 4 && RES.scale < 1) { perf.fast = 0; RES.scale = Math.min(1, RES.scale + 0.1); setQuality(P.quality, true); }
  }
}
const STATE = { under: false, wasUnder: false, exitT: 99, depth: 0 };
let hudTimer = 0;
function updateHUD(dt) {
  hudTimer -= dt; if (hudTimer > 0) return; hudTimer = 0.25;
  $('hud').textContent = `${perf.fps.toFixed(0).padStart(3)} fps  ${perf.ms.toFixed(1).padStart(5)} ms\n画质 ${P.quality === 'High' ? '高' : '低'} · ${STATE.under ? '水下 ' + STATE.depth.toFixed(2) + ' 米' : '水面以上'} · ${{ Cinematic: '电影镜头', Manual: '自由镜头', 'Follow koi': '跟随锦鲤', 'Follow turtle': '跟随乌龟' }[P.cameraMode] || P.cameraMode}`;
}
function updateWind(t) {
  SH.uGust.value = clamp(0.5 + 0.9 * fbm3(t * 0.12, 3.3, 1.1, 3, 77), 0, 1);
}
function updateWaterState(t, dt) {
  const p = camera.position, wh = waterHeightAt(p.x, p.z, t);
  const inPond = sdf(p.x, p.z) < 0.15;
  STATE.wasUnder = STATE.under;
  STATE.under = inPond && p.y < wh - 0.005;
  STATE.depth = Math.max(0, wh - p.y);
  if (STATE.wasUnder && !STATE.under) STATE.exitT = 0; else STATE.exitT += dt;
  // lit water-body colour for in-scattering (sun + sky), dimmer with the camera's depth when submerged
  const irr = SH.uSunColor.value.r * Math.max(0.1, SH.uSunDir.value.y) * 0.9 + 0.55 * skyUniforms.uCloudBright.value;
  const dim = STATE.under ? Math.exp(-0.9 * STATE.depth / P.waterClarity) : 1;
  SH.uInscatter.value.setRGB(0.009 * irr * dim, 0.042 * irr * dim, 0.048 * irr * dim);
  waterMat.uniforms.uFoamColor.value.setRGB(0.8, 0.85, 0.82).multiplyScalar(irr * 0.22);
}
function updateWaterUniforms() {
  const u = waterMat.uniforms;
  u.uUnder.value = STATE.under ? 1 : 0;
  u.uGustW.value = SH.uGust.value * (0.3 + P.windSpeed * 1.2) + FEED.excite * 0.4;
  u.tRefl.value = RT.refl.texture; u.tRefr.value = RT.refr.texture; u.tRefrDepth.value = RT.refr.depthTexture;
  u.uInvRes.value.set(1 / RT.w, 1 / RT.h);
  u.uReflMatrix.value.copy(reflMatrix);
  u.uProj.value.copy(camera.projectionMatrix);
  u.uNear.value = camera.near; u.uFar.value = camera.far;
}
const clock = new THREE.Clock();
const SHADOW = { frame: 0, dirty: true };
let running = false;
function frame() {
  if (window.__pondStop) { window.__pondStopped = true; return; }   // 自动化测试：停帧后截图
  requestAnimationFrame(frame);
  const rawDt = clock.getDelta(), cdt = TEST_STEP || Math.min(rawDt, 0.05), dt = P.freezeScene ? 0 : cdt;   // camera keeps its own clock
  const t = (SH.uTime.value += dt);
  updatePerf(rawDt);
  updateWind(t);
  updateCamera(cdt, t);
  camera.updateMatrixWorld();
  updateWaterState(t, dt);
  updateParticles();
  updateAudio(dt);
  if (typeof updateFish === 'function') updateFish(dt, t);
  updateFeeding(dt, t);
  updateStroke(dt, t);
  updatePondLife(t, dt);
  updateWaterfall(t, dt);
  updateUnderwaterLife(t);
  updateLanterns();
  updateFireflies(t);
  updatePetals(dt);
  updateFallingPetals(t, dt);
  updateDragonflies(t, dt);
  updateBubbles(t, dt);
  updateWeather(cdt);
  updatePrecip(t, dt);
  updateMountains();
  hoverRipples();
  stepRipples(dt);
  envTimer -= dt;
  if (envDirty && envTimer <= 0) { updateEnv(); envTimer = 0.2; }

  // 1) shadows: rendered once per frame through a camera that sees every layer
  SHADOW.frame++;
  if (SHADOW.dirty || SHADOW.frame % (P.quality === 'High' ? 2 : 3) === 0) {
    SHADOW.dirty = false;
    renderer.shadowMap.needsUpdate = true;
    renderer.setRenderTarget(RT.tiny); renderer.render(scene, shadowCam);
  }
  // 2) reflection + refraction targets, 3) main HDR pass, 4) post
  renderWaterPasses(STATE.under);
  mirrorCamera(camera, reflCam);
  updateWaterUniforms();
  setCamLayers(camera, STATE.under ? [LAYER.UNDER, LAYER.BOTH, LAYER.WATER, LAYER.SURFACE] : [LAYER.ABOVE, LAYER.BOTH, LAYER.WATER, LAYER.SKY, LAYER.SURFACE]);
  SH.uCamUnder.value = STATE.under ? 1 : 0;
  renderer.setClearColor(STATE.under ? SH.uInscatter.value : 0x000000, 1);
  renderer.setRenderTarget(RT.main); renderer.clear(); renderer.render(scene, camera);
  renderPost();
  updateHUD(dt);
  if (window.PondCampus) PondCampus.update(cdt, t);
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight, false);
  makeTargets();
});

/* ------------------------------------------------------------------ 校园版：渐进式加载（由 tools/build_pond.py 插入 pond-main.js） */
const PONDT = (window.__pondT = window.__pondT || []);
const pmark = (m) => PONDT.push([performance.now(), m]);
pmark('main-script-eval');
const PHASE2 = { done: false, n: 0, total: 37, stage: null, chip: null, label: '' };
const ALLCAM = () => { const c = camera.clone(); c.layers.enableAll(); return c; };
// 着色器预编译：支持 KHR_parallel_shader_compile 时由驱动在后台并行编译、不阻塞主线程
async function compileAsyncSafe(obj) {
  try { if (renderer.compileAsync) await renderer.compileAsync(obj, ALLCAM(), scene); else renderer.compile(obj, ALLCAM(), scene); }
  catch (e) { console.warn('compileAsync', e); }
}
// 第二阶段：scene.add 暂时改为放进暂存组，每小节编译好着色器再一次性挂进场景
function stageBegin() { PHASE2.stage = new THREE.Group(); PHASE2.added = []; scene.add = function (...o) { PHASE2.added.push(...o); PHASE2.stage.add(...o); return this; }; }
async function stageFlush() {
  const g = PHASE2.stage; if (!g || !g.children.length) return;
  PHASE2.stage = new THREE.Group();
  await compileAsyncSafe(g);
  THREE.Scene.prototype.add.apply(scene, g.children.slice());
  SHADOW.dirty = true; envDirty = true;
}
async function stageEnd() { await stageFlush(); delete scene.add; PHASE2.stage = null; }
function phase2Chip() {
  if (!PHASE2.chip) {
    const c = document.createElement('div'); c.id = 'p2chip'; c.className = 'glass';
    c.innerHTML = '<span id="p2msg"></span><b id="p2pct"></b><i><em id="p2bar"></em></i>';
    document.body.appendChild(c); PHASE2.chip = c;
  }
  const f = Math.min(1, PHASE2.n / PHASE2.total);
  $('p2msg').textContent = '正在补种：' + PHASE2.label; $('p2pct').textContent = Math.round(f * 100) + '%'; $('p2bar').style.width = (f * 100).toFixed(0) + '%';
}
async function phase2Yield(label) {
  PHASE2.n++; if (label) PHASE2.label = label;
  if (!PHASE2.stage) return;
  phase2Chip();
  await stageFlush();
  await new Promise((r) => setTimeout(r, 0));   // 让出主线程：两小节之间浏览器可以渲染一帧、响应点击
}
async function buildPhase2() {
  pmark('phase2-start');
  stageBegin();
  try {
    await phase2Yield('植物纹理'); buildPlantTextures();
    await phase2Yield('种植垂柳、香樟与灌木'); await buildVegetation();
    await phase2Yield('乌龟'); buildTurtle();
    await phase2Yield('水下根系'); buildUnderwaterLife();
    await phase2Yield('萤火虫'); buildFireflies();
    await phase2Yield('水面落叶'); buildPetals();
    await phase2Yield('飘落的柳絮'); buildFallingPetals();
    await phase2Yield('蜻蜓'); buildDragonflies();
    await phase2Yield('气泡'); buildBubbles();
    await stageEnd();
    // 季节 / 天气 / 光照对新加入的植被生效
    if (window.PondCampus) PondCampus.applyEnv(true); else { applySeason(WX.applied || P.weather); applyWeather(); }
    updateSun(); envDirty = true; SHADOW.dirty = true;
    PHASE2.done = true; window.__pondFull = true; pmark('phase2-done');
    if (PHASE2.chip) { PHASE2.n = PHASE2.total; PHASE2.label = '完成'; phase2Chip(); PHASE2.chip.classList.add('is-done'); setTimeout(() => PHASE2.chip && PHASE2.chip.remove(), 900); }
    document.dispatchEvent(new CustomEvent('pond:full'));
  } catch (err) {
    delete scene.add;
    console.error(err); window.__pondError = String(err && err.message || err);
    if (PHASE2.chip) $('p2msg').textContent = '植被加载失败：' + err.message;
  }
}

async function init() {
  try {
    pmark('init');
    await progress(0.04, '勾勒池岸轮廓');
    buildSDF();
    setupWaterfallSite();
    await buildTextures();
    SH.tCaustics.value = TEX.caustics;
    SH.uCausticNorm.value = 1 / (TEX.causticMean * TEX.causticMean);
    pmark('textures-done');
    await progress(0.6, '塑造地形与池底');
    buildTerrain();
    await progress(0.66, '砌筑驳岸石');
    buildStones();
    woodMaterials();
    await progress(0.72, '搭建石桥与小亭');
    if (window.CAMPUS_POND.bridge) buildBridge();
    buildPavilion();
    await progress(0.78, '注水、放养锦鲤');
    buildWater();
    buildWaterfall();
    buildLanterns();          // 庭院灯（点光源）必须在首帧前：之后再加光源会让全部材质重新编译
    buildPrecip();
    buildMountains();
    if (typeof buildKoi === 'function') buildKoi();
    buildHand();
    updateSun(); updateWaves(); updateClarity();
    makeTargets();
    buildPost();
    buildParticles();
    buildDivePost();
    buildGUI();
    setupControls();
    $('feedbtn').addEventListener('click', () => { startAudio(); startFeeding(); });
    $('tb-cam').addEventListener('click', () => { startAudio(); toggleCameraMode(); });
    $('tb-hold').addEventListener('click', () => setHold(!P.holdCamera));
    $('tb-weather').addEventListener('click', () => { startAudio(); cycleWeather(); });
    $('tb-sound').addEventListener('click', () => setMuted(P.audio));
    $('help-close').addEventListener('click', () => setGuide(false));
    $('help-open').addEventListener('click', () => setGuide(true));
    { let m = false, g = true; try { m = localStorage.getItem('koi.muted') === '1'; g = localStorage.getItem('pond.guide') === '1'; } catch (e) { /* storage unavailable */ }
      if (m) setMuted(true); setGuide(g); }
    $('strokebtn').addEventListener('click', () => { startAudio(); startStroke(); });
    $('tb-freeze').addEventListener('click', () => setFreeze(!P.freezeScene));
    $('tb-clean').addEventListener('click', () => setClean(true));
    if (window.PondCampus) PondCampus.init();
    await progress(0.86, '编译着色器（后台并行）');
    updateEnv();
    pmark('compile-start');
    await compileAsyncSafe(scene);
    pmark('compile-end');
    await progress(1, '就绪');
    clock.getDelta();
    frame();
    pmark('first-frame');
    // 首帧已出：遮罩马上淡出并放开交互，植被等在后台分帧补上
    const ld = $('loader'); ld.style.pointerEvents = 'none'; ld.style.transition = 'opacity .35s ease'; ld.style.opacity = 0;
    pmark('interactive');
    setTimeout(() => { ld.remove(); if (window.PondCampus) PondCampus.ready(); }, 380);
    setTimeout(buildPhase2, 0);
  } catch (err) {
    console.error(err); window.__pondError = String(err && err.message || err);
    $('loadmsg').textContent = '场景启动失败：' + err.message;
  }
}
init();
