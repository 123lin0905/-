<%@ page contentType="text/html; charset=UTF-8" pageEncoding="UTF-8" %>
<%@ page import="DB.DBTools, org.example.demo1.Plant, org.example.demo1.PlantArea, org.example.demo1.Maintainer, java.util.Map" %>
<%
    String pid = request.getParameter("pid");
    DBTools db = new DBTools();
    Plant plant = (pid != null && !pid.trim().isEmpty()) ? db.queryPlantById(pid.trim()) : null;
    PlantArea area = null;
    if (plant != null && plant.getAreaId() != null) {
        area = db.queryAreaById(plant.getAreaId());
    }
    Map<String, Maintainer> maintainerMap = db.queryPlantMaintainerMap();
    Maintainer maintainer = (plant != null && maintainerMap != null) ? maintainerMap.get(plant.getPid()) : null;
%>
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title><%= plant != null ? plant.getPname() : "绿植微档案" %> · 西财天府校园数字树牌</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&display=swap" rel="stylesheet">
    <style>
        :root {
            --primary: #059669;
            --primary-dark: #047857;
            --dark: #0f172a;
            --gray-600: #475569;
            --gray-100: #f1f5f9;
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: 'Plus Jakarta Sans', "PingFang SC", "Microsoft YaHei", sans-serif;
            background: linear-gradient(180deg, #ecfdf5 0%, #f8fafc 180px, #f1f5f9 100%);
            color: var(--dark);
            min-height: 100vh;
            padding: 20px 16px 40px 16px;
            display: flex;
            justify-content: center;
        }
        .card {
            width: 100%;
            max-width: 480px;
            background: rgba(255, 255, 255, 0.98);
            border-radius: 24px;
            box-shadow: 0 16px 36px -4px rgba(5, 150, 105, 0.15), 0 0 1px 1px rgba(255, 255, 255, 0.8) inset;
            overflow: hidden;
            border: 1px solid rgba(226, 232, 240, 0.8);
        }
        .header-banner {
            background: linear-gradient(135deg, #059669 0%, #10b981 100%);
            color: #fff;
            padding: 20px 24px;
            display: flex;
            align-items: center;
            justify-content: space-between;
        }
        .school-badge {
            font-size: 13px;
            font-weight: 700;
            letter-spacing: 0.5px;
            display: flex;
            align-items: center;
            gap: 6px;
        }
        .img-box {
            width: 100%;
            height: 240px;
            background: #e2e8f0;
            position: relative;
            overflow: hidden;
        }
        .img-box img {
            width: 100%;
            height: 100%;
            object-fit: cover;
        }
        .body-content {
            padding: 24px;
        }
        .plant-title {
            font-size: 24px;
            font-weight: 800;
            color: var(--dark);
            margin-bottom: 8px;
            display: flex;
            align-items: center;
            justify-content: space-between;
        }
        .plant-tag {
            font-size: 12px;
            font-weight: 700;
            padding: 4px 10px;
            background: #ecfdf5;
            color: #059669;
            border-radius: 8px;
            border: 1px solid #a7f3d0;
        }
        .grid-info {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 12px;
            margin: 20px 0;
        }
        .info-pill {
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 12px;
            padding: 10px 14px;
        }
        .info-label {
            font-size: 11px;
            color: var(--gray-600);
            font-weight: 600;
            margin-bottom: 2px;
        }
        .info-value {
            font-size: 14px;
            font-weight: 700;
            color: var(--dark);
        }
        .desc-box {
            background: #f8fafc;
            border-radius: 14px;
            border: 1px solid #e2e8f0;
            padding: 16px;
            font-size: 13.5px;
            line-height: 1.7;
            color: #334155;
            margin-bottom: 24px;
        }
        .actions-btn {
            display: block;
            width: 100%;
            text-align: center;
            padding: 13px;
            background: var(--primary);
            color: #fff;
            text-decoration: none;
            border-radius: 12px;
            font-size: 14.5px;
            font-weight: 700;
            box-shadow: 0 4px 14px rgba(5, 150, 105, 0.35);
        }
    </style>
</head>
<body>

<div class="card">
    <div class="header-banner">
        <div class="school-badge">
            <span>🌿</span> 西南财经大学天府学院 · 数字树牌
        </div>
        <div style="font-size: 12px; opacity: 0.9;">GreenKeeper</div>
    </div>

    <% if (plant != null) {
        String pic = plant.getPpic();
        if (pic == null || pic.trim().isEmpty()) pic = "tf1yx.jpg";
    %>
    <div class="img-box">
        <img src="<%= pic %>" alt="<%= plant.getPname() %>" onerror="this.onerror=null; this.src='新增.png';">
    </div>

    <div class="body-content">
        <div class="plant-title">
            <span><%= plant.getPname() %></span>
            <span class="plant-tag"><%= plant.getPtype() != null ? plant.getPtype() : "校区植被" %></span>
        </div>

        <div style="font-size: 12.5px; color: var(--gray-600); margin-bottom: 16px;">
            编号: <strong><%= plant.getPid() %></strong> · 估值: ¥<%= plant.getPprice() %>
        </div>

        <div class="grid-info">
            <div class="info-pill">
                <div class="info-label">📍 校区分布位置</div>
                <div class="info-value"><%= area != null ? area.getAreaName() : "核心景观带" %></div>
            </div>
            <div class="info-pill">
                <div class="info-label">👷 责任养护专员</div>
                <div class="info-value"><%= maintainer != null ? maintainer.getName() : "绿化管养组" %></div>
            </div>
            <div class="info-pill">
                <div class="info-label">📅 起种/建档日期</div>
                <div class="info-value"><%= plant.getPdatetime() != null ? plant.getPdatetime() : "建校初期" %></div>
            </div>
            <div class="info-pill">
                <div class="info-label">💧 下次计划浇灌</div>
                <div class="info-value"><%= plant.getNextWaterDate() != null ? plant.getNextWaterDate() : "定期巡检" %></div>
            </div>
        </div>

        <div style="font-size: 13px; font-weight: 700; color: var(--dark); margin-bottom: 8px;">
            📖 植物科普与生长习性
        </div>
        <div class="desc-box">
            <%= plant.getPdesc() != null ? plant.getPdesc() : "暂无该植株详细科普说明。" %>
        </div>

        <a href="index.jsp" class="actions-btn">🏡 探索西财天府智慧绿化系统</a>
    </div>
    <% } else { %>
    <div style="padding: 60px 24px; text-align: center;">
        <div style="font-size: 40px; margin-bottom: 12px;">🍂</div>
        <div style="font-size: 16px; font-weight: 700; color: var(--dark);">未查询到该绿植信息</div>
        <div style="font-size: 13px; color: var(--gray-600); margin: 8px 0 24px 0;">请核实树木铭牌二维码或绿植编号是否有效。</div>
        <a href="index.jsp" class="actions-btn">返回系统首页</a>
    </div>
    <% } %>
</div>

</body>
</html>
