/*
 * 养护工作台（care_workbench.jsp）：读取 /api/care/targets，按区域分组列出动植物个体与浇水 / 施肥 / 喂食状态，
 * 点按钮 POST /api/care/logs 执行一次养护（写入 care_log），成功后刷新状态。负责区域（plant_area.maintainer_id）排在前面。
 */
(function () {
  "use strict";
  const CTX = window.CW_CTX || "";
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const ICON = { water: "💧", fertilize: "🌱", feed: "🐟" };
  const STATE = { due: "需要", soon: "即将到期", ok: "正常", na: "不需要" };
  let data = null, onlyMine = true, onlyDue = false, busy = false;

  function toast(msg, err) { const t = $("toast"); t.textContent = msg; t.className = "ec-toast" + (err ? " err" : ""); t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), 3200); }
  async function api(method, url, body) {
    const r = await fetch(CTX + url, { method, credentials: "same-origin", headers: body ? { "Content-Type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined });
    let j = null; try { j = await r.json(); } catch (e) { /* 非 JSON */ }
    if (!r.ok) { const e = new Error((j && j.message) || "请求失败 " + r.status); e.status = r.status; throw e; }
    return j;
  }

  function careLine(it, c) {
    const st = c.state;
    let detail;
    if (st === "na") detail = "该物种不需要" + c.label;
    else detail = "周期 " + c.period_days + " 天 · " + (c.last_at ? "上次 " + c.last_at + (c.last_by ? "（" + esc(c.last_by) + "）" : "") : "还没有记录") +
      (c.next_due_at ? " · 下次 " + c.next_due_at : "");
    const btn = st === "na" ? "" :
      '<button class="ec-btn ec-btn-sm' + (st === "due" ? " ec-btn-primary" : "") + ' cw-act" type="button" data-type="' + esc(it.target_type) + '" data-id="' + esc(it.target_id) +
      '" data-care="' + c.care_type + '">' + ICON[c.care_type] + " " + c.label + "</button>";
    return '<div class="cw-care" data-care="' + c.care_type + '" data-state="' + st + '"><span>' + ICON[c.care_type] + " " + c.label + '：<span class="cw-st ' + st + '">' +
      (STATE[st] || st) + (st === "due" && c.overdue_hours > 0 ? "（逾期 " + (c.overdue_hours >= 48 ? Math.floor(c.overdue_hours / 24) + " 天" : c.overdue_hours + " 小时") + "）" : "") +
      "</span></span>" + btn + "<small>" + detail + "</small></div>";
  }

  function render() {
    if (!data) return;
    const me = data.me || {};
    const mineAll = data.items.filter((i) => i.mine).length;
    const due = data.due || { all: {}, mine: {} };
    $("k-water").textContent = (due.mine.water || 0) + " / " + (due.all.water || 0);
    $("k-fert").textContent = (due.mine.fertilize || 0) + " / " + (due.all.fertilize || 0);
    $("k-feed").textContent = (due.mine.feed || 0) + " / " + (due.all.feed || 0);
    $("k-total").textContent = mineAll + " / " + data.items.length;
    $("cw-areas").innerHTML = me.maintainer_id == null
      ? "⚠ 当前账号还没有关联养护员档案，无法确定负责区域（请管理员在系统后台关联）。下面列出全部养护对象。"
      : "养护员档案：" + esc(me.maintainer_name || "") + " · 负责区域：" +
        (me.areas && me.areas.length ? me.areas.map((a) => '<span class="ec-tag" data-area="' + esc(a.area_code) + '">' + esc(a.area_name) + "</span>").join(" ") : "暂无（请管理员在“园区网格”中分配）");
    $("f-mine").setAttribute("aria-pressed", String(onlyMine));
    $("f-due").setAttribute("aria-pressed", String(onlyDue));
    let items = data.items;
    if (onlyMine && mineAll > 0) items = items.filter((i) => i.mine);
    if (onlyDue) items = items.filter((i) => i.due_count > 0);
    const groups = new Map();
    for (const it of items) {
      const key = (it.mine ? "0" : "1") + "|" + (it.area_name || "未分配区域");
      if (!groups.has(key)) groups.set(key, { mine: it.mine, area: it.area_name || "未分配区域", scene: null, items: [] });
      const g = groups.get(key);
      if (it.scene_url && !g.scene) g.scene = { url: it.scene_url, zone: it.zone_name };
      g.items.push(it);
    }
    const list = $("cw-list");
    if (!items.length) {
      list.innerHTML = '<div class="cw-empty ec-glass">' + (data.items.length ? "没有符合筛选条件的养护对象 🎉" : "还没有养护对象：可在生态板块里新增动植物，或在管理系统里录入绿植 / 动物档案。") + "</div>";
      return;
    }
    list.innerHTML = Array.from(groups.values()).map((g) =>
      '<section class="cw-group ec-glass" data-area="' + esc(g.area) + '"><h3>' + (g.mine ? "⭐ " : "") + esc(g.area) +
      (g.mine ? ' <span class="ec-tag">我负责</span>' : "") + ' <span class="ec-muted" style="font-size:13px;font-weight:400">' + g.items.length + " 个对象</span>" +
      (g.scene ? ' <a class="ec-btn ec-btn-sm" href="' + CTX + "/" + esc(g.scene.url) + '">✏️ 进入' + esc(g.scene.zone || "板块") + "管理动植物</a>" : "") + "</h3>" +
      '<div class="cw-items">' + g.items.map((it) =>
        '<article class="cw-item' + (it.due_count ? " has-due" : "") + '" data-type="' + esc(it.target_type) + '" data-id="' + esc(it.target_id) + '" data-name="' + esc(it.name) + '">' +
        "<header><b>" + (it.species_type === "animal" ? "🐾 " : "🌿 ") + esc(it.name) + (it.quantity > 1 ? " ×" + it.quantity : "") + "</b>" +
        '<span class="ec-tag">' + esc(it.source) + "</span></header>" +
        it.cares.map((c) => careLine(it, c)).join("") + "</article>").join("") + "</div></section>").join("");
    list.querySelectorAll(".cw-act").forEach((b) => b.addEventListener("click", () => act(b)));
  }

  async function act(b) {
    if (busy) return;
    busy = true; b.disabled = true;
    try {
      const r = await api("POST", "/api/care/logs", { target_type: b.dataset.type, target_id: b.dataset.id, care_type: b.dataset.care });
      toast("✅ " + r.message);
      await load();
    } catch (e) {
      toast("操作失败：" + e.message, true);
      b.disabled = false;
    } finally { busy = false; }
  }

  async function loadLogs() {
    try {
      const r = await api("GET", "/api/care/logs");
      $("cw-logs").innerHTML = r.items.length ? r.items.map((l) =>
        "<li>" + ICON[l.care_type] + " <b>" + esc(l.target_name) + "</b> " + ({ water: "浇水", fertilize: "施肥", feed: "喂食" }[l.care_type] || l.care_type) +
        '<br><span class="ec-muted">' + esc(l.created_at) + " · " + esc(l.operator_name) + (l.note ? " · " + esc(l.note) : "") + "</span></li>").join("")
        : '<li class="ec-muted">还没有养护记录</li>';
    } catch (e) { $("cw-logs").innerHTML = '<li class="ec-muted">' + esc(e.message) + "</li>"; }
  }

  async function load() {
    try {
      data = await api("GET", "/api/care/targets");
      window.__cwData = data;
      render();
    } catch (e) {
      $("cw-list").innerHTML = '<div class="cw-empty ec-glass">' + (e.status === 503 ? "数据库暂不可用，请稍后再试。" : esc(e.message)) + "</div>";
    }
    await loadLogs();
    window.__cwLoaded = (window.__cwLoaded || 0) + 1;
  }

  $("f-mine").addEventListener("click", () => { onlyMine = !onlyMine; render(); });
  $("f-due").addEventListener("click", () => { onlyDue = !onlyDue; render(); });
  $("f-refresh").addEventListener("click", load);
  load();
})();
