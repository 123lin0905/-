/*
 * 板块细节场景 · 池塘画质层（PondLook）
 * ------------------------------------------------------------------
 * 从池塘细节场景 ../pond/pond-main.js 抽出的“池塘观感”，供 zone-engine.js / zone-look.js / zone-flora.js 共用：
 *   1. 后期：池塘同款 SSAO（深度重建、法线半球 12 采样、半分辨率 + 4×4 模糊）、6 级 mip 泛光（Jimenez 13 点降采样 + 帐篷升采样）、
 *      合成 pass（AO、泛光、限幅锐化、天气调色、ACES、0.95 饱和、暗角、细颗粒）。按板块尺度把 AO 半径随距离放大（池塘约 30 米见方，
 *      板块是百米级）。只在“清晰”档启用；“流畅 / 省电”不建这些目标。
 *   2. 地面：池塘草地（苔草 + 干草 + 裸土斑块的 TEX.ground，池塘同款橄榄绿调色），宏观斑块、秋季落叶、草地法线细节与 sheen 微光。
 *   3. 近景草丛：相机周围按世界网格散布的叶片卡草丛（池塘芒草 / 草叶同款贴图做法），随风摆、随季节变黄，按画质档控制数量（省电档不建）。
 *   4. 树冠：池塘近景树的叶片卡做法 —— 更多、更小、带弧度（cupped）的叶片卡，层次更密；提供枫树（鸡爪槭）、银杏型、常绿阔叶（香樟型）、
 *      竹子四种生长参数（growTree / addCard 来自 pond-style-core.js）。
 * 原池塘代码：koi-pond-garden（Sourany Phomhome，MIT 许可，见 ../pond/LICENSE-koi-pond-garden.txt），此处为改写摘录。
 */
(function (global) {
  "use strict";
  const THREE = global.THREE, V3 = THREE.Vector3;

  // ============================ 1. 后期（SSAO + 泛光 + 合成） ============================
  const PASS_VS = "varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }";
  const SSAO_FS = /* glsl */`
// 池塘 SSAO：从深度缓冲重建视空间位置，法线朝向半球 12 采样（半分辨率）；板块尺度下半径随距离放大
#include <packing>
uniform sampler2D tDepth;
uniform mat4 uProj;
uniform mat4 uInvProj;
uniform vec2 uTexel;
uniform float uRadius;
uniform float uIntensity;
uniform vec2 uGrow;          // x: 每米放大系数 y: 最大倍数
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
  vec3 pr = viewPos(vUv + vec2(uTexel.x, 0.0)) - P, pl = P - viewPos(vUv - vec2(uTexel.x, 0.0));
  vec3 pu = viewPos(vUv + vec2(0.0, uTexel.y)) - P, pd = P - viewPos(vUv - vec2(0.0, uTexel.y));
  vec3 dx = abs(pr.z) < abs(pl.z) ? pr : pl, dy = abs(pu.z) < abs(pd.z) ? pu : pd;
  vec3 N = normalize(cross(dx, dy));
  float a = h12(gl_FragCoord.xy) * 6.2831853;
  vec3 rv = vec3(cos(a), sin(a), 0.0);
  vec3 T = normalize(rv - N * dot(rv, N)), B = cross(N, T);
  mat3 tbn = mat3(T, B, N);
  float radius = uRadius * clamp(-P.z * uGrow.x, 0.35, uGrow.y);
  float occ = 0.0;
  for (int i = 0; i < 12; i++) {
    vec3 S = P + tbn * uKernel[i] * radius;
    vec4 c = uProj * vec4(S, 1.0);
    vec2 suv = c.xy / c.w * 0.5 + 0.5;
    float sz = viewPos(suv).z;
    float range = smoothstep(0.0, 1.0, radius / abs(P.z - sz));
    occ += (sz >= S.z + 0.015 * radius ? 1.0 : 0.0) * range;
  }
  // 远处（> 600 米）逐渐淡出，避免远景地面出现网格噪声
  float fade = 1.0 - smoothstep(350.0, 700.0, -P.z);
  gl_FragColor = vec4(vec3(clamp(1.0 - occ / 12.0 * uIntensity * fade, 0.0, 1.0)), 1.0);
}`;
  const BLUR4_FS = /* glsl */`
uniform sampler2D tSrc; uniform vec2 uTexel; varying vec2 vUv;
void main(){
  float s = 0.0;
  for (int x = -2; x < 2; x++) for (int y = -2; y < 2; y++) s += texture2D(tSrc, vUv + (vec2(x, y) + 0.5) * uTexel).r;
  gl_FragColor = vec4(vec3(s / 16.0), 1.0);
}`;
  const BLOOM_PRE_FS = /* glsl */`
uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uThreshold; uniform float uExpo; varying vec2 vUv;
void main(){
  vec3 c = (texture2D(tSrc, vUv + vec2(-0.5, -0.5) * uTexel).rgb + texture2D(tSrc, vUv + vec2(0.5, -0.5) * uTexel).rgb +
            texture2D(tSrc, vUv + vec2(-0.5, 0.5) * uTexel).rgb + texture2D(tSrc, vUv + vec2(0.5, 0.5) * uTexel).rgb) * 0.25 * uExpo;
  c = min(c, vec3(40.0));
  float br = max(c.r, max(c.g, c.b)), knee = uThreshold * 0.5;
  float soft = clamp(br - uThreshold + knee, 0.0, 2.0 * knee); soft = soft * soft / (4.0 * knee + 1e-4);
  gl_FragColor = vec4(c * max(soft, br - uThreshold) / max(br, 1e-4), 1.0);
}`;
  const BLOOM_DOWN_FS = /* glsl */`
uniform sampler2D tSrc; uniform vec2 uTexel; varying vec2 vUv;
vec3 t(vec2 o){ return texture2D(tSrc, vUv + o * uTexel).rgb; }
void main(){
  vec3 c = t(vec2(0.0)) * 0.125;
  c += (t(vec2(-1.0, -1.0)) + t(vec2(1.0, -1.0)) + t(vec2(-1.0, 1.0)) + t(vec2(1.0, 1.0))) * 0.125;
  c += (t(vec2(-2.0, -2.0)) + t(vec2(2.0, -2.0)) + t(vec2(-2.0, 2.0)) + t(vec2(2.0, 2.0))) * 0.03125;
  c += (t(vec2(-2.0, 0.0)) + t(vec2(2.0, 0.0)) + t(vec2(0.0, -2.0)) + t(vec2(0.0, 2.0))) * 0.0625;
  gl_FragColor = vec4(c, 1.0);
}`;
  const BLOOM_UP_FS = /* glsl */`
uniform sampler2D tSrc; uniform sampler2D tCur; uniform vec2 uTexel; varying vec2 vUv;
vec3 t(vec2 o){ return texture2D(tSrc, vUv + o * uTexel).rgb; }
void main(){
  vec3 c = t(vec2(0.0)) * 4.0;
  c += (t(vec2(-1.0, 0.0)) + t(vec2(1.0, 0.0)) + t(vec2(0.0, -1.0)) + t(vec2(0.0, 1.0))) * 2.0;
  c += t(vec2(-1.0, -1.0)) + t(vec2(1.0, -1.0)) + t(vec2(-1.0, 1.0)) + t(vec2(1.0, 1.0));
  gl_FragColor = vec4(texture2D(tCur, vUv).rgb + c / 16.0, 1.0);
}`;
  const COMPOSITE_FS = () => /* glsl */`
// 池塘合成 pass：AO、泛光、限幅锐化、曝光、天气调色、ACES、0.95 饱和、暗角、颗粒、sRGB
uniform sampler2D tColor; uniform sampler2D tBloom; uniform sampler2D tAO;
uniform float uExposure; uniform float uVignette; uniform float uGrain; uniform float uTime; uniform float uBloom; uniform float uAOStr;
uniform float uAspect; uniform vec2 uTexel; uniform float uSharp; uniform vec3 uGrade;
varying vec2 vUv;
${PONDSTYLE_TONEMAP_GLSL}
float h12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
void main(){
  vec2 uv = vUv;
  vec3 c = texture2D(tColor, uv).rgb;
  if (uSharp > 0.0) {
    vec3 n = texture2D(tColor, uv + vec2(0.0, uTexel.y)).rgb, s2 = texture2D(tColor, uv - vec2(0.0, uTexel.y)).rgb;
    vec3 e = texture2D(tColor, uv + vec2(uTexel.x, 0.0)).rgb, w = texture2D(tColor, uv - vec2(uTexel.x, 0.0)).rgb;
    vec3 mn = min(c, min(min(n, s2), min(e, w))), mx = max(c, max(max(n, s2), max(e, w)));
    c = clamp(c + (c - (n + s2 + e + w) * 0.25) * uSharp * 1.6, mn, mx);
  }
  c *= mix(1.0, texture2D(tAO, uv).r, uAOStr);
  c += texture2D(tBloom, uv).rgb * uBloom;
  c *= uExposure / 0.6;
  c *= uGrade;
  c = acesFilmic(c);
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(l), c, 0.95);
  vec2 q = vUv - 0.5;
  c *= 1.0 - uVignette * smoothstep(0.2, 0.85, length(q * vec2(uAspect * 0.75, 1.0)) * 1.2);
  c = toSRGB(c);
  c += (h12(gl_FragCoord.xy + fract(uTime * 13.7) * 311.0) - 0.5) * uGrain * 2.0;
  gl_FragColor = vec4(c, 1.0);
}`;

  function createPost(renderer, U, opts) {
    opts = opts || {};
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2)); quad.frustumCulled = false;
    const fsScene = new THREE.Scene(); fsScene.add(quad);
    const fsCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const mk = (fs, uniforms) => new THREE.ShaderMaterial({ uniforms, vertexShader: PASS_VS, fragmentShader: fs, depthTest: false, depthWrite: false, toneMapped: false });
    const pass = (mat, target) => { quad.material = mat; renderer.setRenderTarget(target); renderer.render(fsScene, fsCam); };
    const WHITE = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1); WHITE.needsUpdate = true;
    const BLACK = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1); BLACK.needsUpdate = true;
    const R = mulberry32(5190), r = (a, b) => a + (b - a) * R();
    const kernel = [];
    for (let i = 0; i < 12; i++) {   // 与池塘 buildPost 相同的核分布（越靠近中心越密）
      const v = new V3(r(-1, 1), r(-1, 1), r(0.15, 1)).normalize();
      kernel.push(v.multiplyScalar(lerp(0.15, 1, Math.pow(i / 12, 2)) * r(0.6, 1)));
    }
    const ssao = mk(SSAO_FS, { tDepth: { value: null }, uProj: { value: new THREE.Matrix4() }, uInvProj: { value: new THREE.Matrix4() }, uTexel: { value: new THREE.Vector2() },
      uRadius: { value: opts.aoRadius || 0.55 }, uIntensity: { value: opts.aoIntensity || 1.35 }, uGrow: { value: new THREE.Vector2(opts.aoGrow || 0.022, opts.aoMax || 6.0) }, uKernel: { value: kernel } });
    const blur = mk(BLUR4_FS, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() } });
    const pre = mk(BLOOM_PRE_FS, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uThreshold: { value: 0.9 }, uExpo: { value: 1 } });
    const down = mk(BLOOM_DOWN_FS, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() } });
    const up = mk(BLOOM_UP_FS, { tSrc: { value: null }, tCur: { value: null }, uTexel: { value: new THREE.Vector2() } });
    const comp = mk(COMPOSITE_FS(), {
      tColor: { value: null }, tBloom: { value: BLACK }, tAO: { value: WHITE }, uExposure: { value: 0.9 }, uVignette: { value: 0.3 }, uGrain: { value: 0.01 }, uTime: U.uTime,
      uBloom: { value: 0.06 }, uAOStr: { value: opts.aoStr != null ? opts.aoStr : 0.8 }, uAspect: { value: 1 }, uTexel: { value: new THREE.Vector2() }, uSharp: { value: 0.35 },
      uGrade: { value: new THREE.Vector3(1.035, 1, 0.955) },
    });
    const T = { w: 0, h: 0, main: null, ao: null, aoBlur: null, mips: [], ups: [], ssao: false };
    function dispose() {
      for (const k of ["main", "ao", "aoBlur"]) if (T[k]) { T[k].dispose(); T[k] = null; }
      T.mips.concat(T.ups).forEach((m) => m.dispose()); T.mips = []; T.ups = [];
      T.w = T.h = 0;
    }
    function setSize(w, h, o) {
      o = o || {};
      const samples = o.samples != null ? o.samples : 4;
      if (T.main && T.w === w && T.h === h && T.samples === samples && T.ssao === !!o.ssao) return;
      dispose();
      T.w = w; T.h = h; T.samples = samples; T.ssao = !!o.ssao;
      const hf = { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false };
      T.main = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, samples, depthTexture: o.ssao ? new THREE.DepthTexture(w, h) : null });
      if (o.ssao) {
        const hw = Math.max(1, w >> 1), hh = Math.max(1, h >> 1);
        T.ao = new THREE.WebGLRenderTarget(hw, hh, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false });
        T.aoBlur = new THREE.WebGLRenderTarget(hw, hh, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false });
      }
      for (let i = 0; i < 6; i++) T.mips.push(new THREE.WebGLRenderTarget(Math.max(1, w >> (i + 1)), Math.max(1, h >> (i + 1)), hf));
      for (let i = 0; i < 5; i++) T.ups.push(new THREE.WebGLRenderTarget(Math.max(1, w >> (i + 1)), Math.max(1, h >> (i + 1)), hf));
    }
    function renderBloom(expo) {
      const m = T.mips;
      pre.uniforms.tSrc.value = T.main.texture; pre.uniforms.uTexel.value.set(1 / T.w, 1 / T.h); pre.uniforms.uExpo.value = expo / 0.6;
      pass(pre, m[0]);
      for (let i = 1; i < m.length; i++) { down.uniforms.tSrc.value = m[i - 1].texture; down.uniforms.uTexel.value.set(1 / m[i - 1].width, 1 / m[i - 1].height); pass(down, m[i]); }
      let low = m[m.length - 1].texture;
      for (let i = m.length - 2; i >= 0; i--) {
        up.uniforms.tSrc.value = low; up.uniforms.tCur.value = m[i].texture; up.uniforms.uTexel.value.set(1 / m[i + 1].width, 1 / m[i + 1].height);
        pass(up, T.ups[i]); low = T.ups[i].texture;
      }
      return low;
    }
    function renderSSAO(camera) {
      const u = ssao.uniforms;
      u.tDepth.value = T.main.depthTexture;
      u.uProj.value.copy(camera.projectionMatrix); u.uInvProj.value.copy(camera.projectionMatrixInverse);
      u.uTexel.value.set(1 / T.ao.width, 1 / T.ao.height);
      pass(ssao, T.ao);
      blur.uniforms.tSrc.value = T.ao.texture; blur.uniforms.uTexel.value.set(1 / T.ao.width, 1 / T.ao.height);
      pass(blur, T.aoBlur);
      return T.aoBlur.texture;
    }
    // o: { expo, grade:Vector3|array, bloom (0..), night }
    function render(scene, camera, o) {
      renderer.setRenderTarget(T.main); renderer.setClearColor(0x000000, 1); renderer.clear();
      renderer.render(scene, camera);
      const u = comp.uniforms;
      u.tColor.value = T.main.texture;
      u.tAO.value = T.ssao ? renderSSAO(camera) : WHITE;
      u.tBloom.value = renderBloom(o.expo);
      u.uExposure.value = o.expo; u.uBloom.value = o.bloom != null ? o.bloom : 0.06;
      if (o.grade) u.uGrade.value.copy(o.grade);
      u.uAspect.value = T.w / T.h; u.uTexel.value.set(1 / T.w, 1 / T.h);
      pass(comp, null);
    }
    return { setSize, render, dispose, comp, ssao, get targets() { return T; } };
  }

  // ============================ 2. 地面（池塘草地） ============================
  // 在 zone-engine 地面着色器 map_fragment 之后执行；可用：m（材质权重 r 草 g 石 b 沥青）、inside、w（世界 xz）、diffuseColor
  const LAWN_PARS = /* glsl */`
uniform sampler2D tPondG; uniform sampler2D tPondGN; uniform vec3 aPondG;
float plGrass = 0.0;
`;
  const LAWN_MAP = /* glsl */`
{
  float gW = m.r * inside + (1.0 - inside);
  plGrass = gW;
  // 板块边界：画布草色与外圈草色在 25 米内渐变（以前是一条笔直的明暗分界线）
  { vec2 eM = min(bu, 1.0 - bu) * uBox.zw; float soft = smoothstep(0.0, 25.0, min(eM.x, eM.y)) * inside;
    vec3 outC = uOutCol * clamp(dG, vec3(0.35), vec3(1.9));
    diffuseColor.rgb = mix(outC, diffuseColor.rgb, mix(1.0, soft, gW)); }
  vec3 pg = texture2D(tPondG, w * 0.55).rgb / aPondG;
  vec3 pg2 = texture2D(tPondG, w * 0.083 + 0.37).rgb / aPondG;
  vec3 c0 = diffuseColor.rgb;
  float lum = dot(c0, vec3(0.299, 0.587, 0.114));
  // 池塘草地调色：降饱和、偏橄榄（池塘草地 0x34461c–0x56692c），亮度略降，避免“荧光绿”
  vec3 olive = mix(vec3(lum), c0, 0.6) * vec3(0.98, 0.92, 0.62) * 0.92;
  vec3 lawn = olive * mix(vec3(1.0), clamp(pg, vec3(0.25), vec3(2.2)), 0.6) * mix(vec3(1.0), clamp(pg2, vec3(0.4), vec3(1.8)), 0.35);
  float n1 = wxn(w * 0.045), n2 = wxn(w * 0.19 + 7.0);
  lawn *= mix(vec3(0.8, 0.86, 0.78), vec3(1.1, 1.04, 0.86), n1 * 0.65 + n2 * 0.35);   // 苔草 / 干草大斑块
  // 秋季：零星落叶（红褐 / 橙黄），冬季草色转枯黄
  float litter = uAutumn * smoothstep(0.66, 0.9, wxn(w * 1.3 + 3.0) * 0.55 + wxn(w * 4.6) * 0.45) * 0.35;
  vec3 leafC = mix(vec3(0.45, 0.13, 0.04), vec3(0.62, 0.38, 0.08), wxn(w * 2.3 + 11.0));
  lawn = mix(lawn, leafC * (0.7 + 0.5 * lum), litter);
  lawn = mix(lawn, vec3(dot(lawn, vec3(0.3, 0.59, 0.11))) * vec3(1.15, 1.0, 0.7), uAutumn * 0.18);
  diffuseColor.rgb = mix(c0, lawn, gW);
  diffuseColor.rgb *= mix(vec3(1.0), vec3(1.07, 1.02, 0.92), m.b * inside);   // 沥青略偏暖灰（以前在天光下发蓝，像水面）
}
`;
  // 草地法线细节（世界空间扰动；板块地面基本水平）
  const LAWN_NORMAL = /* glsl */`
#include <normal_fragment_maps>
{
  vec3 gn = texture2D(tPondGN, vUwPos.xz * 0.55).xyz * 2.0 - 1.0;
  vec3 wn = normalize(vWNrm + vec3(gn.x, 0.0, gn.y) * 0.55 * plGrass);
  normal = normalize(mix(normal, (viewMatrix * vec4(wn, 0.0)).xyz, plGrass));
}
`;
  function lawnUniforms() {
    const rep = (t) => { t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; };
    const avg = ZoneBuild.texAvg(TEX.ground.map);
    return { tPondG: { value: rep(TEX.ground.map) }, tPondGN: { value: rep(TEX.ground.normalMap) }, aPondG: { value: new V3(avg[0], avg[1], avg[2]) } };
  }

  // ============================ 3. 近景草丛 ============================
  function bladeTexture() {
    const W = 128, H = 128, cv = makeCanvas(W, H), g = cv.getContext("2d"), R = mulberry32(1437);
    g.clearRect(0, 0, W, H);
    g.lineCap = "round";
    for (let i = 0; i < 46; i++) {   // 池塘草叶：深绿根部 → 黄绿叶尖，带少量枯黄叶
      const x = 8 + R() * (W - 16), lean = (R() - 0.5) * 46, top = 6 + R() * 64, dry = R() < 0.14;
      const grd = g.createLinearGradient(0, H, 0, top);
      grd.addColorStop(0, dry ? "#6a6034" : "#4a6026"); grd.addColorStop(0.55, dry ? "#9a8a50" : "#6f8a36"); grd.addColorStop(1, dry ? "#c4b070" : "#b0b062");
      g.strokeStyle = grd; g.lineWidth = 1.6 + R() * 2.2;
      g.beginPath(); g.moveTo(x, H); g.quadraticCurveTo(x + lean * 0.25, H * 0.55, x + lean, top); g.stroke();
    }
    return canvasTex(cv, true);
  }
  function grassField(Z) {
    const look = Z.look, scene = Z.scene;
    const tex = bladeTexture();
    const geo = (() => {
      const gs = [];
      for (let k = 0; k < 3; k++) { const p = new THREE.PlaneGeometry(0.42, 0.3, 1, 2).translate(0, 0.15, 0); p.rotateY(k * Math.PI / 3); gs.push(p); }
      const m = mergeGeos(gs);
      // 法线朝上（草丛像一片草坪而不是竖立的卡片：光照与地面一致，不出现卡片边缘的明暗跳变）
      const n = m.attributes.normal; for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
      return m;
    })();
    const mat = look.patch(new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.42, side: THREE.DoubleSide, roughness: 0.85, envMapIntensity: 0.5, vertexColors: false }), {
      key: "plgrass", leaf: true, transl: 0.35, decid: 0, wind: true, windWeight: "clamp(transformed.y * 2.2, 0.0, 1.0) * 0.5", alphaMip: 128,
      fsMap: /* glsl */`
diffuseColor.rgb *= vec3(0.98, 0.94, 0.7);
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11))) * vec3(1.25, 1.05, 0.62), uAutumn * 0.2);
diffuseColor.rgb *= 0.85 + 0.3 * wxn(vUwPos.xz * 0.19 + 7.0);
`,
    });
    const MAX = 16000;
    const mesh = new THREE.InstancedMesh(geo, mat, MAX);
    mesh.count = 0; mesh.frustumCulled = false; mesh.castShadow = false; mesh.receiveShadow = true; mesh.name = "pondlook-grass";
    scene.add(mesh);
    const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new V3(), _s = new V3(), _y = new V3(0, 1, 0);
    const st = { cx: 1e9, cz: 1e9, R: 0, q: "", n: 0 };
    const hash = (i, j, s) => { let h = Math.imul(i, 374761393) ^ Math.imul(j, 668265263) ^ Math.imul(s, 2246822519); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
    const OK = { grass: 1, mulch: 1 };
    function scatter(cx, cz, R, N) {
      const cell = Math.max(0.45, Math.sqrt(Math.PI * R * R / N));
      const i0 = Math.floor((cx - R) / cell), i1 = Math.ceil((cx + R) / cell), j0 = Math.floor((cz - R) / cell), j1 = Math.ceil((cz + R) / cell);
      let n = 0;
      for (let j = j0; j <= j1 && n < MAX; j++) for (let i = i0; i <= i1 && n < MAX; i++) {
        const x = (i + hash(i, j, 1)) * cell, z = (j + hash(i, j, 2)) * cell;
        const d = Math.hypot(x - cx, z - cz); if (d > R) continue;
        if (hash(i, j, 5) < (d / R) * (d / R) * 0.6) continue;              // 外圈逐渐稀疏，不出现硬边
        if (!OK[Z.classAt(x, z)] || Z.waterAt(x, z) || Z.buildingAt(x, z, 0.2) || Z.surfaceAt(x, z) - Z.heightAt(x, z) > 0.05) continue;
        const s = 0.75 + hash(i, j, 3) * 0.7;
        _q.setFromAxisAngle(_y, hash(i, j, 4) * 6.283);
        _m.compose(_p.set(x, Z.heightAt(x, z) - 0.02, z), _q, _s.set(s, s * (0.8 + hash(i, j, 6) * 0.5), s));
        mesh.setMatrixAt(n++, _m);
      }
      mesh.count = n; mesh.instanceMatrix.needsUpdate = true; st.n = n;
    }
    function update(camera, target) {
      const q = look.quality;
      const N = q === "clear" ? 12000 : q === "smooth" ? 4500 : 0;
      // 草丛只在贴地视角出现（相机离地 < 22 米）：高空鸟瞰时 0.3 米的草丛只会变成一片脏斑
      const camH = camera.position.y - Z.heightAt(camera.position.x, camera.position.z);
      if (!N || camH > 22) { mesh.visible = false; st.q = q; return; }
      mesh.visible = true;
      const dist = camera.position.distanceTo(target);
      const k = Math.min(1, Math.max(0, dist / 60));
      const cx = camera.position.x + (target.x - camera.position.x) * 0.5 * k, cz = camera.position.z + (target.z - camera.position.z) * 0.5 * k;
      const R = 26;
      if (q !== st.q || Math.hypot(cx - st.cx, cz - st.cz) > R * 0.18 || Math.abs(R - st.R) > R * 0.2) {
        st.q = q; st.cx = cx; st.cz = cz; st.R = R; scatter(cx, cz, R, N);
      }
    }
    return { mesh, update, stats: st };
  }

  // ============================ 4. 树冠（池塘近景树叶片卡做法） ============================
  // 带弧度的叶片卡（池塘 cardGeo：4×4 分段，z = 0.2(x²+y²) - 0.05y）；板块里用 2×2 分段控制三角形数
  function cuppedCard(seg) {
    const g = new THREE.PlaneGeometry(1, 1, seg, seg);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i); p.setZ(i, 0.2 * (x * x + y * y) - 0.05 * y); }
    g.computeVertexNormals();
    return g;
  }
  // 树冠风格：在原型的枝干上，按池塘近景树的密度重新撒叶片卡（更多、更小，梢部成簇、外层更密）
  // sp: zone-flora 树种；tips: growTree 返回的梢点；返回 [{m, c}] 叶片卡
  const CROWN = {
    // 常绿阔叶（香樟 / 桂花型）：圆整的厚树冠，外层浓密
    broadleaf: { mul: 2.4, size: 0.6, spread: 1.0, up: 0.8 },
    // 银杏型：分层、向上，小扇形叶簇
    ginkgo: { mul: 2.2, size: 0.58, spread: 0.85, up: 1.0 },
    // 枫树（鸡爪槭）型：池塘红枫——梢部 7 张一簇、0.42–0.62 米小卡、偏水平的叶面
    maple: { mul: 2.6, size: 0.55, spread: 0.75, up: 1.6, flat: true },
    // 樱花 / 紫薇：与枫树相同的小卡簇
    small: { mul: 2.2, size: 0.62, spread: 0.85, up: 1.2 },
  };
  function fineCards(sp, tips, rand, rr, randDir, tint) {
    const C = sp.cards, S = CROWN[sp.crown || "broadleaf"] || CROWN.broadleaf;
    const out = [], bloom = [];
    const per = Math.round(C.per * S.mul);
    for (const t of tips) {
      for (let i = 0; i < per; i++) {
        // 外层更密：半径分布偏向外缘（池塘树冠外层浓、内层透光）
        const r = C.spread[0] + (C.spread[1] - C.spread[0]) * Math.pow(rand(), 0.6);
        const d = randDir();
        const p = t.p.clone().add(d.clone().multiplyScalar(r * S.spread));
        const n = S.flat ? new V3(rr(-0.6, 0.6), S.up, rr(-0.6, 0.6)) : d.add(new V3(0, S.up, 0));
        const size = rr(C.size[0], C.size[1]) * S.size;
        const c = tint().multiplyScalar(S.bright || 1.12);   // 池塘树冠更亮（层次靠 SSAO 与透光，而不是整体压暗）
        out.push({ p, n, size, c });
        if (sp.blossom && i % 3 === 0) bloom.push({ p: p.clone().add(randDir().multiplyScalar(0.08)), n: randDir().add(new V3(0, C.up, 0)), size: size * 1.05 });
      }
    }
    return { cards: out, bloom };
  }

  // 新树种参数（zone-flora 的 SPECIES 格式）：枫树（鸡爪槭）与竹（刚竹 / 慈竹丛）。参数取自池塘近景红枫与竹丛。
  const EXTRA_SPECIES = [
    { id: "maple", name: "红枫", h: 5.2, decid: 1, evergreen: false, leaf: "maple", tint: [0.95, 0.72, 0.6], transl: 0.45, seed: 808, bark: "bark", crown: "maple", autumnRed: true,
      grow: (h) => ({ len: h * 0.4, rad: 0.08 + h * 0.022, depth: 4, children: [5, 3, 3, 2], childStart: [0.45, 0.3, 0.35, 0.4], spread: [0.95, 0.85, 0.7, 0.6], upBias: [0.25, 0.1, 0.05, 0.1],
        lenDecay: 0.62, radDecay: 0.62, wiggle: [0.12, 0.25, 0.3, 0.35], gravity: [0.02, -0.06, -0.08, -0.05] }), cards: { per: 3, spread: [0.12, 0.5], size: [0.8, 1.1], up: 1.6 } },
    { id: "bamboo", name: "竹", h: 7.5, decid: 0, evergreen: true, leaf: "bamboo", tint: [0.8, 0.95, 0.68], transl: 0.55, seed: 909, bark: "bamboo", bamboo: true },
  ];
  // 竹丛原型：一丛 9–13 根带节的竹竿（taperTube）+ 上部分层的竹叶卡
  function bambooPrototype(sp, addCard, rr, rand) {
    const cards = [], bark = [];
    const n = 11;
    for (let i = 0; i < n; i++) {
      const a = rand() * 6.283, r = Math.sqrt(rand()) * 0.9, h = sp.h * rr(0.75, 1.1);
      const lean = new V3(Math.cos(a), 0, Math.sin(a)).multiplyScalar(rr(0.05, 0.22));
      const base = new V3(Math.cos(a) * r, -0.2, Math.sin(a) * r);
      const top = base.clone().add(new V3(lean.x * h, h, lean.z * h));
      const mid = base.clone().lerp(top, 0.55).add(new V3(lean.x * 0.6, 0, lean.z * 0.6));
      bark.push(taperTube(new THREE.CatmullRomCurve3([base, mid, top]), 12, 6, rr(0.035, 0.055), 0.015, 3.0));
      for (let y = 0.45; y < 1.0; y += 0.06) {
        const p = base.clone().lerp(top, y);
        for (let k = 0; k < 3; k++) {
          const d = new V3(rr(-1, 1), rr(-0.2, 0.4), rr(-1, 1)).normalize();
          addCard(cards, p.clone().add(d.clone().multiplyScalar(rr(0.15, 0.6) * (1.2 - y))), new V3(d.x, 0.5, d.z), rr(0.5, 0.75),
            new THREE.Color().setRGB(sp.tint[0] * rr(0.85, 1.1), sp.tint[1] * rr(0.9, 1.08), sp.tint[2] * rr(0.85, 1.1)));
        }
      }
    }
    return { cards, bark, bloom: [], h: sp.h * 1.1 };
  }
  // 竹竿贴图：带节的竹绿色（与池塘 bambooCulmTex 同思路）
  function bambooCulmSet() {
    if (TEX.bambooCulm) return TEX.bambooCulm;
    const cv = makeCanvas(64, 256), g = cv.getContext("2d");
    const grd = g.createLinearGradient(0, 0, 64, 0); grd.addColorStop(0, "#4c6a2a"); grd.addColorStop(0.45, "#7d9a46"); grd.addColorStop(1, "#3f5a22");
    g.fillStyle = grd; g.fillRect(0, 0, 64, 256);
    for (let y = 0; y < 256; y += 64) { g.fillStyle = "rgba(230,230,180,0.55)"; g.fillRect(0, y, 64, 3); g.fillStyle = "rgba(30,40,15,0.5)"; g.fillRect(0, y + 3, 64, 2); }
    TEX.bambooCulm = { map: canvasTex(cv, true), normalMap: TEX.bark.normalMap };
    return TEX.bambooCulm;
  }

  // 画质档 → 细节参数
  function detail(q) {
    return {
      fineTrees: q !== "eco",                     // 省电档：原来的大叶片卡（三角形少）
      a2c: q === "clear",                          // 叶片 alpha-to-coverage（清晰档有 MSAA）
      cupped: q === "clear",                       // 带弧度叶片卡（三角形 ×4）只在清晰档
      grass: q === "clear" ? 14000 : q === "smooth" ? 5000 : 0,
      ssao: q === "clear",
    };
  }

  global.PondLook = { createPost, LAWN_PARS, LAWN_MAP, LAWN_NORMAL, lawnUniforms, grassField, cuppedCard, fineCards, CROWN, EXTRA_SPECIES, bambooPrototype, bambooCulmSet, detail };
})(window);
