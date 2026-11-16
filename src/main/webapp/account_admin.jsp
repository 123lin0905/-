<%@ page contentType="text/html; charset=UTF-8" pageEncoding="UTF-8" %>
<%@ page import="org.example.demo1.AdminUser, security.Roles, security.PasswordHasher" %>
<%
    // 账号管理（仅系统级管理员 SYSTEM_ADMIN / SUPER_ADMIN / ADMIN）：AuthFilter.roleGate 已保证只有 Roles.ACCOUNT_ADMIN_ROLES 能打开
    // （未登录跳到人脸识别窗口的账号密码登录，其他身份 403）。数据与操作全部走 /api/accounts/*，规则由服务端 security.AccountRules 校验。
    String ctx = request.getContextPath();
    AdminUser me = Roles.currentUser(request);
    String name = me == null || me.getDisplayName() == null ? "" : me.getDisplayName().replace("&", "&amp;").replace("<", "&lt;");
%>
<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>账号管理 · 智慧校园虚拟生态</title>
  <link rel="stylesheet" href="<%= ctx %>/console/console.css" />
</head>
<body>
<header class="ec-top">
  <a class="ec-brand" href="<%= ctx %>/ecohome.jsp"><span>👥</span><b>账号管理<small>智慧校园 · 虚拟生态 · 仅系统管理员</small></b></a>
  <nav>
    <a class="ec-btn ec-btn-sm" href="<%= ctx %>/ecohome.jsp">🌿 生态主页</a>
    <a class="ec-btn ec-btn-sm" id="nav-dashboard" href="<%= ctx %>/data_screen.jsp">📊 数据大屏</a>
    <a class="ec-btn ec-btn-sm" id="nav-face-admin" href="<%= ctx %>/face_admin.jsp">🗂 人脸信息管理</a>
    <span class="ec-user">👤 <%= name %>（<%= Roles.roleLabel(me.getRoleCode()) %>）</span>
    <a class="ec-btn ec-btn-sm" href="<%= ctx %>/LogoutServlet">退出</a>
  </nav>
</header>
<main class="ec-main">
  <h1 class="ec-h1">账号管理</h1>
  <p class="ec-sub">新建管理员 / 养护人员账号、启用或停用、重置密码、修改角色，并为养护人员分配负责区域（养护工作台据此显示“我负责的区域”）。
    密码以加盐哈希保存；不能停用或修改自己的角色，系统里至少保留一个启用中的系统管理员。</p>

  <section class="fa-kpis">
    <div class="cw-kpi ec-glass"><b id="k-total">–</b><span>账号总数</span></div>
    <div class="cw-kpi ec-glass"><b id="k-admin">–</b><span>管理员</span></div>
    <div class="cw-kpi ec-glass"><b id="k-keeper">–</b><span>养护人员</span></div>
    <div class="cw-kpi ec-glass"><b id="k-off">–</b><span>已停用</span></div>
  </section>

  <div class="cw-bar">
    <input class="fa-search" id="aa-q" type="search" placeholder="搜索账号 / 姓名 / 养护员档案 / 区域" aria-label="搜索账号" />
    <select class="fa-select" id="aa-group" aria-label="按身份筛选">
      <option value="">全部身份</option><option value="admin">管理员</option><option value="maintainer">养护人员</option><option value="other">其他</option>
    </select>
    <select class="fa-select" id="aa-status" aria-label="按状态筛选">
      <option value="">全部状态</option><option value="1">启用中</option><option value="0">已停用</option>
    </select>
    <button class="ec-btn ec-btn-sm ec-btn-primary" id="aa-new" type="button">＋ 新建账号</button>
    <button class="ec-btn ec-btn-sm" id="aa-refresh" type="button">↻ 刷新</button>
    <span class="ec-muted" id="aa-count" style="font-size:13px"></span>
  </div>

  <div class="aa-layout">
    <section class="ec-glass fa-table-wrap">
      <table class="ds-table fa-table aa-table">
        <thead><tr><th>账号</th><th>姓名</th><th>角色</th><th>养护员档案</th><th>负责区域</th><th>人脸</th><th>状态</th><th>操作</th></tr></thead>
        <tbody id="aa-rows"><tr><td colspan="8" class="ec-muted">加载中…</td></tr></tbody>
      </table>
    </section>

    <aside class="ec-glass aa-panel" id="aa-panel">
      <div class="fa-detail-empty ec-muted" id="aa-panel-empty">点“＋ 新建账号”，或在左侧点某个账号的操作按钮，这里显示对应的表单。</div>

      <!-- 新建账号 -->
      <form class="aa-form" id="f-create" hidden novalidate>
        <div class="fa-detail-head"><div><h2>新建账号</h2><p class="ec-muted">养护人员必须关联养护员档案</p></div>
          <button class="ec-btn ec-btn-sm" type="button" data-close aria-label="关闭">×</button></div>
        <label for="c-username">账号（登录名）</label>
        <input class="ec-input" id="c-username" maxlength="50" autocomplete="off" placeholder="字母、数字、下划线，3–50 位" />
        <label for="c-display">姓名</label>
        <input class="ec-input" id="c-display" maxlength="50" autocomplete="off" placeholder="如：王师傅" />
        <label for="c-role">角色</label>
        <select class="ec-input" id="c-role"></select>
        <label for="c-password">初始密码</label>
        <input class="ec-input" id="c-password" type="password" maxlength="64" autocomplete="new-password" placeholder="至少 <%= PasswordHasher.MIN_LENGTH %> 位，含字母和数字" />
        <div class="aa-box" id="c-keeper" hidden>
          <label for="c-archive" style="margin-top:0">养护员档案</label>
          <select class="ec-input" id="c-archive"></select>
          <div class="aa-inline" id="c-new-archive" hidden>
            <input class="ec-input" id="c-nm-name" maxlength="50" placeholder="档案姓名" aria-label="新档案姓名" />
            <input class="ec-input" id="c-nm-phone" maxlength="30" placeholder="联系电话（可选）" aria-label="新档案联系电话" />
          </div>
          <label>负责区域（可多选）</label>
          <div class="aa-check" id="c-areas"></div>
          <p class="aa-hint">一个区域只有一个负责人：勾选已有负责人的区域会改由该养护员负责。</p>
        </div>
        <p class="aa-err" id="c-err" role="alert"></p>
        <div class="aa-actions"><button class="ec-btn ec-btn-primary" type="submit">新建</button><button class="ec-btn" type="button" data-close>取消</button></div>
      </form>

      <!-- 重置密码 -->
      <form class="aa-form" id="f-password" hidden novalidate>
        <div class="fa-detail-head"><div><h2>重置密码</h2><p class="ec-muted" data-target></p></div>
          <button class="ec-btn ec-btn-sm" type="button" data-close aria-label="关闭">×</button></div>
        <label for="p-password">新密码</label>
        <input class="ec-input" id="p-password" type="password" maxlength="64" autocomplete="new-password" placeholder="至少 <%= PasswordHasher.MIN_LENGTH %> 位，含字母和数字" />
        <label for="p-password2">再输一次</label>
        <input class="ec-input" id="p-password2" type="password" maxlength="64" autocomplete="new-password" />
        <p class="aa-hint">重置后该账号已登录的会话会失效，需要用新密码重新登录。</p>
        <p class="aa-err" id="p-err" role="alert"></p>
        <div class="aa-actions"><button class="ec-btn ec-btn-primary" type="submit">保存新密码</button><button class="ec-btn" type="button" data-close>取消</button></div>
      </form>

      <!-- 改角色 / 档案 -->
      <form class="aa-form" id="f-role" hidden novalidate>
        <div class="fa-detail-head"><div><h2>修改角色 / 档案</h2><p class="ec-muted" data-target></p></div>
          <button class="ec-btn ec-btn-sm" type="button" data-close aria-label="关闭">×</button></div>
        <label for="r-role">角色</label>
        <select class="ec-input" id="r-role"></select>
        <div class="aa-box" id="r-keeper" hidden>
          <label for="r-archive" style="margin-top:0">养护员档案</label>
          <select class="ec-input" id="r-archive"></select>
          <div class="aa-inline" id="r-new-archive" hidden>
            <input class="ec-input" id="r-nm-name" maxlength="50" placeholder="档案姓名" aria-label="新档案姓名" />
            <input class="ec-input" id="r-nm-phone" maxlength="30" placeholder="联系电话（可选）" aria-label="新档案联系电话" />
          </div>
        </div>
        <p class="aa-hint">改为管理员时会解除养护员档案关联（档案与负责区域保留）。修改后该账号需要重新登录。</p>
        <p class="aa-err" id="r-err" role="alert"></p>
        <div class="aa-actions"><button class="ec-btn ec-btn-primary" type="submit">保存</button><button class="ec-btn" type="button" data-close>取消</button></div>
      </form>

      <!-- 负责区域 -->
      <form class="aa-form" id="f-areas" hidden novalidate>
        <div class="fa-detail-head"><div><h2>负责区域</h2><p class="ec-muted" data-target></p></div>
          <button class="ec-btn ec-btn-sm" type="button" data-close aria-label="关闭">×</button></div>
        <div class="aa-check" id="a-areas"></div>
        <p class="aa-hint">一个区域只有一个负责人：勾选已有负责人的区域会改由该养护员负责；取消勾选则该区域暂无负责人。</p>
        <p class="aa-err" id="a-err" role="alert"></p>
        <div class="aa-actions"><button class="ec-btn ec-btn-primary" type="submit">保存负责区域</button><button class="ec-btn" type="button" data-close>取消</button></div>
      </form>
    </aside>
  </div>
  <p class="ds-note">角色说明：系统管理员可进入账号管理、数据大屏、人脸信息管理；绿植管理员 / 养护管理员可进入数据大屏和人脸信息管理（只管理养护人员与自己的人脸）；
    养护人员进入养护工作台。账号不提供删除，离职人员请“停用”（人脸记录在人脸信息管理里单独删除）。</p>
</main>
<div class="ec-toast" id="toast" hidden></div>
<script>window.AA_CTX = { ctx: "<%= ctx %>", myId: <%= me.getId() %> };</script>
<script src="<%= ctx %>/console/account-admin.js"></script>
</body>
</html>
