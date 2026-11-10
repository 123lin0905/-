/*
 * 绵阳校区三维底图（建筑、道路、水体、场地、雕塑）。
 * 迁移自已发布的“天府学院绵阳校区 3D 交互地图”，改为可复用模块：
 *   EcoCampus.build(scene, layout, opts) -> { itemById, items, pickables, nightMats, ... }
 * 依赖：全局 THREE（lib/three.classic.min.js，r170 经典脚本），THREE.GLTFLoader。
 */
(function (global) {
  "use strict";
  const THREE = global.THREE;

  function build(scene, L, opts) {
    opts = opts || {};
    const S = L.scale_m_per_px || 0.4;
    const CX = 1024, CY = 999;
    const W = (p) => [(p[0] - CX) * S, (p[1] - CY) * S]; // 平面图像素 -> 世界 x,z（米）
    const INFO = global.INFO || {};

    // ---------- helpers ----------
    function shapeOf(poly) {
      const s = new THREE.Shape();
      poly.forEach((p, i) => {
        const [x, z] = W(p);
        i ? s.lineTo(x, -z) : s.moveTo(x, -z);
      });
      return s;
    }
    function circleShape(c, r) {
      const s = new THREE.Shape();
      const [x, z] = W(c);
      s.absarc(x, -z, r * S, 0, Math.PI * 2, false);
      return s;
    }
    function flat(shape, color, y, o) {
      o = o || {};
      const g = new THREE.ShapeGeometry(shape, 24);
      g.rotateX(-Math.PI / 2);
      const mat = o.material || new THREE.MeshStandardMaterial(Object.assign({ color, roughness: o.rough != null ? o.rough : 0.95, metalness: 0 }, o.mat || {}));
      const m = new THREE.Mesh(g, mat);
      m.position.y = y;
      m.receiveShadow = true;
      scene.add(m);
      return m;
    }
    function ribbon(path, widthPx, y, color, closed, material) {
      const pos = [];
      const hw = (widthPx * S) / 2;
      const pts = path.map(W);
      if (closed) pts.push(pts[0]);
      for (let i = 0; i < pts.length - 1; i++) {
        const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
        const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz) || 1;
        const nx = (-dz / len) * hw, nz = (dx / len) * hw;
        pos.push(ax + nx, 0, az + nz, bx + nx, 0, bz + nz, bx - nx, 0, bz - nz);
        pos.push(ax + nx, 0, az + nz, bx - nx, 0, bz - nz, ax - nx, 0, az - nz);
      }
      pts.forEach(([x, z]) => {
        const n = 12;
        for (let k = 0; k < n; k++) {
          const a0 = (k / n) * Math.PI * 2, a1 = ((k + 1) / n) * Math.PI * 2;
          pos.push(x, 0, z, x + Math.cos(a1) * hw, 0, z + Math.sin(a1) * hw, x + Math.cos(a0) * hw, 0, z + Math.sin(a0) * hw);
        }
      });
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      const a = g.attributes.position.array;
      for (let i = 0; i < a.length; i += 9) {
        const ux = a[i + 3] - a[i], uz = a[i + 5] - a[i + 2], vx = a[i + 6] - a[i], vz = a[i + 8] - a[i + 2];
        if (uz * vx - ux * vz < 0) {
          for (let j = 0; j < 3; j++) { const t = a[i + 3 + j]; a[i + 3 + j] = a[i + 6 + j]; a[i + 6 + j] = t; }
        }
      }
      g.computeVertexNormals();
      const m = new THREE.Mesh(g, material || new THREE.MeshStandardMaterial({ color, roughness: 1 }));
      m.position.y = y;
      m.receiveShadow = true;
      scene.add(m);
      return m;
    }
    function centroid(poly) {
      let x = 0, y = 0;
      poly.forEach((p) => { x += p[0]; y += p[1]; });
      return [x / poly.length, y / poly.length];
    }
    function inPoly(pt, poly) {
      let inside = false;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const [xi, yi] = poly[i], [xj, yj] = poly[j];
        if (yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) inside = !inside;
      }
      return inside;
    }
    function segDist(p, a, b) {
      const dx = b[0] - a[0], dy = b[1] - a[1];
      const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
      return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
    }
    function polyDist(p, poly, closed) {
      if (closed === undefined) closed = true;
      let d = Infinity;
      const n = closed ? poly.length : poly.length - 1;
      for (let i = 0; i < n; i++) d = Math.min(d, segDist(p, poly[i], poly[(i + 1) % poly.length]));
      return d;
    }
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

    // ---------- ground ----------
    const groundMats = [];
    const ground = new THREE.Mesh(new THREE.CircleGeometry(9000, 64), new THREE.MeshStandardMaterial({ color: "#7c9867", roughness: 1 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.6;
    ground.receiveShadow = true;
    scene.add(ground);
    groundMats.push(ground.material);
    const lawn = flat(shapeOf(L.boundary), "#8fbf73", 0);
    groundMats.push(lawn.material);
    ribbon(L.boundary, 3, 0.05, "#7e8a73", true);

    const roadMat = new THREE.MeshStandardMaterial({ color: "#5b5f66", roughness: 0.95 });
    groundMats.push(roadMat);
    L.outer_roads.forEach((r) => ribbon(r.path, r.width, -0.2, null, false, roadMat));
    L.outer_roads.forEach((r) => ribbon(r.path, 1.2, -0.1, "#e8e2c8"));

    const pickables = [];
    const itemById = {};
    function register(id, name, cat, pos, meshes, extra) {
      const it = Object.assign({ id, name, cat, pos, meshes: meshes || [] }, extra || {});
      it.info = INFO[id] || {};
      itemById[id] = it;
      it.meshes.forEach((m) => { m.userData.id = id; pickables.push(m); });
      return it;
    }

    // 水面：动态法线贴图（由 eco-life 驱动 offset）
    const waterMat = new THREE.MeshStandardMaterial({ color: "#3f8fb5", roughness: 0.18, metalness: 0.25 });
    const poolMat = new THREE.MeshStandardMaterial({ color: "#4fb9e0", roughness: 0.15, metalness: 0.15 });
    const waterMeshes = [];
    L.water.forEach((w) => {
      const m = flat(shapeOf(w.poly), null, 0.35, { material: waterMat });
      waterMeshes.push(m);
      const ms = [m];
      if (w.island) ms.push(flat(circleShape(w.island.c, w.island.r), "#86b56f", 0.5));
      const [x, z] = W(centroid(w.poly));
      register(w.id, w.name, "景观", new THREE.Vector3(x, 3, z), ms, { kind: "水体" });
    });

    L.plazas.forEach((p) => {
      const m = flat(shapeOf(p.poly), p.color, 0.55);
      groundMats.push(m.material);
      const [x, z] = W(centroid(p.poly));
      register(p.id, p.name, "景观", new THREE.Vector3(x, 3, z), [m], { kind: "广场" });
    });

    L.sports.forEach((s) => {
      const col = s.type === "track" ? "#b8574a" : s.type === "court" ? (s.id === "basket" ? "#4f8a6a" : "#3f7fb3") : "#7fae6a";
      const ms = [s.type === "pool" ? flat(shapeOf(s.poly), null, 0.45, { material: poolMat }) : flat(shapeOf(s.poly), col, 0.45)];
      if (s.type === "pool") waterMeshes.push(ms[0]);
      if (s.field) ms.push(flat(shapeOf(s.field), "#5f9e4f", 0.6));
      if (s.type === "court" || s.type === "track") ribbon(s.field || s.poly, 1.4, s.field ? 0.7 : 0.6, "#f2f2f2", true);
      const [x, z] = W(centroid(s.poly));
      register(s.id, s.name, "体育", new THREE.Vector3(x, 3, z), ms, { kind: "场地" });
    });

    const pathMat = new THREE.MeshStandardMaterial({ color: "#e4e1da", roughness: 1 });
    groundMats.push(pathMat);
    L.campus_roads.forEach((r) => ribbon(r.path, r.width, 0.8, null, r.closed, pathMat));

    // ---------- 建筑立面贴图（窗户夜间发光） ----------
    const STYLES = {
      brick: { wall: "#b65a42", roof: "#d9d4cc", glass: "#3c4b5a", band: "#ecebe6" },
      dorm: { wall: "#cf7a4f", roof: "#e3ddd2", glass: "#44515e", band: "#f0e9de" },
      white: { wall: "#eef0f2", roof: "#c9ced4", glass: "#5b7d96", band: "#ffffff" },
      dome: { wall: "#e7e2d8", roof: "#b9c4cc", glass: "#4d6070", band: "#f4f1ea" },
      library: { wall: "#a84a35", roof: "#d5d0c8", glass: "#2f4a5f", band: "#e8e6e0", big: true },
      canteen: { wall: "#d46f6a", roof: "#e6dcd2", glass: "#4a5560", band: "#f3e5e0" },
      shop: { wall: "#e2cba5", roof: "#c7b896", glass: "#55606a", band: "#f2e8d6" },
      kinder: { wall: "#f0c95a", roof: "#e98f5a", glass: "#4b6070", band: "#fff3cf" },
    };
    const CELL_W = 4, CELL_H = 3.6, CELLS = 4;
    const wallMats = {}, roofMats = {}, nightMats = [];
    function makeTextures(st) {
      const px = 64, n = CELLS;
      const c = document.createElement("canvas"); c.width = c.height = px * n;
      const e = document.createElement("canvas"); e.width = e.height = px * n;
      const g = c.getContext("2d"), ge = e.getContext("2d");
      g.fillStyle = st.wall; g.fillRect(0, 0, c.width, c.height);
      ge.fillStyle = "#000"; ge.fillRect(0, 0, e.width, e.height);
      for (let j = 0; j < n; j++) {
        g.fillStyle = st.band; g.fillRect(0, j * px + px - 6, c.width, 6);
        for (let i = 0; i < n; i++) {
          const x = i * px + (st.big ? 4 : 10), y = j * px + (st.big ? 10 : 16), w = px - (st.big ? 8 : 20), h = st.big ? 40 : 30;
          g.fillStyle = st.glass; g.fillRect(x, y, w, h);
          g.fillStyle = "rgba(255,255,255,0.18)"; g.fillRect(x, y, w, 4);
          if (rnd() < 0.62) {
            ge.fillStyle = rnd() < 0.7 ? "#ffd58a" : "#fff0c8";
            ge.fillRect(x, y, w, h);
          }
        }
      }
      const tex = new THREE.CanvasTexture(c), em = new THREE.CanvasTexture(e);
      [tex, em].forEach((t) => {
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.repeat.set(1 / (CELL_W * CELLS), 1 / (CELL_H * CELLS));
        t.anisotropy = 4;
        t.colorSpace = THREE.SRGBColorSpace;
      });
      return { tex, em };
    }
    function matsFor(style) {
      if (!wallMats[style]) {
        const st = STYLES[style] || STYLES.brick;
        const { tex, em } = makeTextures(st);
        wallMats[style] = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: em, emissive: new THREE.Color("#ffffff"), emissiveIntensity: 0, roughness: 0.85 });
        roofMats[style] = new THREE.MeshStandardMaterial({ color: st.roof, roughness: 0.9 });
        nightMats.push(wallMats[style]);
      }
      return [roofMats[style], wallMats[style]];
    }
    function extrude(shape, h, style) {
      const g = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false, curveSegments: 24 });
      g.rotateX(-Math.PI / 2);
      const m = new THREE.Mesh(g, matsFor(style));
      m.castShadow = true; m.receiveShadow = true;
      scene.add(m);
      return m;
    }

    L.buildings.forEach((b) => {
      const ms = [];
      let top = b.h || 10, cpx;
      if (b.parts) {
        b.parts.forEach((p) => ms.push(extrude(shapeOf(p.poly), p.h, b.style)));
        top = Math.max.apply(null, b.parts.map((p) => p.h));
        cpx = centroid(b.parts[0].poly);
      } else if (b.circle) {
        ms.push(extrude(circleShape(b.circle.c, b.circle.r), b.h, b.style));
        const [x, z] = W(b.circle.c);
        const r = b.circle.r * S;
        const dome = new THREE.Mesh(new THREE.SphereGeometry(r * 0.92, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: "#b9c4cc", roughness: 0.4, metalness: 0.3 }));
        dome.scale.y = 0.55; dome.position.set(x, b.h, z);
        dome.castShadow = true; scene.add(dome); ms.push(dome);
        top = b.h + r * 0.5;
        cpx = b.circle.c;
      } else {
        ms.push(extrude(shapeOf(b.poly), b.h, b.style));
        cpx = centroid(b.poly);
      }
      if (b.roundEnd) ms.push(extrude(circleShape(b.roundEnd.c, b.roundEnd.r), b.h, b.style));
      const [x, z] = W(cpx);
      register(b.id, b.name, b.cat, new THREE.Vector3(x, top + 2, z), ms, { kind: "建筑", h: b.h || top, building: true });
    });

    // ---------- 雕塑（AI 模型 sculpture_ai.glb，失败时保留程序化旋涡） ----------
    {
      const sc = L.sculpture;
      const [x, z] = W(sc.pos);
      const grp = new THREE.Group();
      grp.position.set(x, 0.6, z);
      const base = new THREE.Mesh(new THREE.BoxGeometry(9, 1.6, 9), new THREE.MeshStandardMaterial({ color: "#1f1f22", roughness: 0.6 }));
      base.position.y = 0.8;
      const red = new THREE.Mesh(new THREE.SphereGeometry(3.2, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: "#c0262d", roughness: 0.45 }));
      red.position.y = 1.6;
      const pts = [];
      for (let i = 0; i <= 120; i++) {
        const t = i / 120, a = t * Math.PI * 4.2, r = 2.6 * (1 - t * 0.55) + 0.4;
        pts.push(new THREE.Vector3(Math.cos(a) * r, 4.4 + t * 13, Math.sin(a) * r));
      }
      const steel = new THREE.MeshStandardMaterial({ color: "#e4e8ec", metalness: 0.85, roughness: 0.18 });
      const swirl = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 120, 0.55, 8, false), steel);
      const swirl2 = swirl.clone(); swirl2.rotation.y = Math.PI;
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.9, 12, 8), steel); tip.position.y = 18;
      [base, red, swirl, swirl2, tip].forEach((m) => { m.castShadow = true; grp.add(m); });
      scene.add(grp);
      const scItem = register(sc.id, sc.name, "景观", new THREE.Vector3(x, 22, z), [base, red, swirl, swirl2, tip], { kind: "雕塑", note: sc.note });
      const procedural = [swirl, swirl2, tip];
      const PEDESTAL_TOP = red.position.y + 3.2;
      const fallback = (err) => console.warn("雕塑 GLB 加载失败，保留程序化雕塑。", err);
      if (opts.sculptureUrl && THREE.GLTFLoader) {
        try {
          new THREE.GLTFLoader().load(opts.sculptureUrl, (gltf) => {
            try {
              const model = gltf.scene;
              const meshes = [];
              const steelAI = new THREE.MeshStandardMaterial({ color: "#e8ecef", metalness: 0.55, roughness: 0.28 }); // 无环境贴图时金属度过高会发黑
              model.traverse((o) => {
                if (!o.isMesh) return;
                if (!o.geometry.attributes.normal) o.geometry.computeVertexNormals();
                o.material = steelAI;
                o.castShadow = true;
                o.userData.noOutline = true;
                meshes.push(o);
              });
              if (!meshes.length) throw new Error("GLB 中没有网格");
              const box = new THREE.Box3().setFromObject(model);
              const size = box.getSize(new THREE.Vector3());
              if (!(size.y > 0)) throw new Error("GLB 包围盒为空");
              const s = 5 / size.y;
              model.scale.setScalar(s);
              const c = box.getCenter(new THREE.Vector3());
              model.position.set(-c.x * s, PEDESTAL_TOP - box.min.y * s, -c.z * s);
              grp.add(model);
              procedural.forEach((m) => {
                grp.remove(m);
                const pi = pickables.indexOf(m); if (pi >= 0) pickables.splice(pi, 1);
                const mi = scItem.meshes.indexOf(m); if (mi >= 0) scItem.meshes.splice(mi, 1);
              });
              meshes.forEach((m) => { m.userData.id = scItem.id; pickables.push(m); scItem.meshes.push(m); });
              scItem.model = "AI 复原（Hunyuan3D-2，参考校园照片）";
              if (opts.onSculpture) opts.onSculpture(steelAI);
            } catch (err) { fallback(err); }
          }, undefined, fallback);
        } catch (err) { fallback(err); }
      }
    }

    // ---------- 点位 ----------
    L.gates.forEach((g) => {
      const [x, z] = W(g.pos);
      register(g.id, g.name, "出入口", new THREE.Vector3(x, 6, z), [], { kind: "出入口", road: g.road });
    });
    L.bus_stops.forEach((b) => {
      const [x, z] = W(b.pos);
      const post = new THREE.Mesh(new THREE.BoxGeometry(6, 3, 1.5), new THREE.MeshStandardMaterial({ color: "#6d63c7" }));
      post.position.set(x, 1.5, z); post.castShadow = true; scene.add(post);
      register(b.id, b.name, "交通", new THREE.Vector3(x, 5, z), [post], { kind: "公交站" });
    });
    L.parking.forEach((p) => {
      const [x, z] = W(p.pos);
      const pad = new THREE.Mesh(new THREE.BoxGeometry(46, 0.3, 30), new THREE.MeshStandardMaterial({ color: "#8a8d93", roughness: 1 }));
      pad.position.set(x, 0.7, z); pad.receiveShadow = true; scene.add(pad);
      register(p.id, p.name, "交通", new THREE.Vector3(x, 4, z), [pad], { kind: "停车场" });
    });

    // ---------- 可种树的空地（树木本身由 eco-life 生成，便于季节/风动） ----------
    function treeSpots(maxN, avoid) {
      const blockers = [];
      L.buildings.forEach((b) => (b.parts ? b.parts.map((p) => p.poly) : b.poly ? [b.poly] : []).forEach((p) => blockers.push(p)));
      const circles = L.buildings.filter((b) => b.circle).map((b) => b.circle).concat(L.buildings.filter((b) => b.roundEnd).map((b) => b.roundEnd));
      const areas = L.water.map((w) => w.poly).concat(L.sports.map((s) => s.poly)).concat(L.plazas.filter((p) => p.id !== "c_court").map((p) => p.poly));
      const roads = L.campus_roads;
      const xs = L.boundary.map((p) => p[0]), ys = L.boundary.map((p) => p[1]);
      const minX = Math.min.apply(null, xs), maxX = Math.max.apply(null, xs), minY = Math.min.apply(null, ys), maxY = Math.max.apply(null, ys);
      const spots = [];
      let tries = 0;
      seed = 11;
      while (spots.length < maxN && tries < 50000) {
        tries++;
        const p = [minX + rnd() * (maxX - minX), minY + rnd() * (maxY - minY)];
        if (!inPoly(p, L.boundary) || polyDist(p, L.boundary) < 10) continue;
        if (blockers.some((b) => inPoly(p, b) || polyDist(p, b) < 10)) continue;
        if (circles.some((c) => Math.hypot(p[0] - c.c[0], p[1] - c.c[1]) < c.r + 10)) continue;
        if (areas.some((a) => inPoly(p, a) || polyDist(p, a) < 6)) continue;
        if (roads.some((r) => polyDist(p, r.path, false) < r.width / 2 + 6)) continue;
        if (spots.some((s) => Math.hypot(s[0] - p[0], s[1] - p[1]) < 14)) continue;
        const sc = L.sculpture.pos;
        if (Math.hypot(p[0] - sc[0], p[1] - sc[1]) < 30) continue;
        if (avoid && avoid(p)) continue;
        spots.push(p);
      }
      return spots;
    }

    return {
      S, W, shapeOf, centroid, inPoly, polyDist, ribbon, flat, register,
      itemById, items: Object.values(itemById), pickables, nightMats, groundMats,
      waterMat, poolMat, waterMeshes, ground, lawn, roadMat, pathMat, treeSpots,
    };
  }

  global.EcoCampus = { build };
})(window);
