<%@ page contentType="text/html; charset=UTF-8" pageEncoding="UTF-8" %>
<%@ page import="org.example.demo1.AdminUser, security.Roles" %>
<%
    // 养护工作台：AuthFilter 已保证只有 Roles.CARE_ROLES（默认仅养护人员 MAINTAINER）能打开；数据全部来自 /api/care/*。
    String ctx = request.getContextPath();
    AdminUser me = Roles.currentUser(request);
    String name = me == null || me.getDisplayName() == null ? "" : me.getDisplayName().replace("&", "&amp;").replace("<", "&lt;");
%>
<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>养护工作台 · 智慧校园虚拟生态</title>
  <link rel="stylesheet" href="<%= ctx %>/console/console.css" />
</head>
<body>
<header class="ec-top">
  <a class="ec-brand" href="<%= ctx %>/ecohome.jsp"><span>🧑‍🌾</span><b>养护工作台<small>智慧校园 · 虚拟生态</small></b></a>
  <nav>
    <a class="ec-btn ec-btn-sm" href="<%= ctx %>/ecohome.jsp">🌿 生态主页</a>
    <a class="ec-btn ec-btn-sm" href="<%= ctx %>/face_enroll.jsp">🙂 人脸录入</a>
    <a class="ec-btn ec-btn-sm" href="<%= ctx %>/index.jsp">管理系统</a>
    <span class="ec-user" id="cw-user">👤 <%= name %>（养护人员）</span>
    <a class="ec-btn ec-btn-sm" href="<%= ctx %>/LogoutServlet">退出</a>
  </nav>
</header>
<main class="ec-main">
  <h1 class="ec-h1">今天要做什么</h1>
  <p class="ec-sub" id="cw-areas">正在读取负责区域…</p>
  <section class="cw-kpis">
    <div class="cw-kpi ec-glass"><b id="k-water">–</b><span>💧 需浇水（我负责 / 全部）</span></div>
    <div class="cw-kpi ec-glass"><b id="k-fert">–</b><span>🌱 需施肥（我负责 / 全部）</span></div>
    <div class="cw-kpi ec-glass"><b id="k-feed">–</b><span>🐟 需喂食（我负责 / 全部）</span></div>
    <div class="cw-kpi ec-glass"><b id="k-total">–</b><span>📋 养护对象（我负责 / 全部）</span></div>
  </section>
  <div class="cw-bar">
    <button class="ec-btn ec-btn-sm" id="f-mine" type="button" aria-pressed="true">只看我负责的区域</button>
    <button class="ec-btn ec-btn-sm" id="f-due" type="button" aria-pressed="false">只看待办</button>
    <button class="ec-btn ec-btn-sm" id="f-refresh" type="button">↻ 刷新</button>
    <span class="ec-muted" style="font-size:13px">动植物的增删改请进入对应生态板块，用“✏️ 管理动植物”操作。</span>
  </div>
  <div class="cw-layout">
    <div id="cw-list"><div class="cw-empty ec-glass">加载中…</div></div>
    <aside class="cw-side ec-glass">
      <h3>🕘 最近的养护记录</h3>
      <ul class="cw-logs" id="cw-logs"><li class="ec-muted">加载中…</li></ul>
    </aside>
  </div>
</main>
<div class="ec-toast" id="toast" hidden></div>
<script>window.CW_CTX = "<%= ctx %>";</script>
<script src="<%= ctx %>/console/care-workbench.js"></script>
</body>
</html>
