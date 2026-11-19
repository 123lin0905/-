/*
 * 板块细节场景 · 植被（ZoneFlora）
 * ------------------------------------------------------------------
 * 与池塘 / 全景同一套生长算法：pond-style-core.js 的递归分枝 growTree + 叶片卡 addCard + 程序化树皮 / 叶片贴图，
 * 叶片透光、风动、积雪 / 湿润 / 秋色着色由 zone-look.js 的 patch() 统一处理（与池塘逐字相同的 GLSL）。
 * 树种原型参数沿用全景 eco-life.js（香樟、桂花、银杏、水杉、垂柳、樱花），另加紫薇（夏季粉紫色花）。
 * 真实尺度（1 单位 = 1 米）：
 *   - 背景树（林带、行道树）：每个树种“近处真实几何 InstancedMesh + 远处公告板 impostor”，每 0.25 秒按距离重新分配；
 *   - 可编辑的个体（场景原有的标志树、编辑器新种的树）：独立网格，共享原型几何与材质，可选中 / 移植 / 移除；
 *   - 花境 / 花田：灌木叶片卡 + 白色五瓣花卡（按实例着色：紫、黄、红、粉…）；绿篱、芦苇、睡莲叶与睡莲花。
 */
(function (global) {
  "use strict";
  const THREE = global.THREE, V3 = THREE.Vector3;

  const SPECIES = [
    { id: "camphor", name: "香樟", h: 12, decid: 0.12, evergreen: true, leaf: "green", tint: [0.72, 0.88, 0.62], transl: 0.3, seed: 101, bark: "bark",
      grow: (h) => ({ len: h * 0.42, rad: 0.06 + h * 0.024, depth: 3, children: [6, 3, 3], childStart: [0.35, 0.3, 0.3], spread: [0.9, 0.85, 0.7], upBias: [0.38, 0.3, 0.25],
        lenDecay: 0.6, radDecay: 0.6, wiggle: [0.08, 0.25, 0.3], gravity: [0, 0.0, -0.03] }), cards: { per: 6, spread: [0.4, 1.7], size: [1.7, 2.4], up: 0.8 } },
    { id: "osmanthus", name: "桂花", h: 6, decid: 0, evergreen: true, leaf: "shrub", tint: [0.68, 0.84, 0.6], transl: 0.25, seed: 202, bark: "bark",
      grow: (h) => ({ len: h * 0.34, rad: 0.05 + h * 0.02, depth: 3, children: [5, 3, 3], childStart: [0.3, 0.3, 0.3], spread: [1.0, 0.9, 0.8], upBias: [0.3, 0.2, 0.15],
        lenDecay: 0.66, radDecay: 0.62, wiggle: [0.1, 0.25, 0.3], gravity: [0, -0.02, -0.03] }), cards: { per: 7, spread: [0.2, 0.9], size: [1.0, 1.4], up: 0.7 } },
    { id: "ginkgo", name: "银杏", h: 13, decid: 0, evergreen: false, leaf: "green", tint: [0.98, 1.06, 0.62], transl: 0.4, seed: 303, bark: "bark", gold: true,
      grow: (h) => ({ len: h * 0.5, rad: 0.06 + h * 0.02, depth: 3, children: [7, 3, 2], childStart: [0.3, 0.3, 0.3], spread: [0.6, 0.65, 0.6], upBias: [0.65, 0.5, 0.4],
        lenDecay: 0.55, radDecay: 0.6, wiggle: [0.06, 0.2, 0.25], gravity: [0, 0.02, 0.0] }), cards: { per: 6, spread: [0.3, 1.3], size: [1.4, 2.0], up: 0.9 } },
    { id: "metasequoia", name: "水杉", h: 18, decid: 1, evergreen: false, leaf: "conifer", tint: [1.15, 1.3, 1.05], transl: 0.18, seed: 404, bark: "bark", conifer: true },
    { id: "willow", name: "垂柳", h: 9, decid: 0.4, evergreen: false, leaf: "willow", tint: [0.9, 1.05, 0.82], transl: 0.6, seed: 505, bark: "bark", weeping: true,
      grow: (h) => ({ len: h * 0.42, rad: 0.12 + h * 0.016, depth: 4, children: [5, 3, 4, 2], childStart: [0.6, 0.3, 0.2, 0.2], spread: [1.05, 0.9, 0.5, 0.35],
        upBias: [0.45, 0.35, -0.6, -1.0], lenDecay: 0.86, radDecay: 0.6, wiggle: [0.08, 0.2, 0.12, 0.12], gravity: [0.0, -0.02, -0.28, -0.45] }) },
    { id: "cherry", name: "樱花", h: 7, decid: 1, evergreen: false, leaf: "green", blossom: "spring", bloomTex: "blossom", tint: [0.88, 1.0, 0.72], transl: 0.5, seed: 606, bark: "sakuraBark",
      grow: (h) => ({ len: h * 0.36, rad: 0.1 + h * 0.016, depth: 4, children: [5, 3, 3, 2], childStart: [0.55, 0.3, 0.3, 0.3], spread: [1.05, 0.85, 0.75, 0.6],
        upBias: [0.3, 0.18, 0.12, 0.1], lenDecay: 0.66, radDecay: 0.62, wiggle: [0.1, 0.25, 0.3, 0.35], gravity: [0.0, -0.03, -0.05, -0.06] }), cards: { per: 4, spread: [0.15, 0.6], size: [0.9, 1.25], up: 1.2 } },
    // 紫薇：多干小乔木，夏季满树粉紫色圆锥花序（白色五瓣花卡按实例着色）
    { id: "crapemyrtle", name: "紫薇", h: 4.6, decid: 1, evergreen: false, leaf: "shrub", blossom: "summer", bloomTex: "bloom", bloomTint: [0.92, 0.55, 0.86], tint: [0.7, 0.86, 0.6], transl: 0.35, seed: 707, bark: "sakuraBark",
      grow: (h) => ({ len: h * 0.42, rad: 0.05 + h * 0.012, depth: 3, children: [4, 3, 3], childStart: [0.35, 0.35, 0.3], spread: [0.75, 0.8, 0.7], upBias: [0.55, 0.35, 0.3],
        lenDecay: 0.62, radDecay: 0.62, wiggle: [0.12, 0.25, 0.3], gravity: [0, -0.02, -0.03] }), cards: { per: 6, spread: [0.15, 0.8], size: [0.8, 1.1], up: 0.9 } },
  ];
  const SP = {}; SPECIES.forEach((s, i) => { s.index = i; SP[s.id] = s; });

  function cardGeo(e) {
    const g = new THREE.PlaneGeometry(1, 1, 1, 1);
    g.applyMatrix4(e.m);
    const n = g.attributes.position.count, c = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { c[i * 3] = e.c.r; c[i * 3 + 1] = e.c.g; c[i * 3 + 2] = e.c.b; }
    g.setAttribute("color", new THREE.BufferAttribute(c, 3));
    return g;
  }
  // 原型树（同 eco-life.js：growTree / addCard；树皮分段按级别重新生成，近看比全景细一级）
  function buildPrototype(sp) {
    rng = mulberry32(sp.seed);
    const cards = [], bark = [], bloom = [];
    const tint = () => new THREE.Color().setRGB(sp.tint[0] * rr(0.85, 1.12), sp.tint[1] * rr(0.9, 1.1), sp.tint[2] * rr(0.85, 1.12));
    if (sp.conifer) {
      const h = sp.h;
      bark.push(taperTube(new THREE.CatmullRomCurve3([new V3(0, -0.3, 0), new V3(0.12, h * 0.5, 0), new V3(0, h * 0.97, 0)]), 14, 9, 0.42, 0.05, 0.5));
      for (let y = 2.0; y < h; y += 0.6) {
        const rad = Math.pow(1 - y / h, 0.85) * 3.1 + 0.35, cnt = Math.round(rad * 2.4 + 2);
        for (let i = 0; i < cnt; i++) {
          const a = rand() * 6.28, r = rad * Math.sqrt(rr(0.3, 1));
          addCard(cards, new V3(Math.cos(a) * r, y, Math.sin(a) * r), new V3(Math.cos(a), 0.9, Math.sin(a)), rr(1.8, 2.5), tint());
        }
      }
      return { cards, bark, bloom, h };
    }
    const g = sp.grow(sp.h);
    const nb = BARK.length;
    const tips = growTree(Object.assign({ base: new V3(0, -0.3, 0), dir: new V3(rr(-0.06, 0.06), 1, rr(-0.06, 0.06)).normalize() }, g));
    BARK.splice(nb);
    for (const b of tips.branches) {
      if (b.lvl > 2 || b.r0 < 0.025) continue;
      const seg = b.lvl === 0 ? [16, 10] : b.lvl === 1 ? [8, 6] : [4, 4];
      bark.push(taperTube(b.curve, seg[0], seg[1], b.r0, Math.max(b.r1, 0.02), 0.6));
    }
    if (sp.weeping) {
      for (const b of tips.branches) {
        if (b.lvl < 3) continue;
        for (let t = 0.1; t <= 1.0; t += 0.13) {
          const p = b.curve.getPointAt(t), n = randDir().add(new V3(0, 0.3, 0));
          addCard(cards, p.add(randDir().multiplyScalar(0.08)), new V3(n.x, n.y * 0.15, n.z), rr(0.75, 1.05), tint());
        }
      }
    } else {
      const C = sp.cards;
      for (const t of tips) {
        for (let i = 0; i < C.per; i++) {
          const p = t.p.clone().add(randDir().multiplyScalar(rr(C.spread[0], C.spread[1])));
          addCard(cards, p, randDir().add(new V3(0, C.up, 0)), rr(C.size[0], C.size[1]), tint());
          if (sp.blossom && i % 2 === 0) {
            const bt = sp.bloomTint ? new THREE.Color().setRGB(sp.bloomTint[0] * rr(0.9, 1.05), sp.bloomTint[1] * rr(0.85, 1.1), sp.bloomTint[2] * rr(0.9, 1.05)) : new THREE.Color(1, 1, 1);
            addCard(bloom, p.clone().add(randDir().multiplyScalar(0.12)), randDir().add(new V3(0, C.up, 0)), rr(C.size[0], C.size[1]) * 0.9, bt);
          }
        }
      }
    }
    let top = 0; for (const c of cards) top = Math.max(top, c.m.elements[13]);
    return { cards, bark, bloom, h: top + 1 };
  }

  function create(Z) {
    const look = Z.look, renderer = Z.renderer, scene = Z.scene, patch = look.patch, depth = look.depth, U = look.U;
    const quality = () => look.quality;
    const LEAF_TEX = {
      green: TEX.greenLeaves, shrub: TEX.shrubLeaves, conifer: TEX.conifer, willow: TEX.sakura,   // TEX.sakura 在校园版里是垂柳叶卡
      blossom: leafCard("sakura"), bloom: TEX.bloomLeaves,
    };
    const WINDD = "clamp((wPos4.y - 3.0) * 0.02, 0.0, 0.25)", WINDL = "clamp((wPos4.y - 1.5) * 0.06, 0.0, 1.2)";
    const barkMats = {};
    function barkMaterial(kind) {
      if (barkMats[kind]) return barkMats[kind];
      const set = TEX[kind] || TEX.bark;
      return (barkMats[kind] = patch(new THREE.MeshStandardMaterial({ map: set.map, normalMap: set.normalMap, normalScale: new THREE.Vector2(1.4, 1.4), roughness: 0.92, color: kind === "bark" ? 0xb8aaa0 : 0xffffff, envMapIntensity: 0.6 }),
        { key: "bark", wind: true, windWeight: WINDD }));
    }
    function leafMaterial(o, texKey) {
      return patch(new THREE.MeshStandardMaterial({ map: LEAF_TEX[texKey], alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.62, envMapIntensity: 0.55, vertexColors: true }),
        { key: "leaf", leaf: true, transl: o.transl, decid: o.decid, wind: true, windWeight: WINDL, alphaMip: 512,
          fsMap: "diffuseColor.a *= smoothstep(0.2, 0.45, abs(dot(normalize(vNormal), normalize(vViewPosition))));\n" });
    }
    const leafDepth = (tex) => depth({ key: "leafd", wind: true, windWeight: WINDL, alphaMip: 512 }, tex, 0.45);
    const barkDepth = () => depth({ key: "barkd", wind: true, windWeight: WINDD });

    // ---------- impostor（远处公告板） ----------
    const impScene = new THREE.Scene();
    impScene.add(new THREE.AmbientLight(0xffffff, Math.PI * 0.7));
    const impSun = new THREE.DirectionalLight(0xffffff, Math.PI * 0.3); impSun.position.set(0.2, 1, 0.3); impScene.add(impSun);
    const impCam = new THREE.OrthographicCamera(-1, 1, 1, -1, -100, 100);
    function renderImpostor(meshes, Wd, Hh) {
      const rt = new THREE.WebGLRenderTarget(256, 256, { generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter });
      rt.texture.colorSpace = THREE.SRGBColorSpace;
      impCam.left = -Wd / 2; impCam.right = Wd / 2; impCam.bottom = 0; impCam.top = Hh; impCam.position.set(0, 0, 50); impCam.lookAt(0, 0, 0);
      impCam.updateProjectionMatrix();
      meshes.forEach((m) => impScene.add(m));
      const prevClear = renderer.getClearColor(new THREE.Color()), prevA = renderer.getClearAlpha();
      const saved = { snow: U.uSnowCover.value, wet: U.uWet.value, aut: U.uAutumn.value, wind: U.uWind.value, sc: U.uSunColor.value.clone() };
      U.uSnowCover.value = 0; U.uWet.value = 0; U.uAutumn.value = 0; U.uWind.value = 0; U.uSunColor.value.setRGB(0, 0, 0);
      const clip = renderer.clippingPlanes; renderer.clippingPlanes = [];
      renderer.setRenderTarget(rt); renderer.setClearColor(0x1d2614, 0); renderer.clear();
      renderer.render(impScene, impCam);
      renderer.setRenderTarget(null); renderer.setClearColor(prevClear, prevA); renderer.clippingPlanes = clip;
      U.uSnowCover.value = saved.snow; U.uWet.value = saved.wet; U.uAutumn.value = saved.aut; U.uWind.value = saved.wind; U.uSunColor.value.copy(saved.sc);
      meshes.forEach((m) => impScene.remove(m));
      return rt.texture;
    }

    // ---------- 树种：原型几何 + 材质（按需生成） ----------
    function ensure(sp) {
      if (sp.ready) return sp;
      const proto = buildPrototype(sp);
      sp.leafGeo = mergeGeos(proto.cards.map(cardGeo));
      sp.barkGeo = mergeGeos(proto.bark);
      sp.bloomGeo = proto.bloom.length ? mergeGeos(proto.bloom.map(cardGeo)) : null;
      sp.leafGeo.computeBoundingBox();
      const bb = sp.leafGeo.boundingBox;
      sp.W = Math.max(Math.abs(bb.min.x), Math.abs(bb.max.x), Math.abs(bb.min.z), Math.abs(bb.max.z)) * 2 + 0.4;
      sp.H = bb.max.y + 0.6;
      sp.crown = sp.W / 2;
      sp.leafMat = leafMaterial(sp, sp.leaf);
      sp.barkMat = barkMaterial(sp.bark);
      if (sp.bloomGeo) sp.bloomMat = leafMaterial({ decid: 0, transl: 0.95 }, sp.bloomTex);
      sp.leafDepth = leafDepth(LEAF_TEX[sp.leaf]); sp.barkDepth = barkDepth();
      if (sp.bloomGeo) sp.bloomDepth = leafDepth(LEAF_TEX[sp.bloomTex]);
      const capB = new THREE.Mesh(sp.barkGeo, sp.barkMat), capL = new THREE.Mesh(sp.leafGeo, sp.leafMat);
      sp.imp = { leafy: renderImpostor([capB, capL], sp.W, sp.H) };
      if (!sp.evergreen) sp.imp.bare = renderImpostor([new THREE.Mesh(sp.barkGeo, sp.barkMat)], sp.W, sp.H);
      if (sp.bloomGeo) sp.imp.bloom = renderImpostor([new THREE.Mesh(sp.barkGeo, sp.barkMat), new THREE.Mesh(sp.leafGeo, sp.leafMat), new THREE.Mesh(sp.bloomGeo, sp.bloomMat)], sp.W, sp.H);
      sp.impMat = patch(new THREE.MeshStandardMaterial({ map: sp.imp.leafy, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.85, envMapIntensity: 0.5 }),
        { key: "imp", billboard: true, leaf: true, transl: sp.transl * 0.5, decid: sp.decid, alphaMip: 256,
          fsMap: "diffuseColor.rgb *= 0.62 + 0.38 * smoothstep(0.05, 0.95, vMapUv.y);\n" });
      sp.impDepth = depth({ key: "impd", billboard: true, alphaMip: 256 }, sp.imp.leafy, 0.5);
      sp.ready = true;
      return sp;
    }

    // ---------- 背景树（实例化 + LOD） ----------
    const BG = [];            // { sp, x, y, z, s, rot, tint, near }
    const groups = {};
    function addBackground(list) {
      for (const t of list) {
        const sp = SP[t.key]; if (!sp) continue;
        BG.push({ sp, x: t.x, y: t.y || 0, z: t.z, s: t.s || 1, rot: t.rot || 0, tint: new THREE.Color().setRGB(0.9 + Math.random() * 0.2, 0.92 + Math.random() * 0.16, 0.88 + Math.random() * 0.2), d: 0 });
      }
    }
    function buildBackground() {
      for (const sp of SPECIES) {
        const list = BG.filter((t) => t.sp === sp); if (!list.length) continue;
        ensure(sp);
        const MAXN = Math.min(list.length, 120);
        const nb = new THREE.InstancedMesh(sp.barkGeo, sp.barkMat, MAXN), nl = new THREE.InstancedMesh(sp.leafGeo, sp.leafMat, MAXN);
        const nbl = sp.bloomGeo ? new THREE.InstancedMesh(sp.bloomGeo, sp.bloomMat, MAXN) : null;
        [nb, nl, nbl].forEach((m) => { if (!m) return; m.castShadow = m.receiveShadow = true; m.frustumCulled = false; m.count = 0; });
        nb.customDepthMaterial = sp.barkDepth; nl.customDepthMaterial = sp.leafDepth; if (nbl) nbl.customDepthMaterial = sp.bloomDepth;
        nl.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAXN * 3).fill(1), 3);
        const qg = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
        const far = new THREE.InstancedMesh(qg, sp.impMat, list.length);
        far.castShadow = true; far.receiveShadow = false; far.frustumCulled = false; far.customDepthMaterial = sp.impDepth;
        far.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(list.length * 3).fill(1), 3);
        scene.add(nb, nl, far); if (nbl) scene.add(nbl);
        groups[sp.id] = { sp, list, nb, nl, nbl, far, MAXN };
      }
    }
    const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new V3(), _s = new V3(), _y = new V3(0, 1, 0);
    const stats = { near: 0, far: 0 };
    let lodT = 0;
    function updateLOD(cam) {
      const q = quality();
      const nearDist = q === "clear" ? 95 : q === "eco" ? 45 : 65, maxNear = q === "clear" ? 70 : q === "eco" ? 18 : 36;
      for (const t of BG) t.d = Math.hypot(t.x - cam.x, t.z - cam.z, (cam.y - t.y) * 0.5);
      const sorted = BG.slice().sort((a, b) => a.d - b.d);
      let n = 0; for (const t of sorted) { t.near = t.d < nearDist && n < maxNear; if (t.near) n++; }
      stats.near = n; stats.far = BG.length - n;
      for (const k in groups) {
        const G = groups[k], sp = G.sp; let a = 0, f = 0;
        for (const t of G.list) {
          if (t.near && a < G.MAXN) {
            _q.setFromAxisAngle(_y, t.rot); _m.compose(_p.set(t.x, t.y, t.z), _q, _s.set(t.s, t.s, t.s));
            G.nb.setMatrixAt(a, _m); G.nl.setMatrixAt(a, _m); G.nl.setColorAt(a, t.tint); if (G.nbl) G.nbl.setMatrixAt(a, _m);
            a++;
          } else {
            _m.compose(_p.set(t.x, t.y, t.z), _q.identity(), _s.set(t.s * sp.W, t.s * sp.H, t.s * sp.W));
            G.far.setMatrixAt(f, _m); G.far.setColorAt(f, t.tint); f++;
          }
        }
        G.nb.count = G.nl.count = a; if (G.nbl) G.nbl.count = a;
        G.nb.visible = a > 0; G.nl.visible = a > 0 && !sp.leafOff; if (G.nbl) G.nbl.visible = a > 0 && sp.bloomOn;
        G.far.count = f; G.far.visible = f > 0;
        G.nb.instanceMatrix.needsUpdate = G.nl.instanceMatrix.needsUpdate = G.far.instanceMatrix.needsUpdate = true;
        if (G.nbl) G.nbl.instanceMatrix.needsUpdate = true;
        G.nl.instanceColor.needsUpdate = G.far.instanceColor.needsUpdate = true;
        G.far.castShadow = q === "clear";
      }
    }

    // ---------- 单株（可编辑个体） ----------
    const singles = [];
    function makeTree(key, opt) {
      const sp = ensure(SP[key]);
      const g = new THREE.Group(); g.name = "tree:" + key;
      const b = new THREE.Mesh(sp.barkGeo, sp.barkMat), l = new THREE.Mesh(sp.leafGeo, sp.leafMat);
      b.castShadow = l.castShadow = true; b.receiveShadow = l.receiveShadow = true;
      b.customDepthMaterial = sp.barkDepth; l.customDepthMaterial = sp.leafDepth;
      g.add(b, l);
      let bl = null;
      if (sp.bloomGeo) { bl = new THREE.Mesh(sp.bloomGeo, sp.bloomMat); bl.castShadow = true; bl.customDepthMaterial = sp.bloomDepth; g.add(bl); }
      g.userData.height = sp.H; g.userData.crown = sp.W / 2; g.userData.species = key;
      g.userData.parts = { b, l, bl, sp };
      l.visible = !sp.leafOff; if (bl) bl.visible = !!sp.bloomOn;
      singles.push(g);
      return g;
    }

    // ---------- 花境 / 花田（灌木叶卡 + 白色五瓣花卡按实例着色） ----------
    function clumpGeo(seed, nLeaf, nBloom, R, Hh) {
      rng = mulberry32(seed);
      const leaves = [], blooms = [];
      for (let i = 0; i < nLeaf; i++) {
        const a = rand() * 6.28, u = Math.sqrt(rand()), r = R * u, y = 0.05 + Math.sqrt(Math.max(0, 1 - u * u)) * Hh;
        addCard(leaves, new V3(Math.cos(a) * r, y, Math.sin(a) * r), new V3(Math.cos(a) * u, 1.0, Math.sin(a) * u), rr(0.32, 0.46) * (R / 0.45), new THREE.Color().setRGB(rr(0.62, 0.8), rr(0.82, 1.0), rr(0.55, 0.72)));
      }
      for (let i = 0; i < nBloom; i++) {
        const a = rand() * 6.28, u = Math.sqrt(rand()), r = R * 0.95 * u, y = 0.1 + Math.sqrt(Math.max(0, 1 - u * u)) * Hh * 1.08;
        addCard(blooms, new V3(Math.cos(a) * r, y, Math.sin(a) * r), new V3(Math.cos(a) * u * 0.6, 1.0, Math.sin(a) * u * 0.6), rr(0.26, 0.36) * (R / 0.45), new THREE.Color(1, 1, 1));
      }
      return { lg: mergeGeos(leaves.map(cardGeo)), bg: mergeGeos(blooms.map(cardGeo)) };
    }
    const FLOWER = clumpGeo(811, 9, 9, 0.45, 0.32);
    const flowerLeafMat = leafMaterial({ transl: 0.35, decid: 0.2 }, "shrub");
    const flowerBloomMat = leafMaterial({ transl: 0.7, decid: 0 }, "bloom");
    const beds = [];
    // pts: [{x,y,z,c:[r,g,b], s}]
    function addFlowers(pts) {
      if (!pts.length) return;
      const n = pts.length;
      const lm = new THREE.InstancedMesh(FLOWER.lg, flowerLeafMat, n), bm = new THREE.InstancedMesh(FLOWER.bg, flowerBloomMat, n);
      bm.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
      const col = new THREE.Color();
      pts.forEach((p, i) => {
        _q.setFromAxisAngle(_y, Math.random() * 6.28); const s = p.s || 1;
        _m.compose(_p.set(p.x, p.y, p.z), _q, _s.set(s, s * (0.85 + Math.random() * 0.3), s));
        lm.setMatrixAt(i, _m); bm.setMatrixAt(i, _m);
        col.setRGB(p.c[0], p.c[1], p.c[2]); bm.setColorAt(i, col);
      });
      lm.castShadow = false; lm.receiveShadow = bm.receiveShadow = true;
      lm.customDepthMaterial = leafDepth(LEAF_TEX.shrub);
      scene.add(lm, bm);
      lm.computeBoundingSphere(); bm.computeBoundingSphere();
      beds.push({ lm, bm });
    }
    // 编辑器的“草花花丛”：7 簇不同颜色的花
    const BED_COLORS = [[0.62, 0.36, 0.95], [1.0, 0.82, 0.18], [0.98, 0.3, 0.32], [1.0, 0.55, 0.75], [0.98, 0.98, 0.95]];
    function makeFlowerClump(seed) {
      const g = new THREE.Group(); g.name = "flowerbed";
      const c = BED_COLORS[(seed >>> 0) % BED_COLORS.length];
      const r = mulberry32(seed + 7);
      for (let i = 0; i < 7; i++) {
        const a = i === 0 ? 0 : (i / 6) * 6.28 + r(), d = i === 0 ? 0 : 0.42 + r() * 0.1;
        const lm = new THREE.Mesh(FLOWER.lg, flowerLeafMat), bmm = flowerBloomMat.clone();
        bmm.onBeforeCompile = flowerBloomMat.onBeforeCompile; bmm.customProgramCacheKey = flowerBloomMat.customProgramCacheKey; bmm.vertexColors = false;
        bmm.color.setRGB(c[0], c[1], c[2]);
        const bm = new THREE.Mesh(FLOWER.bg, bmm);
        const sub = new THREE.Group(); sub.add(lm, bm); sub.position.set(Math.cos(a) * d, 0, Math.sin(a) * d); sub.rotation.y = r() * 6.28;
        sub.scale.setScalar(0.85 + r() * 0.3);
        lm.receiveShadow = bm.receiveShadow = true;
        g.add(sub);
      }
      g.userData.height = 0.45;
      return g;
    }

    // ---------- 绿篱 / 灌木球 ----------
    const SHRUB = (() => {
      rng = mulberry32(707);
      const leaves = [];
      for (let i = 0; i < 60; i++) {
        const a = rand() * 6.28, u = Math.sqrt(rand()), r = 0.62 * u, y = 0.12 + Math.sqrt(Math.max(0, 1 - u * u)) * 0.62;
        addCard(leaves, new V3(Math.cos(a) * r, y, Math.sin(a) * r), new V3(Math.cos(a) * u, 1.0, Math.sin(a) * u), rr(0.36, 0.5), new THREE.Color().setRGB(rr(0.6, 0.78), rr(0.8, 0.98), rr(0.52, 0.7)));
      }
      return mergeGeos(leaves.map(cardGeo));
    })();
    const shrubMat = leafMaterial({ transl: 0.3, decid: 0.05 }, "shrub");
    const shrubDepth = leafDepth(LEAF_TEX.shrub);
    // pts: [{x,y,z,sx,sy,sz,rot}]
    function addShrubs(pts) {
      if (!pts.length) return;
      const m = new THREE.InstancedMesh(SHRUB, shrubMat, pts.length);
      pts.forEach((p, i) => { _q.setFromAxisAngle(_y, p.rot || 0); _m.compose(_p.set(p.x, p.y, p.z), _q, _s.set(p.sx || 1, p.sy || 1, p.sz || p.sx || 1)); m.setMatrixAt(i, _m); });
      m.castShadow = true; m.receiveShadow = true; m.customDepthMaterial = shrubDepth;
      m.computeBoundingSphere();
      scene.add(m);
      return m;
    }
    function makeShrubBall() {
      const g = new THREE.Group(); g.name = "shrub_ball";
      const m = new THREE.Mesh(SHRUB, shrubMat); m.castShadow = true; m.receiveShadow = true; m.customDepthMaterial = shrubDepth;
      m.scale.set(1.1, 1.15, 1.1); g.add(m); g.userData.height = 0.9;
      return g;
    }

    // ---------- 芦苇 / 鸢尾（水边）、睡莲 ----------
    const reedTex = (() => {
      const N = 128, cv = makeCanvas(N, 256), g = cv.getContext("2d"), R = mulberry32(99);
      g.clearRect(0, 0, N, 256);
      for (let i = 0; i < 26; i++) {
        const x = 10 + R() * (N - 20), lean = (R() - 0.5) * 30, top = 10 + R() * 90;
        g.strokeStyle = `hsl(${70 + R() * 30},${35 + R() * 20}%,${28 + R() * 18}%)`; g.lineWidth = 2 + R() * 2.5;
        g.beginPath(); g.moveTo(x, 256); g.quadraticCurveTo(x + lean * 0.3, 140, x + lean, top); g.stroke();
      }
      return canvasTex(cv, true);
    })();
    const reedMat = patch(new THREE.MeshStandardMaterial({ map: reedTex, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.7, envMapIntensity: 0.5 }),
      { key: "reed", leaf: true, transl: 0.5, decid: 0.6, wind: true, windWeight: "clamp(wPos4.y * 0.25, 0.0, 0.8)" });
    const REED = (() => {
      const gs = [];
      for (let k = 0; k < 3; k++) { const p = new THREE.PlaneGeometry(0.7, 1.5).translate(0, 0.75, 0); p.rotateY(k * Math.PI / 3); gs.push(p); }
      return mergeGeos(gs);
    })();
    function addReeds(pts) {
      if (!pts.length) return;
      const m = new THREE.InstancedMesh(REED, reedMat, pts.length);
      pts.forEach((p, i) => { _q.setFromAxisAngle(_y, Math.random() * 6.28); const s = p.s || 1; _m.compose(_p.set(p.x, p.y, p.z), _q, _s.set(s, s * (0.8 + Math.random() * 0.4), s)); m.setMatrixAt(i, _m); });
      m.receiveShadow = true; m.computeBoundingSphere(); scene.add(m); return m;
    }
    function makeReed() {
      const g = new THREE.Group(); g.name = "reed";
      for (let i = 0; i < 4; i++) { const m = new THREE.Mesh(REED, reedMat); m.position.set((i % 2 - 0.5) * 0.3, 0, (i > 1 ? 0.15 : -0.15)); m.rotation.y = i; m.receiveShadow = true; g.add(m); }
      g.userData.height = 1.4;
      return g;
    }
    // 睡莲叶：带缺口的圆叶（池塘同款 lilyTex 贴图）+ 白色睡莲花
    const LILY = (() => {
      const g = new THREE.CircleGeometry(0.32, 24, 0.25, Math.PI * 2 - 0.5).rotateX(-Math.PI / 2);
      return g;
    })();
    const lilyMat = patch(new THREE.MeshStandardMaterial({ map: TEX.lily, roughness: 0.45, envMapIntensity: 0.7, side: THREE.DoubleSide }), { key: "lily" });
    const LFLOWER = (() => {
      const gs = [];
      for (let ring = 0; ring < 2; ring++) for (let i = 0; i < 8; i++) {
        const p = new THREE.SphereGeometry(0.06, 6, 4).scale(0.7, 0.35, 1.6).translate(0, 0.02 + ring * 0.025, 0.07 - ring * 0.02);
        p.rotateX(-0.35 - ring * 0.35); p.rotateY(i / 8 * Math.PI * 2 + ring * 0.4); gs.push(p);
      }
      gs.push(new THREE.SphereGeometry(0.035, 8, 6).translate(0, 0.05, 0));
      return mergeGeos(gs.map((g) => g.index ? g : g));
    })();
    const lflowerMat = patch(new THREE.MeshStandardMaterial({ color: 0xfbf4ee, roughness: 0.5, emissive: 0x221a14, envMapIntensity: 0.8 }), { key: "lflower" });
    function makeLily(withFlower, seed) {
      const g = new THREE.Group(); g.name = "waterlily";
      const r = mulberry32((seed || 1) * 31);
      const n = 3 + Math.floor(r() * 3);
      for (let i = 0; i < n; i++) {
        const m = new THREE.Mesh(LILY, lilyMat); const a = r() * 6.28, d = i === 0 ? 0 : 0.35 + r() * 0.3;
        m.position.set(Math.cos(a) * d, 0.005 * i, Math.sin(a) * d); m.rotation.y = r() * 6.28; m.scale.setScalar(0.8 + r() * 0.6); m.receiveShadow = true; g.add(m);
      }
      if (withFlower) { const f = new THREE.Mesh(LFLOWER, lflowerMat); f.position.set(0.12, 0.02, 0.05); f.scale.setScalar(1.3); g.add(f); }
      g.userData.height = 0.1;
      return g;
    }

    // ---------- 季节：落叶 / 开花 / 银杏金黄 ----------
    const SEASON = { letter: "", season: "" };
    function setSeason(letter, season) {
      if (SEASON.letter === letter && SEASON.season === season) return;
      SEASON.letter = letter; SEASON.season = season;
      for (const sp of SPECIES) {
        sp.leafOff = letter === "W" && !sp.evergreen;
        sp.bloomOn = !sp.leafOff && ((sp.blossom === "spring" && season === "spring") || (sp.blossom === "summer" && season === "summer"));
        if (!sp.ready) continue;
        // 银杏：秋季整树金黄（池塘的秋色着色是红橙斑驳，这里直接换叶色）
        if (sp.gold) sp.leafMat.color.setRGB(season === "autumn" ? 3.6 : 1, season === "autumn" ? 1.65 : 1, season === "autumn" ? 0.08 : 1);   // 叶片贴图偏绿（g > r），r 要放大得多才是金黄
        if (sp.impMat) {
          sp.impMat.map = sp.leafOff ? sp.imp.bare : sp.bloomOn && sp.imp.bloom ? sp.imp.bloom : sp.imp.leafy;
          sp.impMat.color.copy(sp.gold ? sp.leafMat.color : new THREE.Color(1, 1, 1));
          if (sp.gold && season === "autumn") sp.impMat.color.setRGB(2.2, 1.35, 0.2);
          sp.impMat.needsUpdate = true;
        }
      }
      for (const g of singles) { const P = g.userData.parts; P.l.visible = !P.sp.leafOff; if (P.bl) P.bl.visible = !!P.sp.bloomOn; }
      const show = letter !== "W";
      for (const b of beds) b.bm.visible = show && season !== "winter";
    }

    function update(dt, cam) {
      lodT -= dt;
      if (lodT <= 0) { lodT = 0.25; updateLOD(cam); }
    }
    return { SPECIES, SP, ensure, addBackground, buildBackground, makeTree, addFlowers, makeFlowerClump, addShrubs, makeShrubBall, addReeds, makeReed, makeLily, setSeason, update, updateLOD, stats, BG, BED_COLORS };
  }

  global.ZoneFlora = { create, SPECIES };
})(window);
