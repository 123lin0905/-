<%@ page contentType="text/html; charset=UTF-8" pageEncoding="UTF-8" %>
<%@ page import="java.util.List, java.util.Map, org.example.demo1.Plant, org.example.demo1.PlantArea, org.example.demo1.Maintainer, org.example.demo1.PlantType, org.example.demo1.PlantMaintenance, org.example.demo1.AdminUser, org.example.demo1.Animal" %>
<%!
    private String js(String value) {
        if (value == null) return "";
        return value.replace("\\", "\\\\").replace("'", "\\'").replace("\"", "\\\"").replace("\r", "\\r").replace("\n", "\\n");
    }
%>
<%
    List<PlantArea> areaList = (List<PlantArea>) request.getAttribute("areaList");
    if (areaList == null) {
        DB.DBTools dbTools = new DB.DBTools();
        areaList = dbTools.queryAllAreas();
    }
    List<Maintainer> maintainerList = (List<Maintainer>) request.getAttribute("maintainerList");
    if (maintainerList == null) {
        DB.DBTools dbTools = new DB.DBTools();
        maintainerList = dbTools.queryAllMaintainers(null, null, null);
    }
    List<Plant> plantList = (List<Plant>) request.getAttribute("plantList");
    if (plantList == null) {
        DB.DBTools dbTools = new DB.DBTools();
        plantList = dbTools.queryAllPlants();
    }
    List<Animal> animalList = (List<Animal>) request.getAttribute("animalList");
    if (animalList == null) {
        DB.DBTools dbTools = new DB.DBTools();
        animalList = dbTools.queryAllAnimals(null, null);
    }
    List<PlantType> plantTypeList = (List<PlantType>) request.getAttribute("plantTypeList");
    if (plantTypeList == null) {
        DB.DBTools dbTools = new DB.DBTools();
        plantTypeList = dbTools.queryAllPlantTypes();
    }
    Map<String, PlantMaintenance> lastMaintenanceMap = (Map<String, PlantMaintenance>) request.getAttribute("lastMaintenanceMap");
    if (lastMaintenanceMap == null) {
        DB.DBTools dbTools = new DB.DBTools();
        lastMaintenanceMap = dbTools.getLastMaintenanceMap();
    }
    Map<String, Maintainer> plantMaintainerMap = (Map<String, Maintainer>) request.getAttribute("plantMaintainerMap");
    if (plantMaintainerMap == null) {
        DB.DBTools dbTools = new DB.DBTools();
        plantMaintainerMap = dbTools.queryPlantMaintainerMap();
    }
    AdminUser currentUser = (AdminUser) session.getAttribute("adminUser");
    String currentOperator = currentUser != null ? currentUser.getDisplayName() : "校区园艺师";
%>
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>智慧校园点位与植株智能标绘中心 - 西南财经大学天府学院</title>

    <!-- Leaflet GIS 地图引擎 -->
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">

    <!-- 引入 GreenKeeper 原生样式表（图钉环形徽标、详情抽屉、周期卡片等） -->
    <link rel="stylesheet" href="greenkeeper/greenkeeper.css">

    <!-- 现代字体 -->
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">

    <style>
        :root {
            --primary: #059669;
            --primary-hover: #047857;
            --primary-light: #ecfdf5;
            --primary-border: #a7f3d0;
            --dark: #0f172a;
            --gray-700: #334155;
            --gray-500: #64748b;
            --gray-300: #cbd5e1;
            --gray-200: #e2e8f0;
            --gray-100: #f8fafc;
            --card-bg: rgba(255, 255, 255, 0.95);
            --shadow-sm: 0 1px 3px rgba(15, 23, 42, 0.06);
            --shadow-md: 0 10px 25px -5px rgba(15, 23, 42, 0.08), 0 8px 10px -6px rgba(15, 23, 42, 0.04);
            --shadow-lg: 0 20px 35px -8px rgba(5, 150, 105, 0.12), 0 12px 16px -8px rgba(15, 23, 42, 0.06);
            --radius-md: 12px;
            --radius-lg: 18px;
        }

        /* 🐾 校园生态动物图钉高亮与侧栏卡片样式 */
        .gk-marker.animal-marker .gk-marker__ring {
            border: 3.5px solid #f59e0b !important;
            background: linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%) !important;
            box-shadow: 0 4px 14px rgba(217, 119, 6, 0.38) !important;
        }
        .gk-marker.animal-marker .animal-emoji {
            font-size: 25px;
            transform: rotate(45deg);
            display: inline-block;
            user-select: none;
        }
        .gk-marker.animal-marker .gk-marker__label {
            background: rgba(254, 243, 199, 0.96) !important;
            color: #92400e !important;
            font-weight: 800 !important;
            border: 1px solid rgba(245, 158, 11, 0.45) !important;
            box-shadow: 0 2px 8px rgba(217, 119, 6, 0.18);
        }
        .gk-marker__dot.healthy { background: #10b981; }
        .gk-marker__dot.warning { background: #f59e0b; }
        .animal-item-card { border-left: 4px solid #f59e0b !important; }

        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: 'Plus Jakarta Sans', "PingFang SC", "Microsoft YaHei", -apple-system, sans-serif;
            background: linear-gradient(145deg, #f0fdf4 0%, #f8fafc 50%, #ecfdf5 100%);
            color: var(--dark);
            min-height: 100vh;
            display: flex;
            flex-direction: column;
        }

        /* 顶部现代导航条 */
        .navbar {
            height: 66px;
            background: rgba(255, 255, 255, 0.92);
            backdrop-filter: blur(14px);
            border-bottom: 1px solid rgba(226, 232, 240, 0.85);
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 0 28px;
            position: sticky;
            top: 0;
            z-index: 1000;
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
            background: linear-gradient(135deg, #10b981, #059669);
            border-radius: 12px;
            display: grid;
            place-items: center;
            color: #fff;
            font-size: 20px;
            box-shadow: 0 4px 14px rgba(5, 150, 105, 0.3);
        }
        .brand-title {
            font-size: 18px;
            font-weight: 800;
            letter-spacing: -0.3px;
        }
        .brand-subtitle {
            font-size: 12px;
            color: var(--gray-500);
            font-weight: 500;
        }
        .nav-links {
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .nav-link {
            padding: 7px 15px;
            border-radius: 10px;
            font-size: 13.5px;
            font-weight: 600;
            color: var(--gray-700);
            text-decoration: none;
            transition: all 0.2s ease;
            display: inline-flex;
            align-items: center;
            gap: 6px;
        }
        .nav-link:hover {
            color: var(--primary);
            background: var(--primary-light);
        }
        .nav-link.active {
            color: var(--primary);
            background: #d1fae5;
            box-shadow: inset 0 0 0 1px #a7f3d0;
        }

        /* 页面主容器 */
        .main-container {
            flex: 1;
            padding: 20px 28px 36px;
            max-width: 1760px;
            margin: 0 auto;
            width: 100%;
            display: flex;
            flex-direction: column;
            gap: 18px;
        }

        /* 顶部看板 Banner 与数据汇总胶囊 */
        .center-hero {
            background: var(--card-bg);
            backdrop-filter: blur(14px);
            border-radius: var(--radius-lg);
            border: 1px solid rgba(226, 232, 240, 0.9);
            padding: 18px 24px;
            box-shadow: var(--shadow-sm);
            display: flex;
            align-items: center;
            justify-content: space-between;
            flex-wrap: wrap;
            gap: 16px;
        }
        .hero-left h1 {
            font-size: 20px;
            font-weight: 800;
            color: var(--dark);
            display: flex;
            align-items: center;
            gap: 10px;
        }
        .badge-unified {
            background: #d1fae5;
            color: #065f46;
            font-size: 11.5px;
            padding: 3px 10px;
            border-radius: 20px;
            font-weight: 700;
            border: 1px solid #a7f3d0;
        }
        .hero-left p {
            font-size: 13px;
            color: var(--gray-500);
            margin-top: 5px;
        }
        .hero-stats {
            display: flex;
            align-items: center;
            gap: 10px;
            flex-wrap: wrap;
        }
        .stat-pill {
            background: #ffffff;
            border: 1px solid var(--gray-200);
            border-radius: 12px;
            padding: 8px 14px;
            display: flex;
            align-items: center;
            gap: 8px;
            box-shadow: 0 2px 6px rgba(0,0,0,0.03);
            font-size: 13px;
        }
        .stat-pill strong {
            font-size: 16px;
            color: var(--primary);
            font-weight: 800;
        }
        .stat-pill.amber strong { color: #d97706; }
        .stat-pill.red strong { color: #dc2626; }

        /* 工作台主网格：左侧作物管养控制台 + 右侧超清交互地图与抽屉 */
        .workbench-grid {
            display: grid;
            grid-template-columns: 440px minmax(0, 1fr);
            gap: 20px;
            height: calc(100vh - 185px);
            min-height: 680px;
        }

        .panel-card {
            background: var(--card-bg);
            backdrop-filter: blur(16px);
            border-radius: var(--radius-lg);
            border: 1px solid rgba(226, 232, 240, 0.9);
            box-shadow: var(--shadow-md);
            overflow: hidden;
            display: flex;
            flex-direction: column;
        }

        .sidebar-content {
            flex: 1;
            overflow-y: auto;
            padding: 18px;
            display: flex;
            flex-direction: column;
            gap: 14px;
        }

        /* 植株筛选与列表 */
        .search-box {
            position: relative;
        }
        .search-input {
            width: 100%;
            padding: 9px 12px 9px 34px;
            border: 1.5px solid var(--gray-300);
            border-radius: 10px;
            font-size: 13px;
            outline: none;
            transition: all 0.2s;
        }
        .search-input:focus {
            border-color: var(--primary);
            box-shadow: 0 0 0 3px rgba(5, 150, 105, 0.15);
        }
        .search-icon {
            position: absolute;
            left: 10px;
            top: 50%;
            transform: translateY(-50%);
            color: #94a3b8;
            font-size: 14px;
        }

        .filter-chip-row {
            display: flex;
            gap: 6px;
            flex-wrap: wrap;
        }
        .filter-chip {
            padding: 4px 10px;
            border-radius: 20px;
            font-size: 12px;
            font-weight: 600;
            border: 1px solid var(--gray-300);
            background: #fff;
            color: var(--gray-700);
            cursor: pointer;
            transition: all 0.2s;
        }
        .filter-chip.active {
            background: var(--primary);
            color: #fff;
            border-color: var(--primary);
        }

        .plant-item-card {
            background: #ffffff;
            border: 1px solid var(--gray-200);
            border-radius: 14px;
            padding: 12px 14px;
            display: flex;
            flex-direction: column;
            gap: 8px;
            cursor: pointer;
            transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .plant-item-card:hover {
            border-color: var(--primary);
            transform: translateY(-2px);
            box-shadow: 0 6px 18px rgba(5, 150, 105, 0.12);
        }
        .plant-item-card.active {
            border-color: var(--primary);
            background: #f0fdf4;
            box-shadow: 0 0 0 2px var(--primary-border);
        }
        .plant-card-header {
            display: flex;
            align-items: center;
            gap: 12px;
        }
        .plant-card-meta {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding-top: 6px;
            border-top: 1px dashed #e2e8f0;
            font-size: 11.5px;
        }
        .maintainer-tag {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            padding: 2px 8px;
            border-radius: 12px;
            font-size: 11.5px;
            font-weight: 700;
        }
        .maintainer-tag.assigned {
            background: #e0f2fe;
            color: #0369a1;
            border: 1px solid #bae6fd;
        }
        .maintainer-tag.unassigned {
            background: #fef2f2;
            color: #b91c1c;
            border: 1px solid #fecaca;
        }
        .plant-card-actions {
            display: flex;
            gap: 6px;
            margin-top: 2px;
        }
        .btn-card-action {
            flex: 1;
            padding: 6px 10px;
            border-radius: 8px;
            font-size: 11.5px;
            font-weight: 700;
            border: 1px solid var(--gray-300);
            background: #fff;
            color: var(--dark);
            cursor: pointer;
            transition: all 0.2s;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 4px;
        }
        .btn-card-action:hover {
            border-color: var(--primary);
            color: var(--primary);
            background: var(--primary-light);
        }
        .btn-card-action.primary {
            background: #ecfdf5;
            color: #065f46;
            border-color: #a7f3d0;
        }
        .btn-card-action.primary:hover {
            background: #d1fae5;
            border-color: #059669;
        }
        .plant-thumb {
            width: 44px;
            height: 44px;
            border-radius: 10px;
            object-fit: cover;
            border: 2px solid #e2e8f0;
            background: #f8fafc;
            flex-shrink: 0;
        }
        .plant-info {
            flex: 1;
            min-width: 0;
        }
        .plant-info-title {
            font-size: 13.5px;
            font-weight: 700;
            color: var(--dark);
            display: flex;
            align-items: center;
            gap: 6px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .plant-info-desc {
            font-size: 11.5px;
            color: var(--gray-500);
            margin-top: 2px;
        }
        .badge-status {
            font-size: 10.5px;
            padding: 1px 6px;
            border-radius: 4px;
            font-weight: 700;
        }
        .badge-status.normal { background: #d1fae5; color: #065f46; }
        .badge-status.due { background: #fef3c7; color: #b45309; }
        .badge-status.overdue { background: #fee2e2; color: #b91c1c; }

        /* 点位配置表单样式（无范围半径） */
        .form-group { margin-bottom: 12px; }
        .form-label {
            display: block;
            font-size: 12.5px;
            font-weight: 600;
            color: var(--gray-700);
            margin-bottom: 5px;
        }
        .form-control {
            width: 100%;
            padding: 9px 12px;
            border: 1.5px solid var(--gray-300);
            border-radius: 10px;
            font-size: 13px;
            background: #fff;
            color: var(--dark);
            outline: none;
            transition: all 0.2s;
        }
        .form-control:focus {
            border-color: var(--primary);
            box-shadow: 0 0 0 3px rgba(5, 150, 105, 0.15);
        }
        .form-row {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 10px;
        }
        .btn-submit {
            width: 100%;
            padding: 11px;
            background: linear-gradient(135deg, #059669, #047857);
            color: #fff;
            border: none;
            border-radius: 10px;
            font-size: 14px;
            font-weight: 700;
            cursor: pointer;
            box-shadow: 0 4px 12px rgba(5, 150, 105, 0.25);
            transition: all 0.2s;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            margin-top: 6px;
        }
        .btn-submit:hover {
            transform: translateY(-1px);
            box-shadow: 0 8px 18px rgba(5, 150, 105, 0.35);
        }

        /* 点位拾取提示框 */
        .pick-tip-card {
            background: #ecfdf5;
            border: 1px solid #a7f3d0;
            border-radius: 10px;
            padding: 10px 12px;
            font-size: 12.5px;
            color: #065f46;
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 8px;
        }

        /* 右侧工作台：地图容器与浮层 */
        .map-wrapper {
            position: relative;
            flex: 1;
            display: flex;
            overflow: hidden;
            border-radius: var(--radius-lg);
        }
        #areaGisMap {
            flex: 1;
            height: 100%;
            width: 100%;
            background: #e5e7eb;
            z-index: 1;
        }

        /* 顶部 HUD 悬浮控制条 */
        .map-hud-bar {
            position: absolute;
            top: 14px;
            left: 14px;
            right: 14px;
            z-index: 500;
            display: flex;
            justify-content: space-between;
            align-items: center;
            pointer-events: none;
        }
        .hud-left {
            pointer-events: auto;
            display: flex;
            gap: 8px;
            align-items: center;
        }
        .hud-right {
            pointer-events: auto;
            display: flex;
            gap: 8px;
            align-items: center;
        }

        .hud-pill {
            background: rgba(15, 23, 42, 0.88);
            backdrop-filter: blur(12px);
            border: 1px solid rgba(255, 255, 255, 0.15);
            color: #ffffff;
            padding: 7px 16px;
            border-radius: 30px;
            font-size: 12.5px;
            font-weight: 700;
            box-shadow: 0 4px 14px rgba(0,0,0,0.25);
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .hud-pill .dot {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background: #10b981;
            box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.35);
        }

        .hud-btn {
            background: rgba(255, 255, 255, 0.95);
            backdrop-filter: blur(12px);
            border: 1px solid var(--gray-300);
            color: var(--dark);
            padding: 7px 14px;
            border-radius: 20px;
            font-size: 12.5px;
            font-weight: 700;
            cursor: pointer;
            box-shadow: 0 2px 10px rgba(0,0,0,0.08);
            transition: all 0.2s;
            display: inline-flex;
            align-items: center;
            gap: 6px;
        }
        .hud-btn:hover {
            border-color: var(--primary);
            color: var(--primary);
            transform: translateY(-1px);
        }
        .hud-btn.primary {
            background: #059669;
            color: #fff;
            border-color: #059669;
        }
        .hud-btn.primary:hover {
            background: #047857;
            color: #fff;
        }
        .hud-btn.active {
            background: #059669;
            color: #fff;
            border-color: #059669;
            box-shadow: 0 0 0 3px rgba(5, 150, 105, 0.25);
        }

        /* 地图右上角校区实景切换器样式 */
        .hud-campus-dropdown {
            position: relative;
            pointer-events: auto;
            user-select: none;
        }

        .hud-campus-trigger {
            background: rgba(15, 23, 42, 0.9);
            backdrop-filter: blur(14px);
            -webkit-backdrop-filter: blur(14px);
            border: 1.5px solid rgba(16, 185, 129, 0.55);
            color: #ffffff;
            padding: 6px 14px;
            border-radius: 24px;
            font-size: 13px;
            font-weight: 700;
            cursor: pointer;
            box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
            display: inline-flex;
            align-items: center;
            gap: 7px;
            transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .hud-campus-trigger:hover {
            background: #0f172a;
            border-color: #10b981;
            box-shadow: 0 6px 20px rgba(16, 185, 129, 0.35);
            transform: translateY(-1px);
        }

        .hud-campus-trigger .c-badge-pin {
            font-size: 13px;
        }

        .hud-campus-trigger .c-active-icon {
            font-size: 14px;
        }

        .hud-campus-trigger .c-active-name {
            letter-spacing: 0.3px;
        }

        .hud-campus-trigger .c-caret {
            font-size: 11px;
            color: #94a3b8;
            transition: transform 0.2s ease;
        }

        .hud-campus-dropdown.open .hud-campus-trigger .c-caret {
            transform: rotate(180deg);
        }

        .hud-campus-menu {
            position: absolute;
            top: calc(100% + 8px);
            right: 0;
            min-width: 290px;
            background: rgba(255, 255, 255, 0.98);
            backdrop-filter: blur(20px);
            -webkit-backdrop-filter: blur(20px);
            border: 1px solid rgba(226, 232, 240, 0.9);
            border-radius: 16px;
            box-shadow: 0 16px 38px rgba(15, 23, 42, 0.22);
            padding: 8px;
            z-index: 1000;
            display: none;
            flex-direction: column;
            gap: 4px;
            animation: campusMenuFadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .hud-campus-dropdown.open .hud-campus-menu {
            display: flex;
        }

        @keyframes campusMenuFadeIn {
            from { opacity: 0; transform: translateY(-6px) scale(0.97); }
            to { opacity: 1; transform: translateY(0) scale(1); }
        }

        .hud-menu-header {
            font-size: 11px;
            font-weight: 800;
            color: #64748b;
            padding: 6px 10px 6px;
            border-bottom: 1px solid #f1f5f9;
            letter-spacing: 0.5px;
            display: flex;
            align-items: center;
            justify-content: space-between;
        }

        .hud-campus-option {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 9px 12px;
            border-radius: 12px;
            cursor: pointer;
            transition: all 0.16s ease;
            border: 1px solid transparent;
        }

        .hud-campus-option:hover {
            background: #f0fdf4;
            border-color: #bbf7d0;
        }

        .hud-campus-option.active {
            background: #ecfdf5;
            border-color: #10b981;
        }

        .hud-campus-option .opt-left {
            display: flex;
            align-items: center;
            gap: 10px;
        }

        .hud-campus-option .opt-icon {
            font-size: 20px;
            flex-shrink: 0;
        }

        .hud-campus-option .opt-title {
            font-size: 13.5px;
            font-weight: 700;
            color: #0f172a;
        }

        .hud-campus-option.active .opt-title {
            color: #065f46;
        }

        .hud-campus-option .opt-desc {
            font-size: 11px;
            color: #64748b;
            margin-top: 2px;
        }

        .hud-campus-option .opt-check {
            font-size: 14px;
            font-weight: 900;
            color: #059669;
            opacity: 0;
            transition: opacity 0.15s ease;
        }

        .hud-campus-option.active .opt-check {
            opacity: 1;
        }

        /* 左侧校区快速筛选标签 */
        .campus-chip-row {
            display: flex;
            gap: 5px;
            margin-bottom: 8px;
            overflow-x: auto;
            padding-bottom: 2px;
            scrollbar-width: none;
        }
        .campus-chip-row::-webkit-scrollbar {
            display: none;
        }
        .campus-chip {
            padding: 4px 9px;
            border-radius: 8px;
            font-size: 11.5px;
            font-weight: 700;
            border: 1px solid var(--gray-300);
            background: #f8fafc;
            color: var(--gray-600);
            cursor: pointer;
            transition: all 0.18s;
            white-space: nowrap;
        }
        .campus-chip:hover {
            background: #f1f5f9;
            color: var(--dark);
        }
        .campus-chip.active {
            background: #0f172a;
            color: #ffffff;
            border-color: #0f172a;
        }

        .plant-campus-tag {
            font-size: 10.5px;
            font-weight: 700;
            padding: 2px 7px;
            border-radius: 6px;
            background: #f1f5f9;
            color: #334155;
            border: 1px solid #e2e8f0;
            display: inline-flex;
            align-items: center;
            gap: 3px;
        }

        /* 鼠标悬停坐标跟随小药丸 */
        .mouse-coord-follower {
            position: absolute;
            pointer-events: none;
            background: rgba(15, 23, 42, 0.88);
            backdrop-filter: blur(8px);
            color: #34d399;
            font-family: monospace;
            font-weight: 700;
            font-size: 12px;
            padding: 4px 10px;
            border-radius: 6px;
            border: 1px solid rgba(16, 185, 129, 0.4);
            box-shadow: 0 4px 14px rgba(0,0,0,0.3);
            z-index: 900;
            white-space: nowrap;
            transform: translate(14px, 14px);
            transition: opacity 0.15s ease;
        }

        /* 地标纯点位标记样式 (无范围圆圈) */
        .poi-point-pin {
            display: flex;
            flex-direction: column;
            align-items: center;
            cursor: pointer;
            user-select: none;
            transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .poi-point-pin:hover {
            transform: scale(1.1);
            z-index: 9999;
        }
        .poi-bubble {
            background: rgba(15, 23, 42, 0.92);
            backdrop-filter: blur(10px);
            color: #ffffff;
            padding: 4px 10px;
            border-radius: 16px;
            font-size: 12px;
            font-weight: 700;
            border: 1.5px solid #10b981;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.35);
            white-space: nowrap;
            letter-spacing: 0.2px;
        }
        .poi-needle {
            width: 2px;
            height: 7px;
            background: #10b981;
        }
        .poi-base-dot {
            width: 7px;
            height: 7px;
            border-radius: 50%;
            background: #10b981;
            box-shadow: 0 0 0 2px #ffffff, 0 2px 6px rgba(0,0,0,0.3);
        }

        /* 点选时的临时脉冲选点钉 */
        .select-pin-anim {
            display: flex;
            flex-direction: column;
            align-items: center;
            pointer-events: none;
        }
        .select-pin-head {
            background: #ef4444;
            color: #fff;
            padding: 3px 8px;
            border-radius: 12px;
            font-size: 11px;
            font-weight: 800;
            box-shadow: 0 4px 12px rgba(239, 68, 68, 0.4);
            white-space: nowrap;
        }
        .select-pin-dot {
            width: 10px;
            height: 10px;
            border-radius: 50%;
            background: #ef4444;
            border: 2px solid #fff;
            margin-top: 2px;
            box-shadow: 0 0 0 4px rgba(239, 68, 68, 0.35);
            animation: pulseDot 1.2s infinite ease-in-out;
        }
        @keyframes pulseDot {
            0%, 100% { transform: scale(1); box-shadow: 0 0 0 4px rgba(239, 68, 68, 0.35); }
            50% { transform: scale(1.2); box-shadow: 0 0 0 8px rgba(239, 68, 68, 0.15); }
        }

        /* 标绘中横幅提示 */
        .placing-banner {
            position: absolute;
            top: 64px;
            left: 50%;
            transform: translateX(-50%);
            z-index: 600;
            background: #0f172a;
            color: #ffffff;
            padding: 8px 18px;
            border-radius: 30px;
            font-size: 13px;
            font-weight: 700;
            box-shadow: 0 6px 20px rgba(0,0,0,0.3);
            border: 1px solid rgba(16, 185, 129, 0.5);
            display: none;
            align-items: center;
            gap: 8px;
            animation: pulseBanner 2s infinite ease-in-out;
        }
        @keyframes pulseBanner {
            0%, 100% { transform: translateX(-50%) scale(1); }
            50% { transform: translateX(-50%) scale(1.02); }
        }

        /* 一树一档滑出式抽屉 */
        .plant-drawer {
            position: absolute;
            top: 0;
            right: 0;
            bottom: 0;
            width: 360px;
            background: rgba(255, 255, 255, 0.98);
            backdrop-filter: blur(20px);
            border-left: 1px solid var(--gray-200);
            box-shadow: -8px 0 28px rgba(0,0,0,0.12);
            z-index: 800;
            display: flex;
            flex-direction: column;
            transform: translateX(100%);
            transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .plant-drawer.open {
            transform: translateX(0);
        }
        .drawer-head {
            position: relative;
            height: 160px;
            background: #e2e8f0;
            flex-shrink: 0;
            overflow: hidden;
        }
        .drawer-cover {
            width: 100%;
            height: 100%;
            object-fit: cover;
        }
        .drawer-close {
            position: absolute;
            top: 10px;
            right: 10px;
            width: 30px;
            height: 30px;
            border-radius: 50%;
            background: rgba(15, 23, 42, 0.7);
            color: #fff;
            border: none;
            font-size: 16px;
            cursor: pointer;
            display: grid;
            place-items: center;
            transition: all 0.2s;
        }
        .drawer-close:hover { background: #0f172a; }

        .drawer-body {
            flex: 1;
            overflow-y: auto;
            padding: 16px 18px 24px;
            display: flex;
            flex-direction: column;
            gap: 16px;
        }
        .drawer-title-row h2 {
            font-size: 18px;
            font-weight: 800;
            color: var(--dark);
        }
        .drawer-title-row p {
            font-size: 12.5px;
            color: var(--gray-500);
            margin-top: 3px;
        }

        .drawer-actions-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 8px;
        }
        .btn-care {
            padding: 9px 10px;
            border-radius: 10px;
            border: 1px solid var(--gray-200);
            background: #f8fafc;
            color: var(--dark);
            font-size: 12.5px;
            font-weight: 700;
            cursor: pointer;
            transition: all 0.2s;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
        }
        .btn-care:hover {
            border-color: var(--primary);
            background: var(--primary-light);
            color: var(--primary);
            transform: translateY(-1px);
        }

        /* 底部台账数据表 */
        .table-section {
            background: var(--card-bg);
            border-radius: var(--radius-lg);
            border: 1px solid rgba(226, 232, 240, 0.9);
            box-shadow: var(--shadow-sm);
            padding: 20px 24px;
        }
        .table-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 14px;
        }
        .table-title {
            font-size: 16px;
            font-weight: 700;
            color: var(--dark);
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .modern-table {
            width: 100%;
            border-collapse: separate;
            border-spacing: 0;
            font-size: 13px;
        }
        .modern-table th {
            background: #f8fafc;
            color: var(--gray-500);
            font-weight: 700;
            padding: 10px 14px;
            text-align: left;
            border-bottom: 1.5px solid var(--gray-200);
            font-size: 12px;
            letter-spacing: 0.3px;
        }
        .modern-table td {
            padding: 12px 14px;
            border-bottom: 1px solid var(--gray-200);
            color: var(--gray-700);
            vertical-align: middle;
        }
        .modern-table tr:hover td {
            background: rgba(240, 253, 244, 0.6);
        }

        .btn-table {
            padding: 5px 10px;
            border-radius: 6px;
            font-size: 12px;
            font-weight: 600;
            border: 1px solid var(--gray-300);
            background: #fff;
            cursor: pointer;
            transition: all 0.2s;
            margin-right: 4px;
        }
        .btn-table:hover { border-color: var(--primary); color: var(--primary); }
        .btn-table.del:hover { border-color: #ef4444; color: #ef4444; background: #fee2e2; }

        /* 底部台账 Tab 切换导航 */
        .table-title-tabs {
            display: inline-flex;
            background: #f1f5f9;
            padding: 4px;
            border-radius: 12px;
            gap: 4px;
        }
        .table-tab-btn {
            border: none;
            background: transparent;
            padding: 7px 16px;
            border-radius: 8px;
            font-size: 13.5px;
            font-weight: 700;
            color: var(--gray-600);
            cursor: pointer;
            transition: all 0.2s;
            display: inline-flex;
            align-items: center;
            gap: 8px;
        }
        .table-tab-btn:hover {
            color: var(--dark);
        }
        .table-tab-btn.active {
            background: #ffffff;
            color: #065f46;
            box-shadow: 0 2px 8px rgba(0,0,0,0.08);
        }
        .count-pill {
            background: #e2e8f0;
            color: #334155;
            font-size: 11px;
            padding: 2px 8px;
            border-radius: 10px;
            font-weight: 700;
        }
        .table-tab-btn.active .count-pill {
            background: #d1fae5;
            color: #047857;
        }
        .badge-maintainer {
            background: #e0f2fe;
            color: #0369a1;
            padding: 3px 10px;
            border-radius: 12px;
            font-weight: 600;
            font-size: 12px;
            display: inline-flex;
            align-items: center;
            gap: 4px;
        }
        .badge-unassigned {
            background: #f1f5f9;
            color: #94a3b8;
            padding: 3px 10px;
            border-radius: 12px;
            font-weight: 600;
            font-size: 12px;
            display: inline-flex;
            align-items: center;
            gap: 4px;
        }

        /* 模态弹窗 */
        .modal-mask {
            position: fixed;
            inset: 0;
            background: rgba(15, 23, 42, 0.5);
            backdrop-filter: blur(4px);
            z-index: 2000;
            display: none;
            align-items: center;
            justify-content: center;
            padding: 20px;
        }
        .modal-mask.open { display: flex; }
        .modal-card {
            background: #ffffff;
            border-radius: var(--radius-lg);
            width: 100%;
            max-width: 520px;
            box-shadow: 0 20px 40px rgba(0,0,0,0.2);
            overflow: hidden;
            animation: modalIn 0.25s ease-out;
        }
        @keyframes modalIn {
            from { opacity: 0; transform: translateY(12px) scale(0.98); }
            to { opacity: 1; transform: translateY(0) scale(1); }
        }
        .modal-head {
            padding: 18px 22px;
            border-bottom: 1px solid var(--gray-200);
            display: flex;
            align-items: center;
            justify-content: space-between;
        }
        .modal-head h3 {
            font-size: 16px;
            font-weight: 800;
            color: var(--dark);
        }
        .modal-body {
            padding: 20px 22px;
            max-height: 75vh;
            overflow-y: auto;
        }
        .modal-foot {
            padding: 14px 22px;
            background: #f8fafc;
            border-top: 1px solid var(--gray-200);
            display: flex;
            justify-content: flex-end;
            gap: 10px;
        }
    </style>
</head>
<body>

<header class="navbar">
    <a href="index.jsp" class="nav-brand">
        <div class="brand-icon">🌿</div>
        <div>
            <div class="brand-title">智慧校园植株智能标绘与管养中心</div>
            <div class="brand-subtitle">西南财经大学天府学院（绵阳校区）· 高德实景数字标绘与管养平台</div>
        </div>
    </a>
    <nav class="nav-links">
        <a href="index.jsp" class="nav-link"><span>🏠</span> 首页仪表盘</a>
        <a href="AreaServlet" class="nav-link active"><span>📍</span> 园区植株智能标绘</a>
        <a href="QueryServlet" class="nav-link"><span>🌿</span> 绿植档案 (一树一码)</a>
        <a href="AnimalServlet" class="nav-link"><span>🐾</span> 生态动物</a>
        <a href="MaintainServlet" class="nav-link"><span>🛠️</span> 养护中心</a>
        <a href="ExportServlet?action=report" class="nav-link"><span>📄</span> 综合报告</a>
        <a href="MaintainerServlet" class="nav-link"><span>👷</span> 养护团队</a>
    </nav>
</header>

<main class="main-container">

    <!-- 顶部全景概况与状态指示 -->
    <section class="center-hero">
        <div class="hero-left">
            <h1>
                <span>🌳</span> <span id="heroCampusTitleText">西南财经大学天府学院（绵阳校区）</span>植株智能标绘与管养中心
                <span class="badge-unified">高德实景地图 · 多校区数字孪生 · 一树一档管养一体化</span>
            </h1>
            <p id="heroCampusDesc">
                鼠标在地图上移动即可实时查看经纬度坐标，点击地图任意落点即可智能标绘新植株；支持鼠标自由拖拽调位持久化。可直接编辑作物档案、一键布置与指派责任养护人员，支持养护周期健康预警与流水追踪。
            </p>
        </div>
        <div class="hero-stats">
            <div class="stat-pill">
                <span>🌿 标绘绿植</span>
                <strong id="statPlantCount"><%= plantList != null ? plantList.size() : 0 %></strong>
            </div>
            <div class="stat-pill" style="border-color:#fde68a;background:#fffbeb;">
                <span style="color:#b45309;">🐾 生态动物</span>
                <strong id="statAnimalCount" style="color:#d97706;"><%= animalList != null ? animalList.size() : 0 %></strong> 种
            </div>
            <div class="stat-pill">
                <span>👤 责任养护团队</span>
                <strong><%= maintainerList != null ? maintainerList.size() : 0 %></strong> 人
            </div>
            <div class="stat-pill amber">
                <span>⚠️ 养护临期</span>
                <strong id="statDueCount">0</strong>
            </div>
            <div class="stat-pill red">
                <span>🚨 超期未护</span>
                <strong id="statOverdueCount">0</strong>
            </div>
        </div>
    </section>

    <!-- 工作台：左侧控制台 + 右侧地图与一树一档 -->
    <section class="workbench-grid">
        
        <!-- 左侧控制面板：纯粹专注作物管养与人员布置 -->
        <aside class="panel-card">
            <div style="padding:16px 20px 14px;border-bottom:1px solid var(--gray-200);display:flex;align-items:center;justify-content:space-between;background:#f8fafc;">
                <div>
                    <h2 style="font-size:15px;font-weight:800;color:var(--dark);display:flex;align-items:center;gap:6px;">
                        <span>🌿</span> 校园作物标绘与管养
                    </h2>
                    <p style="font-size:11.5px;color:var(--gray-500);margin-top:2px;">点击作物卡片定位/编辑档案，直接指派养护人员</p>
                </div>
                <button type="button" class="hud-btn primary" onclick="togglePlaceMode()" style="padding:6px 12px;font-size:12px;" title="在地图上点击标绘新植物">
                    <span>+ 标绘</span>
                </button>
            </div>

            <!-- 作物清单与筛选 -->
            <div class="sidebar-content" id="sidebarPlantsPane">
                <!-- 生态类别切换：全部生态 / 绿植 / 动物 -->
                <div class="eco-nav-tabs" style="display:flex;gap:6px;margin-bottom:12px;background:#e2e8f0;padding:3px;border-radius:10px;">
                    <button type="button" class="eco-tab-btn active" id="btnEcoAll" onclick="setEcoTypeFilter('all', this)" style="flex:1;border:none;background:#ffffff;color:#0f172a;font-weight:700;font-size:12px;padding:6px 0;border-radius:7px;cursor:pointer;box-shadow:0 1px 3px rgba(0,0,0,0.1);transition:all 0.2s;">
                        全部生态 (<span id="countEcoAll"><%= (plantList != null ? plantList.size() : 0) + (animalList != null ? animalList.size() : 0) %></span>)
                    </button>
                    <button type="button" class="eco-tab-btn" id="btnEcoPlant" onclick="setEcoTypeFilter('plant', this)" style="flex:1;border:none;background:transparent;color:#475569;font-weight:700;font-size:12px;padding:6px 0;border-radius:7px;cursor:pointer;transition:all 0.2s;">
                        🌿 绿植 (<span id="countEcoPlant"><%= plantList != null ? plantList.size() : 0 %></span>)
                    </button>
                    <button type="button" class="eco-tab-btn" id="btnEcoAnimal" onclick="setEcoTypeFilter('animal', this)" style="flex:1;border:none;background:transparent;color:#475569;font-weight:700;font-size:12px;padding:6px 0;border-radius:7px;cursor:pointer;transition:all 0.2s;">
                        🐾 动物 (<span id="countEcoAnimal"><%= animalList != null ? animalList.size() : 0 %></span>)
                    </button>
                </div>

                <div class="search-box">
                    <span class="search-icon">🔍</span>
                    <input type="text" class="search-input" id="plantSearchInput" placeholder="搜索植株名称、资产编号、品类..." oninput="filterPlants()">
                </div>
                <!-- 校区快捷筛选标签行 -->
                <div class="campus-chip-row" id="campusChipRow">
                    <button type="button" class="campus-chip active" data-campus="all" onclick="setCampusListFilter('all', this)">全部校区</button>
                    <button type="button" class="campus-chip" data-campus="mianyang" onclick="setCampusListFilter('mianyang', this)">🌲 绵阳</button>
                    <button type="button" class="campus-chip" data-campus="chengdu_east" onclick="setCampusListFilter('chengdu_east', this)">🏙️ 成都东区</button>
                    <button type="button" class="campus-chip" data-campus="chengdu_west" onclick="setCampusListFilter('chengdu_west', this)">🏢 成都西区</button>
                    <button type="button" class="campus-chip" data-campus="deyang" onclick="setCampusListFilter('deyang', this)">🏛️ 德阳</button>
                </div>
                <div class="filter-chip-row">
                    <button type="button" class="filter-chip active" onclick="setPlantFilter('all', this)">全部作物</button>
                    <button type="button" class="filter-chip" onclick="setPlantFilter('due', this)">⚠️ 临期需养护</button>
                    <button type="button" class="filter-chip" onclick="setPlantFilter('overdue', this)">🚨 超期预警</button>
                    <button type="button" class="filter-chip" onclick="setPlantFilter('unassigned', this)">👤 待布置人员</button>
                </div>
                <div id="plantsListContainer" style="display:flex;flex-direction:column;gap:10px;overflow-y:auto;flex:1;">
                    <!-- JS 动态渲染植株卡片 -->
                </div>
            </div>
        </aside>

        <!-- 右侧高德交互地图与一树一档抽屉 -->
        <div class="map-wrapper panel-card">
            
            <!-- 鼠标坐标跟随小药丸 -->
            <div id="mouseCoordFollower" class="mouse-coord-follower" style="display:none;"></div>

            <!-- 顶部 HUD 悬浮控制条 -->
            <div class="map-hud-bar">
                <div class="hud-left">
                    <div class="hud-pill" title="鼠标在地图上移动即可实时查看当前经纬度坐标">
                        <span class="dot"></span>
                        <span>📍 鼠标实景坐标: </span>
                        <span id="hudCoords" style="color:#34d399;font-family:monospace;font-weight:800;letter-spacing:0.5px;">31.492761, 104.690207</span>
                    </div>
                    <button type="button" class="hud-btn primary" id="btnTogglePlaceMode" onclick="togglePlaceMode()">
                        <span>🌿 标绘新植株</span>
                    </button>
                </div>
                <div class="hud-right">
                    <!-- 校区选择/替换器（置于地图右上角） -->
                    <div class="hud-campus-dropdown" id="hudCampusDropdown">
                        <button type="button" class="hud-campus-trigger" id="hudCampusTrigger" onclick="toggleCampusDropdown(event)" title="点击切换西南财经大学天府学院校区实景地图">
                            <span class="c-badge-pin">📍</span>
                            <span class="c-active-icon" id="hudCampusIcon">🌲</span>
                            <span class="c-active-name" id="hudCampusName">绵阳校区</span>
                            <span class="c-caret">▾</span>
                        </button>
                        <div class="hud-campus-menu" id="hudCampusMenu">
                            <div class="hud-menu-header">
                                <span>🏫 天府学院校区实景地图切换</span>
                            </div>
                            <div class="hud-campus-option active" data-campus="mianyang" onclick="selectCampus('mianyang')">
                                <div class="opt-left">
                                    <span class="opt-icon">🌲</span>
                                    <div>
                                        <div class="opt-title">绵阳校区（主校区）</div>
                                        <div class="opt-desc">四川省绵阳市科创园区园兴西街2号</div>
                                    </div>
                                </div>
                                <span class="opt-check">✓</span>
                            </div>
                            <div class="hud-campus-option" data-campus="chengdu_east" onclick="selectCampus('chengdu_east')">
                                <div class="opt-left">
                                    <span class="opt-icon">🏙️</span>
                                    <div>
                                        <div class="opt-title">成都校区（东区）</div>
                                        <div class="opt-desc">成都市成华区龙潭街道龙港路399号</div>
                                    </div>
                                </div>
                                <span class="opt-check">✓</span>
                            </div>
                            <div class="hud-campus-option" data-campus="chengdu_west" onclick="selectCampus('chengdu_west')">
                                <div class="opt-left">
                                    <span class="opt-icon">🏢</span>
                                    <div>
                                        <div class="opt-title">成都校区（西区）</div>
                                        <div class="opt-desc">成都市成华区龙潭街道航天路29号</div>
                                    </div>
                                </div>
                                <span class="opt-check">✓</span>
                            </div>
                            <div class="hud-campus-option" data-campus="deyang" onclick="selectCampus('deyang')">
                                <div class="opt-left">
                                    <span class="opt-icon">🏛️</span>
                                    <div>
                                        <div class="opt-title">德阳校区</div>
                                        <div class="opt-desc">四川省德阳市罗江区大学北路99号</div>
                                    </div>
                                </div>
                                <span class="opt-check">✓</span>
                            </div>
                        </div>
                    </div>

                    <button type="button" class="hud-btn active" id="btnLayerTogglePlants" onclick="togglePlantPins()">
                        <span>📍 作物图钉</span>
                    </button>
                    <button type="button" class="hud-btn" onclick="resetCampusView()" title="重置地图至当前校区中心">
                        <span>🎯 校区居中</span>
                    </button>
                </div>
            </div>

            <!-- 标绘中指引横幅 -->
            <div class="placing-banner" id="placingBanner">
                <span>🎯 植株标绘模式已激活：请在绵阳校区高德地图上点击任意落点以栽植新作物！再次点击按钮可取消。</span>
            </div>

            <!-- Leaflet 地图 DOM 挂载点 -->
            <div id="areaGisMap"></div>

            <!-- 一树一档滑出式抽屉 -->
            <div class="plant-drawer" id="gkPlantDrawer">
                <div class="drawer-head">
                    <img src="greenkeeper/assets/plant-camphor.svg" class="drawer-cover" id="drawerCoverImg" alt="绿植图片">
                    <button type="button" class="drawer-close" onclick="closePlantDrawer()">✖</button>
                </div>
                <div class="drawer-body">
                    <div class="drawer-title-row">
                        <h2 id="drawerPlantName">天府第一银杏</h2>
                        <p id="drawerPlantMeta">乔木 · TF-PLANT-001</p>
                    </div>

                    <!-- 属性卡片 -->
                    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:12px;font-size:12.5px;display:flex;flex-direction:column;gap:8px;">
                        <div style="display:flex;justify-content:space-between;align-items:center;">
                            <span style="color:#64748b;font-weight:600;">责任养护人员：</span>
                            <span id="drawerPlantMaintainer" style="font-weight:700;"><span style="color:#94a3b8;">待布置</span></span>
                        </div>
                        <div style="display:flex;justify-content:space-between;">
                            <span style="color:#64748b;font-weight:600;">点位坐标：</span>
                            <span id="drawerPlantCoords" style="font-family:monospace;font-weight:600;color:#0f172a;">31.492761, 104.690207</span>
                        </div>
                        <div style="display:flex;justify-content:space-between;">
                            <span style="color:#64748b;font-weight:600;">栽植入库日期：</span>
                            <span id="drawerPlantDate">2024-03-12</span>
                        </div>
                        <div id="drawerPlantDescRow" style="font-size:12px;color:#475569;background:#fff;padding:6px 8px;border-radius:6px;border:1px solid #f1f5f9;line-height:1.4;">
                            <span style="color:#64748b;">备注：</span><span id="drawerPlantDesc">天府学院绵阳校区实景作物</span>
                        </div>
                    </div>

                    <!-- 核心操作：直接编辑作物档案 / 布置养护人员 -->
                    <div>
                        <button type="button" class="btn-submit" style="margin:0;padding:10px;font-size:13px;" onclick="openEditCropModal(selectedPlant ? selectedPlant.id : '')">
                            <span>✏️ 编辑此作物档案 / 布置养护人员</span>
                        </button>
                    </div>

                    <!-- 四色养护周期指标行 -->
                    <div>
                        <div style="font-size:12px;font-weight:700;color:var(--gray-500);margin-bottom:6px;display:flex;justify-content:space-between;">
                            <span>周期健康预警</span>
                            <span id="drawerHealthBadge" class="badge-status normal">状态良好</span>
                        </div>
                        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;" id="drawerCareMetrics">
                            <!-- 动态填充 -->
                        </div>
                    </div>

                    <!-- 快速养护操作动作按钮 -->
                    <div>
                        <div style="font-size:12px;font-weight:700;color:var(--gray-500);margin-bottom:6px;">快速记录养护流水</div>
                        <div class="drawer-actions-grid">
                            <button type="button" class="btn-care" onclick="quickDoCare('浇水')">💧 立即浇水</button>
                            <button type="button" class="btn-care" onclick="quickDoCare('施肥')">🌱 立即施肥</button>
                            <button type="button" class="btn-care" onclick="quickDoCare('修剪')">🍂 立即修剪</button>
                            <button type="button" class="btn-care" onclick="quickDoCare('放药')">💊 立即放药</button>
                        </div>
                    </div>

                    <!-- 养护流水时间轴 -->
                    <div style="flex:1;">
                        <div style="font-size:12px;font-weight:700;color:var(--gray-500);margin-bottom:8px;">养护历史时间轴</div>
                        <div class="gk-tl" id="drawerTimeline">
                            <!-- 动态加载 -->
                        </div>
                    </div>

                    <div style="display:flex;gap:8px;padding-top:10px;border-top:1px solid #e2e8f0;">
                        <button type="button" class="btn-card-action" style="flex:1;padding:8px;" onclick="openEditCropModal(selectedPlant ? selectedPlant.id : '')">✏️ 编辑作物</button>
                        <button type="button" class="btn-table del" style="flex:1;padding:8px;" onclick="deleteCurrentPlant()">🗑️ 移除此点位</button>
                    </div>
                </div>
            </div>

            <!-- 生态动物专属滑出式抽屉 -->
            <div class="plant-drawer animal-drawer" id="gkAnimalDrawer" style="z-index:900;">
                <div class="drawer-head" style="background:linear-gradient(135deg, #f59e0b 0%, #d97706 100%);display:flex;align-items:center;justify-content:center;position:relative;">
                    <div style="font-size:52px;display:flex;align-items:center;justify-content:center;height:100%;user-select:none;" id="drawerAnimalEmoji">🦢</div>
                    <button type="button" class="drawer-close" onclick="closeAnimalDrawer()">✖</button>
                </div>
                <div class="drawer-body">
                    <div class="drawer-title-row">
                        <div style="flex:1;">
                            <h2 id="drawerAnimalName" style="color:#0f172a;font-size:18px;">天府黑天鹅</h2>
                            <p id="drawerAnimalMeta" style="color:#64748b;font-size:12px;margin-top:2px;">水禽鸟类 · AN-1001 · 绵阳校区</p>
                        </div>
                        <span id="drawerAnimalHealthBadge" class="badge-status normal">健康活泼</span>
                    </div>

                    <!-- 属性卡片 (MySQL 真实在册数据) -->
                    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:12px;font-size:12.5px;display:flex;flex-direction:column;gap:8px;">
                        <div style="display:flex;justify-content:space-between;align-items:center;">
                            <span style="color:#64748b;font-weight:600;">专职保育员：</span>
                            <span id="drawerAnimalKeeper" style="font-weight:700;color:#0369a1;">张师傅</span>
                        </div>
                        <div style="display:flex;justify-content:space-between;">
                            <span style="color:#64748b;font-weight:600;">存栏数量：</span>
                            <span id="drawerAnimalCount" style="font-weight:700;color:#d97706;">4 只/尾</span>
                        </div>
                        <div style="display:flex;justify-content:space-between;">
                            <span style="color:#64748b;font-weight:600;">栖息区域：</span>
                            <span id="drawerAnimalArea" style="font-weight:600;">天府湖水域生态区</span>
                        </div>
                        <div style="display:flex;justify-content:space-between;">
                            <span style="color:#64748b;font-weight:600;">实景地理坐标：</span>
                            <span id="drawerAnimalCoords" style="font-family:monospace;font-weight:700;color:#059669;">31.492200, 104.688200</span>
                        </div>
                        <div style="display:flex;justify-content:space-between;">
                            <span style="color:#64748b;font-weight:600;">下次计划投喂：</span>
                            <span id="drawerAnimalNextFeed" style="color:#b45309;font-weight:700;">2024-11-10 (每1天一次)</span>
                        </div>
                        <div style="background:#fff;padding:6px 8px;border-radius:6px;border:1px solid #f1f5f9;font-size:12px;line-height:1.4;">
                            <span style="color:#64748b;font-weight:600;">食性饲料：</span>
                            <span id="drawerAnimalDiet" style="color:#334155;">专用禽粮/水生软植物</span>
                        </div>
                    </div>

                    <!-- 投喂打卡与完整档案入口 -->
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:6px;">
                        <button type="button" class="btn-care" style="background:#059669;color:#fff;padding:10px;font-weight:700;border:none;border-radius:8px;cursor:pointer;" onclick="quickFeedCurrentAnimal()">
                            🐟 投喂巡检打卡
                        </button>
                        <a id="btnDrawerFullAnimalLink" href="animal.jsp" target="_blank" class="btn-card-action" style="text-align:center;text-decoration:none;padding:10px;font-weight:700;display:flex;align-items:center;justify-content:center;background:#fff;border:1px solid #cbd5e1;border-radius:8px;color:#0f172a;">
                            🐾 完整生态档案 ↗
                        </a>
                    </div>

                    <!-- 习性与生活说明 -->
                    <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:12px;margin-top:6px;">
                        <div style="font-size:12px;font-weight:800;color:#92400e;margin-bottom:4px;">📝 校园伴生栖息记录</div>
                        <p id="drawerAnimalRemark" style="font-size:12px;color:#78350f;line-height:1.5;">天府学院标志性生态水禽，常在湖面集群游弋，深受全校师生喜爱</p>
                    </div>

                    <div style="display:flex;gap:8px;padding-top:10px;border-top:1px solid #e2e8f0;margin-top:auto;">
                        <button type="button" class="btn-table del" style="flex:1;padding:8px;" onclick="deleteCurrentAnimal()">🗑️ 移除此动物点位</button>
                    </div>
                </div>
            </div>
        </div>
    </section>

</main>

<!-- 模态弹窗：标绘新作物 (支持绿植 / 动物双模标绘) -->
<div class="modal-mask" id="addPlantModal">
    <div class="modal-card">
        <div class="modal-head">
            <h3 id="modalPlotTitle">🌱 标绘新生态落点</h3>
            <button type="button" style="border:none;background:transparent;font-size:18px;cursor:pointer;" onclick="closeAddPlantModal()">✖</button>
        </div>
        
        <!-- 绿植 / 动物 模式切换 -->
        <div style="display:flex;gap:4px;padding:8px 20px 0;background:#f8fafc;border-bottom:1px solid #e2e8f0;">
            <button type="button" id="tabPlotPlant" onclick="switchPlotMode('plant')" style="flex:1;padding:8px 0;border:none;background:#ffffff;border-radius:8px 8px 0 0;font-weight:700;font-size:13px;color:#059669;cursor:pointer;border-bottom:2.5px solid #059669;transition:all 0.2s;">
                🌿 标绘绿植作物
            </button>
            <button type="button" id="tabPlotAnimal" onclick="switchPlotMode('animal')" style="flex:1;padding:8px 0;border:none;background:transparent;border-radius:8px 8px 0 0;font-weight:700;font-size:13px;color:#64748b;cursor:pointer;border-bottom:2.5px solid transparent;transition:all 0.2s;">
                🐾 标绘生态动物
            </button>
        </div>

        <form id="addPlantForm" onsubmit="submitNewEcoMarker(event)">
            <input type="hidden" id="currentPlotType" value="plant">
            <div class="modal-body">
                <!-- 共有坐标信息 -->
                <div class="form-row">
                    <div class="form-group">
                        <label class="form-label">实景落点纬度</label>
                        <input type="text" class="form-control" name="latitude" id="modalPlantLat" readonly required style="font-family:monospace;font-weight:600;background:#f8fafc;">
                    </div>
                    <div class="form-group">
                        <label class="form-label">实景落点经度</label>
                        <input type="text" class="form-control" name="longitude" id="modalPlantLng" readonly required style="font-family:monospace;font-weight:600;background:#f8fafc;">
                    </div>
                </div>

                <!-- 1. 绿植标绘表单域 -->
                <div id="plotPlantFieldsWrap">
                    <div class="form-row">
                        <div class="form-group">
                            <label class="form-label">植株编号</label>
                            <input type="text" class="form-control" name="pid" id="modalPlantPid" placeholder="如 TF-PLANT-008">
                        </div>
                        <div class="form-group">
                            <label class="form-label">作物品类</label>
                            <select class="form-control" name="ptype" id="modalPlantType">
                                <% if (plantTypeList != null) for (PlantType pt : plantTypeList) { %>
                                    <option value="<%= pt.getTname() %>"><%= pt.getTname() %></option>
                                <% } %>
                            </select>
                        </div>
                    </div>
                    <div class="form-group">
                        <label class="form-label">植物作物名称</label>
                        <input type="text" class="form-control" name="pname" id="modalPlantName" placeholder="如 绵阳天府银杏四号">
                    </div>

                    <!-- 直接布置责任养护人员 -->
                    <div class="form-group" style="background:#ecfdf5;border:1.5px solid #a7f3d0;border-radius:10px;padding:10px 12px;">
                        <label class="form-label" style="color:#065f46;font-weight:700;">👤 布置责任养护人员</label>
                        <select class="form-control" name="maintainerId" id="modalPlantMaintainer">
                            <option value="">-- 暂不布置（稍后在作物卡片中编辑指派）--</option>
                            <% if (maintainerList != null) for (Maintainer m : maintainerList) { %>
                                <option value="<%= m.getId() %>">👤 <%= m.getName() %> · <%= m.getDepartment() != null ? m.getDepartment() : "绿化组" %> (<%= m.getDuty() != null ? m.getDuty() : "养护员" %> <%= m.getPhone() != null ? m.getPhone() : "" %>)</option>
                            <% } %>
                        </select>
                    </div>

                    <div class="form-group">
                        <label class="form-label">展示图片路径 / 图标</label>
                        <input type="text" class="form-control" name="ppic" id="modalPlantPic" value="greenkeeper/assets/plant-camphor.svg">
                    </div>
                    <div class="form-group">
                        <label class="form-label">水肥修药周期 (天)</label>
                        <div style="display:grid;grid-template-columns:repeat(4, 1fr);gap:6px;">
                            <input type="number" class="form-control" name="waterPeriodDays" value="7" title="浇水周期天数">
                            <input type="number" class="form-control" name="fertilizePeriodDays" value="30" title="施肥周期天数">
                            <input type="number" class="form-control" name="trimPeriodDays" value="60" title="修剪周期天数">
                            <input type="number" class="form-control" name="pestPeriodDays" value="45" title="放药周期天数">
                        </div>
                    </div>
                    <div class="form-group">
                        <label class="form-label">植株描述 / 备注</label>
                        <textarea class="form-control" name="pdesc" rows="2" placeholder="填写植株景观定位或特殊管养要求"></textarea>
                    </div>
                </div>

                <!-- 2. 生态动物标绘表单域 (默认隐藏，切换时展示) -->
                <div id="plotAnimalFieldsWrap" style="display:none;">
                    <div class="form-row">
                        <div class="form-group">
                            <label class="form-label">动物档案编号</label>
                            <input type="text" class="form-control" name="animalNo" id="modalAnimalNo" placeholder="如 AN-1006">
                        </div>
                        <div class="form-group">
                            <label class="form-label">动物门类划分</label>
                            <select class="form-control" name="category" id="modalAnimalCategory">
                                <option value="水禽鸟类">水禽鸟类 (天鹅/绿头鸭/野鸭)</option>
                                <option value="观赏鱼类">观赏鱼类 (锦鲤/草金)</option>
                                <option value="林栖哺乳类">林栖哺乳类 (松鼠/林兔)</option>
                                <option value="陆禽鸟类">陆禽鸟类 (孔雀/雉类)</option>
                                <option value="两栖类">两栖类 (水蛙/蝾螈)</option>
                            </select>
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label class="form-label">动物物种名称</label>
                            <input type="text" class="form-control" name="animalName" id="modalAnimalName" placeholder="如 白鹭 / 锦鲤群">
                        </div>
                        <div class="form-group">
                            <label class="form-label">个体/存栏数量</label>
                            <input type="number" class="form-control" name="count" id="modalAnimalCount" value="2" min="1">
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label class="form-label">栖息区域</label>
                            <input type="text" class="form-control" name="areaName" id="modalAnimalArea" value="天府湖水域生态区">
                        </div>
                        <div class="form-group">
                            <label class="form-label">专职保育员</label>
                            <input type="text" class="form-control" name="keeperName" id="modalAnimalKeeper" value="生态保育员">
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label class="form-label">投喂/巡查周期(天)</label>
                            <input type="number" class="form-control" name="feedingCycleDays" id="modalAnimalCycle" value="1" min="1">
                        </div>
                        <div class="form-group">
                            <label class="form-label">健康状况</label>
                            <select class="form-control" name="healthStatus" id="modalAnimalHealth">
                                <option value="健康活泼">健康活泼</option>
                                <option value="生长良好">生长良好</option>
                                <option value="重点观察">重点观察</option>
                            </select>
                        </div>
                    </div>
                    <div class="form-group">
                        <label class="form-label">食性与专用饲料</label>
                        <input type="text" class="form-control" name="dietType" id="modalAnimalDiet" value="专用配比配合禽料/水草" placeholder="如 专用配合颗粒料/坚果">
                    </div>
                    <div class="form-group">
                        <label class="form-label">生活习性与档案备注</label>
                        <textarea class="form-control" name="remark" id="modalAnimalRemark" rows="2" placeholder="填写动物栖息习性、保护重点与巡护要点"></textarea>
                    </div>
                </div>

            </div>
            <div class="modal-foot">
                <button type="button" class="btn-care" onclick="closeAddPlantModal()">取消</button>
                <button type="submit" class="btn-submit" id="btnModalSubmit" style="width:auto;padding:8px 18px;margin:0;">🌿 确认栽植入库</button>
            </div>
        </form>
    </div>
</div>

<!-- 模态弹窗：直接编辑作物档案与布置养护人员 -->
<div class="modal-mask" id="editCropModal">
    <div class="modal-card">
        <div class="modal-head">
            <h3>✏️ 编辑作物档案与布置养护人员</h3>
            <button type="button" style="border:none;background:transparent;font-size:18px;cursor:pointer;" onclick="closeEditCropModal()">✖</button>
        </div>
        <form id="editCropForm" onsubmit="submitEditCrop(event)">
            <input type="hidden" name="pid" id="editCropPid">
            <div class="modal-body">
                <div class="form-row">
                    <div class="form-group">
                        <label class="form-label">作物编号 (只读)</label>
                        <input type="text" class="form-control" id="editCropPidDisplay" readonly style="background:#f1f5f9;color:#64748b;font-weight:700;font-family:monospace;">
                    </div>
                    <div class="form-group">
                        <label class="form-label">作物品类</label>
                        <select class="form-control" name="ptype" id="editCropType">
                            <% if (plantTypeList != null) for (PlantType pt : plantTypeList) { %>
                                <option value="<%= pt.getTname() %>"><%= pt.getTname() %></option>
                            <% } %>
                        </select>
                    </div>
                </div>

                <div class="form-group">
                    <label class="form-label">作物名称</label>
                    <input type="text" class="form-control" name="pname" id="editCropName" required placeholder="如 天府第一银杏">
                </div>

                <!-- 核心：布置责任养护人员 -->
                <div class="form-group" style="background:#ecfdf5;border:1.5px solid #a7f3d0;border-radius:10px;padding:12px;">
                    <label class="form-label" style="color:#065f46;font-weight:800;display:flex;align-items:center;gap:6px;">
                        <span>👤</span> 布置责任养护人员
                    </label>
                    <select class="form-control" name="maintainerId" id="editCropMaintainer" style="border-color:#10b981;font-weight:600;">
                        <option value="">-- 暂不布置（设为【待布置】状态）--</option>
                        <% if (maintainerList != null) for (Maintainer m : maintainerList) { %>
                            <option value="<%= m.getId() %>">👤 <%= m.getName() %> · <%= m.getDepartment() != null ? m.getDepartment() : "绿化组" %> (<%= m.getDuty() != null ? m.getDuty() : "养护员" %> <%= m.getPhone() != null ? m.getPhone() : "" %>)</option>
                        <% } %>
                    </select>
                    <small style="color:#047857;font-size:11.5px;margin-top:6px;display:block;">
                        💡 保存后，该养护员将直接负责此作物的日常巡检、浇水、施肥及健康预警。
                    </small>
                </div>

                <div class="form-row">
                    <div class="form-group">
                        <label class="form-label">栽植日期</label>
                        <input type="date" class="form-control" name="pdatetime" id="editCropDate">
                    </div>
                    <div class="form-group">
                        <label class="form-label">展示图片/图标路径</label>
                        <input type="text" class="form-control" name="ppic" id="editCropPic" placeholder="greenkeeper/assets/plant-camphor.svg">
                    </div>
                </div>

                <div class="form-group">
                    <label class="form-label">养护周期 (天)</label>
                    <div style="display:grid;grid-template-columns:repeat(4, 1fr);gap:6px;">
                        <div>
                            <small style="color:#64748b;font-size:11px;">💧 浇水(天)</small>
                            <input type="number" class="form-control" name="waterPeriodDays" id="editCropWaterDays" min="1" value="7">
                        </div>
                        <div>
                            <small style="color:#64748b;font-size:11px;">🌱 施肥(天)</small>
                            <input type="number" class="form-control" name="fertilizePeriodDays" id="editCropFertDays" min="1" value="30">
                        </div>
                        <div>
                            <small style="color:#64748b;font-size:11px;">🍂 修剪(天)</small>
                            <input type="number" class="form-control" name="trimPeriodDays" id="editCropTrimDays" min="1" value="60">
                        </div>
                        <div>
                            <small style="color:#64748b;font-size:11px;">💊 放药(天)</small>
                            <input type="number" class="form-control" name="pestPeriodDays" id="editCropPestDays" min="1" value="45">
                        </div>
                    </div>
                </div>

                <div class="form-group">
                    <label class="form-label">作物说明 / 管养备注</label>
                    <textarea class="form-control" name="pdesc" id="editCropDesc" rows="2" placeholder="填写作物生长习性、修剪规范或注意事项"></textarea>
                </div>
            </div>
            <div class="modal-foot">
                <button type="button" class="btn-care" onclick="closeEditCropModal()">取消</button>
                <button type="submit" class="btn-submit" style="width:auto;padding:8px 20px;margin:0;">💾 保存档案与人员布置</button>
            </div>
        </form>
    </div>
</div>

<!-- 模态弹窗：安排/指派植株责任养护员 -->
<div class="modal-mask" id="assignMaintainerModal">
    <div class="modal-card" style="max-width:460px;">
        <div class="modal-head">
            <h3>👷 安排责任养护人员</h3>
            <button type="button" style="border:none;background:transparent;font-size:18px;cursor:pointer;" onclick="closeAssignModal()">✖</button>
        </div>
        <form id="assignMaintainerForm" onsubmit="submitPlantMaintainer(event)">
            <input type="hidden" name="pid" id="assignPid">
            <div class="modal-body">
                <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:12px;margin-bottom:14px;">
                    <div style="font-size:12px;color:#64748b;">待安排植株点位</div>
                    <div style="font-size:16px;font-weight:800;color:#0f172a;margin-top:2px;" id="assignPlantNameDisplay">天府第一银杏</div>
                    <div style="font-size:12px;color:#64748b;margin-top:2px;font-family:monospace;" id="assignPlantPidDisplay">编号: TF-PLANT-001</div>
                </div>

                <div class="form-group">
                    <label class="form-label" style="font-weight:700;">指派责任养护员</label>
                    <select class="form-control" name="maintainerId" id="assignMaintainerSelect" style="font-size:13.5px;">
                        <option value="">-- 暂不指派（设为【待指派】状态）--</option>
                        <% if (maintainerList != null) for (Maintainer m : maintainerList) { %>
                            <option value="<%= m.getId() %>">👤 <%= m.getName() %> · <%= m.getDepartment() != null ? m.getDepartment() : "绿化组" %> (<%= m.getDuty() != null ? m.getDuty() : "养护员" %>)</option>
                        <% } %>
                    </select>
                    <small style="color:#64748b;font-size:12px;margin-top:6px;display:block;line-height:1.4;">
                        💡 提示：指派养护员后，该人员将对该植株的日常浇水、施肥、修剪等管养全权负责并接收预警。
                    </small>
                </div>
            </div>
            <div class="modal-foot">
                <button type="button" class="btn-care" onclick="closeAssignModal()">取消</button>
                <button type="submit" class="btn-submit" style="width:auto;padding:8px 20px;margin:0;">💾 保存安排并入库</button>
            </div>
        </form>
    </div>
</div>

<!-- Leaflet GIS 脚本 -->
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>

<script>
    // 西南财经大学天府学院 多校区高精度实景地理配置（高德坐标系 GCJ-02）
    const CAMPUS_CONFIG = {
        mianyang: {
            id: 'mianyang',
            name: '绵阳校区（主校区）',
            shortName: '绵阳校区',
            icon: '🌲',
            city: '绵阳市',
            address: '四川省绵阳市科创园区园兴西街2号（九洲大道）',
            center: [31.492000, 104.689500],
            zoom: 17,
            desc: '科技城新区生态智慧园区 · 园兴西街'
        },
        chengdu_east: {
            id: 'chengdu_east',
            name: '成都校区（东区）',
            shortName: '成都东区',
            icon: '🏙️',
            city: '成都市',
            address: '成都市成华区龙潭街道龙港路399号',
            center: [30.702345, 104.190986],
            zoom: 17,
            desc: '现代化教学与龙潭水乡景观交融园区'
        },
        chengdu_west: {
            id: 'chengdu_west',
            name: '成都校区（西区）',
            shortName: '成都西区',
            icon: '🏢',
            city: '成都市',
            address: '成都市成华区龙潭街道航天路29号',
            center: [30.689503, 104.176309],
            zoom: 17,
            desc: '天府康养产教融合实训基地 · 航天路'
        },
        deyang: {
            id: 'deyang',
            name: '德阳校区',
            shortName: '德阳校区',
            icon: '🏛️',
            city: '德阳市',
            address: '四川省德阳市罗江区大学北路99号',
            center: [31.328200, 104.500800],
            zoom: 17,
            desc: '罗江生态山水校区 · 环山拥翠林荫带'
        }
    };

    let currentCampusKey = 'mianyang';
    let currentCampusListFilter = 'all';

    // 兼容原引用
    const campusCenter = CAMPUS_CONFIG['mianyang'].center;

    // 全局当前操作员
    const CURRENT_OPERATOR = '<%= js(currentOperator) %>';

    // 内存数据缓存（与后端 MySQL 实时双向同步）
    let currentPlants = [
        <% if (plantList != null) for (int i = 0; i < plantList.size(); i++) {
            Plant p = plantList.get(i);
            PlantMaintenance lastM = (lastMaintenanceMap != null) ? lastMaintenanceMap.get(p.getPid()) : null;
            Maintainer pm = (plantMaintainerMap != null) ? plantMaintainerMap.get(p.getPid()) : null;
        %>
            <%= i > 0 ? "," : "" %>{
                id: '<%= js(p.getPid()) %>',
                code: '<%= js(p.getPid()) %>',
                name: '<%= js(p.getPname()) %>',
                species: '<%= js(p.getPtype() != null ? p.getPtype() : "绿植") %>',
                plantedAt: '<%= js(p.getPdatetime() != null && p.getPdatetime().length() >= 10 ? p.getPdatetime().substring(0, 10) : "2024-03-12") %>',
                image: '<%= js(p.getPpic() != null && !p.getPpic().isEmpty() ? p.getPpic() : "greenkeeper/assets/plant-camphor.svg") %>',
                note: '<%= js(p.getPdesc() == null ? "" : p.getPdesc()) %>',
                lat: <%= p.getLatitude() == null ? 31.492761 : p.getLatitude() %>,
                lng: <%= p.getLongitude() == null ? 104.690207 : p.getLongitude() %>,
                maintainerId: <%= pm != null ? pm.getId() : "null" %>,
                maintainerName: <%= pm != null && pm.getName() != null ? "'" + js(pm.getName()) + "'" : "null" %>,
                maintainerDuty: <%= pm != null && pm.getDuty() != null ? "'" + js(pm.getDuty()) + "'" : "null" %>,
                maintainerPhone: <%= pm != null && pm.getPhone() != null ? "'" + js(pm.getPhone()) + "'" : "null" %>,
                waterPeriodDays: <%= p.getWaterPeriodDays() == null ? 7 : p.getWaterPeriodDays() %>,
                fertilizePeriodDays: <%= p.getFertilizePeriodDays() == null ? 30 : p.getFertilizePeriodDays() %>,
                trimPeriodDays: <%= p.getTrimPeriodDays() == null ? 60 : p.getTrimPeriodDays() %>,
                pestPeriodDays: <%= p.getPestPeriodDays() == null ? 45 : p.getPestPeriodDays() %>,
                nextWaterDate: <%= p.getNextWaterDate() == null ? "null" : "'" + p.getNextWaterDate() + "'" %>,
                nextFertilizeDate: <%= p.getNextFertilizeDate() == null ? "null" : "'" + p.getNextFertilizeDate() + "'" %>,
                nextTrimDate: <%= p.getNextTrimDate() == null ? "null" : "'" + p.getNextTrimDate() + "'" %>,
                nextPestDate: <%= p.getNextPestDate() == null ? "null" : "'" + p.getNextPestDate() + "'" %>,
                lastCareType: '<%= js(lastM != null && lastM.getMtype() != null ? lastM.getMtype() : "常规养护") %>',
                lastCareDate: '<%= js(lastM != null && lastM.getMdate() != null ? lastM.getMdate() : (p.getPdatetime() != null ? p.getPdatetime() : "2024-03-12")) %>'
            }
        <% } %>
    ];

    // 内存数据缓存：校园伴生生态动物（100% 真实来自 MySQL animal 表数据）
    let currentAnimals = [
        <% if (animalList != null) for (int i = 0; i < animalList.size(); i++) {
            Animal a = animalList.get(i);
        %>
            <%= i > 0 ? "," : "" %>{
                id: <%= a.getId() %>,
                animalNo: '<%= js(a.getAnimalNo()) %>',
                name: '<%= js(a.getName()) %>',
                species: '<%= js(a.getSpecies() != null ? a.getSpecies() : "") %>',
                category: '<%= js(a.getCategory() != null ? a.getCategory() : "水禽鸟类") %>',
                count: <%= a.getCount() %>,
                areaId: <%= a.getAreaId() == null ? "null" : a.getAreaId() %>,
                areaName: '<%= js(a.getAreaName() != null ? a.getAreaName() : "天府湖水域生态区") %>',
                lat: <%= a.getLatitude() == null ? 31.492200 : a.getLatitude() %>,
                lng: <%= a.getLongitude() == null ? 104.688200 : a.getLongitude() %>,
                healthStatus: '<%= js(a.getHealthStatus()) %>',
                dietType: '<%= js(a.getDietType() != null ? a.getDietType() : "") %>',
                feedingCycleDays: <%= a.getFeedingCycleDays() == null ? 1 : a.getFeedingCycleDays() %>,
                nextFeedingDate: <%= a.getNextFeedingDate() == null ? "null" : "'" + js(a.getNextFeedingDate()) + "'" %>,
                keeperName: '<%= js(a.getKeeperName()) %>',
                birthDate: <%= a.getBirthDate() == null ? "null" : "'" + js(a.getBirthDate()) + "'" %>,
                picUrl: '<%= js(a.getPicUrl() != null ? a.getPicUrl() : "") %>',
                remark: '<%= js(a.getRemark() != null ? a.getRemark() : "") %>'
            }
        <% } %>
    ];

    // Leaflet 实例与图层组
    let map = null;
    let plantMarkersGroup = null;
    let animalMarkersGroup = null;
    let tempSelectionMarker = null;

    // 交互状态
    let isPlacingMode = false;
    let showPlantsLayer = true;
    let showAnimalsLayer = true;
    let selectedPlant = null;
    let selectedAnimal = null;
    let currentPlantFilter = 'all';
    let currentEcoFilter = 'all'; // 'all', 'plant', 'animal'

    // 轻量级 Toast 提示框
    function showToast(msg, type = 'success') {
        let toast = document.getElementById('gkRealtimeToast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'gkRealtimeToast';
            toast.style.cssText = 'position:fixed;bottom:26px;right:26px;z-index:99999;padding:12px 20px;border-radius:10px;font-size:13px;font-weight:700;box-shadow:0 12px 30px rgba(0,0,0,0.22);transition:all 0.35s cubic-bezier(0.16,1,0.3,1);transform:translateY(24px);opacity:0;display:flex;align-items:center;gap:8px;';
            document.body.appendChild(toast);
        }
        if (type === 'success') {
            toast.style.background = '#065f46';
            toast.style.color = '#ffffff';
            toast.style.border = '1px solid #10b981';
        } else if (type === 'error') {
            toast.style.background = '#991b1b';
            toast.style.color = '#ffffff';
            toast.style.border = '1px solid #f87171';
        } else {
            toast.style.background = '#0f172a';
            toast.style.color = '#ffffff';
            toast.style.border = '1px solid #334155';
        }
        toast.innerHTML = msg;
        toast.style.transform = 'translateY(0)';
        toast.style.opacity = '1';
        if (window.toastTimer) clearTimeout(window.toastTimer);
        window.toastTimer = setTimeout(() => {
            toast.style.transform = 'translateY(24px)';
            toast.style.opacity = '0';
        }, 3200);
    }

    // 初始化高德实景地图
    function initMap() {
        // 1. 高德卫星实景 + 校园路网（maxNativeZoom: 18，maxZoom: 21，深度放大不白屏）
        const gdSat = L.tileLayer('https://webst0{s}.is.autonavi.com/appmaptile?style=6&x={x}&y={y}&z={z}', {
            subdomains: ['1', '2', '3', '4'],
            maxNativeZoom: 18,
            maxZoom: 21,
            attribution: '高德卫星实景 · 天府学院'
        });
        const gdLabel = L.tileLayer('https://webst0{s}.is.autonavi.com/appmaptile?style=8&x={x}&y={y}&z={z}', {
            subdomains: ['1', '2', '3', '4'],
            maxNativeZoom: 18,
            maxZoom: 21
        });
        const gdSatCombined = L.layerGroup([gdSat, gdLabel]);

        // 2. 高德高精矢量地图
        const gdVector = L.tileLayer('https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=7&x={x}&y={y}&z={z}', {
            subdomains: ['1', '2', '3', '4'],
            maxNativeZoom: 18,
            maxZoom: 21,
            attribution: '高德高精矢量'
        });

        // 3. ArcGIS 遥感影像
        const esriSat = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
            maxNativeZoom: 18,
            maxZoom: 21,
            attribution: 'ArcGIS 遥感'
        });

        map = L.map('areaGisMap', {
            zoomControl: false,
            maxZoom: 21,
            layers: [gdSatCombined]
        }).setView(CAMPUS_CONFIG[currentCampusKey].center, CAMPUS_CONFIG[currentCampusKey].zoom);

        L.control.zoom({ position: 'bottomright' }).addTo(map);

        const baseLayers = {
            "🛰️ 高德卫星影像 + 路网（推荐）": gdSatCombined,
            "🗺️ 高德高精矢量地图": gdVector,
            "🌍 ArcGIS 遥感影像": esriSat
        };
        L.control.layers(baseLayers, null, { position: 'topright' }).addTo(map);

        plantMarkersGroup = L.layerGroup().addTo(map);
        animalMarkersGroup = L.layerGroup().addTo(map);

        // 鼠标实时移动坐标显示
        const follower = document.getElementById('mouseCoordFollower');
        const hudCoords = document.getElementById('hudCoords');

        map.on('mousemove', function(e) {
            const lat = e.latlng.lat.toFixed(6);
            const lng = e.latlng.lng.toFixed(6);

            if (hudCoords) {
                hudCoords.textContent = lat + ', ' + lng;
            }

            if (follower) {
                follower.style.display = 'block';
                follower.style.left = e.containerPoint.x + 'px';
                follower.style.top = e.containerPoint.y + 'px';
                follower.innerHTML = '📍 经度: ' + lng + '<br>纬度: ' + lat;
            }
        });

        map.on('mouseout', function() {
            if (follower) follower.style.display = 'none';
        });

        // 点击地图落点标绘
        map.on('click', function(e) {
            const lat = parseFloat(e.latlng.lat.toFixed(6));
            const lng = parseFloat(e.latlng.lng.toFixed(6));
            onMapClickPlacePlant(lat, lng);
        });

        renderAllPlantMarkers();
        renderAllAnimalMarkers();
        updateKpiStats();
        renderPlantListCards();
    }

    // 切换校区实景地图下拉显隐
    function toggleCampusDropdown(e) {
        if (e) e.stopPropagation();
        const dd = document.getElementById('hudCampusDropdown');
        if (dd) dd.classList.toggle('open');
    }

    // 执行校区切换逻辑
    function selectCampus(campusKey, fly = true) {
        const cfg = CAMPUS_CONFIG[campusKey];
        if (!cfg) return;
        currentCampusKey = campusKey;

        // 1. 更新右上角 HUD 触发器展示
        const iconEl = document.getElementById('hudCampusIcon');
        const nameEl = document.getElementById('hudCampusName');
        if (iconEl) iconEl.textContent = cfg.icon;
        if (nameEl) nameEl.textContent = cfg.shortName;

        // 2. 更新下拉选项勾选状态
        document.querySelectorAll('.hud-campus-option').forEach(el => {
            if (el.getAttribute('data-campus') === campusKey) {
                el.classList.add('active');
            } else {
                el.classList.remove('active');
            }
        });

        // 3. 关闭下拉菜单
        const dd = document.getElementById('hudCampusDropdown');
        if (dd) dd.classList.remove('open');

        // 4. 地图平滑飞跃到该校区中心
        if (fly && map) {
            map.flyTo(cfg.center, cfg.zoom, { duration: 1.2 });
        }

        // 6. 更新顶部全景标题与横幅
        const titleEl = document.getElementById('heroCampusTitleText');
        if (titleEl) {
            titleEl.textContent = '西南财经大学天府学院（' + cfg.name + '）';
        }
        const banner = document.getElementById('placingBanner');
        if (banner) {
            banner.innerHTML = '<span>🎯 植株标绘模式已激活：请在【' + cfg.name + '】高德实景地图上点击任意落点以栽植新作物！再次点击按钮可取消。</span>';
        }

        // 7. 重新刷新左侧卡片与统计指标
        renderPlantListCards();
        updateKpiStats();

        showToast('🗺️ 已平滑切换至【' + cfg.name + '】实景地图！', 'success');
    }

    // 左侧校区快捷筛选标签切换
    function setCampusListFilter(filterKey, btn) {
        currentCampusListFilter = filterKey;
        document.querySelectorAll('.campus-chip').forEach(c => c.classList.remove('active'));
        if (btn) btn.classList.add('active');

        // 如果点击具体校区（不是全部），自动联动地图平滑飞往该校区
        if (filterKey !== 'all' && CAMPUS_CONFIG[filterKey]) {
            if (currentCampusKey !== filterKey) {
                selectCampus(filterKey, true);
                return;
            }
        }
        renderPlantListCards();
        updateKpiStats();
    }

    // 点击其他空白处关闭校区下拉菜单
    document.addEventListener('click', function(e) {
        const dd = document.getElementById('hudCampusDropdown');
        if (dd && !dd.contains(e.target)) {
            dd.classList.remove('open');
        }
    });

    // 根据经纬度推断植株归属校区
    function getPlantCampusKey(p) {
        if (!p || !p.lat || !p.lng) return 'mianyang';
        return getCoordsCampusKey(p.lat, p.lng);
    }

    function getCoordsCampusKey(lat, lng) {
        if (!lat || !lng) return 'mianyang';
        lat = parseFloat(lat);
        lng = parseFloat(lng);
        // 绵阳校区 (31.491800, 104.689000)
        if (Math.abs(lat - 31.491800) < 0.08 && Math.abs(lng - 104.689000) < 0.08) return 'mianyang';
        // 成都东区 (30.702345, 104.190986)
        if (Math.abs(lat - 30.702345) < 0.05 && Math.abs(lng - 104.190986) < 0.05) return 'chengdu_east';
        // 成都西区 (30.689503, 104.176309)
        if (Math.abs(lat - 30.689503) < 0.05 && Math.abs(lng - 104.176309) < 0.05) return 'chengdu_west';
        // 德阳校区 (31.328200, 104.500800)
        if (Math.abs(lat - 31.328200) < 0.08 && Math.abs(lng - 104.500800) < 0.08) return 'deyang';

        let minDist = 999999;
        let closestKey = 'mianyang';
        for (const key in CAMPUS_CONFIG) {
            const c = CAMPUS_CONFIG[key];
            const dist = Math.hypot(lat - c.center[0], lng - c.center[1]);
            if (dist < minDist) {
                minDist = dist;
                closestKey = key;
            }
        }
        return closestKey;
    }

    // 计算植株健康预警状态
    function getPlantStatus(p) {
        const today = new Date().toISOString().substring(0, 10);
        function isOverdue(dateStr) {
            return dateStr && dateStr < today;
        }
        function isDue(dateStr) {
            if (!dateStr) return false;
            const target = new Date(dateStr);
            const diffDays = Math.ceil((target - new Date()) / (1000 * 3600 * 24));
            return diffDays >= 0 && diffDays <= 3;
        }

        if (isOverdue(p.nextWaterDate) || isOverdue(p.nextFertilizeDate) || isOverdue(p.nextTrimDate) || isOverdue(p.nextPestDate)) {
            return 'overdue';
        }
        if (isDue(p.nextWaterDate) || isDue(p.nextFertilizeDate) || isDue(p.nextTrimDate) || isDue(p.nextPestDate)) {
            return 'due';
        }
        return 'normal';
    }

    function getPlantSafeImage(img) {
        if (!img || typeof img !== 'string') return 'greenkeeper/assets/plant-camphor.svg';
        if (img.includes('nipic')) return 'greenkeeper/assets/plant-camphor.svg';
        return img;
    }

    // 渲染所有作物图钉 (支持自由拖拽调位持久化)
    function renderAllPlantMarkers() {
        if (!map || !plantMarkersGroup) return;
        plantMarkersGroup.clearLayers();
        if (!showPlantsLayer) return;

        currentPlants.forEach(p => {
            const status = getPlantStatus(p);
            p.status = status;

            if (currentPlantFilter === 'due' && status !== 'due') return;
            if (currentPlantFilter === 'overdue' && status !== 'overdue') return;
            if (currentPlantFilter === 'unassigned' && (p.maintainerName && p.maintainerName.trim())) return;

            const safeImg = getPlantSafeImage(p.image);
            const iconHtml = '<div class="gk-marker" data-status="' + status + '" data-id="' + p.id + '">' +
                '<div class="gk-marker__ring">' +
                    '<img src="' + safeImg + '" alt="' + p.name + '" onerror="this.src=\'greenkeeper/assets/plant-camphor.svg\'">' +
                '</div>' +
                '<div class="gk-marker__label">' + p.name + '</div>' +
                '<div class="gk-marker__dot"></div>' +
            '</div>';

            const divIcon = L.divIcon({
                className: 'gk-leaflet-marker-wrap',
                html: iconHtml,
                iconSize: [54, 60],
                iconAnchor: [27, 30]
            });

            const marker = L.marker([p.lat, p.lng], {
                icon: divIcon,
                draggable: true
            }).addTo(plantMarkersGroup);

            // 点击图钉打开一树一档抽屉
            marker.on('click', () => {
                openPlantDrawer(p);
            });

            // 拖拽结束时自动持久化新坐标至 MySQL
            marker.on('dragend', function(e) {
                const newPos = e.target.getLatLng();
                const newLat = parseFloat(newPos.lat.toFixed(6));
                const newLng = parseFloat(newPos.lng.toFixed(6));
                p.lat = newLat;
                p.lng = newLng;

                showToast('⏳ 正在同步【' + p.name + '】新坐标至数据库...', 'info');

                const params = new URLSearchParams();
                params.append('action', 'updatePlantLocation');
                params.append('pid', p.id);
                params.append('latitude', newLat);
                params.append('longitude', newLng);
                params.append('ajax', 'true');

                fetch('AreaServlet', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest' },
                    body: params.toString()
                })
                .then(r => r.json())
                .then(res => {
                    if (res.success) {
                        showToast('📍 【' + p.name + '】新坐标 (' + newLat + ', ' + newLng + ') 已成功持久化！', 'success');
                        renderPlantListCards();
                        if (selectedPlant && selectedPlant.id === p.id) {
                            document.getElementById('drawerPlantCoords').textContent = newLat + ', ' + newLng;
                        }
                    } else {
                        showToast('⚠️ 保存新坐标失败: ' + res.message, 'error');
                    }
                })
                .catch(err => {
                    console.error('更新坐标错误:', err);
                    showToast('⚠️ 更新异常: ' + err.message, 'error');
                });
            });
        });
    }

    // 🐾 辅助解析动物 Emoji 图标
    function getAnimalEmoji(name, category) {
        if (!name) name = '';
        if (!category) category = '';
        if (name.includes('黑天鹅') || name.includes('天鹅') || name.includes('鹅')) return '🦢';
        if (name.includes('锦鲤') || name.includes('鱼')) return '🐟';
        if (name.includes('松鼠') || name.includes('鼠')) return '🐿️';
        if (name.includes('孔雀')) return '🦚';
        if (name.includes('鸭')) return '🦆';
        if (category.includes('鱼')) return '🐟';
        if (category.includes('两栖') || name.includes('蛙')) return '🐸';
        if (category.includes('鸟') || category.includes('禽')) return '🕊️';
        return '🐾';
    }

    // 🐾 渲染所有校园生态动物图钉 (100% 真实来自 MySQL animal 表)
    function renderAllAnimalMarkers() {
        if (!map || !animalMarkersGroup) return;
        animalMarkersGroup.clearLayers();
        if (!showAnimalsLayer || currentEcoFilter === 'plant') return;

        currentAnimals.forEach(a => {
            // 真实地理校区匹配（绵阳校区核心湖区与林带）
            const aCampus = getCoordsCampusKey(a.lat, a.lng);
            if (currentCampusListFilter !== 'all' && aCampus !== currentCampusListFilter) return;

            const emoji = getAnimalEmoji(a.name, a.category);
            const isObserved = a.healthStatus && (a.healthStatus.includes('观察') || a.healthStatus.includes('病') || a.healthStatus.includes('隔离'));
            const statusDotCls = isObserved ? 'warning' : 'healthy';

            const iconHtml = '<div class="gk-marker animal-marker" data-id="' + a.id + '" title="' + escapeHtml(a.name) + ' (' + a.count + '只/尾)">' +
                '<div class="gk-marker__ring animal-ring">' +
                    '<span class="animal-emoji">' + emoji + '</span>' +
                '</div>' +
                '<div class="gk-marker__label animal-label">' + escapeHtml(a.name) + ' · ' + a.count + (a.species && a.species.includes('鱼') ? '尾' : '只') + '</div>' +
                '<div class="gk-marker__dot ' + statusDotCls + '"></div>' +
            '</div>';

            const divIcon = L.divIcon({
                className: 'gk-leaflet-marker-wrap gk-animal-marker-wrap',
                html: iconHtml,
                iconSize: [54, 60],
                iconAnchor: [27, 30]
            });

            const marker = L.marker([a.lat, a.lng], {
                icon: divIcon,
                draggable: true
            }).addTo(animalMarkersGroup);

            // 点击动物图钉打开动物滑出式抽屉
            marker.on('click', () => {
                openAnimalDrawer(a);
            });

            // 拖拽动物调整栖息地坐标并持久化至 MySQL
            marker.on('dragend', function(e) {
                const newPos = e.target.getLatLng();
                const newLat = parseFloat(newPos.lat.toFixed(6));
                const newLng = parseFloat(newPos.lng.toFixed(6));
                a.lat = newLat;
                a.lng = newLng;

                showToast('⏳ 正在同步【' + a.name + '】新栖息坐标至 MySQL 数据库...', 'info');

                const params = new URLSearchParams();
                params.append('action', 'updateAnimalLocation');
                params.append('id', a.id);
                params.append('latitude', newLat);
                params.append('longitude', newLng);
                params.append('ajax', 'true');

                fetch('AreaServlet', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest' },
                    body: params.toString()
                })
                .then(r => r.json())
                .then(res => {
                    if (res.success) {
                        showToast('🐾 【' + a.name + '】栖息新坐标 (' + newLat + ', ' + newLng + ') 已成功持久化！', 'success');
                        renderPlantListCards();
                        if (selectedAnimal && selectedAnimal.id === a.id) {
                            const cEl = document.getElementById('drawerAnimalCoords');
                            if (cEl) cEl.textContent = newLat + ', ' + newLng;
                        }
                    } else {
                        showToast('⚠️ 保存动物新坐标失败: ' + res.message, 'error');
                    }
                })
                .catch(err => {
                    console.error('更新动物坐标错误:', err);
                    showToast('⚠️ 更新异常: ' + err.message, 'error');
                });
            });
        });
    }

    // 🌿/🐾 生态类型主筛选切换 (全部生态 / 绿植 / 动物)
    function setEcoTypeFilter(type, btn) {
        currentEcoFilter = type;
        document.querySelectorAll('.eco-tab-btn').forEach(b => {
            b.classList.remove('active');
            b.style.background = 'transparent';
            b.style.color = '#475569';
            b.style.boxShadow = 'none';
        });
        btn.classList.add('active');
        btn.style.background = '#ffffff';
        btn.style.color = '#0f172a';
        btn.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';

        if (type === 'plant') {
            showPlantsLayer = true;
            showAnimalsLayer = false;
        } else if (type === 'animal') {
            showPlantsLayer = false;
            showAnimalsLayer = true;
        } else {
            showPlantsLayer = true;
            showAnimalsLayer = true;
        }
        renderAllPlantMarkers();
        renderAllAnimalMarkers();
        renderPlantListCards();
    }

    // 更新顶部 KPI 指标（支持校区联动统计）
    function updateKpiStats() {
        const plantCountEl = document.getElementById('statPlantCount');
        const animalCountEl = document.getElementById('statAnimalCount');
        const dueEl = document.getElementById('statDueCount');
        const overdueEl = document.getElementById('statOverdueCount');

        let filteredPlants = currentPlants;
        let filteredAnimals = currentAnimals;
        if (currentCampusListFilter !== 'all') {
            filteredPlants = currentPlants.filter(p => getPlantCampusKey(p) === currentCampusListFilter);
            filteredAnimals = currentAnimals.filter(a => getCoordsCampusKey(a.lat, a.lng) === currentCampusListFilter);
        }

        if (plantCountEl) plantCountEl.textContent = filteredPlants.length;
        if (animalCountEl) animalCountEl.textContent = filteredAnimals.length;

        const countEcoAllEl = document.getElementById('countEcoAll');
        if (countEcoAllEl) countEcoAllEl.textContent = filteredPlants.length + filteredAnimals.length;
        const countEcoPlantEl = document.getElementById('countEcoPlant');
        if (countEcoPlantEl) countEcoPlantEl.textContent = filteredPlants.length;
        const countEcoAnimalEl = document.getElementById('countEcoAnimal');
        if (countEcoAnimalEl) countEcoAnimalEl.textContent = filteredAnimals.length;

        let due = 0, overdue = 0;
        filteredPlants.forEach(p => {
            const st = getPlantStatus(p);
            if (st === 'due') due++;
            if (st === 'overdue') overdue++;
        });
        if (dueEl) dueEl.textContent = due;
        if (overdueEl) overdueEl.textContent = overdue;
    }

    // 渲染左侧生态列表卡片（支持绿植 + 动物双生态综合排版）
    function renderPlantListCards() {
        const container = document.getElementById('plantsListContainer');
        if (!container) return;

        const kw = (document.getElementById('plantSearchInput').value || '').trim().toLowerCase();
        let html = '';

        // 1. 渲染绿植卡片 (全部 或 仅绿植)
        if (currentEcoFilter === 'all' || currentEcoFilter === 'plant') {
            currentPlants.forEach(p => {
                const status = getPlantStatus(p);
                const pCampusKey = getPlantCampusKey(p);
                const pCampusCfg = CAMPUS_CONFIG[pCampusKey] || CAMPUS_CONFIG['mianyang'];

                // 校区筛选联动
                if (currentCampusListFilter !== 'all' && pCampusKey !== currentCampusListFilter) return;

                // 状态筛选
                if (currentPlantFilter === 'due' && status !== 'due') return;
                if (currentPlantFilter === 'overdue' && status !== 'overdue') return;
                if (currentPlantFilter === 'unassigned' && (p.maintainerName && p.maintainerName.trim())) return;
                if (kw && !p.name.toLowerCase().includes(kw) && !p.code.toLowerCase().includes(kw) && !p.species.toLowerCase().includes(kw)) {
                    return;
                }

                let statusBadge = '<span class="badge-status normal">长势良好</span>';
                if (status === 'due') statusBadge = '<span class="badge-status due">⚠️ 临期</span>';
                if (status === 'overdue') statusBadge = '<span class="badge-status overdue">🚨 超期</span>';

                let maintainerBadge = '';
                if (p.maintainerName && p.maintainerName.trim()) {
                    maintainerBadge = '<span class="maintainer-tag assigned">👤 ' + escapeHtml(p.maintainerName) + '</span>';
                } else {
                    maintainerBadge = '<span class="maintainer-tag unassigned">⚠️ 待布置人员</span>';
                }

                const activeCls = (selectedPlant && selectedPlant.id === p.id) ? 'active' : '';
                const coordStr = (p.lat && p.lng) ? (parseFloat(p.lat).toFixed(5) + ', ' + parseFloat(p.lng).toFixed(5)) : '未标绘';
                const campusBadge = '<span class="plant-campus-tag" title="' + pCampusCfg.name + '">' + pCampusCfg.icon + ' ' + pCampusCfg.shortName + '</span>';

                html += '<div class="plant-item-card ' + activeCls + '" onclick="focusPlant(\'' + p.id + '\')">' +
                    '<div class="plant-card-header">' +
                        '<img src="' + getPlantSafeImage(p.image) + '" class="plant-thumb" alt="' + p.name + '" onerror="this.src=\'greenkeeper/assets/plant-camphor.svg\'">' +
                        '<div class="plant-info">' +
                            '<div class="plant-info-title">' +
                                '<span>' + escapeHtml(p.name) + '</span>' + campusBadge + statusBadge +
                            '</div>' +
                            '<div class="plant-info-desc">' + escapeHtml(p.species) + ' · ' + p.code + '</div>' +
                        '</div>' +
                    '</div>' +
                    '<div class="plant-card-meta">' +
                        '<div>' + maintainerBadge + '</div>' +
                        '<div style="font-family:monospace;font-size:11px;color:#64748b;">📍 ' + coordStr + '</div>' +
                    '</div>' +
                    '<div class="plant-card-actions">' +
                        '<button type="button" class="btn-card-action primary" onclick="event.stopPropagation(); openEditCropModal(\'' + p.id + '\')">✏️ 编辑/布置人员</button>' +
                        '<button type="button" class="btn-card-action" onclick="event.stopPropagation(); focusPlant(\'' + p.id + '\')">🔍 定位与档案</button>' +
                    '</div>' +
                '</div>';
            });
        }

        // 2. 渲染动物卡片 (全部 或 仅动物，100% 真实来自 MySQL)
        if (currentEcoFilter === 'all' || currentEcoFilter === 'animal') {
            currentAnimals.forEach(a => {
                const aCampusKey = getCoordsCampusKey(a.lat, a.lng);
                const aCampusCfg = CAMPUS_CONFIG[aCampusKey] || CAMPUS_CONFIG['mianyang'];

                if (currentCampusListFilter !== 'all' && aCampusKey !== currentCampusListFilter) return;

                if (kw && !a.name.toLowerCase().includes(kw) && !a.animalNo.toLowerCase().includes(kw) && !a.category.toLowerCase().includes(kw) && !a.areaName.toLowerCase().includes(kw)) {
                    return;
                }

                const emoji = getAnimalEmoji(a.name, a.category);
                const isObserved = a.healthStatus && (a.healthStatus.includes('观察') || a.healthStatus.includes('病') || a.healthStatus.includes('隔离'));
                const statusBadge = isObserved
                    ? '<span class="badge-status due">⚠️ 重点观察</span>'
                    : '<span class="badge-status normal" style="background:#ecfdf5;color:#059669;">🐾 健康在册</span>';

                const activeCls = (selectedAnimal && selectedAnimal.id === a.id) ? 'active' : '';
                const coordStr = (a.lat && a.lng) ? (parseFloat(a.lat).toFixed(5) + ', ' + parseFloat(a.lng).toFixed(5)) : '未标绘';
                const campusBadge = '<span class="plant-campus-tag" style="background:#fef3c7;color:#b45309;" title="' + aCampusCfg.name + '">🐾 ' + aCampusCfg.shortName + '</span>';

                html += '<div class="plant-item-card animal-item-card ' + activeCls + '" onclick="focusAnimal(' + a.id + ')">' +
                    '<div class="plant-card-header">' +
                        '<div style="width:48px;height:48px;border-radius:12px;background:#fef3c7;border:2px solid #f59e0b;display:flex;align-items:center;justify-content:center;font-size:26px;flex-shrink:0;">' + emoji + '</div>' +
                        '<div class="plant-info">' +
                            '<div class="plant-info-title">' +
                                '<span>' + escapeHtml(a.name) + '</span>' + campusBadge + statusBadge +
                            '</div>' +
                            '<div class="plant-info-desc">' + escapeHtml(a.category) + ' · ' + a.animalNo + ' · 存栏 <b>' + a.count + (a.species && a.species.includes('鱼') ? '尾' : '只') + '</b></div>' +
                        '</div>' +
                    '</div>' +
                    '<div class="plant-card-meta">' +
                        '<div><span class="maintainer-tag assigned" style="background:#fef3c7;color:#92400e;">🐾 保育: ' + escapeHtml(a.keeperName || '生态保育员') + '</span></div>' +
                        '<div style="font-family:monospace;font-size:11px;color:#64748b;">📍 ' + coordStr + '</div>' +
                    '</div>' +
                    '<div class="plant-card-actions">' +
                        '<button type="button" class="btn-card-action primary" onclick="event.stopPropagation(); quickFeedAnimal(' + a.id + ', \'' + escapeHtml(a.name) + '\')">🐟 投喂打卡</button>' +
                        '<button type="button" class="btn-card-action" onclick="event.stopPropagation(); focusAnimal(' + a.id + ')">🔍 定位/档案</button>' +
                    '</div>' +
                '</div>';
            });
        }

        if (!html) {
            html = '<div style="text-align:center;padding:40px 10px;color:#94a3b8;font-size:13px;">未找到匹配的校园绿植或伴生动物</div>';
        }
        container.innerHTML = html;
    }

    // 搜索与过滤
    function filterPlants() {
        renderPlantListCards();
    }
    function setPlantFilter(type, btn) {
        currentPlantFilter = type;
        document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        renderAllPlantMarkers();
        renderPlantListCards();
    }

    // 定位并高亮指定植物（自动识别并联动所属校区）
    function focusPlant(pid) {
        const p = currentPlants.find(item => item.id === pid);
        if (!p) return;
        selectedPlant = p;

        // 若点击的植物在其他校区，自动联动切换当前校区状态（不重复平滑飞跃）
        const pCampus = getPlantCampusKey(p);
        if (pCampus && pCampus !== currentCampusKey) {
            selectCampus(pCampus, false);
        }

        renderPlantListCards();
        map.flyTo([p.lat, p.lng], 19, { duration: 1 });
        openPlantDrawer(p);
    }

    // 打开一树一档抽屉
    function openPlantDrawer(p) {
        selectedPlant = p;
        const drawer = document.getElementById('gkPlantDrawer');
        const pCampus = getPlantCampusKey(p);
        const pCampusCfg = CAMPUS_CONFIG[pCampus] || CAMPUS_CONFIG['mianyang'];

        document.getElementById('drawerPlantName').textContent = p.name;
        document.getElementById('drawerPlantMeta').textContent = p.species + ' · ' + p.code + ' · ' + pCampusCfg.shortName;
        document.getElementById('drawerCoverImg').src = getPlantSafeImage(p.image);

        document.getElementById('drawerPlantCoords').textContent = parseFloat(p.lat).toFixed(6) + ', ' + parseFloat(p.lng).toFixed(6);
        document.getElementById('drawerPlantDate').textContent = p.plantedAt || '2024-03-12';
        const descEl = document.getElementById('drawerPlantDesc');
        if (descEl) descEl.textContent = p.note || (pCampusCfg.name + '实景作物');

        const drawerMaintainer = document.getElementById('drawerPlantMaintainer');
        if (drawerMaintainer) {
            if (p.maintainerName && p.maintainerName.trim()) {
                const dutyText = p.maintainerDuty ? ' (' + p.maintainerDuty + ')' : '';
                drawerMaintainer.innerHTML = '<span style="color:#0369a1;background:#e0f2fe;padding:2px 8px;border-radius:10px;font-size:12px;">👤 ' + escapeHtml(p.maintainerName) + dutyText + '</span> <a href="javascript:void(0)" onclick="openEditCropModal(\'' + p.id + '\')" style="font-size:12px;color:#10b981;margin-left:4px;font-weight:700;">[更换]</a>';
            } else {
                drawerMaintainer.innerHTML = '<span style="color:#b91c1c;background:#fef2f2;padding:2px 8px;border-radius:10px;font-size:12px;">待布置</span> <a href="javascript:void(0)" onclick="openEditCropModal(\'' + p.id + '\')" style="font-size:12px;color:#059669;font-weight:700;margin-left:4px;">[立即布置]</a>';
            }
        }

        const st = getPlantStatus(p);
        const badge = document.getElementById('drawerHealthBadge');
        if (st === 'overdue') {
            badge.className = 'badge-status overdue';
            badge.textContent = '🚨 需尽快养护';
        } else if (st === 'due') {
            badge.className = 'badge-status due';
            badge.textContent = '⚠️ 养护临期';
        } else {
            badge.className = 'badge-status normal';
            badge.textContent = '长势良好';
        }

        // 养护周期卡片
        const metricsBox = document.getElementById('drawerCareMetrics');
        metricsBox.innerHTML = `
            <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:8px 10px;">
                <div style="font-size:11px;color:#64748b;">💧 下次浇水</div>
                <div style="font-size:12.5px;font-weight:700;margin-top:2px;">\${p.nextWaterDate || '每周常规'}</div>
            </div>
            <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:8px 10px;">
                <div style="font-size:11px;color:#64748b;">🌱 下次施肥</div>
                <div style="font-size:12.5px;font-weight:700;margin-top:2px;">\${p.nextFertilizeDate || '月度追肥'}</div>
            </div>
            <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:8px 10px;">
                <div style="font-size:11px;color:#64748b;">🍂 下次修剪</div>
                <div style="font-size:12.5px;font-weight:700;margin-top:2px;">\${p.nextTrimDate || '季度定型'}</div>
            </div>
            <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:8px 10px;">
                <div style="font-size:11px;color:#64748b;">💊 下次放药</div>
                <div style="font-size:12.5px;font-weight:700;margin-top:2px;">\${p.nextPestDate || '定期防虫'}</div>
            </div>
        `;

        drawer.classList.add('open');
        loadPlantTimeline(p.id);
    }

    function closePlantDrawer() {
        document.getElementById('gkPlantDrawer').classList.remove('open');
    }

    // 异步加载该植株的养护流水时间轴
    function loadPlantTimeline(pid) {
        const tl = document.getElementById('drawerTimeline');
        tl.innerHTML = '<div style="font-size:12px;color:#94a3b8;padding:10px 0;">⏳ 正在读取养护台账...</div>';

        fetch('AreaServlet?action=getPlantRecords&pid=' + encodeURIComponent(pid))
        .then(r => r.json())
        .then(res => {
            if (res.success && res.records && res.records.length > 0) {
                let html = '';
                res.records.forEach(m => {
                    html += '<div class="gk-tl__item" data-type="' + m.type + '">' +
                        '<div class="gk-tl__h">' +
                            '<span class="gk-tl__t">【' + m.type + '】' + (m.operator || '园艺师') + '</span>' +
                            '<span class="gk-tl__d">' + (m.date || '') + '</span>' +
                        '</div>' +
                        '<div class="gk-tl__b">' + (m.note || '日常养护作业完成') + '</div>' +
                    '</div>';
                });
                tl.innerHTML = html;
            } else {
                tl.innerHTML = '<div class="gk-empty" style="padding:10px 0;font-size:12px;color:#94a3b8;">暂无养护流水，点击上方按钮即可新增记录。</div>';
            }
        })
        .catch(err => {
            tl.innerHTML = '<div style="font-size:12px;color:#ef4444;">读取流水失败</div>';
        });
    }

    // 快速记录养护 (💧浇水, 🌱施肥, 🍂修剪, 💊放药)
    function quickDoCare(mtype) {
        if (!selectedPlant) return;
        const note = prompt('请输入【' + mtype + '】作业说明（直接确定将使用系统默认规范记录）：', '执行' + mtype + '，植株长势健康');
        if (note === null) return;

        const params = new URLSearchParams();
        params.append('action', 'addMaintenanceRecord');
        params.append('pid', selectedPlant.id);
        params.append('mtype', mtype);
        params.append('operator', CURRENT_OPERATOR);
        params.append('note', note || ('完成' + mtype + '养护'));
        params.append('ajax', 'true');

        showToast('⏳ 正在写入【' + mtype + '】养护流水...', 'info');

        fetch('AreaServlet', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest' },
            body: params.toString()
        })
        .then(r => r.json())
        .then(res => {
            if (res.success) {
                showToast('✅ 成功记录【' + mtype + '】养护作业！', 'success');
                loadPlantTimeline(selectedPlant.id);
                if (res.plants) {
                    currentPlants = res.plants;
                    renderAllPlantMarkers();
                    renderPlantListCards();
                    updateKpiStats();
                }
            } else {
                showToast('⚠️ 记录失败: ' + res.message, 'error');
            }
        })
        .catch(err => {
            showToast('⚠️ 请求失败: ' + err.message, 'error');
        });
    }

    // 标绘模式开关
    function togglePlaceMode() {
        isPlacingMode = !isPlacingMode;
        const btn = document.getElementById('btnTogglePlaceMode');
        const banner = document.getElementById('placingBanner');
        const mapDiv = document.getElementById('areaGisMap');
        const cfg = CAMPUS_CONFIG[currentCampusKey] || CAMPUS_CONFIG['mianyang'];

        if (isPlacingMode) {
            btn.classList.add('active');
            btn.innerHTML = '<span>✖️ 取消标绘</span>';
            banner.style.display = 'flex';
            banner.innerHTML = '<span>🎯 植株标绘模式已激活：请在【' + cfg.name + '】高德地图上点击任意落点以栽植新作物！再次点击按钮可取消。</span>';
            mapDiv.style.cursor = 'crosshair';
            showToast('🎯 请在【' + cfg.shortName + '】高德实景地图上点击落点以标绘新植物！', 'info');
        } else {
            btn.classList.remove('active');
            btn.innerHTML = '<span>🌿 标绘新植株</span>';
            banner.style.display = 'none';
            mapDiv.style.cursor = '';
            if (tempSelectionMarker) {
                map.removeLayer(tempSelectionMarker);
                tempSelectionMarker = null;
            }
        }
    }

    // 点击地图触发植株标绘弹窗
    function onMapClickPlacePlant(lat, lng) {
        lat = parseFloat(lat.toFixed(6));
        lng = parseFloat(lng.toFixed(6));

        // 临时标记
        if (tempSelectionMarker) {
            tempSelectionMarker.setLatLng([lat, lng]);
        } else {
            const selectPinHtml = '<div class="select-pin-anim">' +
                '<div class="select-pin-head">🌱 栽植点位</div>' +
                '<div class="select-pin-dot"></div>' +
            '</div>';
            const selectIcon = L.divIcon({
                className: 'select-pin-wrap',
                html: selectPinHtml,
                iconSize: [90, 40],
                iconAnchor: [45, 40]
            });
            tempSelectionMarker = L.marker([lat, lng], { icon: selectIcon }).addTo(map);
        }

        // 填充弹窗坐标
        document.getElementById('modalPlantLat').value = lat;
        document.getElementById('modalPlantLng').value = lng;
        
        // 自动计算建议下一个植物编号
        let maxIdx = 0;
        currentPlants.forEach(p => {
            const m = p.code && p.code.match(/(?:TF-PLANT-|PLANT-)(\d+)/i);
            if (m) {
                const n = parseInt(m[1]);
                if (n > maxIdx) maxIdx = n;
            }
        });
        const nextPid = 'TF-PLANT-' + String(maxIdx + 1).padStart(3, '0');
        document.getElementById('modalPlantPid').value = nextPid;

        // 根据落点经纬度自动感知校区
        const clickedCampus = getCoordsCampusKey(lat, lng);
        const clickedCfg = CAMPUS_CONFIG[clickedCampus] || CAMPUS_CONFIG[currentCampusKey];
        document.getElementById('modalPlantName').value = clickedCfg.shortName + '新标绘植株' + (maxIdx + 1) + '号';
        document.getElementById('modalPlantDesc').value = '西南财经大学天府学院（' + clickedCfg.name + '）实景标绘绿植，地址：' + clickedCfg.address;

        // 打开弹窗
        document.getElementById('addPlantModal').classList.add('open');
    }

    function closeAddPlantModal() {
        document.getElementById('addPlantModal').classList.remove('open');
        if (tempSelectionMarker) {
            map.removeLayer(tempSelectionMarker);
            tempSelectionMarker = null;
        }
    }

    // 切换标绘模式（绿植 / 动物）
    function switchPlotMode(mode) {
        document.getElementById('currentPlotType').value = mode;
        const tabPlant = document.getElementById('tabPlotPlant');
        const tabAnimal = document.getElementById('tabPlotAnimal');
        const plantWrap = document.getElementById('plotPlantFieldsWrap');
        const animalWrap = document.getElementById('plotAnimalFieldsWrap');
        const submitBtn = document.getElementById('btnModalSubmit');
        const titleEl = document.getElementById('modalPlotTitle');

        if (mode === 'animal') {
            tabPlant.style.background = 'transparent';
            tabPlant.style.color = '#64748b';
            tabPlant.style.borderBottom = '2.5px solid transparent';
            tabAnimal.style.background = '#ffffff';
            tabAnimal.style.color = '#d97706';
            tabAnimal.style.borderBottom = '2.5px solid #d97706';

            plantWrap.style.display = 'none';
            animalWrap.style.display = 'block';
            submitBtn.textContent = '🐾 确认动物标绘入库';
            submitBtn.style.background = '#d97706';
            titleEl.textContent = '🐾 标绘新伴生生态动物';

            let maxIdx = 1000;
            currentAnimals.forEach(a => {
                const m = a.animalNo && a.animalNo.match(/AN-(\d+)/i);
                if (m) {
                    const n = parseInt(m[1]);
                    if (n > maxIdx) maxIdx = n;
                }
            });
            document.getElementById('modalAnimalNo').value = 'AN-' + (maxIdx + 1);
            if (!document.getElementById('modalAnimalName').value) {
                document.getElementById('modalAnimalName').value = '天府生态伴生动物' + (maxIdx + 1);
            }
        } else {
            tabPlant.style.background = '#ffffff';
            tabPlant.style.color = '#059669';
            tabPlant.style.borderBottom = '2.5px solid #059669';
            tabAnimal.style.background = 'transparent';
            tabAnimal.style.color = '#64748b';
            tabAnimal.style.borderBottom = '2.5px solid transparent';

            plantWrap.style.display = 'block';
            animalWrap.style.display = 'none';
            submitBtn.textContent = '🌿 确认栽植入库';
            submitBtn.style.background = '#059669';
            titleEl.textContent = '🌱 标绘新绿植落点';
        }
    }

    // 提交标绘新生态标记 (智能分流：绿植 / 动物)
    function submitNewEcoMarker(e) {
        e.preventDefault();
        const mode = document.getElementById('currentPlotType').value;
        const form = document.getElementById('addPlantForm');
        const formData = new FormData(form);
        const params = new URLSearchParams();

        if (mode === 'animal') {
            params.append('action', 'addAnimalMarker');
            params.append('animalNo', document.getElementById('modalAnimalNo').value || ('AN-' + Date.now().toString().slice(-4)));
            params.append('name', document.getElementById('modalAnimalName').value || '天府新标绘动物');
            params.append('category', document.getElementById('modalAnimalCategory').value);
            params.append('count', document.getElementById('modalAnimalCount').value || '1');
            params.append('areaName', document.getElementById('modalAnimalArea').value || '天府湖水域生态区');
            params.append('keeperName', document.getElementById('modalAnimalKeeper').value || '生态保育员');
            params.append('feedingCycleDays', document.getElementById('modalAnimalCycle').value || '1');
            params.append('healthStatus', document.getElementById('modalAnimalHealth').value || '健康活泼');
            params.append('dietType', document.getElementById('modalAnimalDiet').value || '常规禽料/生态采食');
            params.append('remark', document.getElementById('modalAnimalRemark').value || '实景地图标绘动物');
            params.append('latitude', formData.get('latitude'));
            params.append('longitude', formData.get('longitude'));
            params.append('ajax', 'true');

            showToast('⏳ 正在标绘生态动物并持久化至 MySQL...', 'info');

            fetch('AreaServlet', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest' },
                body: params.toString()
            })
            .then(r => r.json())
            .then(res => {
                if (res.success) {
                    showToast('🐾 ' + (res.message || '生态动物已成功标绘入库！'), 'success');
                    closeAddPlantModal();
                    if (isPlacingMode) togglePlaceMode();
                    if (res.animals) {
                        currentAnimals = res.animals;
                        renderAllAnimalMarkers();
                        renderPlantListCards();
                        updateKpiStats();
                        const newLat = parseFloat(formData.get('latitude'));
                        const newLng = parseFloat(formData.get('longitude'));
                        if (newLat && newLng) {
                            map.flyTo([newLat, newLng], 19, { duration: 0.8 });
                        }
                    }
                } else {
                    showToast('⚠️ 标绘失败: ' + res.message, 'error');
                }
            })
            .catch(err => {
                showToast('⚠️ 提交异常: ' + err.message, 'error');
            });
        } else {
            for (const [key, val] of formData.entries()) {
                params.append(key, val);
            }
            params.append('action', 'addPlantMarker');
            params.append('ajax', 'true');

            showToast('⏳ 正在标绘栽植并持久化至 MySQL...', 'info');

            fetch('AreaServlet', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest' },
                body: params.toString()
            })
            .then(r => r.json())
            .then(res => {
                if (res.success) {
                    showToast('🌿 ' + (res.message || '植株已成功标绘入库！'), 'success');
                    closeAddPlantModal();
                    if (isPlacingMode) togglePlaceMode();
                    if (res.plants) {
                        currentPlants = res.plants;
                        renderAllPlantMarkers();
                        renderPlantListCards();
                        updateKpiStats();

                        const newLat = parseFloat(formData.get('latitude'));
                        const newLng = parseFloat(formData.get('longitude'));
                        if (newLat && newLng) {
                            map.flyTo([newLat, newLng], 19, { duration: 0.8 });
                        }
                    }
                } else {
                    showToast('⚠️ 标绘失败: ' + res.message, 'error');
                }
            })
            .catch(err => {
                showToast('⚠️ 提交异常: ' + err.message, 'error');
            });
        }
    }

    // 🐾 聚焦并高亮指定动物
    function focusAnimal(aid) {
        const a = currentAnimals.find(item => item.id === aid);
        if (!a) return;
        selectedAnimal = a;
        closePlantDrawer();
        const aCampus = getCoordsCampusKey(a.lat, a.lng);
        if (aCampus && aCampus !== currentCampusKey) {
            selectCampus(aCampus, false);
        }
        renderPlantListCards();
        map.flyTo([a.lat, a.lng], 19, { duration: 1 });
        openAnimalDrawer(a);
    }

    // 🐾 打开动物档案抽屉
    function openAnimalDrawer(a) {
        selectedAnimal = a;
        closePlantDrawer();
        const drawer = document.getElementById('gkAnimalDrawer');
        if (!drawer) return;

        document.getElementById('drawerAnimalName').textContent = a.name;
        document.getElementById('drawerAnimalMeta').textContent = a.category + ' · ' + a.animalNo + ' · 绵阳校区';
        document.getElementById('drawerAnimalEmoji').textContent = getAnimalEmoji(a.name, a.category);

        const healthBadge = document.getElementById('drawerAnimalHealthBadge');
        if (healthBadge) {
            const isObserved = a.healthStatus && (a.healthStatus.includes('观察') || a.healthStatus.includes('病') || a.healthStatus.includes('隔离'));
            healthBadge.textContent = a.healthStatus || '健康活泼';
            healthBadge.className = 'badge-status ' + (isObserved ? 'due' : 'normal');
        }

        document.getElementById('drawerAnimalKeeper').textContent = a.keeperName || '生态保育员';
        document.getElementById('drawerAnimalCount').textContent = a.count + (a.species && a.species.includes('鱼') ? ' 尾' : ' 只');
        document.getElementById('drawerAnimalArea').textContent = a.areaName || '天府湖水域生态区';
        document.getElementById('drawerAnimalCoords').textContent = parseFloat(a.lat).toFixed(6) + ', ' + parseFloat(a.lng).toFixed(6);
        document.getElementById('drawerAnimalNextFeed').textContent = (a.nextFeedingDate || '待排期') + ' (每' + (a.feedingCycleDays || 1) + '天一次)';
        document.getElementById('drawerAnimalDiet').textContent = a.dietType || '生态自然采食/配合禽粮';
        document.getElementById('drawerAnimalRemark').textContent = a.remark || '校园伴生保护生态物种，健康巡查正常。';

        const fullLink = document.getElementById('btnDrawerFullAnimalLink');
        if (fullLink) {
            fullLink.href = 'animal.jsp?keyword=' + encodeURIComponent(a.name);
        }

        drawer.classList.add('open');
    }

    // 🐾 关闭动物档案抽屉
    function closeAnimalDrawer() {
        const drawer = document.getElementById('gkAnimalDrawer');
        if (drawer) drawer.classList.remove('open');
    }

    // 🐾 快速投喂巡检打卡
    function quickFeedAnimal(aid, name) {
        const a = currentAnimals.find(item => item.id === aid);
        if (!a) return;
        showToast('⏳ 正在提交【' + (name || a.name) + '】投喂巡护记录...', 'info');

        const params = new URLSearchParams();
        params.append('action', 'feedAnimal');
        params.append('id', aid);
        params.append('ajax', 'true');

        fetch('AreaServlet', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest' },
            body: params.toString()
        })
        .then(r => r.json())
        .then(res => {
            if (res.success) {
                showToast('🐟 ' + res.message, 'success');
                if (res.animals) {
                    currentAnimals = res.animals;
                    renderAllAnimalMarkers();
                    renderPlantListCards();
                    if (selectedAnimal && selectedAnimal.id === aid) {
                        const updated = currentAnimals.find(item => item.id === aid);
                        if (updated) openAnimalDrawer(updated);
                    }
                }
            } else {
                showToast('⚠️ 投喂失败: ' + res.message, 'error');
            }
        })
        .catch(err => {
            showToast('⚠️ 异常: ' + err.message, 'error');
        });
    }

    function quickFeedCurrentAnimal() {
        if (!selectedAnimal) return;
        quickFeedAnimal(selectedAnimal.id, selectedAnimal.name);
    }

    // 🐾 删除当前生态动物点位
    function deleteCurrentAnimal() {
        if (!selectedAnimal) return;
        if (!confirm('确定要从高德实景地图与数据库注销生态动物【' + selectedAnimal.name + '】吗？')) return;

        const params = new URLSearchParams();
        params.append('action', 'deleteAnimalMarker');
        params.append('id', selectedAnimal.id);
        params.append('ajax', 'true');

        fetch('AreaServlet', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest' },
            body: params.toString()
        })
        .then(r => r.json())
        .then(res => {
            if (res.success) {
                showToast('🗑️ ' + res.message, 'info');
                closeAnimalDrawer();
                currentAnimals = currentAnimals.filter(a => a.id !== selectedAnimal.id);
                renderAllAnimalMarkers();
                renderPlantListCards();
                updateKpiStats();
            } else {
                showToast('⚠️ 删除失败: ' + res.message, 'error');
            }
        });
    }

    // 🚀 全局无感同步与地图飞跃（专为 AI 管家小天指令代办设计）
    window.reloadMapEcoData = function(actionResult) {
        fetch('AreaServlet?format=json')
        .then(r => r.json())
        .then(res => {
            if (res.success) {
                if (res.plants) currentPlants = res.plants;
                if (res.animals) currentAnimals = res.animals;
                renderAllPlantMarkers();
                renderAllAnimalMarkers();
                renderPlantListCards();
                updateKpiStats();

                if (actionResult && actionResult.lat && actionResult.lng) {
                    map.flyTo([actionResult.lat, actionResult.lng], 19, { duration: 1.5 });
                    showToast('✨ AI智能执行：' + (actionResult.message || '实景地图已完成同步！'), 'success');
                }
            }
        })
        .catch(err => console.error('智能同步地图失败:', err));
    };

    // 监听 AI 小天全局指令事件
    window.addEventListener('ai-crop-modified', function(e) {
        if (e.detail && typeof window.reloadMapEcoData === 'function') {
            window.reloadMapEcoData(e.detail);
        }
    });

    // 提交新增植物并在地图上立即标出 (兼容旧调用)
    function submitNewPlant(e) {
        submitNewEcoMarker(e);
    }

    // 打开编辑作物档案与布置养护人员弹窗
    function openEditCropModal(pid) {
        if (!pid && selectedPlant) pid = selectedPlant.id;
        const p = currentPlants.find(item => item.id === pid);
        if (!p) {
            showToast('⚠️ 未找到该作物档案', 'error');
            return;
        }
        document.getElementById('editCropPid').value = p.id;
        document.getElementById('editCropPidDisplay').value = p.code || p.id;
        document.getElementById('editCropName').value = p.name || '';
        document.getElementById('editCropType').value = p.species || '乔木';
        document.getElementById('editCropMaintainer').value = (p.maintainerId !== null && p.maintainerId !== undefined && p.maintainerId !== '') ? String(p.maintainerId) : '';
        document.getElementById('editCropDate').value = p.plantedAt || '';
        document.getElementById('editCropPic').value = p.image || 'greenkeeper/assets/plant-camphor.svg';
        document.getElementById('editCropWaterDays').value = p.waterPeriodDays || 7;
        document.getElementById('editCropFertDays').value = p.fertilizePeriodDays || 30;
        document.getElementById('editCropTrimDays').value = p.trimPeriodDays || 60;
        document.getElementById('editCropPestDays').value = p.pestPeriodDays || 45;
        document.getElementById('editCropDesc').value = p.note || '';

        document.getElementById('editCropModal').classList.add('open');
    }

    function closeEditCropModal() {
        document.getElementById('editCropModal').classList.remove('open');
    }

    // 提交作物编辑与人员布置
    function submitEditCrop(e) {
        e.preventDefault();
        const form = document.getElementById('editCropForm');
        const formData = new FormData(form);
        const params = new URLSearchParams();
        for (const [k, v] of formData.entries()) {
            params.append(k, v);
        }
        params.append('action', 'editPlantCrop');
        params.append('ajax', 'true');

        showToast('⏳ 正在更新作物档案并布置责任养护人员...', 'info');

        fetch('AreaServlet', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest' },
            body: params.toString()
        })
        .then(r => r.json())
        .then(res => {
            if (res.success) {
                showToast('✅ ' + (res.message || '作物档案与养护人员已成功更新！'), 'success');
                closeEditCropModal();
                if (res.plants) {
                    currentPlants = res.plants;
                    renderAllPlantMarkers();
                    renderPlantListCards();
                    updateKpiStats();
                    const pid = formData.get('pid');
                    const updated = currentPlants.find(p => p.id === pid);
                    if (updated && selectedPlant && selectedPlant.id === updated.id) {
                        openPlantDrawer(updated);
                    }
                }
            } else {
                showToast('⚠️ 保存失败: ' + res.message, 'error');
            }
        })
        .catch(err => {
            showToast('⚠️ 网络异常: ' + err.message, 'error');
        });
    }

    // 指派养护人员弹窗快捷入口
    function openAssignModal(pid, pname, currentMid) {
        openEditCropModal(pid);
    }
    function closeAssignModal() {
        document.getElementById('assignMaintainerModal').classList.remove('open');
    }

    function submitPlantMaintainer(e) {
        e.preventDefault();
        const pid = document.getElementById('assignPid').value;
        const mid = document.getElementById('assignMaintainerSelect').value;

        showToast('⏳ 正在安排责任养护员...', 'info');

        const params = new URLSearchParams();
        params.append('action', 'assignPlantMaintainer');
        params.append('pid', pid);
        params.append('maintainerId', mid);
        params.append('ajax', 'true');

        fetch('AreaServlet', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest' },
            body: params.toString()
        })
        .then(r => r.json())
        .then(res => {
            if (res.success) {
                showToast('✅ ' + (res.message || '养护员已成功安排并持久化入库！'), 'success');
                closeAssignModal();
                if (res.plants) {
                    currentPlants = res.plants;
                    renderAllPlantMarkers();
                    renderPlantListCards();
                    updateKpiStats();
                    if (selectedPlant && selectedPlant.id === pid) {
                        const updated = currentPlants.find(p => p.id === pid);
                        if (updated) openPlantDrawer(updated);
                    }
                }
            } else {
                showToast('⚠️ 安排失败: ' + res.message, 'error');
            }
        })
        .catch(err => {
            showToast('⚠️ 网络异常: ' + err.message, 'error');
        });
    }

    // 删除当前植株点位
    function deleteCurrentPlant() {
        if (!selectedPlant) return;
        if (!confirm('确定要在地图与数据库中移除绿植【' + selectedPlant.name + '】吗？')) return;

        const params = new URLSearchParams();
        params.append('action', 'deletePlantMarker');
        params.append('pid', selectedPlant.id);
        params.append('ajax', 'true');

        fetch('AreaServlet', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest' },
            body: params.toString()
        })
        .then(r => r.json())
        .then(res => {
            if (res.success) {
                showToast('🗑️ 植株【' + selectedPlant.name + '】已成功移除！', 'info');
                closePlantDrawer();
                currentPlants = currentPlants.filter(p => p.id !== selectedPlant.id);
                renderAllPlantMarkers();
                renderPlantListCards();
                updateKpiStats();
            } else {
                showToast('⚠️ 移除失败: ' + res.message, 'error');
            }
        });
    }

    // 图层开关
    function togglePlantPins() {
        showPlantsLayer = !showPlantsLayer;
        const btn = document.getElementById('btnLayerTogglePlants');
        if (showPlantsLayer) {
            btn.classList.add('active');
            renderAllPlantMarkers();
        } else {
            btn.classList.remove('active');
            if (plantMarkersGroup) plantMarkersGroup.clearLayers();
        }
    }

    function resetCampusView() {
        const cfg = CAMPUS_CONFIG[currentCampusKey] || CAMPUS_CONFIG['mianyang'];
        if (map) {
            map.flyTo(cfg.center, cfg.zoom, { duration: 1 });
            showToast('🎯 已重置视野至【' + cfg.shortName + '】中心', 'info');
        }
    }

    function escapeHtml(s) {
        if (!s) return '';
        return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    // 页面加载就绪初始化
    window.addEventListener('DOMContentLoaded', () => {
        initMap();
    });
</script>

<!-- 🌿 引入 AI 绿化数字宠物【小天】 -->
<%@ include file="ai_pet_widget.jsp" %>

</body>
</html>
