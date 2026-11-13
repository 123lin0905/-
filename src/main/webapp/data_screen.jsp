<%@ page contentType="text/html; charset=UTF-8" pageEncoding="UTF-8" %>
<%@ page import="org.example.demo1.AdminUser, security.Roles" %>
<%
    // 数据大屏（骨架）：AuthFilter 已保证只有管理员（Roles.ADMIN_ROLES）能打开；数据来自 /api/dashboard/stats。
    String ctx = request.getContextPath();
    AdminUser me = Roles.currentUser(request);
    String name = me == null || me.getDisplayName() == null ? "" : me.getDisplayName().replace("&", "&amp;").replace("<", "&lt;");
%>
<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>数据大屏 · 智慧校园虚拟生态</title>
  <link rel="stylesheet" href="<%= ctx %>/console/console.css" />
</head>
<body>
<header class="ec-top">
  <a class="ec-brand" href="<%= ctx %>/ecohome.jsp"><span>📊</span><b>生态数据大屏<small>智慧校园 · 虚拟生态 · 仅管理员</small></b></a>
  <nav>
    <span class="ec-muted" id="ds-time" style="font-size:13px"></span>
    <a class="ec-btn ec-btn-sm" href="<%= ctx %>/ecohome.jsp">🌿 生态主页</a>
    <a class="ec-btn ec-btn-sm" href="<%= ctx %>/index.jsp">管理系统</a>
    <a class="ec-btn ec-btn-sm" href="<%= ctx %>/face_enroll.jsp">🙂 人脸录入</a>
    <span class="ec-user">👤 <%= name %>（管理员）</span>
    <a class="ec-btn ec-btn-sm" href="<%= ctx %>/LogoutServlet">退出</a>
  </nav>
</header>
<main class="ec-main">
  <section class="ds-kpis" id="ds-kpis">
    <div class="ds-kpi ec-glass"><b data-k="zone_species">–</b><span>生态板块登记个体</span></div>
    <div class="ds-kpi ec-glass"><b data-k="plants">–</b><span>绿植档案（株）</span></div>
    <div class="ds-kpi ec-glass"><b data-k="animals_total">–</b><span>生态动物（只）</span></div>
    <div class="ds-kpi ec-glass"><b data-k="maintainers">–</b><span>养护员（在岗 <i data-k="on_duty">–</i>）</span></div>
    <div class="ds-kpi ec-glass"><b data-k="care7">–</b><span>近 7 天养护操作</span></div>
    <div class="ds-kpi ec-glass"><b data-k="pending">–</b><span>当前待养护</span></div>
  </section>
  <div class="ds-grid">
    <section class="ds-card ec-glass"><h2>🌿 各生态板块动植物 <small>zone_species 登记数（含数量）</small></h2><div class="ds-bars" id="ds-zones"></div>
      <div class="ds-legend"><span><i style="background:#4ade80"></i>植物</span><span><i style="background:#38bdf8"></i>动物</span></div></section>
    <section class="ds-card ec-glass"><h2>🗓 近 7 天养护操作 <small id="ds-week-total"></small></h2><div class="ds-week" id="ds-week"></div>
      <div class="ds-legend"><span><i style="background:#38bdf8"></i>浇水</span><span><i style="background:#a3e635"></i>施肥</span><span><i style="background:#fb923c"></i>喂食</span></div></section>
    <section class="ds-card ec-glass"><h2>⏰ 待养护 <small id="ds-pending-sub"></small></h2>
      <table class="ds-table"><thead><tr><th>对象</th><th>区域</th><th>待办</th></tr></thead><tbody id="ds-pending"></tbody></table></section>
    <section class="ds-card ec-glass"><h2>🗺 区域与负责人</h2>
      <table class="ds-table"><thead><tr><th>区域</th><th>负责养护员</th><th>对象</th><th>待办</th></tr></thead><tbody id="ds-areas"></tbody></table></section>
  </div>
  <p class="ds-note">数据大屏第一版：只读统计骨架，后续可在 /api/dashboard/stats 与 console/data-screen.js 上继续扩展（地图联动、趋势图等）。
    “生态板块登记个体”只统计数据库 zone_species 中的记录（新增的个体，以及被移植 / 移除过的场景原有个体），场景里未改动过的原有装饰个体不在库中。</p>
</main>
<script>window.DS_CTX = "<%= ctx %>";</script>
<script src="<%= ctx %>/console/data-screen.js"></script>
</body>
</html>
