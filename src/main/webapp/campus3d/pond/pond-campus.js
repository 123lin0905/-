/*
 * 校园池塘板块细节场景 · 校园化外壳（与 pond.html 配合）
 * ------------------------------------------------------------------
 * 1. 板块参数：?zone=cuihu_water（翠湖水景，默认）/ library_lotus（图书馆·荷花池），决定布局差异；
 * 2. 设备分级：像素比 ≤ 2、水面模拟分辨率与画质按设备降级（?quality=low|high 可强制）；
 * 3. 天气 / 季节 / 昼夜：与生态主页同一套逻辑（EcoWeather：/api/weather → Open-Meteo 直连 → 虚拟天气；
 *    北京时间、按月份分季节、按太阳高度判断昼夜），映射到场景天气预设（晴/雨/秋/冬雪 + 多云/阴/雾 + 夜晚）；
 * 4. 界面：返回校园全景、左上板块名与简介、右侧“池塘生态”清单（点击飞到物种）、演示面板（按 W）。
 * 场景本体来自 MIT 开源项目 Koi Pond Garden（https://github.com/souranyp-stack/koi-pond-garden），见 pond.html 文件头。
 * 本文件在 pond.html 主脚本之前加载：这里只定义参数与函数，界面在主脚本建完场景后由 PondCampus.init() 创建。
 */
(function () {
  "use strict";
  const Q = new URLSearchParams(location.search);

  // ---------------- 板块差异 ----------------
  const VARIANTS = {
    cuihu_water: {
      zoneName: "翠湖水景", fishCount: 20, bridge: true, lotusExtra: 0,
      lampSpots: [[-4.3, -3.3], [3.65, -6.9], [4.9, 3.9], [-4.8, 4.6]],
    },
    library_lotus: {
      zoneName: "图书馆·荷花池", fishCount: 8, bridge: false, lotusExtra: 26,
      lampSpots: [[3.65, -6.9], [-4.3, -3.3], [-4.8, 4.6], [4.4, -3.9]],
    },
  };
  const zoneId = VARIANTS[Q.get("zone")] ? Q.get("zone") : "cuihu_water";
  const V = VARIANTS[zoneId];

  // ---------------- 设备分级 ----------------
  const ua = navigator.userAgent || "";
  const mobile = /Android|iPhone|iPad|iPod|Mobile|HarmonyOS/i.test(ua) || (navigator.maxTouchPoints > 1 && Math.min(screen.width, screen.height) < 820);
  const weak = (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4) || (navigator.deviceMemory && navigator.deviceMemory <= 4);
  const test = Q.get("test") === "1";
  const qp = (Q.get("quality") || "").toLowerCase();
  const lowPower = qp === "low" || test || (qp !== "high" && (mobile || weak));
  window.CAMPUS_POND = Object.assign({}, V, {
    zone: zoneId, test, lowPower,
    quality: qp === "high" ? "High" : lowPower ? "Low" : "High",
    maxDpr: lowPower ? 1.25 : 1.6,        // 始终 ≤ 2
    simN: lowPower ? 128 : 256,            // 水面涟漪模拟网格
  });

  // ---------------- 工具 ----------------
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const SEASON_NAME = { spring: "春季", summer: "夏季", autumn: "秋季", winter: "冬季" };
  const WEATHER_API = Q.get("api") || "../../api/weather";   // pond.html 位于 <ctx>/campus3d/pond/，WeatherServlet 在 <ctx>/api/weather

  // 返回地址：主页传入 back（同源路径），否则回到 <ctx>/ecohome.jsp
  function backUrl() {
    let b = Q.get("back") || "";
    if (!/^\/[^/\\]/.test(b) && b !== "/") b = "../../ecohome.jsp";
    const sep = b.indexOf("?") >= 0 ? "&" : "?";
    let u = b + sep + "zone=" + encodeURIComponent(zoneId) + "&autostart=1";
    // 演示状态带回主页，保证两边一致
    if (state.demoWeather !== "auto") u += "&weather=" + encodeURIComponent(state.demoWeather);
    if (state.demoSeason !== "auto") u += "&season=" + encodeURIComponent(state.demoSeason);
    if (!state.timeAuto) u += "&hour=" + state.demoHours.toFixed(2);
    return u;
  }

  // ---------------- 状态（与主页 ecohome.js 相同字段） ----------------
  const state = {
    season: "autumn", weather: null, demoWeather: "auto", demoSeason: "auto",
    timeAuto: true, demoHours: 12, speed: 1, simOffsetMs: 0, presetOverride: null,
    lastKey: "", night: 0, elev: 30, flip: 0,
  };
  if (Q.get("weather")) state.demoWeather = Q.get("weather");
  if (Q.get("season")) state.demoSeason = Q.get("season");
  if (Q.get("hour")) { state.timeAuto = false; state.demoHours = parseFloat(Q.get("hour")) || 12; }

  const WX_ = () => window.EcoWeather;
  function nowMs() { return Date.now() + state.simOffsetMs; }
  function currentBJ() {
    const p = WX_().beijingParts(nowMs());
    if (!state.timeAuto) { p.hours = state.demoHours; p.h = Math.floor(state.demoHours); p.mi = Math.floor((state.demoHours % 1) * 60); p.s = 0; }
    return p;
  }
  function weatherNow() {
    const W = WX_();
    if (state.demoWeather !== "auto") {
      const code = Number(state.demoWeather), base = state.weather || W.virtualWeather(nowMs());
      const temp = code >= 71 && code <= 86 ? Math.min(base.temp, -1) : base.temp;
      return Object.assign({}, base, { code, temp, source: "demo", sourceText: "演示模式（手动切换）" });
    }
    return state.weather || W.virtualWeather(nowMs());
  }

  // ---------------- 天气 → 场景预设 ----------------
  // 主页的 WMO 天气类型 + 季节 → koi 场景已有预设（晴 Sunny / 雨 Rain / 秋 Autumn / 冬雪 Winter）再叠加云量、雾
  function campusPreset(kind, season) {
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
    const letter = kind === "snow" || season === "winter" ? "W" : season === "autumn" ? "A" : rainy ? "R" : "S";
    p.label = label; p.silent = true;
    return { p, letter, label };
  }
  // 手动预设（演示面板 / dat.gui / T 键）：晴 Sunny / 雨 Rain / 秋 Autumn / 冬雪 Winter
  const PRESET_TO_DEMO = { Sunny: { w: "0", s: "summer" }, Rain: { w: "61", s: "auto" }, Autumn: { w: "0", s: "autumn" }, Winter: { w: "71", s: "winter" } };

  function applyEnv(immediate) {
    const W = WX_(); if (!W || typeof WX_PRESETS === 'undefined') return;
    const bj = currentBJ();
    const season = state.demoSeason !== "auto" ? state.demoSeason : W.seasonOfMonth(bj.mo);
    const w = weatherNow(), d = W.describe(w.code);
    const sp = W.sunPosition(bj.doy, bj.hours);
    const night = ss(2, -8, sp.elevation);           // 太阳高度 < -2° 进入夜晚（与主页相同阈值），-8° 完全入夜
    state.season = season; state.night = night; state.elev = sp.elevation; state.kind = d.kind; state.w = w; state.d = d; state.bj = bj;
    const prev = window.CAMPUS_SUN;
    window.CAMPUS_SUN = { elev: sp.elevation, az: sp.azimuth, night };
    const sunMoved = !prev || Math.abs(prev.elev - sp.elevation) > 0.03 || Math.abs(prev.night - night) > 0.003;
    const key = d.kind + "|" + season + "|" + (night > 0.5 ? "n" : "d");
    if (key !== state.lastKey || immediate) {
      state.lastKey = key;
      const { p, letter } = campusPreset(d.kind, season);
      const name = "Live" + (state.flip ^= 1);
      WX_PRESETS[name] = p; WX_LETTER[name] = letter;
      if (immediate || !WX.cur) {
        WX.cur = JSON.parse(JSON.stringify(p)); WX.name = name; WX.t = 1; WX.from = null; P.weather = name;
        window.applySeason(name); window.applyWeather();
        if (window.setBtnLabel) window.setBtnLabel("tb-weather", p.label);
      } else window.setWeather(name);
      if (typeof DRAGON !== "undefined") { DRAGON.off = !(letter === "S" || letter === "A") || night > 0.5; DRAGON.list.forEach((D) => (D.root.visible = !DRAGON.off)); }
    } else if (sunMoved) window.updateSun();
    renderWeatherCard();
  }

  // ---------------- 界面 ----------------
  let ZONE = null, SPECIES = null;
  function buildUI() {
    document.body.classList.add("campus-pond");
    const back = el("button", "cp-back cp-glass", "← 返回校园全景");
    back.type = "button"; back.id = "cp-back"; back.title = "回到生态主页，镜头停在本板块";
    back.onclick = goBack;
    document.body.appendChild(back);

    const card = el("section", "cp-zone cp-glass");
    card.id = "cp-zone";
    card.innerHTML =
      '<p class="cp-kicker">生态板块 · 细节场景</p>' +
      '<h1 id="cp-zone-name">' + esc(V.zoneName) + "</h1>" +
      '<p class="cp-intro" id="cp-zone-intro">正在读取板块资料…</p>' +
      '<div class="cp-wx" id="cp-wx" title="点击打开演示面板（W）"><span class="cp-wx-icon" id="cp-wx-icon">⏳</span><span class="cp-wx-temp" id="cp-wx-temp">--°C</span><span class="cp-wx-text" id="cp-wx-text">正在获取天气…</span></div>' +
      '<p class="cp-time" id="cp-time">北京时间 --:--</p>' +
      '<p class="cp-src" id="cp-src"></p>';
    document.body.appendChild(card);
    $("cp-wx").onclick = () => toggleDemo();

    const panel = el("aside", "cp-eco cp-glass");
    panel.id = "cp-eco";
    panel.innerHTML =
      '<header><b>池塘生态</b><button class="cp-x" id="cp-eco-fold" type="button" title="收起 / 展开">–</button></header>' +
      '<p class="cp-eco-sub" id="cp-eco-sub">本池动植物清单 · 点击飞到对应物种</p>' +
      '<div class="cp-eco-body" id="cp-eco-body"><p class="cp-muted">加载中…</p></div>' +
      '<p class="cp-eco-note" id="cp-eco-note"></p>';
    document.body.appendChild(panel);
    $("cp-eco-fold").onclick = () => { panel.classList.toggle("is-folded"); $("cp-eco-fold").textContent = panel.classList.contains("is-folded") ? "+" : "–"; };

    const demo = el("section", "cp-demo cp-glass");
    demo.id = "cp-demo"; demo.hidden = true;
    demo.innerHTML = [
      '<header><b>演示切换面板</b><button class="cp-x" id="cp-demo-close" type="button" aria-label="关闭">×</button></header>',
      '<label>天气<select id="cpd-weather"><option value="auto">自动（实时/虚拟）</option><option value="0">晴</option><option value="1">少云</option><option value="2">多云</option><option value="3">阴</option><option value="61">小雨</option><option value="65">大雨</option><option value="95">雷阵雨</option><option value="71">雪</option><option value="45">雾</option></select></label>',
      '<label>季节<select id="cpd-season"><option value="auto">自动（按北京时间月份）</option><option value="spring">春</option><option value="summer">夏</option><option value="autumn">秋</option><option value="winter">冬</option></select></label>',
      '<label>时间<span class="cp-row"><input type="checkbox" id="cpd-time-auto" checked> 跟随北京时间</span></label>',
      '<div class="cp-row"><input type="range" id="cpd-time" min="0" max="24" step="0.05" value="12" disabled><output id="cpd-time-out">12:00</output></div>',
      '<label>时间流速<select id="cpd-speed"><option value="1">×1</option><option value="60">×60（1 秒 = 1 分钟）</option><option value="600">×600（1 秒 = 10 分钟）</option></select></label>',
      '<div class="cp-quick"><span>场景预设：</span><button type="button" data-p="Sunny">晴</button><button type="button" data-p="Rain">雨</button><button type="button" data-p="Autumn">秋</button><button type="button" data-p="Winter">冬雪</button><button type="button" data-h="21.5">夜晚</button></div>',
      '<div class="cp-row"><button class="cp-btn" id="cpd-reset" type="button">恢复自动</button></div>',
      '<p class="cp-stats" id="cpd-stats"></p>',
      '<p class="cp-tip">快捷键：W 打开/关闭本面板 · T 轮换天气 · H 高级渲染参数 · I 操作说明</p>',
    ].join("");
    document.body.appendChild(demo);
    $("cp-demo-close").onclick = () => toggleDemo(false);
    $("cpd-weather").onchange = (e) => { state.demoWeather = e.target.value; applyEnv(); };
    $("cpd-season").onchange = (e) => { state.demoSeason = e.target.value; applyEnv(); };
    $("cpd-time-auto").onchange = (e) => {
      state.timeAuto = e.target.checked; $("cpd-time").disabled = state.timeAuto;
      if (!state.timeAuto) { state.demoHours = WX_().beijingParts(nowMs()).hours; $("cpd-time").value = state.demoHours; }
      applyEnv();
    };
    $("cpd-time").oninput = (e) => { state.demoHours = parseFloat(e.target.value); applyEnv(); };
    $("cpd-speed").onchange = (e) => { state.speed = parseFloat(e.target.value); };
    $("cpd-reset").onclick = () => {
      Object.assign(state, { demoWeather: "auto", demoSeason: "auto", timeAuto: true, speed: 1, simOffsetMs: 0 });
      syncDemoForm(); applyEnv();
    };
    demo.querySelectorAll("[data-p]").forEach((b) => (b.onclick = () => setPreset(b.getAttribute("data-p"))));
    demo.querySelectorAll("[data-h]").forEach((b) => (b.onclick = () => { state.timeAuto = false; state.demoHours = parseFloat(b.getAttribute("data-h")); syncDemoForm(); applyEnv(); }));
    syncDemoForm();
    if (Q.get("demo") === "1") toggleDemo(true);

    // 高级参数（dat.gui）放到左侧，避免与右侧生态面板重叠
    const dg = document.querySelector(".dg.ac"); if (dg) dg.classList.add("cp-dg");
    const loader = $("loader"); if (loader) loader.classList.add("cp-loader");
  }
  function syncDemoForm() {
    if (!$("cpd-weather")) return;
    $("cpd-weather").value = state.demoWeather; $("cpd-season").value = state.demoSeason;
    $("cpd-time-auto").checked = state.timeAuto; $("cpd-time").disabled = state.timeAuto; $("cpd-time").value = state.demoHours;
    $("cpd-speed").value = String(state.speed);
  }
  function toggleDemo(force) {
    const d = $("cp-demo"); if (!d) return;
    d.hidden = force != null ? !force : !d.hidden;
  }
  function setPreset(name) {
    const m = PRESET_TO_DEMO[name]; if (!m) return;
    state.demoWeather = m.w; state.demoSeason = m.s;
    if (name === "Sunny" && state.night > 0.5 && !state.timeAuto) state.demoHours = 11;
    syncDemoForm(); applyEnv();
    toast("演示：" + { Sunny: "晴（夏）", Rain: "雨", Autumn: "秋", Winter: "冬雪" }[name]);
  }
  const CYCLE = ["Sunny", "Rain", "Autumn", "Winter"];
  let cycleIdx = -1;
  function cycleWeather() { cycleIdx = (cycleIdx + 1) % CYCLE.length; setPreset(CYCLE[cycleIdx]); }
  function toast(m) { if (window.toast) window.toast(m); }

  function renderWeatherCard() {
    if (!$("cp-wx") || !state.w) return;
    const w = state.w, d = state.d, bj = state.bj, night = state.night > 0.5;
    $("cp-wx-icon").textContent = night && d.kind === "clear" ? "🌙" : night && d.kind === "partly" ? "☁️" : d.icon;
    $("cp-wx-temp").textContent = Math.round(w.temp * 10) / 10 + "°C";
    const lab = typeof WX !== "undefined" && WX_PRESETS[WX.name] ? WX_PRESETS[WX.name].label || "" : "";
    $("cp-wx-text").textContent = d.text + " · " + SEASON_NAME[state.season] + (night ? " · 夜晚" : "") + (lab ? "（场景：" + lab + "）" : "");
    const pad = (n) => String(n).padStart(2, "0");
    $("cp-time").textContent = "北京时间 " + bj.mo + "月" + bj.day + "日 " + pad(bj.h) + ":" + pad(bj.mi) + (state.timeAuto && state.speed === 1 ? "" : "（演示）") + " · 太阳高度 " + Math.round(state.elev) + "°";
    $("cp-src").textContent = "天气来源：" + w.sourceText;
    $("cp-src").className = "cp-src " + (w.source === "virtual" ? "is-virtual" : w.source === "demo" ? "is-demo" : "is-live");
  }

  function fillZone() {
    if (ZONE) {
      $("cp-zone-name").textContent = (ZONE.icon ? ZONE.icon + " " : "") + ZONE.name;
      $("cp-zone-intro").textContent = ZONE.intro || "";
      window.CAMPUS_POND.zoneName = ZONE.name;
      document.title = ZONE.name + " · 板块细节 - 智慧校园虚拟生态";
    } else $("cp-zone-intro").textContent = "";
  }
  function fillSpecies() {
    const body = $("cp-eco-body");
    if (!SPECIES) { body.innerHTML = '<p class="cp-muted">物种清单加载失败</p>'; return; }
    const list = (SPECIES.zones && SPECIES.zones[zoneId]) || [];
    const groups = [["animal", "动物"], ["plant", "植物"], ["scene", "景观设施"]];
    body.innerHTML = groups.map(([k, title]) => {
      const items = list.filter((s) => s.type === k);
      if (!items.length) return "";
      return '<h3>' + title + ' <small>' + items.length + ' 种</small></h3><ul>' + items.map((s) =>
        '<li><button type="button" class="cp-sp" data-view="' + esc(s.view || "") + '" data-id="' + esc(s.id) + '">' +
        '<span class="cp-sp-icon">' + esc(s.icon || "•") + '</span><span class="cp-sp-main"><b>' + esc(s.name) + (s.illustrative ? '<em>示意</em>' : "") +
        "</b><span>" + esc(s.desc) + "</span></span></button></li>").join("") + "</ul>";
    }).join("");
    body.querySelectorAll(".cp-sp").forEach((b) => (b.onclick = () => flyToSpecies(b.getAttribute("data-view"), b)));
    $("cp-eco-note").innerHTML = esc(SPECIES.note || "");
  }
  function flyToSpecies(view, btn) {
    document.querySelectorAll(".cp-sp.is-active").forEach((x) => x.classList.remove("is-active"));
    if (btn) btn.classList.add("is-active");
    const L = WX_LETTER[WX.applied] || "S";
    if (view === "锦鲤") { P.cameraMode = "Follow koi"; FOLLOW.idx++; window.onCameraMode(); return; }
    if (view === "乌龟") {
      if (TURTLE.off) { toast("冬季乌龟潜入池底冬眠，暂时看不到"); return; }
      window.goToView("乌龟"); return;
    }
    if (view === "蜻蜓" && DRAGON && DRAGON.off) { toast(state.night > 0.5 ? "夜晚蜻蜓停栖休息，白天再来看看" : "当前季节/天气蜻蜓不出来活动"); return; }
    if ((view === "荷花" || view === "睡莲") && L === "W") toast("冬季荷叶枯萎，镜头仍带你看看它的位置");
    if (view === "荷花" && WORLD.lotusSpots && WORLD.lotusSpots.length && Math.random() < 0.5) {
      const s = WORLD.lotusSpots[(Math.random() * WORLD.lotusSpots.length) | 0];
      VIEWS["荷花·池中"] = () => [new window.THREE.Vector3(s[0] + 0.9, 0.75, s[1] + 0.9), new window.THREE.Vector3(s[0], 0.4, s[1])];
      window.goToView("荷花·池中"); return;
    }
    if (!VIEWS[view]) { toast("该物种暂无对应镜头"); return; }
    window.goToView(view);
  }

  function goBack() {
    document.body.classList.add("cp-leaving");
    const u = backUrl();
    setTimeout(() => (location.href = u), 650);
  }

  // ---------------- 生命周期（由 pond.html 主脚本调用） ----------------
  let started = false, envT = 0, statT = 0, frames = 0;
  function init() {
    if (started) return; started = true;
    buildUI();
    applyEnv(true);   // 先用虚拟天气/演示参数立即定好昼夜与季节，再异步刷新实时天气
    fetch("../data/zones.json").then((r) => r.json()).then((j) => { ZONE = (j.zones || []).find((z) => z.id === zoneId) || null; fillZone(); }).catch(() => fillZone());
    fetch("../data/pond_species.json").then((r) => r.json()).then((j) => { SPECIES = j; fillSpecies(); }).catch(() => fillSpecies());
    const refresh = () => WX_().load({ proxyUrl: WEATHER_API }).then((w) => { state.weather = w.source === "virtual" ? null : w; applyEnv(); });
    refresh(); setInterval(refresh, 10 * 60 * 1000);
    // 固定镜头（截图 / 演示用）：?shot=荷花
    if (Q.get("shot")) setTimeout(() => { window.goToView(Q.get("shot")); }, 50);
  }
  function update(dt) {
    if (!started) return;
    // 演示时间流速
    if (state.speed > 1) {
      if (!state.timeAuto) { state.demoHours = (state.demoHours + (dt * state.speed) / 3600) % 24; const r = $("cpd-time"); if (r) r.value = state.demoHours; }
      else state.simOffsetMs += dt * 1000 * (state.speed - 1);
    }
    envT -= dt; if (envT <= 0) { envT = state.speed > 1 ? 0.2 : 1; applyEnv(); }
    const out = $("cpd-time-out");
    if (out) { const h = currentBJ().hours, hh = Math.floor(h), mm = Math.floor((h - hh) * 60); out.textContent = String(hh).padStart(2, "0") + ":" + String(mm).padStart(2, "0"); }
    frames++; statT += dt; window.__pondFrames = (window.__pondFrames || 0) + 1;
    if (statT > 1 && !$("cp-demo").hidden) {
      $("cpd-stats").textContent = "帧率 " + (frames / statT).toFixed(0) + " fps · 画质 " + (P.quality === "High" ? "高" : "低") + " · 像素比 " + renderer.getPixelRatio().toFixed(2) + " · 水面网格 " + window.CAMPUS_POND.simN + "² · 锦鲤 " + P.fishCount + " 条";
      frames = 0; statT = 0;
    } else if (statT > 1) { frames = 0; statT = 0; }
    if (frames > 2) window.__pondReady = true;
  }
  // 立即切换环境（演示 / 自动化测试用）：{ weather: WMO 码或 'auto', season, hour }
  function setEnv(o) {
    o = o || {};
    if (o.weather != null) state.demoWeather = String(o.weather);
    if (o.season) state.demoSeason = o.season;
    if (o.hour != null) { state.timeAuto = false; state.demoHours = +o.hour; }
    syncDemoForm(); state.lastKey = ""; applyEnv(true);
  }
  function ready() { document.body.classList.add("cp-ready"); window.__pondReady = true; }

  window.PondCampus = { setEnv, init, update, ready, toggleDemo, cycleWeather, setPreset, flyToSpecies, state, backUrl, applyEnv };
})();
