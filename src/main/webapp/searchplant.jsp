<%@ page contentType="text/html; charset=UTF-8" pageEncoding="UTF-8" %>
<%@ page import="java.util.List, DB.DBTools, org.example.demo1.Plant, org.example.demo1.AdminUser, org.example.demo1.PlantArea, org.example.demo1.Maintainer, java.util.Map" %>
<%
    List<Plant> plantList = (List<Plant>) request.getAttribute("plantList");
    DBTools dbTools = new DBTools();
    if (plantList == null) {
        plantList = dbTools.queryAllPlants();
    }
    List<PlantArea> areaList = dbTools.queryAllAreas();
    Map<String, Maintainer> maintainerMap = dbTools.queryPlantMaintainerMap();

    AdminUser currentUser = (AdminUser) session.getAttribute("adminUser");
    String currentRole = currentUser != null ? currentUser.getRoleCode() : "";
    boolean isPlantAdmin = "PLANT_ADMIN".equals(currentRole);
    boolean isSystemAdmin = "SYSTEM_ADMIN".equals(currentRole) || "SUPER_ADMIN".equals(currentRole) || "ADMIN".equals(currentRole);
    int totalCount = plantList != null ? plantList.size() : 0;
%>
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="referrer" content="no-referrer">
    <title>天府绿化系统 - 绿植档案检索与专属铭牌中心</title>
    <!-- 引入二维码生成库 -->
    <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            min-height: 100vh;
            padding: 30px 24px 60px 24px;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif;
            background: url("bj.png") no-repeat center center fixed;
            background-size: cover;
            color: #1f2937;
        }

        /* 顶部毛玻璃导航栏 */
        .navbar {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 0 32px;
            height: 68px;
            background: rgba(255, 255, 255, 0.85);
            backdrop-filter: blur(14px);
            -webkit-backdrop-filter: blur(14px);
            border: 1px solid rgba(255, 255, 255, 0.6);
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
            border-radius: 20px;
            max-width: 1440px;
            margin: 0 auto 24px auto;
        }

        .logo-title {
            font-size: 20px;
            font-weight: 700;
            color: #1f2937;
            display: flex;
            align-items: center;
            gap: 12px;
        }

        .nav-btn-group {
            display: flex;
            align-items: center;
            gap: 10px;
        }

        .add-btn {
            padding: 8px 18px;
            background-color: #10b981;
            color: #ffffff;
            border-radius: 20px;
            font-size: 14px;
            font-weight: 600;
            text-decoration: none;
            transition: all 0.25s ease;
            box-shadow: 0 2px 8px rgba(16, 185, 129, 0.3);
            display: inline-flex;
            align-items: center;
            gap: 6px;
        }
        .add-btn:hover {
            background-color: #059669;
            transform: translateY(-1px);
        }

        .back-btn {
            padding: 8px 16px;
            background-color: rgba(255, 255, 255, 0.9);
            color: #374151;
            border: 1px solid #d1d5db;
            border-radius: 20px;
            font-size: 13.5px;
            font-weight: 600;
            text-decoration: none;
            transition: all 0.25s ease;
            display: inline-flex;
            align-items: center;
            gap: 4px;
        }
        .back-btn:hover {
            background-color: #ffffff;
            border-color: #10b981;
            color: #059669;
            transform: translateY(-1px);
        }

        /* 智能搜索与多维筛选卡片 */
        .search-filter-card {
            max-width: 1440px;
            margin: 0 auto 28px auto;
            background: rgba(255, 255, 255, 0.9);
            backdrop-filter: blur(14px);
            -webkit-backdrop-filter: blur(14px);
            border: 1px solid rgba(255, 255, 255, 0.8);
            border-radius: 18px;
            padding: 18px 26px;
            box-shadow: 0 8px 24px rgba(15, 23, 42, 0.08);
            display: flex;
            align-items: center;
            justify-content: space-between;
            flex-wrap: wrap;
            gap: 16px;
        }

        .filter-controls {
            display: flex;
            align-items: center;
            gap: 12px;
            flex-wrap: wrap;
            flex: 1;
        }

        .search-input-box {
            position: relative;
            min-width: 280px;
            flex: 1;
        }
        .search-input-box input {
            width: 100%;
            height: 42px;
            padding: 0 16px 0 40px;
            border: 1.5px solid #d1d5db;
            border-radius: 12px;
            font-size: 14px;
            outline: none;
            background: #ffffff;
            transition: all 0.25s ease;
        }
        .search-input-box input:focus {
            border-color: #10b981;
            box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.2);
        }
        .search-icon-inside {
            position: absolute;
            left: 14px;
            top: 50%;
            transform: translateY(-50%);
            color: #9ca3af;
            font-size: 16px;
        }

        .filter-select {
            height: 42px;
            padding: 0 14px;
            border: 1.5px solid #d1d5db;
            border-radius: 12px;
            font-size: 13.5px;
            font-weight: 500;
            outline: none;
            background: #ffffff;
            color: #374151;
            cursor: pointer;
            transition: all 0.25s ease;
        }
        .filter-select:focus {
            border-color: #10b981;
            box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.2);
        }

        .filter-status-info {
            font-size: 13.5px;
            font-weight: 600;
            color: #4b5563;
            display: flex;
            align-items: center;
            gap: 10px;
        }
        .counter-badge {
            background: #ecfdf5;
            color: #059669;
            padding: 4px 12px;
            border-radius: 20px;
            border: 1px solid #a7f3d0;
            font-weight: 700;
        }

        /* 绿植数据网格 */
        .grid-container {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
            gap: 26px;
            max-width: 1440px;
            margin: 0 auto;
        }

        /* 卡片毛玻璃风格 */
        .plant-card {
            background: rgba(255, 255, 255, 0.88);
            backdrop-filter: blur(18px);
            -webkit-backdrop-filter: blur(18px);
            border-radius: 20px;
            box-shadow: 0 12px 30px rgba(0, 0, 0, 0.1);
            border: 1px solid rgba(255, 255, 255, 0.7);
            padding: 22px;
            transition: transform 0.3s ease, box-shadow 0.3s ease;
            display: flex;
            flex-direction: column;
            position: relative;
        }

        .plant-card:hover {
            transform: translateY(-5px);
            box-shadow: 0 20px 42px rgba(0, 0, 0, 0.16);
            background: rgba(255, 255, 255, 0.95);
        }

        .plant-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 8px;
        }

        .plant-name {
            font-size: 19px;
            font-weight: 700;
            color: #0f172a;
        }

        .plant-type {
            display: inline-block;
            padding: 3px 10px;
            background: #10b981;
            color: #fff;
            border-radius: 12px;
            font-size: 12px;
            font-weight: 600;
        }

        .plant-meta-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin: 10px 0 14px 0;
            font-size: 13px;
            color: #4b5563;
        }

        .plant-price {
            color: #d97706;
            font-size: 18px;
            font-weight: 800;
        }

        .plant-image-box {
            width: 100%;
            height: 190px;
            border-radius: 14px;
            overflow: hidden;
            margin-bottom: 14px;
            background: #e2e8f0;
            border: 1px solid rgba(255, 255, 255, 0.8);
            position: relative;
        }

        .plant-image-box img {
            width: 100%;
            height: 100%;
            object-fit: cover;
            display: block;
            transition: transform 0.35s ease;
        }

        .plant-card:hover .plant-image-box img {
            transform: scale(1.05);
        }

        .plant-desc {
            font-size: 13px;
            color: #334155;
            line-height: 1.6;
            margin-bottom: 16px;
            flex-grow: 1;
            display: -webkit-box;
            -webkit-line-clamp: 3;
            -webkit-box-orient: vertical;
            overflow: hidden;
        }

        .card-actions {
            display: flex;
            gap: 8px;
            margin-top: auto;
            padding-top: 14px;
            border-top: 1px dashed rgba(203, 213, 225, 0.8);
            flex-wrap: wrap;
        }

        .btn-action {
            flex: 1;
            min-width: 68px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            padding: 7px 10px;
            border-radius: 10px;
            font-size: 12.5px;
            font-weight: 600;
            text-decoration: none;
            transition: all 0.25s ease;
            cursor: pointer;
            border: none;
            gap: 4px;
        }

        .btn-qr {
            background: #f0fdf4;
            color: #059669;
            border: 1px solid #a7f3d0;
        }
        .btn-qr:hover {
            background: #059669;
            color: #ffffff;
            box-shadow: 0 4px 12px rgba(5, 150, 105, 0.3);
        }

        .btn-care {
            background: rgba(16, 185, 129, 0.12);
            color: #059669;
            border: 1px solid rgba(16, 185, 129, 0.3);
        }
        .btn-care:hover {
            background: #10b981;
            color: #ffffff;
        }

        .btn-edit {
            background: rgba(217, 119, 6, 0.12);
            color: #b45309;
            border: 1px solid rgba(217, 119, 6, 0.3);
        }
        .btn-edit:hover {
            background: #d97706;
            color: #ffffff;
        }

        .btn-delete {
            background: rgba(239, 68, 68, 0.12);
            color: #dc2626;
            border: 1px solid rgba(239, 68, 68, 0.3);
        }
        .btn-delete:hover {
            background: #ef4444;
            color: #ffffff;
        }

        /* 树木铭牌模态框 */
        .qr-modal-overlay {
            position: fixed;
            inset: 0;
            background: rgba(15, 23, 42, 0.7);
            backdrop-filter: blur(8px);
            display: none;
            place-items: center;
            z-index: 9999;
            padding: 20px;
        }
        .qr-plate-card {
            background: #ffffff;
            width: 100%;
            max-width: 520px;
            border-radius: 20px;
            box-shadow: 0 25px 60px -15px rgba(0, 0, 0, 0.4);
            overflow: hidden;
            animation: modalFade 0.25s ease-out;
        }
        @keyframes modalFade {
            from { opacity: 0; transform: scale(0.95); }
            to { opacity: 1; transform: scale(1); }
        }

        .plate-header {
            background: linear-gradient(135deg, #059669 0%, #10b981 100%);
            color: #fff;
            padding: 18px 24px;
            display: flex;
            align-items: center;
            justify-content: space-between;
        }
        .plate-title {
            font-size: 16px;
            font-weight: 700;
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .plate-close {
            background: transparent;
            border: none;
            color: #fff;
            font-size: 24px;
            cursor: pointer;
            line-height: 1;
        }

        .plate-body {
            padding: 24px;
            background: #fafafa;
        }

        /* 实体铭牌标准外观预览 */
        .tree-sign-board {
            background: #ffffff;
            border: 3px solid #059669;
            border-radius: 16px;
            padding: 20px;
            box-shadow: 0 6px 16px rgba(0, 0, 0, 0.08);
            position: relative;
        }
        .sign-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 2px solid #059669;
            padding-bottom: 12px;
            margin-bottom: 16px;
        }
        .sign-school {
            font-size: 14px;
            font-weight: 800;
            color: #059669;
            letter-spacing: 0.5px;
        }
        .sign-tag {
            font-size: 11px;
            font-weight: 700;
            background: #ecfdf5;
            color: #059669;
            padding: 2px 8px;
            border-radius: 6px;
            border: 1px solid #a7f3d0;
        }

        .sign-main {
            display: flex;
            gap: 16px;
            align-items: center;
        }
        .sign-qr-box {
            width: 120px;
            height: 120px;
            background: #ffffff;
            padding: 8px;
            border: 1px solid #e2e8f0;
            border-radius: 10px;
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
        }
        .sign-qr-box img, .sign-qr-box canvas {
            max-width: 100%;
            max-height: 100%;
        }
        .sign-details {
            flex: 1;
        }
        .sign-plant-name {
            font-size: 20px;
            font-weight: 800;
            color: #0f172a;
            margin-bottom: 4px;
        }
        .sign-field {
            font-size: 12px;
            color: #475569;
            margin-bottom: 4px;
            line-height: 1.4;
        }
        .sign-field strong {
            color: #0f172a;
        }

        .plate-footer {
            padding: 16px 24px;
            background: #ffffff;
            border-top: 1px solid #e2e8f0;
            display: flex;
            align-items: center;
            justify-content: space-between;
        }

        /* 打印样式支持 */
        @media print {
            body * {
                visibility: hidden;
            }
            .qr-modal-overlay, .tree-sign-board, .tree-sign-board * {
                visibility: visible;
            }
            .qr-modal-overlay {
                position: absolute;
                left: 0;
                top: 0;
                width: 100%;
                background: #fff;
                display: block !important;
                padding: 0;
            }
            .qr-plate-card {
                box-shadow: none;
                max-width: 100%;
            }
            .plate-header, .plate-footer {
                display: none !important;
            }
        }
    </style>
</head>
<body>

<!-- 顶部导航栏 -->
<header class="navbar">
    <div class="logo-title">
        <span>🌿</span>
        <span>西南财经大学天府学院 · 绿植档案库</span>
    </div>
    <div class="nav-btn-group">
        <a href="ExportServlet?action=report" class="back-btn" style="color: #0284c7; border-color: #38bdf8; font-weight: 700;">
            📄 总体综合报告 (Word)
        </a>
        <a href="AnimalServlet" class="back-btn" style="color: #166534; border-color: #86efac; font-weight: 600;">🐾 生态动物</a>
        <a href="MaintainServlet" class="back-btn" style="color: #059669; border-color: #10b981; font-weight: 600;">🛠️ 养护中心</a>
        <% if (isSystemAdmin) { %>
            <a href="AdminDashboardServlet" class="back-btn" style="color: #0284c7; border-color: #38bdf8; font-weight: 600;">🛡️ 系统后台</a>
        <% } %>
        <% if (isPlantAdmin) { %>
            <a href="addplant.jsp" class="add-btn">➕ 增添作物</a>
        <% } %>
        <a href="index.jsp" class="back-btn">🏠 返回主页</a>
    </div>
</header>

<!-- 智能多维搜索与筛选面板 -->
<section class="search-filter-card">
    <div class="filter-controls">
        <div class="search-input-box">
            <span class="search-icon-inside">🔍</span>
            <input type="text" id="plantSearchInput" placeholder="输入绿植编号、名称或特征关键字实时检索..." oninput="handleFilter()">
        </div>
        <select id="categoryFilter" class="filter-select" onchange="handleFilter()">
            <option value="">全部品类 (全部分类)</option>
            <option value="乔木">乔木 (树体高大)</option>
            <option value="灌木">灌木 (分枝低矮)</option>
            <option value="观叶植物">观叶植物</option>
            <option value="多肉植物">多肉植物</option>
            <option value="花卉盆栽">花卉盆栽</option>
            <option value="水培植物">水培植物</option>
            <option value="银杏">银杏树</option>
        </select>
        <select id="sortFilter" class="filter-select" onchange="handleSort()">
            <option value="default">默认排列</option>
            <option value="priceDesc">估值从高到低</option>
            <option value="priceAsc">估值从低到高</option>
            <option value="name">名称拼音</option>
        </select>
        <button type="button" onclick="resetFilters()" class="back-btn" style="height: 42px; border-radius: 12px;">重置</button>
    </div>
    <div class="filter-status-info">
        <span>当前收录:</span>
        <span class="counter-badge" id="visibleCounter">共 <%= totalCount %> 株</span>
    </div>
</section>

<!-- 绿植卡片展示网格 -->
<div class="grid-container" id="plantGrid">
    <%
        if (plantList != null && !plantList.isEmpty()) {
            for (Plant plant : plantList) {
                String pic = plant.getPpic();
                if (pic == null || pic.trim().isEmpty()) {
                    pic = "tf1yx.jpg";
                }
                String plantName = plant.getPname() != null ? plant.getPname() : "未知绿植";
                String plantType = plant.getPtype() != null ? plant.getPtype() : "校区绿植";
                String pid = plant.getPid() != null ? plant.getPid() : "";
                String desc = plant.getPdesc() != null ? plant.getPdesc() : "暂无简介";
                String areaName = "时代广场中庭核心区";
                if (plant.getAreaId() != null && areaList != null) {
                    for (PlantArea a : areaList) {
                        if (a.getId() == plant.getAreaId()) {
                            areaName = a.getAreaName();
                            break;
                        }
                    }
                }
                Maintainer m = maintainerMap != null ? maintainerMap.get(pid) : null;
                String maintainerName = m != null ? m.getName() : "绿化管养组";
    %>
                <div class="plant-card" 
                     data-pid="<%= pid.toLowerCase() %>" 
                     data-name="<%= plantName.toLowerCase() %>" 
                     data-type="<%= plantType %>" 
                     data-price="<%= plant.getPprice() %>" 
                     data-desc="<%= desc.toLowerCase() %>">
                    
                    <div class="plant-header">
                        <div class="plant-name"><%= plantName %></div>
                        <span class="plant-type"><%= plantType %></span>
                    </div>

                    <div class="plant-meta-row">
                        <span>编号: <strong><%= pid %></strong></span>
                        <span class="plant-price">¥ <%= plant.getPprice() %></span>
                    </div>

                    <div class="plant-image-box">
                        <img src="<%= pic %>" referrerpolicy="no-referrer" alt="<%= plantName %>" onerror="this.onerror=null; this.src='新增.png';" />
                    </div>

                    <div class="plant-desc">
                        <%= desc %>
                    </div>

                    <!-- 操作区域 -->
                    <div class="card-actions">
                        <!-- 一树一码专属电子铭牌 -->
                        <button type="button" class="btn-action btn-qr" 
                                onclick="openTreeSignModal('<%= pid %>', '<%= plantName.replace("'", "\\'") %>', '<%= plantType %>', '<%= plant.getPprice() %>', '<%= plant.getPdatetime() != null ? plant.getPdatetime() : "建校初期" %>', '<%= areaName.replace("'", "\\'") %>', '<%= maintainerName.replace("'", "\\'") %>')" 
                                title="生成校园标准树木铭牌二维码，可直接打印">
                            🏷️ 专属树牌
                        </button>

                        <a href="MaintainServlet?keyword=<%= pid %>" class="btn-action btn-care" title="查看或登记养护记录">
                            🛠️ 养护
                        </a>

                        <% if (isPlantAdmin) { %>
                            <a href="EditPlantServlet?pid=<%= pid %>" class="btn-action btn-edit" title="修改绿植档案">
                                ✏️ 修改
                            </a>
                            <a href="DeletePlantServlet?pid=<%= pid %>" 
                               class="btn-action btn-delete" 
                               onclick="return confirm('确定要从数据库中删除【<%= plantName.replace("'", "\\'") %>】吗？此操作不可恢复！');"
                               title="删除该绿植">
                                🗑️ 删除
                            </a>
                        <% } %>
                    </div>
                </div>
    <%
            }
        } else {
    %>
        <div style="grid-column: 1 / -1; text-align: center; padding: 60px 40px; background: rgba(255,255,255,0.7); border-radius: 20px;">
            <p style="font-size: 18px; font-weight: 700; color: #1f2937; margin-bottom: 12px;">📭 当前数据库中没有任何绿植数据。</p>
            <% if (isPlantAdmin) { %>
                <a href="addplant.jsp" class="add-btn">➕ 立即增添作物</a>
            <% } %>
        </div>
    <% } %>
</div>

<!-- 专属树牌打印与二维码弹窗 -->
<div id="treeSignModal" class="qr-modal-overlay">
    <div class="qr-plate-card">
        <div class="plate-header">
            <div class="plate-title">
                <span>🏷️</span> 校园植物专属数字铭牌 (一树一码)
            </div>
            <button type="button" class="plate-close" onclick="closeTreeSignModal()">&times;</button>
        </div>
        <div class="plate-body">
            <!-- 打印实体树木标牌卡 -->
            <div class="tree-sign-board" id="printableTreeSign">
                <div class="sign-header">
                    <div class="sign-school">
                        🍃 西南财经大学天府学院 · 植物铭牌
                    </div>
                    <div class="sign-tag" id="signCategory">银杏科 · 乔木</div>
                </div>
                <div class="sign-main">
                    <div class="sign-qr-box" id="signQrCodeContainer">
                        <!-- 二维码渲染容器 -->
                    </div>
                    <div class="sign-details">
                        <div class="sign-plant-name" id="signPlantName">银杏 (白果树)</div>
                        <div class="sign-field">档案编号: <strong id="signPid">TF-YX-001</strong></div>
                        <div class="sign-field">校区位置: <strong id="signArea">时代广场中庭核心区</strong></div>
                        <div class="sign-field">责任管养: <strong id="signMaintainer">李师傅 (绿化组)</strong></div>
                        <div class="sign-field">种植年份: <strong id="signDate">2021-03-12</strong></div>
                        <div style="margin-top: 6px; font-size: 11px; color: #059669; font-weight: 600;">
                            📲 手机扫码查看植物数字科普微档案
                        </div>
                    </div>
                </div>
            </div>
        </div>
        <div class="plate-footer">
            <div style="font-size: 12.5px; color: #64748b;">
                支持激光彩打覆膜挂树
            </div>
            <div style="display: flex; gap: 10px;">
                <a id="previewDetailLink" href="#" target="_blank" class="back-btn" style="color: #059669; border-color: #10b981;">
                    📱 移动微档案
                </a>
                <button type="button" onclick="window.print()" class="add-btn" style="box-shadow: none;">
                    🖨️ 打印树木铭牌
                </button>
            </div>
        </div>
    </div>
</div>

<script>
    var currentQrCodeObj = null;

    function handleFilter() {
        var keyword = document.getElementById('plantSearchInput').value.toLowerCase().trim();
        var category = document.getElementById('categoryFilter').value.trim();
        var cards = document.querySelectorAll('.plant-card');
        var visibleCount = 0;

        cards.forEach(function(card) {
            var pid = card.getAttribute('data-pid') || '';
            var name = card.getAttribute('data-name') || '';
            var type = card.getAttribute('data-type') || '';
            var desc = card.getAttribute('data-desc') || '';

            var matchKw = !keyword || pid.indexOf(keyword) !== -1 || name.indexOf(keyword) !== -1 || desc.indexOf(keyword) !== -1;
            var matchCat = !category || type.indexOf(category) !== -1;

            if (matchKw && matchCat) {
                card.style.display = 'flex';
                visibleCount++;
            } else {
                card.style.display = 'none';
            }
        });

        document.getElementById('visibleCounter').textContent = '筛选出 ' + visibleCount + ' 株';
    }

    function handleSort() {
        var sortBy = document.getElementById('sortFilter').value;
        var grid = document.getElementById('plantGrid');
        var cards = Array.from(grid.querySelectorAll('.plant-card'));

        cards.sort(function(a, b) {
            if (sortBy === 'priceDesc') {
                return (parseFloat(b.getAttribute('data-price')) || 0) - (parseFloat(a.getAttribute('data-price')) || 0);
            } else if (sortBy === 'priceAsc') {
                return (parseFloat(a.getAttribute('data-price')) || 0) - (parseFloat(b.getAttribute('data-price')) || 0);
            } else if (sortBy === 'name') {
                return (a.getAttribute('data-name') || '').localeCompare(b.getAttribute('data-name') || '', 'zh');
            }
            return 0;
        });

        cards.forEach(function(card) {
            grid.appendChild(card);
        });
    }

    function resetFilters() {
        document.getElementById('plantSearchInput').value = '';
        document.getElementById('categoryFilter').value = '';
        document.getElementById('sortFilter').value = 'default';
        handleFilter();
    }

    function openTreeSignModal(pid, name, type, price, date, area, maintainer) {
        document.getElementById('signPlantName').textContent = name;
        document.getElementById('signCategory').textContent = type;
        document.getElementById('signPid').textContent = pid;
        document.getElementById('signArea').textContent = area;
        document.getElementById('signMaintainer').textContent = maintainer;
        document.getElementById('signDate').textContent = date;

        // 生成扫码跳转的目标移动端档案地址 (支持 localhost/局域网IP)
        var detailUrl = window.location.protocol + '//' + window.location.host + '<%= request.getContextPath() %>/plant_detail.jsp?pid=' + encodeURIComponent(pid);
        document.getElementById('previewDetailLink').href = detailUrl;

        // 生成二维码
        var container = document.getElementById('signQrCodeContainer');
        container.innerHTML = '';
        try {
            if (typeof QRCode !== 'undefined') {
                currentQrCodeObj = new QRCode(container, {
                    text: detailUrl,
                    width: 104,
                    height: 104,
                    colorDark : "#0f172a",
                    colorLight : "#ffffff",
                    correctLevel : QRCode.CorrectLevel.M
                });
            } else {
                // 离线容灾回退：使用轻量级 SVG 动态二维码或直接显示树木编号图钉
                container.innerHTML = '<div style="font-size: 11px; text-align: center; color: #059669; font-weight: 700; padding-top: 24px;">🌿 数字树牌<br>编号: ' + pid + '</div>';
            }
        } catch(e) {
            container.innerHTML = '<div style="font-size: 11px; text-align: center; color: #059669; font-weight: 700; padding-top: 24px;">🌿 数字树牌<br>编号: ' + pid + '</div>';
        }

        document.getElementById('treeSignModal').style.display = 'grid';
    }

    function closeTreeSignModal() {
        document.getElementById('treeSignModal').style.display = 'none';
    }

    window.onclick = function(e) {
        var modal = document.getElementById('treeSignModal');
        if (e.target === modal) {
            closeTreeSignModal();
        }
    };
</script>

</body>
</html>
