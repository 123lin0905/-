/*
 * 生态动态层：天空穹顶、星空、云、鸟群、小猫追蝴蝶、水波、树木风动与季节、路灯、降水粒子、萤火虫。
 *   const life = EcoLife.create(scene, campus, { zones, renderer });
 *   life.setEnvironment(env);  // 每帧由 ecohome.js 传入：太阳、昼夜、天气、季节
 *   life.update(dt, t, camera, target);
 *
 * 参考：
 *  - 天空渐变穹顶着色器改写自 three.js 官方示例 webgl_lights_hemisphere.html（MIT），增加了太阳/月亮光晕与雾混合。
 *  - 鸟群采用 Craig Reynolds Boids 三规则（分离/对齐/聚合），思路同 three.js 示例 webgl_gpgpu_birds（MIT），此处为 CPU + InstancedMesh 实现。
 *  - 降水/花瓣/落叶/萤火虫为自写 GPU 粒子（顶点着色器内循环下落，CPU 零更新）。
 */
(function (global) {
  "use strict";
  const THREE = global.THREE;
  const clamp01 = (v) => Math.max(0, Math.min(1, v));
  const lerp = (a, b, t) => a + (b - a) * t;

  function create(scene, campus, opts) {
    opts = opts || {};
    const W = campus.W;
    const S = campus.S;
    let seed = 1234;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const pixelRatio = () => (opts.renderer ? opts.renderer.getPixelRatio() : 1);
    const updaters = [];

    // ================= 天空穹顶 =================
    const skyUniforms = {
      topColor: { value: new THREE.Color("#2f74d0") },
      horizonColor: { value: new THREE.Color("#cfe5f5") },
      bottomColor: { value: new THREE.Color("#b6c6c9") },
      sunDir: { value: new THREE.Vector3(0, 1, 0) },
      sunColor: { value: new THREE.Color("#fff2d0") },
      sunVis: { value: 1 },
      glow: { value: 1 },
      moonVis: { value: 0 },
      fogColor: { value: new THREE.Color("#c8ccd0") },
      fogAmt: { value: 0 },
      exponent: { value: 0.55 },
    };
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(7000, 32, 16),
      new THREE.ShaderMaterial({
        uniforms: skyUniforms,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        vertexShader: [
          "varying vec3 vDir;",
          "void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
        ].join("\n"),
        fragmentShader: [
          "uniform vec3 topColor; uniform vec3 horizonColor; uniform vec3 bottomColor; uniform vec3 sunDir; uniform vec3 sunColor;",
          "uniform float sunVis; uniform float glow; uniform float moonVis; uniform vec3 fogColor; uniform float fogAmt; uniform float exponent;",
          "varying vec3 vDir;",
          "void main(){",
          "  vec3 d = normalize(vDir); float h = d.y;",
          "  vec3 col = h > 0.0 ? mix(horizonColor, topColor, pow(h, exponent)) : mix(horizonColor, bottomColor, clamp(-h*6.0,0.0,1.0));",
          "  float sd = max(dot(d, sunDir), 0.0);",
          "  col += sunColor * (pow(sd, 6.0) * 0.28 + pow(sd, 48.0) * 0.55) * glow;", // 光晕
          "  col = mix(col, sunColor * 1.6, smoothstep(0.9993, 0.9997, sd) * sunVis);", // 日轮
          "  float md = max(dot(d, -sunDir), 0.0);",
          "  col = mix(col, vec3(0.92,0.94,1.0), smoothstep(0.99955, 0.9998, md) * moonVis);", // 月亮
          "  col += vec3(0.5,0.6,0.9) * pow(md, 200.0) * 0.25 * moonVis;",
          "  col = mix(col, fogColor, fogAmt * (1.0 - smoothstep(0.0, 0.6, h) * 0.5));",
          "  gl_FragColor = vec4(col, 1.0);",
          "  #include <colorspace_fragment>",
          "}",
        ].join("\n"),
      })
    );
    sky.frustumCulled = false;
    sky.renderOrder = -10;
    scene.add(sky);

    // 星空（跟随相机）
    const starCount = 1600;
    const starPos = new Float32Array(starCount * 3), starSeed = new Float32Array(starCount);
    for (let i = 0; i < starCount; i++) {
      const u = rnd(), v = rnd();
      const th = u * Math.PI * 2, y = 0.08 + v * 0.92;
      const r = Math.sqrt(1 - y * y);
      starPos.set([Math.cos(th) * r * 6500, y * 6500, Math.sin(th) * r * 6500], i * 3);
      starSeed[i] = rnd();
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
    starGeo.setAttribute("aSeed", new THREE.BufferAttribute(starSeed, 1));
    const starMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uOpacity: { value: 0 }, uPR: { value: 1 } },
      transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending,
      vertexShader: "attribute float aSeed; uniform float uTime; uniform float uPR; varying float vA; void main(){ vA = 0.55 + 0.45*sin(uTime*(1.0+aSeed*3.0) + aSeed*40.0); gl_PointSize = (1.0 + aSeed*2.2) * uPR; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
      fragmentShader: "uniform float uOpacity; varying float vA; void main(){ vec2 c = gl_PointCoord-0.5; float a = smoothstep(0.5,0.0,length(c)); gl_FragColor = vec4(vec3(1.0,0.97,0.9), a*vA*uOpacity); }",
    });
    const stars = new THREE.Points(starGeo, starMat);
    stars.frustumCulled = false;
    stars.renderOrder = -9;
    scene.add(stars);

    // ================= 云 =================
    function puffTexture() {
      const c = document.createElement("canvas"); c.width = c.height = 128;
      const g = c.getContext("2d");
      for (let i = 0; i < 9; i++) {
        const x = 30 + rnd() * 68, y = 44 + rnd() * 40, r = 18 + rnd() * 26;
        const gr = g.createRadialGradient(x, y, 0, x, y, r);
        gr.addColorStop(0, "rgba(255,255,255,0.9)"); gr.addColorStop(1, "rgba(255,255,255,0)");
        g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
      }
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
    }
    const cloudTex = puffTexture();
    const cloudMat = new THREE.SpriteMaterial({ map: cloudTex, color: "#ffffff", transparent: true, depthWrite: false, opacity: 0.9, fog: false });
    const clouds = [];
    const CLOUD_N = 34, CLOUD_R = 2600;
    for (let i = 0; i < CLOUD_N; i++) {
      const grp = new THREE.Group();
      const n = 3 + Math.floor(rnd() * 3);
      for (let k = 0; k < n; k++) {
        const sp = new THREE.Sprite(cloudMat);
        const s = 180 + rnd() * 220;
        sp.scale.set(s * 1.6, s * 0.75, 1);
        sp.position.set((k - n / 2) * 110 + rnd() * 60, rnd() * 30, rnd() * 80);
        grp.add(sp);
      }
      grp.position.set((rnd() - 0.5) * CLOUD_R * 2, 520 + rnd() * 260, (rnd() - 0.5) * CLOUD_R * 2);
      grp.userData.rank = rnd();
      scene.add(grp);
      clouds.push(grp);
    }

    // ================= 水面波纹（动态法线贴图） =================
    function waterNormals() {
      const N = 128, c = document.createElement("canvas"); c.width = c.height = N;
      const g = c.getContext("2d"), img = g.createImageData(N, N);
      const waves = [];
      for (let i = 0; i < 7; i++) waves.push([1 + Math.floor(rnd() * 5), 1 + Math.floor(rnd() * 5) * (rnd() < 0.5 ? -1 : 1), rnd() * 6.28, 0.5 + rnd()]);
      const hgt = (x, y) => waves.reduce((s, w) => s + Math.sin(((w[0] * x + w[1] * y) / N) * Math.PI * 2 + w[2]) * w[3], 0);
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const dx = hgt(x + 1, y) - hgt(x - 1, y), dy = hgt(x, y + 1) - hgt(x, y - 1);
        const nx = -dx * 0.6, ny = -dy * 0.6, nz = 1, l = Math.hypot(nx, ny, nz);
        const o = (y * N + x) * 4;
        img.data[o] = ((nx / l) * 0.5 + 0.5) * 255; img.data[o + 1] = ((ny / l) * 0.5 + 0.5) * 255; img.data[o + 2] = ((nz / l) * 0.5 + 0.5) * 255; img.data[o + 3] = 255;
      }
      g.putImageData(img, 0, 0);
      const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(0.06, 0.06); return t;
    }
    const wn = waterNormals();
    const wn2 = wn.clone(); wn2.repeat.set(0.03, 0.03);
    campus.waterMat.normalMap = wn; campus.waterMat.normalScale.set(0.6, 0.6); campus.waterMat.needsUpdate = true;
    campus.poolMat.normalMap = wn2; campus.poolMat.normalScale.set(0.35, 0.35); campus.poolMat.needsUpdate = true;
    // 荷叶（夏季荷花池）、水面亮点
    const waterBase = campus.waterMat.color.clone();

    // ================= 树木（instancing + 风动 + 季节） =================
    const zones = opts.zones || [];
    const lawnZone = zones.find((z) => z.id === "central_lawn");
    const catHome = lawnZone ? lawnZone.center : [850, 1090];
    const spots = campus.treeSpots(320, (p) => Math.hypot(p[0] - catHome[0], p[1] - catHome[1]) < 55); // 给小猫留出空草地
    const NT = spots.length;
    const treeKind = []; // 0 常绿（香樟等） 1 落叶（银杏/枫） 2 樱花
    spots.forEach((p, i) => {
      const r = rnd();
      treeKind.push(r < 0.52 ? 0 : r < 0.8 ? 1 : 2);
    });
    const windU = { value: 0.6 }, timeU = { value: 0 };
    function swayMaterial(mat, amp) {
      mat.onBeforeCompile = (sh) => {
        sh.uniforms.uTime = timeU; sh.uniforms.uWind = windU;
        sh.vertexShader = "uniform float uTime; uniform float uWind;\n" + sh.vertexShader.replace(
          "#include <begin_vertex>",
          [
            "#include <begin_vertex>",
            "#ifdef USE_INSTANCING",
            "  vec3 ip = instanceMatrix[3].xyz;",
            "  float ph = ip.x * 0.05 + ip.z * 0.07;",
            "  float hh = max(position.y + 1.0, 0.0);",
            "  float gust = 0.6 + 0.4 * sin(uTime * 0.37 + ip.x * 0.01);",
            "  transformed.x += sin(uTime * 1.7 + ph) * uWind * hh * " + amp.toFixed(3) + " * gust;",
            "  transformed.z += cos(uTime * 1.3 + ph * 1.3) * uWind * hh * " + (amp * 0.7).toFixed(3) + " * gust;",
            "#endif",
          ].join("\n")
        );
      };
      return mat;
    }
    const trunkGeo = new THREE.CylinderGeometry(0.3, 0.45, 3, 6);
    const trunk = new THREE.InstancedMesh(trunkGeo, new THREE.MeshStandardMaterial({ color: "#6b4f3a", roughness: 1 }), NT);
    const crownMat = swayMaterial(new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.9, flatShading: true }), 0.09);
    const crown = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), crownMat, NT);
    // 冬季枯枝：几根细圆柱合并为一个几何体
    function branchGeometry() {
      const parts = [];
      const add = (len, rx, rz, y) => {
        const g = new THREE.CylinderGeometry(0.06, 0.16, len, 4);
        g.translate(0, len / 2, 0);
        g.rotateX(rx); g.rotateZ(rz); g.translate(0, y, 0);
        parts.push(g.toNonIndexed());
      };
      add(3.4, 0, 0, 2.8);
      add(2.6, 0.7, 0.2, 3.4); add(2.4, -0.6, 0.5, 3.6); add(2.2, 0.2, -0.8, 3.9); add(2.0, -0.3, 0.9, 4.4); add(1.8, 0.9, -0.3, 4.8);
      let n = 0; parts.forEach((g) => (n += g.attributes.position.count));
      const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3);
      let o = 0;
      parts.forEach((g) => { pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); o += g.attributes.position.count; });
      const bg = new THREE.BufferGeometry();
      bg.setAttribute("position", new THREE.BufferAttribute(pos, 3)); bg.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
      return bg;
    }
    const bareIdx = [];
    spots.forEach((p, i) => { if (treeKind[i] !== 0) bareIdx.push(i); });
    const branches = new THREE.InstancedMesh(branchGeometry(), swayMaterial(new THREE.MeshStandardMaterial({ color: "#5d4636", roughness: 1 }), 0.03), Math.max(1, bareIdx.length));
    const treeScale = [], treeRot = [];
    const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), v3 = new THREE.Vector3(), s3 = new THREE.Vector3(), col = new THREE.Color();
    spots.forEach((p, i) => {
      const [x, z] = W(p);
      treeScale.push(2.6 + rnd() * 2.2);
      treeRot.push(rnd() * 6.28);
      mtx.compose(v3.set(x, 1.5, z), q.identity(), s3.set(1, 1, 1));
      trunk.setMatrixAt(i, mtx);
    });
    bareIdx.forEach((ti, j) => {
      const [x, z] = W(spots[ti]);
      const s = treeScale[ti] * 0.42;
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), treeRot[ti]);
      mtx.compose(v3.set(x, 0, z), q, s3.set(s, s, s));
      branches.setMatrixAt(j, mtx);
    });
    trunk.castShadow = crown.castShadow = branches.castShadow = true;
    crown.receiveShadow = true;
    scene.add(trunk, crown, branches);
    branches.visible = false;

    const PALETTE = {
      spring: [["#6fbf55", "#7ccc5d", "#5daa4c"], ["#9bd86a", "#a8e07a", "#8acb5c"], ["#f7b6cf", "#f9c9db", "#f29bbd"]],
      summer: [["#2f6e32", "#3a7c38", "#2b6530"], ["#3f8240", "#467f3a", "#357437"], ["#3e7a3a", "#467f3c", "#3a7036"]],
      autumn: [["#4b7b3a", "#567f3c", "#41703a"], ["#e6b12a", "#d9532e", "#eb8f2a"], ["#c8642f", "#d77a35", "#b8502c"]],
      winter: [["#5d7258", "#64785c", "#56694f"], ["#000000"], ["#000000"]],
    };
    let curSeason = null;
    function applySeason(season) {
      if (season === curSeason) return;
      curSeason = season;
      const winter = season === "winter";
      spots.forEach((p, i) => {
        const [x, z] = W(p);
        const k = treeKind[i];
        const bare = winter && k !== 0;
        let s = bare ? 0.0001 : treeScale[i] * (winter ? 0.9 : 1);
        if (k === 2 && season === "spring") s *= 1.05;
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), treeRot[i]);
        mtx.compose(v3.set(x, 3 + treeScale[i] * 0.9, z), q, s3.set(s, s * 1.15, s));
        crown.setMatrixAt(i, mtx);
        const pal = PALETTE[season][k];
        crown.setColorAt(i, col.set(pal[i % pal.length]));
      });
      crown.instanceMatrix.needsUpdate = true;
      if (crown.instanceColor) crown.instanceColor.needsUpdate = true;
      branches.visible = winter;
      lotus.visible = season === "summer";
      flowers.visible = season === "spring" || season === "summer";
    }

    // ================= 荷叶 / 草地小花 =================
    const lotus = (() => {
      const pond = (campus.itemById.hehuachi || {}).pos;
      const n = 26;
      const m = new THREE.InstancedMesh(new THREE.CircleGeometry(1.4, 10).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: "#3f8f3a", roughness: 0.8 }), n);
      const L = opts.layout;
      const poly = L && L.water.find((w) => w.id === "hehuachi");
      let k = 0, tries = 0;
      while (poly && k < n && tries < 2000) {
        tries++;
        const xs = poly.poly.map((p) => p[0]), ys = poly.poly.map((p) => p[1]);
        const p = [Math.min(...xs) + rnd() * (Math.max(...xs) - Math.min(...xs)), Math.min(...ys) + rnd() * (Math.max(...ys) - Math.min(...ys))];
        if (!campus.inPoly(p, poly.poly) || campus.polyDist(p, poly.poly) < 6) continue;
        const [x, z] = W(p);
        const s = 0.7 + rnd() * 0.9;
        mtx.compose(v3.set(x, 0.45, z), q.identity(), s3.set(s, 1, s));
        m.setMatrixAt(k, mtx);
        m.setColorAt(k, col.set(rnd() < 0.25 ? "#f49ac1" : "#3f8f3a"));
        k++;
      }
      m.count = k;
      scene.add(m);
      return m;
    })();
    const flowers = (() => {
      const n = 260;
      const m = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.35, 0), new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.8 }), n);
      const poly = lawnZone ? lawnZone.polygon : null;
      let k = 0, tries = 0;
      const cols = ["#ffd84a", "#ffffff", "#f59ec4", "#c7a6ff"];
      while (poly && k < n && tries < 5000) {
        tries++;
        const p = [catHome[0] + (rnd() - 0.5) * 300, catHome[1] + (rnd() - 0.5) * 300];
        if (!campus.inPoly(p, poly)) continue;
        if (campus.polyDist(p, poly) < 12) continue;
        const [x, z] = W(p);
        mtx.compose(v3.set(x, 0.3, z), q.identity(), s3.set(1, 0.6, 1));
        m.setMatrixAt(k, mtx);
        m.setColorAt(k, col.set(cols[k % cols.length]));
        k++;
      }
      m.count = k;
      scene.add(m);
      return m;
    })();

    // ================= 路灯 =================
    const lampPts = [];
    campus.itemById && opts.layout && opts.layout.campus_roads.forEach((r) => {
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
    const poles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.12, 0.18, 6, 5), new THREE.MeshStandardMaterial({ color: "#3a3f45", roughness: 0.7 }), NL);
    const bulbMat = new THREE.MeshBasicMaterial({ color: "#555a60" });
    const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.55, 8, 6), bulbMat, NL);
    const glowTex = (() => {
      const c = document.createElement("canvas"); c.width = c.height = 64;
      const g = c.getContext("2d"); const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.25, "rgba(255,255,255,0.55)"); gr.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
      return new THREE.CanvasTexture(c);
    })();
    const poolMatL = new THREE.MeshBasicMaterial({ map: glowTex, color: "#ffcf7a", transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
    const lightPools = new THREE.InstancedMesh(new THREE.PlaneGeometry(16, 16).rotateX(-Math.PI / 2), poolMatL, NL);
    const haloPos = new Float32Array(NL * 3);
    lampPts.forEach((p, i) => {
      const [x, z] = W(p);
      mtx.compose(v3.set(x, 3, z), q.identity(), s3.set(1, 1, 1)); poles.setMatrixAt(i, mtx);
      mtx.compose(v3.set(x, 6.2, z), q.identity(), s3.set(1, 1, 1)); bulbs.setMatrixAt(i, mtx);
      mtx.compose(v3.set(x, 1.0, z), q.identity(), s3.set(1, 1, 1)); lightPools.setMatrixAt(i, mtx);
      haloPos.set([x, 6.2, z], i * 3);
    });
    const haloGeo = new THREE.BufferGeometry(); haloGeo.setAttribute("position", new THREE.BufferAttribute(haloPos, 3));
    const haloMat = new THREE.PointsMaterial({ map: glowTex, color: "#ffd38a", size: 9, sizeAttenuation: true, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
    const halos = new THREE.Points(haloGeo, haloMat);
    lightPools.renderOrder = 2;
    scene.add(poles, bulbs, lightPools, halos);

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
        uWind: { value: new THREE.Vector2(0, 0) }, uBase: { value: o.base || 0 },
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
          "uniform vec3 uColor; uniform vec3 uColor2; uniform float uOpacity; varying float vA; varying float vRot; varying float vMix;",
          "void main(){",
          "  vec2 c = gl_PointCoord - 0.5; float a;",
          o.shape === "streak"
            ? "  a = (1.0 - smoothstep(0.02, 0.07, abs(c.x))) * (1.0 - smoothstep(0.3, 0.5, abs(c.y)));"
            : o.shape === "petal"
            ? "  float cs = cos(vRot), sn = sin(vRot); vec2 r = vec2(c.x*cs - c.y*sn, c.x*sn + c.y*cs); a = 1.0 - smoothstep(0.18, 0.24, length(r * vec2(1.0, 2.2)));"
            : "  a = 1.0 - smoothstep(0.15, 0.5, length(c));",
          "  vec3 col = mix(uColor, uColor2, step(0.5, vMix));",
          "  gl_FragColor = vec4(col, a * vA * uOpacity);",
          "  if (gl_FragColor.a < 0.01) discard;",
          "}",
        ].join("\n"),
      });
      const p = new THREE.Points(g, m);
      p.frustumCulled = false;
      p.visible = false;
      scene.add(p);
      return { points: p, u };
    }
    const rain = particleSystem({ count: 9000, area: 700, height: 320, speed: 160, size: 9, color: "#b8c8da", shape: "streak" });
    const snow = particleSystem({ count: 6000, area: 700, height: 320, speed: 9, sway: 6, size: 5, color: "#ffffff", shape: "round" });
    const petals = particleSystem({ count: 1200, area: 600, height: 70, speed: 2.2, sway: 5, size: 9, color: "#f8bfd6", color2: "#ffe3ee", shape: "petal" });
    const leaves = particleSystem({ count: 1100, area: 600, height: 70, speed: 3.2, sway: 6, size: 10, color: "#e3a12b", color2: "#cf4f2a", shape: "petal" });
    const fireflies = particleSystem({ count: 700, area: 500, height: 6, base: 0.6, speed: 0, size: 3.2, color: "#d8ff7a", shape: "round", additive: true, firefly: true });

    // ================= 鸟群（Boids） =================
    const BIRDS_PER_FLOCK = 18, FLOCKS = 2, NB = BIRDS_PER_FLOCK * FLOCKS;
    const birdMat = new THREE.MeshStandardMaterial({ color: "#2b2f36", roughness: 0.8, side: THREE.DoubleSide, flatShading: true });
    const bodyGeo = new THREE.ConeGeometry(0.45, 2.6, 4); bodyGeo.rotateX(Math.PI / 2); // 朝 +z
    const wingGeoL = new THREE.BufferGeometry();
    wingGeoL.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0.7, 0, 0, -0.6, 3.0, 0, -0.9], 3));
    wingGeoL.computeVertexNormals();
    const wingGeoR = new THREE.BufferGeometry();
    wingGeoR.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0.7, -3.0, 0, -0.9, 0, 0, -0.6], 3));
    wingGeoR.computeVertexNormals();
    const birdBody = new THREE.InstancedMesh(bodyGeo, birdMat, NB);
    const birdWL = new THREE.InstancedMesh(wingGeoL, birdMat, NB);
    const birdWR = new THREE.InstancedMesh(wingGeoR, birdMat, NB);
    [birdBody, birdWL, birdWR].forEach((m) => { m.frustumCulled = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(m); });
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
    const bm = new THREE.Matrix4(), wm = new THREE.Matrix4(), rm = new THREE.Matrix4(), look = new THREE.Matrix4();
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
          look.lookAt(tmpA.copy(b.p).add(b.v), b.p, up); // 让 +z 指向速度方向
          bm.copy(look).setPosition(b.p);
          const bank = THREE.MathUtils.clamp(-b.v.x * 0.0, -0.5, 0.5);
          const flap = Math.sin(b.phase) * 0.75 + 0.15;
          birdBody.setMatrixAt(i, bm);
          wm.copy(bm).multiply(rm.makeRotationZ(flap + bank)); birdWL.setMatrixAt(i, wm);
          wm.copy(bm).multiply(rm.makeRotationZ(-flap + bank)); birdWR.setMatrixAt(i, wm);
        } else {
          bm.makeScale(0, 0, 0);
          birdBody.setMatrixAt(i, bm); birdWL.setMatrixAt(i, bm); birdWR.setMatrixAt(i, bm);
        }
      }
      birdBody.instanceMatrix.needsUpdate = birdWL.instanceMatrix.needsUpdate = birdWR.instanceMatrix.needsUpdate = true;
    }

    // ================= 小猫追蝴蝶（中心草坪） =================
    const [hx, hz] = W(catHome);
    const lawnPolyW = lawnZone ? lawnZone.polygon : null;
    const inLawn = (x, z) => !lawnPolyW || campus.inPoly([x / S + 1024, z / S + 999], lawnPolyW);
    const PLAY_R = 30; // 米
    const cat = new THREE.Group();
    const CAT_SCALE = 3.6; // 卡通化放大，便于远景看见
    {
      const fur = new THREE.MeshStandardMaterial({ color: "#e49a3a", roughness: 0.9, flatShading: true });
      const white = new THREE.MeshStandardMaterial({ color: "#f6efe4", roughness: 0.9, flatShading: true });
      const dark = new THREE.MeshBasicMaterial({ color: "#1d1d1f" });
      const pink = new THREE.MeshStandardMaterial({ color: "#f0a3a8" });
      const box = (w, h, d, m) => { const me = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); me.castShadow = true; return me; };
      const body = box(0.42, 0.36, 0.95, fur); body.position.set(0, 0.55, 0); cat.add(body);
      const belly = box(0.36, 0.1, 0.7, white); belly.position.set(0, 0.38, 0.02); cat.add(belly);
      const head = new THREE.Group(); head.position.set(0, 0.82, 0.55); cat.add(head);
      head.add(box(0.42, 0.36, 0.36, fur));
      const muzzle = box(0.22, 0.14, 0.1, white); muzzle.position.set(0, -0.07, 0.2); head.add(muzzle);
      const nose = box(0.06, 0.04, 0.03, pink); nose.position.set(0, -0.01, 0.26); head.add(nose);
      [-0.11, 0.11].forEach((x) => {
        const e = box(0.07, 0.07, 0.02, dark); e.position.set(x, 0.05, 0.185); head.add(e);
        const ear = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.2, 4), fur); ear.position.set(x * 1.25, 0.26, -0.02); ear.rotation.y = Math.PI / 4; ear.castShadow = true; head.add(ear);
      });
      const legs = [];
      [[-0.14, 0.33], [0.14, 0.33], [-0.14, -0.33], [0.14, -0.33]].forEach(([x, z], i) => {
        const pivot = new THREE.Group(); pivot.position.set(x, 0.45, z);
        const leg = box(0.11, 0.42, 0.11, i < 2 ? white : fur); leg.position.y = -0.21; pivot.add(leg);
        cat.add(pivot); legs.push(pivot);
      });
      const tail = new THREE.Group(); tail.position.set(0, 0.65, -0.48); cat.add(tail);
      const seg1 = box(0.08, 0.08, 0.38, fur); seg1.position.z = -0.19; tail.add(seg1);
      const tail2 = new THREE.Group(); tail2.position.z = -0.36; tail.add(tail2);
      const seg2 = box(0.08, 0.08, 0.34, fur); seg2.position.z = -0.17; tail2.add(seg2);
      cat.userData = { legs, tail, tail2, head, body };
    }
    cat.scale.setScalar(CAT_SCALE);
    cat.position.set(hx, 0.5, hz);
    scene.add(cat);

    const BF_N = 7;
    const butterflies = [];
    {
      const wingColors = ["#ffd447", "#ffffff", "#7cc7ff", "#ff9ec7", "#ffb347", "#c8a2ff", "#ffe680"];
      const wingGeo = new THREE.BufferGeometry();
      wingGeo.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0.18, 0.55, 0, 0.42, 0.62, 0, -0.08, 0, 0, 0.18, 0.62, 0, -0.08, 0.4, 0, -0.42, 0, 0, 0.18, 0.4, 0, -0.42, 0, 0, -0.2], 3));
      wingGeo.computeVertexNormals();
      for (let i = 0; i < BF_N; i++) {
        const g = new THREE.Group();
        const m = new THREE.MeshStandardMaterial({ color: wingColors[i % wingColors.length], side: THREE.DoubleSide, roughness: 0.6, emissive: wingColors[i % wingColors.length], emissiveIntensity: 0.15 });
        const l = new THREE.Mesh(wingGeo, m), r = new THREE.Mesh(wingGeo, m);
        r.scale.x = -1;
        const bodyM = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.4), new THREE.MeshBasicMaterial({ color: "#222" }));
        g.add(l, r, bodyM);
        g.scale.setScalar(2.6);
        g.userData = { l, r, phase: rnd() * 6, home: new THREE.Vector3(hx + (rnd() - 0.5) * 30, 0, hz + (rnd() - 0.5) * 30), seed: rnd() * 100, flee: 0, pos: new THREE.Vector3() };
        g.position.set(hx + (rnd() - 0.5) * 30, 2, hz + (rnd() - 0.5) * 30);
        scene.add(g);
        butterflies.push(g);
      }
    }
    const catState = { mode: "chase", target: 0, timer: 0, speed: 0, heading: 0, jump: 0, jumpFrom: null };
    let creaturesActive = true; // 夜间/雨天：蝴蝶隐藏、小猫打盹
    function updateButterflies(dt, t) {
      butterflies.forEach((b, i) => {
        const d = b.userData;
        b.visible = creaturesActive;
        if (!creaturesActive) return;
        d.phase += dt * 22;
        const flap = Math.sin(d.phase) * 1.0;
        d.l.rotation.z = flap; d.r.rotation.z = -flap;
        const s = d.seed;
        const tx = d.home.x + Math.sin(t * 0.33 + s) * 14 + Math.sin(t * 0.9 + s * 2) * 4;
        const tz = d.home.z + Math.cos(t * 0.27 + s * 1.7) * 14 + Math.cos(t * 1.1 + s) * 4;
        let ty = 2.6 + Math.sin(t * 1.7 + s) * 1.2 + Math.sin(t * 4.1 + s) * 0.3;
        if (d.flee > 0) { d.flee -= dt; ty += 7 * Math.sin(Math.min(1, d.flee / 2.5) * Math.PI); }
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
        // 趴下打盹，尾巴轻摆
        cat.position.y += (0.2 - cat.position.y) * Math.min(1, dt * 3);
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
        st.speed += ((dist > 3 ? 7.5 : 3) - st.speed) * Math.min(1, dt * 2);
        const nx = cat.position.x + Math.sin(st.heading) * st.speed * dt, nz = cat.position.z + Math.cos(st.heading) * st.speed * dt;
        if (Math.hypot(nx - hx, nz - hz) < PLAY_R * 1.3 && inLawn(nx, nz)) { cat.position.x = nx; cat.position.z = nz; }
        else { st.target = (st.target + 1) % BF_N; }
        cat.position.y = 0.5;
        moving = st.speed;
        if (dist < 6 && b.position.y < 4.5) {
          st.mode = "pounce"; st.jump = 0; st.jumpFrom = cat.position.clone();
          st.jumpTo = new THREE.Vector3(tx, 0.5, tz);
          b.userData.flee = 2.5;
        }
      } else if (st.mode === "pounce") {
        st.jump += dt / 0.65;
        const k = Math.min(1, st.jump);
        cat.position.lerpVectors(st.jumpFrom, st.jumpTo, k);
        cat.position.y = 0.5 + Math.sin(k * Math.PI) * 2.4;
        u.legs.forEach((l, i) => (l.rotation.x = (i < 2 ? -1 : 1) * Math.sin(k * Math.PI) * 0.9));
        u.body.rotation.x = -Math.cos(k * Math.PI) * 0.25;
        if (k >= 1) { st.mode = "sit"; st.timer = 1.6 + rnd() * 1.8; u.body.rotation.x = 0; }
      } else if (st.mode === "sit") {
        st.timer -= dt;
        cat.position.y = 0.5;
        u.legs.forEach((l, i) => (l.rotation.x = i >= 2 ? 0.4 : 0));
        u.head.rotation.x = -0.35 + Math.sin(t * 2) * 0.1; // 抬头看飞走的蝴蝶
        u.tail.rotation.y = Math.sin(t * 6) * 0.6;
        if (st.timer <= 0) { st.mode = "chase"; st.target = Math.floor(rnd() * BF_N); u.head.rotation.x = 0; }
      }
      if (st.mode === "chase") {
        const ph = t * moving * 2.2;
        u.legs.forEach((l, i) => (l.rotation.x = Math.sin(ph + (i === 0 || i === 3 ? 0 : Math.PI)) * 0.7 * Math.min(1, moving / 4)));
        u.tail.rotation.x = 0.5 + Math.sin(t * 4) * 0.1;
        u.tail2.rotation.x = 0.6;
        u.tail.rotation.y = Math.sin(t * 3) * 0.25;
        u.head.rotation.x = 0;
      }
      cat.rotation.y = st.heading;
    }

    // ================= 环境（由主程序每帧设置） =================
    const env = { night: 0, cloud: 0, rain: 0, snow: 0, fog: 0, thunder: false, season: "autumn", wind: 10 };
    let flash = 0, nextFlash = 3;
    function setEnvironment(e) {
      Object.assign(env, e);
      applySeason(env.season);
    }

    // ================= 每帧更新 =================
    const center = new THREE.Vector3();
    function update(dt, t, camera, target) {
      timeU.value = t;
      windU.value = 0.35 + Math.min(1.6, (env.wind || 8) / 14) + env.rain * 0.6;
      const pr = pixelRatio();
      sky.position.copy(camera.position);
      stars.position.copy(camera.position);
      starMat.uniforms.uTime.value = t;
      starMat.uniforms.uPR.value = pr;
      starMat.uniforms.uOpacity.value = env.night * (1 - env.cloud * 0.85) * (1 - env.fog);

      // 云：数量与颜色随云量/昼夜变化，随风漂移
      const vis = 0.2 + env.cloud * 0.8;
      const cg = lerp(1, 0.55, Math.max(env.rain, env.snow * 0.6, env.cloud > 0.85 ? (env.cloud - 0.85) * 3 : 0));
      const nightTint = lerp(1, 0.22, env.night);
      cloudMat.color.setRGB(cg * nightTint, cg * nightTint, cg * nightTint * (1 + env.night * 0.15));
      cloudMat.opacity = 0.55 + env.cloud * 0.4;
      clouds.forEach((c) => {
        c.visible = c.userData.rank < vis;
        c.position.x += dt * (6 + (env.wind || 8) * 0.8);
        if (c.position.x > CLOUD_R) c.position.x -= CLOUD_R * 2;
      });

      // 水波
      const ws = 0.012 + (env.wind || 8) * 0.0008;
      wn.offset.x = t * ws; wn.offset.y = t * ws * 0.6;
      wn2.offset.x = -t * ws * 0.5; wn2.offset.y = t * ws * 0.3;
      const rip = 0.5 + env.rain * 1.2 + Math.min(0.6, (env.wind || 8) / 30);
      campus.waterMat.normalScale.set(rip, rip);
      campus.waterMat.color.copy(waterBase).multiplyScalar(lerp(1, 0.45, env.night) * (1 - env.rain * 0.2));

      // 粒子中心：取相机与观察点之间
      center.copy(target).lerp(camera.position, 0.45); center.y = 0;
      [rain, snow, petals, leaves, fireflies].forEach((p) => {
        p.u.uTime.value = t; p.u.uPR.value = pr; p.u.uCenter.value.copy(center);
      });
      const wx = (env.wind || 8) * 0.6;
      rain.u.uWind.value.set(wx, wx * 0.3);
      rain.points.visible = env.rain > 0.01; rain.u.uOpacity.value = 0.25 + env.rain * 0.45;
      rain.points.geometry.setDrawRange(0, Math.floor(9000 * clamp01(env.rain + 0.15)));
      snow.points.visible = env.snow > 0.01; snow.u.uOpacity.value = 0.9 * env.snow;
      const fallOK = env.rain < 0.3 && env.snow < 0.1;
      // 花瓣/落叶只在拉近视角时显示，远景下会变成噪点
      const near = clamp01((620 - camera.position.distanceTo(target)) / 260);
      petals.points.visible = env.season === "spring" && fallOK && near > 0; petals.u.uOpacity.value = 0.9 * near;
      leaves.points.visible = env.season === "autumn" && fallOK && near > 0; leaves.u.uOpacity.value = 0.95 * near;
      petals.u.uCenter.value.copy(target); leaves.u.uCenter.value.copy(target);
      fireflies.points.visible = env.season === "summer" && env.night > 0.5 && env.rain < 0.2;
      fireflies.u.uOpacity.value = env.night;
      fireflies.u.uCenter.value.set(hx, 0, hz);

      // 路灯与夜景
      const lampOn = clamp01((env.night - 0.25) * 2 + env.fog * 0.3 + (env.rain > 0.5 ? 0.3 : 0));
      bulbMat.color.setRGB(lerp(0.33, 1.0, lampOn), lerp(0.35, 0.86, lampOn), lerp(0.38, 0.55, lampOn));
      poolMatL.opacity = lampOn * 0.55;
      haloMat.opacity = lampOn * 0.9;
      campus.nightMats.forEach((m) => (m.emissiveIntensity = env.night * 1.25));

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
      updateButterflies(Math.min(dt, 0.05), t);
      updateCat(Math.min(dt, 0.05), t);
    }

    applySeason("summer");
    return {
      sky, skyUniforms, stars, clouds, cat, butterflies, setEnvironment, update,
      get flash() { return flash; },
      stats: { trees: NT, lamps: NL, birds: NB, butterflies: BF_N },
      treeSpots: spots,
      catHome: [hx, hz],
    };
  }

  global.EcoLife = { create };
})(window);
