<%@ page contentType="text/html; charset=UTF-8" pageEncoding="UTF-8" %>
<%@ page import="org.example.demo1.AdminUser, security.Roles" %>
<%
    // 人脸录入：AuthFilter 已保证只有管理员 / 养护人员登录后才能进来（未登录跳登录页，访客 403）。
    // 人脸长期保存：录入只追加、不覆盖；养护人员只能给自己录入，不能删除；管理员按 Roles.canManageFaceOf 的范围为他人录入 / 删除。
    // 从“人脸信息管理”跳过来时带 ?account_id= 预先选中目标账号（服务端仍会校验权限）。
    String ctx = request.getContextPath();
    AdminUser me = Roles.currentUser(request);
    boolean isAdmin = me != null && Roles.isAdmin(me.getRoleCode());
    boolean allFaces = me != null && Roles.canManageAllFaces(me.getRoleCode());
    int preselect = 0;
    try { String p = request.getParameter("account_id"); if (p != null && p.matches("\\d{1,9}")) preselect = Integer.parseInt(p); } catch (NumberFormatException ignored) { }
    String name = me == null || me.getDisplayName() == null ? "" : me.getDisplayName().replace("&", "&amp;").replace("<", "&lt;");
    String back = me == null ? "/ecohome.jsp" : Roles.homeFor(me);
%>
<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>人脸录入 · 智慧校园虚拟生态</title>
  <link rel="stylesheet" href="<%= ctx %>/console/console.css" />
</head>
<body>
<header class="ec-top">
  <a class="ec-brand" href="<%= ctx %>/ecohome.jsp"><span>🌱</span><b>人脸录入<small>智慧校园 · 虚拟生态</small></b></a>
  <nav>
    <a class="ec-btn ec-btn-sm" href="<%= ctx %>/ecohome.jsp">🌿 生态主页</a>
    <% if (Roles.canViewDashboard(me.getRoleCode())) { %><a class="ec-btn ec-btn-sm" id="nav-dashboard" href="<%= ctx %>/data_screen.jsp">📊 数据大屏</a><% } %>
    <% if (Roles.canCare(me.getRoleCode())) { %><a class="ec-btn ec-btn-sm" id="nav-workbench" href="<%= ctx %>/care_workbench.jsp">🧑‍🌾 养护工作台</a><% } %>
    <% if (Roles.canManageFaces(me.getRoleCode())) { %><a class="ec-btn ec-btn-sm" id="nav-face-admin" href="<%= ctx %>/face_admin.jsp">🗂 人脸信息管理</a><% } %>
    <% if (Roles.canManageAccounts(me.getRoleCode())) { %><a class="ec-btn ec-btn-sm" id="nav-account-admin" href="<%= ctx %>/account_admin.jsp">👥 账号管理</a><% } %>
    <a class="ec-btn ec-btn-sm" href="<%= ctx + back %>">返回</a>
    <span class="ec-user">👤 <%= name %>（<%= Roles.groupLabel(Roles.group(me, false)) %>）</span>
    <a class="ec-btn ec-btn-sm" href="<%= ctx %>/LogoutServlet">退出</a>
  </nav>
</header>
<main class="ec-main">
  <h1 class="ec-h1">人脸录入</h1>
  <p class="ec-sub">按提示正视、左转、右转、抬头、低头，采集 3–5 帧取平均作为一条人脸记录。特征向量只保存在服务器，用于下次刷脸登录；录入后长期保存，只有管理员可以删除 / 更换。</p>
  <div class="fe-grid">
    <section class="fe-panel ec-glass">
      <h2>📷 采集</h2>
      <div class="fe-row">
        <label for="target-select">录入给：</label>
        <select id="target-select"><option value="">我自己（<%= name %>）</option></select>
      </div>
      <div class="fe-cam"><video id="fe-video" playsinline muted></video><div class="fe-prompt" id="fe-prompt">点击“开始录入”后按提示转动头部</div></div>
      <div class="fe-dots" id="fe-dots"><i></i><i></i><i></i><i></i><i></i></div>
      <p class="fe-status" id="enroll-status"></p>
      <div class="fe-row">
        <button class="ec-btn ec-btn-primary" id="btn-enroll" type="button">开始录入</button>
        <button class="ec-btn" id="btn-cancel" type="button" hidden>取消</button>
      </div>
    </section>
    <section class="fe-panel ec-glass">
      <h2>🗂 已录入的人脸 <span class="ec-muted" id="profile-account" style="font-size:13px;font-weight:400"></span></h2>
      <ul class="fe-list" id="profile-list"><li class="ec-muted">加载中…</li></ul>
      <p class="ds-note">一人可录入多条（最多 <%= security.FaceConfig.maxProfilesPerAccount() %> 条，如戴眼镜 / 不戴眼镜各一条），识别时取最相似的一条。人脸长期保存：退出登录、再次录入都不会删除或覆盖已有记录。
        <% if (allFaces) { %>你可以为所有管理员 / 养护人员账号录入或删除人脸（录入时请本人在摄像头前），完整列表见“人脸信息管理”。
        <% } else if (isAdmin) { %>你可以为养护人员账号和自己录入或删除人脸（录入时请本人在摄像头前），完整列表见“人脸信息管理”。
        <% } else { %>如需删除或更换已录入的人脸，请联系管理员。<% } %></p>
    </section>
  </div>
</main>
<div class="ec-toast" id="toast" hidden></div>
<script>
  window.FACE_CTX = { ctx: "<%= ctx %>", isAdmin: <%= isAdmin %>, myId: <%= me.getId() %>, preselect: <%= preselect %> };
</script>
<script type="module" src="<%= ctx %>/face/face-enroll.js"></script>
</body>
</html>
