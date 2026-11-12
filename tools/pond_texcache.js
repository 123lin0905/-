// ==== 程序化纹理缓存（IndexedDB）====（由 tools/build_pond.py 追加；全景 ecohome 与池塘 pond 共用）
// 第一次生成的花岗岩、卵石、草地、木纹、树皮、瓦片、水面法线、焦散等像素数据存进 IndexedDB，下次（包括从主页进入池塘）直接读取，
// 省掉逐像素噪声计算。键 = 本脚本内容哈希：生成算法一改，旧缓存自动作废。读不到 / 浏览器禁用存储时照常现场生成。
const pondTexCache = (() => {
  const VERSION = '__TEXCACHE_VERSION__', DB = 'campus-pond-cache', STORE = 'tex';
  let items = {}, dirty = false, hits = 0, misses = 0;
  const idb = () => new Promise((res, rej) => {
    if (!window.indexedDB) { rej(new Error('no indexedDB')); return; }
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
  const timeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
  return {
    get stats() { return { hits, misses, version: VERSION }; },
    async open() {
      if (new URLSearchParams(location.search).get('texcache') === '0') return;
      try {
        const db = await timeout(idb(), 2000);
        const rec = await timeout(new Promise((res, rej) => { const q = db.transaction(STORE).objectStore(STORE).get(VERSION); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }), 4000);
        db.close();
        if (rec && rec.items) items = rec.items;
      } catch (e) { items = {}; }
    },
    get(key) { const it = items[key]; if (it) hits++; else misses++; return it; },
    put(key, it) { items[key] = it; dirty = true; },
    save() {
      if (!dirty || new URLSearchParams(location.search).get('texcache') === '0') return;
      dirty = false;
      const rec = { v: VERSION, at: Date.now(), items };
      idb().then((db) => {
        const tx = db.transaction(STORE, 'readwrite'), st = tx.objectStore(STORE);
        st.clear(); st.put(rec, VERSION);
        tx.oncomplete = () => db.close(); tx.onerror = () => db.close();
      }).catch(() => {});
    },
  };
})();
function genSurfaceCached(key, size, fn, normalStrength) {
  const it = pondTexCache.get('s:' + key);
  if (it && it.w === size) return { map: dataTex(it.a, size, size, true), normalMap: dataTex(it.b, size, size, false) };
  const r = genSurface(size, fn, normalStrength);
  pondTexCache.put('s:' + key, { w: size, a: r.map.image.data, b: r.normalMap.image.data });
  return r;
}
function pondTexRestore(key) {
  const it = pondTexCache.get('d:' + key);
  if (!it) return false;
  TEX[key] = dataTex(it.a, it.w, it.h, false);
  if (key === 'caustics' && it.meta) TEX.causticMean = it.meta.mean;
  return true;
}
function pondTexRecord(key, tex, meta) {
  pondTexCache.put('d:' + key, { w: tex.image.width, h: tex.image.height, a: tex.image.data, meta: meta || null });
}
