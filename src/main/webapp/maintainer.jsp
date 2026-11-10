<%@ page contentType="text/html; charset=UTF-8" pageEncoding="UTF-8" %>
<%@ page import="java.util.List" %>
<%@ page import="org.example.demo1.Maintainer" %>
<%
    // 若直接访问 JSP 导致上下文数据为空，自动重定向至控制器预取数据
    if (request.getAttribute("maintainerList") == null) {
        response.sendRedirect("MaintainerServlet");
        return;
    }
    List<Maintainer> maintainerList = (List<Maintainer>) request.getAttribute("maintainerList");
    List<String> departmentList = (List<String>) request.getAttribute("departmentList");
    Integer totalCount = (Integer) request.getAttribute("totalCount");
    Integer onDutyCount = (Integer) request.getAttribute("onDutyCount");
    Integer restingCount = (Integer) request.getAttribute("restingCount");
    Integer leaveCount = (Integer) request.getAttribute("leaveCount");
    String keyword = (String) request.getAttribute("keyword");
    String selectedDept = (String) request.getAttribute("department");
    String selectedStatus = (String) request.getAttribute("status");

    if (totalCount == null) totalCount = 0;
    if (onDutyCount == null) onDutyCount = 0;
    if (restingCount == null) restingCount = 0;
    if (leaveCount == null) leaveCount = 0;
    if (keyword == null) keyword = "";
    if (selectedDept == null) selectedDept = "";
    if (selectedStatus == null) selectedStatus = "";
%>
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>天府绿化集团 - 绿化养护人员档案管理</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            min-height: 100vh;
            padding: 24px 28px 60px 28px;
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
            background: rgba(255, 255, 255, 0.85);
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
            width: 38px;
            height: 38px;
            background: linear-gradient(135deg, #10b981, #059669);
            border-radius: 10px;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #fff;
            font-size: 20px;
            font-weight: bold;
            box-shadow: 0 4px 12px rgba(16, 185, 129, 0.35);
        }

        .logo-title {
            font-size: 20px;
            font-weight: 700;
            color: #111827;
            letter-spacing: 0.5px;
        }

        .nav-actions {
            display: flex;
            align-items: center;
            gap: 10px;
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
            border: 1px solid rgba(229, 231, 235, 0.8);
            background: rgba(255, 255, 255, 0.9);
            color: #374151;
        }

        .nav-btn:hover {
            background: #ffffff;
            color: #10b981;
            border-color: #10b981;
            transform: translateY(-1px);
            box-shadow: 0 4px 12px rgba(16, 185, 129, 0.15);
        }

        .nav-btn.active {
            background: #10b981;
            color: #ffffff;
            border-color: #10b981;
            box-shadow: 0 4px 14px rgba(16, 185, 129, 0.3);
        }

        /* 页面主容器 */
        .container {
            max-width: 1440px;
            margin: 0 auto;
            display: flex;
            flex-direction: column;
            gap: 24px;
        }

        /* 顶部看板指标卡片 */
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 20px;
        }

        .stat-card {
            background: rgba(255, 255, 255, 0.82);
            backdrop-filter: blur(14px);
            -webkit-backdrop-filter: blur(14px);
            border: 1px solid rgba(255, 255, 255, 0.7);
            border-radius: 18px;
            padding: 22px 24px;
            box-shadow: 0 4px 18px rgba(0, 0, 0, 0.05);
            display: flex;
            align-items: center;
            justify-content: space-between;
            transition: transform 0.2s ease, box-shadow 0.2s ease;
        }

        .stat-card:hover {
            transform: translateY(-3px);
            box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08);
        }

        .stat-info .stat-label {
            font-size: 13px;
            font-weight: 500;
            color: #6b7280;
            margin-bottom: 6px;
        }

        .stat-info .stat-value {
            font-size: 30px;
            font-weight: 800;
            color: #111827;
            display: flex;
            align-items: baseline;
            gap: 4px;
        }

        .stat-info .stat-unit {
            font-size: 14px;
            font-weight: 500;
            color: #9ca3af;
        }

        .stat-icon {
            width: 52px;
            height: 52px;
            border-radius: 14px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 26px;
        }

        .stat-icon.total { background: #ecfdf5; color: #059669; }
        .stat-icon.onduty { background: #d1fae5; color: #10b981; }
        .stat-icon.resting { background: #fef3c7; color: #d97706; }
        .stat-icon.dept { background: #e0f2fe; color: #0284c7; }

        /* 检索工具与操作栏 */
        .toolbar-card {
            background: rgba(255, 255, 255, 0.88);
            backdrop-filter: blur(14px);
            -webkit-backdrop-filter: blur(14px);
            border: 1px solid rgba(255, 255, 255, 0.7);
            border-radius: 20px;
            padding: 20px 28px;
            box-shadow: 0 4px 18px rgba(0, 0, 0, 0.05);
            display: flex;
            justify-content: space-between;
            align-items: center;
            flex-wrap: wrap;
            gap: 16px;
        }

        .search-form {
            display: flex;
            align-items: center;
            gap: 12px;
            flex-wrap: wrap;
        }

        .input-box {
            position: relative;
            display: flex;
            align-items: center;
        }

        .input-box input, .input-box select {
            height: 42px;
            padding: 0 16px;
            border-radius: 12px;
            border: 1px solid #d1d5db;
            background: #ffffff;
            font-size: 14px;
            color: #374151;
            outline: none;
            transition: all 0.2s ease;
        }

        .input-box input:focus, .input-box select:focus {
            border-color: #10b981;
            box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.18);
        }

        .input-box select {
            padding-right: 32px;
            cursor: pointer;
        }

        .btn-filter {
            height: 42px;
            padding: 0 20px;
            background: #1f2937;
            color: #ffffff;
            border: none;
            border-radius: 12px;
            font-size: 14px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.2s ease;
        }

        .btn-filter:hover {
            background: #111827;
            transform: translateY(-1px);
        }

        .btn-reset {
            height: 42px;
            padding: 0 16px;
            background: #f3f4f6;
            color: #4b5563;
            border: 1px solid #e5e7eb;
            border-radius: 12px;
            font-size: 14px;
            text-decoration: none;
            display: inline-flex;
            align-items: center;
            transition: all 0.2s ease;
        }

        .btn-reset:hover {
            background: #e5e7eb;
            color: #111827;
        }

        .btn-add-primary {
            height: 42px;
            padding: 0 22px;
            background: linear-gradient(135deg, #10b981, #059669);
            color: #ffffff;
            border: none;
            border-radius: 12px;
            font-size: 14px;
            font-weight: 600;
            display: inline-flex;
            align-items: center;
            gap: 8px;
            cursor: pointer;
            box-shadow: 0 4px 14px rgba(16, 185, 129, 0.35);
            transition: all 0.25s ease;
        }

        .btn-add-primary:hover {
            transform: translateY(-2px);
            box-shadow: 0 6px 20px rgba(16, 185, 129, 0.45);
        }

        /* 维护人员卡片栅格 */
        .maintainer-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(330px, 1fr));
            gap: 24px;
        }

        .maintainer-card {
            background: rgba(255, 255, 255, 0.88);
            backdrop-filter: blur(16px);
            -webkit-backdrop-filter: blur(16px);
            border: 1px solid rgba(255, 255, 255, 0.7);
            border-radius: 20px;
            padding: 24px;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.05);
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            position: relative;
            transition: all 0.28s ease;
        }

        .maintainer-card:hover {
            transform: translateY(-4px);
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.09);
            border-color: rgba(16, 185, 129, 0.3);
        }

        .card-header {
            display: flex;
            align-items: center;
            gap: 16px;
            margin-bottom: 18px;
        }

        .avatar-box {
            width: 58px;
            height: 58px;
            border-radius: 16px;
            background: linear-gradient(135deg, #34d399, #059669);
            color: #ffffff;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 24px;
            font-weight: 700;
            box-shadow: 0 4px 12px rgba(16, 185, 129, 0.28);
            flex-shrink: 0;
        }

        .avatar-box.female {
            background: linear-gradient(135deg, #f472b6, #db2777);
            box-shadow: 0 4px 12px rgba(219, 39, 119, 0.28);
        }

        .header-meta {
            flex: 1;
            min-width: 0;
        }

        .name-row {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 4px;
        }

        .name-row .staff-name {
            font-size: 18px;
            font-weight: 700;
            color: #111827;
        }

        .staff-no-badge {
            background: #f3f4f6;
            color: #4b5563;
            font-size: 11px;
            font-weight: 600;
            padding: 2px 8px;
            border-radius: 6px;
            border: 1px solid #e5e7eb;
        }

        .duty-text {
            font-size: 13px;
            color: #6b7280;
            font-weight: 500;
        }

        .status-badge {
            padding: 4px 12px;
            border-radius: 20px;
            font-size: 12px;
            font-weight: 600;
            display: inline-flex;
            align-items: center;
            gap: 6px;
        }

        .status-badge.onduty {
            background: #d1fae5;
            color: #065f46;
        }

        .status-badge.onduty::before {
            content: '';
            width: 6px;
            height: 6px;
            border-radius: 50%;
            background: #10b981;
            box-shadow: 0 0 6px #10b981;
        }

        .status-badge.resting {
            background: #fef3c7;
            color: #92400e;
        }

        .status-badge.resting::before {
            content: '';
            width: 6px;
            height: 6px;
            border-radius: 50%;
            background: #f59e0b;
        }

        .status-badge.leave {
            background: #f3f4f6;
            color: #6b7280;
        }

        .card-details {
            display: flex;
            flex-direction: column;
            gap: 10px;
            padding: 14px 0;
            border-top: 1px dashed #e5e7eb;
            border-bottom: 1px dashed #e5e7eb;
            margin-bottom: 16px;
            font-size: 13px;
            color: #4b5563;
        }

        .detail-item {
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .detail-item .icon {
            font-size: 14px;
            width: 20px;
            text-align: center;
        }

        .detail-item .value {
            font-weight: 500;
            color: #1f2937;
        }

        .remark-box {
            background: #f9fafb;
            padding: 10px 14px;
            border-radius: 10px;
            font-size: 12px;
            line-height: 1.5;
            color: #6b7280;
            border-left: 3px solid #10b981;
            margin-bottom: 16px;
        }

        .card-footer {
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 8px;
        }

        .btn-view-records {
            flex: 1;
            padding: 8px 12px;
            background: rgba(16, 185, 129, 0.08);
            color: #059669;
            border: 1px solid rgba(16, 185, 129, 0.2);
            border-radius: 10px;
            font-size: 13px;
            font-weight: 600;
            text-decoration: none;
            text-align: center;
            transition: all 0.2s ease;
        }

        .btn-view-records:hover {
            background: #10b981;
            color: #ffffff;
            border-color: #10b981;
        }

        .btn-card-action {
            width: 34px;
            height: 34px;
            border-radius: 10px;
            border: 1px solid #e5e7eb;
            background: #ffffff;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            font-size: 14px;
            transition: all 0.2s ease;
            color: #4b5563;
        }

        .btn-card-action:hover {
            background: #f3f4f6;
            color: #111827;
            transform: translateY(-1px);
        }

        .btn-card-action.delete:hover {
            background: #fee2e2;
            color: #dc2626;
            border-color: #fca5a5;
        }

        .btn-card-action.view:hover {
            background: #e0f2fe;
            color: #0284c7;
            border-color: #7dd3fc;
        }

        /* 员工详情查看组件专属样式 */
        .profile-cover {
            background: linear-gradient(135deg, #10b981 0%, #047857 100%);
            padding: 28px 28px 22px 28px;
            color: #ffffff;
            position: relative;
        }

        .profile-header {
            display: flex;
            align-items: center;
            gap: 18px;
        }

        .profile-avatar {
            width: 68px;
            height: 68px;
            border-radius: 20px;
            background: rgba(255, 255, 255, 0.25);
            backdrop-filter: blur(10px);
            border: 2px solid rgba(255, 255, 255, 0.6);
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 30px;
            font-weight: 800;
            color: #ffffff;
            box-shadow: 0 8px 20px rgba(0, 0, 0, 0.15);
            flex-shrink: 0;
        }

        .profile-avatar.female {
            background: linear-gradient(135deg, #f472b6, #db2777);
            border-color: rgba(255, 255, 255, 0.7);
        }

        .profile-title-box {
            flex: 1;
            min-width: 0;
        }

        .profile-name-row {
            display: flex;
            align-items: center;
            gap: 10px;
            margin-bottom: 6px;
            flex-wrap: wrap;
        }

        .profile-name {
            font-size: 22px;
            font-weight: 800;
            letter-spacing: 0.5px;
        }

        .profile-no {
            background: rgba(255, 255, 255, 0.2);
            padding: 2px 10px;
            border-radius: 8px;
            font-size: 12px;
            font-weight: 600;
            border: 1px solid rgba(255, 255, 255, 0.4);
        }

        .profile-duty {
            font-size: 14px;
            opacity: 0.92;
        }

        .profile-body {
            padding: 26px 28px;
            display: flex;
            flex-direction: column;
            gap: 20px;
            max-height: 65vh;
            overflow-y: auto;
        }

        .info-section-title {
            font-size: 14px;
            font-weight: 700;
            color: #374151;
            margin-bottom: 12px;
            display: flex;
            align-items: center;
            gap: 6px;
        }

        .info-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 12px;
        }

        .info-cell {
            background: #f9fafb;
            border: 1px solid #f3f4f6;
            border-radius: 12px;
            padding: 12px 16px;
            display: flex;
            flex-direction: column;
            gap: 4px;
        }

        .info-cell .label {
            font-size: 12px;
            color: #6b7280;
        }

        .info-cell .value {
            font-size: 14px;
            font-weight: 600;
            color: #111827;
        }

        .specialty-card {
            background: #ecfdf5;
            border: 1px solid #a7f3d0;
            border-radius: 14px;
            padding: 16px 18px;
            color: #065f46;
            font-size: 13px;
            line-height: 1.6;
        }

        .specialty-card strong {
            display: block;
            margin-bottom: 4px;
            color: #047857;
            font-size: 14px;
        }

        /* 空状态提示 */
        .empty-state {
            grid-column: 1 / -1;
            background: rgba(255, 255, 255, 0.85);
            backdrop-filter: blur(16px);
            border-radius: 20px;
            padding: 60px 20px;
            text-align: center;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.05);
        }

        .empty-state .icon {
            font-size: 54px;
            margin-bottom: 16px;
        }

        .empty-state h3 {
            font-size: 18px;
            font-weight: 600;
            color: #374151;
            margin-bottom: 8px;
        }

        .empty-state p {
            font-size: 14px;
            color: #6b7280;
            margin-bottom: 20px;
        }

        /* 模态框 Modal 设计 */
        .modal-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(15, 23, 42, 0.6);
            backdrop-filter: blur(8px);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 999;
            opacity: 0;
            visibility: hidden;
            transition: all 0.3s ease;
            padding: 20px;
        }

        .modal-overlay.show {
            opacity: 1;
            visibility: visible;
        }

        .modal-box {
            background: #ffffff;
            border-radius: 24px;
            width: 100%;
            max-width: 600px;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.2);
            overflow: hidden;
            transform: translateY(20px) scale(0.96);
            transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .modal-overlay.show .modal-box {
            transform: translateY(0) scale(1);
        }

        .modal-header {
            padding: 24px 28px;
            background: linear-gradient(135deg, #10b981, #059669);
            color: #ffffff;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .modal-header h2 {
            font-size: 18px;
            font-weight: 700;
            display: flex;
            align-items: center;
            gap: 10px;
        }

        .modal-close {
            background: rgba(255, 255, 255, 0.2);
            border: none;
            color: #ffffff;
            width: 32px;
            height: 32px;
            border-radius: 50%;
            font-size: 18px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: background 0.2s ease;
        }

        .modal-close:hover {
            background: rgba(255, 255, 255, 0.35);
        }

        .modal-body {
            padding: 28px;
            max-height: 72vh;
            overflow-y: auto;
        }

        .form-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 18px;
        }

        .form-group {
            display: flex;
            flex-direction: column;
            gap: 6px;
        }

        .form-group.full {
            grid-column: 1 / -1;
        }

        .form-label {
            font-size: 13px;
            font-weight: 600;
            color: #374151;
        }

        .form-label span.req {
            color: #ef4444;
            margin-left: 2px;
        }

        .form-control {
            height: 42px;
            padding: 0 14px;
            border-radius: 10px;
            border: 1px solid #d1d5db;
            font-size: 14px;
            color: #111827;
            outline: none;
            transition: all 0.2s ease;
            width: 100%;
        }

        .form-control:focus {
            border-color: #10b981;
            box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.2);
        }

        textarea.form-control {
            height: 80px;
            padding: 10px 14px;
            resize: vertical;
        }

        .modal-footer {
            padding: 18px 28px;
            background: #f9fafb;
            border-top: 1px solid #e5e7eb;
            display: flex;
            justify-content: flex-end;
            gap: 12px;
        }

        .btn-cancel {
            padding: 10px 20px;
            border-radius: 10px;
            border: 1px solid #d1d5db;
            background: #ffffff;
            color: #4b5563;
            font-size: 14px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.2s ease;
        }

        .btn-cancel:hover {
            background: #f3f4f6;
            color: #111827;
        }

        .btn-submit {
            padding: 10px 24px;
            border-radius: 10px;
            border: none;
            background: #10b981;
            color: #ffffff;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            box-shadow: 0 2px 8px rgba(16, 185, 129, 0.35);
            transition: all 0.2s ease;
        }

        .btn-submit:hover {
            background: #059669;
            transform: translateY(-1px);
        }

        @media (max-width: 900px) {
            .stats-grid {
                grid-template-columns: repeat(2, 1fr);
            }
            .form-grid {
                grid-template-columns: 1fr;
            }
        }
    </style>
</head>
<body>

<!-- 顶部导航栏 -->
<header class="navbar">
    <div class="logo-box">
        <div class="logo-icon">🌿</div>
        <div class="logo-title">天府绿化集团 · 人员档案中心</div>
    </div>

    <nav class="nav-actions">
        <button type="button" onclick="goBack()" class="nav-btn" style="cursor: pointer; font-weight: 500;">← 返回上一页</button>
        <a href="QueryServlet" class="nav-btn">🔍 查询绿植</a>
        <a href="addplant.jsp" class="nav-btn">➕ 增加绿植</a>
        <a href="MaintainServlet" class="nav-btn">🛠️ 维护绿植</a>
        <a href="MaintainerServlet" class="nav-btn active">👷 维护人员</a>
        <a href="AssignmentServlet" class="nav-btn">🔗 绿植分配</a>
        <a href="AreaServlet" class="nav-btn">📍 园区网格与标绘</a>
        <a href="index.jsp" class="nav-btn">🏠 系统主页</a>
    </nav>
</header>

<main class="container">

    <!-- 顶部四项统计看板 -->
    <div class="stats-grid">
        <div class="stat-card">
            <div class="stat-info">
                <div class="stat-label">养护人员总数</div>
                <div class="stat-value"><%= totalCount %><span class="stat-unit">位</span></div>
            </div>
            <div class="stat-icon total">👥</div>
        </div>

        <div class="stat-card">
            <div class="stat-info">
                <div class="stat-label">在岗值守技师</div>
                <div class="stat-value"><%= onDutyCount %><span class="stat-unit">位</span></div>
            </div>
            <div class="stat-icon onduty">🟢</div>
        </div>

        <div class="stat-card">
            <div class="stat-info">
                <div class="stat-label">轮休 / 待命中</div>
                <div class="stat-value"><%= restingCount %><span class="stat-unit">位</span></div>
            </div>
            <div class="stat-icon resting">☕</div>
        </div>

        <div class="stat-card">
            <div class="stat-info">
                <div class="stat-label">专业养护班组</div>
                <div class="stat-value"><%= departmentList.size() %><span class="stat-unit">组</span></div>
            </div>
            <div class="stat-icon dept">🏢</div>
        </div>
    </div>

    <!-- 搜索筛选与功能按钮工具栏 -->
    <div class="toolbar-card">
        <form action="MaintainerServlet" method="get" class="search-form">
            <div class="input-box">
                <input type="text" name="keyword" placeholder="搜索姓名/工号/岗位/专长..." value="<%= keyword %>" style="width: 240px;">
            </div>

            <div class="input-box">
                <select name="department">
                    <option value="">全部班组 / 部门</option>
                    <% for (String dept : departmentList) { %>
                        <option value="<%= dept %>" <%= dept.equals(selectedDept) ? "selected" : "" %>><%= dept %></option>
                    <% } %>
                </select>
            </div>

            <div class="input-box">
                <select name="status">
                    <option value="">全部在岗状态</option>
                    <option value="在岗" <%= "在岗".equals(selectedStatus) ? "selected" : "" %>>在岗 (值守中)</option>
                    <option value="轮休" <%= "轮休".equals(selectedStatus) ? "selected" : "" %>>轮休 (休假备勤)</option>
                    <option value="请假" <%= "请假".equals(selectedStatus) ? "selected" : "" %>>请假</option>
                </select>
            </div>

            <button type="submit" class="btn-filter">🔍 筛选过滤</button>
            <a href="MaintainerServlet" class="btn-reset">重置条件</a>
        </form>

        <button type="button" class="btn-add-primary" onclick="openAddModal()">
            ➕ 录入新维护人员
        </button>
    </div>

    <!-- 维护人员档案卡片栅格 -->
    <div class="maintainer-grid">
        <% if (maintainerList.isEmpty()) { %>
            <div class="empty-state">
                <div class="icon">🧑‍🌾</div>
                <h3>暂无符合条件的维护人员档案</h3>
                <p>未找到匹配的技师档案或尚未录入，请尝试更改筛选条件或新建人员。</p>
                <button type="button" class="btn-add-primary" onclick="openAddModal()">
                    ➕ 立即录入第一位维护人员
                </button>
            </div>
        <% } else { %>
            <% for (Maintainer m : maintainerList) { %>
                <%
                    boolean isFemale = "女".equals(m.getGender());
                    String statusClass = "onduty";
                    if ("轮休".equals(m.getStatus())) {
                        statusClass = "resting";
                    } else if ("请假".equals(m.getStatus())) {
                        statusClass = "leave";
                    }
                    String avatarChar = m.getName() != null && m.getName().length() > 0 ? m.getName().substring(0, 1) : "技";
                %>
                <div class="maintainer-card">
                    <div>
                        <!-- 卡片头部信息（点击可直接查看员工详细档案） -->
                        <div class="card-header" style="cursor: pointer;" onclick="openDetailModal(<%= m.getId() %>, '<%= m.getStaffNo() %>', '<%= m.getName() %>', '<%= m.getGender() %>', '<%= m.getPhone() %>', '<%= m.getDepartment() %>', '<%= m.getDuty() %>', '<%= m.getStatus() %>', '<%= m.getEntryDate() %>', '<%= m.getRemark() != null ? m.getRemark().replace("'", "\\'").replace("\r", "").replace("\n", " ") : "" %>')" title="点击查看【<%= m.getName() %>】的详细信息档案">
                            <div class="avatar-box <%= isFemale ? "female" : "" %>">
                                <%= avatarChar %>
                            </div>
                            <div class="header-meta">
                                <div class="name-row">
                                    <span class="staff-name"><%= m.getName() %></span>
                                    <span class="staff-no-badge"><%= m.getStaffNo() %></span>
                                </div>
                                <div class="duty-text"><%= m.getDuty() %> · <%= m.getGender() %></div>
                            </div>
                            <div>
                                <span class="status-badge <%= statusClass %>"><%= m.getStatus() %></span>
                            </div>
                        </div>

                        <!-- 详细属性 -->
                        <div class="card-details">
                            <div class="detail-item">
                                <span class="icon">🏢</span>
                                <span>所属班组：</span>
                                <span class="value"><%= m.getDepartment() %></span>
                            </div>
                            <div class="detail-item">
                                <span class="icon">📞</span>
                                <span>联系电话：</span>
                                <span class="value"><%= m.getPhone() %></span>
                            </div>
                            <div class="detail-item">
                                <span class="icon">📅</span>
                                <span>入职时间：</span>
                                <span class="value"><%= m.getEntryDate() %></span>
                            </div>
                        </div>

                        <!-- 专长备忘 -->
                        <div class="remark-box">
                            <strong>技能专长：</strong><%= m.getRemark() != null && !m.getRemark().trim().isEmpty() ? m.getRemark() : "负责日常养护巡检" %>
                        </div>
                    </div>

                    <!-- 底部操作按钮 -->
                    <div class="card-footer">
                        <!-- 查看员工档案组件按钮 -->
                        <button type="button" class="btn-card-action view" style="color: #0284c7; background: #f0f9ff; border-color: #bae6fd;" title="查看员工详细信息" onclick="openDetailModal(<%= m.getId() %>, '<%= m.getStaffNo() %>', '<%= m.getName() %>', '<%= m.getGender() %>', '<%= m.getPhone() %>', '<%= m.getDepartment() %>', '<%= m.getDuty() %>', '<%= m.getStatus() %>', '<%= m.getEntryDate() %>', '<%= m.getRemark() != null ? m.getRemark().replace("'", "\\'").replace("\r", "").replace("\n", " ") : "" %>')">
                            👁️
                        </button>
                        <!-- 点击联动跳转至该责任人的养护流水 -->
                        <a href="MaintainServlet?keyword=<%= java.net.URLEncoder.encode(m.getName(), "UTF-8") %>" class="btn-view-records" title="查看该人员养护流水">
                            📋 养护记录
                        </a>
                        <button type="button" class="btn-card-action" title="编辑信息" onclick="openEditModal(<%= m.getId() %>, '<%= m.getStaffNo() %>', '<%= m.getName() %>', '<%= m.getGender() %>', '<%= m.getPhone() %>', '<%= m.getDepartment() %>', '<%= m.getDuty() %>', '<%= m.getStatus() %>', '<%= m.getEntryDate() %>', '<%= m.getRemark() != null ? m.getRemark().replace("'", "\\'").replace("\r", "").replace("\n", " ") : "" %>')">
                            ✏️
                        </button>
                        <button type="button" class="btn-card-action delete" title="删除人员" onclick="confirmDelete(<%= m.getId() %>, '<%= m.getName() %>')">
                            🗑️
                        </button>
                    </div>
                </div>
            <% } %>
        <% } %>
    </div>

</main>

<!-- 新增维护人员 模态框 -->
<div class="modal-overlay" id="addModal">
    <div class="modal-box">
        <div class="modal-header">
            <h2>➕ 录入新维护人员档案</h2>
            <button type="button" class="modal-close" onclick="closeAddModal()">×</button>
        </div>
        <form action="AddMaintainerServlet" method="post">
            <div class="modal-body">
                <div class="form-grid">
                    <div class="form-group">
                        <label class="form-label">工号编号 <span class="req">*</span></label>
                        <input type="text" name="staffNo" id="addStaffNo" class="form-control" placeholder="例：WH-1005" required>
                    </div>

                    <div class="form-group">
                        <label class="form-label">人员姓名 <span class="req">*</span></label>
                        <input type="text" name="name" class="form-control" placeholder="例：王师傅" required>
                    </div>

                    <div class="form-group">
                        <label class="form-label">性别</label>
                        <select name="gender" class="form-control">
                            <option value="男">男</option>
                            <option value="女">女</option>
                        </select>
                    </div>

                    <div class="form-group">
                        <label class="form-label">联系电话 <span class="req">*</span></label>
                        <input type="text" name="phone" class="form-control" placeholder="手机号或内线电话" required>
                    </div>

                    <div class="form-group">
                        <label class="form-label">所属班组 / 部门</label>
                        <select name="department" class="form-control">
                            <option value="户外乔木班">户外乔木班</option>
                            <option value="室内绿化组">室内绿化组</option>
                            <option value="综合养护组">综合养护组</option>
                            <option value="植保防治组">植保防治组</option>
                            <option value="水肥管理组">水肥管理组</option>
                        </select>
                    </div>

                    <div class="form-group">
                        <label class="form-label">岗位 / 职务</label>
                        <input type="text" name="duty" class="form-control" placeholder="例：高级园艺师 / 修剪技师" value="绿化养护员">
                    </div>

                    <div class="form-group">
                        <label class="form-label">在岗状态</label>
                        <select name="status" class="form-control">
                            <option value="在岗">在岗 (正常排班)</option>
                            <option value="轮休">轮休 (休假备勤)</option>
                            <option value="请假">请假</option>
                        </select>
                    </div>

                    <div class="form-group">
                        <label class="form-label">入职日期</label>
                        <input type="date" name="entryDate" id="addEntryDate" class="form-control">
                    </div>

                    <div class="form-group full">
                        <label class="form-label">技能专长与工作备忘</label>
                        <textarea name="remark" class="form-control" placeholder="填写负责区域、擅长植物类型或技术资质..."></textarea>
                    </div>
                </div>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn-cancel" onclick="closeAddModal()">取消</button>
                <button type="submit" class="btn-submit">确认保存档案</button>
            </div>
        </form>
    </div>
</div>

<!-- 编辑维护人员 模态框 -->
<div class="modal-overlay" id="editModal">
    <div class="modal-box">
        <div class="modal-header">
            <h2>✏️ 修改维护人员档案</h2>
            <button type="button" class="modal-close" onclick="closeEditModal()">×</button>
        </div>
        <form action="UpdateMaintainerServlet" method="post">
            <input type="hidden" name="id" id="editId">
            <div class="modal-body">
                <div class="form-grid">
                    <div class="form-group">
                        <label class="form-label">工号编号 <span class="req">*</span></label>
                        <input type="text" name="staffNo" id="editStaffNo" class="form-control" required>
                    </div>

                    <div class="form-group">
                        <label class="form-label">人员姓名 <span class="req">*</span></label>
                        <input type="text" name="name" id="editName" class="form-control" required>
                    </div>

                    <div class="form-group">
                        <label class="form-label">性别</label>
                        <select name="gender" id="editGender" class="form-control">
                            <option value="男">男</option>
                            <option value="女">女</option>
                        </select>
                    </div>

                    <div class="form-group">
                        <label class="form-label">联系电话 <span class="req">*</span></label>
                        <input type="text" name="phone" id="editPhone" class="form-control" required>
                    </div>

                    <div class="form-group">
                        <label class="form-label">所属班组 / 部门</label>
                        <select name="department" id="editDepartment" class="form-control">
                            <option value="户外乔木班">户外乔木班</option>
                            <option value="室内绿化组">室内绿化组</option>
                            <option value="综合养护组">综合养护组</option>
                            <option value="植保防治组">植保防治组</option>
                            <option value="水肥管理组">水肥管理组</option>
                        </select>
                    </div>

                    <div class="form-group">
                        <label class="form-label">岗位 / 职务</label>
                        <input type="text" name="duty" id="editDuty" class="form-control">
                    </div>

                    <div class="form-group">
                        <label class="form-label">在岗状态</label>
                        <select name="status" id="editStatus" class="form-control">
                            <option value="在岗">在岗 (正常排班)</option>
                            <option value="轮休">轮休 (休假备勤)</option>
                            <option value="请假">请假</option>
                        </select>
                    </div>

                    <div class="form-group">
                        <label class="form-label">入职日期</label>
                        <input type="date" name="entryDate" id="editEntryDate" class="form-control">
                    </div>

                    <div class="form-group full">
                        <label class="form-label">技能专长与工作备忘</label>
                        <textarea name="remark" id="editRemark" class="form-control"></textarea>
                    </div>
                </div>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn-cancel" onclick="closeEditModal()">取消</button>
                <button type="submit" class="btn-submit">保存更新修改</button>
            </div>
        </form>
    </div>
</div>

<!-- 查看员工档案详情组件 模态框 -->
<div class="modal-overlay" id="detailModal">
    <div class="modal-box" style="max-width: 580px;">
        <div class="profile-cover">
            <button type="button" class="modal-close" style="position: absolute; top: 20px; right: 20px;" onclick="closeDetailModal()">×</button>
            <div class="profile-header">
                <div class="profile-avatar" id="detailAvatar">技</div>
                <div class="profile-title-box">
                    <div class="profile-name-row">
                        <span class="profile-name" id="detailName">张师傅</span>
                        <span class="profile-no" id="detailStaffNo">WH-1001</span>
                        <span class="status-badge onduty" id="detailStatusBadge" style="margin-left: auto;">在岗</span>
                    </div>
                    <div class="profile-duty" id="detailDutyHeader">高级园艺师 · 男</div>
                </div>
            </div>
        </div>

        <div class="profile-body">
            <div>
                <div class="info-section-title">📌 员工基本人事档案</div>
                <div class="info-grid">
                    <div class="info-cell">
                        <span class="label">所属班组 / 部门</span>
                        <span class="value" id="detailDepartment">户外乔木班</span>
                    </div>
                    <div class="info-cell">
                        <span class="label">岗位职责 / 职级</span>
                        <span class="value" id="detailDuty">高级园艺师</span>
                    </div>
                    <div class="info-cell">
                        <span class="label">联系电话</span>
                        <span class="value" id="detailPhone">13800138001</span>
                    </div>
                    <div class="info-cell">
                        <span class="label">入职时间</span>
                        <span class="value" id="detailEntryDate">2023-05-10</span>
                    </div>
                </div>
            </div>

            <div>
                <div class="info-section-title">🌟 技能专长与工作备忘</div>
                <div class="specialty-card">
                    <strong>技术资质与管护领域</strong>
                    <div id="detailRemark">负责日常养护作业与巡查</div>
                </div>
            </div>
        </div>

        <div class="modal-footer" style="justify-content: space-between; align-items: center;">
            <a href="#" id="detailRecordLink" class="nav-btn btn-secondary" style="color: #059669; font-weight: 600; border-color: #10b981; font-size: 13px;">
                📋 查看该员工养护台账
            </a>
            <div style="display: flex; gap: 10px;">
                <button type="button" class="btn-cancel" onclick="closeDetailModal()">关闭</button>
                <button type="button" class="btn-submit" id="detailEditBtn">✏️ 编辑修改档案</button>
            </div>
        </div>
    </div>
</div>

<script>
    // 自动默认今天日期
    const todayStr = new Date().toISOString().split('T')[0];
    document.getElementById('addEntryDate').value = todayStr;

    function openAddModal() {
        // 生成默认工号建议
        const randomNo = Math.floor(1000 + Math.random() * 9000);
        document.getElementById('addStaffNo').value = 'WH-' + randomNo;
        document.getElementById('addModal').classList.add('show');
    }

    function closeAddModal() {
        document.getElementById('addModal').classList.remove('show');
    }

    function openEditModal(id, staffNo, name, gender, phone, department, duty, status, entryDate, remark) {
        document.getElementById('editId').value = id;
        document.getElementById('editStaffNo').value = staffNo;
        document.getElementById('editName').value = name;
        document.getElementById('editGender').value = gender;
        document.getElementById('editPhone').value = phone;
        document.getElementById('editDepartment').value = department;
        document.getElementById('editDuty').value = duty;
        document.getElementById('editStatus').value = status;
        document.getElementById('editEntryDate').value = entryDate;
        document.getElementById('editRemark').value = remark;

        document.getElementById('editModal').classList.add('show');
    }

    function closeEditModal() {
        document.getElementById('editModal').classList.remove('show');
    }

    // 查看员工信息组件控制
    function openDetailModal(id, staffNo, name, gender, phone, department, duty, status, entryDate, remark) {
        document.getElementById('detailAvatar').innerText = name ? name.substring(0, 1) : '员';
        if (gender === '女') {
            document.getElementById('detailAvatar').classList.add('female');
        } else {
            document.getElementById('detailAvatar').classList.remove('female');
        }

        document.getElementById('detailName').innerText = name;
        document.getElementById('detailStaffNo').innerText = staffNo;
        document.getElementById('detailDutyHeader').innerText = (duty || '养护员') + ' · ' + (gender || '男');
        document.getElementById('detailDepartment').innerText = department || '未分配';
        document.getElementById('detailDuty').innerText = duty || '绿化养护员';
        document.getElementById('detailPhone').innerText = phone || '暂无电话';
        document.getElementById('detailEntryDate').innerText = entryDate || '暂未登记';
        document.getElementById('detailRemark').innerText = remark && remark.trim().length > 0 ? remark : '该员工暂未登记详细技能专长备忘。';

        // 状态徽标设置
        const badge = document.getElementById('detailStatusBadge');
        badge.innerText = status;
        let badgeClass = 'onduty';
        if (status === '轮休') badgeClass = 'resting';
        else if (status === '请假') badgeClass = 'leave';
        badge.className = 'status-badge ' + badgeClass;

        // 养护记录直达链接
        document.getElementById('detailRecordLink').href = 'MaintainServlet?keyword=' + encodeURIComponent(name);

        // 弹窗内的“编辑修改”按钮交互
        document.getElementById('detailEditBtn').onclick = function() {
            closeDetailModal();
            openEditModal(id, staffNo, name, gender, phone, department, duty, status, entryDate, remark);
        };

        document.getElementById('detailModal').classList.add('show');
    }

    function closeDetailModal() {
        document.getElementById('detailModal').classList.remove('show');
    }

    function confirmDelete(id, name) {
        if (confirm('确定要注销并删除维护人员【' + name + '】的档案吗？此操作无法撤销。')) {
            window.location.href = 'DeleteMaintainerServlet?id=' + id;
        }
    }

    function goBack() {
        if (document.referrer && document.referrer.indexOf(window.location.host) !== -1) {
            window.history.back();
        } else {
            window.location.href = 'index.jsp';
        }
    }

    // 点击蒙层关闭弹窗
    window.onclick = function(event) {
        const addModal = document.getElementById('addModal');
        const editModal = document.getElementById('editModal');
        const detailModal = document.getElementById('detailModal');
        if (event.target === addModal) {
            closeAddModal();
        }
        if (event.target === editModal) {
            closeEditModal();
        }
        if (event.target === detailModal) {
            closeDetailModal();
        }
    }
</script>

</body>
</html>
