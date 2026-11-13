<%@ page contentType="text/html; charset=UTF-8" pageEncoding="UTF-8" %>
<%@ page import="org.example.demo1.AdminUser, security.Roles" %>
<%
    // 系统入口（web.xml welcome-file）：先出现人脸识别窗口。
    // 已登录 / 已选择访客身份的会话直接去各自主页；从导航“人脸登录 / 切换账号”进来时带 ?switch=1 不跳转。
    String ctx = request.getContextPath();
    AdminUser fu = Roles.currentUser(request);
    boolean fv = Roles.isVisitor(request);
    boolean switching = request.getParameter("switch") != null;
    boolean loggedOut = request.getParameter("logout") != null;
    if (!switching && !loggedOut && (fu != null || fv)) {
        response.sendRedirect(ctx + Roles.homeFor(fu));
        return;
    }
%>
<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>身份识别 · 智慧校园虚拟生态</title>
  <link rel="stylesheet" href="<%= ctx %>/console/console.css" />
</head>
<body>
<div class="fl-wrap">
  <main class="fl-card ec-glass" id="face-login" data-state="init">
    <div style="font-size:30px">🌱</div>
    <h1>智慧校园 · 身份识别</h1>
    <p class="ec-sub">管理员 / 养护人员刷脸进入；普通用户可直接以访客身份浏览</p>

    <div class="fl-empty" id="no-face-tip" hidden>
      <b>请先进行人脸录入</b><br/>
      <span style="font-size:13px">系统里还没有任何人脸。管理员 / 养护人员请先用账号密码登录，再给自己录入人脸。</span>
    </div>

    <div class="fl-cam" id="fl-cam" data-state="idle">
      <video id="fl-video" playsinline muted></video>
      <div class="fl-icon" id="fl-icon">🙂</div>
      <div class="fl-ring"></div>
    </div>
    <div class="fl-steps" id="fl-steps"><span data-s="model">加载模型</span><span data-s="detect">检测人脸</span><span data-s="live">活体检测</span><span data-s="match">比对身份</span></div>
    <p class="fl-state" id="face-state">正在准备…</p>

    <div class="fl-actions">
      <button class="ec-btn ec-btn-primary" id="btn-start" type="button" hidden>开始人脸识别</button>
      <button class="ec-btn ec-btn-primary" id="btn-retry" type="button" hidden>重新识别</button>
      <a class="ec-btn ec-btn-primary" id="btn-enroll-first" href="<%= ctx %>/login.jsp?returnUrl=%2Fface_enroll.jsp" hidden>账号密码登录后录入人脸</a>
      <button class="ec-btn" id="btn-guest" type="button">先不录入人脸，以访客进入</button>
      <a class="ec-btn" id="btn-password" href="<%= ctx %>/login.jsp">账号密码登录</a>
    </div>
    <p class="fl-tip">人脸特征只在服务器端比对，不会下发到浏览器。活体 / 防翻拍检测为基础防护，不能完全防止照片攻击。<br/>
      摄像头需要 HTTPS 或 localhost 访问。<% if (fu != null) { %>当前已登录：<%= fu.getDisplayName() == null ? "" : fu.getDisplayName().replace("<", "&lt;") %>。<% } %></p>
  </main>
</div>
<div class="ec-toast" id="toast" hidden></div>
<script>
  window.FACE_CTX = { ctx: "<%= ctx %>", autoStart: <%= !loggedOut %> };
</script>
<script type="module" src="<%= ctx %>/face/face-login.js"></script>
</body>
</html>
