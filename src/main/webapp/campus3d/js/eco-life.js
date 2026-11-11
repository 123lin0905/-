/*
 * 生态动态层（池塘同款写实画风）：树木（程序化分枝 + 叶片卡，InstancedMesh + 远处公告板 LOD）、灌木与花丛、荷叶、
 * 路灯、鸟群、小猫追蝴蝶、降水/花瓣/落叶/萤火虫 GPU 粒子。天空、太阳、雾、色调映射由 campus-look.js（EcoLook）负责。
 *   const life = EcoLife.create(scene, campus, { zones, renderer, layout, look, camera });
 *   life.setEnvironment(env);  // 每 0.25 秒由 ecohome.js 传入：昼夜、天气、季节
 *   life.update(dt, t, camera, target);
 *
 * 树种（与池塘场景同一套生长算法 growTree / 叶片卡 addCard / 树皮 TEX.bark，见 pond-style-core.js）：
 *   香樟（常绿）、桂花（常绿小乔木）、银杏、水杉、垂柳（水边）、樱花（春季开花）—— 落叶树冬季落光、秋季变色（与池塘同一着色）。
 * 性能：每个树种 = 近处“树皮 + 叶片”两个 InstancedMesh + 远处一张公告板（impostor，启动时把原型树渲染成贴图）；
 *       每 0.25 秒按相机距离重新分配近 / 远；灌木、花丛只在近处显示。
 * 参考：鸟群采用 Craig Reynolds Boids 三规则；粒子为自写 GPU 粒子（顶点着色器内循环下落，CPU 零更新）。
 */
(function (global) {
  "use strict";
  const THREE = global.THREE;
  const clamp01 = (v) => Math.max(0, Math.min(1, v));
  const lerpF = (a, b, t) => a + (b - a) * t;
  const V3 = THREE.Vector3;

  // ---------------- 树种原型 ----------------
  const SPECIES = [
    { id: "camphor", name: "香樟", h: 12, decid: 0.12, evergreen: true, leaf: "green", tint: [0.72, 0.88, 0.62], transl: 0.3, seed: 101, bark: "bark",
      grow: (h) => ({ len: h * 0.42, rad: 0.06 + h * 0.024, depth: 3, children: [6, 3, 3], childStart: [0.35, 0.3, 0.3], spread: [0.9, 0.85, 0.7], upBias: [0.38, 0.3, 0.25],
        lenDecay: 0.6, radDecay: 0.6, wiggle: [0.08, 0.25, 0.3], gravity: [0, 0.0, -0.03] }), cards: { per: 6, spread: [0.4, 1.7], size: [1.7, 2.4], up: 0.8 } },
    { id: "osmanthus", name: "桂花", h: 6, decid: 0, evergreen: true, leaf: "shrub", tint: [0.68, 0.84, 0.6], transl: 0.25, seed: 202, bark: "bark",
      grow: (h) => ({ len: h * 0.34, rad: 0.05 + h * 0.02, depth: 3, children: [5, 3, 3], childStart: [0.3, 0.3, 0.3], spread: [1.0, 0.9, 0.8], upBias: [0.3, 0.2, 0.15],
        lenDecay: 0.66, radDecay: 0.62, wiggle: [0.1, 0.25, 0.3], gravity: [0, -0.02, -0.03] }), cards: { per: 7, spread: [0.2, 0.9], size: [1.0, 1.4], up: 0.7 } },
    { id: "ginkgo", name: "银杏", h: 13, decid: 1, evergreen: false, leaf: "green", tint: [0.98, 1.06, 0.62], transl: 0.4, seed: 303, bark: "bark",
      grow: (h) => ({ len: h * 0.5, rad: 0.06 + h * 0.02, depth: 3, children: [7, 3, 2], childStart: [0.3, 0.3, 0.3], spread: [0.6, 0.65, 0.6], upBias: [0.65, 0.5, 0.4],
        lenDecay: 0.55, radDecay: 0.6, wiggle: [0.06, 0.2, 0.25], gravity: [0, 0.02, 0.0] }), cards: { per: 6, spread: [0.3, 1.3], size: [1.4, 2.0], up: 0.9 } },
    { id: "metasequoia", name: "水杉", h: 18, decid: 1, evergreen: false, leaf: "conifer", tint: [1.15, 1.3, 1.05], transl: 0.18, seed: 404, bark: "bark", conifer: true },
    { id: "willow", name: "垂柳", h: 9, decid: 0.4, evergreen: false, leaf: "willow", tint: [0.9, 1.05, 0.82], transl: 0.6, seed: 505, bark: "bark", weeping: true,
      grow: (h) => ({ len: h * 0.42, rad: 0.12 + h * 0.016, depth: 4, children: [5, 3, 4, 2], childStart: [0.6, 0.3, 0.2, 0.2], spread: [1.05, 0.9, 0.5, 0.35],
        upBias: [0.45, 0.35, -0.6, -1.0], lenDecay: 0.86, radDecay: 0.6, wiggle: [0.08, 0.2, 0.12, 0.12], gravity: [0.0, -0.02, -0.28, -0.45] }) },
    { id: "cherry", name: "樱花", h: 7, decid: 1, evergreen: false, leaf: "green", blossom: true, tint: [0.88, 1.0, 0.72], transl: 0.5, seed: 606, bark: "sakuraBark",
      grow: (h) => ({ len: h * 0.36, rad: 0.1 + h * 0.016, depth: 4, children: [5, 3, 3, 2], childStart: [0.55, 0.3, 0.3, 0.3], spread: [1.05, 0.85, 0.75, 0.6],
        upBias: [0.3, 0.18, 0.12, 0.1], lenDecay: 0.66, radDecay: 0.62, wiggle: [0.1, 0.25, 0.3, 0.35], gravity: [0.0, -0.03, -0.05, -0.06] }), cards: { per: 4, spread: [0.15, 0.6], size: [0.9, 1.25], up: 1.2 } },
  ];
  const SP_BY_ID = {}; SPECIES.forEach((s, i) => { s.index = i; SP_BY_ID[s.id] = s; });

  function cardGeo(e) {
    const g = new THREE.PlaneGeometry(1, 1, 1, 1);
    g.applyMatrix4(e.m);
    const n = g.attributes.position.count, c = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { c[i * 3] = e.c.r; c[i * 3 + 1] = e.c.g; c[i * 3 + 2] = e.c.b; }
    g.setAttribute("color", new THREE.BufferAttribute(c, 3));
    return g;
  }
  // 用池塘的 growTree / addCard 生成原型；树皮按全景尺度重新以较低分段生成
  function buildPrototype(sp) {
    rng = mulberry32(sp.seed);
    const cards = [], bark = [];
    const tint = () => new THREE.Color().setRGB(sp.tint[0] * rr(0.85, 1.12), sp.tint[1] * rr(0.9, 1.1), sp.tint[2] * rr(0.85, 1.12));
    if (sp.conifer) {
      const h = sp.h;
      bark.push(taperTube(new THREE.CatmullRomCurve3([new V3(0, -0.3, 0), new V3(0.12, h * 0.5, 0), new V3(0, h * 0.97, 0)]), 10, 7, 0.42, 0.05, 0.5));
      for (let y = 2.0; y < h; y += 0.75) {
        const rad = Math.pow(1 - y / h, 0.85) * 3.1 + 0.35, cnt = Math.round(rad * 2.0 + 2);
        for (let i = 0; i < cnt; i++) {
          const a = rand() * 6.28, r = rad * Math.sqrt(rr(0.3, 1));
          addCard(cards, new V3(Math.cos(a) * r, y, Math.sin(a) * r), new V3(Math.cos(a), 0.9, Math.sin(a)), rr(2.0, 2.8), tint());
        }
      }
      return { cards, bark, h };
    }
    const g = sp.grow(sp.h);
    const nb = BARK.length;
    const tips = growTree(Object.assign({ base: new V3(0, -0.3, 0), dir: new V3(rr(-0.06, 0.06), 1, rr(-0.06, 0.06)).normalize() }, g));
    BARK.splice(nb);   // 池塘分段太细：全景按级别重新生成
    for (const b of tips.branches) {
      if (b.lvl > (sp.weeping ? 2 : 2) || b.r0 < 0.03) continue;
      const seg = b.lvl === 0 ? [10, 8] : b.lvl === 1 ? [6, 5] : [3, 4];
      bark.push(taperTube(b.curve, seg[0], seg[1], b.r0, Math.max(b.r1, 0.02), 0.6));
    }
    if (sp.weeping) {
      for (const b of tips.branches) {
        if (b.lvl < 3) continue;
        for (let t = 0.12; t <= 1.0; t += 0.16) {
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
        }
      }
    }
    let top = 0; for (const c of cards) top = Math.max(top, c.m.elements[13]);
    return { cards, bark, h: top + 1 };
  }

  function create(scene, campus, opts) {
    opts = opts || {};
    const look = opts.look, renderer = opts.renderer;
    const patch = look.patch, depth = look.depth, U = look.U;
    const W = campus.W;
    const S = campus.S;
    let seed = 1234;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const pixelRatio = () => (renderer ? renderer.getPixelRatio() : 1);
    const quality = () => (look ? look.quality : "clear");

    // ================= 树木 =================
    const zones = opts.zones || [];
    const lawnZone = zones.find((z) => z.id === "central_lawn");
    const catHome = lawnZone ? lawnZone.center : [850, 1090];
    const spots = campus.treeSpots(320, (p) => Math.hypot(p[0] - catHome[0], p[1] - catHome[1]) < 55); // 给小猫留出空草地
    const NT = spots.length;
    // 树种分配：水边垂柳；路边香樟/银杏行道树；其余按比例混种
    const trees = spots.map((p, i) => {
      const r = rnd(), wd = campus.waterDistPx ? campus.waterDistPx(p) : 999, rd = campus.roadDistPx ? campus.roadDistPx(p) : 999;
      let sp;
      if (wd < 55 && r < 0.85) sp = "willow";
      else if (rd < 30) sp = r < 0.55 ? "camphor" : r < 0.85 ? "ginkgo" : "osmanthus";
      else sp = r < 0.32 ? "camphor" : r < 0.5 ? "osmanthus" : r < 0.64 ? "ginkgo" : r < 0.8 ? "metasequoia" : r < 0.92 ? "cherry" : "willow";
      const [x, z] = W(p);
      return { p, x, z, sp: SP_BY_ID[sp], s: 0.8 + rnd() * 0.45, rot: rnd() * Math.PI * 2, tint: new THREE.Color().setRGB(0.9 + rnd() * 0.2, 0.92 + rnd() * 0.16, 0.88 + rnd() * 0.2) };
    });

    // 材质
    const LEAF_TEX = {
      green: TEX.greenLeaves, shrub: TEX.shrubLeaves, conifer: TEX.conifer, willow: TEX.sakura,   // 池塘里 TEX.sakura 已换成垂柳叶卡
      blossom: leafCard("sakura"), bloom: TEX.bloomLeaves, kikyo: leafCard("kikyo"),
    };
    const barkMat = {};
    function barkMaterial(kind) {
      if (barkMat[kind]) return barkMat[kind];
      const set = TEX[kind] || TEX.bark;
      const m = patch(new THREE.MeshStandardMaterial({ map: set.map, normalMap: set.normalMap, normalScale: new THREE.Vector2(1.4, 1.4), roughness: 0.92, color: kind === "bark" ? 0xb8aaa0 : 0xffffff, envMapIntensity: 0.6 }),
        { key: "bark", wind: true, windWeight: "clamp((wPos4.y - 3.0) * 0.02, 0.0, 0.25)" });
      barkMat[kind] = m;
      return m;
    }
    const leafMats = [];
    function leafMaterial(sp, texKey) {
      const m = patch(new THREE.MeshStandardMaterial({ map: LEAF_TEX[texKey], alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.62, envMapIntensity: 0.55, vertexColors: true }),
        { key: "leaf", leaf: true, transl: sp.transl, decid: sp.decid, wind: true, windWeight: "clamp((wPos4.y - 1.5) * 0.06, 0.0, 1.2)", alphaMip: 512,
          fsMap: "diffuseColor.a *= smoothstep(0.2, 0.45, abs(dot(normalize(vNormal), normalize(vViewPosition))));\n" });
      leafMats.push(m);
      return m;
    }

    // 原型 + impostor
    const impScene = new THREE.Scene();
    // 采集近似反照率（环境光 π·0.7 ≈ 0.7 倍反照率 + 顶光 π·0.3），运行时再由场景光照着色，避免重复打光发白
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
      const prevEnv = impScene.environment;
      renderer.setRenderTarget(rt); renderer.setClearColor(0x1d2614, 0); renderer.clear();
      renderer.render(impScene, impCam);
      renderer.setRenderTarget(null); renderer.setClearColor(prevClear, prevA);
      U.uSnowCover.value = saved.snow; U.uWet.value = saved.wet; U.uAutumn.value = saved.aut; U.uWind.value = saved.wind; U.uSunColor.value.copy(saved.sc);
      impScene.environment = prevEnv;
      meshes.forEach((m) => impScene.remove(m));
      return rt.texture;
    }

    const MAXN = 90;
    const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new V3(), _s = new V3(), _y = new V3(0, 1, 0);
    let triNear = 0;
    SPECIES.forEach((sp) => {
      const list = trees.filter((t) => t.sp === sp);
      sp.trees = list;
      if (!list.length) return;
      const proto = buildPrototype(sp);
      const leafGeo = mergeGeos(proto.cards.map(cardGeo));
      const barkGeo = mergeGeos(proto.bark);
      leafGeo.computeBoundingBox();
      const bb = leafGeo.boundingBox;
      sp.W = Math.max(Math.abs(bb.min.x), Math.abs(bb.max.x), Math.abs(bb.min.z), Math.abs(bb.max.z)) * 2 + 0.4;
      sp.H = bb.max.y + 0.6;
      sp.texKey = sp.leaf;
      sp.leafMat = leafMaterial(sp, sp.leaf);
      if (sp.blossom) sp.blossomMat = leafMaterial(Object.assign({}, sp, { decid: 0, transl: 0.95 }), "blossom");
      sp.barkMat = barkMaterial(sp.bark);
      const nb = new THREE.InstancedMesh(barkGeo, sp.barkMat, MAXN), nl = new THREE.InstancedMesh(leafGeo, sp.leafMat, MAXN);
      nb.castShadow = nl.castShadow = true; nb.receiveShadow = nl.receiveShadow = true;
      nb.customDepthMaterial = depth({ key: "barkd", wind: true, windWeight: "clamp((wPos4.y - 3.0) * 0.02, 0.0, 0.25)" });
      nl.customDepthMaterial = depth({ key: "leafd", wind: true, windWeight: "clamp((wPos4.y - 1.5) * 0.06, 0.0, 1.2)", alphaMip: 512 }, LEAF_TEX[sp.leaf], 0.45);
      nb.frustumCulled = nl.frustumCulled = false;
      nb.count = nl.count = 0; nb.visible = nl.visible = false;
      nl.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAXN * 3).fill(1), 3);
      scene.add(nb, nl);
      sp.nearBark = nb; sp.nearLeaf = nl;
      triNear += (barkGeo.index.count + leafGeo.index.count) / 3;
      sp.protoTris = (barkGeo.index.count + leafGeo.index.count) / 3;
      // impostor：常态 / 落叶（冬）/ 开花（春）
      const capB = new THREE.Mesh(barkGeo, sp.barkMat), capL = new THREE.Mesh(leafGeo, sp.leafMat);
      sp.imp = { leafy: renderImpostor([capB, capL], sp.W, sp.H) };
      if (!sp.evergreen) sp.imp.bare = renderImpostor([new THREE.Mesh(barkGeo, sp.barkMat)], sp.W, sp.H);
      if (sp.blossom) sp.imp.blossom = renderImpostor([new THREE.Mesh(barkGeo, sp.barkMat), new THREE.Mesh(leafGeo, sp.blossomMat)], sp.W, sp.H);
      const impMat = patch(new THREE.MeshStandardMaterial({ map: sp.imp.leafy, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.85, envMapIntensity: 0.5 }),
        { key: "imp", billboard: true, leaf: true, transl: sp.transl * 0.5, decid: sp.decid, alphaMip: 256,
          fsMap: "diffuseColor.rgb *= 0.62 + 0.38 * smoothstep(0.05, 0.95, vMapUv.y);\n" });   // 树冠下部的自遮挡
      sp.impMat = impMat;
      const qg = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
      const far = new THREE.InstancedMesh(qg, impMat, list.length);
      far.castShadow = true; far.receiveShadow = false; far.frustumCulled = false;
      far.customDepthMaterial = depth({ key: "impd", billboard: true, alphaMip: 256 }, sp.imp.leafy, 0.5);
      far.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(list.length * 3).fill(1), 3);
      scene.add(far);
      sp.far = far;
    });

    // LOD：每 0.25 秒按相机距离分配近处（真实几何）/ 远处（公告板）
    let lodT = 0;
    const lodStats = { near: 0, far: 0 };
    function updateLOD(camPos) {
      const clear = quality() === "clear";
      const nearDist = clear ? 230 : 150, maxNear = clear ? 70 : 32;
      const all = [];
      for (const t of trees) { t.d = Math.hypot(t.x - camPos.x, t.z - camPos.z, camPos.y * 0.6); all.push(t); }
      all.sort((a, b) => a.d - b.d);
      let nNear = 0;
      for (const t of all) { t.near = t.d < nearDist && nNear < maxNear; if (t.near) nNear++; }
      lodStats.near = nNear; lodStats.far = trees.length - nNear;
      SPECIES.forEach((sp) => {
        if (!sp.trees || !sp.trees.length) return;
        let n = 0, f = 0;
        for (const t of sp.trees) {
          if (t.near) {
            if (n >= MAXN) continue;
            _q.setFromAxisAngle(_y, t.rot);
            _m.compose(_p.set(t.x, 0, t.z), _q, _s.set(t.s, t.s, t.s));
            sp.nearBark.setMatrixAt(n, _m); sp.nearLeaf.setMatrixAt(n, _m); sp.nearLeaf.setColorAt(n, t.tint);
            n++;
          } else {
            _m.compose(_p.set(t.x, 0, t.z), _q.identity(), _s.set(t.s * sp.W, t.s * sp.H, t.s * sp.W));
            sp.far.setMatrixAt(f, _m); sp.far.setColorAt(f, t.tint);
            f++;
          }
        }
        sp.nearBark.count = sp.nearLeaf.count = n;
        sp.nearBark.visible = n > 0; sp.nearLeaf.visible = n > 0 && !sp.leafOff;
        sp.far.count = f; sp.far.visible = f > 0;
        sp.nearBark.instanceMatrix.needsUpdate = sp.nearLeaf.instanceMatrix.needsUpdate = sp.far.instanceMatrix.needsUpdate = true;
        sp.nearLeaf.instanceColor.needsUpdate = sp.far.instanceColor.needsUpdate = true;
        sp.far.castShadow = clear;
      });
    }

    // ================= 灌木（杜鹃）与花丛（只在近处显示） =================
    const L = opts.layout;
    const shrubSpots = [];
    (function () {
      const blockers = [];
      L.buildings.forEach((b) => (b.parts ? b.parts.map((p) => p.poly) : b.poly ? [b.poly] : []).forEach((p) => blockers.push(p)));
      const areas = L.water.map((w) => w.poly).concat(L.sports.map((s) => s.poly)).concat(L.plazas.map((p) => p.poly));
      L.campus_roads.forEach((r) => {
        const pts = r.path, hw = r.width / 2 + 6;
        for (let i = 0; i < pts.length - 1; i++) {
          const a = pts[i], b = pts[i + 1], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
          const nx = -(b[1] - a[1]) / len, ny = (b[0] - a[0]) / len;
          for (let d = 20; d < len - 10; d += 26) {
            for (const side of [-1, 1]) {
              if (rnd() < 0.35) continue;
              const p = [a[0] + (b[0] - a[0]) * (d / len) + nx * hw * side, a[1] + (b[1] - a[1]) * (d / len) + ny * hw * side];
              if (!campus.inPoly(p, L.boundary)) continue;
              if (blockers.some((q) => campus.inPoly(p, q) || campus.polyDist(p, q) < 4)) continue;
              if (areas.some((q) => campus.inPoly(p, q) || campus.polyDist(p, q) < 3)) continue;
              if (L.campus_roads.some((rr2) => campus.polyDist(p, rr2.path, false) < rr2.width / 2 + 3)) continue;
              if (spots.some((s) => Math.hypot(s[0] - p[0], s[1] - p[1]) < 8)) continue;
              shrubSpots.push(p);
            }
          }
        }
      });
    })();
    const shrub = (function () {
      rng = mulberry32(707);
      const leaves = [], blooms = [];
      for (let i = 0; i < 70; i++) {
        const a = rand() * 6.28, u = Math.sqrt(rand()), r = 1.25 * u, y = 0.15 + Math.sqrt(Math.max(0, 1 - u * u)) * 0.95;
        addCard(leaves, new V3(Math.cos(a) * r, y, Math.sin(a) * r * 0.8), new V3(Math.cos(a) * u, 1.0, Math.sin(a) * u), rr(0.55, 0.8), new THREE.Color().setRGB(rr(0.65, 0.85), rr(0.8, 1.0), rr(0.55, 0.75)));
        if (i % 2 === 0) addCard(blooms, new V3(Math.cos(a) * r * 1.02, y + 0.06, Math.sin(a) * r * 0.82), new V3(Math.cos(a) * u, 1.0, Math.sin(a) * u), rr(0.45, 0.65), new THREE.Color().setRGB(1.0, rr(0.45, 0.62), rr(0.62, 0.78)));
      }
      const lg = mergeGeos(leaves.map(cardGeo)), bg = mergeGeos(blooms.map(cardGeo));
      const n = shrubSpots.length;
      const lm = new THREE.InstancedMesh(lg, leafMaterial({ transl: 0.3, decid: 0.3 }, "shrub"), Math.max(1, n));
      const bm = new THREE.InstancedMesh(bg, leafMaterial({ transl: 0.6, decid: 0 }, "bloom"), Math.max(1, n));
      lm.castShadow = true; lm.receiveShadow = bm.receiveShadow = true; lm.frustumCulled = bm.frustumCulled = false;
      lm.customDepthMaterial = depth({ key: "leafd", wind: true, windWeight: "clamp((wPos4.y - 1.5) * 0.06, 0.0, 1.2)", alphaMip: 512 }, LEAF_TEX.shrub, 0.45);
      scene.add(lm, bm);
      return { lm, bm, n, tris: (lg.index.count + bg.index.count) / 3, rot: shrubSpots.map(() => rnd() * 6.28), sc: shrubSpots.map(() => 0.8 + rnd() * 0.5) };
    })();
    function updateShrubs(camPos) {
      const clear = quality() === "clear";
      const maxD = clear ? 300 : 180, cap = clear ? 220 : 110;
      const idx = [];
      shrubSpots.forEach((p, i) => { const [x, z] = W(p); const d = Math.hypot(x - camPos.x, z - camPos.z, camPos.y * 0.7); if (d < maxD) idx.push([d, i, x, z]); });
      idx.sort((a, b) => a[0] - b[0]);
      let k = 0;
      for (const [, i, x, z] of idx) {
        if (k >= cap) break;
        _q.setFromAxisAngle(_y, shrub.rot[i]); const s = shrub.sc[i];
        _m.compose(_p.set(x, 0.6, z), _q, _s.set(s, s, s));
        shrub.lm.setMatrixAt(k, _m); shrub.bm.setMatrixAt(k, _m); k++;
      }
      shrub.lm.count = shrub.bm.count = k;
      shrub.lm.visible = k > 0; shrub.bm.visible = k > 0 && shrub.bloomOn;
      shrub.lm.instanceMatrix.needsUpdate = shrub.bm.instanceMatrix.needsUpdate = true;
    }

    // 中心草坪的花丛（桔梗叶卡，春夏）
    const flowers = (() => {
      rng = mulberry32(808);
      const cards = [];
      for (let i = 0; i < 5; i++) addCard(cards, new V3(rr(-0.4, 0.4), 0.35, rr(-0.4, 0.4)), new V3(rr(-0.4, 0.4), 1, rr(-0.4, 0.4)), rr(0.6, 0.85), new THREE.Color(1, 1, 1));
      const g = mergeGeos(cards.map(cardGeo));
      const n = 220;
      const m = new THREE.InstancedMesh(g, leafMaterial({ transl: 0.5, decid: 0 }, "kikyo"), n);
      const poly = lawnZone ? lawnZone.polygon : null;
      let k = 0, tries = 0;
      while (poly && k < n && tries < 5000) {
        tries++;
        const p = [catHome[0] + (rnd() - 0.5) * 300, catHome[1] + (rnd() - 0.5) * 300];
        if (!campus.inPoly(p, poly) || campus.polyDist(p, poly) < 12) continue;
        const [x, z] = W(p), s = 0.8 + rnd() * 0.6;
        _q.setFromAxisAngle(_y, rnd() * 6.28);
        _m.compose(_p.set(x, 0, z), _q, _s.set(s, s, s));
        m.setMatrixAt(k, _m); k++;
      }
      m.count = k; m.receiveShadow = true;
      scene.add(m);
      return m;
    })();

    // ================= 荷叶（荷花池，夏季；池塘同款睡莲叶贴图） =================
    const lotus = (() => {
      const n = 46;
      const padMat = patch(new THREE.MeshStandardMaterial({ map: TEX.lily, roughness: 0.55, envMapIntensity: 0.7 }), { key: "pad" });
      const m = new THREE.InstancedMesh(new THREE.CircleGeometry(1.4, 16).rotateX(-Math.PI / 2), padMat, n);
      const flowerMat = patch(new THREE.MeshStandardMaterial({ color: 0xf2a2c0, roughness: 0.5 }), { key: "lotusflower" });
      const fm = new THREE.InstancedMesh(new THREE.ConeGeometry(0.35, 0.8, 8).translate(0, 0.4, 0), flowerMat, 12);
      const poly = L && L.water.find((w) => w.id === "hehuachi");
      let k = 0, kf = 0, tries = 0;
      while (poly && k < n && tries < 3000) {
        tries++;
        const xs = poly.poly.map((p) => p[0]), ys = poly.poly.map((p) => p[1]);
        const p = [Math.min(...xs) + rnd() * (Math.max(...xs) - Math.min(...xs)), Math.min(...ys) + rnd() * (Math.max(...ys) - Math.min(...ys))];
        if (!campus.inPoly(p, poly.poly) || campus.polyDist(p, poly.poly) < 5) continue;
        const [x, z] = W(p);
        const s = 0.6 + rnd() * 0.9;
        _q.setFromAxisAngle(_y, rnd() * 6.28);
        _m.compose(_p.set(x, 0.4, z), _q, _s.set(s, 1, s));
        m.setMatrixAt(k, _m);
        if (kf < 12 && rnd() < 0.3) { _m.compose(_p.set(x + 0.6, 0.4, z + 0.3), _q.identity(), _s.set(1, 1, 1)); fm.setMatrixAt(kf++, _m); }
        k++;
      }
      m.count = k; fm.count = kf; m.receiveShadow = true;
      scene.add(m, fm);
      return { m, fm };
    })();

    // ================= 路灯（深灰金属灯杆 + 乳白灯罩，与池塘庭院灯同款造型放大） =================
    const lampPts = [];
    opts.layout && opts.layout.campus_roads.forEach((r) => {
      const pts = r.path;
      const hw = r.width / 2 + 4;
      let carry = 0;
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1];
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const nx = -(b[1] - a[1]) / len, ny = (b[0] - a[0]) / len;
        for (let d = carry; d < len; d += 90) {
          const t = d / len;
          const side = lampPts.length % 2 ? 1 : -1;
          lampPts.push([a[0] + (b[0] - a[0]) * t + nx * hw * side, a[1] + (b[1] - a[1]) * t + ny * hw * side]);
          carry = d + 90 - len;
        }
      }
    });
    const NL = lampPts.length;
    const lampMetal = patch(new THREE.MeshStandardMaterial({ color: 0x2a2f33, roughness: 0.45, metalness: 0.7, envMapIntensity: 0.8 }), { key: "lampmetal" });
    const poleGeo = mergeGeos([
      new THREE.CylinderGeometry(0.28, 0.32, 0.3, 12).translate(0, 0.15, 0),
      new THREE.CylinderGeometry(0.09, 0.13, 5.6, 10).translate(0, 3.0, 0),
      new THREE.CylinderGeometry(0.4, 0.12, 0.2, 14).translate(0, 5.9, 0),
      new THREE.CylinderGeometry(0.5, 0.5, 0.07, 16).translate(0, 6.75, 0),
      new THREE.ConeGeometry(0.5, 0.3, 16).translate(0, 6.92, 0),
    ]);
    const poles = new THREE.InstancedMesh(poleGeo, lampMetal, Math.max(1, NL));
    const bulbMat = new THREE.MeshBasicMaterial({ color: 0x555a60 });
    const bulbs = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.36, 0.32, 0.7, 14), bulbMat, Math.max(1, NL));
    const glowTex = (() => {
      const c = document.createElement("canvas"); c.width = c.height = 64;
      const g = c.getContext("2d"); const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.25, "rgba(255,255,255,0.55)"); gr.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
      return new THREE.CanvasTexture(c);
    })();
    const poolMatL = new THREE.MeshBasicMaterial({ map: glowTex, color: "#ffcf7a", transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: true });
    const lightPools = new THREE.InstancedMesh(new THREE.PlaneGeometry(18, 18).rotateX(-Math.PI / 2), poolMatL, Math.max(1, NL));
    const haloPos = new Float32Array(Math.max(1, NL) * 3);
    lampPts.forEach((p, i) => {
      const [x, z] = W(p);
      _m.compose(_p.set(x, 0.7, z), _q.identity(), _s.set(1, 1, 1)); poles.setMatrixAt(i, _m);
      _m.compose(_p.set(x, 0.7 + 6.4, z), _q.identity(), _s.set(1, 1, 1)); bulbs.setMatrixAt(i, _m);
      _m.compose(_p.set(x, 1.0, z), _q.identity(), _s.set(1, 1, 1)); lightPools.setMatrixAt(i, _m);
      haloPos.set([x, 7.1, z], i * 3);
    });
    poles.count = bulbs.count = lightPools.count = NL;
    poles.castShadow = true; poles.receiveShadow = true;
    const haloGeo = new THREE.BufferGeometry(); haloGeo.setAttribute("position", new THREE.BufferAttribute(haloPos, 3));
    haloGeo.setDrawRange(0, NL);
    const haloMat = new THREE.PointsMaterial({ map: glowTex, color: "#ffd38a", size: 6, sizeAttenuation: true, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
    const halos = new THREE.Points(haloGeo, haloMat);
    lightPools.renderOrder = 2;
    scene.add(poles, bulbs, lightPools, halos);
    look.noReflect.push(lightPools, halos, poles, bulbs);

    // ================= GPU 粒子：雨 / 雪 / 花瓣 / 落叶 / 萤火虫 =================
    function particleSystem(o) {
      const n = o.count;
      const seeds = new Float32Array(n * 4);
      for (let i = 0; i < n * 4; i++) seeds[i] = rnd();
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
      g.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 4));
      const u = {
        uTime: { value: 0 }, uCenter: { value: new THREE.Vector3() }, uArea: { value: o.area }, uHeight: { value: o.height },
        uSpeed: { value: o.speed }, uSway: { value: o.sway || 0 }, uSize: { value: o.size }, uPR: { value: 1 },
        uColor: { value: new THREE.Color(o.color) }, uColor2: { value: new THREE.Color(o.color2 || o.color) }, uOpacity: { value: 0 },
        uWind: { value: new THREE.Vector2(0, 0) }, uBase: { value: o.base || 0 }, uLight: { value: 1 },
      };
      const m = new THREE.ShaderMaterial({
        uniforms: u, transparent: true, depthWrite: false,
        blending: o.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
        vertexShader: [
          "attribute vec4 aSeed; uniform float uTime, uArea, uHeight, uSpeed, uSway, uSize, uPR, uBase; uniform vec3 uCenter; uniform vec2 uWind;",
          "varying float vA; varying float vRot; varying float vMix;",
          "void main(){",
          "  float sp = uSpeed * (0.75 + 0.5 * aSeed.w);",
          "  float y = uBase + mod(aSeed.y * uHeight - uTime * sp, uHeight);",
          "  vec2 xz = aSeed.xz * uArea + uWind * (uHeight - y) * 0.12;",
          "  xz += vec2(sin(uTime * (0.6 + aSeed.w) + aSeed.w * 40.0), cos(uTime * (0.5 + aSeed.y) + aSeed.x * 30.0)) * uSway;",
          "  xz = mod(xz - uCenter.xz + uArea * 0.5, uArea) + uCenter.xz - uArea * 0.5;",
          o.firefly
            ? "  y = uBase + aSeed.y * uHeight + sin(uTime * (0.8 + aSeed.w) + aSeed.x * 50.0) * 1.2; vA = pow(max(sin(uTime * (1.5 + aSeed.w * 2.0) + aSeed.z * 60.0), 0.0), 3.0);"
            : "  vA = 1.0;",
          "  vRot = aSeed.w * 6.28 + uTime * (aSeed.x - 0.5) * 4.0; vMix = aSeed.z;",
          "  vec4 mv = modelViewMatrix * vec4(xz.x, y, xz.y, 1.0);",
          "  gl_PointSize = min(uSize * uPR * (300.0 / max(-mv.z, 1.0)), 28.0 * uPR);",
          "  gl_Position = projectionMatrix * mv;",
          "}",
        ].join("\n"),
        fragmentShader: [
          "uniform vec3 uColor; uniform vec3 uColor2; uniform float uOpacity; uniform float uLight; varying float vA; varying float vRot; varying float vMix;",
          "void main(){",
          "  vec2 c = gl_PointCoord - 0.5; float a;",
          o.shape === "streak"
            ? "  a = (1.0 - smoothstep(0.015, 0.05, abs(c.x))) * (1.0 - smoothstep(0.25, 0.5, abs(c.y))) * (0.5 + c.y);"
            : o.shape === "petal"
            ? "  float cs = cos(vRot), sn = sin(vRot); vec2 r = vec2(c.x*cs - c.y*sn, c.x*sn + c.y*cs); a = 1.0 - smoothstep(0.18, 0.24, length(r * vec2(1.0, 2.2)));"
            : "  a = 1.0 - smoothstep(0.15, 0.5, length(c));",
          "  vec3 col = mix(uColor, uColor2, step(0.5, vMix)) * uLight;",
          "  gl_FragColor = vec4(col, a * vA * uOpacity);",
          "  if (gl_FragColor.a < 0.01) discard;",
          "  #include <tonemapping_fragment>",
          "  #include <colorspace_fragment>",
          "}",
        ].join("\n"),
      });
      const p = new THREE.Points(g, m);
      p.frustumCulled = false;
      p.visible = false;
      scene.add(p);
      look.noReflect.push(p);
      return { points: p, u, n };
    }
    const rain = particleSystem({ count: 9000, area: 700, height: 320, speed: 160, size: 9, color: "#9fb0c2", shape: "streak" });
    const snow = particleSystem({ count: 6000, area: 700, height: 320, speed: 9, sway: 6, size: 5, color: "#f4f7fb", shape: "round" });
    const petals = particleSystem({ count: 1200, area: 600, height: 70, speed: 2.2, sway: 5, size: 9, color: "#f3c3d3", color2: "#fbe1ea", shape: "petal" });
    const leaves = particleSystem({ count: 1100, area: 600, height: 70, speed: 3.2, sway: 6, size: 10, color: "#d29a2b", color2: "#bb4a27", shape: "petal" });
    const fireflies = particleSystem({ count: 700, area: 500, height: 6, base: 0.6, speed: 0, size: 3.2, color: "#d8ff7a", shape: "round", additive: true, firefly: true });

    // ================= 鸟群（Boids；写实小型雀鸟剪影） =================
    const BIRDS_PER_FLOCK = 18, FLOCKS = 2, NB = BIRDS_PER_FLOCK * FLOCKS;
    const birdMat = patch(new THREE.MeshStandardMaterial({ color: 0x3a332c, roughness: 0.85, side: THREE.DoubleSide }), { key: "bird", noWeather: true });
    const bodyGeo = new THREE.SphereGeometry(0.5, 10, 6); bodyGeo.scale(0.55, 0.5, 1.5); // 朝 +z
    const wingShape = (s) => { const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0.55, 0, 0, -0.45, 1.6 * s, 0.05, 0.25, 0, 0, -0.45, 2.9 * s, 0.1, -0.35, 1.6 * s, 0.05, 0.25], 3)); g.computeVertexNormals(); return g; };
    const birdBody = new THREE.InstancedMesh(bodyGeo, birdMat, NB);
    const birdWL = new THREE.InstancedMesh(wingShape(1), birdMat, NB);
    const birdWR = new THREE.InstancedMesh(wingShape(-1), birdMat, NB);
    [birdBody, birdWL, birdWR].forEach((m) => { m.frustumCulled = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.castShadow = true; scene.add(m); });
    const birds = [];
    for (let f = 0; f < FLOCKS; f++) {
      for (let i = 0; i < BIRDS_PER_FLOCK; i++) {
        birds.push({
          f, p: new THREE.Vector3((rnd() - 0.5) * 60, 90 + rnd() * 30, (rnd() - 0.5) * 60),
          v: new THREE.Vector3(rnd() - 0.5, 0, rnd() - 0.5).setLength(12), phase: rnd() * 6.28, rate: 7 + rnd() * 3,
        });
      }
    }
    const goal = [new THREE.Vector3(), new THREE.Vector3()];
    let birdVis = 1;
    const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3(), tmpC = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    const bm = new THREE.Matrix4(), wm = new THREE.Matrix4(), rm = new THREE.Matrix4(), lookM = new THREE.Matrix4();
    function updateBirds(dt, t) {
      goal[0].set(Math.sin(t * 0.05) * 280, 105 + Math.sin(t * 0.21) * 20, Math.sin(t * 0.1) * 220);
      goal[1].set(Math.cos(t * 0.043 + 2) * 300, 135 + Math.cos(t * 0.17) * 18, Math.sin(t * 0.083 + 1) * 260);
      const shown = Math.round(NB * birdVis);
      for (let i = 0; i < NB; i++) {
        const b = birds[i];
        if (i < shown) {
          const sep = tmpA.set(0, 0, 0), ali = tmpB.set(0, 0, 0), coh = tmpC.set(0, 0, 0);
          let n = 0;
          for (let j = 0; j < NB; j++) {
            if (j === i) continue;
            const o = birds[j];
            if (o.f !== b.f) continue;
            const d = b.p.distanceTo(o.p);
            if (d < 40) {
              ali.add(o.v); coh.add(o.p); n++;
              if (d < 7) sep.addScaledVector(b.p.clone().sub(o.p), (7 - d) / (d + 0.1));
            }
          }
          const acc = new THREE.Vector3();
          if (n) {
            ali.divideScalar(n).sub(b.v).multiplyScalar(0.6);
            coh.divideScalar(n).sub(b.p).multiplyScalar(0.12);
            acc.add(ali).add(coh);
          }
          acc.addScaledVector(sep, 1.6);
          acc.addScaledVector(goal[b.f].clone().sub(b.p), 0.02);
          b.v.addScaledVector(acc, dt);
          const sp = b.v.length();
          if (sp > 18) b.v.multiplyScalar(18 / sp); else if (sp < 9) b.v.multiplyScalar(9 / Math.max(sp, 0.01));
          b.p.addScaledVector(b.v, dt);
          if (b.p.y < 45) b.v.y += 8 * dt;
          b.phase += dt * b.rate * (b.v.y > 0 ? 1.4 : 0.8);
          lookM.lookAt(tmpA.copy(b.p).add(b.v), b.p, up); // 让 +z 指向速度方向
          bm.copy(lookM).setPosition(b.p);
          const glide = Math.sin(b.phase * 0.21) > 0.6 ? 0.25 : 1;   // 偶尔滑翔
          const flap = Math.sin(b.phase) * 0.7 * glide + 0.1;
          birdBody.setMatrixAt(i, bm);
          wm.copy(bm).multiply(rm.makeRotationZ(flap)); birdWL.setMatrixAt(i, wm);
          wm.copy(bm).multiply(rm.makeRotationZ(-flap)); birdWR.setMatrixAt(i, wm);
        } else {
          bm.makeScale(0, 0, 0);
          birdBody.setMatrixAt(i, bm); birdWL.setMatrixAt(i, bm); birdWR.setMatrixAt(i, bm);
        }
      }
      birdBody.instanceMatrix.needsUpdate = birdWL.instanceMatrix.needsUpdate = birdWR.instanceMatrix.needsUpdate = true;
    }

    // ================= 小猫追蝴蝶（中心草坪；写实橘色虎斑猫） =================
    const [hx, hz] = W(catHome);
    const lawnPolyW = lawnZone ? lawnZone.polygon : null;
    const inLawn = (x, z) => !lawnPolyW || campus.inPoly([x / S + 1024, z / S + 999], lawnPolyW);
    const PLAY_R = 30; // 米
    const cat = new THREE.Group();
    const CAT_SCALE = 2.2; // 略放大，便于全景远景看见
    {
      // 橘色虎斑：横向条纹 + 浅色腹部（毛色贴图），柔和粗糙度
      const cv = makeCanvas(256, 128), g = cv.getContext("2d");
      const grd = g.createLinearGradient(0, 0, 0, 128); grd.addColorStop(0, "#c8742b"); grd.addColorStop(0.55, "#dd9447"); grd.addColorStop(1, "#f1d9b6");
      g.fillStyle = grd; g.fillRect(0, 0, 256, 128);
      for (let i = 0; i < 16; i++) { g.strokeStyle = "rgba(120,58,18,0.55)"; g.lineWidth = 3 + (i % 3) * 2; g.beginPath(); const x = i * 16 + 4; g.moveTo(x, 0); g.bezierCurveTo(x + 6, 30, x - 6, 50, x + 3, 70); g.stroke(); }
      for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(${i % 2 ? "255,235,200" : "90,45,15"},0.12)`; g.fillRect(Math.random() * 256, Math.random() * 128, 1, 3); }
      const furTex = canvasTex(cv, true);
      const fur = patch(new THREE.MeshStandardMaterial({ map: furTex, roughness: 0.95, envMapIntensity: 0.5 }), { key: "fur", noWeather: true });
      const white = patch(new THREE.MeshStandardMaterial({ color: 0xf1e7d8, roughness: 0.95, envMapIntensity: 0.5 }), { key: "fur2", noWeather: true });
      const dark = new THREE.MeshStandardMaterial({ color: 0x15140f, roughness: 0.2 });
      const pink = new THREE.MeshStandardMaterial({ color: 0xd88d90, roughness: 0.6 });
      const mesh = (geo, m) => { const me = new THREE.Mesh(geo, m); me.castShadow = true; return me; };
      const body = mesh(new THREE.CapsuleGeometry(0.17, 0.5, 6, 12).rotateX(Math.PI / 2), fur); body.position.set(0, 0.5, 0); body.scale.set(1, 1.05, 1); cat.add(body);
      const chest = mesh(new THREE.SphereGeometry(0.15, 12, 8), white); chest.position.set(0, 0.45, 0.3); cat.add(chest);
      const head = new THREE.Group(); head.position.set(0, 0.74, 0.44); cat.add(head);
      const skull = mesh(new THREE.SphereGeometry(0.15, 16, 12), fur); skull.scale.set(1.05, 0.92, 1); head.add(skull);
      const muzzle = mesh(new THREE.SphereGeometry(0.075, 12, 8), white); muzzle.scale.set(1.2, 0.8, 0.9); muzzle.position.set(0, -0.045, 0.12); head.add(muzzle);
      const nose = mesh(new THREE.SphereGeometry(0.018, 8, 6), pink); nose.position.set(0, -0.02, 0.19); head.add(nose);
      [-0.065, 0.065].forEach((x) => {
        const e = mesh(new THREE.SphereGeometry(0.026, 10, 8), dark); e.position.set(x, 0.025, 0.125); head.add(e);
        const ear = mesh(new THREE.ConeGeometry(0.055, 0.12, 4), fur); ear.position.set(x * 1.45, 0.14, -0.01); ear.rotation.set(-0.15, Math.PI / 4, x > 0 ? -0.25 : 0.25); head.add(ear);
      });
      const legs = [];
      [[-0.09, 0.27], [0.09, 0.27], [-0.09, -0.25], [0.09, -0.25]].forEach(([x, z], i) => {
        const pivot = new THREE.Group(); pivot.position.set(x, 0.42, z);
        const leg = mesh(new THREE.CapsuleGeometry(0.04, 0.3, 4, 8), i < 2 ? white : fur); leg.position.y = -0.2; pivot.add(leg);
        cat.add(pivot); legs.push(pivot);
      });
      const tail = new THREE.Group(); tail.position.set(0, 0.58, -0.4); cat.add(tail);
      const seg1 = mesh(new THREE.CapsuleGeometry(0.035, 0.3, 4, 8).rotateX(Math.PI / 2), fur); seg1.position.z = -0.17; tail.add(seg1);
      const tail2 = new THREE.Group(); tail2.position.z = -0.33; tail.add(tail2);
      const seg2 = mesh(new THREE.CapsuleGeometry(0.032, 0.26, 4, 8).rotateX(Math.PI / 2), fur); seg2.position.z = -0.15; tail2.add(seg2);
      cat.userData = { legs, tail, tail2, head, body };
    }
    cat.scale.setScalar(CAT_SCALE);
    cat.position.set(hx, 0.05, hz);
    scene.add(cat);
    look.noReflect.push(cat, flowers, shrub.lm, shrub.bm);

    const BF_N = 7;
    const butterflies = [];
    {
      const wingColors = [["#f2b632", "#2a1a0a"], ["#ffffff", "#3a3a3a"], ["#5aa6e6", "#14243a"], ["#f08bb4", "#3a1424"], ["#ef8a2a", "#2a120a"], ["#b892f0", "#22163a"], ["#f4e06a", "#2a2410"]];
      const wingGeo = new THREE.PlaneGeometry(0.62, 0.55).translate(0.31, 0, 0).rotateX(-Math.PI / 2);
      for (let i = 0; i < BF_N; i++) {
        const [c1, c2] = wingColors[i % wingColors.length];
        const cv = makeCanvas(64, 64), g = cv.getContext("2d");
        g.fillStyle = c1; g.beginPath(); g.ellipse(26, 22, 24, 18, -0.3, 0, 6.28); g.fill(); g.beginPath(); g.ellipse(22, 46, 16, 13, 0.4, 0, 6.28); g.fill();
        g.strokeStyle = c2; g.lineWidth = 3; g.beginPath(); g.ellipse(26, 22, 24, 18, -0.3, 0, 6.28); g.stroke(); g.beginPath(); g.ellipse(22, 46, 16, 13, 0.4, 0, 6.28); g.stroke();
        g.fillStyle = c2; for (let k = 0; k < 4; k++) { g.beginPath(); g.arc(36 + k * 4, 12 + k * 5, 2.5, 0, 6.28); g.fill(); }
        const m = new THREE.MeshStandardMaterial({ map: canvasTex(cv, true), side: THREE.DoubleSide, alphaTest: 0.5, transparent: false, roughness: 0.6 });
        const grp = new THREE.Group();
        const l = new THREE.Mesh(wingGeo, m), r = new THREE.Mesh(wingGeo, m);
        r.scale.x = -1;
        const bodyM = new THREE.Mesh(new THREE.CapsuleGeometry(0.025, 0.3, 4, 6).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x1e1a16, roughness: 0.7 }));
        grp.add(l, r, bodyM);
        grp.scale.setScalar(1.5);
        grp.userData = { l, r, phase: rnd() * 6, home: new THREE.Vector3(hx + (rnd() - 0.5) * 30, 0, hz + (rnd() - 0.5) * 30), seed: rnd() * 100, flee: 0, pos: new THREE.Vector3() };
        grp.position.set(hx + (rnd() - 0.5) * 30, 2, hz + (rnd() - 0.5) * 30);
        scene.add(grp);
        butterflies.push(grp); look.noReflect.push(grp);
      }
    }
    const catState = { mode: "chase", target: 0, timer: 0, speed: 0, heading: 0, jump: 0, jumpFrom: null };
    let creaturesActive = true; // 夜间/雨天：蝴蝶隐藏、小猫打盹
    function updateButterflies(dt, t) {
      butterflies.forEach((b) => {
        const d = b.userData;
        b.visible = creaturesActive;
        if (!creaturesActive) return;
        d.phase += dt * 22;
        const flap = Math.sin(d.phase) * 1.0;
        d.l.rotation.z = flap; d.r.rotation.z = -flap;
        const s = d.seed;
        const tx = d.home.x + Math.sin(t * 0.33 + s) * 14 + Math.sin(t * 0.9 + s * 2) * 4;
        const tz = d.home.z + Math.cos(t * 0.27 + s * 1.7) * 14 + Math.cos(t * 1.1 + s) * 4;
        let ty = 1.6 + Math.sin(t * 1.7 + s) * 0.8 + Math.sin(t * 4.1 + s) * 0.25;
        if (d.flee > 0) { d.flee -= dt; ty += 5 * Math.sin(Math.min(1, d.flee / 2.5) * Math.PI); }
        const prev = d.pos.copy(b.position);
        b.position.x += (tx - b.position.x) * Math.min(1, dt * 1.6);
        b.position.z += (tz - b.position.z) * Math.min(1, dt * 1.6);
        b.position.y += (ty - b.position.y) * Math.min(1, dt * 2.5);
        const dx = b.position.x - prev.x, dz = b.position.z - prev.z;
        if (dx * dx + dz * dz > 1e-6) b.rotation.y = Math.atan2(dx, dz);
      });
    }
    function updateCat(dt, t) {
      const u = cat.userData, st = catState;
      if (!creaturesActive && st.mode !== "nap") { st.mode = "nap"; st.timer = 0; }
      if (creaturesActive && st.mode === "nap") { st.mode = "chase"; }
      let moving = 0;
      if (st.mode === "nap") {
        cat.position.y += (-0.35 - cat.position.y) * Math.min(1, dt * 3);   // 趴下打盹，尾巴轻摆
        u.legs.forEach((l) => (l.rotation.x = 0));
        u.head.rotation.x = 0.35;
        u.tail.rotation.y = Math.sin(t * 1.2) * 0.3;
      } else if (st.mode === "chase") {
        const b = butterflies[st.target];
        const tx = b.position.x, tz = b.position.z;
        const dx = tx - cat.position.x, dz = tz - cat.position.z, dist = Math.hypot(dx, dz);
        const want = Math.atan2(dx, dz);
        let dh = want - st.heading; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
        st.heading += dh * Math.min(1, dt * 4);
        st.speed += ((dist > 3 ? 6.5 : 2.5) - st.speed) * Math.min(1, dt * 2);
        const nx = cat.position.x + Math.sin(st.heading) * st.speed * dt, nz = cat.position.z + Math.cos(st.heading) * st.speed * dt;
        if (Math.hypot(nx - hx, nz - hz) < PLAY_R * 1.3 && inLawn(nx, nz)) { cat.position.x = nx; cat.position.z = nz; }
        else { st.target = (st.target + 1) % BF_N; }
        cat.position.y = 0.05;
        moving = st.speed;
        if (dist < 4 && b.position.y < 3) {
          st.mode = "pounce"; st.jump = 0; st.jumpFrom = cat.position.clone();
          st.jumpTo = new THREE.Vector3(tx, 0.05, tz);
          b.userData.flee = 2.5;
        }
      } else if (st.mode === "pounce") {
        st.jump += dt / 0.6;
        const k = Math.min(1, st.jump);
        cat.position.lerpVectors(st.jumpFrom, st.jumpTo, k);
        cat.position.y = 0.05 + Math.sin(k * Math.PI) * 1.6;
        u.legs.forEach((l, i) => (l.rotation.x = (i < 2 ? -1 : 1) * Math.sin(k * Math.PI) * 0.9));
        u.body.rotation.x = -Math.cos(k * Math.PI) * 0.25;
        if (k >= 1) { st.mode = "sit"; st.timer = 1.6 + rnd() * 1.8; u.body.rotation.x = 0; }
      } else if (st.mode === "sit") {
        st.timer -= dt;
        cat.position.y = 0.05;
        u.legs.forEach((l, i) => (l.rotation.x = i >= 2 ? 0.4 : 0));
        u.head.rotation.x = -0.35 + Math.sin(t * 2) * 0.1; // 抬头看飞走的蝴蝶
        u.tail.rotation.y = Math.sin(t * 6) * 0.6;
        if (st.timer <= 0) { st.mode = "chase"; st.target = Math.floor(rnd() * BF_N); u.head.rotation.x = 0; }
      }
      if (st.mode === "chase") {
        const ph = t * moving * 2.6;
        u.legs.forEach((l, i) => (l.rotation.x = Math.sin(ph + (i === 0 || i === 3 ? 0 : Math.PI)) * 0.7 * Math.min(1, moving / 4)));
        u.tail.rotation.x = 0.5 + Math.sin(t * 4) * 0.1;
        u.tail2.rotation.x = 0.6;
        u.tail.rotation.y = Math.sin(t * 3) * 0.25;
        u.head.rotation.x = 0;
      }
      cat.rotation.y = st.heading;
    }

    // ================= 季节 =================
    let curSeason = null, curWinter = null;
    function applySeason(season) {
      if (season === curSeason) return;
      curSeason = season;
      const winter = season === "winter", spring = season === "spring";
      SPECIES.forEach((sp) => {
        if (!sp.trees || !sp.trees.length) return;
        sp.leafOff = winter && !sp.evergreen;               // 落叶树冬季落光
        const map = sp.leafOff ? sp.imp.bare : spring && sp.blossom ? sp.imp.blossom : sp.imp.leafy;
        sp.impMat.map = map; sp.far.customDepthMaterial.map = map;
        sp.impMat.needsUpdate = true; sp.far.customDepthMaterial.needsUpdate = true;
        if (sp.blossom) sp.nearLeaf.material = spring ? sp.blossomMat : sp.leafMat;
      });
      shrub.bloomOn = spring;
      lotus.m.visible = season === "summer" || season === "spring"; lotus.fm.visible = season === "summer";
      flowers.visible = spring || season === "summer";
      lodT = 0;
    }

    // ================= 环境（由主程序设置） =================
    const env = { night: 0, cloud: 0, rain: 0, snow: 0, fog: 0, thunder: false, season: "autumn", wind: 10 };
    let flash = 0, nextFlash = 3;
    function setEnvironment(e) {
      Object.assign(env, e);
      applySeason(env.season);
    }

    // ================= 每帧更新 =================
    const center = new THREE.Vector3();
    function update(dt, t, camera, target) {
      const pr = pixelRatio();
      lodT -= dt;
      if (lodT <= 0) { lodT = 0.25; updateLOD(camera.position); updateShrubs(camera.position); }

      // 粒子中心：取相机与观察点之间
      center.copy(target).lerp(camera.position, 0.45); center.y = 0;
      [rain, snow, petals, leaves, fireflies].forEach((p) => {
        p.u.uTime.value = t; p.u.uPR.value = pr; p.u.uCenter.value.copy(center);
      });
      const dayLight = lerpF(1, 0.12, env.night);
      const wx = (env.wind || 8) * 0.6;
      rain.u.uWind.value.set(wx, wx * 0.3);
      rain.points.visible = env.rain > 0.01; rain.u.uOpacity.value = 0.2 + env.rain * 0.35; rain.u.uLight.value = dayLight * 0.9 + 0.1;
      rain.points.geometry.setDrawRange(0, Math.floor(rain.n * clamp01(env.rain + 0.15) * (quality() === "clear" ? 1 : 0.55)));
      snow.points.visible = env.snow > 0.01; snow.u.uOpacity.value = 0.9 * env.snow; snow.u.uLight.value = dayLight;
      snow.points.geometry.setDrawRange(0, Math.floor(snow.n * (quality() === "clear" ? 1 : 0.55)));
      const fallOK = env.rain < 0.3 && env.snow < 0.1;
      // 花瓣/落叶只在拉近视角时显示，远景下会变成噪点
      const near = clamp01((620 - camera.position.distanceTo(target)) / 260);
      petals.points.visible = env.season === "spring" && fallOK && near > 0; petals.u.uOpacity.value = 0.9 * near; petals.u.uLight.value = dayLight;
      leaves.points.visible = env.season === "autumn" && fallOK && near > 0; leaves.u.uOpacity.value = 0.95 * near; leaves.u.uLight.value = dayLight;
      petals.u.uCenter.value.copy(target); leaves.u.uCenter.value.copy(target);
      fireflies.points.visible = env.season === "summer" && env.night > 0.5 && env.rain < 0.2;
      fireflies.u.uOpacity.value = env.night;
      fireflies.u.uCenter.value.set(hx, 0, hz);

      // 路灯与夜景（灯罩 HDR 发光，清晰档泛光）
      const lampOn = clamp01((env.night - 0.25) * 2 + env.fog * 0.3 + (env.rain > 0.5 ? 0.3 : 0));
      bulbMat.color.setRGB(0.25 + 4.5 * lampOn, 0.22 + 3.4 * lampOn, 0.18 + 1.9 * lampOn);
      poolMatL.opacity = lampOn * 0.5;
      haloMat.opacity = lampOn * 0.75;
      campus.nightMats.forEach((m) => (m.emissiveIntensity = env.night * 1.6));

      // 雷电
      flash = Math.max(0, flash - dt * 4);
      if (env.thunder) {
        nextFlash -= dt;
        if (nextFlash <= 0) { flash = 1; nextFlash = 4 + rnd() * 7; }
      }

      // 鸟：白天出现，雨雪天减少，夜里归巢
      const birdTarget = clamp01(1 - env.night * 1.4) * (env.rain > 0.5 || env.snow > 0.5 ? 0.35 : 1) * (env.fog > 0.6 ? 0.5 : 1);
      birdVis += (birdTarget - birdVis) * Math.min(1, dt * 0.5);
      updateBirds(Math.min(dt, 0.05), t);

      creaturesActive = env.night < 0.6 && env.rain < 0.3 && env.snow < 0.3;
      // 小猫与蝴蝶只在镜头 450 米内绘制（更远时不到一个像素，省下几十个 draw call）
      const catNear = Math.hypot(camera.position.x - hx, camera.position.y, camera.position.z - hz) < 450;
      cat.visible = catNear;
      updateButterflies(Math.min(dt, 0.05), t);
      if (!catNear) butterflies.forEach((bf) => (bf.visible = false));
      updateCat(Math.min(dt, 0.05), t);
    }

    function setQuality(mode) {
      for (const m of leafMats) { m.alphaToCoverage = mode === "clear"; m.needsUpdate = true; }
      lodT = 0;
    }
    setQuality(quality());
    applySeason("summer");
    return {
      cat, butterflies, setEnvironment, update, setQuality, refreshLOD: (camPos) => { updateLOD(camPos); updateShrubs(camPos); lodT = 0.25; },
      get flash() { return flash; },
      stats: { trees: NT, lamps: NL, birds: NB, butterflies: BF_N, shrubs: shrubSpots.length, lod: lodStats, species: SPECIES.map((s) => ({ id: s.id, name: s.name, n: s.trees ? s.trees.length : 0, protoTris: s.protoTris || 0 })) },
      treeSpots: spots,
      catHome: [hx, hz],
    };
  }

  global.EcoLife = { create };
})(window);
