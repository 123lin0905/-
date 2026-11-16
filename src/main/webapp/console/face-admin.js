/*
 * 人脸信息管理（face_admin.jsp，仅管理员）：
 *   GET    /api/face/accounts                 账号列表（条数、首次 / 最近录入时间、录入人、缩略图、can_delete / can_enroll）
 *   GET    /api/face/accounts/{id}/profiles   某账号的全部记录
 *   DELETE /api/face/profiles/{id}            删除一条
 *   DELETE /api/face/accounts/{id}/profiles   删除该账号全部
 * 录入 / 更换复用 face_enroll.jsp?account_id={id}。接口从不返回特征向量；页面按钮只是方便，权限由服务端校验。
 */
(function () {
  "use strict";
  var C = window.FA_CTX || {};
  var CTX = C.ctx || "";
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var all = [], max = 5, current = null;

  function toast(msg, err) {
    var t = $("toast"); t.textContent = msg; t.className = "ec-toast" + (err ? " err" : ""); t.hidden = false;
    clearTimeout(toast.t); toast.t = setTimeout(function () { t.hidden = true; }, 3500);
  }

  function api(method, url) {
    return fetch(CTX + url, { method: method, credentials: "same-origin", headers: { Accept: "application/json" } }).then(function (r) {
      return r.json().catch(function () { return null; }).then(function (j) {
        if (r.status === 401) { location.href = CTX + "/face_login.jsp?switch=1&mode=password&returnUrl=" + encodeURIComponent("/face_admin.jsp"); throw new Error("请先登录"); }
        if (!r.ok) { var e = new Error((j && j.message) || ("请求失败 " + r.status)); e.status = r.status; throw e; }
        return j;
      });
    });
  }

  function group(a) {
    if (a.deleted) return "other";
    if (a.role_label === "管理员") return "admin";
    if (a.role_label === "养护人员") return "maintainer";
    return "other";
  }
  function roleTag(a) {
    var g = group(a), cls = g === "admin" ? "fa-role-admin" : g === "maintainer" ? "fa-role-keeper" : "fa-role-other";
    var code = a.deleted ? (a.enrolled_role_code ? "录入时 " + a.enrolled_role_code : "") : (a.role_code || "");
    return '<span class="ec-tag ' + cls + '">' + esc(a.role_label) + '</span>' + (code ? '<br><small class="ec-muted">' + esc(code) + "</small>" : "");
  }
  function thumb(src) {
    return src ? '<img class="fa-thumb" alt="人脸缩略图" src="' + esc(src) + '">' : '<span class="fa-thumb fa-noimg">🙂</span>';
  }
  function enrollUrl(id) { return CTX + "/face_enroll.jsp?account_id=" + encodeURIComponent(id); }

  function filtered() {
    var q = $("fa-q").value.trim().toLowerCase(), role = $("fa-role").value, has = $("fa-has").value;
    return all.filter(function (a) {
      if (role && group(a) !== role) return false;
      if (has === "yes" && !a.face_count) return false;
      if (has === "no" && a.face_count) return false;
      if (!q) return true;
      return [a.username, a.display_name, a.maintainer_name, a.role_code, "#" + a.id].some(function (v) { return v && String(v).toLowerCase().indexOf(q) >= 0; });
    });
  }

  function renderTable() {
    var rows = filtered();
    $("fa-count").textContent = "显示 " + rows.length + " / " + all.length + " 个账号";
    if (!rows.length) { $("fa-rows").innerHTML = '<tr><td colspan="8" class="ec-muted">没有符合条件的账号</td></tr>'; return; }
    $("fa-rows").innerHTML = rows.map(function (a) {
      var name = esc(a.display_name || "") + (a.maintainer_name ? '<br><small class="ec-muted">档案：' + esc(a.maintainer_name) + "</small>" : "") +
        (a.status === 0 && !a.deleted ? '<br><small class="fa-warn">账号已停用</small>' : "");
      var when = a.face_count ? esc(a.first_enrolled_at || "") + (a.last_enrolled_at && a.last_enrolled_at !== a.first_enrolled_at ? '<br><small class="ec-muted">最近 ' + esc(a.last_enrolled_at) + "</small>" : "") : '<span class="ec-muted">—</span>';
      var ops = '<button class="ec-btn ec-btn-sm fa-view" type="button" data-id="' + a.id + '">查看</button>';
      if (a.can_enroll) ops += '<a class="ec-btn ec-btn-sm" href="' + enrollUrl(a.id) + '">录入</a>';
      if (a.can_delete && a.face_count) ops += '<button class="ec-btn ec-btn-sm ec-btn-danger fa-delall" type="button" data-id="' + a.id + '">删除全部</button>';
      return '<tr data-id="' + a.id + '"' + (current === a.id ? ' class="is-active"' : "") + ">" +
        "<td>" + thumb(a.thumbnail) + "</td>" +
        "<td><b>" + esc(a.username || "#" + a.id) + "</b>" + (a.is_me ? ' <span class="ec-tag">我</span>' : "") + "</td>" +
        "<td>" + name + "</td><td>" + roleTag(a) + "</td>" +
        '<td><b class="' + (a.face_count ? "fa-has" : "fa-none") + '">' + a.face_count + "</b><small class=\"ec-muted\"> / " + max + "</small></td>" +
        "<td>" + when + "</td><td>" + (a.last_enrolled_by ? esc(a.last_enrolled_by) : '<span class="ec-muted">—</span>') + "</td>" +
        '<td class="fa-ops">' + ops + "</td></tr>";
    }).join("");
    Array.prototype.forEach.call(document.querySelectorAll(".fa-view"), function (b) { b.onclick = function () { openDetail(+b.dataset.id); }; });
    Array.prototype.forEach.call(document.querySelectorAll(".fa-delall"), function (b) { b.onclick = function () { deleteAll(+b.dataset.id); }; });
  }

  function load() {
    return api("GET", "/api/face/accounts").then(function (r) {
      all = r.items || []; max = r.max || max;
      $("k-accounts").textContent = all.length;
      $("k-with").textContent = r.accounts_with_face;
      $("k-profiles").textContent = r.profiles;
      $("k-without").textContent = all.filter(function (a) { return !a.face_count && !a.deleted; }).length;
      renderTable();
      if (current != null) openDetail(current, true);
    }).catch(function (e) {
      $("fa-rows").innerHTML = '<tr><td colspan="8" class="ec-muted">' + esc(e.status === 503 ? "数据库暂不可用，请稍后再试。" : "读取失败：" + e.message) + "</td></tr>";
    });
  }

  function renderDetail(r) {
    var a = r.account || {};
    $("fa-detail-empty").hidden = true; $("fa-detail-body").hidden = false;
    $("fa-d-title").textContent = (a.display_name || "") + (a.username ? "（" + a.username + "）" : "");
    $("fa-d-sub").textContent = (a.role_label || "") + " · 已录入 " + r.items.length + " / " + (r.max || max) + " 条";
    var en = $("fa-d-enroll");
    en.hidden = !r.can_enroll; en.href = enrollUrl(a.id);
    $("fa-d-replace").hidden = !(r.can_enroll && r.can_delete && r.items.length);
    $("fa-d-delall").hidden = !(r.can_delete && r.items.length);
    var ul = $("fa-d-list");
    if (!r.items.length) { ul.innerHTML = '<li class="ec-muted">该账号还没有录入人脸</li>'; return; }
    ul.innerHTML = r.items.map(function (p) {
      return '<li data-id="' + p.id + '">' + (p.thumbnail ? '<img alt="人脸缩略图" src="' + esc(p.thumbnail) + '">' : '<span class="fe-noimg">🙂</span>') +
        '<div class="fe-meta"><b>#' + p.id + "</b> · " + p.frames + " 帧平均 · " + esc(p.model || "") + '<br><span class="ec-muted">' + esc(p.created_at) +
        " · 录入人 " + esc(p.created_by || "—") + (p.role_code ? " · 录入时身份 " + esc(p.role_code) : "") + "</span></div>" +
        (r.can_delete ? '<button class="ec-btn ec-btn-sm ec-btn-danger fa-del" type="button" data-id="' + p.id + '">删除</button>' : "") + "</li>";
    }).join("");
    Array.prototype.forEach.call(ul.querySelectorAll(".fa-del"), function (b) { b.onclick = function () { deleteOne(+b.dataset.id); }; });
  }

  function openDetail(id, quiet) {
    current = id;
    Array.prototype.forEach.call(document.querySelectorAll("#fa-rows tr"), function (tr) { tr.classList.toggle("is-active", +tr.dataset.id === id); });
    return api("GET", "/api/face/accounts/" + id + "/profiles").then(renderDetail).catch(function (e) {
      if (e.status === 404) { closeDetail(); if (!quiet) toast("该账号已没有人脸记录", true); return; }
      if (!quiet) toast("读取失败：" + e.message, true);
    });
  }
  function closeDetail() {
    current = null; $("fa-detail-body").hidden = true; $("fa-detail-empty").hidden = false;
    Array.prototype.forEach.call(document.querySelectorAll("#fa-rows tr.is-active"), function (tr) { tr.classList.remove("is-active"); });
  }

  function label(id) {
    var a = all.filter(function (x) { return x.id === id; })[0];
    return a ? (a.display_name || "") + (a.username ? "（" + a.username + "）" : "") : "#" + id;
  }

  function deleteOne(pid) {
    if (!confirm("确定删除人脸记录 #" + pid + " 吗？\n人脸数据长期保存，删除后无法恢复，该记录不能再用于刷脸登录。")) return;
    api("DELETE", "/api/face/profiles/" + pid).then(function (r) { toast("已删除 #" + pid); renderDetail(r); load(); })
      .catch(function (e) { toast("删除失败：" + e.message, true); });
  }

  function deleteAll(id, thenEnroll) {
    var msg = thenEnroll
      ? "更换「" + label(id) + "」的人脸：将先删除该账号的全部人脸记录，再打开录入页重新录入。\n删除后无法恢复，确定继续吗？"
      : "确定删除「" + label(id) + "」的全部人脸记录吗？\n删除后无法恢复，该账号将不能再刷脸登录（仍可用账号密码登录）。";
    if (!confirm(msg)) return;
    api("DELETE", "/api/face/accounts/" + id + "/profiles").then(function (r) {
      if (thenEnroll) { location.href = enrollUrl(id); return; }
      toast("已删除 " + r.deleted + " 条人脸记录");
      if (current === id) renderDetail(r);
      load();
    }).catch(function (e) { toast("删除失败：" + e.message, true); });
  }

  $("fa-q").addEventListener("input", renderTable);
  $("fa-role").addEventListener("change", renderTable);
  $("fa-has").addEventListener("change", renderTable);
  $("fa-refresh").addEventListener("click", load);
  $("fa-d-close").addEventListener("click", closeDetail);
  $("fa-d-delall").addEventListener("click", function () { if (current != null) deleteAll(current); });
  $("fa-d-replace").addEventListener("click", function () { if (current != null) deleteAll(current, true); });
  var pre = /[?&]account_id=(\d{1,9})/.exec(location.search);
  load().then(function () { if (pre) openDetail(+pre[1]); });
})();
