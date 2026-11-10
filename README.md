# 智慧校园绿化管理系统

Java Servlet + JSP + MyBatis 实现的校园绿化管理系统（西南财经大学天府学院 · 绵阳校区）。

## 生态主页（第一阶段：虚拟生态动态大屏）

网站打开后的第一屏是 **3D 虚拟生态主页**：加载动画进度条 → 全屏 3D 校园大屏。原系统首页 `index.jsp` 通过右上角 **“进入管理系统 →”** 进入，登录入口为 **“管理员登录”**；系统首页导航栏新增了 **“🌱 生态主页”** 按钮可返回大屏。

### 功能

| 功能 | 说明 |
| --- | --- |
| 3D 校园 | 由已发布的“天府学院绵阳校区 3D 交互地图”迁移而来，建筑按官方平面图拉伸；点击建筑飞行定位并显示详情（含校园实景照片）；校门雕塑为 AI 复原模型 `sculpture_ai.glb`。 |
| 活的场景 | 天空穹顶渐变 + 云随风飘动；鸟群（Boids 分离/对齐/聚合，翅膀扇动）在空中盘旋；中心草坪上低多边形小猫追蝴蝶（奔跑、扑击、坐下看蝴蝶飞走）；水面法线贴图波动；树木随风摆动（风速取自天气）。 |
| 天气 | 先请求服务器代理 `/api/weather`（`WeatherServlet`，10 分钟缓存），失败再由浏览器直连 Open-Meteo，都失败时使用“虚拟天气”（每 30 分钟按 晴 → 多云 → 小雨 → 雾 循环，冬季小雨换成雪）。天气码映射：晴（阳光、光晕）、多云/阴（云量增多、天空变灰）、雨（粒子雨 + 地面变暗 + 水面波纹加大）、雷阵雨（加闪电）、雪（粒子雪 + 地面泛白）、雾（`scene.fog` 加浓）。右上角天气卡片显示温度、天气、风速与数据来源（实时 / 虚拟 / 演示）。 |
| 昼夜 | 按北京时间（UTC+8 计算，不依赖电脑时区）和校区经纬度实时计算太阳高度与方位，连续变化天空颜色、日光方向与强度；夜晚路灯（灯头 + 光晕 + 地面光斑）和建筑窗户亮起，星星与月亮出现。 |
| 季节 | 按北京时间月份：3–5 春（樱花粉/嫩绿树冠 + 花瓣飘落 + 草地小花）、6–8 夏（深绿 + 荷花池荷叶 + 夜间萤火虫）、9–11 秋（银杏黄/枫红树冠 + 落叶）、12–2 冬（灰绿常绿树 + 落叶树只剩枯枝，可下雪）。 |
| 生态板块 | 7 个可点击板块：翠湖水景、中心草坪、图书馆·荷花池、教学楼绿化带、A 区宿舍生活区、C 区宿舍庭院、运动场周边。悬浮高亮 + 浮动标签；点击后相机飞过去放大，显示板块简介面板和“进入板块细节”按钮（第一阶段提示“第二阶段建设中”）。底部“🎬 巡游”按钮会自动依次飞过各板块，适合大屏无人值守展示。 |
| 性能 | 树木、路灯、鸟群、荷叶、小花全部 `InstancedMesh`；雨/雪/花瓣/落叶/萤火虫为顶点着色器驱动的 GPU 粒子（CPU 不逐粒子更新）；像素比上限 2，连续 3 秒低于 35 fps 自动降到 1.5 / 1。全景约 180 次绘制调用、6.7 万三角形。 |

### 文件位置

```
src/main/webapp/ecohome.jsp                 生态主页（welcome-file），注入 contextPath 等配置
src/main/webapp/campus3d/index.html         同一套脚本的静态独立版（不经 Tomcat 也能用静态服务器打开调试）
src/main/webapp/campus3d/js/ecohome.js      主程序：加载进度、HUD、板块、昼夜/天气驱动、演示面板
src/main/webapp/campus3d/js/campus-scene.js 校园底图（建筑/道路/水体/场地/雕塑），迁移自 3D 交互地图
src/main/webapp/campus3d/js/eco-life.js     生态动态层：天空、星空、云、鸟群、小猫与蝴蝶、水波、树木风动与季节、路灯、粒子
src/main/webapp/campus3d/js/eco-weather.js  北京时间、太阳位置、季节、天气码映射、代理/直连/虚拟天气
src/main/webapp/campus3d/js/campus-info.js  建筑与地点介绍
src/main/webapp/campus3d/css/ecohome.css    大屏样式
src/main/webapp/campus3d/data/campus_layout.json  校园布局（官方平面图像素坐标）
src/main/webapp/campus3d/data/zones.json    生态板块配置（见下）
src/main/webapp/campus3d/lib/               three.js r170 经典脚本版、OrbitControls、GLTFLoader（本地文件，不走 CDN）
src/main/webapp/campus3d/img/               校园照片与官方平面图（图片来源：西南财经大学天府学院官网）
src/main/webapp/campus3d/models/sculpture_ai.glb  校园雕塑 AI 模型
src/main/java/Servlet/WeatherServlet.java   /api/weather 天气代理（10 分钟缓存，上游失败时继续用旧缓存）
```

所有资源都是仓库内本地文件，路径为相对路径或 `<%= request.getContextPath() %>`，内网也能运行（内网无法访问 Open-Meteo 时自动使用虚拟天气）。

`AuthFilter` 已把 `/ecohome.jsp`、`/api/weather` 和 `/campus3d/` 下的静态资源列为公开访问，其余页面的登录与角色校验不变。原有的 `campus3d.jsp` / `Campus3dProxyServlet`（代理第三方页面）保留未删，但主页入口不再指向它。

### 板块配置 `campus3d/data/zones.json`

每个板块包含：`id`、`name`、`icon`、`color`、`center`（中心坐标）、`polygon`（范围多边形）、`camera_distance`（点击后相机距离，米）、`area_code`（预留对接数据库 `plant_area.area_code`，当前为建议编码，第二阶段在 `plant_area` 中建同名记录即可关联）、`detail_scene`（预留第二阶段细节 3D 场景入口）、`intro`、`highlights`。坐标与 `campus_layout.json` 一致：官方平面图（2048×1998）像素坐标，x 向东、y 向南，1 像素约 0.4 米。

### 天气数据来源

- [Open-Meteo](https://open-meteo.com/)（免费、免 key，CC BY 4.0 数据许可），请求：
  `https://api.open-meteo.com/v1/forecast?latitude=31.493&longitude=104.687&current=temperature_2m,weather_code,wind_speed_10m,is_day&timezone=Asia%2FShanghai`
- 坐标为西南财经大学天府学院绵阳校区（绵阳市涪城区园兴西街 2 号）附近 31.493°N, 104.687°E。
- 卡片“数据来源”会标明：`实时 · Open-Meteo（服务器代理）` / `实时 · Open-Meteo（浏览器直连）` / `虚拟天气（离线模拟）` / `演示模式`。

### 如何演示切换

- 按 **W** 键，或点击右上角天气卡片 / 底部 **⚙️** 按钮，打开“演示切换面板”：
  - 天气：自动 / 晴 / 多云 / 阴 / 小雨 / 大雨 / 雷阵雨 / 雪 / 雾
  - 季节：自动 / 春 / 夏 / 秋 / 冬
  - 时间：取消“跟随北京时间”后拖动滑块选择 0–24 点；“时间流速”可设 ×60、×600 快速看日出日落
  - “恢复自动”回到实时状态；面板底部显示实时帧率
- 也可以用 URL 参数直接打开某个状态（方便截图）：`ecohome.jsp?weather=61&season=winter&hour=21.5&zone=central_lawn&autostart=1`
  - `weather` 为 WMO 天气码（0 晴、2 多云、3 阴、45 雾、61 小雨、65 大雨、71 雪、95 雷阵雨），`hour` 为北京时间小时，`zone` 为板块 id，`autostart=1` 跳过“进入”按钮，`demo=1` 打开演示面板，`pr=1` 限制像素比。
- Esc 关闭详情面板与演示面板；不点击“进入生态校园”时 4 秒后自动进入（便于大屏开机自启）。

### 开源参考与许可证

- [three.js](https://github.com/mrdoob/three.js) r170（MIT，见 `campus3d/lib/LICENSE-three.txt`）：`three.classic.min.js`、`OrbitControls.classic.js`、`GLTFLoader.classic.js` 为官方 ES 模块转成的经典 `<script>` 版本。
- 天空渐变穹顶着色器改写自 three.js 官方示例 `examples/webgl_lights_hemisphere.html`（MIT），增加了太阳/月亮光晕与雾混合。曾评估 three 自带的 `examples/jsm/objects/Sky.js`（Preetham 物理天空），它需要 ACES 色调映射并会改变整个场景的曝光，且夜间、阴雨难以控制，因此未采用。
- 鸟群采用 Craig Reynolds 的 Boids 三规则（分离、对齐、聚合），思路同 three.js 官方示例 `webgl_gpgpu_birds`（MIT），这里为 CPU 计算 + `InstancedMesh` 的简化实现（36 只鸟）。
- 雨、雪、花瓣、落叶、萤火虫粒子、小猫与蝴蝶模型和动画为本项目自写代码，未引入任何需要构建工具的框架。
- 校园照片与平面图来自西南财经大学天府学院官网（图片来源：西南财经大学天府学院官网）。

### 已知限制

- 小猫、蝴蝶、鸟按卡通比例放大，远景可见；建筑高度为示意。
- 树木种类（常绿/落叶/樱花）为随机分配的示意数据，第二阶段可改为读取 `plant` 表中的真实绿植。
- 树冠风动只作用在可见网格上，阴影不随风摆动。
