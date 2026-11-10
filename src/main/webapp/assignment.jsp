<%@ page contentType="text/html; charset=UTF-8" pageEncoding="UTF-8" %>
<%@ page import="java.util.List, java.util.Map, java.util.HashSet, java.util.Set, org.example.demo1.Maintainer, org.example.demo1.Plant, org.example.demo1.AdminUser" %>
<%!
    private String js(String value) {
        if (value == null) return "";
        return value.replace("\\", "\\\\").replace("'", "\\'").replace("\"", "\\\"").replace("\r", "\\r").replace("\n", "\\n");
    }
%>
<%
    List<Maintainer> maintainers = (List<Maintainer>) request.getAttribute("maintainers");
    List<Plant> plants = (List<Plant>) request.getAttribute("plants");
    Map<Integer, List<Plant>> assignments = (Map<Integer, List<Plant>>) request.getAttribute("assignments");
    AdminUser currentUser = (AdminUser) session.getAttribute("adminUser");

    int totalMaintainers = maintainers == null ? 0 : maintainers.size();
    int totalPlants = plants == null ? 0 : plants.size();
    
    // 统计已分配与未分配绿植
    Set<String> assignedPlantIds = new HashSet<>();
    int totalAssignedCount = 0;
    if (assignments != null) {
        for (List<Plant> pList : assignments.values()) {
            if (pList != null) {
                totalAssignedCount += pList.size();
                for (Plant p : pList) {
                    assignedPlantIds.add(p.getPid());
                }
            }
        }
    }
    int unassignedCount = Math.max(0, totalPlants - assignedPlantIds.size());
    int assignmentRate = totalPlants > 0 ? (int) Math.round((double) assignedPlantIds.size() / totalPlants * 100) : 0;
%>
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>养护员绿植分配看板 - 智慧绿化系统</title>
    <!-- Google Fonts 现代化字体 -->
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
            --gray-200: #e2e8f0;
            --card-bg: rgba(255, 255, 255, 0.94);
            --shadow-sm: 0 1px 3px rgba(15, 23, 42, 0.06);
            --shadow-md: 0 10px 25px -5px rgba(15, 23, 42, 0.07), 0 8px 10px -6px rgba(15, 23, 42, 0.04);
            --radius-md: 14px;
            --radius-lg: 20px;
        }

        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: 'Plus Jakarta Sans', "Microsoft YaHei", -apple-system, sans-serif;
            background: linear-gradient(145deg, #f0fdf4 0%, #f8fafc 50%, #ecfdf5 100%);
            color: var(--dark);
            min-height: 100vh;
            display: flex;
            flex-direction: column;
        }

        /* 顶部现代导航条 */
        .navbar {
            height: 70px;
            background: rgba(255, 255, 255, 0.88);
            backdrop-filter: blur(12px);
            border-bottom: 1px solid rgba(226, 232, 240, 0.8);
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 0 32px;
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
            box-shadow: 0 6px 14px rgba(5, 150, 105, 0.28);
        }
        .brand-title {
            font-size: 19px;
            font-weight: 700;
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
            gap: 10px;
        }
        .nav-link {
            padding: 8px 16px;
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
        }

        /* 页面主体 */
        .main-container {
            flex: 1;
            padding: 24px 32px 48px;
            max-width: 1600px;
            margin: 0 auto;
            width: 100%;
            display: flex;
            flex-direction: column;
            gap: 24px;
        }

        /* 顶部统计 KPI 看板 */
        .kpi-grid {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 18px;
        }
        .kpi-card {
            background: var(--card-bg);
            backdrop-filter: blur(14px);
            border-radius: var(--radius-md);
            padding: 20px 22px;
            border: 1px solid rgba(255, 255, 255, 0.8);
            box-shadow: var(--shadow-sm);
            display: flex;
            align-items: center;
            justify-content: space-between;
            transition: transform 0.2s ease, box-shadow 0.2s ease;
        }
        .kpi-card:hover {
            transform: translateY(-2px);
            box-shadow: var(--shadow-md);
        }
        .kpi-info h4 {
            font-size: 13px;
            font-weight: 600;
            color: var(--gray-500);
            margin-bottom: 6px;
        }
        .kpi-value {
            font-size: 28px;
            font-weight: 800;
            color: var(--dark);
            line-height: 1.1;
        }
        .kpi-sub {
            font-size: 12px;
            color: var(--gray-500);
            margin-top: 4px;
        }
        .kpi-icon-wrap {
            width: 48px;
            height: 48px;
            border-radius: 12px;
            display: grid;
            place-items: center;
            font-size: 24px;
        }

        /* 操作与过滤工具条 */
        .toolbar {
            background: var(--card-bg);
            backdrop-filter: blur(14px);
            border-radius: var(--radius-md);
            padding: 14px 22px;
            border: 1px solid rgba(255, 255, 255, 0.8);
            box-shadow: var(--shadow-sm);
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 16px;
        }
        .toolbar-title {
            font-size: 16px;
            font-weight: 700;
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .search-box {
            display: flex;
            align-items: center;
            gap: 10px;
            position: relative;
            max-width: 320px;
            width: 100%;
        }
        .search-input {
            width: 100%;
            padding: 8px 14px 8px 36px;
            border: 1.5px solid #cbd5e1;
            border-radius: 20px;
            font-size: 13px;
            outline: none;
            transition: all 0.2s;
            background: #fff;
        }
        .search-input:focus {
            border-color: var(--primary);
            box-shadow: 0 0 0 3px rgba(5, 150, 105, 0.15);
        }
        .search-icon {
            position: absolute;
            left: 12px;
            color: #94a3b8;
            font-size: 14px;
        }

        /* 养护员责任分配卡片栅格 */
        .maintainer-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(460px, 1fr));
            gap: 20px;
        }

        .m-card {
            background: var(--card-bg);
            backdrop-filter: blur(14px);
            border-radius: var(--radius-lg);
            border: 1px solid rgba(255, 255, 255, 0.9);
            box-shadow: var(--shadow-sm);
            padding: 24px;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
            position: relative;
            overflow: hidden;
        }
        .m-card:hover {
            transform: translateY(-3px);
            box-shadow: var(--shadow-md);
            border-color: #a7f3d0;
        }

        .m-card-header {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            margin-bottom: 16px;
        }
        .m-profile {
            display: flex;
            align-items: center;
            gap: 14px;
        }
        .m-avatar {
            width: 50px;
            height: 50px;
            border-radius: 14px;
            background: linear-gradient(135deg, #059669, #10b981);
            color: #fff;
            display: grid;
            place-items: center;
            font-size: 22px;
            font-weight: 700;
            box-shadow: 0 6px 14px rgba(5, 150, 105, 0.2);
            flex-shrink: 0;
        }
        .m-name {
            font-size: 17px;
            font-weight: 700;
            color: var(--dark);
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .m-dept-badge {
            background: #f1f5f9;
            color: #475569;
            font-size: 11.5px;
            padding: 2px 8px;
            border-radius: 6px;
            font-weight: 600;
        }
        .m-meta {
            font-size: 12.5px;
            color: var(--gray-500);
            margin-top: 3px;
        }

        .load-badge {
            padding: 4px 10px;
            border-radius: 20px;
            font-size: 11.5px;
            font-weight: 700;
        }
        .load-normal { background: #dcfce7; color: #15803d; }
        .load-heavy { background: #fef3c7; color: #b45309; }
        .load-free { background: #f1f5f9; color: #64748b; }

        /* 已分配绿植标签池 */
        .assigned-box {
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 12px;
            padding: 14px;
            min-height: 110px;
            margin-bottom: 18px;
        }
        .assigned-box-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-size: 12px;
            font-weight: 600;
            color: var(--gray-500);
            margin-bottom: 10px;
        }
        .plant-tags {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
        }
        .plant-tag {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            background: #ffffff;
            color: #065f46;
            border: 1px solid #a7f3d0;
            padding: 6px 10px;
            border-radius: 10px;
            font-size: 12.5px;
            font-weight: 600;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.03);
            transition: all 0.2s ease;
        }
        .plant-tag:hover {
            border-color: #059669;
            transform: translateY(-1px);
            box-shadow: 0 4px 8px rgba(5, 150, 105, 0.12);
        }
        .plant-tag-del {
            background: none;
            border: none;
            color: #94a3b8;
            cursor: pointer;
            font-size: 14px;
            line-height: 1;
            padding: 2px 4px;
            border-radius: 4px;
            transition: all 0.15s;
        }
        .plant-tag-del:hover {
            color: #ef4444;
            background: #fee2e2;
        }
        .empty-tag-tip {
            font-size: 12.5px;
            color: #94a3b8;
            font-style: italic;
            padding: 12px 0;
            text-align: center;
        }

        /* 分配表单底栏 */
        .assign-action-bar {
            display: flex;
            gap: 10px;
            align-items: center;
        }
        .plant-select {
            flex: 1;
            padding: 9px 12px;
            border: 1.5px solid #cbd5e1;
            border-radius: 10px;
            font-size: 13px;
            background: #fff;
            color: var(--dark);
            outline: none;
            transition: border-color 0.2s;
        }
        .plant-select:focus {
            border-color: var(--primary);
            box-shadow: 0 0 0 3px rgba(5, 150, 105, 0.12);
        }
        .btn-assign {
            padding: 9px 16px;
            background: var(--primary);
            color: #fff;
            border: none;
            border-radius: 10px;
            font-size: 13px;
            font-weight: 600;
            cursor: pointer;
            white-space: nowrap;
            display: inline-flex;
            align-items: center;
            gap: 5px;
            transition: all 0.2s ease;
        }
        .btn-assign:hover {
            background: var(--primary-hover);
            transform: translateY(-1px);
        }

        @media (max-width: 1024px) {
            .kpi-grid {
                grid-template-columns: repeat(2, 1fr);
            }
            .maintainer-grid {
                grid-template-columns: 1fr;
            }
            .navbar {
                padding: 0 16px;
            }
            .main-container {
                padding: 16px;
            }
        }
    </style>
</head>
<body>

<!-- 顶部导航 -->
<header class="navbar">
    <a href="index.jsp" class="nav-brand">
        <div class="brand-icon">🌱</div>
        <div>
            <div class="brand-title">养护员—绿植分配看板</div>
            <div class="brand-subtitle">人员网格化巡检与养护任务配置中心</div>
        </div>
    </a>
    <nav class="nav-links">
        <a href="index.jsp" class="nav-link"><span>🏠</span> 首页</a>
        <a href="AreaServlet" class="nav-link"><span>📍</span> 园区网格与标绘</a>
        <a href="QueryServlet" class="nav-link"><span>🌿</span> 绿植档案</a>
        <a href="MaintainerServlet" class="nav-link"><span>👷</span> 养护员档案</a>
        <a href="AssignmentServlet" class="nav-link active"><span>🌱</span> 绿植分配</a>
        <a href="MaintainServlet" class="nav-link"><span>🛠️</span> 养护中心</a>
    </nav>
</header>

<!-- 主容器 -->
<main class="main-container">

    <!-- KPI 关键指标总览卡片 -->
    <section class="kpi-grid">
        <div class="kpi-card">
            <div class="kpi-info">
                <h4>养护人员队伍</h4>
                <div class="kpi-value"><%= totalMaintainers %><span style="font-size:14px;font-weight:normal;color:var(--gray-500);margin-left:4px;">位</span></div>
                <div class="kpi-sub">在职人员建立档案</div>
            </div>
            <div class="kpi-icon-wrap" style="background:#ecfdf5;color:#059669;">👷</div>
        </div>

        <div class="kpi-card">
            <div class="kpi-info">
                <h4>全园区绿植总数</h4>
                <div class="kpi-value"><%= totalPlants %><span style="font-size:14px;font-weight:normal;color:var(--gray-500);margin-left:4px;">株</span></div>
                <div class="kpi-sub">已登记在册档案</div>
            </div>
            <div class="kpi-icon-wrap" style="background:#eff6ff;color:#2563eb;">🌿</div>
        </div>

        <div class="kpi-card">
            <div class="kpi-info">
                <h4>已落实责任绿植</h4>
                <div class="kpi-value"><%= totalAssignedCount %><span style="font-size:14px;font-weight:normal;color:var(--gray-500);margin-left:4px;">株</span></div>
                <div class="kpi-sub">覆盖率 <%= assignmentRate %>%</div>
            </div>
            <div class="kpi-icon-wrap" style="background:#fefce8;color:#ca8a04;">✅</div>
        </div>

        <div class="kpi-card">
            <div class="kpi-info">
                <h4>待分配绿植</h4>
                <div class="kpi-value" style="color:<%= unassignedCount > 0 ? "#dc2626" : "var(--dark)" %>;"><%= unassignedCount %><span style="font-size:14px;font-weight:normal;color:var(--gray-500);margin-left:4px;">株</span></div>
                <div class="kpi-sub">尚未绑定专职责任人</div>
            </div>
            <div class="kpi-icon-wrap" style="background:#fef2f2;color:#dc2626;">⚠️</div>
        </div>
    </section>

    <!-- 工具栏与搜索 -->
    <section class="toolbar">
        <div class="toolbar-title">
            <span>👷‍♂️</span> 养护员责任田与绿植名录
        </div>
        <div class="search-box">
            <span class="search-icon">🔍</span>
            <input type="text" id="filterInput" class="search-input" placeholder="输入养护员姓名或绿植名称过滤...">
        </div>
    </section>

    <!-- 养护员卡片看板 -->
    <section class="maintainer-grid" id="maintainerContainer">
        <% if (maintainers == null || maintainers.isEmpty()) { %>
            <div style="grid-column: 1 / -1; background:#fff; padding: 48px; border-radius:16px; text-align:center; color:var(--gray-500);">
                <div style="font-size:36px;margin-bottom:12px;">👷</div>
                <p>暂无任何养护人员档案，请先前往【养护员档案】建立人员信息。</p>
                <a href="MaintainerServlet" style="color:var(--primary);margin-top:8px;display:inline-block;font-weight:600;">前往养护员档案 ➔</a>
            </div>
        <% } else {
            for (Maintainer maintainer : maintainers) {
                List<Plant> assigned = assignments == null ? null : assignments.get(maintainer.getId());
                int count = assigned == null ? 0 : assigned.size();
                String loadClass = count >= 6 ? "load-heavy" : (count > 0 ? "load-normal" : "load-free");
                String loadText = count >= 6 ? "任务饱和" : (count > 0 ? "正常管护" : "待派活");
        %>
            <div class="m-card" data-name="<%= maintainer.getName() %>" data-plants="<% if(assigned!=null) for(Plant p:assigned){ out.print(p.getPname() + " "); } %>">
                <div>
                    <!-- 头部信息 -->
                    <div class="m-card-header">
                        <div class="m-profile">
                            <div class="m-avatar"><%= maintainer.getName().substring(0, 1) %></div>
                            <div>
                                <div class="m-name">
                                    <%= maintainer.getName() %>
                                    <span class="m-dept-badge"><%= maintainer.getDepartment() == null ? "绿化部" : maintainer.getDepartment() %></span>
                                </div>
                                <div class="m-meta">
                                    工号：<strong><%= maintainer.getStaffNo() %></strong>
                                    <% if (maintainer.getPhone() != null && !maintainer.getPhone().trim().isEmpty()) { %>
                                        · 📞 <%= maintainer.getPhone() %>
                                    <% } %>
                                </div>
                            </div>
                        </div>
                        <span class="load-badge <%= loadClass %>"><%= loadText %> (<%= count %>)</span>
                    </div>

                    <!-- 已分配绿植列表池 -->
                    <div class="assigned-box">
                        <div class="assigned-box-header">
                            <span>已负责在管绿植</span>
                            <span>共 <%= count %> 株</span>
                        </div>
                        <div class="plant-tags">
                            <% if (assigned == null || assigned.isEmpty()) { %>
                                <div class="empty-tag-tip">暂无分配绿植，可从下方快捷挑选并绑定</div>
                            <% } else { for (Plant plant : assigned) { %>
                                <div class="plant-tag">
                                    <span>🌿</span>
                                    <span><%= plant.getPname() %></span>
                                    <span style="font-size:11px;color:#047857;opacity:0.8;">#<%= plant.getPid() %></span>
                                    <form action="AssignmentServlet" method="post" onsubmit="return confirm('确定移除养护员【<%= js(maintainer.getName()) %>】对【<%= js(plant.getPname()) %>】的管护责任吗？');" style="display:inline;margin:0;">
                                        <input type="hidden" name="action" value="remove">
                                        <input type="hidden" name="maintainerId" value="<%= maintainer.getId() %>">
                                        <input type="hidden" name="pid" value="<%= plant.getPid() %>">
                                        <button type="submit" class="plant-tag-del" title="解除分配">×</button>
                                    </form>
                                </div>
                            <% }} %>
                        </div>
                    </div>
                </div>

                <!-- 底部添加分配表单 -->
                <form class="assign-action-bar" action="AssignmentServlet" method="post">
                    <input type="hidden" name="action" value="assign">
                    <input type="hidden" name="maintainerId" value="<%= maintainer.getId() %>">
                    <select class="plant-select" name="pid" required>
                        <option value="">➕ 挑选绿植进行绑定分配...</option>
                        <% if (plants != null) for (Plant plant : plants) { %>
                            <option value="<%= plant.getPid() %>">
                                🌿 <%= plant.getPname() %>（<%= plant.getPid() %> - <%= plant.getPtype() == null ? "普通绿植" : plant.getPtype() %>）
                            </option>
                        <% } %>
                    </select>
                    <button type="submit" class="btn-assign">确认分配</button>
                </form>
            </div>
        <% }} %>
    </section>

</main>

<script>
    // 实时搜索过滤
    const filterInput = document.getElementById('filterInput');
    const cards = document.querySelectorAll('.m-card');

    filterInput.addEventListener('input', function(e) {
        const query = e.target.value.trim().toLowerCase();
        cards.forEach(card => {
            const name = (card.getAttribute('data-name') || '').toLowerCase();
            const plantNames = (card.getAttribute('data-plants') || '').toLowerCase();
            if (!query || name.includes(query) || plantNames.includes(query)) {
                card.style.display = 'flex';
            } else {
                card.style.display = 'none';
            }
        });
    });
</script>
</body>
</html>
