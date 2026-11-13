/*
 * 数据大屏（data_screen.jsp）：读取 /api/dashboard/stats（仅管理员）并渲染。每 60 秒刷新一次。
 */
(function () {
  "use strict";
  const CTX = window.DS_CTX || "";
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const COLORS = { water: "#38bdf8", fertilize: "#a3e635", feed: "#fb923c" };
  const LABEL = { water: "浇水", fertilize: "施肥", feed: "喂食" };

  function set(k, v) { document.querySelectorAll('[data-k="' + k + '"]').forEach((e) => (e.textContent = v)); }

  function render(d) {
    set("zone_species", d.archive.zone_species); set("plants", d.archive.plants); set("animals_total", d.archive.animals_total);
    set("maintainers", d.people.maintainers); set("on_duty", d.people.on_duty); set("care7", d.care7d.total); set("pending", d.pending.total);
    $("ds-time").textContent = "更新于 " + d.generated_at;
    const maxZ = Math.max(1, ...d.zones.map((z) => z.plant_qty + z.animal_qty));
    $("ds-zones").innerHTML = d.zones.map((z) =>
      '<div class="ds-bar" data-zone="' + esc(z.id) + '"><span>' + esc(z.icon || "") + " " + esc(z.name) + '</span><span class="track">' +
      '<i style="width:' + (z.plant_qty / maxZ * 100).toFixed(1) + '%;background:#4ade80"></i><i style="width:' + (z.animal_qty / maxZ * 100).toFixed(1) + '%;background:#38bdf8"></i></span>' +
      "<span>🌿" + z.plant_qty + " 🐾" + z.animal_qty + "</span></div>").join("");
    const maxD = Math.max(1, ...d.care7d.days.map((x) => x.total));
    $("ds-week").innerHTML = d.care7d.days.map((x) =>
      '<div class="col" data-date="' + x.date + '"><b style="color:#e8f3ec">' + x.total + '</b><div class="stack" style="height:' + Math.max(2, x.total / maxD * 130) + 'px">' +
      ["water", "fertilize", "feed"].map((t) => x[t] ? '<i title="' + LABEL[t] + " " + x[t] + '" style="display:block;height:' + (x[t] / Math.max(1, x.total) * 100) + "%;background:" + COLORS[t] + '"></i>' : "").join("") +
      "</div><span>" + x.date.slice(5) + "</span></div>").join("");
    $("ds-week-total").textContent = "合计 " + d.care7d.total + " 次";
    const bt = d.pending.by_type || {};
    $("ds-pending-sub").textContent = "浇水 " + (bt.water || 0) + " · 施肥 " + (bt.fertilize || 0) + " · 喂食 " + (bt.feed || 0) + " · 共 " + d.pending.targets + " 个对象";
    $("ds-pending").innerHTML = d.pending.items.length ? d.pending.items.map((it) =>
      "<tr><td>" + esc(it.name) + '<br><span class="ec-muted">' + esc(it.source) + "</span></td><td>" + esc(it.area_name) + "</td><td>" +
      it.cares.filter((c) => c.state === "due").map((c) => '<span class="ec-tag" style="background:' + COLORS[c.care_type] + '33">' + LABEL[c.care_type] + "</span>").join(" ") + "</td></tr>").join("")
      : '<tr><td colspan="3" class="ec-muted">暂无待养护对象 🎉</td></tr>';
    $("ds-areas").innerHTML = d.areas.length ? d.areas.map((a) =>
      "<tr><td>" + esc(a.area_name) + '<br><span class="ec-muted">' + esc(a.area_code) + "</span></td><td>" + (a.maintainer_name ? esc(a.maintainer_name) : '<span class="ec-muted">未分配</span>') +
      "</td><td>" + a.targets + "</td><td>" + a.due + "</td></tr>").join("") : '<tr><td colspan="4" class="ec-muted">还没有区域档案</td></tr>';
  }

  async function load() {
    try {
      const r = await fetch(CTX + "/api/dashboard/stats", { credentials: "same-origin" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.message || r.status);
      window.__dsData = j;
      render(j);
    } catch (e) {
      $("ds-time").textContent = "加载失败：" + e.message;
    }
  }
  load();
  setInterval(load, 60000);
})();
