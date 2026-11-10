/*
 * 北京时间、太阳位置、季节与天气（Open-Meteo / 服务器代理 / 虚拟天气）。
 * 不依赖电脑本地时区：一律用 UTC 毫秒 + 8 小时计算北京时间。
 */
(function (global) {
  "use strict";

  // 西南财经大学天府学院绵阳校区（绵阳市涪城区园兴西街2号）约 31.4930°N, 104.6874°E
  const CAMPUS = { lat: 31.493, lon: 104.687 };
  const BJ_OFFSET = 8 * 3600 * 1000;

  /** 把一个 UTC 毫秒时间换算为北京时间的各字段 */
  function beijingParts(ms) {
    const d = new Date(ms + BJ_OFFSET);
    const y = d.getUTCFullYear(), mo = d.getUTCMonth() + 1, day = d.getUTCDate();
    const h = d.getUTCHours(), mi = d.getUTCMinutes(), s = d.getUTCSeconds();
    const start = Date.UTC(y, 0, 1);
    const doy = Math.floor((Date.UTC(y, mo - 1, day) - start) / 86400000) + 1;
    return { y, mo, day, h, mi, s, doy, hours: h + mi / 60 + s / 3600 };
  }

  function seasonOfMonth(mo) {
    if (mo >= 3 && mo <= 5) return "spring";
    if (mo >= 6 && mo <= 8) return "summer";
    if (mo >= 9 && mo <= 11) return "autumn";
    return "winter";
  }
  const SEASON_TEXT = { spring: "春", summer: "夏", autumn: "秋", winter: "冬" };

  /**
   * 太阳高度角/方位角（简化天文算法，误差约 1°，足够驱动昼夜）。
   * hours：北京时间小时（可带小数），doy：年内第几天。
   * 返回 { elevation(度), azimuth(度，自北顺时针), dir:[x,y,z] }，世界坐标 x 向东、z 向南、y 向上。
   */
  function sunPosition(doy, hours, lat, lon) {
    lat = lat == null ? CAMPUS.lat : lat;
    lon = lon == null ? CAMPUS.lon : lon;
    const rad = Math.PI / 180;
    const decl = 23.44 * Math.sin(((2 * Math.PI) / 365) * (284 + doy)) * rad;
    const B = ((2 * Math.PI) / 364) * (doy - 81);
    const eot = 9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B); // 分钟
    const solarHours = hours + (4 * (lon - 120) + eot) / 60;
    const H = 15 * (solarHours - 12) * rad;
    const phi = lat * rad;
    const sinEl = Math.sin(phi) * Math.sin(decl) + Math.cos(phi) * Math.cos(decl) * Math.cos(H);
    const el = Math.asin(Math.max(-1, Math.min(1, sinEl)));
    let az = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(decl) * Math.cos(phi)) + Math.PI;
    const ce = Math.cos(el);
    return {
      elevation: el / rad,
      azimuth: (az / rad) % 360,
      dir: [ce * Math.sin(az), Math.sin(el), -ce * Math.cos(az)],
    };
  }

  // ---------- 天气码（WMO）-> 文本 / 图标 / 场景效果 ----------
  // kind: clear 晴 / partly 少云 / cloudy 多云 / overcast 阴 / fog 雾 / drizzle 毛毛雨 / rain 雨 / heavyrain 大雨 / snow 雪 / thunder 雷阵雨
  const KINDS = {
    clear: { text: "晴", icon: "☀️", cloud: 0.08, rain: 0, snow: 0, fog: 0, thunder: false },
    partly: { text: "少云", icon: "🌤️", cloud: 0.3, rain: 0, snow: 0, fog: 0, thunder: false },
    cloudy: { text: "多云", icon: "⛅", cloud: 0.6, rain: 0, snow: 0, fog: 0.05, thunder: false },
    overcast: { text: "阴", icon: "☁️", cloud: 0.9, rain: 0, snow: 0, fog: 0.12, thunder: false },
    fog: { text: "雾", icon: "🌫️", cloud: 0.7, rain: 0, snow: 0, fog: 1, thunder: false },
    drizzle: { text: "毛毛雨", icon: "🌦️", cloud: 0.85, rain: 0.35, snow: 0, fog: 0.15, thunder: false },
    rain: { text: "小雨", icon: "🌧️", cloud: 0.9, rain: 0.6, snow: 0, fog: 0.15, thunder: false },
    heavyrain: { text: "大雨", icon: "🌧️", cloud: 1, rain: 1, snow: 0, fog: 0.3, thunder: false },
    snow: { text: "雪", icon: "🌨️", cloud: 0.9, rain: 0, snow: 0.8, fog: 0.2, thunder: false },
    thunder: { text: "雷阵雨", icon: "⛈️", cloud: 1, rain: 0.9, snow: 0, fog: 0.2, thunder: true },
  };
  function kindOfCode(code) {
    code = Number(code);
    if (code === 0) return "clear";
    if (code === 1) return "partly";
    if (code === 2) return "cloudy";
    if (code === 3) return "overcast";
    if (code === 45 || code === 48) return "fog";
    if (code >= 51 && code <= 57) return "drizzle";
    if (code === 61 || code === 66 || code === 80) return "rain";
    if (code === 63 || code === 65 || code === 67 || code === 81 || code === 82) return "heavyrain";
    if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "snow";
    if (code >= 95) return "thunder";
    return "cloudy";
  }
  function describe(code) {
    const k = kindOfCode(code);
    return Object.assign({ kind: k }, KINDS[k]);
  }

  // ---------- 获取天气：先服务器代理，再浏览器直连，最后虚拟天气 ----------
  const OPEN_METEO =
    "https://api.open-meteo.com/v1/forecast?latitude=" + CAMPUS.lat + "&longitude=" + CAMPUS.lon +
    "&current=temperature_2m,weather_code,wind_speed_10m,is_day&timezone=Asia%2FShanghai";

  function timeoutFetch(url, ms) {
    const ctl = typeof AbortController !== "undefined" ? new AbortController() : null;
    const t = setTimeout(() => ctl && ctl.abort(), ms);
    return fetch(url, { signal: ctl ? ctl.signal : undefined, cache: "no-store" })
      .then((r) => { clearTimeout(t); if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .catch((e) => { clearTimeout(t); throw e; });
  }
  function parseOpenMeteo(j) {
    const c = j && j.current;
    if (!c || c.weather_code == null || c.temperature_2m == null) throw new Error("天气数据格式不正确");
    return { temp: c.temperature_2m, code: c.weather_code, wind: c.wind_speed_10m, isDay: c.is_day, time: c.time };
  }

  /** 虚拟天气：每 30 分钟按 晴 → 多云 → 小雨 → 雾 循环；冬季把“小雨”换成“雪” */
  const VIRTUAL_CYCLE = [0, 2, 61, 45];
  function virtualWeather(ms) {
    const p = beijingParts(ms);
    const slot = Math.floor((p.h * 60 + p.mi) / 30) % VIRTUAL_CYCLE.length;
    const season = seasonOfMonth(p.mo);
    let code = VIRTUAL_CYCLE[slot];
    if (code === 61 && season === "winter") code = 71;
    // 绵阳各月平均气温（约值），叠加日变化（15 时最高）
    const MONTH_MEAN = [5, 7, 11, 17, 21, 24, 26, 26, 22, 17, 12, 7];
    const base = MONTH_MEAN[p.mo - 1];
    const temp = Math.round((base + 4 * Math.sin(((p.hours - 9) / 24) * 2 * Math.PI) - (code === 61 || code === 71 ? 2 : 0)) * 10) / 10;
    return { temp, code, wind: 6 + slot * 3, isDay: p.h >= 7 && p.h < 18 ? 1 : 0, time: null, source: "virtual", sourceText: "虚拟天气（离线模拟，每 30 分钟切换）" };
  }

  /**
   * opts.proxyUrl：服务器代理（如 /demo1/api/weather），可为空
   * 返回 Promise，结果一定可用（最差为虚拟天气）
   */
  function load(opts) {
    opts = opts || {};
    const tryProxy = opts.proxyUrl
      ? timeoutFetch(opts.proxyUrl, 5000).then((j) => Object.assign(parseOpenMeteo(j), { source: "proxy", sourceText: "实时 · Open-Meteo（服务器代理" + (j.cached ? "，10 分钟缓存" : "") + "）" }))
      : Promise.reject(new Error("未配置代理"));
    return tryProxy
      .catch(() => timeoutFetch(OPEN_METEO, 6000).then((j) => Object.assign(parseOpenMeteo(j), { source: "direct", sourceText: "实时 · Open-Meteo（浏览器直连）" })))
      .catch(() => virtualWeather(Date.now()));
  }

  global.EcoWeather = {
    CAMPUS, OPEN_METEO, KINDS, beijingParts, seasonOfMonth, SEASON_TEXT, sunPosition,
    kindOfCode, describe, load, virtualWeather,
  };
})(window);
