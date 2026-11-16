/*
 * 人脸识别窗口里的“账号密码登录”（face_login.jsp）。普通脚本（非 module），即使人脸模型加载失败也能用。
 *   - “人脸识别 / 账号密码登录”两个页签切换；切换时派发 fl:mode 事件，face-login.js 据此关闭 / 重新打开摄像头；
 *   - 提交 POST /api/auth/login {username, password, returnUrl}，成功后跳转服务端给的 redirect
 *     （管理员 → 数据大屏，养护人员 → 养护工作台；returnUrl 合法且有权限时优先）；
 *   - window.FacePw.open(returnUrl)：供“账号密码登录后录入人脸”按钮调用（returnUrl=/face_enroll.jsp）。
 */
(function () {
  var CFG = window.FACE_CTX || {};
  var CTX = CFG.ctx || '';
  var returnUrl = CFG.returnUrl || null;
  var $ = function (id) { return document.getElementById(id); };
  var card = $('face-login'), facePane = $('face-pane'), pwPane = $('pw-pane');
  var form = $('pw-form'), user = $('pw-username'), pass = $('pw-password'), state = $('pw-state'), submit = $('pw-submit');
  var busy = false;

  var RETURN_TIPS = { '/face_enroll.jsp': '登录后进入“人脸录入”，给自己录入人脸', '/face_admin.jsp': '登录后进入“人脸信息管理”',
    '/account_admin.jsp': '登录后进入“账号管理”', '/data_screen.jsp': '登录后进入“数据大屏”', '/care_workbench.jsp': '登录后进入“养护工作台”' };

  function setState(text, cls) { state.textContent = text || ''; state.className = 'fl-state' + (cls ? ' ' + cls : ''); }

  function showReturnTip() {
    var tip = $('pw-return');
    var key = returnUrl ? returnUrl.split('?')[0] : null;
    if (key && RETURN_TIPS[key]) { tip.textContent = '🔒 ' + RETURN_TIPS[key]; tip.hidden = false; }
    else { tip.hidden = true; }
  }

  function setMode(mode, focus) {
    var pw = mode === 'password';
    facePane.hidden = pw; pwPane.hidden = !pw;
    $('tab-face').setAttribute('aria-selected', String(!pw));
    $('tab-password').setAttribute('aria-selected', String(pw));
    card.dataset.mode = mode;
    showReturnTip();
    document.dispatchEvent(new CustomEvent('fl:mode', { detail: { mode: mode } }));
    if (pw && focus !== false) setTimeout(function () { (user.value ? pass : user).focus(); }, 0);
  }

  $('tab-face').addEventListener('click', function () { setMode('face'); });
  $('tab-password').addEventListener('click', function () { setMode('password'); });

  form.addEventListener('submit', function (ev) {
    ev.preventDefault();
    if (busy) return;
    var u = user.value.trim(), p = pass.value;
    if (!u || !p) { setState('请输入账号和密码', 'warn'); (u ? pass : user).focus(); return; }
    busy = true; submit.disabled = true; setState('正在登录…');
    fetch(CTX + '/api/auth/login', {
      method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: u, password: p, returnUrl: returnUrl })
    }).then(function (r) {
      return r.json().catch(function () { return null; }).then(function (j) { return { status: r.status, ok: r.ok, body: j }; });
    }).then(function (res) {
      if (res.ok && res.body && res.body.redirect) {
        window.__pwResult = res.body;
        setState('登录成功：' + res.body.user.display_name + '（' + res.body.user.group_label + '），正在进入…', 'ok');
        location.href = res.body.redirect;
        return;
      }
      var msg = (res.body && res.body.message) || ('登录失败（' + res.status + '）');
      if (res.status === 503) msg = '数据库暂不可用，暂时无法登录，请稍后再试或以访客身份浏览。';
      window.__pwResult = { ok: false, status: res.status, error: res.body && res.body.error };
      setState(msg, 'err');
      pass.value = ''; pass.focus();
      busy = false; submit.disabled = false;
    }).catch(function (e) {
      setState('无法连接服务器：' + (e && e.message ? e.message : e), 'err');
      busy = false; submit.disabled = false;
    });
  });

  window.FacePw = {
    open: function (url) { if (url) returnUrl = url; setMode('password'); }
  };

  showReturnTip();
  if (CFG.mode === 'password') setTimeout(function () { user.focus(); }, 0);
})();
