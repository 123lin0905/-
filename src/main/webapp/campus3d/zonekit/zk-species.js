/*
 * 板块细节场景工具包 · 动植物目录与编辑器适配（ZKSpecies）——接通用编辑器 js/species-editor.js（只读复用）
 * ------------------------------------------------------------------------------
 * 物种目录（两个板块共用，按 zones.json 的 catalog 过滤）：
 *   植物：银杏、香樟、樱花、桂花、蓝花楹、女贞、灌木球、绿篱、草花花丛
 *   动物：校园小猫、喜鹊、麻雀、蝴蝶
 * 植物用 ZKFlora 的代理对象（实例化渲染），动物用 ZKLife 的写实小模型；栽种 / 移植 / 拔除动画由编辑器完成，
 * 动物入场 / 离场 / 移植为走进来 / 飞进来、走开 / 飞走、走过去 / 飞过去。
 * 放置规则：植物只能种在草坪 / 种植土上（不能在道路、广场、球场、建筑上），乔木离建筑至少半个冠幅；动物不能放在车行道和建筑里。
 */
(function (global) {
  "use strict";
  const THREE = global.THREE;
  const V3 = THREE.Vector3;
  const rnd = (a, b) => a + (b - a) * Math.random();
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function hashStr(s) { let h = 2166136261; s = String(s); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

  function catalog(ctx) {
    const { flora, life, world } = ctx;
    const PLANT_RULE = "只能种在草坪 / 树池种植土上（不能在道路、广场、球场和建筑上）";
    const plant = (key, name, icon, radius, hitY, desc, extra) => Object.assign({
      key, name, type: "plant", icon, anim: radius > 1.2 ? "tree" : "shrub", radius, hitY, hitRadius: Math.max(radius * 0.8, 0.8), desc, rule: PLANT_RULE,
      previewH: radius > 1.2 ? 5 : 1.2, make: () => flora.make(key),
    }, extra || {});
    // 动物：走进来 / 飞进来
    function walkPath(ind, x0, z0, x1, z1, dur, api, o) {
      const ob = ind.obj, P = ob.userData.pose, S = ind.scale || 1; o = o || {};
      life.face(ob, x1 - x0, z1 - z0); ob.position.set(x0, world.groundY(x0, z0), z0);
      return api.helpers.play({ dur, update: (t) => {
        const k = api.helpers.ease(t), x = x0 + (x1 - x0) * k, z = z0 + (z1 - z0) * k;
        ob.position.set(x, world.groundY(x, z), z);
        if (P.legs) P.legs.forEach((l, i) => (l.rotation.x = Math.sin(t * dur * 12 + (i === 0 || i === 3 ? 0 : Math.PI)) * 0.6));
        const sc = o.fadeIn ? Math.min(1, t * 5) : o.fadeOut ? 1 - api.helpers.ease(clamp((t - 0.7) / 0.3, 0, 1)) : 1;
        ob.scale.setScalar(Math.max(0.0001, S * sc));
      }, end: () => { ob.position.set(x1, world.groundY(x1, z1), z1); ob.scale.setScalar(o.fadeOut ? 0.0001 : S); if (P.legs) P.legs.forEach((l) => (l.rotation.x = 0)); ind.ai = null; o.done && o.done(); } });
    }
    function flyPath(ind, p0, p1, dur, api, o) {
      const ob = ind.obj, P = ob.userData.pose, S = ind.scale || 1; o = o || {};
      const mid = p0.clone().lerp(p1, 0.5); mid.y = Math.max(p0.y, p1.y) + (o.arc || 2);
      const cur = new THREE.QuadraticBezierCurve3(p0, mid, p1);
      ob.position.copy(p0);
      return api.helpers.play({ dur, update: (t) => {
        const k = api.helpers.ease(t), p = cur.getPoint(k), tg = cur.getTangent(Math.min(0.999, k + 0.001));
        ob.position.copy(p); life.face(ob, tg.x, tg.z);
        const fl = Math.sin(t * dur * (o.flap || 18)) * 1.0;
        if (P.wl) { P.wl.rotation.z = fl; P.wr.rotation.z = -fl; }
        const sc = o.fadeIn ? Math.min(1, t * 4) : o.fadeOut ? 1 - api.helpers.ease(clamp((t - 0.6) / 0.4, 0, 1)) : 1;
        ob.scale.setScalar(Math.max(0.0001, S * sc));
      }, end: () => { ob.position.copy(p1); ob.scale.setScalar(o.fadeOut ? 0.0001 : S); if (P.wl) { P.wl.rotation.z = 0; P.wr.rotation.z = 0; } ind.ai = null; o.done && o.done(); } });
    }
    const walker = (dur) => ({
      enter(ind, done, api) { const a = Math.random() * 6.28; let x0 = ind.x + Math.cos(a) * 5, z0 = ind.z + Math.sin(a) * 5; if (!ctx.groundOk(x0, z0, ind.key)) { x0 = ind.x - Math.cos(a) * 5; z0 = ind.z - Math.sin(a) * 5; } return walkPath(ind, x0, z0, ind.x, ind.z, dur, api, { fadeIn: true, done }); },
      exit(ind, done, api) { const o = ind.obj.position, a = Math.random() * 6.28; return walkPath(ind, o.x, o.z, o.x + Math.cos(a) * 5, o.z + Math.sin(a) * 5, dur, api, { fadeOut: true, done }); },
      transplant(ind, x1, z1, done, api) { const o = ind.obj.position, d = Math.hypot(x1 - o.x, z1 - o.z); return walkPath(ind, o.x, o.z, x1, z1, clamp(d / 1.4, 0.8, 8), api, { done }); },
    });
    const flyer = (o) => ({
      enter(ind, done, api) { const y = world.groundY(ind.x, ind.z) + (o.hover || 0); const p1 = new V3(ind.x, y, ind.z), p0 = p1.clone().add(new V3(rnd(-8, 8), 7, rnd(-8, 8))); return flyPath(ind, p0, p1, o.dur, api, Object.assign({}, o, { fadeIn: true, done })); },
      exit(ind, done, api) { const p0 = ind.obj.position.clone(), p1 = p0.clone().add(new V3(rnd(-8, 8), 7, rnd(-8, 8))); return flyPath(ind, p0, p1, o.dur, api, Object.assign({}, o, { fadeOut: true, done })); },
      transplant(ind, x1, z1, done, api) { const p0 = ind.obj.position.clone(), p1 = new V3(x1, world.groundY(x1, z1) + (o.hover || 0), z1); return flyPath(ind, p0, p1, clamp(p0.distanceTo(p1) / 4, 1.2, 4), api, Object.assign({}, o, { done })); },
    });
    const animal = (key, name, icon, radius, hitY, desc, rule, beh, idle, make) => Object.assign({
      key, name, type: "animal", icon, radius, hitRadius: Math.max(radius, 0.6), hitY, previewH: 0.6, desc, rule, idle, make,
      center: (ind, v) => (ind.obj ? v.set(ind.obj.position.x, ind.obj.position.y + hitY, ind.obj.position.z) : v.set(ind.x, hitY, ind.z)),
    }, beh);
    return [
      plant("ginkgo", "银杏", "🌳", 2.4, 5, "落叶乔木，扇形叶；光华广场两侧的行道树，秋季满树金黄，冬季落叶", { plantDur: 3.2, moveDur: 3.2, scaleRange: [0.9, 1.08] }),
      plant("camphor", "香樟", "🌲", 3.2, 5, "四季常绿的校园行道树，树冠浓密圆整，沿环校路和教学区道路种植", { plantDur: 3.2, moveDur: 3.2, scaleRange: [0.9, 1.05] }),
      plant("cherry", "樱花", "🌸", 2.4, 3, "落叶小乔木，春季粉白花朵铺满树冠，雕塑两侧与楼前点缀", { plantDur: 3.0, moveDur: 3.0, scaleRange: [0.9, 1.1] }),
      plant("osmanthus", "桂花", "🌼", 1.8, 2.6, "常绿小乔木，秋季开金黄小花，满园飘香", { plantDur: 2.8, scaleRange: [0.9, 1.1] }),
      plant("jacaranda", "蓝花楹", "💜", 3.0, 4, "落叶乔木，初夏满树蓝紫色花，第二教学楼南端的一片紫色花树", { plantDur: 3.2, moveDur: 3.2, scaleRange: [0.9, 1.08] }),
      plant("privet", "女贞", "🌿", 2.0, 3, "常绿小乔木，叶色深绿，宿舍楼间绿地常见，初夏开白色小花", { plantDur: 3.0, scaleRange: [0.9, 1.1] }),
      plant("shrub_ball", "灌木球", "🟢", 0.8, 0.6, "修剪成球形的小叶女贞 / 海桐，点缀在花池与步道边", { anim: "shrub", plantDur: 2.2 }),
      plant("hedge", "绿篱", "🟩", 1.4, 0.6, "修剪整齐的绿篱段（3 米），沿广场与道路成排种植", { anim: "shrub", plantDur: 2.4, hitRadius: 1.6 }),
      plant("flowerbed", "草花花丛", "💐", 1.0, 0.3, "花境里的时令草花：矮牵牛、万寿菊、鼠尾草，四季轮换", { anim: "shrub", plantDur: 2.2 }),
      animal("cat", "校园小猫", "🐱", 0.4, 0.25, "橘猫、狸花猫、奶牛猫……在草坪和楼前闲逛，看到蝴蝶会压低身子扑过去", "放在草坪或步行区（不能在车行道上）", walker(3.2), life.catIdle, (ind) => life.makeCat(hashStr((ind && ind.ref) || Math.random()) % 4)),
      animal("magpie", "喜鹊", "🐦", 0.35, 0.25, "黑白相间、长尾巴的喜鹊，在草地上一跳一跳地找虫子", "放在草坪或步行区", flyer({ dur: 2.4, flap: 16 }), life.birdIdle, () => life.makeBird("magpie")),
      animal("sparrow", "麻雀", "🐤", 0.25, 0.12, "成群的树麻雀，啄草籽、蹦蹦跳跳", "放在草坪或步行区", flyer({ dur: 2.0, flap: 28 }), life.birdIdle, () => life.makeBird("sparrow")),
      animal("butterfly", "蝴蝶", "🦋", 0.3, 0.7, "菜粉蝶、黄钩蛱蝶、柑橘凤蝶，绕着花丛忽高忽低地飞", "在花丛 / 草坪上空飞舞", flyer({ dur: 2.6, flap: 24, hover: 0.6, arc: 2 }), life.butterflyIdle, (ind) => life.makeButterfly(hashStr((ind && ind.ref) || Math.random()) % 5)),
    ];
  }

  global.ZKSpecies = { catalog, hashStr };
})(window);
