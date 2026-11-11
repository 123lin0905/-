/*
 * 校园全景 · 池塘画风渲染层（EcoLook）
 * ------------------------------------------------------------------------------
 * 与池塘细节场景（pond/pond.html）共用同一套：
 *   - Preetham 天空 + 程序化云层 + 星月夜空（SKY_VS / SKY_FS，pond-style-core.js）
 *   - 天空立方体 → PMREM 环境光照（IBL），与池塘 updateEnv() 相同做法
 *   - 太阳 / 月光 / 半球光模型 pondSunLight()、天气预设 pondWeatherPreset()、夜晚雾色 pondNightFog()（pond-style.js）
 *   - ACES 电影色调映射 + 曝光（PONDSTYLE_TONEMAP_GLSL，与池塘合成 pass 同一公式；“流畅”档用 three 内置 ACESFilmic，数学上等价）
 *   - 材质补丁：世界坐标、风动 windOffset、积雪/湿润/秋色 WEATHER_ALBEDO / WEATHER_ROUGH、叶片透光 LEAF_POST_LIGHTS
 * 全景尺度（公里级）下的取舍：雾密度按距离换算；不做焦散 / 折射；水面只做平面反射（“清晰”档）+ 菲涅尔 + 涟漪法线。
 * 性能：阴影相机只罩住观察点附近；“流畅”档关闭后期、平面反射，阴影贴图减半，像素比 ≤ 1。
 */
(function (global) {
  "use strict";
  const THREE = global.THREE;

  // ---------------- 共享 uniform（所有补丁材质引用同一对象） ----------------
  const U = {
    uTime: { value: 0 }, uWindDir: { value: new THREE.Vector2(1, 0) }, uWind: { value: 0.35 }, uGust: { value: 0 },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunColor: { value: new THREE.Color() },
    uSnowCover: { value: 0 }, uWet: { value: 0 }, uAutumn: { value: 0 }, uWaterY: { value: -50 },
  };
  const VS_PARS = /* glsl */`
uniform float uTime;
uniform vec2 uWindDir;
uniform float uWind;
uniform float uGust;
varying vec3 vUwPos;
varying vec3 vWNrm;
${PONDSTYLE_WIND_GLSL}
`;
  const FS_PARS = /* glsl */`
uniform float uTime;
uniform float uWaterY;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uSnowCover;
uniform float uWet;
uniform float uAutumn;
varying vec3 vUwPos;
varying vec3 vWNrm;
float wxh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float wxn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(wxh(i), wxh(i + vec2(1, 0)), f.x), mix(wxh(i + vec2(0, 1)), wxh(i + vec2(1, 1)), f.x), f.y); }
`;
  // 公告板（远处树木 impostor）：绕竖轴朝向相机；阴影 pass 里 cameraPosition 是光源相机，正好朝向太阳投出完整树影
  const BILLBOARD = /* glsl */`
      vec3 bbC = instanceMatrix[3].xyz;
      float bbSx = length(instanceMatrix[0].xyz), bbSy = length(instanceMatrix[1].xyz);
      vec3 bbTo = cameraPosition - bbC; bbTo.y = 0.0; bbTo = length(bbTo) > 1e-3 ? normalize(bbTo) : vec3(0.0, 0.0, 1.0);
      vec3 bbR = normalize(cross(vec3(0.0, 1.0, 0.0), bbTo));
      vec4 wPos4 = vec4(bbC + bbR * transformed.x * bbSx + vec3(0.0, transformed.y * bbSy, 0.0) + bbTo * transformed.z * bbSx, 1.0);
      wPos4 = modelMatrix * wPos4;`;
  // 叶片卡在远处取到低级 mipmap 时 alpha 被平均稀释，alphaTest 会把叶子整片丢掉（全景距离远，比池塘严重得多）：
  // 按 mip 级别放大 alpha，保持覆盖率（Ben Golus 的 alpha-to-coverage 技巧）
  const ALPHA_MIP = (size) => /* glsl */`
#ifdef USE_MAP
{ vec2 amx = dFdx(vMapUv * ${size.toFixed(1)}), amy = dFdy(vMapUv * ${size.toFixed(1)});
  float amLod = max(0.0, 0.5 * log2(max(dot(amx, amx), dot(amy, amy))));
  diffuseColor.a *= 1.0 + amLod * 0.32; }
#endif
`;
  const PROJECT = (o) => /* glsl */`
      ${o.billboard ? BILLBOARD : `
      vec4 wPos4 = vec4(transformed, 1.0);
      #ifdef USE_INSTANCING
        wPos4 = instanceMatrix * wPos4;
      #endif
      wPos4 = modelMatrix * wPos4;`}
      #ifdef WIND
        wPos4.xyz += windOffset(wPos4.xyz, ${o.windWeight || "1.0"});
      #endif
      vUwPos = wPos4.xyz;
      vec3 wN = objectNormal;
      #ifdef USE_INSTANCING
        wN = mat3(instanceMatrix) * wN;
      #endif
      vWNrm = normalize(mat3(modelMatrix) * wN);
      ${o.billboard ? "vWNrm = normalize(bbTo + vec3(0.0, 0.9, 0.0)); vNormal = normalize((viewMatrix * vec4(vWNrm, 0.0)).xyz);" : ""}
      vec4 mvPosition = viewMatrix * wPos4;
      gl_Position = projectionMatrix * mvPosition;`;
  /**
   * o: { key, wind:bool, windWeight:glsl, leaf:bool, transl, decid, noWeather, macro:{scale, amp}, plinth:bool,
   *      billboard:bool, uniforms, fsMap (glsl after map_fragment), fsPars }
   */
  function patch(mat, o) {
    o = o || {};
    const Uo = Object.assign({}, o.uniforms || {});
    if (o.leaf) { Uo.uTransl = { value: o.transl != null ? o.transl : 0.35 }; Uo.uDecid = { value: o.decid || 0 }; }
    mat.userData.uniforms = Uo;
    mat.customProgramCacheKey = () => "cl-" + o.key;
    mat.onBeforeCompile = (sh) => {
      for (const k of Object.keys(U)) sh.uniforms[k] = U[k];
      Object.assign(sh.uniforms, Uo);
      const defs = (o.wind ? "#define WIND\n" : "") + (o.leaf ? "#define LEAFMAT\n" : "");
      let vs = sh.vertexShader, fs = sh.fragmentShader;
      vs = vs.replace("#include <common>", defs + "#include <common>\n" + VS_PARS);
      vs = vs.replace("#include <project_vertex>", PROJECT(o));
      fs = fs.replace("#include <common>", defs + "#include <common>\n" + FS_PARS + (o.leaf ? "uniform float uTransl;\nuniform float uDecid;\n" : "") + (o.fsPars || ""));
      let mapX = "";
      if (o.alphaMip) mapX += ALPHA_MIP(o.alphaMip);
      if (o.macro) mapX += `diffuseColor.rgb *= mix(${(1 - o.macro.amp).toFixed(3)}, ${(1 + o.macro.amp * 0.6).toFixed(3)}, wxn(vUwPos.xz * ${o.macro.scale.toFixed(4)}) * 0.65 + wxn(vUwPos.xz * ${(o.macro.scale * 4.3).toFixed(4)}) * 0.35);\n`;
      if (o.plinth) mapX += "diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.16, 0.155, 0.15), 1.0 - smoothstep(0.75, 0.85, vUwPos.y));\n";   // 勒脚：灰色石材
      if (o.fsMap) mapX += o.fsMap;
      if (mapX) fs = fs.replace("#include <map_fragment>", "#include <map_fragment>\n" + mapX);
      if (!o.noWeather) {
        fs = fs.replace("#include <roughnessmap_fragment>", WEATHER_ALBEDO + "#include <roughnessmap_fragment>");
        fs = fs.replace("#include <metalnessmap_fragment>", WEATHER_ROUGH + "#include <metalnessmap_fragment>");
      }
      if (o.leaf) fs = fs.replace("#include <lights_fragment_end>", "#include <lights_fragment_end>\n" + LEAF_POST_LIGHTS);
      if (o.fsPostLights) fs = fs.replace("#include <lights_fragment_end>", "#include <lights_fragment_end>\n" + o.fsPostLights);
      if (o.fsAfterMaps) fs = fs.replace("#include <lights_fragment_maps>", "#include <lights_fragment_maps>\n" + o.fsAfterMaps);
      if (o.fsNormal) fs = fs.replace("#include <normal_fragment_maps>", o.fsNormal);
      sh.vertexShader = vs; sh.fragmentShader = fs;
    };
    return mat;
  }
  // 投影用深度材质：重复同样的风动 / 公告板变形
  function depth(o, map, alphaTest) {
    o = o || {};
    const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: map || null, alphaTest: alphaTest || 0, side: THREE.DoubleSide });
    m.customProgramCacheKey = () => "cd-" + o.key;
    m.onBeforeCompile = (sh) => {
      for (const k of Object.keys(U)) sh.uniforms[k] = U[k];
      let vs = sh.vertexShader;
      vs = vs.replace("#include <common>", (o.wind ? "#define WIND\n" : "") + "#include <common>\n" + VS_PARS);
      vs = vs.replace("#include <project_vertex>", PROJECT(Object.assign({}, o, { billboardDepth: true })).replace("vNormal = normalize((viewMatrix * vec4(vWNrm, 0.0)).xyz);", ""));
      if (!/objectNormal/.test(sh.vertexShader.split("#include <project_vertex>")[0])) vs = vs.replace("vec3 wN = objectNormal;", "vec3 wN = vec3(0.0, 1.0, 0.0);");
      sh.vertexShader = vs;
      if (o.alphaMip) sh.fragmentShader = sh.fragmentShader.replace("#include <alphatest_fragment>", ALPHA_MIP(o.alphaMip) + "#include <alphatest_fragment>");
    };
    return m;
  }

  // ---------------- 创建 ----------------
  function create(opts) {
    const renderer = opts.renderer, scene = opts.scene, camera = opts.camera;
    const DEGR = Math.PI / 180;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;    // 渲染到后期目标时 three 自动不做色调映射，由合成 pass 做同一 ACES
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.shadowMap.autoUpdate = false;                   // 每帧只更新一次阴影（反射 pass 与主 pass 共用），与池塘相同
    MAX_ANISO = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    const CLIP_NONE = new THREE.Plane(new THREE.Vector3(0, 1, 0), 1e5);
    renderer.clippingPlanes = [CLIP_NONE];                  // 始终绑定一个裁剪面，反射 pass 换面时不重编译着色器

    // ---------- 天空（与池塘逐字相同的着色器；补上色调映射 / 色彩空间输出） ----------
    const skyU = {
      sunPosition: { value: new THREE.Vector3(0, 1, 0) },
      turbidity: { value: 2.0 }, rayleigh: { value: 2.1 }, mieCoefficient: { value: 0.003 }, mieDirectionalG: { value: 0.8 },
      up: { value: new THREE.Vector3(0, 1, 0) },
      uSkyScale: { value: 0.34 }, uSunDisk: { value: 1.0 }, uTime: U.uTime,
      uCloudCover: { value: 0.55 }, uCloudBright: { value: 1.0 }, uOvercast: { value: 0 }, uOvercastCol: { value: new THREE.Color(1, 1, 1) },
      uNight: { value: 0 }, uMoonDir: { value: new THREE.Vector3(-0.35, 0.72, -0.6).normalize() },
    };
    const skyFS = SKY_FS.replace(/gl_FragColor = vec4\( col, 1\.0 \);\s*\}\s*$/, "gl_FragColor = vec4( col, 1.0 );\n  #include <tonemapping_fragment>\n  #include <colorspace_fragment>\n}");
    if (skyFS === SKY_FS) console.warn("sky shader patch failed");
    const skyMat = new THREE.ShaderMaterial({ name: "Sky", uniforms: skyU, vertexShader: SKY_VS, fragmentShader: skyFS, side: THREE.BackSide, depthWrite: false, fog: false });
    const skyGeo = new THREE.BoxGeometry(1, 1, 1);
    const sky = new THREE.Mesh(skyGeo, skyMat);
    sky.scale.setScalar(2000); sky.frustumCulled = false; sky.renderOrder = -10;
    scene.add(sky);

    // ---------- 太阳 / 半球光 ----------
    const sun = new THREE.DirectionalLight(0xffffff, 3.2);
    sun.castShadow = true;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.35;
    Object.assign(sun.shadow.camera, { near: 10, far: 3000 });
    scene.add(sun, sun.target);
    const hemi = new THREE.HemisphereLight(0x9cc4ef, 0x4b5a2c, 0.28);
    scene.add(hemi);

    // ---------- 环境光照：天空立方体 → PMREM（与池塘 updateEnv 相同） ----------
    const cubeRT = new THREE.WebGLCubeRenderTarget(128, { type: THREE.HalfFloatType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
    const cubeCam = new THREE.CubeCamera(0.1, 5000, cubeRT);
    const skyScene = new THREE.Scene();
    { const s2 = new THREE.Mesh(skyGeo, skyMat); s2.scale.setScalar(2000); s2.frustumCulled = false; skyScene.add(s2); }
    const pmrem = new THREE.PMREMGenerator(renderer);
    let envRT = null, envDirty = true, envTimer = 0;
    function updateEnv() {
      const prevTM = renderer.toneMapping;
      skyU.uSunDisk.value = 0;
      cubeCam.update(renderer, skyScene);
      const rt = pmrem.fromCubemap(cubeRT.texture);
      if (envRT) envRT.dispose();
      envRT = rt; scene.environment = envRT.texture;
      skyU.uSunDisk.value = 1;
      renderer.toneMapping = prevTM;
      envDirty = false;
    }

    // ---------- 雾（全景尺度：池塘的雾密度按距离换算） ----------
    scene.fog = new THREE.FogExp2(0xa0b0c0, 0.0007);

    // ---------- 天气：与池塘相同的预设，4 秒平滑过渡 ----------
    const WXC = { cur: JSON.parse(JSON.stringify(WX_PRESETS.Sunny)), from: null, to: null, t: 1, key: "", label: "晴", letter: "S" };
    function setPreset(kind, season, immediate) {
      const key = kind + "|" + season;
      if (key === WXC.key && !immediate) return;
      WXC.key = key;
      const r = pondWeatherPreset(kind, season);
      WXC.label = r.label; WXC.letter = r.letter;
      if (immediate) { WXC.cur = JSON.parse(JSON.stringify(r.p)); WXC.t = 1; WXC.from = null; return; }
      WXC.from = JSON.parse(JSON.stringify(WXC.cur)); WXC.to = r.p; WXC.t = 0;
    }
    function stepPreset(dt) {
      if (WXC.t >= 1 || !WXC.from) return;
      WXC.t = Math.min(1, WXC.t + dt / 4);
      const k = smoothstep(0, 1, WXC.t), to = WXC.to;
      for (const key in to) {
        if (Array.isArray(to[key])) WXC.cur[key] = to[key].map((v, i) => lerp(WXC.from[key][i], v, k));
        else if (typeof to[key] === "number") WXC.cur[key] = lerp(WXC.from[key] != null ? WXC.from[key] : to[key], to[key], k);
      }
      envDirty = true;
    }

    // ---------- 画质档 ----------
    const Q = { mode: opts.quality || "clear" };
    let post = null, refl = null;
    function maxPR() { return Q.mode === "clear" ? Math.min(window.devicePixelRatio || 1, 2) : Math.min(window.devicePixelRatio || 1, 1); }
    function setQuality(mode) {
      Q.mode = mode;
      renderer.setPixelRatio(maxPR());
      const sm = mode === "clear" ? 2048 : 1024;
      sun.shadow.mapSize.set(sm, sm);
      if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
      resize();
      (opts.onQuality || (() => {}))(mode);
    }

    // ---------- 后期（清晰档）：HDR + MSAA → 泛光 → 曝光/调色/ACES/暗角 ----------
    const FS_QUAD = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    const FS_SCENE = new THREE.Scene(); FS_SCENE.add(FS_QUAD);
    const FS_CAM = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const PASS_VS = "varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }";
    const mkPass = (fs, uniforms) => new THREE.ShaderMaterial({ uniforms, vertexShader: PASS_VS, fragmentShader: fs, depthTest: false, depthWrite: false, toneMapped: false });
    const brightMat = mkPass(/* glsl */`
uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uExpo; uniform float uThr; varying vec2 vUv;
void main(){
  vec3 c = (texture2D(tSrc, vUv + uTexel * vec2(-1.0, -1.0)).rgb + texture2D(tSrc, vUv + uTexel * vec2(1.0, -1.0)).rgb
          + texture2D(tSrc, vUv + uTexel * vec2(-1.0, 1.0)).rgb + texture2D(tSrc, vUv + uTexel * vec2(1.0, 1.0)).rgb) * 0.25 * uExpo / 0.6;
  c = min(c, vec3(24.0));
  float br = max(c.r, max(c.g, c.b));
  gl_FragColor = vec4(c * smoothstep(uThr, uThr + 0.8, br), 1.0);
}`, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uExpo: { value: 1 }, uThr: { value: 0.95 } });
    const blurMat = mkPass(/* glsl */`
uniform sampler2D tSrc; uniform vec2 uDir; varying vec2 vUv;
void main(){
  vec3 c = texture2D(tSrc, vUv).rgb * 0.2270270270;
  c += (texture2D(tSrc, vUv + uDir * 1.3846153846).rgb + texture2D(tSrc, vUv - uDir * 1.3846153846).rgb) * 0.3162162162;
  c += (texture2D(tSrc, vUv + uDir * 3.2307692308).rgb + texture2D(tSrc, vUv - uDir * 3.2307692308).rgb) * 0.0702702703;
  gl_FragColor = vec4(c, 1.0);
}`, { tSrc: { value: null }, uDir: { value: new THREE.Vector2() } });
    const compMat = mkPass(/* glsl */`
// 与池塘合成 pass 相同：曝光 / 天气调色 / ACES 电影色调映射 / 0.95 饱和 / 暗角 / 细颗粒 / sRGB 输出
uniform sampler2D tColor; uniform sampler2D tBloom; uniform float uExposure; uniform float uBloom; uniform float uVignette; uniform float uGrain;
uniform float uTime; uniform float uAspect; uniform vec3 uGrade; varying vec2 vUv;
${PONDSTYLE_TONEMAP_GLSL}
float h12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
void main(){
  vec3 c = texture2D(tColor, vUv).rgb;
  c *= uExposure / 0.6;
  c += texture2D(tBloom, vUv).rgb * uBloom;
  c *= uGrade;
  c = acesFilmic(c);
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(l), c, 0.95);
  vec2 q = vUv - 0.5;
  c *= 1.0 - uVignette * smoothstep(0.2, 0.85, length(q * vec2(uAspect * 0.75, 1.0)) * 1.2);
  c = toSRGB(c);
  c += (h12(gl_FragCoord.xy + fract(uTime * 13.7) * 311.0) - 0.5) * uGrain * 2.0;
  gl_FragColor = vec4(c, 1.0);
}`, { tColor: { value: null }, tBloom: { value: null }, uExposure: { value: 0.9 }, uBloom: { value: 0.06 }, uVignette: { value: 0.32 }, uGrain: { value: 0.01 },
      uTime: U.uTime, uAspect: { value: 1 }, uGrade: { value: new THREE.Vector3(1.035, 1, 0.955) } });
    function fsPass(mat, target) { FS_QUAD.material = mat; renderer.setRenderTarget(target); renderer.render(FS_SCENE, FS_CAM); }
    function buildPost(w, h) {
      if (post) { post.main.dispose(); post.a.dispose(); post.b.dispose(); }
      const hf = { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false };
      const qw = Math.max(1, w >> 2), qh = Math.max(1, h >> 2);
      post = {
        main: new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: 4 }),
        a: new THREE.WebGLRenderTarget(qw, qh, hf), b: new THREE.WebGLRenderTarget(qw, qh, hf), w, h, qw, qh,
      };
    }

    // ---------- 水面平面反射（清晰档；全景尺度不做折射 / 焦散） ----------
    const reflCam = new THREE.PerspectiveCamera();
    const reflMatrix = new THREE.Matrix4();
    const WATER_LEVEL = opts.waterLevel != null ? opts.waterLevel : 0.35;
    const CLIP_ABOVE = new THREE.Plane(new THREE.Vector3(0, 1, 0), -(WATER_LEVEL - 0.3));
    const reflU = { tRefl: { value: null }, uReflMatrix: { value: reflMatrix }, uPlanar: { value: 0 } };
    const noReflect = [];
    const waters = [];
    const _cp = new THREE.Vector3(), _rp = new THREE.Vector3(), _rv = new THREE.Vector3(), _look = new THREE.Vector3(), _tgt = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0), _rm = new THREE.Matrix4();
    function mirrorCamera(cam, out) {   // 与池塘 mirrorCamera 相同
      _cp.setFromMatrixPosition(cam.matrixWorld);
      _rm.extractRotation(cam.matrixWorld);
      _rp.set(_cp.x, WATER_LEVEL, _cp.z);
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
    const _frustum = new THREE.Frustum(), _pm = new THREE.Matrix4(), _box = new THREE.Box3();
    function waterVisible() {
      _pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); _frustum.setFromProjectionMatrix(_pm);
      for (const w of waters) { if (!w.geometry.boundingBox) w.geometry.computeBoundingBox(); _box.copy(w.geometry.boundingBox).applyMatrix4(w.matrixWorld); if (_frustum.intersectsBox(_box)) return true; }
      return false;
    }
    function renderReflection() {
      if (!refl) {
        const w = Math.max(2, renderer.domElement.width >> 1), h = Math.max(2, renderer.domElement.height >> 1);
        refl = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType });
      }
      mirrorCamera(camera, reflCam);
      for (const o of waters) o.visible = false;
      for (const o of noReflect) o.userData._v = o.visible, o.visible = false;
      skyU.uSunDisk.value = 0;                              // 日面高光交给水面 GGX 直接光
      renderer.clippingPlanes = [CLIP_ABOVE];
      renderer.setRenderTarget(refl); renderer.setClearColor(0x000000, 1); renderer.clear();
      sky.position.copy(reflCam.position);
      renderer.render(scene, reflCam);
      renderer.clippingPlanes = [CLIP_NONE];
      skyU.uSunDisk.value = 1;
      for (const o of waters) o.visible = true;
      for (const o of noReflect) o.visible = o.userData._v;
      reflU.tRefl.value = refl.texture;
    }
    // 水面材质：MeshStandard（菲涅尔 + 天空 IBL）+ 两层滚动涟漪法线（池塘同款水面法线贴图）+ 雨点涟漪 + 平面反射
    function waterMaterial(o) {
      o = o || {};
      const mat = new THREE.MeshStandardMaterial({ color: o.color || 0x0e2a2a, roughness: 0.035, metalness: 0, envMapIntensity: 1.0 });
      const wu = { tWN: { value: TEX.waterNormal }, uRipple: { value: 0.35 }, uRainRip: { value: 0 }, uIce: { value: 0 }, uWScale: { value: o.scale || 0.07 } };
      mat.userData.water = wu;
      patch(mat, {
        key: "water" + (o.key || ""), noWeather: true,
        uniforms: Object.assign({}, reflU, wu),
        fsPars: /* glsl */`
uniform sampler2D tWN; uniform float uRipple; uniform float uRainRip; uniform float uIce; uniform float uWScale;
uniform sampler2D tRefl; uniform mat4 uReflMatrix; uniform float uPlanar;
vec3 wN3;
vec2 rainRing(vec2 p){                              // 雨点涟漪：随机格子里扩散的圆环
  vec2 acc = vec2(0.0);
  for (int k = 0; k < 2; k++) {
    vec2 q = p * (k == 0 ? 0.9 : 1.7) + float(k) * 7.3; vec2 i = floor(q), f = fract(q) - 0.5;
    float h = wxh(i + float(k) * 3.1); float t = fract(uTime * 0.9 + h);
    vec2 c = vec2(wxh(i + 1.7), wxh(i + 4.2)) - 0.5; vec2 d = f - c * 0.6; float r = length(d);
    float ring = sin((r - t * 0.45) * 60.0) * smoothstep(0.06, 0.0, abs(r - t * 0.45)) * (1.0 - t);
    acc += d / max(r, 1e-3) * ring;
  }
  return acc;
}`,
        fsNormal: /* glsl */`
{
  vec2 p = vUwPos.xz * uWScale;
  vec3 n1 = texture2D(tWN, p + vec2(uTime * 0.012, uTime * 0.007)).xyz * 2.0 - 1.0;
  vec3 n2 = texture2D(tWN, p * 2.7 - vec2(uTime * 0.017, -uTime * 0.021)).xyz * 2.0 - 1.0;
  vec2 g = (n1.xy * 0.6 + n2.xy * 0.4) * uRipple * (1.0 - 0.8 * uIce) + rainRing(vUwPos.xz * 0.9) * uRainRip * 0.35;
  wN3 = normalize(vec3(-g.x, 1.0, -g.y));
  normal = normalize((viewMatrix * vec4(wN3, 0.0)).xyz);
}`,
        fsMap: "diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.55, 0.6, 0.62), uIce * 0.55);\n",
        fsAfterMaps: /* glsl */`
#if defined( RE_IndirectSpecular )
if (uPlanar > 0.5) {
  vec4 rc = uReflMatrix * vec4(vUwPos, 1.0);
  vec2 ruv = rc.xy / rc.w + wN3.xz * 0.035;
  radiance = mix(radiance, texture2D(tRefl, ruv).rgb, 0.92 * (1.0 - uIce * 0.6));
}
#endif`,
      });
      return mat;
    }

    // ---------- 尺寸 ----------
    const size = { w: 1, h: 1 };
    function resize() {
      const el = renderer.domElement.parentElement || document.body;
      const w = el.clientWidth || window.innerWidth, h = el.clientHeight || window.innerHeight;
      if (!w || !h) return;
      size.w = w; size.h = h;
      renderer.setSize(w, h, false);
      camera.aspect = w / h; camera.updateProjectionMatrix();
      const bw = renderer.domElement.width, bh = renderer.domElement.height;
      if (Q.mode === "clear") buildPost(bw, bh); else if (post) { post.main.dispose(); post.a.dispose(); post.b.dispose(); post = null; }
      if (refl) { refl.dispose(); refl = null; }
    }

    // ---------- 每帧：环境 ----------
    const state = { night: 0, elev: 30, expo: 0.9, flash: 0, fogDensity: 0.0007, letter: "S", rainVis: 0 };
    const _d = new THREE.Vector3();
    /**
     * e: { elevDeg, dir:[x,y,z]（太阳方向，x 东 z 南）, night 0..1, kind, season, flash 0..1, windKmh }
     */
    function setEnvironment(e, dt) {
      setPreset(e.kind, e.season, !!e.immediate);
      stepPreset(dt || 0);
      const c = WXC.cur;
      // 太阳方向：真实方位（全景需要与建筑朝向一致的投影），高度角与池塘一样钳到 ≥0.6°
      const elev = Math.max(0.6, Math.min(70, e.elevDeg)) * DEGR;
      _d.set(e.dir[0], 0, e.dir[2]); if (_d.lengthSq() < 1e-6) _d.set(0.5, 0, 0.5); _d.normalize();
      _d.multiplyScalar(Math.cos(elev)); _d.y = Math.sin(elev); _d.normalize();
      const LIT = pondSunLight(_d, elev, e.night, c.sunMul, c.hemiMul, skyU.uMoonDir.value);
      sun.color.setRGB(LIT.color[0], LIT.color[1], LIT.color[2], THREE.SRGBColorSpace);
      sun.intensity = LIT.intensity + e.flash * 4;
      hemi.intensity = LIT.hemiIntensity + e.flash * 1.5; hemi.color.setRGB(...LIT.hemiColor);
      skyU.sunPosition.value.copy(LIT.dir);
      skyU.uNight.value = e.night;
      skyU.uCloudBright.value = LIT.cloudBrightK * c.cloudBright + e.flash * 1.5;
      skyU.uCloudCover.value = c.cloud; skyU.turbidity.value = c.turb; skyU.uSkyScale.value = c.skyScale;
      const fc = pondNightFog(c.fogCol, e.night);
      skyU.uOvercast.value = c.overcast; skyU.uOvercastCol.value.setRGB(fc[0] / c.skyScale, fc[1] / c.skyScale, fc[2] / c.skyScale);
      U.uSunDir.value.copy(LIT.dir);
      U.uSunColor.value.copy(sun.color).multiplyScalar(sun.intensity);
      U.uSnowCover.value = c.cover; U.uWet.value = c.wet; U.uAutumn.value = c.autumn;
      U.uWind.value = c.wind + Math.min(0.4, (e.windKmh || 8) / 60);
      // 雾：池塘的 fog 是每米密度（池塘约 30 米见方）；全景按 FogExp2 换算，晴天 800 米外约 6%、2 公里外约 30%
      state.fogDensity = 0.0003 * Math.sqrt(Math.max(c.fog, 0.002) / 0.004);
      scene.fog.density = state.fogDensity;
      scene.fog.color.setRGB(fc[0], fc[1], fc[2]);
      state.night = e.night; state.elev = LIT.elev / DEGR; state.expo = c.expo * LIT.expo * (1 + e.flash * 0.6);
      state.letter = WXC.letter; state.label = WXC.label; state.cur = c; state.flash = e.flash;
      compMat.uniforms.uGrade.value.set(c.grade[0], c.grade[1], c.grade[2]);
      for (const w of waters) {
        const wu = w.material.userData.water; if (!wu) continue;
        wu.uRipple.value = 0.22 + c.wind * 0.45; wu.uRainRip.value = c.rain; wu.uIce.value = c.ice;
      }
      if (Math.abs((state._lastElev || 0) - state.elev) > 0.15 || WXC.t < 1 || e.immediate || Math.abs((state._lastNight || 0) - e.night) > 0.01) {
        envDirty = true; state._lastElev = state.elev; state._lastNight = e.night;
      }
    }

    // ---------- 每帧：渲染 ----------
    const _sd = new THREE.Vector3();
    function render(dt, t, target) {
      U.uTime.value = t;
      U.uGust.value = clamp(0.5 + 0.9 * fbm3(t * 0.12, 3.3, 1.1, 3, 77), 0, 1);
      envTimer -= dt;
      if (envDirty && envTimer <= 0) { updateEnv(); envTimer = Q.mode === "clear" ? 0.5 : 1.5; }
      // 阴影只罩相机附近：正交阴影相机跟随观察点，范围随相机距离缩放
      const dist = camera.position.distanceTo(target);
      const half = clamp(dist * (Q.mode === "clear" ? 0.62 : 0.5), 60, Q.mode === "clear" ? 380 : 260);
      const sc = sun.shadow.camera;
      if (Math.abs(sc.right - half) > 1) { sc.left = -half; sc.right = half; sc.top = half; sc.bottom = -half; sc.updateProjectionMatrix(); }
      _sd.copy(U.uSunDir.value);
      // 阴影贴图纹素对齐，减少镜头移动时的闪烁
      const texel = (2 * half) / sun.shadow.mapSize.x;
      const tx = Math.round(target.x / texel) * texel, tz = Math.round(target.z / texel) * texel;
      sun.target.position.set(tx, 0, tz);
      sun.position.set(tx, 0, tz).addScaledVector(_sd, 1400);
      sun.target.updateMatrixWorld();
      sun.castShadow = sun.intensity > 0.25;
      sun.shadow.normalBias = 0.25 + texel * 0.9;
      sky.position.copy(camera.position);
      renderer.toneMappingExposure = state.expo;
      renderer.shadowMap.needsUpdate = true;
      // 平面反射（清晰档、且水面在画面里）
      reflU.uPlanar.value = 0;
      if (Q.mode === "clear" && waters.length && waterVisible()) { renderReflection(); reflU.uPlanar.value = 1; }
      sky.position.copy(camera.position);
      if (Q.mode === "clear" && post) {
        renderer.setRenderTarget(post.main); renderer.setClearColor(0x000000, 1); renderer.clear();
        renderer.render(scene, camera);
        brightMat.uniforms.tSrc.value = post.main.texture; brightMat.uniforms.uTexel.value.set(1 / post.w, 1 / post.h);
        brightMat.uniforms.uExpo.value = state.expo;
        fsPass(brightMat, post.a);
        blurMat.uniforms.tSrc.value = post.a.texture; blurMat.uniforms.uDir.value.set(1 / post.qw, 0); fsPass(blurMat, post.b);
        blurMat.uniforms.tSrc.value = post.b.texture; blurMat.uniforms.uDir.value.set(0, 1 / post.qh); fsPass(blurMat, post.a);
        compMat.uniforms.tColor.value = post.main.texture; compMat.uniforms.tBloom.value = post.a.texture;
        compMat.uniforms.uExposure.value = state.expo; compMat.uniforms.uAspect.value = post.w / post.h;
        fsPass(compMat, null);
      } else {
        renderer.setRenderTarget(null);
        renderer.render(scene, camera);
      }
    }

    setQuality(Q.mode);
    return {
      U, sky, skyU, sun, hemi, state, patch, depth, waterMaterial, waters, noReflect,
      setEnvironment, render, resize, setQuality, get quality() { return Q.mode; }, updateEnv, WATER_LEVEL,
    };
  }

  global.EcoLook = { create, U, patch, depth };
})(window);
