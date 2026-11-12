/* ------------------------------------------------------------------ 校园版：动植物增删的场景钩子（由 tools/build_pond.py 插入 pond-main.js）
 * 通用编辑器 campus3d/js/species-editor.js 与池塘适配层 pond/pond-species.js 通过 window.PondEdit 调用这些函数。
 * 复用池塘原有的生成算法（growTree 递归分枝 + 叶片卡、padGeo 荷叶 / 睡莲叶、waterLilyGeo、荷花 flower()、锦鲤实例），
 * 新增的个体与原有个体画风一致；原有的垂柳 / 荷叶 / 睡莲 / 锦鲤登记为可选中的“原有个体”（seed）。 */
const PondEdit = (() => {
  const V3 = THREE.Vector3;
  // 把一段 growTree / addCard 生成的树皮与叶片卡拆成独立的树（Group 原点 = 树基，便于移植）
  function treeFromParts(part) {
    const g = new THREE.Group(); g.position.set(part.x, part.gy, part.z);
    const inv = new THREE.Matrix4().makeTranslation(-part.x, -part.gy, -part.z);
    const barkKit = part.barkKit || WORLD.barkKit;
    if (part.bark.length && barkKit) {
      const geo = mergeGeos(part.bark); geo.applyMatrix4(inv);
      const bm = new THREE.Mesh(geo, barkKit.mat); bm.customDepthMaterial = barkKit.depth; bm.castShadow = bm.receiveShadow = true; g.add(bm);
    }
    for (const [name, cards] of Object.entries(part.cards)) {
      const kit = WORLD.leafKit && WORLD.leafKit.sets[name]; if (!kit || !cards.length) continue;
      const im = new THREE.InstancedMesh(WORLD.leafKit.cardGeo, kit.mat, cards.length);
      cards.forEach((e, i) => { im.setMatrixAt(i, inv.clone().multiply(e.m)); im.setColorAt(i, e.c); });
      im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
      im.customDepthMaterial = kit.depth; im.castShadow = true; im.receiveShadow = true; im.computeBoundingSphere();
      im.userData.cardSet = name; g.add(im);
      seasonal(im, part.seasons && part.seasons[name] || kit.seasons || 'SRAW');
    }
    setLayer(g, LAYER.ABOVE);
    g.userData.height = part.h || 3;
    return g;
  }
  // 运行一段生长代码，收集它新增的树皮与叶片卡
  function capture(fn) {
    const nb = BARK.length, nc = {};
    for (const k in LEAVES) nc[k] = LEAVES[k].length;
    fn();
    const cards = {};
    for (const k in LEAVES) if (LEAVES[k].length > nc[k]) cards[k] = LEAVES[k].splice(nc[k]);
    return { bark: BARK.splice(nb), cards };
  }
  const gradX = (x, z) => (sdf(x + 0.05, z) - sdf(x - 0.05, z)) / 0.1, gradZ = (x, z) => (sdf(x, z + 0.05) - sdf(x, z - 0.05)) / 0.1;
  const col = (a, b, c, d, e, f) => new THREE.Color().setRGB(rr(a, b), rr(c, d), rr(e, f));

  // ---------------- 树：垂柳 / 香樟 / 桂花 ----------------
  function makeWillow(x, z, h) {
    h = h || rr(4.2, 5.0);
    const gy = ground(x, z);
    const part = capture(() => {
      const lean = new V3(-gradX(x, z), 0, -gradZ(x, z)).multiplyScalar(0.28);
      const tips = growTree({ base: new V3(x, gy - 0.1, z), dir: new V3(lean.x * 0.5, 1, lean.z * 0.5).normalize(), len: h * 0.42, rad: 0.12 + h * 0.012, depth: 4,
        children: [5, 3, 4, 2], childStart: [0.6, 0.3, 0.2, 0.2], spread: [1.05, 0.9, 0.5, 0.35], upBias: [0.45, 0.35, -0.6, -1.0],
        lenDecay: 0.86, radDecay: 0.6, wiggle: [0.08, 0.2, 0.12, 0.12], gravity: [0.0, -0.02, -0.28, -0.45] });
      for (const b of tips.branches) {
        if (b.lvl < 2) continue;
        for (let t = 0.1; t <= 1.0; t += 0.075) {
          const p = b.curve.getPointAt(t), n = randDir().add(new V3(0, 0.3, 0));
          addCard(LEAVES.sakura, p.add(randDir().multiplyScalar(0.05)), new V3(n.x, n.y * 0.15, n.z), rr(0.34, 0.5), col(0.85, 1.05, 0.92, 1.08, 0.8, 1.0));
        }
      }
    });
    return treeFromParts(Object.assign(part, { x, z, gy, h, barkKit: WORLD.willowBark, seasons: { sakura: 'SRA' } }));
  }
  function makeCamphor(x, z, h) {           // 香樟：粗壮主干、圆整树冠、常绿
    h = h || rr(3.2, 4.2);
    const gy = ground(x, z);
    const part = capture(() => {
      const tips = growTree({ base: new V3(x, gy - 0.1, z), dir: new V3(rr(-0.08, 0.08), 1, rr(-0.08, 0.08)).normalize(), len: h * 0.42, rad: 0.07 + h * 0.02, depth: 3,
        children: [6, 3, 3], childStart: [0.4, 0.3, 0.3], spread: [0.9, 0.8, 0.7], upBias: [0.45, 0.3, 0.25], lenDecay: 0.58, radDecay: 0.6,
        wiggle: [0.08, 0.25, 0.3], gravity: [0, 0.0, -0.03] });
      const tint = [rr(0.8, 1.0), rr(0.95, 1.1), rr(0.75, 0.9)];
      for (const t of tips) for (let i = 0; i < 6; i++) {
        addCard(LEAVES.green, t.p.clone().add(randDir().multiplyScalar(rr(0.15, 0.7))), randDir().add(new V3(0, 0.8, 0)), rr(0.6, 0.9),
          new THREE.Color().setRGB(tint[0] * rr(0.9, 1.1), tint[1] * rr(0.9, 1.1), tint[2] * rr(0.9, 1.1)));
      }
    });
    return treeFromParts(Object.assign(part, { x, z, gy, h, seasons: { green: 'SRAW' } }));
  }
  function makeOsmanthus(x, z, h) {         // 桂花：低矮常绿小乔木，秋季满树金黄小花
    h = h || rr(1.8, 2.4);
    const gy = ground(x, z);
    const part = capture(() => {
      const tips = growTree({ base: new V3(x, gy - 0.05, z), dir: new V3(rr(-0.1, 0.1), 1, rr(-0.1, 0.1)).normalize(), len: h * 0.38, rad: 0.035 + h * 0.012, depth: 3,
        children: [5, 3, 3], childStart: [0.3, 0.3, 0.3], spread: [0.95, 0.85, 0.7], upBias: [0.4, 0.3, 0.25], lenDecay: 0.62, radDecay: 0.6,
        wiggle: [0.1, 0.25, 0.3], gravity: [0, -0.01, -0.02] });
      for (const t of tips) for (let i = 0; i < 7; i++) {
        const p = t.p.clone().add(randDir().multiplyScalar(rr(0.08, 0.42)));
        addCard(LEAVES.shrub, p, randDir().add(new V3(0, 0.6, 0)), rr(0.3, 0.42), col(0.62, 0.8, 0.78, 0.95, 0.55, 0.72));   // 细密深绿小叶（山茶叶片卡带红花，不适合桂花）
        if (i % 2 === 0) addCard(LEAVES.bloom, p.clone().add(randDir().multiplyScalar(0.06)), randDir().add(new V3(0, 0.5, 0)), rr(0.14, 0.22), new THREE.Color(0xf6c544).multiplyScalar(rr(0.95, 1.15)));
      }
    });
    return treeFromParts(Object.assign(part, { x, z, gy, h, seasons: { shrub: 'SRAW', bloom: 'A' } }));
  }

  // ---------------- 水生植物：荷花 / 睡莲 ----------------
  function makeLotus(x, z, opts) {
    opts = opts || {};
    const K = WORLD.pondKit, grp = new THREE.Group();
    const n = opts.leaves || 3;
    for (let i = 0; i < n; i++) {
      const r = rr(0.15, 0.24), h = rr(0.2, 0.48), a = i * 2.2 + rand(), d = i ? rr(0.18, 0.32) : 0;
      const sub = new THREE.Group(); sub.position.set(Math.cos(a) * d, 0, Math.sin(a) * d);
      const leaf = new THREE.Mesh(padGeo(r, rand() * 40, true), K.lotusMat); leaf.castShadow = leaf.receiveShadow = true;
      leaf.position.y = h; leaf.rotation.set(rr(-0.25, 0.25), rand() * 6, rr(-0.25, 0.25)); sub.add(leaf);
      const stalk = taperTube(new THREE.CatmullRomCurve3([new V3(0, -0.45, 0), new V3(rr(-0.03, 0.03), h * 0.5, rr(-0.03, 0.03)), new V3(0, h, 0)]), 10, 6, 0.006, 0.004, 3);
      const sm = new THREE.Mesh(stalk, K.stemMat); sm.castShadow = true; sub.add(sm);
      grp.add(sub);
    }
    let fl = null;
    if (WORLD.lotusKit && opts.flower !== false) {
      fl = WORLD.lotusKit.flower(rr(0.6, 1.0)); const fy = rr(0.42, 0.6);
      fl.position.set(rr(-0.06, 0.06), fy, rr(-0.06, 0.06)); fl.rotation.set(rr(-0.12, 0.12), rand() * 6, rr(-0.12, 0.12));
      grp.add(fl); seasonal(fl, 'SR');
      const sm = new THREE.Mesh(taperTube(new THREE.CatmullRomCurve3([new V3(0, -0.4, 0), new V3(rr(-0.02, 0.02), fy * 0.5, rr(-0.02, 0.02)), new V3(fl.position.x, fy - 0.03, fl.position.z)]), 12, 6, 0.0065, 0.005, 3), K.stemMat);
      sm.castShadow = true; grp.add(sm);
    }
    setLayer(grp, LAYER.BOTH); seasonal(grp, 'SRA');
    if (fl) setLayer(fl, LAYER.ABOVE);
    grp.position.set(x, WATER_Y, z);
    return grp;
  }
  function makeLilyPad(x, z, opts) {
    opts = opts || {};
    const K = WORLD.pondKit, grp = new THREE.Group(), r = opts.r || rr(0.15, 0.24);
    const m = new THREE.Mesh(padGeo(r, rand() * 40, false), K.padMat); m.castShadow = m.receiveShadow = true; grp.add(m);
    if (opts.flower !== false) {
      const sc = rr(0.9, 1.15), fl = new THREE.Group();
      const pm2 = new THREE.Mesh(waterLilyGeo(sc, rr(0.75, 1.0)), K.lilyMat); pm2.castShadow = true; fl.add(pm2);
      fl.add(new THREE.Mesh(stamenGeo(sc), K.stamenMat));
      fl.position.set(r * 0.35, padSurfaceY(r, r * 0.35, 0) + 0.002, -r * 0.2); fl.rotation.y = rand() * 6; fl.userData.flower = true;
      grp.add(fl);
    }
    setLayer(grp, LAYER.SURFACE); grp.traverse((o) => { if (o.userData.flower) { setLayer(o, LAYER.ABOVE); seasonal(o, 'SR'); } });
    seasonal(grp, 'SRA');
    grp.position.set(x, WATER_Y, z);
    return { mesh: grp, x, z, r, rot: rand() * 6.28, ph: rand() * 10, kind: 'user' };
  }

  // ---------------- 锦鲤：实例化，按 vis 淡入 / gone 隐藏（容量 KOI_N 条） ----------------
  function koiFreeSlot() {
    const n = Math.min(P.fishCount | 0, KOI.fish.length);
    for (let i = 0; i < n; i++) if (KOI.fish[i].gone) return i;
    return n < KOI.fish.length ? n : -1;
  }
  function koiActivate(i, x, z) {
    const f = KOI.fish[i];
    if (i >= (P.fishCount | 0)) P.fishCount = i + 1;
    f.gone = false; f.vis = 0; f.p.set(x, WATER_Y - 0.08, z); f.heading = rand() * 6.28; f.speed = 0.25; f.bursting = true;
    return f;
  }
  function seeds() {
    const out = [];
    (WORLD.willowTrees || []).forEach((g, i) => out.push({ ref: 'willow#' + i, key: 'willow', obj: g }));
    (WORLD.lotus || []).forEach((L, i) => { if (L.leaf && L.leaf.parent) out.push({ ref: 'lotus#' + i, key: 'lotus', obj: L.leaf.parent }); });
    (WORLD.lilies || []).forEach((L, i) => { if (L.kind !== 'frog') out.push({ ref: 'waterlily#' + i, key: 'waterlily', lily: L, obj: L.mesh }); });
    const n = Math.min(P.fishCount | 0, KOI.fish.length);
    for (let i = 0; i < n; i++) out.push({ ref: 'koi#' + i, key: 'koi', fish: KOI.fish[i], index: i });
    return out;
  }
  return { makeWillow, makeCamphor, makeOsmanthus, makeLotus, makeLilyPad, treeFromParts, koiFreeSlot, koiActivate, seeds };
})();
window.PondEdit = PondEdit;
