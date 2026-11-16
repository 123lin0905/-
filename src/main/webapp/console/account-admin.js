/*
 * 账号管理（account_admin.jsp，仅系统管理员）：
 *   GET  /api/accounts                 账号列表 + 可分配角色 + 养护员档案 + 区域
 *   POST /api/accounts                 新建账号
 *   POST /api/accounts/{id}/status     启用 / 停用
 *   POST /api/accounts/{id}/password   重置密码
 *   POST /api/accounts/{id}/role       改角色 / 关联档案
 *   POST /api/accounts/{id}/areas      养护人员负责区域
 * 页面上的禁用按钮只是提示，规则（不能停用 / 改自己，最后一个系统管理员不能停用 / 降级等）由服务端校验。
 */
(function () {
  "use strict";
  var C = window.AA_CTX || {};
  var CTX = C.ctx || "";
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var data = { accounts: [], roles: [], maintainers: [], areas: [], me: {} };
  var current = null;   // 当前在右侧表单里操作的账号
  var FORMS = ["f-create", "f-password", "f-role", "f-areas"];

  function toast(msg, err) {
    var t = $("toast"); t.textContent = msg; t.className = "ec-toast" + (err ? " err" : ""); t.hidden = false;
    clearTimeout(toast.t); toast.t = setTimeout(function () { t.hidden = true; }, 3800);
  }

  function api(method, url, body) {
    var opt = { method: method, credentials: "same-origin", headers: { Accept: "application/json" } };
    if (body !== undefined) { opt.headers["Content-Type"] = "application/json"; opt.body = JSON.stringify(body); }
    return fetch(CTX + url, opt).then(function (r) {
      return r.json().catch(function () { return null; }).then(function (j) {
        if (r.status === 401) { location.href = CTX + "/face_login.jsp?switch=1&mode=password&returnUrl=" + encodeURIComponent("/account_admin.jsp"); throw new Error("请先登录"); }
        if (!r.ok) { var e = new Error((j && j.message) || ("请求失败 " + r.status)); e.status = r.status; throw e; }
        return j;
      });
    });
  }

  function isMaintainer(code) { return code === "MAINTAINER"; }
  function roleTag(a) {
    var cls = a.group === "admin" ? "fa-role-admin" : a.group === "maintainer" ? "fa-role-keeper" : "fa-role-other";
    return '<span class="ec-tag ' + cls + '">' + esc(a.role_label) + '</span><br><small class="ec-muted">' + esc(a.role_code) + "</small>";
  }
  function areaTags(list) {
    if (!list || !list.length) return '<span class="ec-muted">—</span>';
    return '<span class="aa-areas">' + list.map(function (x) { return '<span class="ec-tag">' + esc(x.area_name || x.area_code) + "</span>"; }).join("") + "</span>";
  }

  function filtered() {
    var q = $("aa-q").value.trim().toLowerCase(), g = $("aa-group").value, st = $("aa-status").value;
    return data.accounts.filter(function (a) {
      if (g && a.group !== g) return false;
      if (st !== "" && String(a.status) !== st) return false;
      if (!q) return true;
      var hay = [a.username, a.display_name, a.role_label, a.role_code, a.maintainer_name, a.staff_no, a.phone, "#" + a.id]
        .concat((a.areas || []).map(function (x) { return x.area_name + " " + x.area_code; }));
      return hay.some(function (v) { return v && String(v).toLowerCase().indexOf(q) >= 0; });
    });
  }

  function render() {
    var list = data.accounts;
    $("k-total").textContent = list.length;
    $("k-admin").textContent = list.filter(function (a) { return a.group === "admin"; }).length;
    $("k-keeper").textContent = list.filter(function (a) { return a.group === "maintainer"; }).length;
    $("k-off").textContent = list.filter(function (a) { return a.status !== 1; }).length;
    var rows = filtered();
    $("aa-count").textContent = "显示 " + rows.length + " / " + list.length + " 个账号";
    if (!rows.length) { $("aa-rows").innerHTML = '<tr><td colspan="8" class="ec-muted">没有符合条件的账号</td></tr>'; return; }
    $("aa-rows").innerHTML = rows.map(function (a) {
      var self = a.id === C.myId;
      var archive = a.maintainer_id ? esc(a.maintainer_name || "#" + a.maintainer_id) + (a.staff_no ? '<br><small class="ec-muted">' + esc(a.staff_no) + (a.phone ? " · " + esc(a.phone) : "") + "</small>" : "")
        : (isMaintainer(a.role_code) ? '<span class="fa-warn">未关联</span>' : '<span class="ec-muted">—</span>');
      var ops = '<button class="ec-btn ec-btn-sm" type="button" data-op="password" data-id="' + a.id + '">重置密码</button>' +
        '<button class="ec-btn ec-btn-sm" type="button" data-op="role" data-id="' + a.id + '"' + (self ? ' disabled title="不能修改自己的角色"' : "") + ">改角色 / 档案</button>" +
        (isMaintainer(a.role_code) ? '<button class="ec-btn ec-btn-sm" type="button" data-op="areas" data-id="' + a.id + '">负责区域</button>' : "") +
        (a.status === 1
          ? '<button class="ec-btn ec-btn-sm ec-btn-danger" type="button" data-op="disable" data-id="' + a.id + '"' + (self ? ' disabled title="不能停用自己的账号"' : "") + ">停用</button>"
          : '<button class="ec-btn ec-btn-sm" type="button" data-op="enable" data-id="' + a.id + '">启用</button>');
      return '<tr data-id="' + a.id + '"' + (current && current.id === a.id ? ' class="is-active"' : "") + ">" +
        "<td><b>" + esc(a.username) + "</b>" + (self ? ' <span class="ec-tag aa-me">我</span>' : "") + '<br><small class="ec-muted">#' + a.id + "</small></td>" +
        "<td>" + esc(a.display_name) + "</td>" +
        "<td>" + roleTag(a) + "</td>" +
        "<td>" + archive + "</td>" +
        "<td>" + (isMaintainer(a.role_code) ? areaTags(a.areas) : '<span class="ec-muted">—</span>') + "</td>" +
        "<td>" + (a.face_count ? '<span class="fa-has" title="已录入 ' + a.face_count + ' 条">●</span> ' + a.face_count : '<span class="fa-none">○</span>') + "</td>" +
        "<td>" + (a.status === 1 ? '<span class="aa-status-on">启用</span>' : '<span class="aa-status-off">已停用</span>') + "</td>" +
        '<td class="fa-ops">' + ops + "</td></tr>";
    }).join("");
  }

  function load() {
    return api("GET", "/api/accounts").then(function (j) {
      data = j;
      if (current) current = data.accounts.filter(function (a) { return a.id === current.id; })[0] || null;
      render();
    }).catch(function (e) {
      $("aa-rows").innerHTML = '<tr><td colspan="8" class="aa-status-off">' + esc(e.status === 503 ? "数据库暂不可用，请稍后再试" : e.message) + "</td></tr>";
    });
  }

  // ---------------- 右侧表单 ----------------
  function showForm(id, acc) {
    current = acc || null;
    FORMS.forEach(function (f) { $(f).hidden = f !== id; });
    $("aa-panel-empty").hidden = !!id;
    if (id) {
      var t = $(id).querySelector("[data-target]");
      if (t && acc) t.textContent = acc.username + " · " + acc.display_name + "（" + acc.role_label + "）";
      var err = $(id).querySelector(".aa-err"); if (err) err.textContent = "";
    }
    render();
  }

  function roleOptions(sel, value) {
    sel.innerHTML = data.roles.map(function (r) { return '<option value="' + esc(r.code) + '">' + esc(r.label) + "（" + esc(r.code) + "）</option>"; }).join("");
    if (value) sel.value = value;
  }

  /** 档案下拉：未关联账号的档案可选；已关联其他账号的显示但禁用；最后一项“新建档案”。 */
  function archiveOptions(sel, acc) {
    var mine = acc && acc.maintainer_id;
    var html = '<option value="">— 选择已有档案 —</option>';
    data.maintainers.forEach(function (m) {
      var taken = m.linked_username && (!acc || m.linked_username !== acc.username);
      html += '<option value="' + m.id + '"' + (taken ? " disabled" : "") + ">" + esc(m.name) + "（" + esc(m.staff_no) + (m.phone ? " · " + esc(m.phone) : "") + "）" +
        (taken ? " · 已关联 " + esc(m.linked_username) : "") + "</option>";
    });
    html += '<option value="new">＋ 新建养护员档案…</option>';
    sel.innerHTML = html;
    sel.value = mine ? String(mine) : "";
  }

  function areaChecks(box, maintainerId) {
    if (!data.areas.length) { box.innerHTML = '<span class="ec-muted">还没有区域数据（plant_area 表为空）</span>'; return; }
    box.innerHTML = data.areas.map(function (a) {
      var mine = maintainerId != null && a.maintainer_id === maintainerId;
      var other = a.maintainer_id != null && !mine;
      return '<label><input type="checkbox" value="' + a.id + '"' + (mine ? " checked" : "") + "> " + esc(a.area_name) +
        ' <span class="ec-muted">' + esc(a.area_code) + "</span>" + (other ? " <small>现由 " + esc(a.maintainer_name || "#" + a.maintainer_id) + " 负责</small>" : "") + "</label>";
    }).join("");
  }
  function checkedAreas(box) {
    return Array.prototype.map.call(box.querySelectorAll("input:checked"), function (i) { return Number(i.value); });
  }

  function archivePayload(prefix) {
    var v = $(prefix + "-archive").value, out = {};
    if (v === "new") out.new_maintainer = { name: $(prefix + "-nm-name").value.trim(), phone: $(prefix + "-nm-phone").value.trim() };
    else if (v) out.maintainer_id = Number(v);
    return out;
  }

  function syncCreate() {
    var keeper = isMaintainer($("c-role").value);
    $("c-keeper").hidden = !keeper;
    $("c-new-archive").hidden = $("c-archive").value !== "new";
  }
  function syncRole() {
    $("r-keeper").hidden = !isMaintainer($("r-role").value);
    $("r-new-archive").hidden = $("r-archive").value !== "new";
  }

  function openCreate() {
    showForm("f-create", null);
    ["c-username", "c-display", "c-password", "c-nm-name", "c-nm-phone"].forEach(function (id) { $(id).value = ""; });
    roleOptions($("c-role"), "MAINTAINER");
    archiveOptions($("c-archive"), null);
    areaChecks($("c-areas"), null);
    syncCreate();
    $("c-username").focus();
  }

  function submitting(form, on) { Array.prototype.forEach.call(form.querySelectorAll("button[type=submit]"), function (b) { b.disabled = on; }); }

  $("f-create").addEventListener("submit", function (ev) {
    ev.preventDefault();
    var role = $("c-role").value;
    var body = { username: $("c-username").value.trim(), display_name: $("c-display").value.trim(), role_code: role, password: $("c-password").value };
    if (isMaintainer(role)) {
      var ap = archivePayload("c");
      if (!ap.maintainer_id && !(ap.new_maintainer && ap.new_maintainer.name)) { $("c-err").textContent = "养护人员必须关联养护员档案：请选择已有档案，或选“新建养护员档案”并填写姓名"; return; }
      Object.keys(ap).forEach(function (k) { body[k] = ap[k]; });
      body.area_ids = checkedAreas($("c-areas"));
    }
    submitting(this, true); $("c-err").textContent = "";
    var form = this;
    api("POST", "/api/accounts", body).then(function (r) {
      toast(r.message || "已新建");
      showForm(null);
      return load();
    }).catch(function (e) { $("c-err").textContent = e.message; }).then(function () { submitting(form, false); });
  });

  $("f-password").addEventListener("submit", function (ev) {
    ev.preventDefault();
    if (!current) return;
    var p1 = $("p-password").value, p2 = $("p-password2").value;
    if (p1 !== p2) { $("p-err").textContent = "两次输入的密码不一致"; return; }
    var form = this, acc = current;
    submitting(form, true); $("p-err").textContent = "";
    api("POST", "/api/accounts/" + acc.id + "/password", { password: p1 }).then(function (r) {
      toast(r.message || "密码已重置");
      showForm(null);
    }).catch(function (e) { $("p-err").textContent = e.message; }).then(function () { submitting(form, false); });
  });

  $("f-role").addEventListener("submit", function (ev) {
    ev.preventDefault();
    if (!current) return;
    var role = $("r-role").value, body = { role_code: role };
    if (isMaintainer(role)) {
      var ap = archivePayload("r");
      if ($("r-archive").value === "new" && !(ap.new_maintainer && ap.new_maintainer.name)) { $("r-err").textContent = "请填写新档案的姓名"; return; }
      if (!ap.maintainer_id && !ap.new_maintainer && !current.maintainer_id) { $("r-err").textContent = "养护人员必须关联养护员档案"; return; }
      Object.keys(ap).forEach(function (k) { body[k] = ap[k]; });
    }
    var form = this, acc = current;
    submitting(form, true); $("r-err").textContent = "";
    api("POST", "/api/accounts/" + acc.id + "/role", body).then(function (r) {
      toast(r.message || "已保存");
      showForm(null);
      return load();
    }).catch(function (e) { $("r-err").textContent = e.message; }).then(function () { submitting(form, false); });
  });

  $("f-areas").addEventListener("submit", function (ev) {
    ev.preventDefault();
    if (!current) return;
    var form = this, acc = current;
    submitting(form, true); $("a-err").textContent = "";
    api("POST", "/api/accounts/" + acc.id + "/areas", { area_ids: checkedAreas($("a-areas")) }).then(function (r) {
      toast(r.message || "已保存");
      showForm(null);
      return load();
    }).catch(function (e) { $("a-err").textContent = e.message; }).then(function () { submitting(form, false); });
  });

  $("c-role").addEventListener("change", syncCreate);
  $("c-archive").addEventListener("change", syncCreate);
  $("r-role").addEventListener("change", syncRole);
  $("r-archive").addEventListener("change", syncRole);
  Array.prototype.forEach.call(document.querySelectorAll("[data-close]"), function (b) { b.addEventListener("click", function () { showForm(null); }); });

  $("aa-rows").addEventListener("click", function (ev) {
    var b = ev.target.closest("button[data-op]");
    if (!b || b.disabled) return;
    var id = Number(b.dataset.id);
    var acc = data.accounts.filter(function (a) { return a.id === id; })[0];
    if (!acc) return;
    var op = b.dataset.op;
    if (op === "password") {
      showForm("f-password", acc); $("p-password").value = ""; $("p-password2").value = ""; $("p-password").focus();
    } else if (op === "role") {
      showForm("f-role", acc); roleOptions($("r-role"), acc.role_code); archiveOptions($("r-archive"), acc);
      $("r-nm-name").value = ""; $("r-nm-phone").value = ""; syncRole();
    } else if (op === "areas") {
      if (!acc.maintainer_id) { toast("该养护人员还没有关联养护员档案，请先在“改角色 / 档案”里关联", true); return; }
      showForm("f-areas", acc); areaChecks($("a-areas"), acc.maintainer_id);
    } else if (op === "disable" || op === "enable") {
      var enable = op === "enable";
      if (!enable && !confirm("停用账号 " + acc.username + "（" + acc.display_name + "）？\n停用后不能再登录（账号密码与人脸都不行），已登录的会话立即失效。")) return;
      b.disabled = true;
      api("POST", "/api/accounts/" + acc.id + "/status", { enabled: enable }).then(function (r) {
        toast(r.message || (enable ? "已启用" : "已停用"));
        return load();
      }).catch(function (e) { toast(e.message, true); b.disabled = false; });
    }
  });

  $("aa-new").addEventListener("click", openCreate);
  $("aa-refresh").addEventListener("click", function () { load().then(function () { toast("已刷新"); }); });
  ["aa-q", "aa-group", "aa-status"].forEach(function (id) { $(id).addEventListener("input", render); $(id).addEventListener("change", render); });

  load();
})();
