<%@ page contentType="text/html; charset=UTF-8" pageEncoding="UTF-8" %>
<%@ page import="org.example.demo1.AdminUser" %>
<%
    AdminUser currentUser = (AdminUser) session.getAttribute("adminUser");
    String error = (String) request.getAttribute("error");
    String returnUrl = (String) request.getAttribute("returnUrl");
    if (returnUrl == null || returnUrl.trim().isEmpty()) returnUrl = request.getParameter("returnUrl");
    if (returnUrl == null || returnUrl.trim().isEmpty()) returnUrl = "/index.jsp";
%>
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>管理员登录 - 智能绿化系统</title>
    <style>
        * { box-sizing: border-box; }
        body {
            margin: 0;
            min-height: 100vh;
            display: grid;
            place-items: center;
            font-family: "Microsoft YaHei", -apple-system, sans-serif;
            background: linear-gradient(135deg, #ecfdf5, #eff6ff);
            color: #1f2937;
            padding: 20px;
        }
        .card {
            width: min(460px, 100%);
            padding: 34px;
            background: rgba(255,255,255,.95);
            border-radius: 22px;
            box-shadow: 0 20px 60px rgba(15, 23, 42, .12);
        }
        h1 { margin: 0 0 8px; font-size: 25px; color: #0f172a; }
        .subtitle { margin: 0 0 20px; color: #64748b; font-size: 14px; }
        label { display: block; margin: 14px 0 6px; font-size: 14px; font-weight: 600; color: #334155; }
        input { width: 100%; padding: 11px 13px; border: 1px solid #d1d5db; border-radius: 10px; font-size: 15px; outline: none; transition: border-color .2s; }
        input:focus { border-color: #059669; }
        .btn-submit { width: 100%; margin-top: 20px; padding: 12px; border: 0; border-radius: 10px; color: #fff; background: #059669; font-size: 15px; font-weight: 600; cursor: pointer; transition: background .2s; }
        .btn-submit:hover { background: #047857; }
        .error { padding: 10px 12px; border-radius: 9px; color: #b91c1c; background: #fef2f2; font-size: 13px; margin-bottom: 12px; }
        .hint-box { margin-top: 20px; padding: 14px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; font-size: 12.5px; line-height: 1.7; color: #475569; }
        .quick-btn-row { display: flex; gap: 8px; margin-top: 10px; }
        .btn-quick { flex: 1; padding: 7px 10px; font-size: 12px; border: 1px solid #cbd5e1; border-radius: 6px; background: #fff; cursor: pointer; color: #334155; font-weight: 600; transition: all .2s; }
        .btn-quick:hover { background: #f1f5f9; border-color: #94a3b8; }
        .back { display: block; margin-top: 16px; text-align: center; color: #059669; text-decoration: none; font-size: 13px; }
        .back:hover { text-decoration: underline; }
    </style>
</head>
<body>
<main class="card">
    <h1>🌿 管理员安全登录</h1>
    <p class="subtitle">根据您的管理职责（系统运维 或 植物业务）选择账户登录</p>
    <% if (currentUser != null) { %>
        <div class="error" style="color:#166534;background:#f0fdf4;">
            当前已登录：<strong><%= currentUser.getDisplayName() %></strong>（<%= currentUser.getRoleCode() %>）
        </div>
    <% } %>
    <% if (error != null) { %><div class="error"><%= error %></div><% } %>
    <form action="LoginServlet" method="post" id="loginForm">
        <input type="hidden" name="returnUrl" value="<%= returnUrl.replace("\"", "&quot;") %>">
        <label for="username">账号</label>
        <input id="username" name="username" autocomplete="username" placeholder="请输入账号" required>
        <label for="password">密码</label>
        <input id="password" name="password" type="password" autocomplete="current-password" placeholder="请输入密码" required>
        <button type="submit" class="btn-submit">立即登录</button>
    </form>

    <div class="hint-box">
        <strong style="color:#0f172a;">👥 权限划分说明与测试账号：</strong><br/>
        • <strong>🌿 植物管理员 (PLANT_ADMIN)</strong>：专职负责植物增添、修改、删除与生长周期（无系统配置权限）<br/>
        • <strong>⚙️ 系统管理员 (SYSTEM_ADMIN)</strong>：负责系统架构、区域网格与人员（禁止操作植物增删改）
        <div class="quick-btn-row">
            <button type="button" class="btn-quick" style="color:#059669;border-color:#a7f3d0;" onclick="quickFill('plant_admin', '123456')">🌿 填入植物管理员</button>
            <button type="button" class="btn-quick" style="color:#0284c7;border-color:#bae6fd;" onclick="quickFill('admin', '123456')">⚙️ 填入系统管理员</button>
        </div>
    </div>
    <a class="back" href="index.jsp">返回系统首页</a>
</main>

<script>
    function quickFill(user, pwd) {
        document.getElementById('username').value = user;
        document.getElementById('password').value = pwd;
    }
</script>
</body>
</html>
