/*
 * 板块细节场景 · 动植物增删适配层（C 区宿舍庭院 / 运动场周边共用；接通用编辑器 js/species-editor.js）
 * ------------------------------------------------------------------------------
 * 植物用池塘 / 全景同一套生长算法（pond-style-core.js 的 growTree 递归分枝 + addCard 叶片卡 + TEX 叶片 / 树皮贴图，
 * 树种参数复制自 js/eco-life.js），按真实尺寸（米）生成：香樟、桂花、银杏、水杉、樱花、紫薇（新）、杜鹃球（新）、绿篱（新）；
 * 动物为写实小比例模型（约 1.3 倍放大以便远看）：校园小猫、喜鹊、麻雀、蝴蝶。
 * 动画沿用编辑器：开坑土粒 → 幼苗破土 → 长成、带土球弧线移植、连根拔起；动物走进 / 飞来、走开 / 飞走，平时有待机行为。
 * 放置规则由场景的 classAt() 决定：植物只能种在草地（离建筑、道路留出半个冠幅，不压住原有树木）；动物放在草地或铺装上。
 * 依赖：THREE、pond-style-core.js、campus-look.js（look.patch / look.depth）、species-editor.js。导出 window.ZoneSpecies。
 */
(function (global) {
  "use strict";
  const THREE = global.THREE, V3 = THREE.Vector3;
  const rnd = (a, b) => a + (b - a) * Math.random();
  const clampF = (v, a, b) => Math.max(a, Math.min(b, v));
  function hashStr(s) { let h = 2166136261; s = String(s); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

  // ---------------- 树种（参数复制自 eco-life.js，新增紫薇） ----------------
  const TREES = {
    camphor: { h: 11, decid: 0.12, evergreen: true, leaf: "green", tint: [0.72, 0.88, 0.62], transl: 0.3, seed: 101, bark: "bark",
      grow: (h) => ({ len: h * 0.42, rad: 0.06 + h * 0.024, depth: 3, children: [6, 3, 3], childStart: [0.35, 0.3, 0.3], spread: [0.9, 0.85, 0.7], upBias: [0.38, 0.3, 0.25], lenDecay: 0.6, radDecay: 0.6, wiggle: [0.08, 0.25, 0.3], gravity: [0, 0.0, -0.03] }),
      cards: { per: 6, spread: [0.4, 1.7], size: [1.7, 2.4], up: 0.8 } },
    osmanthus: { h: 6, decid: 0, evergreen: true, leaf: "shrub", tint: [0.68, 0.84, 0.6], transl: 0.25, seed: 202, bark: "bark",
      grow: (h) => ({ len: h * 0.34, rad: 0.05 + h * 0.02, depth: 3, children: [5, 3, 3], childStart: [0.3, 0.3, 0.3], spread: [1.0, 0.9, 0.8], upBias: [0.3, 0.2, 0.15], lenDecay: 0.66, radDecay: 0.62, wiggle: [0.1, 0.25, 0.3], gravity: [0, -0.02, -0.03] }),
      cards: { per: 7, spread: [0.2, 0.9], size: [1.0, 1.4], up: 0.7 } },
    ginkgo: { h: 12, decid: 1, evergreen: false, leaf: "green", tint: [0.98, 1.06, 0.62], transl: 0.4, seed: 303, bark: "bark",
      grow: (h) => ({ len: h * 0.5, rad: 0.06 + h * 0.02, depth: 3, children: [7, 3, 2], childStart: [0.3, 0.3, 0.3], spread: [0.6, 0.65, 0.6], upBias: [0.65, 0.5, 0.4], lenDecay: 0.55, radDecay: 0.6, wiggle: [0.06, 0.2, 0.25], gravity: [0, 0.02, 0.0] }),
      cards: { per: 6, spread: [0.3, 1.3], size: [1.4, 2.0], up: 0.9 } },
    metasequoia: { h: 17, decid: 1, evergreen: false, leaf: "conifer", tint: [1.15, 1.3, 1.05], transl: 0.18, seed: 404, bark: "bark", conifer: true },
    cherry: { h: 6.5, decid: 1, evergreen: false, leaf: "green", blossom: "spring", bloomTex: "sakura", tint: [0.88, 1.0, 0.72], transl: 0.5, seed: 606, bark: "sakuraBark",
      grow: (h) => ({ len: h * 0.36, rad: 0.1 + h * 0.016, depth: 4, children: [5, 3, 3, 2], childStart: [0.55, 0.3, 0.3, 0.3], spread: [1.05, 0.85, 0.75, 0.6], upBias: [0.3, 0.18, 0.12, 0.1], lenDecay: 0.66, radDecay: 0.62, wiggle: [0.1, 0.25, 0.3, 0.35], gravity: [0.0, -0.03, -0.05, -0.06] }),
      cards: { per: 4, spread: [0.15, 0.6], size: [0.9, 1.25], up: 1.2 } },
    crapemyrtle: { h: 4.5, decid: 1, evergreen: false, leaf: "green", blossom: "summer", bloomTex: "bloom", tint: [0.8, 0.95, 0.66], transl: 0.45, seed: 707, bark: "sakuraBark",
      grow: (h) => ({ len: h * 0.4, rad: 0.05 + h * 0.014, depth: 3, children: [4, 3, 3], childStart: [0.35, 0.35, 0.3], spread: [0.75, 0.8, 0.7], upBias: [0.6, 0.45, 0.3], lenDecay: 0.62, radDecay: 0.6, wiggle: [0.14, 0.28, 0.3], gravity: [0.0, -0.02, -0.04] }),
      cards: { per: 5, spread: [0.15, 0.7], size: [0.8, 1.1], up: 1.0 } },
  };
  const LEAF_KEY = { green: "greenLeaves", shrub: "shrubLeaves", conifer: "conifer" };

  function cardGeo(e) {
    const g = new THREE.PlaneGeometry(1, 1, 1, 1); g.applyMatrix4(e.m);
    const n = g.attributes.position.count, c = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { c[i * 3] = e.c.r; c[i * 3 + 1] = e.c.g; c[i * 3 + 2] = e.c.b; }
    g.setAttribute("color", new THREE.BufferAttribute(c, 3)); return g;
  }
  function buildPrototype(sp) {
    rng = mulberry32(sp.seed);
    const cards = [], bark = [];
    const tint = () => new THREE.Color().setRGB(sp.tint[0] * rr(0.85, 1.12), sp.tint[1] * rr(0.9, 1.1), sp.tint[2] * rr(0.85, 1.12));
    if (sp.conifer) {
      const h = sp.h;
      bark.push(taperTube(new THREE.CatmullRomCurve3([new V3(0, -0.3, 0), new V3(0.12, h * 0.5, 0), new V3(0, h * 0.97, 0)]), 10, 7, 0.42, 0.05, 0.5));
      for (let y = 2.0; y < h; y += 0.75) {
        const rad = Math.pow(1 - y / h, 0.85) * 3.1 + 0.35, cnt = Math.round(rad * 2.0 + 2);
        for (let i = 0; i < cnt; i++) { const a = rand() * 6.28, r = rad * Math.sqrt(rr(0.3, 1)); addCard(cards, new V3(Math.cos(a) * r, y, Math.sin(a) * r), new V3(Math.cos(a), 0.9, Math.sin(a)), rr(2.0, 2.8), tint()); }
      }
      return { cards, bark, blooms: [] };
    }
    const g = sp.grow(sp.h), nb = BARK.length;
    const tips = growTree(Object.assign({ base: new V3(0, -0.3, 0), dir: new V3(rr(-0.06, 0.06), 1, rr(-0.06, 0.06)).normalize() }, g));
    BARK.splice(nb);
    for (const b of tips.branches) {
      if (b.lvl > 2 || b.r0 < 0.03) continue;
      const seg = b.lvl === 0 ? [12, 9] : b.lvl === 1 ? [7, 6] : [4, 4];
      bark.push(taperTube(b.curve, seg[0], seg[1], b.r0, Math.max(b.r1, 0.02), 0.6));
    }
    const C = sp.cards, blooms = [];
    for (const t of tips) for (let i = 0; i < C.per; i++) {
      const p = t.p.clone().add(randDir().multiplyScalar(rr(C.spread[0], C.spread[1])));
      addCard(cards, p, randDir().add(new V3(0, C.up, 0)), rr(C.size[0], C.size[1]), tint());
      if (sp.blossom && i % 2 === 0) addCard(blooms, p.clone().add(new V3(0, 0.1, 0)), randDir().add(new V3(0, C.up, 0)), rr(C.size[0], C.size[1]) * 0.9, new THREE.Color(1, 1, 1));
    }
    return { cards, bark, blooms };
  }

  function create(K, cfg) {
    const look = K.look, patch = look.patch, depth = look.depth, B = K.B;
    const leafMats = [];
    function leafMaterial(map, transl, decid, key) {
      const m = patch(new THREE.MeshStandardMaterial({ map, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.62, envMapIntensity: 0.55, vertexColors: true }),
        { key: "leaf", leaf: true, transl, decid, wind: true, windWeight: "clamp((wPos4.y - 1.5) * 0.06, 0.0, 1.2)", alphaMip: 512,
          fsMap: "diffuseColor.a *= smoothstep(0.2, 0.45, abs(dot(normalize(vNormal), normalize(vViewPosition))));\n" });
      leafMats.push(m); return m;
    }
    const barkMats = {};
    function barkMaterial(kind) {
      if (barkMats[kind]) return barkMats[kind];
      const set = TEX[kind] || TEX.bark;
      return (barkMats[kind] = patch(new THREE.MeshStandardMaterial({ map: set.map, normalMap: set.normalMap, normalScale: new THREE.Vector2(1.4, 1.4), roughness: 0.92, color: kind === "bark" ? 0xb8aaa0 : 0xffffff, envMapIntensity: 0.6 }),
        { key: "bark", wind: true, windWeight: "clamp((wPos4.y - 3.0) * 0.02, 0.0, 0.25)" }));
    }
    const bloomTex = { sakura: leafCard("sakura"), bloom: TEX.bloomLeaves };
    const barkDepth = depth({ key: "barkd", wind: true, windWeight: "clamp((wPos4.y - 3.0) * 0.02, 0.0, 0.25)" });
    const PROTO = {};
    function proto(key) {
      if (PROTO[key]) return PROTO[key];
      const sp = TREES[key], p = buildPrototype(sp);
      const leafGeo = mergeGeos(p.cards.map(cardGeo)), barkGeo = mergeGeos(p.bark);
      leafGeo.computeBoundingBox();
      const lm = leafMaterial(TEX[LEAF_KEY[sp.leaf]], sp.transl, sp.decid);
      const out = { sp, leafGeo, barkGeo, leafMat: lm, barkMat: barkMaterial(sp.bark), height: leafGeo.boundingBox.max.y,
        leafDepth: depth({ key: "leafd", wind: true, windWeight: "clamp((wPos4.y - 1.5) * 0.06, 0.0, 1.2)", alphaMip: 512 }, TEX[LEAF_KEY[sp.leaf]], 0.45) };
      if (p.blooms.length) {
        out.bloomGeo = mergeGeos(p.blooms.map(cardGeo));
        const bt = bloomTex[sp.bloomTex];
        out.bloomMat = leafMaterial(bt, 0.9, 0); if (sp.bloomTex === "bloom") out.bloomMat.color.setRGB(1.0, 0.62, 0.86);
      }
      return (PROTO[key] = out);
    }
    function makeTree(key) {
      const p = proto(key), g = new THREE.Group();
      const bark = new THREE.Mesh(p.barkGeo, p.barkMat), leaf = new THREE.Mesh(p.leafGeo, p.leafMat);
      bark.castShadow = leaf.castShadow = true; bark.receiveShadow = leaf.receiveShadow = true;
      bark.customDepthMaterial = barkDepth; leaf.customDepthMaterial = p.leafDepth;
      g.add(bark, leaf); g.userData.leaf = leaf; g.userData.height = p.height; g.userData.treeKey = key;
      if (p.bloomGeo) { const bl = new THREE.Mesh(p.bloomGeo, p.bloomMat); bl.castShadow = false; g.add(bl); g.userData.bloom = bl; }
      applySeasonTo(g);
      return g;
    }
    // 灌木球（杜鹃）：叶片卡球 + 花卡
    let shrubGeo = null;
    const shrubLeafMat = leafMaterial(TEX.shrubLeaves, 0.3, 0.2), shrubBloomMat = leafMaterial(TEX.bloomLeaves, 0.6, 0);
    shrubBloomMat.color.setRGB(1.0, 0.55, 0.72);
    function makeShrub() {
      if (!shrubGeo) {
        rng = mulberry32(911);
        const leaves = [], blooms = [];
        for (let i = 0; i < 60; i++) {
          const a = rand() * 6.28, u = Math.sqrt(rand()), r = 0.75 * u, y = 0.1 + Math.sqrt(Math.max(0, 1 - u * u)) * 0.7;
          addCard(leaves, new V3(Math.cos(a) * r, y, Math.sin(a) * r), new V3(Math.cos(a) * u, 1.0, Math.sin(a) * u), rr(0.4, 0.6), new THREE.Color().setRGB(rr(0.65, 0.85), rr(0.8, 1.0), rr(0.55, 0.75)));
          if (i % 2 === 0) addCard(blooms, new V3(Math.cos(a) * r * 1.03, y + 0.05, Math.sin(a) * r * 1.03), new V3(Math.cos(a) * u, 1.0, Math.sin(a) * u), rr(0.3, 0.45), new THREE.Color(1, 1, 1));
        }
        shrubGeo = { l: mergeGeos(leaves.map(cardGeo)), b: mergeGeos(blooms.map(cardGeo)) };
      }
      const g = new THREE.Group(), l = new THREE.Mesh(shrubGeo.l, shrubLeafMat), b = new THREE.Mesh(shrubGeo.b, shrubBloomMat);
      l.castShadow = true; l.receiveShadow = true; g.add(l, b); g.userData.bloom = b; g.userData.bloomSeason = "spring"; g.userData.height = 1.0; applySeasonTo(g);
      return g;
    }
    // 绿篱：一段 3 米修剪的小叶女贞
    let hedgeGeo = null;
    function makeHedge() {
      if (!hedgeGeo) { hedgeGeo = roundedBox(3, 1.0, 0.8, 0.22, 5); const uv = hedgeGeo.attributes.uv, p = hedgeGeo.attributes.position; for (let k = 0; k < uv.count; k++) uv.setXY(k, p.getX(k) + p.getZ(k), p.getY(k)); hedgeGeo.translate(0, 0.5, 0); }
      const m = new THREE.Mesh(hedgeGeo, B.M.hedge); m.castShadow = m.receiveShadow = true;
      const g = new THREE.Group(); g.add(m); g.userData.height = 1.0; return g;
    }

    // ---------------- 动物模型（写实小比例，MeshStandard + 天气补丁） ----------------
    const amat = {};
    const AM = (hex, rough) => amat[hex + "|" + rough] || (amat[hex + "|" + rough] = patch(new THREE.MeshStandardMaterial({ color: hex, roughness: rough || 0.8 }), { key: "animal", noWeather: true }));
    const COATS = [[0xd98a3a, 0xf4eadc], [0x34322f, 0xf2efe8], [0x8d8577, 0xd8d0c2], [0xece4d6, 0xe0b9a8]];
    function makeCat(ind) {
      const coat = COATS[hashStr(ind && ind.ref || "c") % COATS.length], body = AM(coat[0], 0.85), belly = AM(coat[1], 0.85);
      const g = new THREE.Group(), s = 1.3;
      const bodyG = new THREE.Group(); g.add(bodyG);
      const torso = new THREE.Mesh(new THREE.SphereGeometry(0.13, 14, 10), body); torso.scale.set(1.0, 0.85, 2.1); torso.position.set(0, 0.24, 0); bodyG.add(torso);
      const chest = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 8), belly); chest.scale.set(1, 0.9, 1.2); chest.position.set(0, 0.22, 0.17); bodyG.add(chest);
      const head = new THREE.Group(); head.position.set(0, 0.36, 0.28); bodyG.add(head);
      const hm = new THREE.Mesh(new THREE.SphereGeometry(0.09, 14, 10), body); hm.scale.set(1.05, 0.95, 1); head.add(hm);
      const muz = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), belly); muz.position.set(0, -0.025, 0.07); head.add(muz);
      for (const sx of [-1, 1]) { const e = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.07, 4), body); e.position.set(sx * 0.05, 0.08, -0.01); e.rotation.z = -sx * 0.25; head.add(e); const eye = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), AM(0x3a5a20, 0.2)); eye.position.set(sx * 0.035, 0.015, 0.08); head.add(eye); }
      const legs = [];
      for (const [x, z] of [[-0.06, 0.16], [0.06, 0.16], [-0.06, -0.16], [0.06, -0.16]]) {
        const lg = new THREE.Group(); lg.position.set(x, 0.2, z); const m = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.02, 0.2, 6).translate(0, -0.1, 0), z > 0 ? belly : body); lg.add(m); bodyG.add(lg); legs.push(lg);
      }
      const tail = new THREE.Group(); tail.position.set(0, 0.28, -0.26); bodyG.add(tail);
      const tm = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.025, 0.3, 6).translate(0, 0.15, 0), body); tm.rotation.x = -0.9; tail.add(tm);
      g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      g.scale.setScalar(s); const root = new THREE.Group(); root.add(g);
      root.userData = { kind: "cat", pose: { leg: 0, tail: 0, head: 0, body: 0 }, parts: { legs, tail, head, bodyG }, height: 0.5 };
      return root;
    }
    function makeBird(ind, kind) {
      const magpie = kind === "magpie";
      const dark = AM(magpie ? 0x1a1c22 : 0x6b5038, 0.6), light = AM(magpie ? 0xf2f2ee : 0xc9b394, 0.7);
      const g = new THREE.Group(), s = magpie ? 1.3 : 1.4, L = magpie ? 1 : 0.55;
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.06 * L, 12, 8), dark); body.scale.set(0.9, 0.85, 1.7); body.position.y = 0.1 * L + 0.03; g.add(body);
      const belly = new THREE.Mesh(new THREE.SphereGeometry(0.055 * L, 10, 8), light); belly.scale.set(0.85, 0.75, 1.3); belly.position.set(0, 0.085 * L + 0.03, 0.01); g.add(belly);
      const head = new THREE.Group(); head.position.set(0, 0.15 * L + 0.03, 0.08 * L); g.add(head);
      head.add(new THREE.Mesh(new THREE.SphereGeometry(0.038 * L, 10, 8), dark));
      const beak = new THREE.Mesh(new THREE.ConeGeometry(0.012 * L, 0.04 * L, 6), AM(0x222222, 0.4)); beak.rotation.x = Math.PI / 2; beak.position.z = 0.045 * L; head.add(beak);
      const tail = new THREE.Group(); tail.position.set(0, 0.1 * L + 0.03, -0.09 * L); g.add(tail);
      const tm = new THREE.Mesh(new THREE.BoxGeometry(0.035 * L, 0.008, (magpie ? 0.2 : 0.09) * L).translate(0, 0, -(magpie ? 0.1 : 0.045) * L), dark); tail.add(tm);
      const wings = [];
      for (const sx of [-1, 1]) { const w = new THREE.Group(); w.position.set(sx * 0.045 * L, 0.12 * L + 0.03, 0); const wm = new THREE.Mesh(new THREE.BoxGeometry(0.11 * L, 0.006, 0.08 * L).translate(sx * 0.055 * L, 0, 0), magpie ? light : dark); w.add(wm); g.add(w); wings.push({ g: w, s: sx }); }
      for (const sx of [-1, 1]) { const lg = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.04, 4).translate(0, 0.02, 0), AM(0x333333, 0.6)); lg.position.set(sx * 0.02, 0.0, 0); g.add(lg); }
      g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      g.scale.setScalar(s); const root = new THREE.Group(); root.add(g);
      root.userData = { kind, pose: { wing: 0, head: 0, tail: 0 }, parts: { head, tail, wings }, height: 0.3 };
      return root;
    }
    const BF_COL = [0xffd84d, 0xfdfcf4, 0x6fb6f2, 0xf59a3c, 0xf4a6c6];
    function makeButterfly(ind) {
      const col = BF_COL[hashStr(ind && ind.ref || "b") % BF_COL.length];
      const wm = patch(new THREE.MeshStandardMaterial({ color: col, roughness: 0.6, side: THREE.DoubleSide }), { key: "bfwing", noWeather: true });
      const g = new THREE.Group(), s = 1.6;
      g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.05, 5).rotateX(Math.PI / 2), AM(0x222222, 0.6)));
      const wings = [];
      for (const sx of [-1, 1]) {
        const w = new THREE.Group(); const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.bezierCurveTo(0.03, 0.03, 0.05, 0.03, 0.045, -0.005); sh.bezierCurveTo(0.04, -0.03, 0.02, -0.02, 0, 0);
        const m = new THREE.Mesh(new THREE.ShapeGeometry(sh, 6).rotateX(-Math.PI / 2).scale(sx, 1, 1), wm); w.add(m); g.add(w); wings.push({ g: w, s: sx });
      }
      g.scale.setScalar(s); const root = new THREE.Group(); root.add(g);
      root.userData = { kind: "butterfly", pose: { wing: 0 }, parts: { wings }, height: 0.1 };
      return root;
    }
    function applyPose(o) {
      const u = o.userData, P = u.pose, pt = u.parts; if (!pt) return;
      if (u.kind === "cat") {
        pt.legs.forEach((l, i) => (l.rotation.x = (i === 0 || i === 3 ? 1 : -1) * P.leg));
        pt.tail.rotation.x = P.tail; pt.head.rotation.x = P.head; pt.bodyG.rotation.x = P.body || 0; pt.bodyG.position.y = P.bodyY || 0;
      } else if (u.kind === "butterfly") pt.wings.forEach((w) => (w.g.rotation.z = w.s * P.wing));
      else { pt.wings.forEach((w) => (w.g.rotation.z = -w.s * P.wing)); pt.head.rotation.x = P.head || 0; pt.tail.rotation.x = P.tail || 0; }
    }

    // ---------------- 待机行为（米） ----------------
    let editor = null;
    const okGround = (x, z) => { const c = K.classAt(x, z, 0); return c === "grass" || c === "paved"; };
    const face = (o, dx, dz) => { if (Math.abs(dx) + Math.abs(dz) > 1e-5) o.rotation.y = Math.atan2(dx, dz); };
    const turnTo = (o, dx, dz, k) => { if (Math.abs(dx) + Math.abs(dz) < 1e-5) return; let a = Math.atan2(dx, dz) - o.rotation.y; a = Math.atan2(Math.sin(a), Math.cos(a)); o.rotation.y += a * Math.min(1, k); };
    const fwd = (o, d) => [Math.sin(o.rotation.y) * d, Math.cos(o.rotation.y) * d];
    function wanderTarget(ind, rad) { for (let k = 0; k < 10; k++) { const a = Math.random() * 6.28, r = rnd(0.8, rad), x = ind.x + Math.cos(a) * r, z = ind.z + Math.sin(a) * r; if (okGround(x, z)) return [x, z]; } return [ind.x, ind.z]; }
    const activeOf = (key) => (editor ? editor.inds.filter((i) => i.key === key && i.status === "active" && i.obj && !i.anim) : []);
    function catIdle(ind, dt) {
      const o = ind.obj, P = o.userData.pose, a = ind.ai || (ind.ai = { st: "sit", t: rnd(0.5, 2), ph: Math.random() * 6 }); const p = o.position;
      a.ph += dt;
      if (a.st === "sit") {
        P.leg = 0; P.tail = -0.4 + Math.sin(a.ph * 2.2) * 0.3; P.body = -0.15; P.head = Math.sin(a.ph * 0.7) * 0.15; p.y = K.surfaceY(p.x, p.z);
        if ((a.t -= dt) <= 0) {
          let best = null, bd = 6;
          for (const b of activeOf("butterfly")) { const d = Math.hypot(b.obj.position.x - p.x, b.obj.position.z - p.z); if (d < bd) { bd = d; best = b; } }
          if (best && Math.random() < 0.7) { a.st = "stalk"; a.target = best; a.t = 7; }
          else { const t = wanderTarget(ind, 4); a.st = "walk"; a.tx = t[0]; a.tz = t[1]; a.t = 9; }
        }
      } else if (a.st === "walk" || a.st === "stalk") {
        let tx = a.tx, tz = a.tz, spd = 0.7;
        if (a.st === "stalk") { if (!a.target || a.target.status !== "active" || !a.target.obj) { a.st = "sit"; a.t = 1; return; } tx = a.target.obj.position.x; tz = a.target.obj.position.z; spd = 0.45; }
        const dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz);
        turnTo(o, dx, dz, dt * 6);
        const [fx, fz] = fwd(o, Math.min(d, spd * dt)), nx = p.x + fx, nz = p.z + fz;
        if (okGround(nx, nz)) { p.x = nx; p.z = nz; } else { a.st = "sit"; a.t = rnd(1, 2); }
        P.leg = Math.sin(a.ph * (a.st === "stalk" ? 9 : 12)) * 0.55; P.tail = a.st === "stalk" ? -1.4 : -0.6; P.body = 0; P.bodyY = a.st === "stalk" ? -0.04 : 0; P.head = a.st === "stalk" ? 0.15 : 0;
        a.t -= dt;
        if (a.st === "stalk" && d < 1.3) { a.st = "pounce"; a.k = 0; a.p0 = [p.x, p.z]; const r = Math.min(d + 0.3, 1.5); a.p1 = [p.x + (dx / d) * r, p.z + (dz / d) * r]; if (a.target.ai) a.target.ai.flee = 2; }
        else if (d < 0.08 || a.t <= 0) { a.st = "sit"; a.t = rnd(2, 5); }
      } else if (a.st === "pounce") {
        a.k = Math.min(1, a.k + dt / 0.55);
        const k = a.k, x = a.p0[0] + (a.p1[0] - a.p0[0]) * k, z = a.p0[1] + (a.p1[1] - a.p0[1]) * k;
        if (okGround(x, z)) { p.x = x; p.z = z; }
        p.y = K.surfaceY(p.x, p.z) + Math.sin(Math.PI * k) * 0.5;
        P.body = -0.5 * Math.cos(Math.PI * k); P.leg = k < 0.5 ? 0.9 : -0.6; P.tail = -1.2;
        if (a.k >= 1) { a.st = "sit"; a.t = rnd(2.5, 4.5); if (editor) editor.helpers.burstSoil(p.x, p.y, p.z, 8, 0.6); }
      }
      applyPose(o);
    }
    function butterflyIdle(ind, dt) {
      const o = ind.obj, P = o.userData.pose, a = ind.ai || (ind.ai = { ph: Math.random() * 20, s: Math.random() * 6, flee: 0, lift: 0 });
      a.ph += dt; a.flee = Math.max(0, a.flee - dt); a.lift += ((a.flee > 0 ? 2 : 0) - a.lift) * Math.min(1, dt * 2.5);
      const t = a.ph * 0.9;
      const x = ind.x + Math.sin(t * 0.55 + a.s) * 2.2 + Math.sin(t * 1.7) * 0.35, z = ind.z + Math.cos(t * 0.43 + a.s * 1.3) * 1.8 + Math.cos(t * 2.1) * 0.3;
      const y = K.surfaceY(x, z) + 0.8 + 0.3 * Math.sin(t * 1.9 + a.s) + a.lift;
      turnTo(o, x - o.position.x, z - o.position.z, dt * 8); o.position.set(x, y, z);
      P.wing = 0.25 + Math.sin(a.ph * 24) * 0.95; applyPose(o);
    }
    function birdIdle(ind, dt) {
      const o = ind.obj, P = o.userData.pose, small = ind.key === "sparrow", a = ind.ai || (ind.ai = { st: "peck", t: rnd(0.5, 2), ph: Math.random() * 6 }); const p = o.position;
      a.ph += dt; const gy = K.surfaceY(p.x, p.z);
      if (a.st === "peck") {
        P.wing = 0; P.head = Math.max(0, Math.sin(a.ph * (small ? 9 : 6))) * 0.6; P.tail = Math.sin(a.ph * 4) * 0.1; p.y = gy;
        if ((a.t -= dt) <= 0) {
          const tg = wanderTarget(ind, Math.random() < 0.2 ? 6 : small ? 1.5 : 2.5);
          a.st = Math.hypot(tg[0] - p.x, tg[1] - p.z) > 3 ? "fly" : "hop"; a.k = 0; a.p0 = [p.x, p.z]; a.p1 = tg; face(o, tg[0] - p.x, tg[1] - p.z);
        }
      } else if (a.st === "hop") {
        const D = Math.hypot(a.p1[0] - a.p0[0], a.p1[1] - a.p0[1]), hops = Math.max(1, Math.ceil(D / (small ? 0.2 : 0.35)));
        a.k = Math.min(1, a.k + dt / (hops * 0.22)); const k = a.k, f = (k * hops) % 1;
        p.x = a.p0[0] + (a.p1[0] - a.p0[0]) * k; p.z = a.p0[1] + (a.p1[1] - a.p0[1]) * k; p.y = gy + Math.sin(Math.PI * f) * (small ? 0.08 : 0.12);
        P.head = 0; P.wing = Math.sin(Math.PI * f) * 0.4;
        if (a.k >= 1) { a.st = "peck"; a.t = rnd(1.2, 3.5); }
      } else {
        a.k = Math.min(1, a.k + dt / 2); const k = a.k, e = k * k * (3 - 2 * k);
        p.x = a.p0[0] + (a.p1[0] - a.p0[0]) * e; p.z = a.p0[1] + (a.p1[1] - a.p0[1]) * e; p.y = gy + Math.sin(Math.PI * k) * 2.2;
        P.wing = Math.sin(a.ph * (small ? 30 : 18)) * 0.9; P.head = 0;
        if (a.k >= 1) { a.st = "peck"; a.t = rnd(1, 3); }
      }
      applyPose(o);
    }

    // ---------------- 入场 / 离场 / 移植 ----------------
    function walkPath(ind, x0, z0, x1, z1, dur, api, opt) {
      const o = ind.obj, P = o.userData.pose, S0 = ind.scale || 1; opt = opt || {};
      face(o, x1 - x0, z1 - z0); o.position.set(x0, K.surfaceY(x0, z0), z0);
      return api.helpers.play({ dur, update: (t) => {
        const k = api.helpers.ease(t), x = x0 + (x1 - x0) * k, z = z0 + (z1 - z0) * k;
        o.position.set(x, K.surfaceY(x, z), z); P.leg = Math.sin(t * dur * 13) * 0.55; P.tail = -0.6; P.body = 0; P.bodyY = 0;
        const sc = opt.fadeIn ? Math.min(1, t * 5) : opt.fadeOut ? 1 - api.helpers.ease(clampF((t - 0.7) / 0.3, 0, 1)) : 1;
        o.scale.setScalar(Math.max(0.0001, S0 * sc)); applyPose(o);
      }, end: () => { o.position.set(x1, K.surfaceY(x1, z1), z1); o.scale.setScalar(opt.fadeOut ? 0.0001 : S0); P.leg = 0; applyPose(o); ind.ai = null; opt.done && opt.done(); } });
    }
    function flyPath(ind, p0, p1, dur, api, opt) {
      const o = ind.obj, P = o.userData.pose, S0 = ind.scale || 1; opt = opt || {};
      const mid = p0.clone().lerp(p1, 0.5); mid.y = Math.max(p0.y, p1.y) + (opt.arc || 2.5);
      const cur = new THREE.QuadraticBezierCurve3(p0, mid, p1); o.position.copy(p0);
      return api.helpers.play({ dur, update: (t) => {
        const k = api.helpers.ease(t), p = cur.getPoint(k), tg = cur.getTangent(Math.min(0.999, k + 0.001));
        o.position.copy(p); face(o, tg.x, tg.z);
        P.wing = opt.landing && t > 0.85 ? -0.2 : Math.sin(t * dur * (opt.flap || 18)) * 0.9 + (opt.butterfly ? 0.25 : 0); P.head = 0;
        const sc = opt.fadeIn ? Math.min(1, t * 4) : opt.fadeOut ? 1 - api.helpers.ease(clampF((t - 0.6) / 0.4, 0, 1)) : 1;
        o.scale.setScalar(Math.max(0.0001, S0 * sc)); applyPose(o);
      }, end: () => { o.position.copy(p1); o.scale.setScalar(opt.fadeOut ? 0.0001 : S0); P.wing = 0; applyPose(o); ind.ai = null; if (opt.landing) api.helpers.burstSoil(p1.x, p1.y, p1.z, 6, 0.4); opt.done && opt.done(); } });
    }
    function walker(dur) {
      const out = (x, z) => { const a = Math.random() * 6.28; for (let k = 0; k < 8; k++) { const b = a + k * 0.8, x0 = x + Math.cos(b) * 5, z0 = z + Math.sin(b) * 5; if (okGround(x0, z0)) return [x0, z0]; } return [x + 5, z]; };
      return {
        enter(ind, done, api) { const [x0, z0] = out(ind.x, ind.z); return walkPath(ind, x0, z0, ind.x, ind.z, dur, api, { fadeIn: true, done }); },
        exit(ind, done, api) { const o = ind.obj, [x1, z1] = out(o.position.x, o.position.z); return walkPath(ind, o.position.x, o.position.z, x1, z1, dur, api, { fadeOut: true, done }); },
        transplant(ind, x1, z1, done, api) { const o = ind.obj, d = Math.hypot(x1 - o.position.x, z1 - o.position.z); return walkPath(ind, o.position.x, o.position.z, x1, z1, clampF(d / 1.2, 0.8, 8), api, { done }); },
      };
    }
    function flyer(opt) {
      const hov = opt.hover || 0;
      return {
        enter(ind, done, api) { const gy = K.surfaceY(ind.x, ind.z), p1 = new V3(ind.x, gy + hov, ind.z), p0 = p1.clone().add(new V3(rnd(-8, 8), 7, rnd(-8, 8))); return flyPath(ind, p0, p1, opt.dur, api, Object.assign({}, opt, { fadeIn: true, landing: !hov, done })); },
        exit(ind, done, api) { const p0 = ind.obj.position.clone(), p1 = p0.clone().add(new V3(rnd(-8, 8), 7, rnd(-8, 8))); return flyPath(ind, p0, p1, opt.dur, api, Object.assign({}, opt, { fadeOut: true, done })); },
        transplant(ind, x1, z1, done, api) { const p0 = ind.obj.position.clone(), p1 = new V3(x1, K.surfaceY(x1, z1) + hov, z1); return flyPath(ind, p0, p1, clampF(p0.distanceTo(p1) / 4, 1.2, 4), api, Object.assign({}, opt, { landing: !hov, done })); },
      };
    }

    // ---------------- 物种总目录 ----------------
    const PLANT_RULE = "只能种在草地 / 绿化带上（不能在道路、铺装、球场和建筑上）";
    const tree = (key, name, icon, radius, desc, extra) => Object.assign({ key, name, type: "plant", icon, anim: "tree", radius, hitY: TREES[key].h * 0.45, hitRadius: radius * 0.8, previewH: TREES[key].h * 0.5, desc, rule: PLANT_RULE, plantDur: 3.2, moveDur: 3.2, scaleRange: [0.85, 1.1], make: () => makeTree(key) }, extra || {});
    const ALL = [
      tree("camphor", "香樟", "🌳", 3.2, "四季常绿的校园行道树，树冠浓密圆整，夏季遮阴"),
      tree("osmanthus", "桂花", "🌼", 2.0, "常绿小乔木，秋季开金黄小花，满院飘香"),
      tree("ginkgo", "银杏", "🍂", 2.6, "落叶乔木，扇形叶；秋季满树金黄，冬季落叶"),
      tree("metasequoia", "水杉", "🌲", 2.2, "塔形落叶乔木，常成排种在运动场与道路边"),
      tree("cherry", "樱花", "🌸", 2.4, "春季粉白花朵铺满树冠，宿舍楼间常见"),
      tree("crapemyrtle", "紫薇", "💮", 1.8, "落叶小乔木，夏秋开紫红色花，花期很长"),
      { key: "azalea", name: "杜鹃球", type: "plant", icon: "🌺", anim: "shrub", radius: 0.9, hitY: 0.5, previewH: 1.0, desc: "修剪成球形的杜鹃，春季开满粉红色花", rule: PLANT_RULE, plantDur: 2.4, scaleRange: [0.9, 1.15], make: () => makeShrub() },
      { key: "hedge", name: "绿篱", type: "plant", icon: "🟩", anim: "shrub", radius: 1.6, hitY: 0.5, previewH: 1.0, desc: "小叶女贞修剪的绿篱（每段约 3 米），围合楼前绿地与步道", rule: PLANT_RULE, plantDur: 2.4, make: () => makeHedge() },
      Object.assign({ key: "cat", name: "校园小猫", type: "animal", icon: "🐱", radius: 0.5, hitRadius: 0.6, hitY: 0.3, previewH: 0.5, desc: "橘猫、奶牛猫、狸花猫……在楼前草地上晒太阳，看到蝴蝶会压低身子扑过去", rule: "放在草地或铺装地面上", idle: catIdle, make: (ind) => makeCat(ind),
        center: (ind, v) => (ind.obj ? v.set(ind.obj.position.x, ind.obj.position.y + 0.3, ind.obj.position.z) : v.set(ind.x, 0.3, ind.z)) }, walker(3.2)),
      Object.assign({ key: "magpie", name: "喜鹊", type: "animal", icon: "🐦", radius: 0.4, hitRadius: 0.6, hitY: 0.2, previewH: 0.4, desc: "黑白相间的长尾巴喜鹊，在草地上一跳一跳地找虫子", rule: "放在草地或铺装地面上", idle: birdIdle, make: (ind) => makeBird(ind, "magpie"),
        center: (ind, v) => (ind.obj ? v.set(ind.obj.position.x, ind.obj.position.y + 0.2, ind.obj.position.z) : v.set(ind.x, 0.2, ind.z)) }, flyer({ dur: 2.4, flap: 16 })),
      Object.assign({ key: "sparrow", name: "麻雀", type: "animal", icon: "🐤", radius: 0.3, hitRadius: 0.5, hitY: 0.15, previewH: 0.3, desc: "成群的树麻雀，啄草籽、蹦蹦跳跳", rule: "放在草地或铺装地面上", idle: birdIdle, make: (ind) => makeBird(ind, "sparrow"),
        center: (ind, v) => (ind.obj ? v.set(ind.obj.position.x, ind.obj.position.y + 0.15, ind.obj.position.z) : v.set(ind.x, 0.15, ind.z)) }, flyer({ dur: 2.0, flap: 28 })),
      Object.assign({ key: "butterfly", name: "蝴蝶", type: "animal", icon: "🦋", radius: 0.3, hitRadius: 0.6, hitY: 0.9, previewH: 0.9, desc: "菜粉蝶、黄钩蛱蝶、柑橘凤蝶，绕着花丛忽高忽低地飞", rule: "在草地上空飞舞", idle: butterflyIdle, make: (ind) => makeButterfly(ind),
        center: (ind, v) => (ind.obj ? v.copy(ind.obj.position) : v.set(ind.x, 0.9, ind.z)) }, flyer({ dur: 2.6, hover: 0.9, flap: 24, butterfly: true, arc: 2 })),
    ];

    // ---------------- 季节 ----------------
    let season = "summer";
    function applySeasonTo(o) {
      const u = o.userData; if (!u) return;
      if (u.treeKey) {
        const sp = TREES[u.treeKey];
        u.leaf.visible = !(season === "winter" && !sp.evergreen) && !(sp.blossom === "spring" && season === "spring");
        if (u.bloom) u.bloom.visible = sp.blossom === season;
      } else if (u.bloom) u.bloom.visible = u.bloomSeason === season;
    }
    function setSeason(s) {
      if (s === season) return; season = s;
      if (editor) for (const ind of editor.inds) if (ind.obj) applySeasonTo(ind.obj);
    }

    // ---------------- 放置规则、拾取 ----------------
    function canPlace(e, x, z) {
      const [px, py] = B.P(x, z);
      if (!K.inRegion(px, py)) return { ok: false, reason: "超出本板块场景范围" };
      const r = e.radius || 0.5, rp = r / B.S;
      const cls = K.classAt(x, z, 0);
      const what = { building: "建筑里", water: "水里", court: "球场 / 跑道上", road: "道路上", paved: "铺装地面上", out: "范围外", platform: "篮球场高台上" }[cls];
      if (e.type === "plant") {
        if (what) return { ok: false, reason: "不能种在" + what + "，只能种在草地 / 绿化带上" };
        const near = K.classAt(x, z, rp * 0.55);
        if (near === "building") return { ok: false, reason: "离建筑太近，树冠会碰到墙面" };
        if (near !== "grass") return { ok: false, reason: "离道路 / 铺装太近，往草地里面挪一点" };
        const t = K.nearTree(x, z, Math.max(1.5, r * 0.8));
        if (t) return { ok: false, reason: "这里已有原有的树木，换个空地吧" };
      } else {
        if (e.key === "butterfly") { if (cls === "building" || cls === "water") return { ok: false, reason: "蝴蝶要放在草地或花丛上空" }; }
        else if (cls !== "grass" && cls !== "paved") return { ok: false, reason: "不能放在" + (what || "这里") + "，请放在草地或铺装地面上" };
      }
      return { ok: true };
    }

    // ---------------- 原有个体 + 编辑器 ----------------
    function start(zone) {
      const allowed = zone && Array.isArray(zone.catalog) ? zone.catalog : cfg.catalog;
      const catalog = ALL.filter((c) => allowed.indexOf(c.key) >= 0);
      for (const c of ALL) if (catalog.indexOf(c) < 0 && cfg.seeds[c.key]) catalog.push(Object.assign({}, c, { hidden: true }));
      const seeds = [];
      for (const key in cfg.seeds) {
        const e = catalog.find((c) => c.key === key); if (!e) continue;
        cfg.seeds[key].forEach((pp, i) => {
          const [x, z] = B.W(pp), ref = key + "#" + i;
          const chk = canPlace(e, x, z); if (!chk.ok) console.info("[" + cfg.zoneId + "] 原有个体位置需调整：", ref, chk.reason);
          const obj = e.make({ ref });
          const rot = (hashStr(ref) % 628) / 100, sc = e.type === "plant" ? 0.9 + (hashStr(ref + "s") % 20) / 100 : 1;
          obj.position.set(x, K.surfaceY(x, z) + (key === "butterfly" ? 0.9 : 0), z); obj.rotation.y = pp[2] != null ? pp[2] : rot;
          obj.scale.setScalar(e.type === "plant" ? sc : 1);
          K.scene.add(obj);
          seeds.push({ ref, key, obj, x, z, rot: obj.rotation.y, scale: e.type === "plant" ? sc : 1 });
        });
      }
      editor = global.SpeciesEditor.create({
        zoneId: cfg.zoneId, zoneName: zone ? zone.name : cfg.zoneName, apiBase: cfg.apiBase, storageKey: cfg.zoneId + "-species-demo:" + cfg.zoneId,
        THREE, scene: K.scene, camera: K.camera, dom: K.renderer.domElement, catalog, seeds, canPlace,
        pick: (rc) => K.pickGround(rc), surfaceY: (x, z) => K.surfaceY(x, z),
        fx: { soilColor: 0x5b4330, soilSize: 7, holeColor: 0x2b2018, ballColor: 0x5a412c, rootColor: 0xc9b48a },
        hooks: { onToggle: (on) => { document.body.classList.toggle("se-editing", on); if (on) K.goView("edit"); } },
        onCounts: (c) => K.updateCounts(c),
      });
      return { editor, catalog };
    }
    function setEditor(e) { editor = e; }
    return { ALL, TREES, start, setSeason, applySeasonTo, canPlace, makeTree, makeShrub, makeHedge, proto, applyPose, setEditor, get editor() { return editor; }, leafMats };
  }

  global.ZoneSpecies = { create, TREES };
})(window);
