// ---- 翠湖植被（替换原日式庭园的 buildVegetation；由 tools/build_pond.py 插入 pond-main.js）
// 树木位置、种类按官方地图（见 tools/pond_cuihu.js 的 CUIHU.trees）：湖心岛一棵大香樟；西岸蓝花楹与垂柳；东岸垂柳、樱花、圆冠乔木；
// 北端湖尖蓝花楹与粉花小乔木；翠湖广场树池银杏；南岸 D 形种植床 5 棵黄叶栾树，半圆广场后成排银杏。仍用池塘同一套
// growTree 递归分枝 + addCard 叶片卡与同一套材质，垂柳登记为可选中、可移植的“原有个体”。
const GINKGO_FS = 'diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0, 0.8, 0.16) * (dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11)) * 2.4 + 0.03), uAutumn);';
async function buildVegetation() {
  const V3 = THREE.Vector3, C = CUIHU;
  const OCC = []; WORLD.occ = OCC; WORLD.trees = []; WORLD.willows = []; WORLD.willowParts = []; WORLD.irisClumps = [];
  LEAVES.ginkgo = LEAVES.ginkgo || []; LEAVES.jac = LEAVES.jac || [];
  SAKURA.spawn = [];
  const col = (a, b, c, d, e, f) => new THREE.Color().setRGB(rr(a, b), rr(c, d), rr(e, f));
  const gX = (x, z) => (sdf(x + 0.05, z) - sdf(x - 0.05, z)) / 0.1, gZ = (x, z) => (sdf(x, z + 0.05) - sdf(x, z - 0.05)) / 0.1;
  const crown = (x, z, h, o) => growTree(Object.assign({ base: new V3(x, ground(x, z) - 0.15, z), dir: new V3(rr(-0.06, 0.06), 1, rr(-0.06, 0.06)).normalize(),
    len: h * 0.42, rad: 0.06 + h * 0.021, depth: 3, children: [6, 3, 3], childStart: [0.42, 0.3, 0.3], spread: [0.85, 0.8, 0.7], upBias: [0.45, 0.32, 0.28],
    lenDecay: 0.6, radDecay: 0.6, wiggle: [0.06, 0.24, 0.3], gravity: [0, 0.0, -0.03] }, o || {}));
  const cards = (tips, list, k, spread, size, color) => { for (const t of tips) for (let i = 0; i < k; i++) addCard(list, t.p.clone().add(randDir().multiplyScalar(rr(spread[0], spread[1]))), randDir().add(new V3(0, 0.8, 0)), rr(size[0], size[1]), color()); };
  let n = 0;
  for (const T of C.trees) {
    if (n++ % 6 === 0) await phase2Yield(n < 2 ? '种植湖心岛香樟' : n < 20 ? '种植西岸蓝花楹与垂柳' : n < 40 ? '种植银杏与东岸树木' : '种植南岸栾树与银杏');
    const { x, z, h, kind } = T; let r = h * 0.38;
    if (kind === 'camphor' || kind === 'round') {
      const big = kind === 'camphor';
      const tips = crown(x, z, h, big ? { children: [7, 3, 3], spread: [1.0, 0.85, 0.75], upBias: [0.3, 0.25, 0.2], len: h * 0.44, rad: 0.12 + h * 0.024 } : {});
      const tint = big ? [0.78, 1.0, 0.72] : [rr(0.75, 1.0), rr(0.9, 1.08), rr(0.7, 0.92)];
      cards(tips, LEAVES.green, big ? 8 : 6, [0.2, big ? 1.4 : 1.1], big ? [1.0, 1.45] : [0.9, 1.3], () => new THREE.Color().setRGB(tint[0] * rr(0.88, 1.1), tint[1] * rr(0.9, 1.08), tint[2] * rr(0.88, 1.1)));
      r = big ? 7.5 : h * 0.42;
    } else if (kind === 'jacaranda') {
      // 蓝花楹：伞形开展的树冠，细羽状叶 + 成团的蓝紫色花序
      const tips = crown(x, z, h, { len: h * 0.4, spread: [1.1, 0.9, 0.8], upBias: [0.2, 0.15, 0.1], children: [5, 3, 3] });
      cards(tips, LEAVES.green, 3, [0.1, 0.8], [0.7, 1.0], () => col(0.8, 0.95, 0.95, 1.1, 0.7, 0.85));
      cards(tips, LEAVES.jac, 5, [0.0, 0.9], [0.8, 1.15], () => new THREE.Color(0x8f7be6).multiplyScalar(rr(0.85, 1.15)));
      r = h * 0.45;
    } else if (kind === 'blossom' || kind === 'white') {
      const tips = crown(x, z, h, { len: h * 0.38, spread: [1.0, 0.85, 0.75], upBias: [0.3, 0.2, 0.15] });
      const fc = kind === 'white' ? 0xfaf3f2 : 0xf3b6cc;
      cards(tips, LEAVES.green, 2, [0.1, 0.7], [0.6, 0.85], () => col(0.85, 1.0, 0.95, 1.1, 0.75, 0.9));
      cards(tips, LEAVES.bloom, 6, [0.0, 0.8], [0.7, 1.0], () => new THREE.Color(fc).multiplyScalar(rr(0.92, 1.08)));
      for (const t of tips) if (rand() < 0.3) SAKURA.spawn.push(t.p.clone());
      r = h * 0.42;
    } else if (kind === 'koel') {
      // 栾树（官方地图上南岸种植床里的 5 棵黄叶树）：圆整开展的树冠，秋季满树金黄
      const tips = crown(x, z, h, { spread: [0.95, 0.85, 0.75], upBias: [0.35, 0.25, 0.2] });
      cards(tips, LEAVES.ginkgo, 6, [0.15, 1.0], [0.85, 1.2], () => col(0.85, 1.0, 0.95, 1.08, 0.55, 0.7));
      r = h * 0.42;
    } else if (kind === 'ginkgo') {
      // 银杏：笔直主干，短侧枝，窄圆锥形树冠
      const gy = ground(x, z);
      BARK.push(taperTube(new THREE.CatmullRomCurve3([new V3(x, gy - 0.2, z), new V3(x + rr(-0.05, 0.05), gy + h * 0.5, z + rr(-0.05, 0.05)), new V3(x, gy + h * 0.97, z)]), 18, 8, 0.07 + h * 0.012, 0.03, 1));
      for (let y = 2.2; y < h * 0.85; y += 0.9) for (let k = 0; k < 3; k++) {
        const a = rand() * 6.28, L = (1 - (y - 1.8) / (h - 1.8)) * 1.8 + 0.3;
        BARK.push(taperTube(new THREE.CatmullRomCurve3([new V3(x, gy + y, z), new V3(x + Math.cos(a) * L * 0.5, gy + y + L * 0.35, z + Math.sin(a) * L * 0.5), new V3(x + Math.cos(a) * L, gy + y + L * 0.6, z + Math.sin(a) * L)]), 5, 4, 0.035, 0.01, 1));
      }
      for (let y = 1.9; y < h; y += 0.32) {
        const rad = Math.pow(1 - (y - 1.9) / (h - 1.9), 0.85) * 1.95 + 0.25, cnt = Math.round(rad * 4.5 + 2);
        for (let i = 0; i < cnt; i++) {
          const a = rand() * 6.28, rd = rad * Math.sqrt(rr(0.25, 1));
          addCard(LEAVES.ginkgo, new V3(x + Math.cos(a) * rd, gy + y, z + Math.sin(a) * rd), new V3(Math.cos(a), 0.9, Math.sin(a)), rr(0.85, 1.15), col(0.82, 0.98, 0.95, 1.08, 0.5, 0.65));
        }
      }
      r = 2.2;
    } else if (kind === 'willow') {
      // 垂柳：与原池塘同一株型，按实际尺寸放大；登记为可移植的原有个体
      const gy = ground(x, z), nb = BARK.length, nc = LEAVES.sakura.length;
      const lean = new V3(-gX(x, z), 0, -gZ(x, z)).multiplyScalar(0.3);
      const tips = growTree({ base: new V3(x, gy - 0.1, z), dir: new V3(lean.x * 0.5, 1, lean.z * 0.5).normalize(), len: h * 0.42, rad: 0.12 + h * 0.014, depth: 4,
        children: [5, 3, 4, 2], childStart: [0.6, 0.3, 0.2, 0.2], spread: [1.05, 0.9, 0.5, 0.35], upBias: [0.45, 0.35, -0.6, -1.0],
        lenDecay: 0.86, radDecay: 0.6, wiggle: [0.08, 0.2, 0.12, 0.12], gravity: [0.0, -0.02, -0.28, -0.45] });
      for (const b of tips.branches) {
        if (b.lvl < 2) continue;
        for (let t = 0.1; t <= 1.0; t += 0.06) {
          const p = b.curve.getPointAt(t), nn = randDir().add(new V3(0, 0.3, 0));
          addCard(LEAVES.sakura, p.add(randDir().multiplyScalar(0.06)), new V3(nn.x, nn.y * 0.15, nn.z), rr(0.45, 0.65), col(0.85, 1.05, 0.92, 1.08, 0.8, 1.0));
          if (rand() < 0.08) SAKURA.spawn.push(p.clone());
        }
      }
      WORLD.willows.push([x, z, h]);
      WORLD.willowParts.push({ x, z, gy, h, bark: BARK.splice(nb), cards: { sakura: LEAVES.sakura.splice(nc) }, seasons: { sakura: 'SRA' } });
      r = h * 0.45;
    }
    OCC.push([x, z, kind === 'willow' ? 0.9 : Math.min(1.6, 0.6 + h * 0.06)]);
    WORLD.trees.push({ x, z, h, r, kind });
  }

  await phase2Yield('修剪绿篱与花灌木');
  // 绿篱（种植床外缘、北端草坪种植床北缘）
  const hedgeMat = rockMaterial(TEX.hedge, { key: 'hedge', hedge: true, scale: 2.6, nrm: 1.4, rough: 0.72, bloom: 0 });
  const hg = [];
  for (const line of C.hedges) for (let i = 0; i < line.length - 1; i++) {
    const [ax, az] = line[i], [bx, bz] = line[i + 1], L = Math.hypot(bx - ax, bz - az), mx = (ax + bx) / 2, mz = (az + bz) / 2;
    const g = roundedBox(L + 0.25, 0.8, 0.75, 0.12, i + 3); g.rotateY(-Math.atan2(bz - az, bx - ax)); g.translate(mx, ground(mx, mz) + 0.36, mz); hg.push(g);
  }
  if (hg.length) meshOf(hg, hedgeMat, LAYER.ABOVE);
  // 开花灌木丛 / 湖心岛岸边低矮灌木（修剪成团）
  const blob = rockGeo(3.3, 4, -0.25), green = [];
  for (const [px, py, R, bloom] of C.shrubs) {
    const [x, z] = C.W([px, py]), gy = ground(x, z), rx = R, ry = R * 0.7, rz = R * rr(0.85, 1.05);
    const geo = blob.clone(); const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) * rx * 0.82, p.getY(i) * ry * 0.82, p.getZ(i) * rz * 0.82);
    geo.computeVertexNormals(); geo.translate(x, gy + ry * 0.12, z);
    if (bloom) { const m = rockMaterial(TEX.hedge, { key: 'hedge', hedge: true, scale: 2.6, nrm: 1.4, rough: 0.72, bloom: 1, bloomColor: bloom }); WORLD.bloomMats.push(m); const mesh = new THREE.Mesh(geo, m); mesh.castShadow = mesh.receiveShadow = true; setLayer(mesh, LAYER.ABOVE); scene.add(mesh); }
    else green.push(geo);
    for (let i = 0; i < 70; i++) {
      const d = randDir(); if (d.y < -0.15) d.y = -d.y * 0.3;
      const nn = new V3(d.x / rx, d.y / ry, d.z / rz).normalize(), pp = new V3(x + d.x * rx * 0.82, gy + ry * 0.12 + d.y * ry * 0.82, z + d.z * rz * 0.82).addScaledVector(nn, 0.02);
      addCard(LEAVES.shrub, pp, nn, rr(0.25, 0.36), col(0.85, 1.1, 0.9, 1.1, 0.85, 1.0));
      if (bloom && i % 2 === 0) addCard(LEAVES.bloom, pp.clone().addScaledVector(nn, 0.03), nn, rr(0.24, 0.34), new THREE.Color(bloom).multiplyScalar(rr(0.9, 1.15)));
    }
    OCC.push([x, z, R + 0.2]);
  }
  if (green.length) meshOf(green, hedgeMat, LAYER.ABOVE);

  await phase2Yield('种植垂柳、香樟与灌木');
  // --- Bark (all trees in one mesh)
  const barkMat = physical({ map: TEX.bark.map, normalMap: TEX.bark.normalMap, normalScale: new THREE.Vector2(1.5, 1.5), roughness: 0.92, color: 0xb8aaa0, envMapIntensity: 0.6 },
    { key: 'bark', wind: 'world', windWeight: 'clamp((wPos4.y - 1.5) * 0.05, 0.0, 0.35)' });
  const barkMesh = meshOf(BARK, barkMat, LAYER.ABOVE);
  barkMesh.customDepthMaterial = patchedDepth({ key: 'barkd', wind: true, windWeight: 'clamp((wPos4.y - 1.5) * 0.05, 0.0, 0.35)' });
  BARK.length = 0;
  WORLD.barkKit = { mat: barkMat, depth: barkMesh.customDepthMaterial };
  {
    const sm = physical({ map: TEX.sakuraBark.map, normalMap: TEX.sakuraBark.normalMap, normalScale: new THREE.Vector2(1.2, 1.2), roughness: 0.8, envMapIntensity: 0.6 },
      { key: 'barksak', wind: 'world', windWeight: 'clamp((wPos4.y - 1.5) * 0.05, 0.0, 0.35)' });
    WORLD.willowBark = { mat: sm, depth: patchedDepth({ key: 'barkd', wind: true, windWeight: 'clamp((wPos4.y - 1.5) * 0.05, 0.0, 0.35)' }) };
  }
  await phase2Yield('种植垂柳、香樟与灌木');
  // --- Leaf-card instanced meshes (alpha-tested, double sided, translucent, wind-swayed)
  const cardGeo = new THREE.PlaneGeometry(1, 1, 4, 4);
  { const cp = cardGeo.attributes.position; for (let i = 0; i < cp.count; i++) { const x = cp.getX(i), y = cp.getY(i); cp.setZ(i, 0.2 * (x * x + y * y) - 0.05 * y); } cardGeo.computeVertexNormals(); }
  const leafSets = [['maple', TEX.mapleLeaves, 0.45, 0x8a2a2a], ['pine', TEX.pineNeedles, 0.22, 0x5a7040], ['green', TEX.greenLeaves, 0.35, 0x86a050],
    ['conifer', TEX.conifer, 0.18, 0x4a6040], ['shrub', TEX.shrubLeaves, 0.25, 0x6a8a40], ['bloom', TEX.bloomLeaves, 0.4, 0xffc0d0], ['sakura', TEX.sakura, 0.95, 0xffd0dc],
    ['hydrangea', TEX.hydrangea, 0.55, 0xd0d8ff], ['bigleaf', TEX.bigleaf, 0.4, 0x90b060], ['camellia', TEX.camellia, 0.25, 0x406030], ['kikyo', TEX.kikyo, 0.5, 0xb0a0f0],
    ['ginkgo', TEX.greenLeaves, 0.4, 0xd8c060], ['jac', TEX.bloomLeaves, 0.45, 0xb0a0f0]];
  WORLD.leafMats = [];
  WORLD.leafKit = { cardGeo, sets: {} };
  for (const [name, tex, transl] of leafSets) {
    const list = LEAVES[name] || [];
    const ww = 'clamp((wPos4.y - 0.2) * 0.12, 0.0, 1.3)';
    const mat = physical({ map: tex, alphaTest: 0.45, alphaToCoverage: P.quality === 'High', side: THREE.DoubleSide, roughness: 0.62, envMapIntensity: 0.55 },
      { key: 'leaf' + (name === 'ginkgo' ? 'g' : ''), leaf: true, wind: 'world', windWeight: ww, uniforms: { uTransl: { value: transl }, uDecid: { value: { maple: 0.6, green: 1, bigleaf: 1, shrub: 0.35 }[name] || 0 } },
        fsMap: 'diffuseColor.a *= smoothstep(0.2, 0.45, abs(dot(normalize(vNormal), normalize(vViewPosition))));' + (name === 'ginkgo' ? GINKGO_FS : '') });
    WORLD.leafMats.push(mat);
    const seasons = { maple: 'SRA', green: 'SRA', sakura: 'SRA', bloom: 'SR', hydrangea: 'SRA', bigleaf: 'SRA', kikyo: 'SR', ginkgo: 'SRA', jac: 'SRA' }[name] || 'SRAW';
    const depth = patchedDepth({ key: 'leafd', wind: true, windWeight: ww }, tex, 0.45);
    WORLD.leafKit.sets[name] = { mat, depth, seasons };
    WORLD.leafMesh[name] = { material: mat, customDepthMaterial: depth };
    if (!list.length) continue;
    const im = new THREE.InstancedMesh(cardGeo, mat, list.length);
    list.forEach((e, i) => { im.setMatrixAt(i, e.m); im.setColorAt(i, e.c); });
    im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
    seasonal(im, seasons);
    im.castShadow = true; im.receiveShadow = true;
    im.customDepthMaterial = depth;
    im.computeBoundingSphere(); ecoThin(im);
    setLayer(im, LAYER.ABOVE); scene.add(im);
    list.length = 0;
  }
  WORLD.willowTrees = (WORLD.willowParts || []).map((part) => {
    part.barkKit = WORLD.willowBark;
    const g = PondEdit.treeFromParts(part); g.userData.seedTree = 'willow'; scene.add(g); return g;
  });

  await phase2Yield('种植芦苇与草坪');
  // --- 芦苇（北端湖尖、东岸局部的水岸交界处）与近处草坪草丛
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
  const M = new THREE.Matrix4(), Qb = new THREE.Quaternion(), Eb = new THREE.Euler(), Sb = new THREE.Vector3(), Pb = new THREE.Vector3();
  const bladeMat = (tex, key, H) => {
    const ww = `pow(clamp(position.y / ${H.toFixed(2)}, 0.0, 1.0), 1.6)`;
    return [physical({ map: tex, side: THREE.DoubleSide, roughness: 0.6, sheen: 0.4, sheenRoughness: 0.5, sheenColor: new THREE.Color(0xb0c070), envMapIntensity: 0.6 },
      { key, leaf: true, decid: 0.7, wind: 'local', windWeight: ww, uniforms: { uTransl: { value: 0.35 } } }), patchedDepth({ key: key + 'd', wind: true, windWeight: ww })];
  };
  const reedM = [], reedC = [];
  WORLD.grass = [];
  for (const [rx0, rz0] of C.reeds) {
    // 吸附到最近的岸线（水岸交界处）
    let bx = rx0, bz = rz0;
    for (let k = 0; k < 8; k++) { const s = sdf(bx, bz); bx -= gX(bx, bz) * s * 0.9; bz -= gZ(bx, bz) * s * 0.9; }
    WORLD.grass.push([bx, bz]);
    for (let i = 0; i < 260; i++) {
      const a = rand() * 6.28, r = Math.sqrt(rand()) * 2.2, x = bx + Math.cos(a) * r, z = bz + Math.sin(a) * r, sd = sdf(x, z);
      if (sd < -0.9 || sd > 0.8) continue;
      Pb.set(x, Math.min(terrainHeight(x, z), WATER_Y - 0.05) - 0.02, z); Eb.set(rr(-0.12, 0.12), a + rr(-0.4, 0.4), rr(-0.12, 0.12)); Qb.setFromEuler(Eb);
      Sb.set(1, rr(0.85, 1.3), 1); reedM.push(M.compose(Pb, Qb, Sb).clone()); reedC.push(col(0.9, 1.05, 0.9, 1.05, 0.75, 0.9));
    }
  }
  {
    const [m, dm] = bladeMat(TEX.blade, 'reedc', 1.6);
    const im = new THREE.InstancedMesh(blade(1.6, 0.022, 0.35), m, Math.max(1, reedM.length));
    reedM.forEach((mm, i) => { im.setMatrixAt(i, mm); im.setColorAt(i, reedC[i]); }); im.count = reedM.length;
    im.castShadow = im.receiveShadow = true; im.customDepthMaterial = dm; im.computeBoundingSphere(); ecoThin(im); setLayer(im, LAYER.BOTH); scene.add(im);
  }
  {
    const parts = [];
    for (let b = 0; b < 7; b++) { const g = blade(rr(0.045, 0.1), rr(0.003, 0.005), rr(0.005, 0.03), 3); g.rotateY(rand() * Math.PI * 2); g.translate(rr(-0.02, 0.02), 0, rr(-0.02, 0.02)); parts.push(g); }
    const tuft = mergeGeos(parts);
    const [tm] = bladeMat(TEX.blade, 'tuft', 0.1);
    const mats = [], cols = [];
    const zones = [[0, 14, 34, 22], [-6, -106, 30, 16], [-24, -10, 10, 40], [30, -10, 12, 50]];   // 南岸、北端湖尖、西岸、东岸近水草坡
    let guard = 0;
    while (mats.length < 4200 && guard++ < 60000) {
      const Z = zones[guard % zones.length], x = Z[0] + rr(-Z[2], Z[2]), z = Z[1] + rr(-Z[3], Z[3]), sd = sdf(x, z);
      if (sd < 0.35 || sd > 9) continue;
      if (C.inPoly(C.prom, x, z) || C.inPoly(C.plaza, x, z) || C.paths.some((p) => near(p.pts, x, z) < p.w / 2 + 0.2)) continue;
      if (fbm3(x * 0.8, 1, z * 0.8, 2, 44) < -0.05 && rand() < 0.7) continue;
      Pb.set(x, ground(x, z) - 0.005, z); Eb.set(rr(-0.1, 0.1), rand() * 6.28, rr(-0.1, 0.1)); Qb.setFromEuler(Eb); const sc = rr(0.7, 1.4); Sb.set(sc, sc * rr(0.8, 1.3), sc);
      mats.push(M.compose(Pb, Qb, Sb).clone()); cols.push(new THREE.Color().setRGB(rr(0.62, 0.85), rr(0.72, 0.95), rr(0.5, 0.7)));
    }
    const im = new THREE.InstancedMesh(tuft, tm, Math.max(1, mats.length));
    mats.forEach((mm, i) => { im.setMatrixAt(i, mm); im.setColorAt(i, cols[i]); }); im.count = mats.length;
    im.receiveShadow = true; im.computeBoundingSphere(); ecoThin(im); setLayer(im, LAYER.ABOVE); scene.add(im);
  }
  function near(pts, x, z) {
    let b = 1e9;
    for (let i = 0; i < pts.length - 1; i++) { const [ax, az] = pts[i], [bx, bz] = pts[i + 1], ex = bx - ax, ez = bz - az, t = clamp(((x - ax) * ex + (z - az) * ez) / (ex * ex + ez * ez || 1), 0, 1); b = Math.min(b, Math.hypot(x - ax - ex * t, z - az - ez * t)); }
    return b;
  }
  await buildPondLife();
}
// 睡莲片：官方地图上 4～5 片松散的睡莲（岛南、岛东、西南岸、东南湖湾、种植床北），实例化浮叶 + 少量白 / 粉花
function cuihuLilyPatches(padMat, lilyMat, stamenMat) {
  const geos = [0, 1, 2].map((k) => padGeo(0.22, 11 + k * 7.3, false));
  const lists = [[], [], []], flowers = [];
  const M = new THREE.Matrix4(), Qp = new THREE.Quaternion(), Sp = new THREE.Vector3(), Pp = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
  for (const patch of CUIHU.lilyPatches) {
    let n = 0, guard = 0;
    while (n < patch.n && guard++ < patch.n * 12) {
      const a = rand() * 6.28, d = patch.r * Math.sqrt(rand()) * (0.6 + 0.4 * (0.5 + 0.5 * Math.sin(a * 3 + patch.r))), x = patch.c[0] + Math.cos(a) * d, z = patch.c[1] + Math.sin(a) * d;
      if (sdf(x, z) > -0.45) continue;
      const r = rr(0.13, 0.3), s = r / 0.22;
      Pp.set(x, WATER_Y, z); Qp.setFromAxisAngle(Y, rand() * 6.28); Sp.set(s, 1, s);
      lists[n % 3].push(M.compose(Pp, Qp, Sp).clone());
      if (rand() < 0.08) { const fs = rr(0.85, 1.15); Pp.set(x + r * 0.3, WATER_Y + 0.006, z - r * 0.2); Qp.setFromAxisAngle(Y, rand() * 6.28); Sp.set(fs, fs, fs); flowers.push(M.compose(Pp, Qp, Sp).clone()); }
      n++;
    }
  }
  const out = [];
  lists.forEach((L, i) => {
    if (!L.length) return;
    const im = new THREE.InstancedMesh(geos[i], padMat, L.length); L.forEach((m, k) => im.setMatrixAt(k, m));
    im.castShadow = false; im.receiveShadow = true; im.computeBoundingSphere(); setLayer(im, LAYER.SURFACE); scene.add(im); seasonal(im, 'SRA'); out.push(im);
  });
  if (flowers.length) {
    const fg = waterLilyGeo(1, 0.85), sg = stamenGeo(1);
    for (const [g, m] of [[fg, lilyMat], [sg, stamenMat]]) {
      const im = new THREE.InstancedMesh(g, m, flowers.length); flowers.forEach((mm, k) => im.setMatrixAt(k, mm));
      im.castShadow = true; im.computeBoundingSphere(); setLayer(im, LAYER.ABOVE); scene.add(im); seasonal(im, 'SR');
    }
  }
  WORLD.lilyPatches = CUIHU.lilyPatches.map((p) => p.c);
  return out;
}
