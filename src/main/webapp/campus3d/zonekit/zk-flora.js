/*
 * 板块细节场景工具包 · 植物（ZKFlora）
 * ------------------------------------------------------------------------------
 * 与池塘 / 全景同一套生长算法：pond-style-core.js 的 growTree 递归分枝 + addCard 叶片卡 + 树皮纹理，叶片材质走 campus-look.js 的
 * 补丁（叶片透光、风动、秋色、积雪）。树种：香樟、银杏、樱花、桂花、蓝花楹、女贞；灌木：灌木球、绿篱段、草花花丛。
 * 每一株都是一个不渲染的“代理”Object3D（编辑器的个体 obj），每帧把代理的世界矩阵写进按物种合批的 InstancedMesh：
 *   近处 = 真实分枝几何（树皮 + 叶片 [+ 花]），远处 = 预渲染公告板（impostor，常态 / 落叶 / 开花三张），每 0.25 秒按距离重分。
 * 这样原有个体与新增个体共用同一套绘制，栽种 / 移植 / 拔除动画（编辑器直接改代理的位置、缩放、旋转）也能实时反映。
 * 导出 window.ZKFlora.create(scene, { renderer, look }) -> { make(key), update(camera, dt), setSeason(season), setQuality(mode), defs }
 */
(function (global) {
  "use strict";
  const THREE = global.THREE;
  const V3 = THREE.Vector3;

  // 树种参数（与 eco-life.js 同一套 growTree 参数，按校园实际树高）
  const TREE_DEFS = {
    camphor: { name: "香樟", h: 11, decid: 0.12, evergreen: true, leaf: "green", tint: [0.66, 0.84, 0.56], transl: 0.3, seed: 101,
      grow: (h) => ({ len: h * 0.42, rad: 0.06 + h * 0.024, depth: 3, children: [6, 3, 3], childStart: [0.35, 0.3, 0.3], spread: [0.9, 0.85, 0.7], upBias: [0.38, 0.3, 0.25],
        lenDecay: 0.6, radDecay: 0.6, wiggle: [0.08, 0.25, 0.3], gravity: [0, 0.0, -0.03] }), cards: { per: 6, spread: [0.4, 1.7], size: [1.7, 2.4], up: 0.8 } },
    ginkgo: { name: "银杏", h: 12, decid: 1, evergreen: false, leaf: "green", tint: [0.95, 1.06, 0.6], transl: 0.4, seed: 303,
      grow: (h) => ({ len: h * 0.55, rad: 0.06 + h * 0.018, depth: 3, children: [8, 3, 2], childStart: [0.25, 0.3, 0.3], spread: [0.5, 0.55, 0.55], upBias: [0.72, 0.55, 0.45],
        lenDecay: 0.5, radDecay: 0.6, wiggle: [0.05, 0.18, 0.22], gravity: [0, 0.02, 0.0] }), cards: { per: 6, spread: [0.25, 1.1], size: [1.3, 1.8], up: 0.9 } },
    cherry: { name: "樱花", h: 6.5, decid: 1, evergreen: false, leaf: "green", blossom: "sakura", tint: [0.86, 1.0, 0.7], transl: 0.5, seed: 606, bark: "sakuraBark",
      grow: (h) => ({ len: h * 0.36, rad: 0.1 + h * 0.016, depth: 4, children: [5, 3, 3, 2], childStart: [0.55, 0.3, 0.3, 0.3], spread: [1.05, 0.85, 0.75, 0.6],
        upBias: [0.3, 0.18, 0.12, 0.1], lenDecay: 0.66, radDecay: 0.62, wiggle: [0.1, 0.25, 0.3, 0.35], gravity: [0.0, -0.03, -0.05, -0.06] }), cards: { per: 4, spread: [0.15, 0.6], size: [0.9, 1.25], up: 1.2 } },
    osmanthus: { name: "桂花", h: 5.5, decid: 0, evergreen: true, leaf: "shrub", tint: [0.62, 0.8, 0.55], transl: 0.25, seed: 202, autumnBloom: true,
      grow: (h) => ({ len: h * 0.34, rad: 0.05 + h * 0.02, depth: 3, children: [5, 3, 3], childStart: [0.3, 0.3, 0.3], spread: [1.0, 0.9, 0.8], upBias: [0.3, 0.2, 0.15],
        lenDecay: 0.66, radDecay: 0.62, wiggle: [0.1, 0.25, 0.3], gravity: [0, -0.02, -0.03] }), cards: { per: 7, spread: [0.2, 0.9], size: [1.0, 1.4], up: 0.7 } },
    jacaranda: { name: "蓝花楹", h: 9, decid: 0.85, evergreen: false, leaf: "green", blossom: "kikyo", blossomSeasons: ["spring", "summer"], tint: [0.74, 0.92, 0.62], transl: 0.55, seed: 717,
      grow: (h) => ({ len: h * 0.4, rad: 0.08 + h * 0.016, depth: 4, children: [5, 3, 3, 2], childStart: [0.5, 0.3, 0.3, 0.3], spread: [1.0, 0.85, 0.75, 0.6],
        upBias: [0.42, 0.25, 0.15, 0.1], lenDecay: 0.66, radDecay: 0.62, wiggle: [0.1, 0.22, 0.28, 0.3], gravity: [0.0, -0.02, -0.04, -0.05] }), cards: { per: 5, spread: [0.2, 0.9], size: [1.2, 1.6], up: 1.0 } },
    privet: { name: "女贞", h: 7, decid: 0, evergreen: true, leaf: "shrub", tint: [0.5, 0.7, 0.45], transl: 0.22, seed: 818,
      grow: (h) => ({ len: h * 0.36, rad: 0.06 + h * 0.02, depth: 3, children: [6, 3, 3], childStart: [0.35, 0.3, 0.3], spread: [0.85, 0.8, 0.7], upBias: [0.45, 0.3, 0.2],
        lenDecay: 0.62, radDecay: 0.62, wiggle: [0.08, 0.22, 0.28], gravity: [0, -0.01, -0.02] }), cards: { per: 8, spread: [0.2, 1.1], size: [1.1, 1.5], up: 0.8 } },
  };
  const SHRUB_DEFS = {
    shrub_ball: { name: "灌木球", kind: "ball", r: 0.75, leaf: "shrub", tint: [0.55, 0.78, 0.45], seed: 901, h: 1.3 },
    hedge: { name: "绿篱", kind: "hedge", len: 3.0, w: 0.9, hh: 1.0, leaf: "shrub", tint: [0.5, 0.74, 0.42], seed: 902, h: 1.1 },
    hedge_red: { name: "红叶石楠绿篱", kind: "hedge", len: 3.0, w: 0.9, hh: 0.9, leaf: "shrub", tint: [0.95, 0.42, 0.32], seed: 905, h: 1.0 },
    flowerbed: { name: "草花花丛", kind: "flower", r: 1.0, leaf: "shrub", tint: [0.6, 0.85, 0.5], seed: 903, h: 0.5 },
  };

  function cardGeo(e) {
    const g = new THREE.PlaneGeometry(1, 1, 1, 1);
    g.applyMatrix4(e.m);
    const n = g.attributes.position.count, c = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { c[i * 3] = e.c.r; c[i * 3 + 1] = e.c.g; c[i * 3 + 2] = e.c.b; }
    g.setAttribute("color", new THREE.BufferAttribute(c, 3));
    return g;
  }
  function treeProto(sp) {
    rng = mulberry32(sp.seed);
    const cards = [], bark = [], blooms = [];
    const tint = () => new THREE.Color().setRGB(sp.tint[0] * rr(0.85, 1.12), sp.tint[1] * rr(0.9, 1.1), sp.tint[2] * rr(0.85, 1.12));
    const g = sp.grow(sp.h);
    const nb = BARK.length;
    const tips = growTree(Object.assign({ base: new V3(0, -0.3, 0), dir: new V3(rr(-0.05, 0.05), 1, rr(-0.05, 0.05)).normalize() }, g));
    BARK.splice(nb);
    for (const b of tips.branches) {
      if (b.lvl > 2 || b.r0 < 0.025) continue;
      const seg = b.lvl === 0 ? [12, 10] : b.lvl === 1 ? [7, 6] : [4, 4];
      bark.push(taperTube(b.curve, seg[0], seg[1], b.r0, Math.max(b.r1, 0.02), 0.6));
    }
    const C = sp.cards;
    for (const t of tips) {
      for (let i = 0; i < C.per; i++) {
        const p = t.p.clone().add(randDir().multiplyScalar(rr(C.spread[0], C.spread[1])));
        addCard(cards, p, randDir().add(new V3(0, C.up, 0)), rr(C.size[0], C.size[1]), tint());
        if (sp.blossom && i % 2 === 0) addCard(blooms, p.clone().add(randDir().multiplyScalar(0.15)), randDir().add(new V3(0, C.up, 0)), rr(C.size[0], C.size[1]) * 0.85, new THREE.Color(1, 1, 1));
        if (sp.autumnBloom && i % 3 === 0) addCard(blooms, p.clone().add(randDir().multiplyScalar(0.1)), randDir().add(new V3(0, C.up, 0)), rr(0.5, 0.7), new THREE.Color(1.0, 0.82, 0.35));
      }
    }
    return { cards, bark, blooms };
  }
  function shrubProto(sd) {
    rng = mulberry32(sd.seed);
    const cards = [], blooms = [];
    const tint = () => new THREE.Color().setRGB(sd.tint[0] * rr(0.85, 1.15), sd.tint[1] * rr(0.9, 1.1), sd.tint[2] * rr(0.85, 1.15));
    if (sd.kind === "ball") {
      for (let i = 0; i < 90; i++) {
        const d = randDir(); d.y = Math.abs(d.y) * 0.9 + 0.1; d.normalize();
        const p = d.clone().multiplyScalar(sd.r * rr(0.75, 1.0)); p.y = p.y * 0.85 + sd.r * 0.55;
        addCard(cards, p, d, rr(0.42, 0.6), tint());
      }
    } else if (sd.kind === "hedge") {
      const L = sd.len, Wd = sd.w, Hh = sd.hh;
      for (let i = 0; i < 120; i++) {
        const face = rand();
        let p, n;
        if (face < 0.4) { p = new V3(rr(-L / 2, L / 2), Hh, rr(-Wd / 2, Wd / 2)); n = new V3(rr(-0.3, 0.3), 1, rr(-0.3, 0.3)); }
        else { const s = rand() < 0.5 ? -1 : 1; p = new V3(rr(-L / 2, L / 2), rr(0.15, Hh), s * Wd / 2); n = new V3(rr(-0.3, 0.3), rr(-0.2, 0.4), s); }
        addCard(cards, p, n, rr(0.42, 0.62), tint());
      }
    } else {   // 花丛：低矮叶丛 + 彩色花卡
      for (let i = 0; i < 40; i++) {
        const a = rand() * 6.28, r = Math.sqrt(rand()) * sd.r, p = new V3(Math.cos(a) * r, rr(0.12, 0.32), Math.sin(a) * r);
        addCard(cards, p, new V3(rr(-0.4, 0.4), 1, rr(-0.4, 0.4)), rr(0.35, 0.5), tint());
        if (i % 1 === 0) addCard(blooms, p.clone().add(new V3(0, 0.12, 0)), new V3(rr(-0.3, 0.3), 1, rr(-0.3, 0.3)), rr(0.3, 0.42), new THREE.Color().setHSL([0.0, 0.08, 0.83, 0.13, 0.95][i % 5], 0.75, 0.6));
      }
    }
    return { cards, blooms };
  }

  function create(scene, opts) {
    const renderer = opts.renderer, look = opts.look, patch = look.patch, depth = look.depth, U = look.U;
    const LEAF_TEX = { green: TEX.greenLeaves, shrub: TEX.shrubLeaves, sakura: leafCard("sakura"), kikyo: leafCard("kikyo"), bloom: TEX.bloomLeaves };
    const barkMat = patch(new THREE.MeshStandardMaterial({ map: TEX.bark.map, normalMap: TEX.bark.normalMap, normalScale: new THREE.Vector2(1.4, 1.4), roughness: 0.92, color: 0xb8aaa0, envMapIntensity: 0.6 }),
      { key: "zkbark", wind: true, windWeight: "clamp((wPos4.y - 3.0) * 0.02, 0.0, 0.25)" });
    const barkMat2 = TEX.sakuraBark ? patch(new THREE.MeshStandardMaterial({ map: TEX.sakuraBark.map, normalMap: TEX.sakuraBark.normalMap, roughness: 0.9, envMapIntensity: 0.6 }),
      { key: "zkbark", wind: true, windWeight: "clamp((wPos4.y - 3.0) * 0.02, 0.0, 0.25)" }) : barkMat;
    const leafMats = [];
    function leafMaterial(transl, decid, texKey) {
      const m = patch(new THREE.MeshStandardMaterial({ map: LEAF_TEX[texKey], alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.62, envMapIntensity: 0.55, vertexColors: true }),
        { key: "zkleaf", leaf: true, transl, decid, wind: true, windWeight: "clamp((wPos4.y - 0.8) * 0.06, 0.0, 1.0)", alphaMip: 512,
          fsMap: "diffuseColor.a *= smoothstep(0.2, 0.45, abs(dot(normalize(vNormal), normalize(vViewPosition))));\n" });
      leafMats.push(m);
      return m;
    }
    const leafDepth = (tex) => depth({ key: "zkleafd", wind: true, windWeight: "clamp((wPos4.y - 0.8) * 0.06, 0.0, 1.0)", alphaMip: 512 }, tex, 0.45);

    // impostor 采集
    const impScene = new THREE.Scene();
    impScene.add(new THREE.AmbientLight(0xffffff, Math.PI * 0.7));
    const impSun = new THREE.DirectionalLight(0xffffff, Math.PI * 0.3); impSun.position.set(0.2, 1, 0.3); impScene.add(impSun);
    const impCam = new THREE.OrthographicCamera(-1, 1, 1, -1, -100, 100);
    function renderImpostor(meshes, Wd, Hh) {
      const rt = new THREE.WebGLRenderTarget(256, 256, { generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter });
      rt.texture.colorSpace = THREE.SRGBColorSpace;
      impCam.left = -Wd / 2; impCam.right = Wd / 2; impCam.bottom = 0; impCam.top = Hh; impCam.position.set(0, 0, 50); impCam.lookAt(0, 0, 0); impCam.updateProjectionMatrix();
      meshes.forEach((m) => impScene.add(m));
      const prevClear = renderer.getClearColor(new THREE.Color()), prevA = renderer.getClearAlpha();
      const saved = { snow: U.uSnowCover.value, wet: U.uWet.value, aut: U.uAutumn.value, wind: U.uWind.value, sc: U.uSunColor.value.clone() };
      U.uSnowCover.value = 0; U.uWet.value = 0; U.uAutumn.value = 0; U.uWind.value = 0; U.uSunColor.value.setRGB(0, 0, 0);
      renderer.setRenderTarget(rt); renderer.setClearColor(0x1d2614, 0); renderer.clear();
      renderer.render(impScene, impCam);
      renderer.setRenderTarget(null); renderer.setClearColor(prevClear, prevA);
      U.uSnowCover.value = saved.snow; U.uWet.value = saved.wet; U.uAutumn.value = saved.aut; U.uWind.value = saved.wind; U.uSunColor.value.copy(saved.sc);
      meshes.forEach((m) => impScene.remove(m));
      return rt.texture;
    }

    const MAXN = 160;
    const KINDS = {};          // key -> { def, items:Set<Object3D>, near:{bark,leaf,bloom}, far, ... }
    const stats = { near: 0, far: 0, tris: 0 };
    function instanced(geo, mat, n, shadow) {
      const m = new THREE.InstancedMesh(geo, mat, n);
      m.castShadow = !!shadow; m.receiveShadow = true; m.frustumCulled = false; m.count = 0;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      scene.add(m);
      return m;
    }
    function ensureTree(key) {
      if (KINDS[key]) return KINDS[key];
      const sp = TREE_DEFS[key];
      const proto = treeProto(sp);
      const leafGeo = mergeGeos(proto.cards.map(cardGeo)), barkGeo = mergeGeos(proto.bark);
      leafGeo.computeBoundingBox();
      const bb = leafGeo.boundingBox;
      const Wd = Math.max(Math.abs(bb.min.x), Math.abs(bb.max.x), Math.abs(bb.min.z), Math.abs(bb.max.z)) * 2 + 0.4, Hh = bb.max.y + 0.6;
      const bm = sp.bark === "sakuraBark" ? barkMat2 : barkMat;
      const lm = leafMaterial(sp.transl, sp.decid, sp.leaf);
      const K = { key, def: sp, tree: true, items: new Set(), Wd, Hh, crown: Wd / 2 };
      K.bark = instanced(barkGeo, bm, MAXN, true);
      K.leaf = instanced(leafGeo, lm, MAXN, true);
      K.bark.customDepthMaterial = depth({ key: "zkbarkd", wind: true, windWeight: "clamp((wPos4.y - 3.0) * 0.02, 0.0, 0.25)" });
      K.leaf.customDepthMaterial = leafDepth(LEAF_TEX[sp.leaf]);
      K.leafMat = lm;
      if (proto.blooms.length) {
        const bg = mergeGeos(proto.blooms.map(cardGeo));
        const btex = sp.blossom || "bloom";
        K.bloomMat = leafMaterial(0.95, 0, sp.autumnBloom ? "bloom" : btex);
        K.bloom = instanced(bg, K.bloomMat, MAXN, false);
        K.bloomOn = false;
      }
      stats.tris += (barkGeo.index.count + leafGeo.index.count) / 3;
      const capB = new THREE.Mesh(barkGeo, bm), capL = new THREE.Mesh(leafGeo, lm);
      K.imp = { leafy: renderImpostor([capB, capL], Wd, Hh) };
      if (!sp.evergreen) K.imp.bare = renderImpostor([new THREE.Mesh(barkGeo, bm)], Wd, Hh);
      if (K.bloom) K.imp.bloom = renderImpostor([new THREE.Mesh(barkGeo, bm), new THREE.Mesh(leafGeo, lm), new THREE.Mesh(K.bloom.geometry, K.bloomMat)], Wd, Hh);
      const impMat = patch(new THREE.MeshStandardMaterial({ map: K.imp.leafy, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.85, envMapIntensity: 0.5 }),
        { key: "zkimp", billboard: true, leaf: true, transl: sp.transl * 0.5, decid: sp.decid, alphaMip: 256, fsMap: "diffuseColor.rgb *= 0.62 + 0.38 * smoothstep(0.05, 0.95, vMapUv.y);\n" });
      K.impMat = impMat;
      K.far = instanced(new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0), impMat, MAXN * 2, true);
      K.far.customDepthMaterial = depth({ key: "zkimpd", billboard: true, alphaMip: 256 }, K.imp.leafy, 0.5);
      look.noReflect.push(K.far);
      return (KINDS[key] = K);
    }
    function ensureShrub(key) {
      if (KINDS[key]) return KINDS[key];
      const sd = SHRUB_DEFS[key];
      const proto = shrubProto(sd);
      const lm = leafMaterial(0.3, key === "flowerbed" ? 0.6 : 0.2, sd.leaf);
      const K = { key, def: sd, tree: false, items: new Set() };
      K.leaf = instanced(mergeGeos(proto.cards.map(cardGeo)), lm, 1200, true);
      K.leaf.customDepthMaterial = leafDepth(LEAF_TEX[sd.leaf]);
      if (sd.kind === "hedge") {   // 绿篱内芯：深绿实体块，避免叶片卡之间透空
        K.core = instanced(new THREE.BoxGeometry(sd.len, sd.hh * 0.95, sd.w * 0.85).translate(0, sd.hh * 0.47, 0), patch(new THREE.MeshStandardMaterial({ color: key === "hedge_red" ? 0x5a2a1e : 0x203818, roughness: 0.95 }), { key: "zkhedgecore" }), 1200, true);
      }
      if (sd.kind === "ball") K.core = instanced(new THREE.SphereGeometry(sd.r * 0.8, 10, 8).scale(1, 0.8, 1).translate(0, sd.r * 0.55, 0), patch(new THREE.MeshStandardMaterial({ color: 0x223a1a, roughness: 0.95 }), { key: "zkhedgecore" }), 1200, true);
      if (proto.blooms.length) { K.bloom = instanced(mergeGeos(proto.blooms.map(cardGeo)), leafMaterial(0.8, 0, "bloom"), 1200, false); K.bloomOn = true; }
      if (sd.kind === "flower") K.core = instanced(new THREE.CylinderGeometry(sd.r * 1.05, sd.r * 1.12, 0.12, 20).translate(0, 0.06, 0), patch(new THREE.MeshStandardMaterial({ color: 0x3b2a1c, roughness: 1 }), { key: "zksoil" }), 1200, false);
      return (KINDS[key] = K);
    }
    // 代理对象：编辑器 / 场景操作它的位置、旋转、缩放；渲染由实例化网格完成
    function make(key) {
      const K = TREE_DEFS[key] ? ensureTree(key) : SHRUB_DEFS[key] ? ensureShrub(key) : null;
      if (!K) throw new Error("unknown flora " + key);
      const g = new THREE.Group();
      g.userData.flora = key; g.userData.height = K.tree ? K.def.h : K.def.h;
      g.userData.tint = new THREE.Color().setRGB(0.92 + Math.random() * 0.16, 0.92 + Math.random() * 0.14, 0.9 + Math.random() * 0.18);
      K.items.add(g);
      return g;
    }

    // 每帧：把代理矩阵写进实例；每 0.25 秒按距离分配近 / 远
    let lodT = 0, quality = "clear";
    const _m = new THREE.Matrix4(), _p = new V3(), _q = new THREE.Quaternion(), _s = new V3(), _sc = new V3();
    function update(camera, dt) {
      lodT -= dt;
      const relod = lodT <= 0;
      if (relod) lodT = 0.25;
      const cp = camera.position;
      const nearDist = quality === "clear" ? 140 : quality === "eco" ? 70 : 100;
      const maxNear = quality === "clear" ? 90 : quality === "eco" ? 28 : 50;
      const shrubDist = quality === "clear" ? 260 : quality === "eco" ? 120 : 180;
      if (relod) {
        const all = [];
        for (const key in KINDS) { const K = KINDS[key]; if (!K.tree) continue; for (const o of K.items) { if (!o.parent) continue; o.userData.d = Math.hypot(o.position.x - cp.x, o.position.z - cp.z, (cp.y - o.position.y) * 0.6); all.push(o); } }
        all.sort((a, b) => a.userData.d - b.userData.d);
        let n = 0;
        for (const o of all) { o.userData.near = (o.userData.d < nearDist && n < maxNear) || o.userData.forceNear; if (o.userData.near) n++; }
        stats.near = n; stats.far = all.length - n;
      }
      for (const key in KINDS) {
        const K = KINDS[key];
        let n = 0, f = 0;
        for (const o of K.items) {
          if (!o.parent || o.userData.hidden) continue;
          o.updateMatrixWorld();
          if (K.tree) {
            const sx = o.scale.x, sy = o.scale.y;
            if (sx < 0.002) continue;
            if (o.userData.near || o.userData.forceNear || o.children.length) {
              if (n >= MAXN) continue;
              K.bark.setMatrixAt(n, o.matrixWorld); K.leaf.setMatrixAt(n, o.matrixWorld); if (K.bloom) K.bloom.setMatrixAt(n, o.matrixWorld);
              K.leaf.setColorAt(n, o.userData.tint);
              n++;
            } else {
              if (f >= MAXN * 2) continue;
              o.matrixWorld.decompose(_p, _q, _sc);
              _m.compose(_p, _q.identity(), _s.set(sx * K.Wd, sy * K.Hh, sx * K.Wd));
              K.far.setMatrixAt(f, _m); K.far.setColorAt(f, o.userData.tint);
              f++;
            }
          } else {
            if (Math.hypot(o.position.x - cp.x, o.position.z - cp.z, cp.y * 0.5) > shrubDist && !o.children.length) continue;
            if (n >= 1200) continue;
            K.leaf.setMatrixAt(n, o.matrixWorld); if (K.core) K.core.setMatrixAt(n, o.matrixWorld); if (K.bloom) K.bloom.setMatrixAt(n, o.matrixWorld);
            n++;
          }
        }
        if (K.tree) {
          K.bark.count = n; K.leaf.count = K.leafOff ? 0 : n; if (K.bloom) K.bloom.count = K.bloomOn ? n : 0;
          K.far.count = f;
          K.far.instanceMatrix.needsUpdate = true; if (K.far.instanceColor) K.far.instanceColor.needsUpdate = true;
          K.bark.instanceMatrix.needsUpdate = true;
          K.far.castShadow = quality === "clear";
        } else {
          K.leaf.count = n; if (K.core) { K.core.count = n; K.core.instanceMatrix.needsUpdate = true; }
          if (K.bloom) { K.bloom.count = K.bloomOn ? n : 0; }
        }
        K.leaf.instanceMatrix.needsUpdate = true; if (K.leaf.instanceColor) K.leaf.instanceColor.needsUpdate = true;
        if (K.bloom) K.bloom.instanceMatrix.needsUpdate = true;
      }
    }
    let season = null;
    function setSeason(s) {
      if (s === season) return;
      season = s;
      for (const key in KINDS) {
        const K = KINDS[key], d = K.def;
        if (K.tree) {
          K.leafOff = s === "winter" && !d.evergreen;
          let bloomOn = false;
          if (d.blossom) bloomOn = (d.blossomSeasons || ["spring"]).indexOf(s) >= 0;
          if (d.autumnBloom) bloomOn = s === "autumn";
          K.bloomOn = bloomOn && !K.leafOff;
          const map = K.leafOff ? K.imp.bare : K.bloomOn && K.imp.bloom ? K.imp.bloom : K.imp.leafy;
          K.impMat.map = map; K.far.customDepthMaterial.map = map; K.impMat.needsUpdate = true; K.far.customDepthMaterial.needsUpdate = true;
          // 樱花 / 蓝花楹盛花期：叶片稀疏一点（花卡为主）
        } else if (key === "flowerbed") K.bloomOn = s !== "winter";
      }
    }
    function setQuality(mode) { quality = mode; for (const m of leafMats) { m.alphaToCoverage = mode === "clear"; m.needsUpdate = true; } lodT = 0; }
    function prewarm(keys) { keys.forEach((k) => (TREE_DEFS[k] ? ensureTree(k) : SHRUB_DEFS[k] ? ensureShrub(k) : null)); }
    return { make, update, setSeason, setQuality, prewarm, KINDS, stats, TREE_DEFS, SHRUB_DEFS, crownOf: (key) => (KINDS[key] && KINDS[key].crown) || 1 };
  }
  global.ZKFlora = { create, TREE_DEFS, SHRUB_DEFS };
})(window);
