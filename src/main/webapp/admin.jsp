<%@ page contentType="text/html; charset=UTF-8" pageEncoding="UTF-8" %>
<%@ page import="java.util.List, org.example.demo1.AdminUser, org.example.demo1.SystemNotice" %>
<%
    if (request.getAttribute("userList") == null) {
        response.sendRedirect("AdminDashboardServlet");
        return;
    }
    List<AdminUser> userList = (List<AdminUser>) request.getAttribute("userList");
    List<SystemNotice> noticeList = (List<SystemNotice>) request.getAttribute("noticeList");
    Integer plantCount = (Integer) request.getAttribute("plantCount");
    Integer maintainerCount = (Integer) request.getAttribute("maintainerCount");
    Integer maintenanceCount = (Integer) request.getAttribute("maintenanceCount");
    Integer duePlantCount = (Integer) request.getAttribute("duePlantCount");
    AdminUser currentUser = (AdminUser) session.getAttribute("adminUser");
    String currentUserName = currentUser != null ? currentUser.getDisplayName() : "超级管理员";
%>
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>系统总控与安全权限管理中心 - 西财天府学院智慧绿化系统</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
    <style>
        :root {
            --primary: #059669;
            --primary-hover: #047857;
            --primary-light: #ecfdf5;
            --dark: #0f172a;
            --gray-700: #334155;
            --gray-500: #64748b;
            --gray-200: #e2e8f0;
            --danger: #ef4444;
            --warning: #f59e0b;
        }

        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: 'Plus Jakarta Sans', "PingFang SC", "Microsoft YaHei", sans-serif;
            background: linear-gradient(145deg, #f0fdf4 0%, #f8fafc 50%, #ecfdf5 100%);
            color: var(--dark);
            min-height: 100vh;
            padding-bottom: 60px;
        }

        /* 顶部导航条 */
        .navbar {
            height: 70px;
            background: rgba(255, 255, 255, 0.92);
            backdrop-filter: blur(14px);
            border-bottom: 1px solid rgba(226, 232, 240, 0.85);
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 0 32px;
            position: sticky;
            top: 0;
            z-index: 100;
            box-shadow: 0 4px 18px rgba(15, 23, 42, 0.04);
        }
        .nav-brand {
            display: flex;
            align-items: center;
            gap: 12px;
            text-decoration: none;
            color: var(--dark);
        }
        .brand-icon {
            width: 40px;
            height: 40px;
            background: linear-gradient(135deg, #0284c7, #0369a1);
            border-radius: 12px;
            display: grid;
            place-items: center;
            color: #fff;
            font-size: 20px;
            box-shadow: 0 4px 12px rgba(2, 132, 199, 0.3);
        }
        .brand-title {
            font-size: 18px;
            font-weight: 700;
        }
        .nav-actions {
            display: flex;
            align-items: center;
            gap: 12px;
        }
        .nav-btn {
            padding: 8px 16px;
            border-radius: 10px;
            font-size: 13.5px;
            font-weight: 600;
            text-decoration: none;
            display: inline-flex;
            align-items: center;
            gap: 6px;
            border: 1px solid var(--gray-200);
            background: #fff;
            color: var(--gray-700);
            transition: all 0.2s;
            cursor: pointer;
        }
        .nav-btn:hover {
            border-color: #cbd5e1;
            background: #f8fafc;
            transform: translateY(-1px);
        }
        .nav-btn.primary {
            background: var(--primary);
            color: #fff;
            border-color: var(--primary);
        }
        .nav-btn.blue {
            background: #0284c7;
            color: #fff;
            border-color: #0284c7;
        }

        .container {
            max-width: 1400px;
            margin: 28px auto 0 auto;
            padding: 0 24px;
        }

        /* 概览数据卡片 */
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 20px;
            margin-bottom: 28px;
        }
        .stat-card {
            background: rgba(255, 255, 255, 0.88);
            backdrop-filter: blur(12px);
            border: 1px solid rgba(255, 255, 255, 0.8);
            border-radius: 16px;
            padding: 20px 24px;
            box-shadow: 0 8px 20px -4px rgba(15, 23, 42, 0.05);
            display: flex;
            align-items: center;
            justify-content: space-between;
        }
        .stat-label {
            font-size: 13px;
            font-weight: 600;
            color: var(--gray-500);
            margin-bottom: 6px;
        }
        .stat-val {
            font-size: 28px;
            font-weight: 800;
            color: var(--dark);
        }
        .stat-icon {
            width: 48px;
            height: 48px;
            border-radius: 14px;
            display: grid;
            place-items: center;
            font-size: 22px;
        }

        /* 标签导航卡片 */
        .tabs-header {
            display: flex;
            align-items: center;
            gap: 12px;
            margin-bottom: 20px;
            border-bottom: 2px solid var(--gray-200);
            padding-bottom: 10px;
        }
        .tab-btn {
            padding: 8px 20px;
            border-radius: 10px;
            font-size: 14.5px;
            font-weight: 700;
            cursor: pointer;
            border: none;
            background: transparent;
            color: var(--gray-500);
            transition: all 0.2s;
        }
        .tab-btn.active {
            background: #fff;
            color: var(--primary);
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.06);
        }

        /* 面板卡片 */
        .panel-card {
            background: rgba(255, 255, 255, 0.95);
            border-radius: 18px;
            border: 1px solid rgba(226, 232, 240, 0.85);
            overflow: hidden;
            box-shadow: 0 12px 30px -6px rgba(15, 23, 42, 0.06);
            margin-bottom: 30px;
        }
        .panel-header {
            padding: 20px 24px;
            border-bottom: 1px solid var(--gray-200);
            display: flex;
            align-items: center;
            justify-content: space-between;
        }
        .panel-title {
            font-size: 17px;
            font-weight: 700;
            color: var(--dark);
            display: flex;
            align-items: center;
            gap: 8px;
        }

        table {
            width: 100%;
            border-collapse: collapse;
            font-size: 13.5px;
            text-align: left;
        }
        th {
            background: #f8fafc;
            padding: 14px 20px;
            font-weight: 700;
            color: var(--gray-700);
            border-bottom: 1px solid var(--gray-200);
        }
        td {
            padding: 14px 20px;
            border-bottom: 1px solid #f1f5f9;
            color: var(--dark);
            vertical-align: middle;
        }
        tr:hover td {
            background: #f8fafc;
        }

        /* 徽章 */
        .badge {
            display: inline-flex;
            align-items: center;
            padding: 4px 10px;
            border-radius: 8px;
            font-size: 12px;
            font-weight: 600;
        }
        .badge.sys { background: #dbeafe; color: #1d4ed8; }
        .badge.plant { background: #dcfce7; color: #15803d; }
        .badge.maintain { background: #fef3c7; color: #b45309; }

        /* 模态框 */
        .modal-overlay {
            position: fixed;
            inset: 0;
            background: rgba(15, 23, 42, 0.6);
            backdrop-filter: blur(6px);
            display: none;
            place-items: center;
            z-index: 1000;
        }
        .modal-content {
            background: #ffffff;
            border-radius: 20px;
            width: 100%;
            max-width: 520px;
            padding: 28px;
            box-shadow: 0 25px 50px -12px rgba(15, 23, 42, 0.25);
            animation: modalFadeIn 0.25s ease-out;
        }
        @keyframes modalFadeIn {
            from { opacity: 0; transform: scale(0.96) translateY(8px); }
            to { opacity: 1; transform: scale(1) translateY(0); }
        }
        .modal-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 20px;
        }
        .modal-title { font-size: 18px; font-weight: 700; }
        .close-btn { background: transparent; border: none; font-size: 22px; color: var(--gray-500); cursor: pointer; }
        .form-group { margin-bottom: 16px; }
        .form-label { display: block; font-size: 13px; font-weight: 600; color: var(--gray-700); margin-bottom: 6px; }
        .form-input, .form-select {
            width: 100%;
            height: 42px;
            padding: 0 14px;
            border: 1px solid var(--gray-200);
            border-radius: 10px;
            font-size: 13.5px;
            outline: none;
            box-sizing: border-box;
        }
        .form-input:focus, .form-select:focus {
            border-color: var(--primary);
            box-shadow: 0 0 0 3px rgba(5, 150, 105, 0.15);
        }
        .form-textarea {
            width: 100%;
            padding: 10px 14px;
            border: 1px solid var(--gray-200);
            border-radius: 10px;
            font-size: 13.5px;
            outline: none;
            font-family: inherit;
            resize: vertical;
            min-height: 80px;
            box-sizing: border-box;
        }
        .modal-actions {
            display: flex;
            align-items: center;
            justify-content: flex-end;
            gap: 12px;
            margin-top: 24px;
        }
    </style>
</head>
<body>

<header class="navbar">
    <a href="index.jsp" class="nav-brand">
        <div class="brand-icon">🛡️</div>
        <div>
            <div class="brand-title">系统运维与权限总控台</div>
            <div style="font-size:11px;color:var(--gray-500);">西南财经大学天府学院 · 后勤保障管理中心</div>
        </div>
    </a>
    <div class="nav-actions">
        <span style="font-size: 13px; font-weight: 600; color: var(--gray-700); background: #f1f5f9; padding: 6px 12px; border-radius: 8px;">
            👤 <%= currentUserName %> (系统管理员)
        </span>
        <a href="AnimalServlet" class="nav-btn">🐾 生态动物</a>
        <a href="ExportServlet?action=report" class="nav-btn">📄 总体报告</a>
        <a href="MaintainerServlet" class="nav-btn">👷 养护员管理</a>
        <a href="index.jsp" class="nav-btn">🏠 返回主页</a>
    </div>
</header>

<div class="container">
    <!-- 统计卡片 -->
    <div class="stats-grid">
        <div class="stat-card">
            <div>
                <div class="stat-label">系统在册绿植</div>
                <div class="stat-val"><%= plantCount != null ? plantCount : 0 %></div>
            </div>
            <div class="stat-icon" style="background: #ecfdf5; color: #059669;">🌿</div>
        </div>
        <div class="stat-card">
            <div>
                <div class="stat-label">在岗养护员工</div>
                <div class="stat-val"><%= maintainerCount != null ? maintainerCount : 0 %></div>
            </div>
            <div class="stat-icon" style="background: #eff6ff; color: #0284c7;">👷</div>
        </div>
        <div class="stat-card">
            <div>
                <div class="stat-label">累计养护作业</div>
                <div class="stat-val"><%= maintenanceCount != null ? maintenanceCount : 0 %></div>
            </div>
            <div class="stat-icon" style="background: #fef3c7; color: #d97706;">🛠️</div>
        </div>
        <div class="stat-card">
            <div>
                <div class="stat-label">待养护/临期株数</div>
                <div class="stat-val" style="color: <%= (duePlantCount != null && duePlantCount > 0) ? "#ef4444" : "#10b981" %>;"><%= duePlantCount != null ? duePlantCount : 0 %></div>
            </div>
            <div class="stat-icon" style="background: #fee2e2; color: #ef4444;">⏰</div>
        </div>
    </div>

    <!-- 选项卡切换 -->
    <div class="tabs-header">
        <button type="button" class="tab-btn active" onclick="switchTab('userTab', this)">👥 管理员与权限用户管理</button>
        <button type="button" class="tab-btn" onclick="switchTab('noticeTab', this)">📢 校园绿化公告发布管理</button>
    </div>

    <!-- 1. 账号与权限管理面板 -->
    <div id="userTab" class="panel-card">
        <div class="panel-header">
            <div class="panel-title">
                <span>🔐</span> 数据库管理员与权限账号列表 (admin_user)
            </div>
            <button type="button" onclick="openAddUserModal()" class="nav-btn blue">➕ 新增管理账号</button>
        </div>
        <table>
            <thead>
                <tr>
                    <th>用户ID</th>
                    <th>登录账号</th>
                    <th>真实姓名 / 显示名</th>
                    <th>系统角色权限</th>
                    <th>账号状态</th>
                    <th>创建/注册时间</th>
                    <th style="text-align: right;">安全操作</th>
                </tr>
            </thead>
            <tbody>
                <%
                    if (userList != null && !userList.isEmpty()) {
                        for (AdminUser u : userList) {
                            String roleBadgeClass = "sys";
                            String roleText = "系统管理员 (全部权限)";
                            if ("PLANT_ADMIN".equals(u.getRoleCode())) {
                                roleBadgeClass = "plant";
                                roleText = "植物管理员 (增删改植物档案)";
                            } else if ("MAINTENANCE_ADMIN".equals(u.getRoleCode())) {
                                roleBadgeClass = "maintain";
                                roleText = "养护管理员 (绿植养护打卡)";
                            }
                %>
                <tr>
                    <td style="font-weight: 700; color: var(--gray-500);">#<%= u.getId() %></td>
                    <td style="font-weight: 700;"><%= u.getUsername() %></td>
                    <td><%= u.getDisplayName() %></td>
                    <td>
                        <span class="badge <%= roleBadgeClass %>"><%= roleText %></span>
                    </td>
                    <td>
                        <span class="badge <%= u.getStatus() == 1 ? "plant" : "maintain" %>">
                            <%= u.getStatus() == 1 ? "正常在用" : "已停用" %>
                        </span>
                    </td>
                    <td style="color: var(--gray-500); font-size: 13px;"><%= u.getCreatedAt() != null ? u.getCreatedAt() : "系统初始" %></td>
                    <td style="text-align: right;">
                        <button type="button" onclick="openResetPwdModal(<%= u.getId() %>, '<%= u.getUsername() %>')" class="nav-btn" style="padding: 4px 10px; font-size: 12px; color: #0284c7; border-color: #bae6fd;">
                            🔑 重置密码
                        </button>
                        <% if (!"admin".equals(u.getUsername())) { %>
                            <form action="AdminDashboardServlet" method="post" style="display: inline-block; margin-left: 6px;">
                                <input type="hidden" name="action" value="toggleUserStatus">
                                <input type="hidden" name="id" value="<%= u.getId() %>">
                                <input type="hidden" name="status" value="<%= u.getStatus() == 1 ? 0 : 1 %>">
                                <button type="submit" class="nav-btn" style="padding: 4px 10px; font-size: 12px; color: <%= u.getStatus() == 1 ? "#d97706" : "#059669" %>;">
                                    <%= u.getStatus() == 1 ? "⏸️ 停用" : "▶️ 启用" %>
                                </button>
                            </form>
                            <form action="AdminDashboardServlet" method="post" style="display: inline-block; margin-left: 6px;" onsubmit="return confirm('确定要注销删除账号【<%= u.getUsername() %>】吗？');">
                                <input type="hidden" name="action" value="deleteUser">
                                <input type="hidden" name="id" value="<%= u.getId() %>">
                                <button type="submit" class="nav-btn" style="padding: 4px 8px; font-size: 12px; color: #ef4444; border-color: #fecaca;">
                                    🗑️
                                </button>
                            </form>
                        <% } %>
                    </td>
                </tr>
                <%
                        }
                    } else {
                %>
                <tr>
                    <td colspan="7" style="text-align: center; padding: 40px; color: var(--gray-500);">暂无管理用户记录</td>
                </tr>
                <% } %>
            </tbody>
        </table>
    </div>

    <!-- 2. 绿化公告发布管理面板 -->
    <div id="noticeTab" class="panel-card" style="display: none;">
        <div class="panel-header">
            <div class="panel-title">
                <span>📢</span> 校园绿化通知与公告管理 (system_notice)
            </div>
            <button type="button" onclick="openAddNoticeModal()" class="nav-btn primary">➕ 发布新公告</button>
        </div>
        <table>
            <thead>
                <tr>
                    <th>公告ID</th>
                    <th>公告标题</th>
                    <th>分类</th>
                    <th>优先级</th>
                    <th>发布单位/部门</th>
                    <th>发布日期</th>
                    <th>状态</th>
                    <th style="text-align: right;">管理操作</th>
                </tr>
            </thead>
            <tbody>
                <%
                    if (noticeList != null && !noticeList.isEmpty()) {
                        for (SystemNotice n : noticeList) {
                %>
                <tr>
                    <td style="font-weight: 700; color: var(--gray-500);">#<%= n.getId() %></td>
                    <td style="font-weight: 600; max-width: 380px;"><%= n.getTitle() %></td>
                    <td><span class="badge" style="background:#f1f5f9;color:#475569;"><%= n.getCategory() %></span></td>
                    <td>
                        <span class="badge <%= "重要".equals(n.getPriority()) ? "maintain" : ("温馨提示".equals(n.getPriority()) ? "plant" : "sys") %>">
                            <%= n.getPriority() %>
                        </span>
                    </td>
                    <td><%= n.getPublisher() %></td>
                    <td style="color: var(--gray-500); font-size: 13px;"><%= n.getPublishDate() %></td>
                    <td><span class="badge plant"><%= n.getStatus() %></span></td>
                    <td style="text-align: right;">
                        <form action="AdminDashboardServlet" method="post" style="display: inline-block;" onsubmit="return confirm('确定撤回并删除该公告吗？');">
                            <input type="hidden" name="action" value="deleteNotice">
                            <input type="hidden" name="id" value="<%= n.getId() %>">
                            <button type="submit" class="nav-btn" style="padding: 4px 10px; font-size: 12px; color: #ef4444; border-color: #fecaca;">
                                🗑️ 删除下架
                            </button>
                        </form>
                    </td>
                </tr>
                <%
                        }
                    } else {
                %>
                <tr>
                    <td colspan="8" style="text-align: center; padding: 40px; color: var(--gray-500);">暂无系统公告，点击上方发布新公告。</td>
                </tr>
                <% } %>
            </tbody>
        </table>
    </div>
</div>

<!-- 新增管理员模态框 -->
<div id="addUserModal" class="modal-overlay">
    <div class="modal-content">
        <div class="modal-header">
            <div class="modal-title">👤 创建新管理账号</div>
            <button type="button" class="close-btn" onclick="closeAddUserModal()">&times;</button>
        </div>
        <form action="AdminDashboardServlet" method="post">
            <input type="hidden" name="action" value="addUser">
            <div class="form-group">
                <label class="form-label">登录用户名 (英文/数字)</label>
                <input type="text" name="username" class="form-input" required placeholder="如: garden_keeper">
            </div>
            <div class="form-group">
                <label class="form-label">初始登录密码</label>
                <input type="password" name="plainPassword" class="form-input" required value="123456">
            </div>
            <div class="form-group">
                <label class="form-label">真实姓名 / 显示名</label>
                <input type="text" name="displayName" class="form-input" required placeholder="如: 张三 (植物管理员)">
            </div>
            <div class="form-group">
                <label class="form-label">系统权限角色分配</label>
                <select name="roleCode" class="form-select" required>
                    <option value="PLANT_ADMIN" selected>植物管理员 (权限：作物增添、修改、减少)</option>
                    <option value="MAINTENANCE_ADMIN">养护管理员 (权限：日常绿植养护打卡)</option>
                    <option value="SYSTEM_ADMIN">系统管理员 (权限：人员管理、系统配置、后台)</option>
                </select>
            </div>
            <div class="modal-actions">
                <button type="button" class="nav-btn" onclick="closeAddUserModal()">取消</button>
                <button type="submit" class="nav-btn blue">✅ 立即创建</button>
            </div>
        </form>
    </div>
</div>

<!-- 重置密码模态框 -->
<div id="resetPwdModal" class="modal-overlay">
    <div class="modal-content" style="max-width: 440px;">
        <div class="modal-header">
            <div class="modal-title">🔑 重置账号密码</div>
            <button type="button" class="close-btn" onclick="closeResetPwdModal()">&times;</button>
        </div>
        <form action="AdminDashboardServlet" method="post">
            <input type="hidden" name="action" value="updatePassword">
            <input type="hidden" id="resetUserId" name="id" value="">
            <div class="form-group">
                <label class="form-label">目标账号</label>
                <input type="text" id="resetUserName" class="form-input" readonly style="background: #f8fafc;">
            </div>
            <div class="form-group">
                <label class="form-label">设定新密码</label>
                <input type="password" name="newPassword" class="form-input" required placeholder="输入新密码...">
            </div>
            <div class="modal-actions">
                <button type="button" class="nav-btn" onclick="closeResetPwdModal()">取消</button>
                <button type="submit" class="nav-btn blue">确认更新密码</button>
            </div>
        </form>
    </div>
</div>

<!-- 发布公告模态框 -->
<div id="addNoticeModal" class="modal-overlay">
    <div class="modal-content" style="max-width: 580px;">
        <div class="modal-header">
            <div class="modal-title">📢 发布校园绿化通知公告</div>
            <button type="button" class="close-btn" onclick="closeAddNoticeModal()">&times;</button>
        </div>
        <form action="AdminDashboardServlet" method="post">
            <input type="hidden" name="action" value="addNotice">
            <div class="form-group">
                <label class="form-label">公告标题</label>
                <input type="text" name="title" class="form-input" required placeholder="输入公告标题...">
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px;">
                <div class="form-group">
                    <label class="form-label">分类类型</label>
                    <select name="category" class="form-select">
                        <option value="养护通知" selected>养护通知</option>
                        <option value="修剪作业">修剪作业</option>
                        <option value="景观保护">景观保护</option>
                        <option value="设施巡检">设施巡检</option>
                        <option value="防灾防冻">防灾防冻</option>
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">重要优先级</label>
                    <select name="priority" class="form-select">
                        <option value="普通" selected>普通</option>
                        <option value="温馨提示">温馨提示</option>
                        <option value="重要">重要提醒 (标黄)</option>
                    </select>
                </div>
            </div>
            <div class="form-group">
                <label class="form-label">发布单位 / 部门署名</label>
                <input type="text" name="publisher" class="form-input" value="后勤管理处绿化中心">
            </div>
            <div class="form-group">
                <label class="form-label">通知正文内容</label>
                <textarea name="content" class="form-textarea" required placeholder="输入通知详细内容..."></textarea>
            </div>
            <div class="modal-actions">
                <button type="button" class="nav-btn" onclick="closeAddNoticeModal()">取消</button>
                <button type="submit" class="nav-btn primary">📢 确认发布上线</button>
            </div>
        </form>
    </div>
</div>

<script>
    function switchTab(tabId, btn) {
        document.getElementById('userTab').style.display = tabId === 'userTab' ? 'block' : 'none';
        document.getElementById('noticeTab').style.display = tabId === 'noticeTab' ? 'block' : 'none';
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
    }

    function openAddUserModal() {
        document.getElementById('addUserModal').style.display = 'grid';
    }
    function closeAddUserModal() {
        document.getElementById('addUserModal').style.display = 'none';
    }

    function openResetPwdModal(id, username) {
        document.getElementById('resetUserId').value = id;
        document.getElementById('resetUserName').value = username;
        document.getElementById('resetPwdModal').style.display = 'grid';
    }
    function closeResetPwdModal() {
        document.getElementById('resetPwdModal').style.display = 'none';
    }

    function openAddNoticeModal() {
        document.getElementById('addNoticeModal').style.display = 'grid';
    }
    function closeAddNoticeModal() {
        document.getElementById('addNoticeModal').style.display = 'none';
    }

    window.onclick = function(event) {
        if (event.target.classList.contains('modal-overlay')) {
            event.target.style.display = 'none';
        }
    };
</script>

</body>
</html>
