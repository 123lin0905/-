<%@ page contentType="text/html; charset=UTF-8" pageEncoding="UTF-8" %>
<%@ page import="java.util.List, org.example.demo1.PlantArea, DB.DBTools, org.example.demo1.AdminUser" %>
<%
    DBTools dbTools = new DBTools();
    List<PlantArea> areaList = dbTools.queryAllAreas();
    AdminUser currentUser = (AdminUser) session.getAttribute("adminUser");
%>
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>天府智能绿化系统 - 录入新增生态动物作物</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
    <style>
        :root {
            --primary: #059669;
            --primary-hover: #047857;
            --glass-card: rgba(255, 255, 255, 0.94);
            --glass-border: rgba(255, 255, 255, 0.85);
            --shadow-card: 0 12px 32px -4px rgba(15, 23, 42, 0.12), 0 0 1px 1px rgba(255, 255, 255, 0.8) inset;
        }

        * { margin: 0; padding: 0; box-sizing: border-box; }

        body {
            min-height: 100vh;
            font-family: 'Plus Jakarta Sans', "Microsoft YaHei", -apple-system, sans-serif;
            background: url("bj.png") no-repeat center top fixed;
            background-size: cover;
            color: #0f172a;
            padding-bottom: 60px;
        }

        .navbar {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 0 36px;
            height: 68px;
            background: rgba(255, 255, 255, 0.86);
            backdrop-filter: blur(16px);
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
        }

        .container {
            max-width: 800px;
            margin: 36px auto;
            padding: 0 20px;
        }

        .form-card {
            background: var(--glass-card);
            backdrop-filter: blur(18px);
            border-radius: 20px;
            border: 1px solid var(--glass-border);
            box-shadow: var(--shadow-card);
            padding: 32px 36px;
        }

        .form-header {
            margin-bottom: 24px;
            padding-bottom: 16px;
            border-bottom: 1px solid #e2e8f0;
            display: flex;
            align-items: center;
            justify-content: space-between;
        }

        .form-header h2 {
            font-size: 20px;
            font-weight: 800;
            color: #0f172a;
            display: flex;
            align-items: center;
            gap: 10px;
        }

        .form-row {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 16px;
            margin-bottom: 16px;
        }

        .form-group {
            display: flex;
            flex-direction: column;
            gap: 6px;
            margin-bottom: 16px;
        }

        .form-group label {
            font-size: 13px;
            font-weight: 700;
            color: #334155;
        }

        .form-control {
            padding: 10px 14px;
            border: 1.5px solid #cbd5e1;
            border-radius: 10px;
            font-size: 14px;
            background: #ffffff;
            outline: none;
            transition: all 0.2s;
        }

        .form-control:focus {
            border-color: #10b981;
            box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.15);
        }

        .btn-group {
            display: flex;
            justify-content: flex-end;
            gap: 12px;
            margin-top: 24px;
            padding-top: 20px;
            border-top: 1px solid #e2e8f0;
        }

        .btn {
            padding: 10px 24px;
            border-radius: 12px;
            font-size: 14px;
            font-weight: 700;
            cursor: pointer;
            text-decoration: none;
            transition: all 0.2s;
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
        }

        .btn-cancel {
            background: #f1f5f9;
            color: #475569;
            border-color: #cbd5e1;
        }
        .btn-cancel:hover {
            background: #e2e8f0;
        }
    </style>
</head>
<body>

<header class="navbar">
    <a href="index.jsp" class="logo-box">
        <div class="logo-icon">🌿</div>
        <div>
            <span style="font-size:18px;font-weight:800;">天府智能绿化系统</span>
        </div>
    </a>
    <div>
        <a href="AnimalServlet" style="color:#059669;text-decoration:none;font-weight:700;">&larr; 返回生态动物列表</a>
    </div>
</header>

<main class="container">
    <div class="form-card">
        <div class="form-header">
            <h2><span>🐾</span> 录入校园生态动物作物档案</h2>
            <span style="font-size:12px;color:#64748b;">建档立卡 · 生态多样性</span>
        </div>

        <form action="AnimalServlet" method="post">
            <input type="hidden" name="action" value="add">

            <div class="form-row">
                <div class="form-group" style="margin-bottom:0;">
                    <label>档案编号 (留空自动生成)</label>
                    <input type="text" name="animalNo" class="form-control" placeholder="例如 AN-1006">
                </div>
                <div class="form-group" style="margin-bottom:0;">
                    <label>动物名称 <span style="color:#dc2626;">*</span></label>
                    <input type="text" name="name" class="form-control" required placeholder="例如 天府黑天鹅、锦鲤群">
                </div>
            </div>

            <div class="form-row">
                <div class="form-group" style="margin-bottom:0;">
                    <label>拉丁学名 / 科学分类</label>
                    <input type="text" name="species" class="form-control" placeholder="例如 Cygnus atratus">
                </div>
                <div class="form-group" style="margin-bottom:0;">
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
                <div class="form-group" style="margin-bottom:0;">
                    <label>群体/个体数量</label>
                    <input type="number" name="count" class="form-control" value="1" min="1">
                </div>
                <div class="form-group" style="margin-bottom:0;">
                    <label>栖息网格区域</label>
                    <input type="text" name="areaName" class="form-control" value="天府湖水域生态区" placeholder="如 时代广场喷泉池">
                </div>
            </div>

            <div class="form-row">
                <div class="form-group" style="margin-bottom:0;">
                    <label>健康状况</label>
                    <select name="healthStatus" class="form-control">
                        <option value="健康活泼">健康活泼</option>
                        <option value="生长良好">生长良好</option>
                        <option value="重点观察">重点观察</option>
                        <option value="隔离照护">隔离照护</option>
                    </select>
                </div>
                <div class="form-group" style="margin-bottom:0;">
                    <label>投喂/巡检周期 (天)</label>
                    <input type="number" name="feedingCycleDays" class="form-control" value="1" min="1">
                </div>
            </div>

            <div class="form-row">
                <div class="form-group" style="margin-bottom:0;">
                    <label>食性与饲料类型</label>
                    <input type="text" name="dietType" class="form-control" placeholder="如 专用配合颗粒饲料/青饲料">
                </div>
                <div class="form-group" style="margin-bottom:0;">
                    <label>专职保育责任人</label>
                    <input type="text" name="keeperName" class="form-control" value="生态保育员">
                </div>
            </div>

            <div class="form-group">
                <label>生态习性与保育注意事项</label>
                <textarea name="remark" class="form-control" rows="3" placeholder="记录该动物的生活作息、投喂注意事项、免疫接种记录等..."></textarea>
            </div>

            <div class="btn-group">
                <a href="AnimalServlet" class="btn btn-cancel">返回取消</a>
                <button type="submit" class="btn btn-primary">立即录入建档</button>
            </div>
        </form>
    </div>
</main>

</body>
</html>
