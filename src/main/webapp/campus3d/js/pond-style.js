/*
 * 池塘画风 · 共享光照 / 天气 / 画质模块（校园全景 ecohome 与池塘细节 pond.html 共用）
 * ------------------------------------------------------------------------------
 * 依赖：three r160（lib/three-r160.min.js）+ js/pond-style-core.js（由 tools/build_pond.py 从池塘场景源码中抽出的
 *       噪声、程序化纹理、叶片卡、几何工具、Preetham 天空着色器、色温、天气预设、ACES 色调映射等，两边逐字相同）。
 * 本文件提供：
 *   pondSunLight()      太阳 / 月光光照模型（色温、强度、半球光、云亮度、夜晚曝光补偿）
 *   pondWeatherPreset() WMO 天气类型 + 季节 → 池塘场景天气预设（晴/雨/秋/冬雪 + 多云/阴/雾 …）
 *   PondQuality         “清晰 / 流畅”画质档：两页共用 localStorage 的 campus.gfx；未手动选择时按实测帧率自动降档，
 *                       降档提示里带“恢复清晰”按钮
 * 全部为经典脚本全局定义（与 pond.html 主脚本、campus3d/js/*.js 同一全局作用域）。
 */

// ---------------------------------------------------------------- 光照模型
// d：太阳方向（THREE.Vector3，会被改写为最终光源方向）；elev：太阳高度（弧度，调用方已钳到 ≥0.6°）；night：0..1
function pondSunLight(d, elev, night, sunMul, hemiMul, moonDir) {
  const K = lerp(2600, 5500, smoothstep(1 * DEG, 32 * DEG, elev));
  let [r, g, b] = kelvinToRGB(K);
  let inten = 3.3 * smoothstep(-0.5 * DEG, 14 * DEG, elev) * sunMul;
  if (night > 0) {            // 月光：偏冷、较弱、从高处照下；天空盒按 uNight 换成夜空
    d.lerp(moonDir, smoothstep(0.0, 0.6, night)).normalize();
    elev = lerp(elev, Math.asin(d.y), night);
    r = lerp(r, 0.62, night); g = lerp(g, 0.72, night); b = lerp(b, 1.0, night);
    inten = lerp(inten, 0.55 * (0.35 + 0.65 * sunMul), night);
  }
  return {
    dir: d, elev, color: [r, g, b], intensity: inten,
    hemiIntensity: (0.1 + 0.22 * smoothstep(0, 30 * DEG, elev)) * hemiMul * (1 - 0.72 * night),
    hemiColor: [lerp(0.61, 0.32, night), lerp(0.77, 0.42, night), lerp(0.94, 0.72, night)],
    cloudBrightK: (0.3 + 1.5 * smoothstep(0, 40 * DEG, elev)) * (1 - 0.85 * night),
    expo: 1 + 0.55 * night,   // 夜晚提高曝光
  };
}
// 夜晚把雾色 / 阴天云色压暗成深蓝，避免夜景发灰
function pondNightFog(fogCol, night) {
  const NC = [0.03, 0.04, 0.065];
  return fogCol.map((v, i) => lerp(v, NC[i], night * 0.92));
}

// ---------------------------------------------------------------- 天气预设
// 主页的 WMO 天气类型（EcoWeather.describe(code).kind）+ 季节 → 场景预设（基于 WX_PRESETS 的晴 Sunny / 雨 Rain / 秋 Autumn / 冬雪 Winter）
function pondWeatherPreset(kind, season) {
  const P0 = WX_PRESETS;
  const rainy = ["drizzle", "rain", "heavyrain", "thunder"].indexOf(kind) >= 0;
  let baseName = "Sunny";
  if (kind === "snow") baseName = "Winter";
  else if (rainy) baseName = "Rain";
  else if (season === "autumn") baseName = "Autumn";
  else if (season === "winter") baseName = "Autumn";
  const p = JSON.parse(JSON.stringify(P0[baseName]));
  let label = { Sunny: "晴", Rain: "雨", Autumn: "秋日晴", Winter: "冬雪" }[baseName];
  if (season === "winter" && baseName === "Autumn") { Object.assign(p, { autumn: 0.75, cloud: 0.75, overcast: 0.35, sunMul: 0.55, hemiMul: 1.4, fog: 0.018, fogCol: [0.55, 0.58, 0.62], grade: [0.97, 1.0, 1.04], expo: 1.0 }); label = "冬日"; }
  if (season === "summer" && baseName === "Sunny") { Object.assign(p, { cloud: 0.45, grade: [1.03, 1.0, 0.95] }); }
  if (rainy && season === "autumn") p.autumn = 1;
  if (rainy && season === "winter") p.autumn = 0.75;
  if (kind === "partly") { p.cloud = Math.max(p.cloud, 0.65); label = season === "autumn" ? "秋日少云" : "少云"; }
  if (kind === "cloudy") { Object.assign(p, { cloud: 0.88, overcast: Math.max(p.overcast, 0.35), sunMul: Math.min(p.sunMul, 0.6), hemiMul: Math.max(p.hemiMul, 1.35) }); label = "多云"; }
  if (kind === "overcast") { Object.assign(p, { cloud: 1, overcast: 0.75, sunMul: 0.25, hemiMul: 1.9, cloudBright: 0.75, fog: Math.max(p.fog, 0.014), fogCol: [0.42, 0.45, 0.48], expo: 1.05 }); label = "阴"; }
  if (kind === "fog") { Object.assign(p, { cloud: 0.9, overcast: 0.7, sunMul: 0.3, hemiMul: 1.8, fog: 0.06, fogCol: [0.62, 0.65, 0.67], expo: 1.05 }); label = "雾"; }
  if (kind === "drizzle") { p.rain = 0.45; label = "毛毛雨"; }
  if (kind === "heavyrain") { label = "大雨"; p.wind = 0.75; }
  if (kind === "thunder") { label = "雷阵雨"; p.wind = 0.85; p.cloudBright = 0.4; }
  if (kind === "snow") label = "雪";
  // 秋冬：落叶树在冬季落光叶子（全景用；池塘用 letter 驱动季节物件）
  const letter = kind === "snow" || season === "winter" ? "W" : season === "autumn" ? "A" : rainy ? "R" : "S";
  p.label = label; p.silent = true;
  return { p, letter, label };
}

// ---------------------------------------------------------------- 画质档：清晰 / 流畅
const PondQuality = (function () {
  const KEY = "campus.gfx";
  const ua = navigator.userAgent || "";
  const mobile = /Android|iPhone|iPad|iPod|Mobile|HarmonyOS/i.test(ua) || (navigator.maxTouchPoints > 1 && Math.min(screen.width, screen.height) < 820);
  function stored() { try { const v = localStorage.getItem(KEY); return v === "clear" || v === "smooth" ? v : null; } catch (e) { return null; } }
  function save(v) { try { localStorage.setItem(KEY, v); } catch (e) { /* 无痕模式等 */ } }
  // URL ?gfx=clear|smooth（或旧参数 quality=high|low）优先，其次手动选择，最后按设备（手机默认流畅，电脑默认清晰，之后按实测帧率自动降档）
  function initial() {
    const q = new URLSearchParams(location.search);
    const u = (q.get("gfx") || "").toLowerCase(), old = (q.get("quality") || "").toLowerCase();
    if (u === "clear" || old === "high") return { mode: "clear", explicit: true };
    if (u === "smooth" || old === "low") return { mode: "smooth", explicit: true };
    const s = stored();
    if (s) return { mode: s, explicit: true };
    return { mode: mobile ? "smooth" : "clear", explicit: false };
  }
  const st = initial();
  const listeners = [];
  function set(mode, explicit) {
    st.mode = mode; if (explicit) { st.explicit = true; save(mode); }
    listeners.forEach((f) => f(mode, !!explicit));
    document.querySelectorAll(".pq-toggle").forEach(paint);
  }
  function paint(btn) {
    btn.querySelectorAll("[data-gfx]").forEach((b) => b.classList.toggle("is-on", b.getAttribute("data-gfx") === st.mode));
    btn.title = "画质：" + (st.mode === "clear" ? "清晰（全分辨率 + 后期）" : "流畅（低分辨率阴影、关闭后期）") + " · 两个场景共用此设置";
  }
  function injectCss() {
    if (document.getElementById("pq-css")) return;
    const s = document.createElement("style"); s.id = "pq-css";
    s.textContent = [
      ".pq-toggle{display:inline-flex;align-items:center;gap:2px;padding:3px;border-radius:999px;background:rgba(12,20,18,.45);border:1px solid rgba(255,255,255,.16);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);font:12px/1 system-ui,-apple-system,'PingFang SC','Microsoft YaHei',sans-serif;color:#e6ede8}",
      ".pq-toggle span{padding:0 6px;opacity:.75}",
      ".pq-toggle button{all:unset;cursor:pointer;padding:6px 10px;border-radius:999px;color:#cfe0d8}",
      ".pq-toggle button.is-on{background:rgba(228,122,61,.9);color:#fff}",
      ".pq-toast{position:fixed;left:50%;bottom:86px;transform:translateX(-50%);z-index:60;display:flex;gap:12px;align-items:center;padding:10px 12px 10px 16px;border-radius:12px;background:rgba(14,22,20,.82);border:1px solid rgba(255,255,255,.14);color:#e6ede8;font:13px/1.4 system-ui,-apple-system,'PingFang SC','Microsoft YaHei',sans-serif;box-shadow:0 8px 30px rgba(0,0,0,.35)}",
      ".pq-toast button{all:unset;cursor:pointer;padding:6px 12px;border-radius:8px;background:#e47a3d;color:#fff;font-weight:600}",
      ".pq-toast .pq-x{background:transparent;color:#9fb3aa;padding:6px 4px;font-weight:400}",
    ].join("\n");
    document.head.appendChild(s);
  }
  // 画质切换按钮（两页同一个样式）
  function button() {
    injectCss();
    const w = document.createElement("div");
    w.className = "pq-toggle";
    w.innerHTML = '<span>画质</span><button type="button" data-gfx="clear">清晰</button><button type="button" data-gfx="smooth">流畅</button>';
    w.querySelectorAll("[data-gfx]").forEach((b) => (b.onclick = () => set(b.getAttribute("data-gfx"), true)));
    paint(w);
    return w;
  }
  // 自动降档提示，带“恢复清晰”
  function degradeToast(msg, onRestore) {
    injectCss();
    let t = document.getElementById("pq-toast");
    if (t) t.remove();
    t = document.createElement("div"); t.id = "pq-toast"; t.className = "pq-toast";
    t.innerHTML = '<span></span><button type="button" class="pq-restore">恢复清晰</button><button type="button" class="pq-x" aria-label="关闭">×</button>';
    t.querySelector("span").textContent = msg;
    t.querySelector(".pq-restore").onclick = () => { t.remove(); set("clear", true); if (onRestore) onRestore(); };
    t.querySelector(".pq-x").onclick = () => t.remove();
    document.body.appendChild(t);
    clearTimeout(degradeToast._h); degradeToast._h = setTimeout(() => t.remove(), 12000);
  }
  return {
    get mode() { return st.mode; }, get explicit() { return st.explicit; }, mobile,
    set, onChange: (f) => listeners.push(f), button, degradeToast,
  };
})();
