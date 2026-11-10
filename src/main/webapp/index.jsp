<%@ page contentType="text/html; charset=UTF-8" pageEncoding="UTF-8" %>
<%@ page import="DB.DBTools, org.example.demo1.*, java.util.*" %>
<%
    AdminUser currentUser = (AdminUser) session.getAttribute("adminUser");
    String currentRole = currentUser == null ? "" : currentUser.getRoleCode();
    String currentDisplayName = currentUser != null ? currentUser.getDisplayName() : "校区养护专员";
    boolean isPlantAdmin = "PLANT_ADMIN".equals(currentRole);
    boolean isSystemAdmin = "SYSTEM_ADMIN".equals(currentRole) || "SUPER_ADMIN".equals(currentRole) || "ADMIN".equals(currentRole);

    // 采用高并发单例初始化的 DBTools，告别每次刷新页面重复执行 DDL
    DBTools dbTools = new DBTools();
    int plantCount = dbTools.getPlantCount();
    int animalSpeciesCount = dbTools.getAnimalSpeciesCount();
    int totalAnimalCount = dbTools.getTotalAnimalCount();
    int maintainerCount = dbTools.getMaintainerCount();
    int maintenanceCount = dbTools.getMaintenanceCount();
    int duePlantCount = dbTools.getDuePlantCount();
    int unassignedPlantCount = dbTools.getUnassignedPlantCount();
    List<PlantReminder> reminderList = dbTools.queryPlantReminders(7);

    // 获取最新养护流水记录
    List<PlantMaintenance> allMaintenance = dbTools.queryAllMaintenance(null, null);
    List<PlantMaintenance> recentMaintenance = (allMaintenance != null && allMaintenance.size() > 5)
            ? allMaintenance.subList(0, 5)
            : allMaintenance;

    // 获取最新绿化系统公告 (直连 system_notice)
    List<SystemNotice> noticeList = dbTools.queryRecentNotices(3);

    // 聚合 ECharts 可视化图表数据
    List<Plant> allPlants = dbTools.queryAllPlants();
    List<PlantArea> allAreas = dbTools.queryAllAreas();

    Map<String, Integer> typeCountMap = new LinkedHashMap<>();
    if (allPlants != null) {
        for (Plant p : allPlants) {
            String t = (p.getPtype() != null && !p.getPtype().trim().isEmpty()) ? p.getPtype().trim() : "其他";
            typeCountMap.put(t, typeCountMap.getOrDefault(t, 0) + 1);
        }
    }
    StringBuilder typeJson = new StringBuilder("[");
    boolean firstT = true;
    for (Map.Entry<String, Integer> entry : typeCountMap.entrySet()) {
        if (!firstT) typeJson.append(",");
        typeJson.append("{\"name\":\"").append(entry.getKey()).append("\",\"value\":").append(entry.getValue()).append("}");
        firstT = false;
    }
    typeJson.append("]");

    // 提取校园重点绿植单株估值排行 (按单株价值从高到低排序，100% 真实非零数据)
    List<Plant> valuationPlants = new ArrayList<>();
    if (allPlants != null) {
        valuationPlants.addAll(allPlants);
        valuationPlants.sort((a, b) -> Integer.compare(b.getPprice(), a.getPprice()));
    }
    StringBuilder plantNamesJson = new StringBuilder("[");
    StringBuilder plantPricesJson = new StringBuilder("[");
    int valLimit = Math.min(valuationPlants.size(), 7);
    for (int i = 0; i < valLimit; i++) {
        Plant p = valuationPlants.get(i);
        if (i > 0) {
            plantNamesJson.append(",");
            plantPricesJson.append(",");
        }
        String shortName = p.getPname() != null ? p.getPname() : "绿植#" + p.getPid();
        if (shortName.length() > 6) shortName = shortName.substring(0, 6) + "..";
        plantNamesJson.append("\"").append(shortName).append("\"");
        plantPricesJson.append(p.getPprice());
    }
    plantNamesJson.append("]");
    plantPricesJson.append("]");
%>
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>天府智能绿化系统 - 校园数字孪生与运维仪表盘</title>
    <!-- 引入现代化字体与 ECharts 图表库 -->
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
    <script src="https://cdnjs.cloudflare.com/ajax/libs/echarts/5.4.3/echarts.min.js"></script>
    <style>
        :root {
            --primary: #059669;
            --primary-hover: #047857;
            --primary-light: #ecfdf5;
            --dark: #0f172a;
            --gray-600: #475569;
            --gray-400: #94a3b8;
            --glass-bg: rgba(255, 255, 255, 0.90);
            --glass-card: rgba(255, 255, 255, 0.93);
            --glass-border: rgba(255, 255, 255, 0.85);
            --shadow-card: 0 12px 32px -4px rgba(15, 23, 42, 0.12), 0 0 1px 1px rgba(255, 255, 255, 0.8) inset;
            --shadow-hover: 0 20px 40px -6px rgba(5, 150, 105, 0.22), 0 0 1px 1px #ffffff inset;
            --radius-md: 16px;
            --radius-lg: 22px;
        }

        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        html, body {
            width: 100%;
            min-height: 100%;
            font-family: 'Plus Jakarta Sans', "Microsoft YaHei", -apple-system, sans-serif;
            color: var(--dark);
        }

        body {
            /* 保证学校实景背景完整铺满，固定视差 */
            background: url("bj.png") no-repeat center top fixed;
            background-size: cover;
            overflow-x: hidden;
            overflow-y: auto;
            display: flex;
            flex-direction: column;
        }

        /* 顶部通透毛玻璃导航条 */
        .navbar {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 0 36px;
            height: 68px;
            background: rgba(255, 255, 255, 0.84);
            backdrop-filter: blur(16px);
            -webkit-backdrop-filter: blur(16px);
            border-bottom: 1px solid rgba(255, 255, 255, 0.6);
            box-shadow: 0 4px 20px rgba(15, 23, 42, 0.06);
            position: sticky;
            top: 0;
            z-index: 1000;
        }

        .logo-box {
            display: flex;
            align-items: center;
            gap: 12px;
            text-decoration: none;
            color: inherit;
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
            font-size: 19px;
            box-shadow: 0 4px 12px rgba(16, 185, 129, 0.35);
        }

        .logo-title {
            font-size: 19px;
            font-weight: 800;
            color: #0f172a;
            letter-spacing: 0.5px;
        }

        .logo-badge {
            background: #d1fae5;
            color: #065f46;
            font-size: 11px;
            font-weight: 700;
            padding: 2px 8px;
            border-radius: 6px;
            margin-left: 4px;
        }

        /* 导航操作按钮组 */
        .nav-actions {
            display: flex;
            align-items: center;
            gap: 10px;
        }

        .nav-btn {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 7px 16px;
            border-radius: 20px;
            font-size: 13.5px;
            font-weight: 600;
            text-decoration: none;
            transition: all 0.22s ease;
            cursor: pointer;
            border: 1px solid transparent;
        }

        .btn-primary {
            background: linear-gradient(135deg, #10b981, #059669);
            color: #ffffff;
            box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
        }
        .btn-primary:hover {
            background: linear-gradient(135deg, #059669, #047857);
            transform: translateY(-1px);
            box-shadow: 0 6px 16px rgba(16, 185, 129, 0.4);
        }

        .btn-secondary {
            background-color: rgba(255, 255, 255, 0.88);
            color: #334155;
            border-color: rgba(226, 232, 240, 0.9);
        }
        .btn-secondary:hover {
            background-color: #ffffff;
            color: #059669;
            border-color: #10b981;
            transform: translateY(-1px);
        }

        .btn-user {
            background-color: rgba(241, 245, 249, 0.92);
            color: #334155;
            border-color: #cbd5e1;
        }

        /* 主仪表盘容器 */
        .dashboard-container {
            max-width: 1240px;
            width: 100%;
            margin: 28px auto 48px;
            padding: 0 24px;
            display: flex;
            flex-direction: column;
            gap: 24px;
        }

        /* 顶部问候与校训 Banner 卡片 */
        .hero-banner {
            background: var(--glass-card);
            backdrop-filter: blur(18px);
            -webkit-backdrop-filter: blur(18px);
            border-radius: var(--radius-lg);
            padding: 24px 32px;
            border: 1px solid var(--glass-border);
            box-shadow: var(--shadow-card);
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 20px;
            position: relative;
            overflow: hidden;
        }
        .hero-banner::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            width: 6px;
            height: 100%;
            background: linear-gradient(to bottom, #10b981, #059669);
        }
        .hero-content h1 {
            font-size: 24px;
            font-weight: 800;
            color: #0f172a;
            display: flex;
            align-items: center;
            gap: 10px;
        }
        .hero-content p {
            margin-top: 6px;
            color: #64748b;
            font-size: 14px;
            line-height: 1.5;
        }
        .hero-motto {
            text-align: right;
            border-left: 2px solid #e2e8f0;
            padding-left: 24px;
            flex-shrink: 0;
        }
        .motto-cn {
            font-size: 20px;
            font-weight: 800;
            color: #065f46;
            letter-spacing: 2px;
        }
        .motto-sub {
            font-size: 12px;
            color: #64748b;
            margin-top: 4px;
        }

        /* 6 大核心数据指标卡片 Grid */
        .metric-grid {
            display: grid;
            grid-template-columns: repeat(6, 1fr);
            gap: 16px;
        }
        .metric-card {
            background: var(--glass-card);
            backdrop-filter: blur(16px);
            -webkit-backdrop-filter: blur(16px);
            border-radius: var(--radius-md);
            padding: 22px 20px;
            border: 1px solid var(--glass-border);
            box-shadow: var(--shadow-card);
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            transition: all 0.28s cubic-bezier(0.16, 1, 0.3, 1);
            position: relative;
            overflow: hidden;
            cursor: pointer;
            text-decoration: none;
            color: inherit;
        }
        .metric-card:hover {
            transform: translateY(-4px);
            box-shadow: var(--shadow-hover);
            border-color: #6ee7b7;
        }
        .metric-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            color: #64748b;
            font-size: 13px;
            font-weight: 600;
        }
        .metric-icon-bubble {
            width: 38px;
            height: 38px;
            border-radius: 12px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 18px;
        }
        .metric-number {
            font-size: 34px;
            font-weight: 800;
            line-height: 1.1;
            margin: 14px 0 4px;
        }
        .metric-footer {
            font-size: 12px;
            color: #94a3b8;
            display: flex;
            align-items: center;
            gap: 4px;
        }

        /* 个性化指标颜色 */
        .card-plant .metric-number { color: #059669; }
        .card-plant .metric-icon-bubble { background: #ecfdf5; color: #059669; }

        .card-animal .metric-number { color: #0284c7; }
        .card-animal .metric-icon-bubble { background: #e0f2fe; color: #0284c7; }

        .card-maintainer .metric-number { color: #0284c7; }
        .card-maintainer .metric-icon-bubble { background: #e0f2fe; color: #0284c7; }

        .card-log .metric-number { color: #7c3aed; }
        .card-log .metric-icon-bubble { background: #f3e8ff; color: #7c3aed; }

        .card-due .metric-number { color: <%= duePlantCount > 0 ? "#dc2626" : "#059669" %>; }
        .card-due .metric-icon-bubble { background: <%= duePlantCount > 0 ? "#fef2f2" : "#ecfdf5" %>; }

        .card-unassigned .metric-number { color: #d97706; }
        .card-unassigned .metric-icon-bubble { background: #fef3c7; color: #d97706; }

        /* 双栏布局区：系统快捷入口 + 智能预警 / 实时流水 + 系统通知 */
        .dashboard-body-grid {
            display: grid;
            grid-template-columns: 1fr 1.1fr;
            gap: 20px;
        }

        .content-panel {
            background: var(--glass-card);
            backdrop-filter: blur(16px);
            -webkit-backdrop-filter: blur(16px);
            border-radius: var(--radius-lg);
            padding: 26px;
            border: 1px solid var(--glass-border);
            box-shadow: var(--shadow-card);
            display: flex;
            flex-direction: column;
            gap: 16px;
        }

        .panel-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding-bottom: 12px;
            border-bottom: 1px solid rgba(226, 232, 240, 0.8);
        }
        .panel-title {
            font-size: 17px;
            font-weight: 700;
            color: #0f172a;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        /* 快捷功能卡片列表 */
        .quick-nav-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 12px;
        }
        .quick-link-card {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 14px 16px;
            border-radius: var(--radius-md);
            background: #ffffff;
            border: 1px solid #e2e8f0;
            text-decoration: none;
            color: #1e293b;
            transition: all 0.22s ease;
            box-shadow: 0 2px 6px rgba(15, 23, 42, 0.02);
        }
        .quick-link-card:hover {
            border-color: #10b981;
            transform: translateY(-2px);
            box-shadow: 0 8px 20px rgba(5, 150, 105, 0.12);
            background: #f0fdf4;
        }
        .quick-link-icon {
            width: 40px;
            height: 40px;
            border-radius: 10px;
            background: #f8fafc;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 20px;
            flex-shrink: 0;
        }
        .quick-link-card:hover .quick-link-icon {
            background: #ffffff;
            box-shadow: 0 2px 8px rgba(16, 185, 129, 0.2);
        }
        .quick-link-title {
            font-size: 14px;
            font-weight: 700;
            color: #0f172a;
        }
        .quick-link-desc {
            font-size: 11.5px;
            color: #64748b;
            margin-top: 2px;
        }

        /* 养护智能提醒任务列表 */
        .reminder-list {
            display: flex;
            flex-direction: column;
            gap: 10px;
            max-height: 290px;
            overflow-y: auto;
        }
        .reminder-item {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 12px 16px;
            border-radius: 12px;
            background: #fffbeb;
            border: 1px solid #fef3c7;
            font-size: 13px;
            gap: 12px;
        }
        .quick-care-btn {
            padding: 4px 10px;
            background: linear-gradient(135deg, #10b981, #059669);
            color: #ffffff;
            border: none;
            border-radius: 8px;
            font-size: 11.5px;
            font-weight: 700;
            cursor: pointer;
            transition: all 0.2s ease;
            box-shadow: 0 2px 6px rgba(5, 150, 105, 0.25);
            white-space: nowrap;
        }
        .quick-care-btn:hover {
            background: #047857;
            transform: scale(1.05);
        }
        .reminder-item.empty {
            background: #f0fdf4;
            border-color: #bbf7d0;
            color: #166534;
            padding: 24px;
            text-align: center;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 8px;
            font-size: 14px;
            font-weight: 600;
        }

        /* 最新养护流水列表项 */
        .log-item {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 12px 16px;
            border-radius: 12px;
            background: #ffffff;
            border: 1px solid #e2e8f0;
            font-size: 13px;
            transition: all 0.2s ease;
        }
        .log-item:hover {
            border-color: #cbd5e1;
            background: #f8fafc;
        }
        .log-badge {
            display: inline-block;
            padding: 2px 8px;
            border-radius: 6px;
            font-size: 11px;
            font-weight: 700;
        }
        .badge-green { background: #d1fae5; color: #065f46; }
        .badge-blue { background: #e0f2fe; color: #0369a1; }
        .badge-purple { background: #f3e8ff; color: #7e22ce; }

        /* 公告项 */
        .notice-card {
            padding: 14px 16px;
            border-radius: 12px;
            background: #ffffff;
            border: 1px solid #e2e8f0;
            display: flex;
            flex-direction: column;
            gap: 6px;
        }
        .notice-title-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
        }
        .notice-title {
            font-size: 13.5px;
            font-weight: 700;
            color: #0f172a;
        }
        .notice-content {
            font-size: 12px;
            color: #64748b;
            line-height: 1.5;
        }

        /* 数据库透明度声明卡片 */
        .db-schema-banner {
            background: rgba(255, 255, 255, 0.88);
            backdrop-filter: blur(16px);
            border-radius: var(--radius-md);
            padding: 18px 24px;
            border: 1px solid var(--glass-border);
            display: flex;
            align-items: center;
            justify-content: space-between;
            font-size: 13px;
            color: #475569;
        }
        .schema-tags {
            display: flex;
            align-items: center;
            gap: 8px;
            flex-wrap: wrap;
        }
        .schema-tag {
            background: #e2e8f0;
            color: #334155;
            padding: 3px 10px;
            border-radius: 6px;
            font-family: monospace;
            font-size: 12px;
            font-weight: 600;
        }

        @media (max-width: 1080px) {
            .metric-grid { grid-template-columns: repeat(3, 1fr); }
            .dashboard-body-grid { grid-template-columns: 1fr; }
            .hero-banner { flex-direction: column; align-items: flex-start; }
            .hero-motto { border-left: none; padding-left: 0; text-align: left; }
        }
        @media (max-width: 640px) {
            .metric-grid { grid-template-columns: 1fr 1fr; }
            .quick-nav-grid { grid-template-columns: 1fr; }
            .navbar { padding: 0 18px; }
        }
    </style>
</head>
<body>

<header class="navbar">
    <a href="index.jsp" class="logo-box">
        <div class="logo-icon">🌿</div>
        <div>
            <span class="logo-title">天府智能绿化系统</span>
            <span class="logo-badge">数字校园总览</span>
        </div>
    </a>

    <nav class="nav-actions">
        <a href="ecohome.jsp" class="nav-btn btn-secondary" style="border-color:#34d399;color:#047857;font-weight:700;" title="返回 3D 虚拟生态主页">🌱 生态主页</a>
        <a href="AreaServlet" class="nav-btn btn-primary">📍 园区网格与植株标绘</a>
        <a href="QueryServlet" class="nav-btn btn-secondary">🔍 绿植档案 (一树一码)</a>
        <a href="AnimalServlet" class="nav-btn btn-secondary" style="border-color:#bbf7d0;color:#166534;font-weight:700;">🐾 校园生态动物</a>
        <a href="MaintainServlet" class="nav-btn btn-secondary">🛠️ 维护记录</a>
        <a href="ExportServlet?action=report" class="nav-btn btn-secondary" style="border-color:#38bdf8;color:#0284c7;font-weight:700;">📄 总体综合报告</a>
        <% if (isPlantAdmin) { %>
            <a href="addplant.jsp" class="nav-btn btn-secondary" style="border-color:#10b981;color:#059669;font-weight:700;">➕ 增加绿植</a>
        <% } %>
        <% if (isSystemAdmin) { %>
            <a href="AdminDashboardServlet" class="nav-btn btn-secondary" style="border-color:#38bdf8;color:#0284c7;font-weight:700;">🛡️ 系统后台</a>
            <a href="MaintainerServlet" class="nav-btn btn-secondary">👷 养护团队</a>
        <% } %>
        <% if (currentUser == null) { %>
            <a href="login.jsp" class="nav-btn btn-user">🔐 管理员登录</a>
        <% } else { %>
            <span class="nav-btn btn-user" style="border-color:<%= isPlantAdmin ? "#10b981" : "#0284c7" %>; font-weight:600;">
                <%= isPlantAdmin ? "🌿 植物管理员: " : (isSystemAdmin ? "⚙️ 系统管理员: " : "👤 ") %><%= currentUser.getDisplayName() %>
            </span>
            <a href="LogoutServlet" class="nav-btn btn-secondary" style="color:#dc2626;">退出</a>
        <% } %>
    </nav>
</header>

<main class="dashboard-container">

    <!-- 顶部欢迎与校训 Hero Banner -->
    <section class="hero-banner">
        <div class="hero-content">
            <h1><span>🌿</span> 智慧校园绿化数字运营与养护中枢</h1>
            <p>实时直连 MySQL (plant 数据库)，汇聚西南财经大学天府学院绿植档案、养护员、维保记录与智能提醒，打开即可全面掌控校园生态数据。</p>
        </div>
        <div class="hero-motto">
            <div class="motto-cn">崇文尚武 · 敏思践行</div>
            <div class="motto-sub">学生职业发展为目标 · 综合能力提升为主线</div>
        </div>
    </section>

    <!-- 6 大核心运营指标卡片 (100% 数据库实时直连) -->
    <section class="metric-grid">
        <a href="QueryServlet" class="metric-card card-plant" title="点击查看所有绿植档案">
            <div class="metric-header">
                <span>绿植总株数 (plant)</span>
                <div class="metric-icon-bubble">🌿</div>
            </div>
            <div class="metric-number"><%= plantCount %></div>
            <div class="metric-footer"><span>重点监护古树与名木</span></div>
        </a>

        <a href="AnimalServlet" class="metric-card card-animal" title="点击查看校园伴生生态动物">
            <div class="metric-header">
                <span>生态动物作物 (animal)</span>
                <div class="metric-icon-bubble">🦢</div>
            </div>
            <div class="metric-number"><%= animalSpeciesCount %><span style="font-size:16px;color:#64748b;font-weight:600;"> 类 (<%= totalAnimalCount %>)</span></div>
            <div class="metric-footer"><span>黑天鹅/锦鲤/松鼠等</span></div>
        </a>

        <a href="MaintainerServlet" class="metric-card card-maintainer" title="点击管理养护人员">
            <div class="metric-header">
                <span>责任养护员 (maintainer)</span>
                <div class="metric-icon-bubble">👷</div>
            </div>
            <div class="metric-number"><%= maintainerCount %></div>
            <div class="metric-footer"><span>专业校园维保队伍</span></div>
        </a>

        <a href="MaintainServlet" class="metric-card card-log" title="点击查看养护台账">
            <div class="metric-header">
                <span>累计养护台账 (maintenance)</span>
                <div class="metric-icon-bubble">📋</div>
            </div>
            <div class="metric-number"><%= maintenanceCount %></div>
            <div class="metric-footer"><span>浇水/修剪/施肥记录</span></div>
        </a>

        <a href="MaintainServlet" class="metric-card card-due" title="点击查看需养护绿植">
            <div class="metric-header">
                <span>到期养护绿植</span>
                <div class="metric-icon-bubble">⏰</div>
            </div>
            <div class="metric-number"><%= duePlantCount %></div>
            <div class="metric-footer"><span style="color:<%= duePlantCount > 0 ? "#dc2626" : "#059669" %>;"><%= duePlantCount > 0 ? "需尽快组织养护" : "目前状态均良好" %></span></div>
        </a>

        <a href="AssignmentServlet" class="metric-card card-unassigned" title="点击分配绿植">
            <div class="metric-header">
                <span>待分配人员/区域</span>
                <div class="metric-icon-bubble">📍</div>
            </div>
            <div class="metric-number"><%= unassignedPlantCount %></div>
            <div class="metric-footer"><span>待指派责任人管理</span></div>
        </a>
    </section>

    <!-- 校园绿化态势数据孪生大屏与可视化分析 (ECharts) -->
    <section style="display: grid; grid-template-columns: 1fr 1.25fr; gap: 20px; margin-bottom: 24px;">
        <div class="content-panel" style="min-height: 350px;">
            <div class="panel-header">
                <div class="panel-title"><span>📊</span> 校园绿植品类结构分布</div>
                <span style="font-size:12px;color:#64748b;">实时生态占比</span>
            </div>
            <div id="plantTypeChart" style="width: 100%; height: 280px;"></div>
        </div>
        <div class="content-panel" style="min-height: 350px;">
            <div class="panel-header">
                <div class="panel-title"><span>🌲</span> 校园重点绿植单株估值排行 (元)</div>
                <span style="font-size:12px;color:#64748b;">单株资产档案</span>
            </div>
            <div id="plantValuationChart" style="width: 100%; height: 280px;"></div>
        </div>
    </section>

    <!-- 业务快捷操作 + 智能提醒看板 -->
    <section class="dashboard-body-grid">
        
        <!-- 业务快捷直达入口 -->
        <div class="content-panel">
            <div class="panel-header">
                <div class="panel-title"><span>⚡</span> 业务快捷直达</div>
                <span style="font-size:12px;color:#64748b;">一键进入各个管理业务系统</span>
            </div>
            <div class="quick-nav-grid">
                <a href="AreaServlet" class="quick-link-card" style="border: 1.5px solid #10b981; background: linear-gradient(135deg, #ecfdf5 0%, #ffffff 100%); grid-column: span 2;">
                    <div class="quick-link-icon" style="background:#dcfce7;color:#15803d;font-size:22px;">🌳📍</div>
                    <div>
                        <div class="quick-link-title" style="color:#15803d;font-size:14.5px;">园区网格与植株智能标绘中心 <span style="font-size:10.5px;background:#bbf7d0;color:#166534;padding:2px 8px;border-radius:10px;font-weight:700;">高德地图·绵阳校区实景标绘</span></div>
                        <div class="quick-link-desc" style="color:#065f46;">高德卫星与矢量地图实景呈现，点选落点标绘、图钉自由拖拽自动持久化、一树一档全景档案与周期预警、责任网格围栏划定与派工</div>
                    </div>
                </a>
                <a href="QueryServlet" class="quick-link-card">
                    <div class="quick-link-icon">🔍</div>
                    <div>
                        <div class="quick-link-title">绿植档案查询</div>
                        <div class="quick-link-desc">品类/编号/区域全景检索</div>
                    </div>
                </a>
                <% if (isPlantAdmin) { %>
                    <a href="addplant.jsp" class="quick-link-card" style="border: 1.5px solid #10b981;">
                        <div class="quick-link-icon" style="background:#ecfdf5;color:#059669;">➕</div>
                        <div>
                            <div class="quick-link-title" style="color:#059669;">录入新增绿植 <span style="font-size:11px;background:#d1fae5;color:#065f46;padding:2px 6px;border-radius:4px;font-weight:700;">🌿 植物管理员</span></div>
                            <div class="quick-link-desc">建档立卡、设定养护周期与点位</div>
                        </div>
                    </a>
                <% } else if (isSystemAdmin) { %>
                    <div class="quick-link-card" style="opacity:0.68;cursor:not-allowed;background:rgba(241,245,249,0.75);" title="系统管理员专职负责系统运维，无权直接增添植物档案">
                        <div class="quick-link-icon" style="background:#f1f5f9;color:#94a3b8;">🔒</div>
                        <div>
                            <div class="quick-link-title" style="color:#64748b;">录入新增绿植 <span style="font-size:11px;background:#fee2e2;color:#991b1b;padding:2px 6px;border-radius:4px;font-weight:600;">需植物管理员</span></div>
                            <div class="quick-link-desc" style="color:#94a3b8;">系统管理员无权操作（请换植物管理员）</div>
                        </div>
                    </div>
                <% } else { %>
                    <a href="login.jsp" class="quick-link-card">
                        <div class="quick-link-icon">➕</div>
                        <div>
                            <div class="quick-link-title">录入新增绿植 <span style="font-size:11px;background:#d1fae5;color:#065f46;padding:2px 6px;border-radius:4px;">需登录</span></div>
                            <div class="quick-link-desc">植物管理员专享操作</div>
                        </div>
                    </a>
                <% } %>
                <a href="MaintainServlet" class="quick-link-card">
                    <div class="quick-link-icon">🛠️</div>
                    <div>
                        <div class="quick-link-title">绿植养护台账</div>
                        <div class="quick-link-desc">灌溉/修剪/施肥历史记录</div>
                    </div>
                </a>
                <% if (isSystemAdmin) { %>
                    <a href="MaintainerServlet" class="quick-link-card" style="border: 1.5px solid #0284c7;">
                        <div class="quick-link-icon" style="background:#e0f2fe;color:#0284c7;">👷</div>
                        <div>
                            <div class="quick-link-title" style="color:#0284c7;">养护人员管理 <span style="font-size:11px;background:#e0f2fe;color:#0369a1;padding:2px 6px;border-radius:4px;font-weight:700;">⚙️ 系统管理员</span></div>
                            <div class="quick-link-desc">工号/联系电话/人员档案</div>
                        </div>
                    </a>
                <% } else if (isPlantAdmin) { %>
                    <div class="quick-link-card" style="opacity:0.68;cursor:not-allowed;background:rgba(241,245,249,0.75);" title="植物管理员负责植物业务，无权修改人员档案与网格区域">
                        <div class="quick-link-icon" style="background:#f1f5f9;color:#94a3b8;">🔒</div>
                        <div>
                            <div class="quick-link-title" style="color:#64748b;">养护人员管理 <span style="font-size:11px;background:#fee2e2;color:#991b1b;padding:2px 6px;border-radius:4px;font-weight:600;">需系统管理员</span></div>
                            <div class="quick-link-desc" style="color:#94a3b8;">植物管理员无权操作（仅系统管理员可用）</div>
                        </div>
                    </div>
                <% } else { %>
                    <a href="MaintainerServlet" class="quick-link-card">
                        <div class="quick-link-icon">👷</div>
                        <div>
                            <div class="quick-link-title">养护人员管理</div>
                            <div class="quick-link-desc">工号/联系电话/人员档案</div>
                        </div>
                    </a>
                    <a href="AreaServlet" class="quick-link-card">
                        <div class="quick-link-icon">📍</div>
                        <div>
                            <div class="quick-link-title">校园区域管理</div>
                            <div class="quick-link-desc">时代广场/康养学院分区</div>
                        </div>
                    </a>
                <% } %>
                <a href="AnimalServlet" class="quick-link-card" style="border: 1.5px solid #0284c7; background: #f0f9ff;">
                    <div class="quick-link-icon" style="background:#e0f2fe;color:#0284c7;font-size:22px;">🐾</div>
                    <div>
                        <div class="quick-link-title" style="color:#0284c7;">校园生态动物作物档案</div>
                        <div class="quick-link-desc">黑天鹅/锦鲤/松鼠/孔雀饲护巡检</div>
                    </div>
                </a>
                <a href="ExportServlet?action=report" class="quick-link-card" style="border: 1.5px solid #059669; background: #f0fdf4;">
                    <div class="quick-link-icon" style="background:#dcfce7;color:#059669;font-size:22px;">📄</div>
                    <div>
                        <div class="quick-link-title" style="color:#059669;">下载总体运行报告 (Word文档)</div>
                        <div class="quick-link-desc">动植物清单与水肥药养护综合报告</div>
                    </div>
                </a>
                <a href="AssignmentServlet" class="quick-link-card" style="grid-column: span 2;">
                    <div class="quick-link-icon">🔗</div>
                    <div>
                        <div class="quick-link-title">分配养护员负责绿植</div>
                        <div class="quick-link-desc">责任到人，指派养护员分包负责校园具体绿植点位</div>
                    </div>
                </a>
            </div>
        </div>

        <!-- 养护智能预警与任务提醒 -->
        <div class="content-panel">
            <div class="panel-header">
                <div class="panel-title"><span>🤖</span> 养护智能提醒看板</div>
                <span style="font-size:12px;color:#64748b;">未来 7 天内到期或已逾期的任务 (实时计算)</span>
            </div>

            <div class="reminder-list">
                <% if (reminderList == null || reminderList.isEmpty()) { %>
                    <div class="reminder-item empty">
                        <span style="font-size:32px;">🌱</span>
                        <div><strong>校园生态运转良好！</strong></div>
                        <div style="font-weight:400;color:#047857;font-size:12.5px;">未来 7 天内无临期或逾期的浇水、修剪任务，所有绿植均健康生长。</div>
                    </div>
                <% } else {
                    for (PlantReminder reminder : reminderList) {
                %>
                    <div class="reminder-item">
                        <div style="display:flex;align-items:center;gap:8px;">
                            <span style="font-size:16px;">⚠️</span>
                            <div>
                                <strong><%= reminder.getPlantName() %></strong>
                                <span style="color:#d97706;font-weight:700;margin-left:4px;"><%= reminder.getTaskType() %></span>
                            </div>
                        </div>
                        <div style="display:flex;align-items:center;gap:10px;">
                            <div style="text-align:right;">
                                <div style="color:#dc2626;font-weight:700;"><%= reminder.getDueDate() %></div>
                                <div style="color:#64748b;font-size:11.5px;">责任人：<%= reminder.getMaintainerName() == null ? "待分配" : reminder.getMaintainerName() %></div>
                            </div>
                            <button type="button" class="quick-care-btn" 
                                    onclick="quickCare('<%= reminder.getPid() %>', '<%= reminder.getPlantName().replace("'", "\\'") %>', '<%= reminder.getTaskType() %>')">
                                ⚡ 一键打卡
                            </button>
                        </div>
                    </div>
                <% }} %>
            </div>
        </div>

    </section>

    <!-- 实时养护流水 + 校园绿化公告通知 (均100%直连 MySQL) -->
    <section class="dashboard-body-grid">
        
        <!-- 最新养护动态流水 -->
        <div class="content-panel">
            <div class="panel-header">
                <div class="panel-title"><span>📋</span> 最新养护作业流水 (plant_maintenance)</div>
                <a href="MaintainServlet" style="font-size:12.5px;color:#059669;text-decoration:none;font-weight:700;">全部台账 &gt;</a>
            </div>

            <div style="display:flex;flex-direction:column;gap:10px;">
                <% if (recentMaintenance == null || recentMaintenance.isEmpty()) { %>
                    <div style="text-align:center;padding:24px;color:#94a3b8;font-size:13px;">暂无维护记录，点击上方【绿植养护台账】即可添加</div>
                <% } else {
                    for (PlantMaintenance pm : recentMaintenance) {
                %>
                    <div class="log-item">
                        <div style="display:flex;align-items:center;gap:10px;">
                            <span class="log-badge <%= "修剪".equals(pm.getMtype()) ? "badge-purple" : "浇水".equals(pm.getMtype()) ? "badge-blue" : "badge-green" %>"><%= pm.getMtype() %></span>
                            <div>
                                <span style="font-weight:700;color:#0f172a;"><%= pm.getPname() == null ? pm.getPid() : pm.getPname() %></span>
                                <span style="font-size:12px;color:#64748b;margin-left:6px;">由 <%= pm.getOperator() %> 执行</span>
                            </div>
                        </div>
                        <div style="text-align:right;font-size:12px;color:#94a3b8;">
                            <div><%= pm.getMdate() %></div>
                            <div style="color:#059669;font-weight:600;"><%= pm.getHealthStatus() %></div>
                        </div>
                    </div>
                <% }} %>
            </div>
        </div>

        <!-- 校园绿化公告通知 -->
        <div class="content-panel">
            <div class="panel-header">
                <div class="panel-title"><span>📢</span> 校园绿化通知与公告 (system_notice)</div>
                <span style="font-size:12px;color:#64748b;">实时通知</span>
            </div>

            <div style="display:flex;flex-direction:column;gap:10px;">
                <% if (noticeList.isEmpty()) { %>
                    <div style="text-align:center;padding:24px;color:#94a3b8;font-size:13px;">暂无绿化公告</div>
                <% } else {
                    for (SystemNotice notice : noticeList) {
                %>
                    <div class="notice-card">
                        <div class="notice-title-row">
                            <span class="notice-title"><%= notice.getTitle() %></span>
                            <span class="log-badge <%= "重要".equals(notice.getPriority()) ? "badge-purple" : "badge-green" %>"><%= notice.getCategory() %> · <%= notice.getPriority() %></span>
                        </div>
                        <div class="notice-content"><%= notice.getContent() %></div>
                        <div style="display:flex;justify-content:space-between;font-size:11.5px;color:#94a3b8;margin-top:2px;">
                            <span>发布单位：<%= notice.getPublisher() %></span>
                            <span><%= notice.getPublishDate() %></span>
                        </div>
                    </div>
                <% }} %>
            </div>
        </div>

    </section>

    <!-- 数据库表单体系透明度声明栏 -->
    <section class="db-schema-banner">
        <div style="display:flex;align-items:center;gap:10px;">
            <span style="font-size:20px;">🗄️</span>
            <div>
                <strong>MySQL 数据库 (plant) 已全面直连并自动初始化 9 大业务管理表单体系：</strong>
                <div style="font-size:12px;color:#64748b;margin-top:2px;">包含动植物作物档案、外键关联、自增主键、维保流水、系统公告及天府学院初始网格化点位配置</div>
            </div>
        </div>
        <div class="schema-tags">
            <span class="schema-tag">plant (绿植档案)</span>
            <span class="schema-tag" style="background:#e0f2fe;color:#0284c7;font-weight:700;">animal (生态动物)</span>
            <span class="schema-tag">maintainer (养护员)</span>
            <span class="schema-tag">plant_maintenance (维保台账)</span>
            <span class="schema-tag">plant_area (网格区域)</span>
            <span class="schema-tag">maintainer_plant (分包关系)</span>
            <span class="schema-tag">admin_user (管理员)</span>
            <span class="schema-tag">type (字典分类)</span>
            <span class="schema-tag">system_notice (系统公告)</span>
        </div>
    </section>

</main>

<script>
    // 1. 初始化全校绿植品类结构图表 (ECharts 环形玫瑰图)
    try {
        var typeChartDom = document.getElementById('plantTypeChart');
        if (typeChartDom && typeof echarts !== 'undefined') {
            var typeChart = echarts.init(typeChartDom);
            var typeData = <%= typeJson.toString() %>;
            typeChart.setOption({
                tooltip: { trigger: 'item', formatter: '{b}: {c} 株 ({d}%)' },
                legend: { bottom: '0%', left: 'center', itemWidth: 10, itemHeight: 10, textStyle: { fontSize: 11 } },
                series: [
                    {
                        name: '绿植品类',
                        type: 'pie',
                        radius: ['35%', '68%'],
                        center: ['50%', '42%'],
                        roseType: 'radius',
                        itemStyle: { borderRadius: 6, borderColor: '#fff', borderWidth: 2 },
                        label: { show: false },
                        emphasis: { label: { show: true, fontSize: 12, fontWeight: 'bold' } },
                        data: typeData
                    }
                ]
            });
            window.addEventListener('resize', function() { typeChart.resize(); });
        }
    } catch(e) { console.error('ECharts typeChart error:', e); }

    // 2. 初始化校园重点绿植单株估值排行 (ECharts 渐变柱状图 - 100% 真实数据)
    try {
        var valuationChartDom = document.getElementById('plantValuationChart');
        if (valuationChartDom && typeof echarts !== 'undefined') {
            var valuationChart = echarts.init(valuationChartDom);
            var plantNames = <%= plantNamesJson.toString() %>;
            var plantPrices = <%= plantPricesJson.toString() %>;
            valuationChart.setOption({
                tooltip: {
                    trigger: 'axis',
                    axisPointer: { type: 'shadow' },
                    formatter: function(params) {
                        var p = params[0];
                        return p.name + '<br/>单株资产估值: <strong>¥' + p.value + '</strong> 元';
                    }
                },
                grid: { top: '14%', left: '3%', right: '4%', bottom: '8%', containLabel: true },
                xAxis: {
                    type: 'category',
                    data: plantNames,
                    axisLabel: { interval: 0, fontSize: 11, color: '#475569' }
                },
                yAxis: {
                    type: 'value',
                    name: '估值 (元)',
                    axisLabel: { color: '#64748b', formatter: '¥{value}' }
                },
                series: [{
                    name: '单株估值',
                    type: 'bar',
                    barWidth: '38%',
                    itemStyle: {
                        borderRadius: [6, 6, 0, 0],
                        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                            { offset: 0, color: '#0ea5e9' },
                            { offset: 1, color: '#0284c7' }
                        ])
                    },
                    label: {
                        show: true,
                        position: 'top',
                        formatter: '¥{c}',
                        fontSize: 11,
                        color: '#0284c7',
                        fontWeight: 'bold'
                    },
                    data: plantPrices
                }]
            });
            window.addEventListener('resize', function() { valuationChart.resize(); });
        }
    } catch(e) { console.error('ECharts valuationChart error:', e); }

    // 3. 首页预警中心一键快捷打卡函数
    function quickCare(pid, name, mtype) {
        if (!confirm('确认完成【' + name + '】的' + mtype + '养护打卡吗？\n系统将自动生成一条养护台账，并智能顺延下一个预警周期。')) {
            return;
        }
        var formData = new URLSearchParams();
        formData.append('action', 'quickCare');
        formData.append('pid', pid);
        formData.append('pname', name);
        formData.append('mtype', mtype);
        formData.append('operator', '<%= currentDisplayName %>');

        fetch('AddMaintenanceServlet', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
                'X-Requested-With': 'XMLHttpRequest'
            },
            body: formData.toString()
        })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                alert('🎉 ' + data.message);
                window.location.reload();
            } else {
                alert('⚠️ ' + data.message);
            }
        })
        .catch(err => {
            alert('打卡请求异常: ' + err);
        });
    }
</script>

<!-- 🌿 引入 AI 绿化数字宠物【小天】 -->
<%@ include file="ai_pet_widget.jsp" %>

</body>
</html>
