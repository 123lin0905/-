/*
 * 池塘板块 · 动植物增删适配层（第三阶段试点）
 * ------------------------------------------------------------------
 * 把通用编辑器 js/species-editor.js 接到池塘场景：注册物种目录（复用池塘原有生成函数，画风一致）、
 * 放置规则（水生只能在水里、乔木只能在岸上…）、原有个体（垂柳 / 荷花 / 睡莲 / 锦鲤），以及动物的入场 / 离场动画。
 * 场景全部建完（pond:full 事件）后才创建编辑器；右侧“池塘生态”面板出现“✏️ 管理动植物”。
 * 依赖 pond-main.js 的全局：THREE、scene、camera、renderer、WORLD、KOI、FROG、TURTLE、DRAGON、PondEdit、sdf、ground、
 * terrainHeight、WATER_Y、LAYER、setLayer、seasonal、physical、TEX、addDrop、spawnSplash、splashAt、bubbleBurst、VIEWS、goToView。
 */
(function () {
  "use strict";
  const Q = new URLSearchParams(location.search);
  const ZONE = (window.CAMPUS_POND && window.CAMPUS_POND.zone) || "cuihu_water";
  const API = Q.get("speciesApi") || "../../api/zones/";
  let editor = null;
  // 板块配置（zones.json）：editable=false 的板块不开放编辑；catalog 为该板块可增删的物种 key 列表
  let zoneCfg = null;
  const cfgReady = fetch("../data/zones.json").then((r) => r.json()).then((j) => { zoneCfg = (j.zones || []).find((z) => z.id === ZONE) || null; }).catch(() => null);

  // 植被在首帧后分帧补上：补完（pond:full）之前，“管理动植物”按钮先置灰并提示“生态加载中”
  function placeholder() {
    const panel = document.getElementById("cp-eco");
    if (!panel) return false;
    if (document.getElementById("se-wait") || editor) return true;
    const b = document.createElement("button"); b.type = "button"; b.id = "se-wait"; b.disabled = true;
    b.textContent = "✏️ 管理动植物 · 生态加载中…"; b.title = "植被还在后台补种，补完后即可增删 / 移植动植物";
    b.style.cssText = "margin:2px 0 6px;padding:6px 10px;border-radius:9px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.06);color:#cfdcd4;font:600 12px/1.2 inherit;opacity:.6;cursor:progress";
    panel.insertBefore(b, document.getElementById("cp-eco-body"));
    return true;
  }
  if (!window.__pondFull) { const iv = setInterval(() => { if (placeholder() || window.__pondFull) clearInterval(iv); }, 300); }

  function start() {
    if (editor || !window.SpeciesEditor || typeof PondEdit === "undefined") return;
    cfgReady.then(startEditor);
  }
  function startEditor() {
    if (editor) return;
    const wait = document.getElementById("se-wait");
    if (zoneCfg && zoneCfg.editable === false) { if (wait) wait.remove(); return; }
    const V3 = THREE.Vector3, rnd = (a, b) => a + (b - a) * Math.random();
    const inGarden = (x, z) => Math.abs(x) < 8.6 && z > -11.5 && z < 8.6;
    const nearBridge = (x, z, r) => window.CAMPUS_POND.bridge && Math.abs(z - BRIDGE.z) < 0.9 + r && Math.abs(x) < BRIDGE.half + 0.6;
    const nearPavilion = (x, z, r) => Math.hypot(x - PAVILION.x, z - PAVILION.z) < PAVILION.r + 0.5 + r;
    const isWaterEntry = (e) => !!(e && e.water);

    // ---------------- 生成：菖蒲 / 再力花 / 芦苇（池塘原有的花菖蒲叶形、叶片材质，新写的株型） ----------------
    const M = {};
    function mats() {
      if (M.ready) return M;
      M.iris = physical({ map: TEX.iris, side: THREE.DoubleSide, roughness: 0.6, sheen: 0.4, sheenRoughness: 0.5, sheenColor: new THREE.Color(0xb0c070), envMapIntensity: 0.6 },
        { key: "se_iris", leaf: true, decid: 0.7, wind: "local", windWeight: "pow(clamp(position.y / 1.0, 0.0, 1.0), 1.6)", uniforms: { uTransl: { value: 0.35 } } });
      M.irisPetal = physical({ map: TEX.irisPetal, side: THREE.DoubleSide, roughness: 0.5, sheen: 0.6, sheenColor: new THREE.Color(0xe8dcff) }, { key: "se_irispetal", leaf: true, uniforms: { uTransl: { value: 0.7 } } });
      M.thaliaLeaf = physical({ color: 0x5d8a46, side: THREE.DoubleSide, roughness: 0.45, sheen: 0.6, sheenColor: new THREE.Color(0xcfe8b0), envMapIntensity: 0.8 }, { key: "se_thalia", leaf: true, decid: 0.4, uniforms: { uTransl: { value: 0.4 } } });
      M.thaliaStem = physical({ color: 0x6f8f52, roughness: 0.55 }, { key: "se_thaliastem" });
      M.thaliaFlower = physical({ color: 0x6b3f9e, roughness: 0.5, sheen: 0.5, sheenColor: new THREE.Color(0xd8c0ff) }, { key: "se_thaliafl", leaf: true, uniforms: { uTransl: { value: 0.5 } } });
      M.reed = physical({ map: TEX.blade, color: 0xd8dcb0, side: THREE.DoubleSide, roughness: 0.65, sheen: 0.3, sheenColor: new THREE.Color(0xd0c890) },
        { key: "se_reed", leaf: true, decid: 0.6, wind: "local", windWeight: "pow(clamp(position.y / 2.2, 0.0, 1.0), 1.4)", uniforms: { uTransl: { value: 0.3 } } });
      M.plume = physical({ color: 0xb79d78, side: THREE.DoubleSide, roughness: 0.8, sheen: 0.8, sheenColor: new THREE.Color(0xf3e3c4), transparent: true, opacity: 0.92, depthWrite: false },
        { key: "se_plume", leaf: true, wind: "local", windWeight: "pow(clamp(position.y / 2.2, 0.0, 1.0), 1.2)", uniforms: { uTransl: { value: 0.6 } } });
      M.ready = true; return M;
    }
    function swordLeaf(h, w) {        // 剑形叶：平行叶缘、中脉龙骨、末端收尖并外弯（与池塘花菖蒲同一造型）
      const segs = 10, pos = [], uv = [], idx = [];
      for (let i = 0; i <= segs; i++) {
        const t = i / segs, y = h * t * (1 - 0.1 * t * t), x = 0.16 * h * Math.pow(t, 2.2), wd = w * (0.75 + 0.25 * Math.min(1, t / 0.12)) * (1 - Math.max(0, (t - 0.62) / 0.38)) + 0.0008, keel = 0.0035 * (1 - t);
        pos.push(x, y, -wd / 2, x - keel, y, 0, x, y, wd / 2); uv.push(0, t, 0.5, t, 1, t);
      }
      for (let i = 0; i < segs; i++) { const a = i * 3; idx.push(a, a + 3, a + 1, a + 1, a + 3, a + 4, a + 1, a + 4, a + 2, a + 2, a + 4, a + 5); }
      const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
      return g;
    }
    function bladeClump(geo, mat, n, spread, hRange, floorY) {
      const im = new THREE.InstancedMesh(geo, mat, n), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new V3(), p = new V3();
      for (let i = 0; i < n; i++) {
        const a = Math.random() * 6.28, r = Math.sqrt(Math.random()) * spread;
        p.set(Math.cos(a) * r, floorY, Math.sin(a) * r); e.set(rnd(-0.12, 0.12), Math.random() * 6.28, rnd(-0.12, 0.12), "YXZ"); q.setFromEuler(e);
        const hs = rnd(hRange[0], hRange[1]); s.set(1, hs, 1); m4.compose(p, q, s); im.setMatrixAt(i, m4);
        im.setColorAt(i, new THREE.Color().setRGB(rnd(0.88, 1.04), rnd(0.9, 1.05), rnd(0.86, 1.0)));
      }
      im.castShadow = im.receiveShadow = true; im.computeBoundingSphere(); return im;
    }
    function makeIris() {              // 菖蒲：浅水剑叶丛 + 几枝紫花
      const K = mats(), g = new THREE.Group();
      g.add(bladeClump(swordLeaf(1.0, 0.024), K.iris, 22, 0.12, [0.75, 1.1], -0.28));
      for (let k = 0; k < 3; k++) {
        const fl = new THREE.Group(), a = Math.random() * 6.28, r = rnd(0.03, 0.1), h = rnd(0.72, 0.95);
        const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.004, h + 0.28, 5).translate(0, (h - 0.28) / 2, 0), K.thaliaStem); fl.add(stalk);
        for (let p = 0; p < 3; p++) {
          const pg = new THREE.PlaneGeometry(0.05, 0.07); pg.translate(0, 0.035, 0); pg.rotateX(-0.9);
          const pm = new THREE.Mesh(pg, K.irisPetal); pm.position.y = h; pm.rotation.y = (p / 3) * Math.PI * 2; fl.add(pm);
        }
        fl.position.set(Math.cos(a) * r, 0, Math.sin(a) * r); g.add(fl); seasonal(fl, "SR");
      }
      setLayer(g, LAYER.BOTH); seasonal(g, "SRA"); g.userData.height = 1; return g;
    }
    function ovateLeaf(L, W) {         // 再力花：长卵形大叶，中脉微折
      const seg = 12, pos = [], uv = [], idx = [];
      for (let i = 0; i <= seg; i++) {
        const t = i / seg, w = W * Math.sin(Math.PI * Math.pow(t, 0.8)) * 0.5, y = L * t, fold = 0.012 * Math.sin(Math.PI * t);
        pos.push(-w, y, fold, 0, y, 0, w, y, fold); uv.push(0, t, 0.5, t, 1, t);
      }
      for (let i = 0; i < seg; i++) { const a = i * 3; idx.push(a, a + 3, a + 1, a + 1, a + 3, a + 4, a + 1, a + 4, a + 2, a + 2, a + 4, a + 5); }
      const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
      return g;
    }
    function makeThalia() {            // 再力花：高挑叶柄托着卵形大叶，细长花葶顶端垂挂紫色小花
      const K = mats(), g = new THREE.Group();
      const n = 7;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + rnd(-0.3, 0.3), lean = rnd(0.12, 0.3), H = rnd(0.95, 1.4);
        const top = new V3(Math.cos(a) * lean * H * 0.5, H, Math.sin(a) * lean * H * 0.5);
        const stem = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new V3(0, -0.3, 0), top.clone().multiplyScalar(0.5).setY(H * 0.5), top]), 8, 0.007, 5), K.thaliaStem);
        stem.castShadow = true; g.add(stem);
        const leaf = new THREE.Mesh(ovateLeaf(rnd(0.38, 0.5), rnd(0.16, 0.22)), K.thaliaLeaf); leaf.castShadow = true;
        leaf.position.copy(top); leaf.rotation.set(rnd(-1.1, -0.6), a + Math.PI / 2, 0, "YXZ"); g.add(leaf);
      }
      for (let k = 0; k < 2; k++) {
        const H = rnd(1.6, 2.0), a = Math.random() * 6.28, top = new V3(Math.cos(a) * 0.12, H, Math.sin(a) * 0.12);
        g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new V3(0, -0.3, 0), new V3(top.x * 0.4, H * 0.55, top.z * 0.4), top]), 10, 0.0045, 5), K.thaliaStem));
        const fl = new THREE.Group(); fl.position.copy(top);
        for (let j = 0; j < 14; j++) {
          const t = j / 13, b = new THREE.Mesh(new THREE.SphereGeometry(rnd(0.012, 0.018), 8, 6), K.thaliaFlower);
          b.position.set(Math.cos(j * 2.1) * 0.04 * t + rnd(-0.01, 0.01), -0.02 - t * 0.16 + Math.sin(j) * 0.01, Math.sin(j * 2.1) * 0.04 * t); b.scale.set(1, 1.4, 1); fl.add(b);
        }
        g.add(fl); seasonal(fl, "SRA");
      }
      setLayer(g, LAYER.BOTH); seasonal(g, "SRA"); g.userData.height = 1.8; return g;
    }
    function reedBlade(h) {
      const segs = 8, pos = [], uv = [], idx = [];
      for (let i = 0; i <= segs; i++) { const t = i / segs, y = h * t, x = 0.08 * h * t * t, wd = 0.012 * (1 - 0.7 * t) + 0.002; pos.push(x, y, -wd / 2, x, y, wd / 2); uv.push(0, t, 1, t); }
      for (let i = 0; i < segs; i++) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
      const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
      return g;
    }
    function makeReed() {              // 芦苇：成丛的细长秆叶，顶端浅褐色羽状花序
      const K = mats(), g = new THREE.Group();
      g.add(bladeClump(reedBlade(2.0), K.reed, 34, 0.22, [0.75, 1.15], -0.15));
      const plumeGeo = new THREE.ConeGeometry(0.035, 0.32, 6, 1, true); plumeGeo.translate(0, -0.16, 0); plumeGeo.rotateX(Math.PI);
      for (let k = 0; k < 9; k++) {
        const a = Math.random() * 6.28, r = Math.sqrt(Math.random()) * 0.18, H = rnd(1.75, 2.3);
        const culm = new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.005, H + 0.15, 5).translate(0, (H - 0.15) / 2, 0), K.reed);
        culm.position.set(Math.cos(a) * r, 0, Math.sin(a) * r); culm.rotation.set(rnd(-0.08, 0.08), 0, rnd(-0.08, 0.08)); g.add(culm);
        const pl = new THREE.Mesh(plumeGeo, K.plume); pl.position.set(culm.position.x, H, culm.position.z); pl.rotation.set(rnd(0.2, 0.6), Math.random() * 6, 0); g.add(pl);
        seasonal(pl, "RA");
      }
      setLayer(g, LAYER.ABOVE); seasonal(g, "SRAW"); g.userData.height = 2.2; return g;
    }

    // ---------------- 动物：克隆场景里的青蛙 / 乌龟 / 蜻蜓（共用材质与几何），编辑器驱动入场 / 离场与待机动作 ----------------
    function cloneFrog() { if (!FROG.root) return null; const r = FROG.root.clone(); r.position.set(0, 0, 0); r.rotation.set(0, 0, 0); r.scale.setScalar(1.15); r.userData.height = 0.06; return r; }
    function cloneTurtle() { if (!TURTLE.root) return null; const r = TURTLE.root.clone(); r.position.set(0, 0, 0); r.rotation.set(0, 0, 0); r.visible = true; r.userData.height = 0.1; return r; }
    function cloneDragonfly() {
      const D = DRAGON.list && DRAGON.list[0]; if (!D) return null;
      const src = [], dst = [];
      D.root.traverse((x) => src.push(x));
      const r = D.root.clone(); r.traverse((x) => dst.push(x));
      const wings = D.wings.map((w) => ({ hinge: dst[src.indexOf(w.hinge)], s: w.s, hind: w.hind }));
      r.position.set(0, 0, 0); r.rotation.set(0, 0, 0); r.visible = true; r.userData.wings = wings; r.userData.height = 0.05;
      return r;
    }
    const groundOrWater = (x, z) => Math.max(terrainHeight(x, z), WATER_Y);
    function padAt(x, z) { return (WORLD.lilies || []).find((L) => Math.hypot(L.x - x, L.z - z) < L.r * 0.9) || null; }
    function hopTo(ind, x1, z1, dur, done, api, fade) {      // 青蛙：抛物线跳跃
      const o = ind.obj, x0 = o.position.x, z0 = o.position.z, y0 = o.position.y, y1 = groundOrWater(x1, z1) + (padAt(x1, z1) ? 0.008 : 0), S = ind.scale || 1;
      o.rotation.y = Math.atan2(-(z1 - z0), x1 - x0);
      return api.helpers.play({ dur, update: (t) => {
        const k = api.helpers.ease(t);
        o.position.set(x0 + (x1 - x0) * k, y0 + (y1 - y0) * k + Math.sin(Math.PI * t) * (0.25 + 0.2 * Math.hypot(x1 - x0, z1 - z0)), z0 + (z1 - z0) * k);
        o.rotation.z = (0.5 - t) * 0.8;
        const st = Math.sin(Math.PI * t); o.scale.set(1.15 * S * (1 + 0.15 * st), 1.15 * S * (1 - 0.08 * st), 1.15 * S);
        if (fade) o.scale.multiplyScalar(1 - api.helpers.ease(Math.max(0, (t - 0.7) / 0.3)));
      }, end: () => {
        o.position.set(x1, y1, z1); o.rotation.z = 0; o.scale.setScalar(fade ? 0.0001 : 1.15 * S);
        if (y1 <= WATER_Y + 0.02 && !padAt(x1, z1)) { addDrop(x1, z1, 0.12, -0.012); spawnSplash(x1, z1, 0.35, WATER_Y, true); api.helpers.ringRipple(x1, WATER_Y, z1, 0.05, 0.45, 1.2); }
        else if (padAt(x1, z1)) { const L = padAt(x1, z1); L.dipT = 0; addDrop(x1, z1, 0.1, -0.006); }
        done && done();
      } });
    }
    function crawl(ind, x0, z0, x1, z1, dur, done, api, fadeOut) {   // 乌龟：慢慢爬，身体左右摆、上下轻点
      const o = ind.obj, S = ind.scale || 1, yaw = Math.atan2(-(z1 - z0), x1 - x0);
      o.rotation.set(0, yaw, 0);
      return api.helpers.play({ dur, update: (t) => {
        const k = api.helpers.ease(t), x = x0 + (x1 - x0) * k, z = z0 + (z1 - z0) * k;
        const gy = terrainHeight(x, z), under = gy < WATER_Y - 0.05;
        o.position.set(x, (under ? Math.max(gy + 0.02, WATER_Y - 0.08) : gy) + Math.abs(Math.sin(t * 20)) * 0.006, z);
        o.rotation.set(Math.sin(t * 20) * 0.05, yaw + Math.sin(t * 10) * 0.08, 0);
        const sc = fadeOut ? 1 - api.helpers.ease(Math.max(0, (t - 0.6) / 0.4)) : Math.min(1, t * 4);
        o.scale.setScalar(Math.max(0.0001, S * sc));
        if (under && Math.random() < 0.08) addDrop(x, z, 0.06, -0.003);
      }, end: () => { o.position.set(x1, Math.max(terrainHeight(x1, z1), WATER_Y - 0.08), z1); o.rotation.set(0, yaw, 0); o.scale.setScalar(fadeOut ? 0.0001 : S); done && done(); } });
    }
    function flyPath(ind, p0, p1, dur, done, api, fadeOut) {     // 蜻蜓：曲线飞行 + 振翅
      const o = ind.obj, S = ind.scale || 1, mid = p0.clone().lerp(p1, 0.5).add(new V3(rnd(-0.6, 0.6), 0.5, rnd(-0.6, 0.6))), cur = new THREE.QuadraticBezierCurve3(p0, mid, p1);
      return api.helpers.play({ dur, update: (t) => {
        const k = api.helpers.ease(t), p = cur.getPoint(k), tg = cur.getTangent(Math.min(0.999, k + 0.001));
        o.position.copy(p); o.rotation.set(0, Math.atan2(-tg.z, tg.x), 0, "YZX");
        flap(o, performance.now() / 1000, true);
        o.scale.setScalar(Math.max(0.0001, S * (fadeOut ? 1 - api.helpers.ease(Math.max(0, (t - 0.6) / 0.4)) : Math.min(1, t * 3))));
      }, end: () => { o.position.copy(p1); o.scale.setScalar(fadeOut ? 0.0001 : S); done && done(); } });
    }
    function flap(o, t, flying) {
      for (const w of o.userData.wings || []) {
        const a = flying ? 0.18 + 0.75 * Math.sin(t * 2 * Math.PI * 27 + (w.hind ? 1.6 : 0)) : -0.03;
        if (w.hinge) w.hinge.rotation.set(-w.s * a, 0, 0, "XYZ");
      }
    }

    // ---------------- 锦鲤（实例化：用 vis 淡入 / 下潜淡出） ----------------
    function koiFish(ind) { return ind.fish || (ind.fish = KOI.fish[ind.index]); }
    const koiEntry = {
      key: "koi", name: "锦鲤", type: "animal", icon: "🐟", water: true, radius: 0.35, hitRadius: 0.35, previewH: 0.3, rule: "只能放在较深的水里",
      desc: "红白、大正三色、昭和、黄金等品种，放入时入水溅起水花",
      center: (ind, v) => { const f = koiFish(ind); return f ? v.copy(f.p) : v.set(ind.x, WATER_Y, ind.z); },
      spawn(ind, instant) {
        if (ind.fish && ind.fish.gone === false) return;
        const slot = ind.index != null && KOI.fish[ind.index] && KOI.fish[ind.index].gone ? ind.index : PondEdit.koiFreeSlot();
        if (slot < 0) return;
        ind.index = slot; ind.fish = PondEdit.koiActivate(slot, ind.x, ind.z);
        if (instant) ind.fish.vis = 1;
      },
      despawn(ind) { const f = koiFish(ind); if (f) { f.gone = true; f.vis = 0; } },
      moveTo(ind, x, z) { const f = koiFish(ind); if (f) { f.p.x = x; f.p.z = z; } },
      enter(ind, done, api) {
        const f = koiFish(ind); if (!f) { done(); return null; }
        const x = ind.x, z = ind.z;
        f.vis = 0; f.p.set(x, WATER_Y - 0.05, z);
        spawnSplash(x, z, 0.8, WATER_Y); splashAt(x, WATER_Y, z, 0.6); addDrop(x, z, 0.2, -0.02); bubbleBurst(x, WATER_Y - 0.03, z, 18, 0.05, 0.0006, 0.004, 0.3);
        api.helpers.ringRipple(x, WATER_Y, z, 0.08, 0.9, 1.8);
        return api.helpers.play({ dur: 1.8, update: (t) => { f.vis = Math.min(1, t * 2.2); if (t < 0.5) f.p.y = Math.min(f.p.y, WATER_Y - 0.05 - t * 0.4); }, end: () => { f.vis = 1; done(); } });
      },
      exit(ind, done, api) {
        const f = koiFish(ind); if (!f) { done(); return null; }
        const pd = f.prefDepth; f.prefDepth = 1.2;
        return api.helpers.play({ dur: 2.4, update: (t) => { f.vis = 1 - api.helpers.ease(t); f.p.y -= 0.004; }, end: () => { f.prefDepth = pd; f.vis = 0; f.gone = true; done(); } });
      },
      transplant(ind, x1, z1, done, api) {      // 用抄网捞起 → 放到新位置
        const f = koiFish(ind); if (!f) { done(); return null; }
        const x0 = f.p.x, z0 = f.p.z;
        addDrop(x0, z0, 0.15, -0.012); spawnSplash(x0, z0, 0.5, WATER_Y, true);
        let moved = false;
        return api.helpers.play({ dur: 2.2, update: (t) => {
          if (t < 0.4) f.vis = 1 - t / 0.4;
          else { if (!moved) { moved = true; f.p.set(x1, WATER_Y - 0.06, z1); spawnSplash(x1, z1, 0.6, WATER_Y); addDrop(x1, z1, 0.18, -0.016); api.helpers.ringRipple(x1, WATER_Y, z1, 0.08, 0.7, 1.4); } f.vis = Math.min(1, (t - 0.4) / 0.4); }
        }, end: () => { if (!moved) f.p.set(x1, WATER_Y - 0.06, z1); f.vis = 1; done(); } });
      },
    };

    // ---------------- 浮叶：睡莲（由池塘的 updatePondLife 随水面起伏漂动；动画期间暂时接管） ----------------
    const lilyEntry = {
      key: "waterlily", name: "睡莲", type: "plant", icon: "🪷", water: true, anim: "floating", radius: 0.28, hitY: 0.02, rule: "只能放在水面上",
      desc: "浮叶植物，叶片平铺水面，夏季开白色、粉色花",
      spawn(ind, instant) {
        if (!ind.lily) { ind.lily = PondEdit.makeLilyPad(ind.x, ind.z); }
        ind.obj = ind.lily.mesh; ind.obj.scale.setScalar(ind.scale || 1);
        if (!ind.obj.parent) scene.add(ind.obj);
        if (instant) attachLily(ind);
        else ind.obj.position.set(ind.x, WATER_Y, ind.z);
      },
      despawn(ind) { detachLily(ind); if (ind.obj && ind.obj.parent) ind.obj.parent.remove(ind.obj); },
      moveTo(ind, x, z) { if (ind.lily) { ind.lily.x = x; ind.lily.z = z; } },
      enter(ind, done, api) {
        detachLily(ind); const o = ind.obj, S = ind.scale || 1, x = ind.x, z = ind.z;
        o.position.set(x, WATER_Y - 0.25, z); o.scale.setScalar(S * 0.3);
        api.helpers.ringRipple(x, WATER_Y, z, 0.06, 0.8, 1.8); addDrop(x, z, 0.16, -0.01);
        let r2 = false;
        return api.helpers.play({ dur: 2.0, update: (t) => {
          o.position.y = WATER_Y - 0.25 * (1 - api.helpers.ease(Math.min(1, t / 0.6))) + 0.002; o.scale.setScalar(S * (0.3 + 0.7 * api.helpers.easeOutBack(Math.max(0, (t - 0.15) / 0.85))));
          if (!r2 && t > 0.55) { r2 = true; addDrop(x, z, 0.2, -0.008); api.helpers.ringRipple(x, WATER_Y, z, 0.15, 0.6, 1.2); }
        }, end: () => { o.scale.setScalar(S); attachLily(ind); done(); } });
      },
      exit(ind, done, api) {
        detachLily(ind); const o = ind.obj, S = o.scale.x, x = o.position.x, z = o.position.z, y0 = o.position.y;
        api.helpers.ringRipple(x, WATER_Y, z, 0.1, 0.7, 1.6); addDrop(x, z, 0.16, -0.01);
        return api.helpers.play({ dur: 1.8, update: (t) => { o.position.y = y0 - 0.3 * api.helpers.ease(t); o.scale.setScalar(S * (1 - 0.95 * api.helpers.ease(Math.max(0, (t - 0.2) / 0.8)))); }, end: () => { o.scale.setScalar(S); done(); } });
      },
      transplant(ind, x1, z1, done, api) {      // 浮叶顺着水面漂过去，一路带出涟漪
        detachLily(ind); const o = ind.obj, x0 = o.position.x, z0 = o.position.z;
        let last = 0;
        return api.helpers.play({ dur: 2.4, update: (t) => {
          const k = api.helpers.ease(t), x = x0 + (x1 - x0) * k, z = z0 + (z1 - z0) * k;
          o.position.set(x, WATER_Y + 0.002 + Math.sin(t * 9) * 0.004, z); o.rotation.y += 0.004;
          if (t - last > 0.08) { last = t; addDrop(x, z, 0.08, -0.004); }
        }, end: () => { ind.lily.x = x1; ind.lily.z = z1; api.helpers.ringRipple(x1, WATER_Y, z1, 0.1, 0.5, 1.0); attachLily(ind); done(); } });
      },
    };
    function attachLily(ind) { if (ind.lily && WORLD.lilies.indexOf(ind.lily) < 0) { ind.lily.x = ind.x; ind.lily.z = ind.z; WORLD.lilies.push(ind.lily); } }
    function detachLily(ind) { const i = ind.lily ? WORLD.lilies.indexOf(ind.lily) : -1; if (i >= 0) WORLD.lilies.splice(i, 1); }

    // ---------------- 物种目录 ----------------
    const catalog = [
      { key: "lotus", name: "荷花", type: "plant", icon: "🌸", water: true, anim: "aquatic", radius: 0.38, hitY: 0.35, rule: "只能种在水里（离岸 0.3 米以上）", desc: "挺水植物，荷叶高出水面，夏季开粉红色花",
        make: (ind) => PondEdit.makeLotus(ind.x, ind.z) },
      lilyEntry,
      { key: "iris", name: "菖蒲", type: "plant", icon: "🌱", water: true, anim: "aquatic", radius: 0.3, hitY: 0.45, rule: "只能种在岸边浅水里", desc: "浅水剑叶丛，初夏抽出紫色花",
        make: () => makeIris() },
      { key: "thalia", name: "再力花", type: "plant", icon: "💜", water: true, anim: "aquatic", radius: 0.42, hitY: 0.8, rule: "只能种在岸边浅水里", desc: "挺水植物，卵形大叶，细长花葶顶端垂挂紫色花序",
        make: () => makeThalia() },
      { key: "reed", name: "芦苇", type: "plant", icon: "🌾", water: false, anim: "shrub", radius: 0.32, hitY: 1.0, rule: "只能种在水岸交界处", desc: "成丛生长于水岸，秋季顶端抽出浅褐色羽状花序",
        make: () => makeReed(), plantDur: 2.4 },
      { key: "willow", name: "垂柳", type: "plant", icon: "🌳", anim: "tree", radius: 1.25, hitY: 2.2, hitRadius: 1.3, scaleRange: [0.85, 1.05], rule: "乔木只能种在岸上（离水 0.9 米以上）", desc: "细长柳条低垂水面，春季飞絮",
        make: (ind) => PondEdit.makeWillow(ind.x, ind.z), plantDur: 3.0, moveDur: 3.0 },
      { key: "camphor", name: "香樟", type: "plant", icon: "🌲", anim: "tree", radius: 1.1, hitY: 2.0, hitRadius: 1.2, scaleRange: [0.85, 1.05], rule: "乔木只能种在岸上（离水 1.1 米以上）", desc: "四季常绿，树冠圆整，校园行道树",
        make: (ind) => PondEdit.makeCamphor(ind.x, ind.z), plantDur: 3.0, moveDur: 3.0 },
      { key: "osmanthus", name: "桂花", type: "plant", icon: "🌼", anim: "tree", radius: 0.7, hitY: 1.0, scaleRange: [0.9, 1.1], rule: "只能种在岸上", desc: "常绿小乔木，秋季满树金黄小花，香气浓郁",
        make: (ind) => PondEdit.makeOsmanthus(ind.x, ind.z), plantDur: 2.6 },
      koiEntry,
      { key: "frog", name: "青蛙", type: "animal", icon: "🐸", radius: 0.12, hitRadius: 0.12, hitY: 0.03, previewH: 0.2, rule: "放在岸边或睡莲叶上", desc: "黑斑侧褶蛙，跳进来、跳走",
        make: () => cloneFrog() || new THREE.Group(),
        enter(ind, done, api) {
          const a = Math.atan2(ind.z, ind.x) + rnd(-0.6, 0.6), x0 = ind.x + Math.cos(a) * 1.0, z0 = ind.z + Math.sin(a) * 1.0;
          ind.obj.position.set(x0, groundOrWater(x0, z0), z0); ind.obj.scale.setScalar(0.0001);
          return hopTo(ind, ind.x, ind.z, 1.6, done, api);
        },
        exit(ind, done, api) {
          let bx = ind.x, bz = ind.z; for (let k = 0; k < 12; k++) { const a = Math.random() * 6.28, x = ind.x + Math.cos(a) * 0.9, z = ind.z + Math.sin(a) * 0.9; if (sdf(x, z) < -0.3) { bx = x; bz = z; break; } }
          return hopTo(ind, bx, bz, 1.5, done, api, true);
        },
        transplant(ind, x1, z1, done, api) { return hopTo(ind, x1, z1, 1.8, done, api); },
        idle(ind, dt) { const o = ind.obj; if (!o) return; ind._t = (ind._t || Math.random() * 6) + dt; const S = (ind.scale || 1) * 1.15; o.scale.set(S, S * (1 + 0.03 * Math.sin(ind._t * 5)), S); } },
      { key: "turtle", name: "乌龟", type: "animal", icon: "🐢", radius: 0.2, hitRadius: 0.18, hitY: 0.05, previewH: 0.25, rule: "放在岸边或浅水里", desc: "中华草龟，慢慢爬进来、爬走",
        make: () => cloneTurtle() || new THREE.Group(),
        enter(ind, done, api) { const a = Math.atan2(ind.z, ind.x), x0 = ind.x + Math.cos(a) * 0.9, z0 = ind.z + Math.sin(a) * 0.9; return crawl(ind, x0, z0, ind.x, ind.z, 2.8, done, api); },
        exit(ind, done, api) { const a = Math.atan2(ind.z, ind.x) + Math.PI, x1 = ind.x + Math.cos(a) * 0.8, z1 = ind.z + Math.sin(a) * 0.8; return crawl(ind, ind.x, ind.z, x1, z1, 2.6, done, api, true); },
        transplant(ind, x1, z1, done, api) { return crawl(ind, ind.x, ind.z, x1, z1, 3.0, done, api); } },
      { key: "dragonfly", name: "蜻蜓", type: "animal", icon: "🪰", radius: 0.15, hitRadius: 0.2, hitY: 0.5, previewH: 0.6, rule: "在池塘上空或岸边飞", desc: "红蜻蜓、碧伟蜓，飞进来悬停，再飞走",
        make: () => cloneDragonfly() || new THREE.Group(),
        center: (ind, v) => v.copy(ind.obj ? ind.obj.position : new V3(ind.x, WATER_Y + 0.5, ind.z)),
        enter(ind, done, api) { const p1 = new V3(ind.x, groundOrWater(ind.x, ind.z) + 0.5, ind.z), p0 = p1.clone().add(new V3(rnd(-3, 3), 2.2, rnd(-3, 3))); ind.obj.position.copy(p0); return flyPath(ind, p0, p1, 2.2, done, api); },
        exit(ind, done, api) { const p0 = ind.obj.position.clone(), p1 = p0.clone().add(new V3(rnd(-3, 3), 2.6, rnd(-3, 3))); return flyPath(ind, p0, p1, 2.0, done, api, true); },
        transplant(ind, x1, z1, done, api) { const p0 = ind.obj.position.clone(), p1 = new V3(x1, groundOrWater(x1, z1) + 0.5, z1); return flyPath(ind, p0, p1, 2.0, done, api); },
        idle(ind, dt) { const o = ind.obj; if (!o) return; ind._t = (ind._t || Math.random() * 6) + dt; o.position.y = groundOrWater(ind.x, ind.z) + 0.5 + Math.sin(ind._t * 1.7) * 0.05; o.rotation.y += Math.sin(ind._t * 0.6) * 0.004; flap(o, performance.now() / 1000, true); } },
    ];

    const allowed = zoneCfg && Array.isArray(zoneCfg.catalog) ? zoneCfg.catalog : null;
    const zoneCatalog = allowed ? catalog.filter((c) => allowed.indexOf(c.key) >= 0) : catalog;
    // 原有个体所属物种即使不在 catalog 里也要能识别（只是不能新增）
    for (const c of catalog) if (zoneCatalog.indexOf(c) < 0 && ["willow", "lotus", "waterlily", "koi"].indexOf(c.key) >= 0) zoneCatalog.push(Object.assign({}, c, { hidden: true }));

    // ---------------- 放置规则 ----------------
    // 场景原有的静态占位（树、灌木、竹林、花境…，WORLD.occ）；可移植的垂柳登记为个体，由编辑器自己按个体间距检查
    const staticOcc = (WORLD.occ || []).filter(([ox, oz]) => !(WORLD.willows || []).some(([wx, wz]) => Math.abs(wx - ox) < 1e-6 && Math.abs(wz - oz) < 1e-6));
    function staticHit(x, z, r) { return staticOcc.find(([ox, oz, or]) => Math.hypot(x - ox, z - oz) < or + r) || null; }
    function canPlace(e, x, z) {
      if (!inGarden(x, z)) return { ok: false, reason: "超出池塘庭院范围" };
      const d = sdf(x, z), r = e.radius || 0.3;
      if (nearPavilion(x, z, r * 0.5)) return { ok: false, reason: "太靠近小亭" };
      if (nearBridge(x, z, r * 0.5)) return { ok: false, reason: "挡住石桥" };
      if (typeof nearWaterfall === "function" && nearWaterfall(x, z, 0.6 + r * 0.5)) return { ok: false, reason: "太靠近跌水" };
      if (e.type === "plant" && !e.water) {
        const hit = staticHit(x, z, r * 0.6);
        if (hit) return { ok: false, reason: "这里已有原有的树木或花境，换个空地吧" };
      }
      switch (e.key) {
        case "lotus": return d < -0.3 && d > -2.8 ? { ok: true } : { ok: false, reason: d >= -0.3 ? "荷花是挺水植物，要种在水里" : "水太深" };
        case "waterlily": return d < -0.35 ? { ok: true } : { ok: false, reason: "睡莲只能浮在水面上" };
        case "iris": case "thalia": return d < -0.04 && d > -0.9 ? { ok: true } : { ok: false, reason: d >= -0.04 ? "要种在岸边浅水里" : "这里水太深，应种在岸边浅水" };
        case "reed": return d > -0.45 && d < 0.6 ? { ok: true } : { ok: false, reason: d <= -0.45 ? "芦苇要种在水岸交界处" : "离水太远，芦苇要种在水岸交界处" };
        case "willow": return d > 0.9 && d < 7 ? { ok: true } : { ok: false, reason: d <= 0.9 ? "乔木只能种在岸上（离水至少 0.9 米）" : "离水太远" };
        case "camphor": return d > 1.1 && d < 8 ? { ok: true } : { ok: false, reason: d <= 1.1 ? "乔木只能种在岸上（离水至少 1.1 米）" : "离水太远" };
        case "osmanthus": return d > 0.6 && d < 8 ? { ok: true } : { ok: false, reason: "桂花只能种在岸上" };
        case "koi": {
          if (d > -0.6) return { ok: false, reason: "锦鲤要放在较深的水里" };
          if (PondEdit.koiFreeSlot() < 0) return { ok: false, reason: "本池锦鲤已达上限 " + KOI.fish.length + " 条" };
          return { ok: true };
        }
        case "frog": return (d > -0.15 && d < 1.2) || padAt(x, z) ? { ok: true } : { ok: false, reason: "青蛙要放在岸边或睡莲叶上" };
        case "turtle": return d > -0.6 && d < 1.6 ? { ok: true } : { ok: false, reason: "乌龟要放在岸边或浅水里" };
        case "dragonfly": return d < 2.5 ? { ok: true } : { ok: false, reason: "蜻蜓只在池塘附近活动" };
      }
      return { ok: true };
    }
    // 射线与地面 / 水面的交点（沿射线步进 + 二分）
    function pick(rc) {
      const o = rc.ray.origin, dv = rc.ray.direction, p = new V3();
      const h = (q) => q.y - Math.max(terrainHeight(q.x, q.z), WATER_Y);
      let t0 = 0, step = 0.08;
      p.copy(o); if (h(p) < 0) return null;
      for (let t = step; t < 80; t += step) {
        p.copy(o).addScaledVector(dv, t);
        if (h(p) <= 0) {
          let a = t0, b = t;
          for (let i = 0; i < 16; i++) { const m = (a + b) / 2; p.copy(o).addScaledVector(dv, m); if (h(p) > 0) a = m; else b = m; }
          p.copy(o).addScaledVector(dv, b);
          return { x: p.x, y: Math.max(terrainHeight(p.x, p.z), WATER_Y), z: p.z, water: terrainHeight(p.x, p.z) < WATER_Y };
        }
        t0 = t; step = Math.min(0.5, step * 1.06);
      }
      return null;
    }
    function surfaceY(x, z, e) {
      if (e && (e.water || e.anim === "aquatic" || e.anim === "floating")) return WATER_Y;
      if (e && e.key === "dragonfly") return groundOrWater(x, z);
      if (e && (e.key === "frog" || e.key === "turtle")) return groundOrWater(x, z) + (padAt(x, z) ? 0.008 : 0);
      return Math.max(ground(x, z), e && e.key === "reed" ? WATER_Y : -10);
    }

    // ---------------- 原有个体（场景本来就有的垂柳 / 荷花 / 睡莲 / 锦鲤） ----------------
    const seeds = PondEdit.seeds().map((s) => {
      const o = s.obj, d = { ref: s.ref, key: s.key, obj: o, x: o ? o.position.x : 0, z: o ? o.position.z : 0, rot: o ? o.rotation.y : 0, scale: 1 };
      if (s.key === "waterlily") { d.lily = s.lily; d.x = s.lily.x; d.z = s.lily.z; }
      if (s.key === "koi") { d.fish = s.fish; d.index = s.index; d.x = s.fish.p.x; d.z = s.fish.p.z; d.obj = null; }
      return d;
    });

    editor = window.SpeciesEditor.create({
      zoneId: ZONE, zoneName: window.CAMPUS_POND.zoneName, apiBase: API, storageKey: "pond-species-demo:" + ZONE,
      THREE, scene, camera, dom: renderer.domElement, catalog: zoneCatalog, seeds, canPlace, pick, surfaceY, layer: LAYER.ABOVE,
      hooks: {
        ripple: (x, z, r0, r1) => addDrop(x, z, Math.min(0.25, 0.08 + r1 * 0.15), -0.01),
        splash: (x, z, e) => { spawnSplash(x, z, e, WATER_Y, true); bubbleBurst(x, WATER_Y - 0.02, z, 8, 0.03, 0.0005, 0.003, 0.2); },
        onToggle: (on) => {
          document.body.classList.toggle("se-editing", on);
          if (on) {
            VIEWS["管理动植物 · 俯瞰"] = () => [new V3(0.6, 6.8, 9.8), new V3(-0.2, 0, -0.8)];
            if (P.holdCamera) setHold(false);
            goToView("管理动植物 · 俯瞰");
          }
        },
      },
      onCounts: (c) => {
        // 右侧清单实时数量：垂柳 / 荷叶 / 睡莲 / 锦鲤的原有个体都登记在编辑器里，显示总数“×N”；
        // 其余物种场景里原有的是成片装饰（如花菖蒲丛），只显示编辑器新增的数量“＋N”
        const seedKeys = { willow: 1, lotus: 1, waterlily: 1, koi: 1 }, added = {};
        for (const ind of editor ? editor.inds : []) if (!ind.seed && ind.status === "active") added[ind.key] = (added[ind.key] || 0) + 1;
        document.querySelectorAll(".cp-sp[data-id]").forEach((b) => {
          const k = b.getAttribute("data-id");
          if (!editor || !(k in editor.byKey)) return;
          let tag = b.querySelector(".cp-sp-n"); if (!tag) { tag = document.createElement("i"); tag.className = "cp-sp-n"; b.querySelector("b").appendChild(tag); }
          tag.textContent = seedKeys[k] ? " ×" + (c[k] || 0) : added[k] ? " ＋" + added[k] : "";
        });
      },
    });
    const panel = document.getElementById("cp-eco");
    const host = document.createElement("div"); host.className = "cp-se-host"; panel.insertBefore(host, document.getElementById("cp-eco-body"));
    if (wait) wait.remove();
    editor.buildUI(host);
    window.__se = editor;
    editor.load().then((n) => { window.__seLoaded = true; window.__seRows = n; }).catch((e) => { console.warn(e); window.__seLoaded = true; });

    // 动画时钟：正常按真实时间推进；自动化测试可设 window.__seManual = true 后用 __se.update(dt) 手动推进
    let last = performance.now();
    (function loop(now) {
      requestAnimationFrame(loop);
      const dt = Math.min(0.1, (now - last) / 1000); last = now;
      if (!window.__seManual) editor.update(dt);
    })(last);
    // 物种清单加载晚于编辑器时补一次数量
    setTimeout(() => editor && editor.counts && editor.update(0), 1500);
  }
  if (window.__pondFull) start();
  else document.addEventListener("pond:full", start);
})();
