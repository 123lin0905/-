<%@ page contentType="text/html; charset=UTF-8" pageEncoding="UTF-8" %>
<%@ page import="org.example.demo1.AdminUser, security.Roles, security.FaceConfig" %>
<%
    // 人脸信息管理（仅管理员）：AuthFilter.roleGate 已保证只有 Roles.ADMIN_ROLES 能打开（未登录跳登录页，养护人员 / 访客 403）。
    // 数据全部来自 /api/face/accounts、/api/face/accounts/{id}/profiles（只含缩略图与录入信息，从不含特征向量）。
    // 管理范围：SYSTEM_ADMIN / SUPER_ADMIN / ADMIN 管理所有账号（含其他管理员）；PLANT_ADMIN / MAINTENANCE_ADMIN 只管理养护人员和自己。
    String ctx = request.getContextPath();
    AdminUser me = Roles.currentUser(request);
    String name = me == null || me.getDisplayName() == null ? "" : me.getDisplayName().replace("&", "&amp;").replace("<", "&lt;");
    boolean allFaces = me != null && Roles.canManageAllFaces(me.getRoleCode());
%>
<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>人脸信息管理 · 智慧校园虚拟生态</title>
  <link rel="stylesheet" href="<%= ctx %>/console/console.css" />
</head>
<body>
<header class="ec-top">
  <a class="ec-brand" href="<%= ctx %>/ecohome.jsp"><span>🗂</span><b>人脸信息管理<small>智慧校园 · 虚拟生态 · 仅管理员</small></b></a>
  <nav>
    <a class="ec-btn ec-btn-sm" href="<%= ctx %>/ecohome.jsp">🌿 生态主页</a>
    <% if (Roles.canViewDashboard(me.getRoleCode())) { %><a class="ec-btn ec-btn-sm" id="nav-dashboard" href="<%= ctx %>/data_screen.jsp">📊 数据大屏</a><% } %>
    <a class="ec-btn ec-btn-sm" href="<%= ctx %>/index.jsp">管理系统</a>
    <a class="ec-btn ec-btn-sm" id="nav-face-enroll" href="<%= ctx %>/face_enroll.jsp">🙂 人脸录入</a>
    <span class="ec-user">👤 <%= name %>（管理员）</span>
    <a class="ec-btn ec-btn-sm" href="<%= ctx %>/LogoutServlet">退出</a>
  </nav>
</header>
<main class="ec-main">
  <h1 class="ec-h1">人脸信息管理</h1>
  <p class="ec-sub">人脸一经录入即长期保存，退出登录、再次录入都不会删除或覆盖；只有管理员可以在这里删除 / 更换。养护人员可以给自己录入，但不能删除。
    <% if (allFaces) { %>你的角色可以管理<b>所有管理员与养护人员</b>的人脸。<% } else { %>你的角色可以管理<b>养护人员和你自己</b>的人脸；其他管理员的人脸由系统管理员管理。<% } %></p>

  <section class="fa-kpis">
    <div class="cw-kpi ec-glass"><b id="k-accounts">–</b><span>可管理账号</span></div>
    <div class="cw-kpi ec-glass"><b id="k-with">–</b><span>已录入人脸的账号</span></div>
    <div class="cw-kpi ec-glass"><b id="k-profiles">–</b><span>人脸记录（条）</span></div>
    <div class="cw-kpi ec-glass"><b id="k-without">–</b><span>尚未录入</span></div>
  </section>

  <div class="cw-bar">
    <input class="fa-search" id="fa-q" type="search" placeholder="搜索账号 / 姓名 / 养护员档案" aria-label="搜索账号" />
    <select class="fa-select" id="fa-role" aria-label="按身份筛选">
      <option value="">全部身份</option><option value="admin">管理员</option><option value="maintainer">养护人员</option><option value="other">其他 / 已删除账号</option>
    </select>
    <select class="fa-select" id="fa-has" aria-label="按录入状态筛选">
      <option value="">全部</option><option value="yes">已录入</option><option value="no">未录入</option>
    </select>
    <button class="ec-btn ec-btn-sm" id="fa-refresh" type="button">↻ 刷新</button>
    <span class="ec-muted" id="fa-count" style="font-size:13px"></span>
  </div>

  <div class="fa-layout">
    <section class="ec-glass fa-table-wrap">
      <table class="ds-table fa-table">
        <thead><tr><th>人脸</th><th>账号</th><th>姓名</th><th>身份</th><th>记录数</th><th>录入时间</th><th>录入人</th><th>操作</th></tr></thead>
        <tbody id="fa-rows"><tr><td colspan="8" class="ec-muted">加载中…</td></tr></tbody>
      </table>
    </section>
    <aside class="ec-glass fa-detail" id="fa-detail">
      <div class="fa-detail-empty ec-muted" id="fa-detail-empty">在左侧点“查看”，这里显示该账号的全部人脸记录。</div>
      <div id="fa-detail-body" hidden>
        <header class="fa-detail-head">
          <div><h2 id="fa-d-title"></h2><p class="ec-muted" id="fa-d-sub"></p></div>
          <button class="ec-btn ec-btn-sm" id="fa-d-close" type="button" aria-label="关闭">×</button>
        </header>
        <div class="fe-row" id="fa-d-actions">
          <a class="ec-btn ec-btn-sm ec-btn-primary" id="fa-d-enroll" href="#">＋ 录入 / 追加</a>
          <button class="ec-btn ec-btn-sm" id="fa-d-replace" type="button">↺ 更换（清空后重新录入）</button>
          <button class="ec-btn ec-btn-sm ec-btn-danger" id="fa-d-delall" type="button">🗑 删除全部</button>
        </div>
        <ul class="fe-list" id="fa-d-list"></ul>
      </div>
    </aside>
  </div>
  <p class="ds-note">每个账号最多 <%= FaceConfig.maxProfilesPerAccount() %> 条人脸（达到上限时不会自动淘汰旧记录，需要先在这里删除）。同一张脸不能录到两个账号：
    要把某人的人脸转到新账号，请先删除原账号（含已停用 / 已删除账号）里的记录。特征向量只保存在服务器，用于比对，从不发送到浏览器。
    “录入 / 追加”“更换”会打开人脸录入页并选中该账号，录入时请本人在摄像头前。</p>
</main>
<div class="ec-toast" id="toast" hidden></div>
<script>window.FA_CTX = { ctx: "<%= ctx %>", myId: <%= me.getId() %> };</script>
<script src="<%= ctx %>/console/face-admin.js"></script>
</body>
</html>
