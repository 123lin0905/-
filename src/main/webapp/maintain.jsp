<%@ page contentType="text/html; charset=UTF-8" pageEncoding="UTF-8" %>
<%@ page import="java.util.List" %>
<%@ page import="java.util.Map" %>
<%@ page import="org.example.demo1.Plant" %>
<%@ page import="org.example.demo1.PlantMaintenance" %>
<%
    // 若直接访问 JSP 导致上下文数据为空，自动重定向至控制器预取数据
    if (request.getAttribute("plantList") == null) {
        response.sendRedirect("MaintainServlet");
        return;
    }
    List<Plant> plantList = (List<Plant>) request.getAttribute("plantList");
    List<PlantMaintenance> maintenanceList = (List<PlantMaintenance>) request.getAttribute("maintenanceList");
    Map<String, PlantMaintenance> lastCareMap = (Map<String, PlantMaintenance>) request.getAttribute("lastCareMap");
    List<String> maintainerNames = (List<String>) request.getAttribute("maintainerNames");
    Integer totalPlants = (Integer) request.getAttribute("totalPlants");
    Integer todayCount = (Integer) request.getAttribute("todayCount");
    Integer attentionCount = (Integer) request.getAttribute("attentionCount");
    String keyword = (String) request.getAttribute("keyword");
    String currentMtype = (String) request.getAttribute("mtype");

    if (totalPlants == null) totalPlants = 0;
    if (todayCount == null) todayCount = 0;
    if (attentionCount == null) attentionCount = 0;
    if (keyword == null) keyword = "";
    if (currentMtype == null) currentMtype = "";
%>
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>天府绿化集团 - 绿植养护中心</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            min-height: 100vh;
            padding: 30px 24px 60px 24px;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
            background: url("bj.png") no-repeat center center fixed;
            background-size: cover;
            color: #1f2937;
        }

        /* 顶部毛玻璃导航条 */
        .navbar {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 0 32px;
            height: 68px;
            background: rgba(255, 255, 255, 0.82);
            backdrop-filter: blur(16px);
            -webkit-backdrop-filter: blur(16px);
            border: 1px solid rgba(255, 255, 255, 0.6);
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.06);
            border-radius: 20px;
            max-width: 1440px;
            margin: 0 auto 28px auto;
        }

        .logo-box {
            display: flex;
            align-items: center;
            gap: 12px;
        }

        .logo-icon {
            width: 36px;
            height: 36px;
            background: linear-gradient(135deg, #10b981, #059669);
            border-radius: 10px;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #fff;
            font-size: 20px;
            box-shadow: 0 2px 8px rgba(16, 185, 129, 0.35);
        }

        .logo-title {
            font-size: 20px;
            font-weight: 700;
            color: #111827;
            letter-spacing: 0.5px;
        }

        .logo-sub {
            font-size: 13px;
            color: #6b7280;
            margin-left: 8px;
            font-weight: normal;
            border-left: 1px solid #d1d5db;
            padding-left: 8px;
        }

        .nav-actions {
            display: flex;
            align-items: center;
            gap: 12px;
        }

        .nav-btn {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 8px 18px;
            border-radius: 20px;
            font-size: 14px;
            font-weight: 500;
            text-decoration: none;
            transition: all 0.25s ease;
            cursor: pointer;
            border: 1px solid transparent;
        }

        .btn-primary {
            background-color: #10b981;
            color: #ffffff;
            box-shadow: 0 2px 8px rgba(16, 185, 129, 0.3);
        }

        .btn-primary:hover {
            background-color: #059669;
            transform: translateY(-1px);
            box-shadow: 0 4px 12px rgba(16, 185, 129, 0.4);
        }

        .btn-secondary {
            background-color: rgba(255, 255, 255, 0.9);
            color: #374151;
            border-color: #e5e7eb;
        }

        .btn-secondary:hover {
            background-color: #ffffff;
            color: #10b981;
            border-color: #10b981;
            transform: translateY(-1px);
        }

        /* 页面主容器 */
        .main-container {
            max-width: 1440px;
            margin: 0 auto;
            display: flex;
            flex-direction: column;
            gap: 28px;
        }

        /* 统计看板卡片 */
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
            gap: 20px;
        }

        .stat-card {
            background: rgba(255, 255, 255, 0.85);
            backdrop-filter: blur(14px);
            -webkit-backdrop-filter: blur(14px);
            border: 1px solid rgba(255, 255, 255, 0.7);
            border-radius: 18px;
            padding: 20px 24px;
            box-shadow: 0 6px 20px rgba(0, 0, 0, 0.04);
            display: flex;
            align-items: center;
            justify-content: space-between;
            transition: transform 0.25s ease;
        }

        .stat-card:hover {
            transform: translateY(-2px);
        }

        .stat-info .stat-label {
            font-size: 13px;
            color: #6b7280;
            font-weight: 500;
            margin-bottom: 6px;
        }

        .stat-info .stat-value {
            font-size: 28px;
            font-weight: 800;
            color: #111827;
        }

        .stat-icon-wrap {
            width: 48px;
            height: 48px;
            border-radius: 14px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 24px;
        }

        .stat-green { background: rgba(16, 185, 129, 0.12); color: #10b981; }
        .stat-blue  { background: rgba(59, 130, 246, 0.12); color: #3b82f6; }
        .stat-amber { background: rgba(245, 158, 11, 0.12); color: #f59e0b; }
        .stat-purple{ background: rgba(139, 92, 246, 0.12); color: #8b5cf6; }

        /* 工作台通用面板结构 */
        .panel {
            background: rgba(255, 255, 255, 0.86);
            backdrop-filter: blur(16px);
            -webkit-backdrop-filter: blur(16px);
            border: 1px solid rgba(255, 255, 255, 0.7);
            border-radius: 20px;
            padding: 26px 30px;
            box-shadow: 0 8px 30px rgba(0, 0, 0, 0.05);
        }

        .panel-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 20px;
            padding-bottom: 14px;
            border-bottom: 1px solid rgba(229, 231, 235, 0.6);
        }

        .panel-title {
            font-size: 18px;
            font-weight: 700;
            color: #111827;
            display: flex;
            align-items: center;
            gap: 10px;
        }

        .panel-subtitle {
            font-size: 13px;
            color: #6b7280;
            font-weight: normal;
        }

        /* 快捷打卡横向网格 */
        .quick-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(290px, 1fr));
            gap: 18px;
        }

        .quick-card {
            background: #ffffff;
            border: 1px solid #f0fdf4;
            border-radius: 16px;
            padding: 16px;
            box-shadow: 0 2px 10px rgba(0, 0, 0, 0.03);
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            gap: 14px;
            transition: all 0.25s ease;
        }

        .quick-card:hover {
            border-color: #10b981;
            box-shadow: 0 6px 18px rgba(16, 185, 129, 0.12);
            transform: translateY(-2px);
        }

        .quick-card-top {
            display: flex;
            gap: 12px;
            align-items: center;
        }

        .quick-plant-img {
            width: 58px;
            height: 58px;
            border-radius: 12px;
            object-fit: cover;
            border: 1px solid #e5e7eb;
            background-color: #f3f4f6;
            flex-shrink: 0;
        }

        .quick-plant-meta {
            overflow: hidden;
            flex: 1;
        }

        .quick-plant-name {
            font-size: 15px;
            font-weight: 700;
            color: #1f2937;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        .quick-plant-type {
            font-size: 12px;
            color: #6b7280;
            margin-top: 2px;
        }

        .quick-last-care {
            margin-top: 4px;
            font-size: 11px;
            color: #059669;
            background: #ecfdf5;
            padding: 2px 6px;
            border-radius: 6px;
            display: inline-block;
        }

        .quick-actions {
            display: flex;
            gap: 6px;
            align-items: center;
        }

        .quick-act-btn {
            flex: 1;
            padding: 6px 0;
            border-radius: 10px;
            font-size: 12px;
            font-weight: 600;
            border: 1px solid transparent;
            cursor: pointer;
            transition: all 0.2s ease;
            text-align: center;
        }

        .btn-care-water {
            background-color: #eff6ff;
            color: #2563eb;
            border-color: #dbeafe;
        }
        .btn-care-water:hover {
            background-color: #3b82f6;
            color: #ffffff;
        }

        .btn-care-trim {
            background-color: #ecfdf5;
            color: #059669;
            border-color: #a7f3d0;
        }
        .btn-care-trim:hover {
            background-color: #10b981;
            color: #ffffff;
        }

        .btn-care-fert {
            background-color: #fffbeb;
            color: #d97706;
            border-color: #fde68a;
        }
        .btn-care-fert:hover {
            background-color: #f59e0b;
            color: #ffffff;
        }

        .btn-care-more {
            padding: 6px 10px;
            background-color: #f9fafb;
            color: #4b5563;
            border: 1px solid #e5e7eb;
            border-radius: 10px;
            font-size: 12px;
            cursor: pointer;
        }
        .btn-care-more:hover {
            background-color: #e5e7eb;
            color: #111827;
        }

        /* 搜索过滤栏 */
        .filter-bar {
            display: flex;
            flex-wrap: wrap;
            gap: 12px;
            align-items: center;
            margin-bottom: 20px;
        }

        .search-input {
            padding: 9px 16px;
            border: 1px solid #d1d5db;
            border-radius: 20px;
            font-size: 14px;
            outline: none;
            width: 260px;
            background: #ffffff;
            transition: border-color 0.2s ease;
        }

        .search-input:focus {
            border-color: #10b981;
            box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.15);
        }

        .select-filter {
            padding: 9px 16px;
            border: 1px solid #d1d5db;
            border-radius: 20px;
            font-size: 14px;
            outline: none;
            background: #ffffff;
            color: #374151;
            cursor: pointer;
        }

        .filter-btn {
            padding: 9px 20px;
            background: #10b981;
            color: #ffffff;
            border: none;
            border-radius: 20px;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s ease;
        }

        .filter-btn:hover {
            background: #059669;
        }

        .reset-link {
            font-size: 13px;
            color: #6b7280;
            text-decoration: none;
            padding: 8px 12px;
        }
        .reset-link:hover {
            color: #10b981;
        }

        /* 养护历史表格 */
        .table-responsive {
            overflow-x: auto;
            border-radius: 14px;
            border: 1px solid #e5e7eb;
            background: #ffffff;
        }

        .log-table {
            width: 100%;
            border-collapse: collapse;
            text-align: left;
            font-size: 14px;
        }

        .log-table th {
            background-color: #f9fafb;
            color: #4b5563;
            font-weight: 600;
            padding: 14px 16px;
            border-bottom: 1px solid #e5e7eb;
            white-space: nowrap;
        }

        .log-table td {
            padding: 14px 16px;
            border-bottom: 1px solid #f3f4f6;
            color: #374151;
            vertical-align: middle;
        }

        .log-table tr:hover {
            background-color: #f9fafb;
        }

        /* 徽章样式 */
        .badge {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            padding: 4px 10px;
            border-radius: 12px;
            font-size: 12px;
            font-weight: 600;
        }

        .badge-water { background: #dbeafe; color: #1d4ed8; }
        .badge-trim  { background: #d1fae5; color: #047857; }
        .badge-fert  { background: #fef3c7; color: #b45309; }
        .badge-pest  { background: #ede9fe; color: #6d28d9; }
        .badge-soil  { background: #ffedd5; color: #c2410c; }
        .badge-other { background: #f3f4f6; color: #4b5563; }

        .health-tag {
            padding: 3px 8px;
            border-radius: 6px;
            font-size: 12px;
            font-weight: 500;
        }
        .health-good { background: #ecfdf5; color: #059669; }
        .health-warn { background: #fef2f2; color: #dc2626; }
        .health-note { background: #fffbeb; color: #d97706; }

        .delete-btn {
            color: #ef4444;
            background: #fee2e2;
            padding: 4px 10px;
            border-radius: 8px;
            text-decoration: none;
            font-size: 12px;
            font-weight: 600;
            transition: all 0.2s ease;
        }
        .delete-btn:hover {
            background: #ef4444;
            color: #ffffff;
        }

        /* 空状态 */
        .empty-tip {
            text-align: center;
            padding: 40px;
            color: #9ca3af;
            font-size: 14px;
        }

        /* 弹窗模态框 */
        .modal-overlay {
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
            background: rgba(0, 0, 0, 0.45);
            backdrop-filter: blur(6px);
            display: none;
            align-items: center;
            justify-content: center;
            z-index: 999;
        }

        .modal-content {
            background: #ffffff;
            border-radius: 20px;
            width: 90%;
            max-width: 540px;
            padding: 28px 32px;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.18);
            animation: modalFadeIn 0.25s ease-out;
        }

        @keyframes modalFadeIn {
            from { opacity: 0; transform: scale(0.95); }
            to { opacity: 1; transform: scale(1); }
        }

        .modal-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 20px;
        }

        .modal-title {
            font-size: 18px;
            font-weight: 700;
            color: #111827;
        }

        .close-btn {
            background: none;
            border: none;
            font-size: 22px;
            cursor: pointer;
            color: #9ca3af;
        }
        .close-btn:hover {
            color: #111827;
        }

        .form-group {
            margin-bottom: 16px;
        }

        .form-group label {
            display: block;
            font-size: 13px;
            font-weight: 600;
            color: #374151;
            margin-bottom: 6px;
        }

        .form-control {
            width: 100%;
            padding: 9px 12px;
            border: 1px solid #d1d5db;
            border-radius: 10px;
            font-size: 14px;
            color: #111827;
            outline: none;
        }

        .form-control:focus {
            border-color: #10b981;
            box-shadow: 0 0 0 2px rgba(16, 185, 129, 0.2);
        }

        textarea.form-control {
            resize: vertical;
            min-height: 72px;
        }

        .modal-footer {
            display: flex;
            justify-content: flex-end;
            gap: 12px;
            margin-top: 24px;
        }
    </style>
</head>
<body>

<!-- 顶部导航 -->
<header class="navbar">
    <div class="logo-box">
        <div class="logo-icon">🌿</div>
        <div class="logo-title">天府智能绿化系统</div>
        <span class="logo-sub">绿植养护中心</span>
    </div>

    <nav class="nav-actions">
        <a href="javascript:void(0)" onclick="goBack()" class="nav-btn btn-secondary" style="color: #4b5563; font-weight: 600;">← 返回上一页</a>
        <a href="QueryServlet" class="nav-btn btn-secondary">🔍 绿植档案</a>
        <a href="AnimalServlet" class="nav-btn btn-secondary" style="color:#166534;font-weight:700;">🐾 生态动物</a>
        <a href="ExportServlet?action=report" class="nav-btn btn-secondary" style="color: #0284c7; border-color: #bae6fd; font-weight: 700;">📄 总体综合报告</a>
        <a href="addplant.jsp" class="nav-btn btn-secondary">➕ 增加绿植</a>
        <a href="AreaServlet" class="nav-btn btn-secondary">📍 园区网格</a>
        <a href="javascript:void(0)" onclick="openAddModal('', '')" class="nav-btn btn-primary">📝 登记养护</a>
        <a href="MaintainerServlet" class="nav-btn btn-secondary">👷 维护人员</a>
        <a href="index.jsp" class="nav-btn btn-secondary">🏠 首页</a>
    </nav>
</header>

<div class="main-container">

    <!-- 顶部核心数据看板 -->
    <section class="stats-grid">
        <div class="stat-card">
            <div class="stat-info">
                <div class="stat-label">管护绿植总数</div>
                <div class="stat-value"><%= totalPlants %> <span style="font-size: 14px; font-weight: normal; color: #6b7280;">株</span></div>
            </div>
            <div class="stat-icon-wrap stat-green">🌿</div>
        </div>

        <div class="stat-card">
            <div class="stat-info">
                <div class="stat-label">今日养护打卡</div>
                <div class="stat-value"><%= todayCount %> <span style="font-size: 14px; font-weight: normal; color: #6b7280;">次</span></div>
            </div>
            <div class="stat-icon-wrap stat-blue">💧</div>
        </div>

        <div class="stat-card">
            <div class="stat-info">
                <div class="stat-label">重点关注 / 待养护</div>
                <div class="stat-value" style="color: <%= attentionCount > 0 ? "#ef4444" : "#10b981" %>;"><%= attentionCount %> <span style="font-size: 14px; font-weight: normal; color: #6b7280;">株</span></div>
            </div>
            <div class="stat-icon-wrap stat-amber">⚠️</div>
        </div>

        <div class="stat-card">
            <div class="stat-info">
                <div class="stat-label">累计养护台账</div>
                <div class="stat-value"><%= maintenanceList != null ? maintenanceList.size() : 0 %> <span style="font-size: 14px; font-weight: normal; color: #6b7280;">条</span></div>
            </div>
            <div class="stat-icon-wrap stat-purple">📋</div>
        </div>
    </section>

    <!-- 绿植快捷养护工作台 -->
    <section class="panel">
        <div class="panel-header">
            <div>
                <h2 class="panel-title">⚡ 绿植快捷养护打卡</h2>
                <div class="panel-subtitle">点击下方一键打卡按钮，即时登记日常养护作业</div>
            </div>
            <button onclick="openAddModal('', '')" class="nav-btn btn-primary" style="font-size: 13px; padding: 6px 14px;">+ 自定义登记</button>
        </div>

        <% if (plantList == null || plantList.isEmpty()) { %>
            <div class="empty-tip">当前系统尚未录入绿植档案，请先前往「增加绿植」页面添加。</div>
        <% } else { %>
            <div class="quick-grid">
                <% for (Plant p : plantList) {
                    PlantMaintenance last = (lastCareMap != null) ? lastCareMap.get(p.getPid()) : null;
                    String picSrc = (p.getPpic() != null && !p.getPpic().isEmpty()) ? p.getPpic() : "bj.png";
                %>
                <div class="quick-card">
                    <div class="quick-card-top">
                        <img src="<%= picSrc %>" alt="<%= p.getPname() %>" class="quick-plant-img" onerror="this.src='bj.png'">
                        <div class="quick-plant-meta">
                            <div class="quick-plant-name" title="<%= p.getPname() %>"><%= p.getPname() %></div>
                            <div class="quick-plant-type">编号: <%= p.getPid() %> · <%= p.getPtype() != null ? p.getPtype() : "常规" %></div>
                            <% if (last != null) { %>
                                <div class="quick-last-care">上次: <%= last.getMtype() %> (<%= last.getMdate().length() > 10 ? last.getMdate().substring(5, 10) : last.getMdate() %>)</div>
                            <% } else { %>
                                <div class="quick-last-care" style="background: #fef2f2; color: #ef4444;">尚未养护</div>
                            <% } %>
                        </div>
                    </div>

                    <div class="quick-actions">
                        <button type="button" class="quick-act-btn btn-care-water" title="一键浇水打卡"
                                onclick="quickSubmitCare('<%= p.getPid() %>', '<%= p.getPname() %>', '日常浇水')">💧 浇水</button>
                        <button type="button" class="quick-act-btn btn-care-trim" title="一键修剪打卡"
                                onclick="quickSubmitCare('<%= p.getPid() %>', '<%= p.getPname() %>', '修剪整形')">✂️ 修剪</button>
                        <button type="button" class="quick-act-btn btn-care-fert" title="一键施肥打卡"
                                onclick="quickSubmitCare('<%= p.getPid() %>', '<%= p.getPname() %>', '施肥补充')">🌱 施肥</button>
                        <button type="button" class="btn-care-more" title="详细登记"
                                onclick="openAddModal('<%= p.getPid() %>', '<%= p.getPname() %>')">📝</button>
                    </div>
                </div>
                <% } %>
            </div>
        <% } %>
    </section>

    <!-- 养护台账历史中心 -->
    <section class="panel">
        <div class="panel-header">
            <div>
                <h2 class="panel-title">📋 绿植养护台账明细</h2>
                <div class="panel-subtitle">完整养护日志追溯与管理</div>
            </div>
        </div>

        <!-- 筛选栏 -->
        <form action="MaintainServlet" method="get" class="filter-bar">
            <input type="text" name="keyword" value="<%= keyword %>" placeholder="搜索绿植名称/编号/责任人/备注..." class="search-input">
            <select name="mtype" class="select-filter">
                <option value="">全部养护类型</option>
                <option value="日常浇水" <%= "日常浇水".equals(currentMtype) ? "selected" : "" %>>日常浇水</option>
                <option value="施肥补充" <%= "施肥补充".equals(currentMtype) ? "selected" : "" %>>施肥补充</option>
                <option value="修剪整形" <%= "修剪整形".equals(currentMtype) ? "selected" : "" %>>修剪整形</option>
                <option value="病虫防治" <%= "病虫防治".equals(currentMtype) ? "selected" : "" %>>病虫防治</option>
                <option value="松土换盆" <%= "松土换盆".equals(currentMtype) ? "selected" : "" %>>松土换盆</option>
                <option value="叶面清洁" <%= "叶面清洁".equals(currentMtype) ? "selected" : "" %>>叶面清洁</option>
            </select>
            <button type="submit" class="filter-btn">查询筛选</button>
            <% if (!keyword.isEmpty() || !currentMtype.isEmpty()) { %>
                <a href="MaintainServlet" class="reset-link">重置条件</a>
            <% } %>
        </form>

        <% if (keyword != null && !keyword.trim().isEmpty()) { %>
            <div style="background: rgba(16, 185, 129, 0.12); border: 1px solid rgba(16, 185, 129, 0.3); border-radius: 14px; padding: 12px 20px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; flex-wrap: wrap; gap: 10px;">
                <div style="display: flex; align-items: center; gap: 8px; font-size: 14px; color: #065f46; font-weight: 600;">
                    <span>🔍 当前正在查看【<strong><%= keyword %></strong>】的养护流水（共检索到 <%= maintenanceList != null ? maintenanceList.size() : 0 %> 条真实记录）</span>
                </div>
                <div style="display: flex; gap: 10px;">
                    <a href="MaintainServlet" style="color: #059669; font-size: 13px; text-decoration: none; font-weight: 600; padding: 5px 12px; background: #ffffff; border-radius: 8px; border: 1px solid #10b981;">📋 查看全部台账</a>
                    <a href="MaintainerServlet" style="color: #374151; font-size: 13px; text-decoration: none; font-weight: 500; padding: 5px 12px; background: #ffffff; border-radius: 8px; border: 1px solid #d1d5db;">← 返回维护人员列表</a>
                </div>
            </div>
        <% } %>

        <!-- 台账明细表 -->
        <div class="table-responsive">
            <table class="log-table">
                <thead>
                    <tr>
                        <th style="width: 70px;">序号</th>
                        <th>绿植信息</th>
                        <th>养护类型</th>
                        <th>养护时间</th>
                        <th>执行人</th>
                        <th>生长健康评估</th>
                        <th>养护细节与备忘</th>
                        <th style="width: 80px; text-align: center;">操作</th>
                    </tr>
                </thead>
                <tbody>
                    <% if (maintenanceList == null || maintenanceList.isEmpty()) { %>
                        <tr>
                            <td colspan="8" class="empty-tip">暂无符合条件的养护记录，快在上方工作台为绿植打卡吧！</td>
                        </tr>
                    <% } else {
                        int idx = 1;
                        for (PlantMaintenance item : maintenanceList) {
                            String type = item.getMtype();
                            String badgeClass = "badge-other";
                            String icon = "📌";
                            if ("日常浇水".equals(type)) { badgeClass = "badge-water"; icon = "💧"; }
                            else if ("修剪整形".equals(type)) { badgeClass = "badge-trim"; icon = "✂️"; }
                            else if ("施肥补充".equals(type)) { badgeClass = "badge-fert"; icon = "🌱"; }
                            else if ("病虫防治".equals(type)) { badgeClass = "badge-pest"; icon = "🐛"; }
                            else if ("松土换盆".equals(type)) { badgeClass = "badge-soil"; icon = "🪴"; }

                            String health = item.getHealthStatus();
                            String healthClass = "health-good";
                            if (health != null && (health.contains("缺水") || health.contains("关注"))) {
                                healthClass = "health-note";
                            } else if (health != null && (health.contains("病害") || health.contains("枯萎"))) {
                                healthClass = "health-warn";
                            }
                    %>
                    <tr>
                        <td><strong>#<%= idx++ %></strong></td>
                        <td>
                            <div style="font-weight: 700; color: #111827;"><%= item.getPname() %></div>
                            <div style="font-size: 11px; color: #9ca3af;">ID: <%= item.getPid() %></div>
                        </td>
                        <td>
                            <span class="badge <%= badgeClass %>"><%= icon %> <%= type %></span>
                        </td>
                        <td>
                            <a href="MaintainerServlet?keyword=<%= java.net.URLEncoder.encode(item.getOperator() != null ? item.getOperator() : "", "UTF-8") %>" style="color: #059669; font-weight: 600; text-decoration: none;" title="点击前往员工中心查看【<%= item.getOperator() %>】详细档案">
                                👤 <%= item.getOperator() %>
                            </a>
                        </td>
                        <td>
                            <span class="health-tag <%= healthClass %>"><%= health != null ? health : "正常" %></span>
                        </td>
                        <td style="max-width: 320px; color: #4b5563;"><%= item.getNotes() != null ? item.getNotes() : "-" %></td>
                        <td style="text-align: center;">
                            <a href="DeleteMaintenanceServlet?mid=<%= item.getMid() %>"
                               class="delete-btn"
                               onclick="return confirm('确定要删除此条养护记录吗？');">删除</a>
                        </td>
                    </tr>
                    <%   }
                       } %>
                </tbody>
            </table>
        </div>
    </section>

</div>

<!-- 快速打卡隐藏表单 -->
<form id="quickForm" action="AddMaintenanceServlet" method="post" style="display: none;">
    <input type="hidden" name="pid" id="quickPid">
    <input type="hidden" name="pname" id="quickPname">
    <input type="hidden" name="mtype" id="quickMtype">
    <input type="hidden" name="operator" value="养护专员">
    <input type="hidden" name="healthStatus" value="状态良好">
    <input type="hidden" name="notes" id="quickNotes">
</form>

<!-- 详细登记模态弹窗 -->
<div class="modal-overlay" id="addModal">
    <div class="modal-content">
        <div class="modal-header">
            <h3 class="modal-title">📝 登记绿植养护记录</h3>
            <button class="close-btn" onclick="closeModal()">&times;</button>
        </div>

        <form action="AddMaintenanceServlet" method="post">
            <div class="form-group">
                <label>选择维护绿植 *</label>
                <select name="pid" id="modalPid" class="form-control" required onchange="handlePlantSelect(this)">
                    <option value="">-- 请选择绿植 --</option>
                    <% if (plantList != null) {
                        for (Plant p : plantList) { %>
                        <option value="<%= p.getPid() %>" data-name="<%= p.getPname() %>">
                            <%= p.getPname() %> (编号: <%= p.getPid() %>)
                        </option>
                    <%  }
                    } %>
                </select>
                <input type="hidden" name="pname" id="modalPname">
            </div>

            <div class="form-group">
                <label>养护作业类型 *</label>
                <select name="mtype" class="form-control" required>
                    <option value="日常浇水">💧 日常浇水</option>
                    <option value="施肥补充">🌱 施肥补充</option>
                    <option value="修剪整形">✂️ 修剪整形</option>
                    <option value="病虫防治">🐛 病虫防治</option>
                    <option value="松土换盆">🪴 松土换盆</option>
                    <option value="叶面清洁">🍃 叶面清洁</option>
                </select>
            </div>

            <div class="form-group" style="display: flex; gap: 12px;">
                <div style="flex: 1;">
                    <label>养护责任人</label>
                    <input type="text" name="operator" list="operatorList" class="form-control" value="养护专员" placeholder="选择或填入姓名">
                    <datalist id="operatorList">
                        <% if (maintainerNames != null) {
                            for (String mName : maintainerNames) { %>
                                <option value="<%= mName %>"></option>
                        <%  }
                        } %>
                    </datalist>
                </div>
                <div style="flex: 1;">
                    <label>植株健康状况</label>
                    <select name="healthStatus" class="form-control">
                        <option value="生长旺盛">🌟 生长旺盛</option>
                        <option value="状态良好" selected>✅ 状态良好</option>
                        <option value="轻微缺水">💧 轻微缺水</option>
                        <option value="需关注">⚠️ 需关注</option>
                        <option value="发现病害">🐛 发现病害</option>
                    </select>
                </div>
            </div>

            <div class="form-group">
                <label>养护时间 (选填，默认当前系统时间)</label>
                <input type="text" name="mdate" id="modalMdate" class="form-control" placeholder="如 2026-09-20 14:30">
            </div>

            <div class="form-group">
                <label>养护细节与备忘</label>
                <textarea name="notes" class="form-control" placeholder="记录浇水量、肥料名称、修剪部位或生长观察等..."></textarea>
            </div>

            <div class="modal-footer">
                <button type="button" class="nav-btn btn-secondary" onclick="closeModal()">取消</button>
                <button type="submit" class="nav-btn btn-primary">保存养护台账</button>
            </div>
        </form>
    </div>
</div>

<script>
    // 快速一键打卡
    function quickSubmitCare(pid, pname, mtype) {
        if (!confirm('确认对【' + pname + '】进行【' + mtype + '】快速打卡吗？')) {
            return;
        }
        document.getElementById('quickPid').value = pid;
        document.getElementById('quickPname').value = pname;
        document.getElementById('quickMtype').value = mtype;
        document.getElementById('quickNotes').value = '快捷一键完成' + mtype + '打卡';
        document.getElementById('quickForm').submit();
    }

    // 模态弹窗控制
    function openAddModal(pid, pname) {
        var modal = document.getElementById('addModal');
        var select = document.getElementById('modalPid');
        var pnameInput = document.getElementById('modalPname');

        if (pid) {
            select.value = pid;
            pnameInput.value = pname;
        } else {
            select.selectedIndex = 0;
            pnameInput.value = '';
        }

        // 默认填充当前时间
        var now = new Date();
        var yyyy = now.getFullYear();
        var mm = String(now.getMonth() + 1).padStart(2, '0');
        var dd = String(now.getDate()).padStart(2, '0');
        var hh = String(now.getHours()).padStart(2, '0');
        var min = String(now.getMinutes()).padStart(2, '0');
        document.getElementById('modalMdate').value = yyyy + '-' + mm + '-' + dd + ' ' + hh + ':' + min;

        modal.style.display = 'flex';
    }

    function closeModal() {
        document.getElementById('addModal').style.display = 'none';
    }

    function handlePlantSelect(sel) {
        var opt = sel.options[sel.selectedIndex];
        var name = opt.getAttribute('data-name');
        document.getElementById('modalPname').value = name || '';
    }

    // 返回上一页控制
    function goBack() {
        if (document.referrer && document.referrer.indexOf(window.location.host) !== -1) {
            window.history.back();
        } else {
            window.location.href = 'index.jsp';
        }
    }

    // 点击蒙层关闭
    window.onclick = function(event) {
        var modal = document.getElementById('addModal');
        if (event.target === modal) {
            closeModal();
        }
    }
</script>

</body>
</html>
