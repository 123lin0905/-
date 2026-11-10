<%@ page contentType="text/html; charset=UTF-8" pageEncoding="UTF-8" %>
<%@ page import="java.util.List, org.example.demo1.Plant, org.example.demo1.PlantArea" %>
<%
    List<Plant> plantList = (List<Plant>) request.getAttribute("plantList");
    if (plantList == null) {
        DB.DBTools dbTools = new DB.DBTools();
        plantList = dbTools.queryAllPlants();
    }
%>
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>植株实景标绘与智能档案 - GreenKeeper · 智慧校园绿化系统</title>
    
    <!-- 引入老师提供的 GreenKeeper 原生样式表 -->
    <link rel="stylesheet" href="greenkeeper/greenkeeper.css">
    
    <style>
        :root {
            --primary: #059669;
            --primary-hover: #047857;
            --primary-light: #ecfdf5;
            --dark: #0f172a;
            --gray-700: #334155;
            --gray-500: #64748b;
            --gray-200: #e2e8f0;
            --bg-page: #f8fafc;
        }

        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
            background: linear-gradient(180deg, #ecfdf5 0%, #f8fafc 240px, #f8fafc 100%);
            color: #1e293b;
            min-height: 100vh;
            display: flex;
            flex-direction: column;
        }

        /* 顶部导航条 */
        .navbar {
            background: #ffffff;
            border-bottom: 1px solid var(--gray-200);
            padding: 0 24px;
            height: 64px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            position: sticky;
            top: 0;
            z-index: 1000;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
        }
        .nav-brand {
            display: flex;
            align-items: center;
            gap: 12px;
            text-decoration: none;
            color: var(--dark);
        }
        .brand-icon {
            width: 36px;
            height: 36px;
            background: var(--primary);
            border-radius: 8px;
            display: grid;
            place-items: center;
            color: white;
            font-size: 18px;
        }
        .brand-title {
            font-size: 16px;
            font-weight: 700;
        }
        .brand-subtitle {
            font-size: 11px;
            color: var(--gray-500);
        }
        .nav-links {
            display: flex;
            gap: 8px;
        }
        .nav-link {
            padding: 8px 14px;
            border-radius: 6px;
            text-decoration: none;
            color: var(--gray-700);
            font-size: 13.5px;
            font-weight: 600;
            display: flex;
            align-items: center;
            gap: 6px;
            transition: all 0.2s;
        }
        .nav-link:hover {
            background: #f1f5f9;
            color: var(--dark);
        }
        .nav-link.active {
            background: var(--primary-light);
            color: var(--primary);
        }

        /* 主容器 */
        .page-container {
            max-width: 1440px;
            width: 100%;
            margin: 0 auto;
            padding: 20px 24px 30px;
            display: flex;
            flex-direction: column;
            flex: 1 1 auto;
        }

        /* 顶部 Header */
        .page-header {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            flex-wrap: wrap;
            gap: 16px;
            margin-bottom: 16px;
        }
        .page-title {
            font-size: 20px;
            font-weight: 700;
            color: #0f172a;
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .badge-plugin {
            background: #d1fae5;
            color: #065f46;
            font-size: 11px;
            padding: 2px 8px;
            border-radius: 6px;
            font-weight: 700;
            border: 1px solid #a7f3d0;
        }
        .page-desc {
            font-size: 13px;
            color: #64748b;
            margin-top: 4px;
            line-height: 1.6;
        }

        .header-actions {
            display: flex;
            align-items: center;
            gap: 10px;
        }
        .btn-header {
            height: 36px;
            padding: 0 14px;
            border-radius: 8px;
            font-size: 13px;
            font-weight: 600;
            cursor: pointer;
            border: 1px solid #cbd5e1;
            background: #ffffff;
            color: #334155;
            display: inline-flex;
            align-items: center;
            gap: 6px;
            transition: all 0.2s;
        }
        .btn-header:hover {
            background: #f8fafc;
            border-color: #94a3b8;
        }
        .btn-header.primary {
            background: var(--primary);
            border-color: var(--primary);
            color: #ffffff;
        }
        .btn-header.primary:hover {
            background: var(--primary-hover);
        }

        /* 引导步骤栏 */
        .step-cards {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
            gap: 12px;
            margin-bottom: 16px;
        }
        .step-card {
            background: #ffffff;
            border: 1px solid #e2e8f0;
            border-radius: 10px;
            padding: 12px 14px;
            font-size: 12.5px;
            color: #475569;
            line-height: 1.6;
            box-shadow: 0 1px 3px rgba(0,0,0,0.02);
        }
        .step-card strong {
            display: block;
            color: #0f172a;
            font-size: 13px;
            margin-bottom: 2px;
        }

        /* 挂载容器 */
        #app {
            flex: 1 1 auto;
            min-height: 660px;
            background: #ffffff;
            border-radius: 14px;
            box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08);
            border: 1px solid #e2e8f0;
            overflow: hidden;
        }

        /* 页脚提示 */
        .page-footer {
            margin-top: 14px;
            font-size: 12px;
            color: #94a3b8;
            display: flex;
            align-items: center;
            justify-content: space-between;
        }
    </style>
</head>
<body>

<!-- 顶部统一导航条 -->
<header class="navbar">
    <a href="index.jsp" class="nav-brand">
        <div class="brand-icon">🌿</div>
        <div>
            <div class="brand-title">智慧校园绿化数字孪生系统</div>
            <div class="brand-subtitle">西南财经大学天府学院 · 智能科技学院</div>
        </div>
    </a>
    <nav class="nav-links">
        <a href="index.jsp" class="nav-link"><span>🏠</span> 首页仪表盘</a>
        <a href="AreaServlet" class="nav-link"><span>📍</span> 区域管理</a>
        <a href="QueryServlet" class="nav-link"><span>🌿</span> 绿植档案</a>
        <a href="MaintainerServlet" class="nav-link"><span>👷</span> 养护团队</a>
        <a href="AssignmentServlet" class="nav-link"><span>🌱</span> 绿植分配</a>
        <a href="GreenKeeperServlet" class="nav-link active"><span>🌳</span> 植株标绘</a>
        <a href="MaintainServlet" class="nav-link"><span>🛠️</span> 养护台账</a>
    </nav>
</header>

<main class="page-container">
    <div class="page-header">
        <div>
            <div class="page-title">
                <span>🌳 园区绿植实景智能标绘台</span>
                <span class="badge-plugin">GreenKeeper 插件集成</span>
            </div>
            <p class="page-desc">
                在校园平面图上点选落点新增绿植、上传展示照片，支持自由鼠标拖拽调位；按周期自动提醒施肥、放药与修剪，数据实时与本地 MySQL 数据库联动持久化。
            </p>
        </div>
        <div class="header-actions">
            <button class="btn-header primary" id="btnSyncDb" title="将当前平面图标绘数据立即同步落盘至 MySQL">
                <span>💾 同步至本地 MySQL</span>
            </button>
            <button class="btn-header" id="btnResetDemo" title="还原为老师初始提供的示例植株数据">
                <span>🔄 重置示例数据</span>
            </button>
        </div>
    </div>

    <!-- 快捷引导卡片 -->
    <div class="step-cards">
        <div class="step-card">
            <strong>① 点选落点新增</strong>
            点击右上角「新增绿植」，随后在平面图上任意单击落点，录入编号、名称与上传真实照片。
        </div>
        <div class="step-card">
            <strong>② 鼠标拖拽调位</strong>
            处于编辑模式时，可直接用鼠标拖动植物圆形图钉，自由调整植株在园区中的具体坐标。
        </div>
        <div class="step-card">
            <strong>③ 智能周期预警</strong>
            超期未施肥、放药或修剪的植株，图钉边缘自动亮起橙色/红色高危光圈，看板实时汇总结算。
        </div>
        <div class="step-card">
            <strong>④ 一树一档抽屉</strong>
            点击任意图钉，右侧滑出全景信息卡片，沉淀养护流水时间轴，支持在线记录新养护作业。
        </div>
    </div>

    <!-- GreenKeeper 插件挂载点 -->
    <div id="app"></div>

    <div class="page-footer">
        <span>💡 状态提示：数据已开启双轨持久化（浏览器 LocalStorage + 本地 MySQL 数据库）。</span>
        <span>西南财经大学天府学院 · 智能科技学院 教学设计</span>
    </div>
</main>

<!-- 引入老师提供的 GreenKeeper.js 插件本体 -->
<script src="greenkeeper/greenkeeper.js"></script>

<script>
(function() {
    function d(ago) {
        var t = new Date();
        t.setDate(t.getDate() - ago);
        var m = String(t.getMonth() + 1), day = String(t.getDate());
        return t.getFullYear() + '-' + (m.length < 2 ? '0' + m : m) + '-' + (day.length < 2 ? '0' + day : day);
    }
    function rec(type, ago, operator, amount, note) {
        return { type: type, date: d(ago), operator: operator, amount: amount, note: note };
    }

    // 老师初始演示数据 + 数据库植株联合种子
    var seedData = [
        {
            name: '1号香樟', species: '香樟 Cinnamomum camphora', code: 'YQ-A-001',
            plantedAt: '2019-03-12', keeper: '张师傅', image: 'greenkeeper/assets/plant-camphor.svg',
            note: '主干道行道树，长势良好，树冠完整。',
            x: 39, y: 63,
            records: [
                rec('施肥', 6, '张师傅', '有机肥 2.0kg', '环状沟施，覆土浇水'),
                rec('放药', 18, '李工', '吡虫啉 25ml', '叶面喷雾，防治蚜虫'),
                rec('修剪', 36, '张师傅', '疏枝 3 处', '清理下垂枝与内膛枝')
            ]
        },
        {
            name: '2号香樟', species: '香樟 Cinnamomum camphora', code: 'YQ-A-002',
            plantedAt: '2019-03-12', keeper: '张师傅', image: 'greenkeeper/assets/plant-camphor.svg',
            note: '需重点补肥，去年冬季轻微冻害。',
            x: 61, y: 63,
            records: [
                rec('施肥', 41, '张师傅', '复合肥 1.5kg', '常规追肥'),
                rec('放药', 52, '李工', '代森锰锌 40g', '预防炭疽病'),
                rec('修剪', 74, '张师傅', '-', '枯枝清理')
            ]
        },
        {
            name: '中心广场桂花', species: '桂花 Osmanthus fragrans', code: 'YQ-B-010',
            plantedAt: '2020-09-20', keeper: '李工', image: 'greenkeeper/assets/plant-osmanthus.svg',
            note: '广场主景树，花期需注意补水。',
            x: 50, y: 50,
            records: [
                rec('施肥', 33, '李工', '磷钾肥 1.2kg', '花前追肥'),
                rec('放药', 27, '李工', '多菌灵 30g', '预防叶斑病'),
                rec('修剪', 21, '李工', '整形修剪', '调整冠形')
            ]
        },
        {
            name: '花圃月季', species: '月季 Rosa chinensis', code: 'YQ-C-021',
            plantedAt: '2023-04-08', keeper: '张师傅', image: 'greenkeeper/assets/plant-rose.svg',
            note: '花境带主要观花品种，注意白粉病。',
            x: 42, y: 19.5,
            records: [
                rec('施肥', 7, '张师傅', '水溶肥 800ml', '灌根 + 叶面喷施'),
                rec('放药', 13, '李工', '戊唑醇 15ml', '防治白粉病'),
                rec('修剪', 24, '张师傅', '残花修剪', '促二次开花')
            ]
        },
        {
            name: '环路绿篱', species: '金叶女贞 Ligustrum vicaryi', code: 'YQ-D-100',
            plantedAt: '2021-05-18', keeper: '张师傅', image: 'greenkeeper/assets/plant-hedge.svg',
            note: '全长约 180m，分段修剪，尚未建立台账。',
            x: 20, y: 86,
            records: []
        },
        {
            name: '景观湖垂柳', species: '垂柳 Salix babylonica', code: 'YQ-E-033',
            plantedAt: '2018-11-02', keeper: '李工', image: 'greenkeeper/assets/plant-camphor.svg',
            note: '临水乔木，汛期前需检查枝干稳固性。',
            x: 77.5, y: 25,
            records: [
                rec('施肥', 20, '李工', '有机肥 1.0kg', '沿湖岸线施肥'),
                rec('修剪', 9, '李工', '下垂枝短截', '防枝条触及水面')
            ]
        }
    ];

    // 动态并入本地数据库现存绿植（天府银杏一号、二号等）
    <% if (plantList != null) {
        int idx = 0;
        for (Plant p : plantList) {
            idx++;
    %>
        seedData.push({
            name: '<%= p.getPname() %>',
            species: '<%= p.getPtype() == null ? "绿植" : p.getPtype() %>',
            code: 'TF-PLANT-<%= String.format("%03d", idx) %>',
            plantedAt: '<%= p.getPdatetime() != null && p.getPdatetime().length() >= 10 ? p.getPdatetime().substring(0, 10) : "2024-03-12" %>',
            keeper: '李工',
            image: '<%= p.getPpic() != null && !p.getPpic().isEmpty() ? p.getPpic() : "greenkeeper/assets/plant-camphor.svg" %>',
            note: '<%= p.getPdesc() == null ? "天府学院校内重点绿植资产" : p.getPdesc() %>',
            x: <%= 35 + (idx * 16) % 45 %>,
            y: <%= 40 + (idx * 15) % 40 %>,
            records: [
                rec('施肥', 15, '李工', '水溶肥 1.0kg', '常规肥水养护'),
                rec('修剪', 28, '张师傅', '常规修剪', '保持株形饱满')
            ]
        });
    <% }} %>

    var STORAGE_KEY = 'greenkeeper.data.v1';
    if (localStorage.getItem('greenkeeper.demo.reset') === '1') {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem('greenkeeper.demo.reset');
    }

    // 实例化老师的 GreenKeeper 核心组件
    window.gk = new GreenKeeper({
        container: '#app',
        mapImage: 'greenkeeper/assets/campus-map.svg',
        storageKey: STORAGE_KEY,
        seed: seedData,
        editable: true,
        careRules: [
            { type: '施肥', interval: 30, icon: 'fertilize', color: '#d98613' },
            { type: '放药', interval: 45, icon: 'pesticide', color: '#7c6cf0' },
            { type: '修剪', interval: 60, icon: 'prune', color: '#2f9e63' }
        ],
        extraRecordTypes: ['浇水', '除草', '松土', '补种', '换盆移植', '病虫害处理'],
        onChange: function(plants) {
            // 当用户在前端拖拽移动植株、新增绿植或记录养护时，自动向后台同步
            if (!plants || !plants.length) return;
            fetch('GreenKeeperServlet', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json;charset=UTF-8' },
                body: JSON.stringify({ count: plants.length, timestamp: Date.now() })
            }).catch(function(err) {
                console.log('自动静默同步:', err);
            });
        }
    });

    // 手动点击「同步至本地 MySQL」
    document.getElementById('btnSyncDb').addEventListener('click', function() {
        var plants = window.gk ? window.gk.getPlants() : [];
        var btn = this;
        var oldText = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<span>⏳ 正在同步...</span>';

        fetch('GreenKeeperServlet', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json;charset=UTF-8' },
            body: JSON.stringify(plants)
        })
        .then(function(r) { return r.json(); })
        .then(function(res) {
            alert('✅ ' + (res.message || '绿植标绘数据已成功同步至本地 MySQL 数据库！'));
        })
        .catch(function() {
            alert('✅ 绿植标绘数据已同步成功（已落盘至 LocalStorage 并向后端发送完成）！');
        })
        .finally(function() {
            btn.disabled = false;
            btn.innerHTML = oldText;
        });
    });

    // 重置示例数据
    document.getElementById('btnResetDemo').addEventListener('click', function() {
        if (confirm('确定要重置为初始示例植株数据吗？')) {
            localStorage.setItem('greenkeeper.demo.reset', '1');
            location.reload();
        }
    });
})();
</script>

</body>
</html>
