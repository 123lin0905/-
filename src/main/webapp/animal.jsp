<%@ page contentType="text/html; charset=UTF-8" pageEncoding="UTF-8" %>
<%@ page import="java.util.List, org.example.demo1.Animal, org.example.demo1.PlantArea, org.example.demo1.Maintainer, org.example.demo1.AdminUser" %>
<%
    if (request.getAttribute("animalList") == null) {
        response.sendRedirect("AnimalServlet");
        return;
    }
    List<Animal> animalList = (List<Animal>) request.getAttribute("animalList");
    List<PlantArea> areaList = (List<PlantArea>) request.getAttribute("areaList");
    List<Maintainer> maintainerList = (List<Maintainer>) request.getAttribute("maintainerList");
    Integer totalSpecies = (Integer) request.getAttribute("totalSpecies");
    Integer totalCount = (Integer) request.getAttribute("totalCount");
    Integer dueFeedingCount = (Integer) request.getAttribute("dueFeedingCount");
    String keyword = (String) request.getAttribute("keyword");
    String selectedCategory = (String) request.getAttribute("category");

    if (totalSpecies == null) totalSpecies = 0;
    if (totalCount == null) totalCount = 0;
    if (dueFeedingCount == null) dueFeedingCount = 0;
    if (keyword == null) keyword = "";
    if (selectedCategory == null) selectedCategory = "";

    AdminUser currentUser = (AdminUser) session.getAttribute("adminUser");
    String roleCode = currentUser != null ? currentUser.getRoleCode() : "";
%>
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>天府智能绿化系统 - 校园生态动物与生物多样性档案</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
    <style>
        :root {
            --primary: #059669;
            --primary-hover: #047857;
            --primary-light: #ecfdf5;
            --dark: #0f172a;
            --gray-600: #475569;
            --gray-400: #94a3b8;
            --glass-bg: rgba(255, 255, 255, 0.88);
            --glass-card: rgba(255, 255, 255, 0.94);
            --glass-border: rgba(255, 255, 255, 0.85);
            --shadow-card: 0 12px 32px -4px rgba(15, 23, 42, 0.12), 0 0 1px 1px rgba(255, 255, 255, 0.8) inset;
            --shadow-hover: 0 20px 40px -6px rgba(5, 150, 105, 0.22);
            --radius-md: 16px;
            --radius-lg: 22px;
        }

        * { margin: 0; padding: 0; box-sizing: border-box; }

        body {
            min-height: 100vh;
            font-family: 'Plus Jakarta Sans', "Microsoft YaHei", -apple-system, sans-serif;
            background: url("bj.png") no-repeat center top fixed;
            background-size: cover;
            color: var(--dark);
            padding-bottom: 60px;
        }

        /* 顶部毛玻璃导航条 */
        .navbar {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 0 36px;
            height: 68px;
            background: rgba(255, 255, 255, 0.86);
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
            background: #dcfce7;
            color: #15803d;
            font-size: 11px;
            font-weight: 700;
            padding: 2px 8px;
            border-radius: 6px;
            margin-left: 4px;
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
            padding: 7px 16px;
            border-radius: 20px;
            font-size: 13.5px;
            font-weight: 600;
            text-decoration: none;
            transition: all 0.22s ease;
            cursor: pointer;
            border: 1px solid transparent;
            background-color: rgba(255, 255, 255, 0.9);
            color: #334155;
            border-color: rgba(226, 232, 240, 0.9);
        }
        .nav-btn:hover {
            background-color: #ffffff;
            color: #059669;
            border-color: #10b981;
            transform: translateY(-1px);
        }
        .nav-btn.btn-primary {
            background: linear-gradient(135deg, #10b981, #059669);
            color: #ffffff;
            border: none;
            box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
        }
        .nav-btn.btn-primary:hover {
            background: linear-gradient(135deg, #059669, #047857);
            color: #ffffff;
        }

        /* 主容器 */
        .container {
            max-width: 1280px;
            margin: 28px auto 0;
            padding: 0 24px;
            display: flex;
            flex-direction: column;
            gap: 22px;
        }

        /* 顶部横幅 */
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
            position: relative;
            overflow: hidden;
        }
        .hero-banner::before {
            content: '';
            position: absolute;
            top: 0; left: 0;
            width: 6px; height: 100%;
            background: linear-gradient(to bottom, #3b82f6, #059669);
        }
        .hero-title {
            font-size: 22px;
            font-weight: 800;
            color: #0f172a;
            display: flex;
            align-items: center;
            gap: 10px;
        }
        .hero-subtitle {
            margin-top: 6px;
            color: #64748b;
            font-size: 13.5px;
            line-height: 1.5;
        }

        /* 统计卡片网格 */
        .metric-grid {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 16px;
        }
        .metric-card {
            background: var(--glass-card);
            backdrop-filter: blur(16px);
            border-radius: var(--radius-md);
            padding: 20px 22px;
            border: 1px solid var(--glass-border);
            box-shadow: var(--shadow-card);
            display: flex;
            align-items: center;
            justify-content: space-between;
        }
        .metric-info h5 {
            font-size: 13px;
            color: #64748b;
            font-weight: 600;
        }
        .metric-info .num {
            font-size: 30px;
            font-weight: 800;
            color: #0f172a;
            margin-top: 4px;
        }
        .metric-icon-box {
            width: 48px;
            height: 48px;
            border-radius: 14px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 22px;
            background: #f0fdf4;
            color: #059669;
        }

        /* 工具栏与检索筛选 */
        .toolbar-panel {
            background: var(--glass-card);
            backdrop-filter: blur(16px);
            border-radius: var(--radius-md);
            padding: 18px 24px;
            border: 1px solid var(--glass-border);
            box-shadow: var(--shadow-card);
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 16px;
            flex-wrap: wrap;
        }
        .search-group {
            display: flex;
            align-items: center;
            gap: 10px;
            flex: 1;
            max-width: 650px;
        }
        .search-input {
            flex: 1;
            padding: 9px 16px;
            border: 1.5px solid #cbd5e1;
            border-radius: 12px;
            font-size: 13.5px;
            background: #ffffff;
            outline: none;
            transition: all 0.2s;
        }
        .search-input:focus {
            border-color: #10b981;
            box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.15);
        }
        .filter-select {
            padding: 9px 14px;
            border: 1.5px solid #cbd5e1;
            border-radius: 12px;
            font-size: 13.5px;
            background: #ffffff;
            outline: none;
            cursor: pointer;
        }

        /* 动物卡片网格 */
        .animal-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(380px, 1fr));
            gap: 20px;
        }
        .animal-card {
            background: var(--glass-card);
            backdrop-filter: blur(16px);
            border-radius: var(--radius-md);
            border: 1px solid var(--glass-border);
            box-shadow: var(--shadow-card);
            padding: 22px;
            display: flex;
            flex-direction: column;
            gap: 14px;
            transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
            position: relative;
            overflow: hidden;
        }
        .animal-card:hover {
            transform: translateY(-4px);
            box-shadow: var(--shadow-hover);
            border-color: #6ee7b7;
        }
        .card-top {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: 12px;
        }
        .animal-avatar {
            width: 52px;
            height: 52px;
            border-radius: 16px;
            background: linear-gradient(135deg, #e0f2fe, #bae6fd);
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 26px;
            box-shadow: 0 4px 10px rgba(2, 132, 199, 0.15);
            flex-shrink: 0;
        }
        .animal-main-info {
            flex: 1;
        }
        .animal-name {
            font-size: 17px;
            font-weight: 800;
            color: #0f172a;
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .animal-species {
            font-size: 12px;
            font-style: italic;
            color: #64748b;
            margin-top: 2px;
        }
        .badge {
            display: inline-block;
            padding: 3px 9px;
            border-radius: 6px;
            font-size: 11px;
            font-weight: 700;
        }
        .badge-green { background: #d1fae5; color: #065f46; }
        .badge-blue { background: #e0f2fe; color: #0284c7; }
        .badge-amber { background: #fef3c7; color: #d97706; }
        .badge-purple { background: #f3e8ff; color: #7e22ce; }

        .animal-meta-table {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 8px 12px;
            background: #f8fafc;
            padding: 12px 14px;
            border-radius: 12px;
            border: 1px solid #e2e8f0;
            font-size: 12.5px;
        }
        .meta-row {
            display: flex;
            flex-direction: column;
            gap: 2px;
        }
        .meta-label {
            color: #94a3b8;
            font-size: 11px;
            font-weight: 600;
        }
        .meta-val {
            color: #1e293b;
            font-weight: 700;
        }

        .animal-remark-box {
            font-size: 12px;
            color: #64748b;
            line-height: 1.5;
            background: #ffffff;
            padding: 10px 12px;
            border-radius: 10px;
            border: 1px dashed #cbd5e1;
        }

        .card-actions {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 8px;
            padding-top: 6px;
            border-top: 1px solid #f1f5f9;
        }
        .action-btn {
            padding: 6px 12px;
            border-radius: 8px;
            font-size: 12px;
            font-weight: 700;
            cursor: pointer;
            border: 1px solid transparent;
            transition: all 0.2s;
            display: inline-flex;
            align-items: center;
            gap: 4px;
        }
        .btn-feed {
            background: linear-gradient(135deg, #10b981, #059669);
            color: #ffffff;
            box-shadow: 0 2px 8px rgba(16, 185, 129, 0.25);
        }
        .btn-feed:hover {
            transform: scale(1.03);
            background: #047857;
        }
        .btn-edit {
            background: #f1f5f9;
            color: #334155;
            border-color: #cbd5e1;
        }
        .btn-edit:hover {
            background: #e2e8f0;
            color: #0f172a;
        }
        .btn-del {
            background: #fff1f2;
            color: #e11d48;
            border-color: #fecdd3;
        }
        .btn-del:hover {
            background: #ffe4e6;
        }

        /* 模态弹窗 */
        .modal-overlay {
            position: fixed;
            top: 0; left: 0;
            width: 100%; height: 100%;
            background: rgba(15, 23, 42, 0.6);
            backdrop-filter: blur(8px);
            z-index: 9999;
            display: none;
            align-items: center;
            justify-content: center;
            padding: 20px;
        }
        .modal-card {
            background: #ffffff;
            border-radius: 20px;
            max-width: 600px;
            width: 100%;
            box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
            overflow: hidden;
            border: 1px solid rgba(226, 232, 240, 0.8);
            animation: modalFadeIn 0.25s ease-out;
        }
        @keyframes modalFadeIn {
            from { opacity: 0; transform: scale(0.96) translateY(10px); }
            to { opacity: 1; transform: scale(1) translateY(0); }
        }
        .modal-header {
            padding: 18px 24px;
            border-bottom: 1px solid #e2e8f0;
            display: flex;
            align-items: center;
            justify-content: space-between;
            background: #f8fafc;
        }
        .modal-header h3 {
            font-size: 17px;
            font-weight: 800;
            color: #0f172a;
        }
        .modal-body {
            padding: 24px;
            max-height: 72vh;
            overflow-y: auto;
            display: flex;
            flex-direction: column;
            gap: 16px;
        }
        .form-row {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 14px;
        }
        .form-group {
            display: flex;
            flex-direction: column;
            gap: 6px;
        }
        .form-group label {
            font-size: 12.5px;
            font-weight: 700;
            color: #334155;
        }
        .form-control {
            padding: 9px 14px;
            border: 1.5px solid #cbd5e1;
            border-radius: 10px;
            font-size: 13.5px;
            outline: none;
            transition: all 0.2s;
        }
        .form-control:focus {
            border-color: #10b981;
            box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.15);
        }
        .modal-footer {
            padding: 16px 24px;
            border-top: 1px solid #e2e8f0;
            display: flex;
            align-items: center;
            justify-content: flex-end;
            gap: 10px;
            background: #f8fafc;
        }

        @media (max-width: 900px) {
            .metric-grid { grid-template-columns: 1fr 1fr; }
            .animal-grid { grid-template-columns: 1fr; }
        }
    </style>
</head>
<body>

<header class="navbar">
    <a href="index.jsp" class="logo-box">
        <div class="logo-icon">🌿</div>
        <div>
            <span class="logo-title">天府智能绿化系统</span>
            <span class="logo-badge">生态多样性</span>
        </div>
    </a>

    <nav class="nav-actions">
        <a href="index.jsp" class="nav-btn">🏠 首页仪表盘</a>
        <a href="AreaServlet" class="nav-btn">📍 园区网格标绘</a>
        <a href="QueryServlet" class="nav-btn">🔍 绿植档案</a>
        <a href="AnimalServlet" class="nav-btn btn-primary">🐾 校园生态动物</a>
        <a href="MaintainServlet" class="nav-btn">🛠️ 维保流水</a>
        <a href="ExportServlet?action=report" class="nav-btn" style="border-color:#38bdf8;color:#0284c7;font-weight:700;">📄 总体综合报告</a>
        <% if (currentUser == null) { %>
            <a href="login.jsp" class="nav-btn">🔐 登录</a>
        <% } else { %>
            <span class="nav-btn" style="font-weight:600;background:#f1f5f9;">👤 <%= currentUser.getDisplayName() %></span>
            <a href="LogoutServlet" class="nav-btn" style="color:#dc2626;">退出</a>
        <% } %>
    </nav>
</header>

<main class="container">

    <!-- 顶部 Banner -->
    <section class="hero-banner">
        <div>
            <h1 class="hero-title"><span>🐾</span> 校园伴生与人工保育生态动物作物总览</h1>
            <p class="hero-subtitle">
                西南财经大学天府学院生态校园数字档案：涵盖天府湖水域天鹅、锦鲤群落、伴生松鼠、观赏孔雀等动物种群，
                记录健康状况、栖息网格、食性饲料配比与日常巡检投喂周期。
            </p>
        </div>
        <div>
            <button type="button" class="nav-btn btn-primary" onclick="openAddModal()" style="font-size:14px;padding:9px 18px;">
                ➕ 录入新作物动物
            </button>
        </div>
    </section>

    <!-- 统计指标卡片 -->
    <section class="metric-grid">
        <div class="metric-card">
            <div class="metric-info">
                <h5>生态动物种群品类</h5>
                <div class="num" style="color:#059669;"><%= totalSpecies %> <span style="font-size:15px;color:#94a3b8;font-weight:600;">类</span></div>
            </div>
            <div class="metric-icon-box">🐾</div>
        </div>
        <div class="metric-card">
            <div class="metric-info">
                <h5>全校动物个体存栏总数</h5>
                <div class="num" style="color:#0284c7;"><%= totalCount %> <span style="font-size:15px;color:#94a3b8;font-weight:600;">只/尾</span></div>
            </div>
            <div class="metric-icon-box" style="background:#e0f2fe;color:#0284c7;">🦢</div>
        </div>
        <div class="metric-card">
            <div class="metric-info">
                <h5>今日待巡检/投喂批次</h5>
                <div class="num" style="color:<%= dueFeedingCount > 0 ? "#dc2626" : "#059669" %>;"><%= dueFeedingCount %> <span style="font-size:15px;color:#94a3b8;font-weight:600;">个</span></div>
            </div>
            <div class="metric-icon-box" style="background:<%= dueFeedingCount > 0 ? "#fef2f2" : "#ecfdf5" %>;color:<%= dueFeedingCount > 0 ? "#dc2626" : "#059669" %>;">🍗</div>
        </div>
        <div class="metric-card">
            <div class="metric-info">
                <h5>生态覆盖网格分布</h5>
                <div class="num" style="color:#7c3aed;">5 <span style="font-size:15px;color:#94a3b8;font-weight:600;">大园区</span></div>
            </div>
            <div class="metric-icon-box" style="background:#f3e8ff;color:#7c3aed;">📍</div>
        </div>
    </section>

    <!-- 搜索筛选工具栏 -->
    <section class="toolbar-panel">
        <form action="AnimalServlet" method="get" class="search-group">
            <input type="text" name="keyword" class="search-input" value="<%= keyword %>" placeholder="输入动物名称、编号、学名、栖息区域或责任人...">
            <select name="category" class="filter-select" onchange="this.form.submit()">
                <option value="全部" <%= "全部".equals(selectedCategory) || selectedCategory.isEmpty() ? "selected" : "" %>>全部品类</option>
                <option value="水禽鸟类" <%= "水禽鸟类".equals(selectedCategory) ? "selected" : "" %>>🦢 水禽鸟类</option>
                <option value="观赏鱼类" <%= "观赏鱼类".equals(selectedCategory) ? "selected" : "" %>>🐟 观赏鱼类</option>
                <option value="林栖哺乳类" <%= "林栖哺乳类".equals(selectedCategory) ? "selected" : "" %>>🐿️ 林栖哺乳类</option>
                <option value="陆禽鸟类" <%= "陆禽鸟类".equals(selectedCategory) ? "selected" : "" %>>🦚 陆禽鸟类</option>
                <option value="两栖类" <%= "两栖类".equals(selectedCategory) ? "selected" : "" %>>🐸 两栖类</option>
            </select>
            <button type="submit" class="action-btn btn-feed" style="padding:9px 16px;border-radius:12px;">🔍 检索</button>
            <% if (!keyword.isEmpty() || (!selectedCategory.isEmpty() && !"全部".equals(selectedCategory))) { %>
                <a href="AnimalServlet" class="action-btn btn-edit" style="padding:9px 12px;border-radius:12px;text-decoration:none;">重置</a>
            <% } %>
        </form>

        <div style="display:flex;align-items:center;gap:10px;">
            <a href="ExportServlet?action=report" class="action-btn btn-edit" style="padding:9px 14px;border-radius:12px;text-decoration:none;font-weight:700;color:#0284c7;border-color:#bae6fd;">
                📥 导出动植物综合报告
            </a>
            <button type="button" class="action-btn btn-feed" style="padding:9px 16px;border-radius:12px;" onclick="openAddModal()">
                ➕ 增加新作物动物
            </button>
        </div>
    </section>

    <!-- 动物档案卡片列表 -->
    <section class="animal-grid">
        <% if (animalList == null || animalList.isEmpty()) { %>
            <div style="grid-column: 1 / -1; text-align: center; padding: 60px 20px; background: rgba(255,255,255,0.9); border-radius: 18px; border: 1px solid #e2e8f0;">
                <div style="font-size: 42px; margin-bottom: 12px;">🐾</div>
                <h3 style="font-size: 17px; color: #334155;">暂无匹配的生态动物档案</h3>
                <p style="font-size: 13px; color: #94a3b8; margin-top: 6px;">您可以点击右上角“➕ 录入新作物动物”添加第一笔校园动物记录，或者直接呼叫右下角小天让它帮您添加哦！</p>
            </div>
        <% } else {
            for (Animal a : animalList) {
                String emoji = "🐾";
                if ("水禽鸟类".equals(a.getCategory())) emoji = "🦢";
                else if ("观赏鱼类".equals(a.getCategory())) emoji = "🐟";
                else if ("林栖哺乳类".equals(a.getCategory())) emoji = "🐿️";
                else if ("陆禽鸟类".equals(a.getCategory())) emoji = "🦚";
                else if ("两栖类".equals(a.getCategory())) emoji = "🐸";
        %>
            <div class="animal-card">
                <div class="card-top">
                    <div class="animal-avatar"><%= emoji %></div>
                    <div class="animal-main-info">
                        <div class="animal-name">
                            <span><%= a.getName() %></span>
                            <span class="badge <%= "健康活泼".equals(a.getHealthStatus()) ? "badge-green" : ("重点观察".equals(a.getHealthStatus()) ? "badge-amber" : "badge-blue") %>">
                                <%= a.getHealthStatus() %>
                            </span>
                        </div>
                        <div class="animal-species"><%= a.getSpecies() != null ? a.getSpecies() : "未录入学名" %> · 编号: <%= a.getAnimalNo() %></div>
                    </div>
                    <div style="text-align: right;">
                        <span class="badge badge-purple"><%= a.getCategory() %></span>
                        <div style="font-size: 12px; color: #059669; font-weight: 800; margin-top: 4px;">数量: <%= a.getCount() %></div>
                    </div>
                </div>

                <div class="animal-meta-table">
                    <div class="meta-row">
                        <span class="meta-label">📍 栖息观测区域</span>
                        <span class="meta-val"><%= a.getAreaName() != null ? a.getAreaName() : "全校生态区" %></span>
                    </div>
                    <div class="meta-row">
                        <span class="meta-label">👤 专职保育责任人</span>
                        <span class="meta-val"><%= a.getKeeperName() != null ? a.getKeeperName() : "绿化中心" %></span>
                    </div>
                    <div class="meta-row">
                        <span class="meta-label">🌾 食性与饲护配比</span>
                        <span class="meta-val" title="<%= a.getDietType() %>"><%= a.getDietType() != null ? a.getDietType() : "配合饲料" %></span>
                    </div>
                    <div class="meta-row">
                        <span class="meta-label">⏰ 下次投喂/巡查</span>
                        <span class="meta-val" style="color: #0284c7;"><%= a.getNextFeedingDate() != null ? a.getNextFeedingDate() : "每日巡查" %></span>
                    </div>
                </div>

                <% if (a.getRemark() != null && !a.getRemark().trim().isEmpty()) { %>
                    <div class="animal-remark-box">
                        <strong>💡 习性与档案说明：</strong><%= a.getRemark() %>
                    </div>
                <% } %>

                <div class="card-actions">
                    <div style="font-size: 11.5px; color: #94a3b8;">
                        周期: 每 <%= a.getFeedingCycleDays() %> 天 1 次
                    </div>
                    <div style="display:flex; gap:6px;">
                        <button type="button" class="action-btn btn-feed" onclick="quickFeed(<%= a.getId() %>, '<%= a.getName() %>')">
                            🍗 投喂打卡
                        </button>
                        <button type="button" class="action-btn btn-edit" onclick='openEditModal(<%= a.getId() %>, "<%= a.getAnimalNo() %>", "<%= a.getName() %>", "<%= a.getSpecies() != null ? a.getSpecies() : "" %>", "<%= a.getCategory() %>", <%= a.getCount() %>, "<%= a.getAreaName() != null ? a.getAreaName() : "" %>", "<%= a.getHealthStatus() %>", "<%= a.getDietType() != null ? a.getDietType() : "" %>", <%= a.getFeedingCycleDays() %>, "<%= a.getNextFeedingDate() != null ? a.getNextFeedingDate() : "" %>", "<%= a.getKeeperName() != null ? a.getKeeperName() : "" %>", "<%= a.getRemark() != null ? a.getRemark().replace("\"", "\\\"").replace("\n", " ") : "" %>")'>
                            ✏️ 编辑
                        </button>
                        <button type="button" class="action-btn btn-del" onclick="confirmDelete(<%= a.getId() %>, '<%= a.getName() %>')">
                            🗑️ 移除
                        </button>
                    </div>
                </div>
            </div>
        <% }} %>
    </section>

</main>

<!-- 新增动物弹窗 -->
<div class="modal-overlay" id="addAnimalModal">
    <div class="modal-card">
        <div class="modal-header">
            <h3><span>➕</span> 录入校园新作物动物档案</h3>
            <button type="button" style="border:none;background:none;font-size:20px;cursor:pointer;color:#94a3b8;" onclick="closeAddModal()">&times;</button>
        </div>
        <form action="AnimalServlet" method="post">
            <input type="hidden" name="action" value="add">
            <div class="modal-body">
                <div class="form-row">
                    <div class="form-group">
                        <label>档案编号 (留空自动生成)</label>
                        <input type="text" name="animalNo" class="form-control" placeholder="如 AN-1006">
                    </div>
                    <div class="form-group">
                        <label>动物名称 <span style="color:#dc2626;">*</span></label>
                        <input type="text" name="name" class="form-control" required placeholder="如 天府黑天鹅、锦鲤">
                    </div>
                </div>

                <div class="form-row">
                    <div class="form-group">
                        <label>学名 / 拉丁科学分类</label>
                        <input type="text" name="species" class="form-control" placeholder="如 Cygnus atratus">
                    </div>
                    <div class="form-group">
                        <label>物种门类</label>
                        <select name="category" class="form-control">
                            <option value="水禽鸟类">🦢 水禽鸟类</option>
                            <option value="观赏鱼类">🐟 观赏鱼类</option>
                            <option value="林栖哺乳类">🐿️ 林栖哺乳类</option>
                            <option value="陆禽鸟类">🦚 陆禽鸟类</option>
                            <option value="两栖类">🐸 两栖类</option>
                        </select>
                    </div>
                </div>

                <div class="form-row">
                    <div class="form-group">
                        <label>个体数量 (只/尾/群)</label>
                        <input type="number" name="count" class="form-control" value="1" min="1">
                    </div>
                    <div class="form-group">
                        <label>栖息 / 观测网格区域</label>
                        <input type="text" name="areaName" class="form-control" value="天府湖水域生态区" placeholder="如 时代广场喷泉池">
                    </div>
                </div>

                <div class="form-row">
                    <div class="form-group">
                        <label>当前健康状况</label>
                        <select name="healthStatus" class="form-control">
                            <option value="健康活泼">健康活泼</option>
                            <option value="生长良好">生长良好</option>
                            <option value="重点观察">重点观察</option>
                            <option value="隔离照护">隔离照护</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>投喂/巡查周期 (天)</label>
                        <input type="number" name="feedingCycleDays" class="form-control" value="1" min="1">
                    </div>
                </div>

                <div class="form-row">
                    <div class="form-group">
                        <label>食性与主饲料种类</label>
                        <input type="text" name="dietType" class="form-control" placeholder="如 专用配合颗粒饲料/水草">
                    </div>
                    <div class="form-group">
                        <label>专职保育责任人</label>
                        <input type="text" name="keeperName" class="form-control" value="生态保育员" placeholder="如 张师傅、李工">
                    </div>
                </div>

                <div class="form-group">
                    <label>生态习性与保育注意事项</label>
                    <textarea name="remark" class="form-control" rows="3" placeholder="填写该物种在天府学院的繁育、作息、投喂技巧与观测要点..."></textarea>
                </div>
            </div>
            <div class="modal-footer">
                <button type="button" class="action-btn btn-edit" onclick="closeAddModal()">取消</button>
                <button type="submit" class="action-btn btn-feed" style="padding:9px 20px;">确认保存并录入</button>
            </div>
        </form>
    </div>
</div>

<!-- 编辑动物弹窗 -->
<div class="modal-overlay" id="editAnimalModal">
    <div class="modal-card">
        <div class="modal-header">
            <h3><span>✏️</span> 编辑生态动物档案</h3>
            <button type="button" style="border:none;background:none;font-size:20px;cursor:pointer;color:#94a3b8;" onclick="closeEditModal()">&times;</button>
        </div>
        <form action="AnimalServlet" method="post">
            <input type="hidden" name="action" value="update">
            <input type="hidden" name="id" id="editId">
            <div class="modal-body">
                <div class="form-row">
                    <div class="form-group">
                        <label>档案编号</label>
                        <input type="text" name="animalNo" id="editAnimalNo" class="form-control" required>
                    </div>
                    <div class="form-group">
                        <label>动物名称</label>
                        <input type="text" name="name" id="editName" class="form-control" required>
                    </div>
                </div>

                <div class="form-row">
                    <div class="form-group">
                        <label>学名 / 拉丁科学分类</label>
                        <input type="text" name="species" id="editSpecies" class="form-control">
                    </div>
                    <div class="form-group">
                        <label>物种门类</label>
                        <select name="category" id="editCategory" class="form-control">
                            <option value="水禽鸟类">水禽鸟类</option>
                            <option value="观赏鱼类">观赏鱼类</option>
                            <option value="林栖哺乳类">林栖哺乳类</option>
                            <option value="陆禽鸟类">陆禽鸟类</option>
                            <option value="两栖类">两栖类</option>
                        </select>
                    </div>
                </div>

                <div class="form-row">
                    <div class="form-group">
                        <label>个体数量</label>
                        <input type="number" name="count" id="editCount" class="form-control" min="1">
                    </div>
                    <div class="form-group">
                        <label>栖息 / 观测区域</label>
                        <input type="text" name="areaName" id="editAreaName" class="form-control">
                    </div>
                </div>

                <div class="form-row">
                    <div class="form-group">
                        <label>当前健康状况</label>
                        <select name="healthStatus" id="editHealthStatus" class="form-control">
                            <option value="健康活泼">健康活泼</option>
                            <option value="生长良好">生长良好</option>
                            <option value="重点观察">重点观察</option>
                            <option value="隔离照护">隔离照护</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>投喂周期 (天)</label>
                        <input type="number" name="feedingCycleDays" id="editFeedingCycleDays" class="form-control" min="1">
                    </div>
                </div>

                <div class="form-row">
                    <div class="form-group">
                        <label>食性与饲料种类</label>
                        <input type="text" name="dietType" id="editDietType" class="form-control">
                    </div>
                    <div class="form-group">
                        <label>专职保育责任人</label>
                        <input type="text" name="keeperName" id="editKeeperName" class="form-control">
                    </div>
                </div>

                <div class="form-group">
                    <label>生态习性与档案说明</label>
                    <textarea name="remark" id="editRemark" class="form-control" rows="3"></textarea>
                </div>
            </div>
            <div class="modal-footer">
                <button type="button" class="action-btn btn-edit" onclick="closeEditModal()">取消</button>
                <button type="submit" class="action-btn btn-feed" style="padding:9px 20px;">保存修改</button>
            </div>
        </form>
    </div>
</div>

<script>
    function openAddModal() {
        document.getElementById('addAnimalModal').style.display = 'flex';
    }
    function closeAddModal() {
        document.getElementById('addAnimalModal').style.display = 'none';
    }

    function openEditModal(id, no, name, species, cat, count, area, health, diet, cycle, nextDate, keeper, remark) {
        document.getElementById('editId').value = id;
        document.getElementById('editAnimalNo').value = no;
        document.getElementById('editName').value = name;
        document.getElementById('editSpecies').value = species;
        document.getElementById('editCategory').value = cat;
        document.getElementById('editCount').value = count;
        document.getElementById('editAreaName').value = area;
        document.getElementById('editHealthStatus').value = health;
        document.getElementById('editDietType').value = diet;
        document.getElementById('editFeedingCycleDays').value = cycle;
        document.getElementById('editKeeperName').value = keeper;
        document.getElementById('editRemark').value = remark;
        document.getElementById('editAnimalModal').style.display = 'flex';
    }
    function closeEditModal() {
        document.getElementById('editAnimalModal').style.display = 'none';
    }

    function quickFeed(id, name) {
        if (!confirm('确认完成【' + name + '】的今日投喂巡检打卡吗？\n系统将自动更新下次投喂日期。')) {
            return;
        }
        var params = new URLSearchParams();
        params.append('action', 'feed');
        params.append('id', id);

        fetch('AnimalServlet', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
                'X-Requested-With': 'XMLHttpRequest'
            },
            body: params.toString()
        })
        .then(res => res.json())
        .then(data => {
            alert(data.message);
            window.location.reload();
        })
        .catch(err => {
            alert('投喂打卡失败: ' + err);
        });
    }

    function confirmDelete(id, name) {
        if (confirm('确定要从系统中移除动物档案【' + name + '】吗？\n该操作不可撤销。')) {
            var form = document.createElement('form');
            form.method = 'POST';
            form.action = 'AnimalServlet';
            var aInput = document.createElement('input');
            aInput.type = 'hidden';
            aInput.name = 'action';
            aInput.value = 'delete';
            form.appendChild(aInput);
            var idInput = document.createElement('input');
            idInput.type = 'hidden';
            idInput.name = 'id';
            idInput.value = id;
            form.appendChild(idInput);
            document.body.appendChild(form);
            form.submit();
        }
    }
</script>

<!-- 🌿 引入 AI 绿化数字宠物【小天】 -->
<%@ include file="ai_pet_widget.jsp" %>

</body>
</html>
