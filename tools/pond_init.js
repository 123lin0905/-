/* ------------------------------------------------------------------ 校园版：渐进式加载（由 tools/build_pond.py 插入 pond-main.js） */
const PONDT = (window.__pondT = window.__pondT || []);
const pmark = (m) => PONDT.push([performance.now(), m]);
pmark('main-script-eval');
const PHASE2 = { done: false, n: 0, total: __PHASE2_TOTAL__, stage: null, chip: null, label: '' };
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
  // 逐个挂进场景：Object3D.add 收到多个参数时会回调 this.add（此时仍是暂存版 scene.add），那样对象会被塞回暂存组而永远进不了场景
  for (const o of g.children.slice()) THREE.Object3D.prototype.add.call(scene, o);
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
