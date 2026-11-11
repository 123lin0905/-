# 智慧校园绿化管理系统

Java Servlet + JSP + MyBatis 实现的校园绿化管理系统（西南财经大学天府学院 · 绵阳校区）。

## 生态主页（第一阶段：虚拟生态动态大屏；第二阶段：板块细节场景；画风统一：全景改为池塘同款写实风）

网站打开后的第一屏是 **3D 虚拟生态主页**：加载动画进度条 → 全屏 3D 校园大屏。原系统首页 `index.jsp` 通过右上角 **“进入管理系统 →”** 进入，登录入口为 **“管理员登录”**；系统首页导航栏新增了 **“🌱 生态主页”** 按钮可返回大屏。

### 功能

| 功能 | 说明 |
| --- | --- |
| 3D 校园 | 由已发布的“天府学院绵阳校区 3D 交互地图”迁移而来，建筑按官方平面图拉伸；点击建筑飞行定位并显示详情（含校园实景照片）；校门雕塑为 AI 复原模型 `sculpture_ai.glb`。**画风与池塘细节场景统一为写实风**（见下文“画风统一”）：红砖 / 白色涂料外墙 + 铝框玻璃窗（程序化反照率、法线、粗糙度/金属度、夜间窗灯）、灰石勒脚、混凝土平屋面与灰瓦坡屋面、金属穹顶；校外沥青路、校内花岗岩条石铺装、广场大石板、塑胶跑道与人造草坪。 |
| 活的场景 | 与池塘相同的 Preetham 物理天空 + 程序化云层 + 星月夜空；鸟群（Boids 分离/对齐/聚合，扇翅 + 滑翔）在空中盘旋；中心草坪上橘色虎斑猫追蝴蝶（奔跑、扑击、坐下看蝴蝶飞走）；翠湖、荷花池、游泳池为池塘水面的简化版（菲涅尔 + 天空环境光反射 + 平面反射 + 两层涟漪法线 + 雨点涟漪，冬季结冰）；树木用池塘同款程序化树种（香樟、桂花、银杏、水杉、垂柳、樱花）随风摆动，灌木杜鹃与草坪花丛。 |
| 天气 | 先请求服务器代理 `/api/weather`（`WeatherServlet`，10 分钟缓存），失败再由浏览器直连 Open-Meteo，都失败时使用“虚拟天气”（每 30 分钟按 晴 → 多云 → 小雨 → 雾 循环，冬季小雨换成雪）。天气码映射：晴（阳光、光晕）、多云/阴（云量增多、天空变灰）、雨（粒子雨 + 地面变暗 + 水面波纹加大）、雷阵雨（加闪电）、雪（粒子雪 + 地面泛白）、雾（`scene.fog` 加浓）。右上角天气卡片显示温度、天气、风速与数据来源（实时 / 虚拟 / 演示）。 |
| 昼夜 | 按北京时间（UTC+8 计算，不依赖电脑时区）和校区经纬度实时计算太阳高度与方位，连续变化天空颜色、日光方向与强度；夜晚路灯（灯头 + 光晕 + 地面光斑）和建筑窗户亮起，星星与月亮出现。 |
| 季节 | 按北京时间月份：3–5 春（樱花粉/嫩绿树冠 + 花瓣飘落 + 草地小花）、6–8 夏（深绿 + 荷花池荷叶 + 夜间萤火虫）、9–11 秋（银杏黄/枫红树冠 + 落叶）、12–2 冬（灰绿常绿树 + 落叶树只剩枯枝，可下雪）。 |
| 生态板块 | 7 个可点击板块：翠湖水景、中心草坪、图书馆·荷花池、教学楼绿化带、A 区宿舍生活区、C 区宿舍庭院、运动场周边。悬浮高亮 + 浮动标签；点击后相机飞过去放大，显示板块简介面板和“进入板块细节”按钮：配置了 `detail_scene` 的板块（翠湖水景、图书馆·荷花池）镜头俯冲 + 淡出后进入细节 3D 场景，其余板块提示“建设中”。底部“🎬 巡游”按钮会自动依次飞过各板块，适合大屏无人值守展示。 |
| 性能 | 见下文“画质：清晰 / 流畅”与“性能数据”。树木、灌木、路灯、鸟群、荷叶、花丛全部 `InstancedMesh`；同材质的建筑墙面 / 屋面、地面、道路合并成单个网格；远处树木用公告板（impostor）；阴影只罩住观察点附近；雨/雪/花瓣/落叶/萤火虫为 GPU 粒子。 |

### 文件位置

```
src/main/webapp/ecohome.jsp                 生态主页（welcome-file），注入 contextPath 等配置
src/main/webapp/campus3d/index.html         同一套脚本的静态独立版（不经 Tomcat 也能用静态服务器打开调试）
src/main/webapp/campus3d/js/ecohome.js      主程序：加载进度、HUD、板块、昼夜/天气驱动、演示面板
src/main/webapp/campus3d/js/campus-scene.js 校园底图（建筑/道路/水体/场地/雕塑），迁移自 3D 交互地图
src/main/webapp/campus3d/js/eco-life.js     生态动态层：程序化树木（近处实例化几何 + 远处公告板）、灌木花丛、荷叶、鸟群、小猫与蝴蝶、路灯、粒子
src/main/webapp/campus3d/js/campus-look.js  全景渲染层：池塘同款天空/IBL/光照阴影/色调映射与后期、材质补丁、简化版池塘水面
src/main/webapp/campus3d/js/pond-style-core.js  从池塘场景抽出的共享画风代码（tools/build_pond.py 生成，勿手改）
src/main/webapp/campus3d/js/pond-style.js   共享光照模型、天气预设映射、“清晰 / 流畅”画质档（两页共用）
src/main/webapp/campus3d/js/eco-weather.js  北京时间、太阳位置、季节、天气码映射、代理/直连/虚拟天气
src/main/webapp/campus3d/js/campus-info.js  建筑与地点介绍
src/main/webapp/campus3d/css/ecohome.css    大屏样式
src/main/webapp/campus3d/data/campus_layout.json  校园布局（官方平面图像素坐标）
src/main/webapp/campus3d/data/zones.json    生态板块配置（见下）
src/main/webapp/campus3d/lib/               three.js r160 UMD（全景与池塘同一版本）、OrbitControls、GLTFLoader（r160 经典脚本版，本地文件，不走 CDN）
src/main/webapp/campus3d/img/               校园照片与官方平面图（图片来源：西南财经大学天府学院官网）
src/main/webapp/campus3d/models/sculpture_ai.glb  校园雕塑 AI 模型
src/main/java/Servlet/WeatherServlet.java   /api/weather 天气代理（10 分钟缓存，上游失败时继续用旧缓存）
```

所有资源都是仓库内本地文件，路径为相对路径或 `<%= request.getContextPath() %>`，内网也能运行（内网无法访问 Open-Meteo 时自动使用虚拟天气）。

`AuthFilter` 已把 `/ecohome.jsp`、`/api/weather` 和 `/campus3d/` 下的静态资源列为公开访问，其余页面的登录与角色校验不变。原有的 `campus3d.jsp` / `Campus3dProxyServlet`（代理第三方页面）保留未删，但主页入口不再指向它。

### 板块细节场景（第二阶段）

在生态主页点击 **翠湖水景** 或 **图书馆·荷花池** → **“进入板块细节 3D 场景 →”**，镜头俯冲到板块上方并淡出，打开池塘细节场景 `campus3d/pond/pond.html?zone=<板块id>`；场景左上角 **“← 返回校园全景”** 回到 `ecohome.jsp?zone=<板块id>&autostart=1`，相机停在该板块（演示面板里手动设定的天气/季节/时间会一起带回去）。

| 项目 | 说明 |
| --- | --- |
| 场景来源 | 基于开源项目 [Koi Pond Garden](https://github.com/souranyp-stack/koi-pond-garden)（Sourany Phomhome，**MIT License**，许可全文见 `campus3d/pond/LICENSE-koi-pond-garden.txt`）改造。原作是单文件 three.js r160 场景，全部程序化生成：锦鲤、涟漪模拟 + Gerstner 水面、反射/折射、焦散、荷花睡莲、青蛙、乌龟、蜻蜓、四种天气。 |
| 校园化改造 | 界面全中文；樱花改为垂柳、红枫改为香樟（绿叶），日式石灯笼改为校园庭院灯 + 木质长椅，木桥改为青石拱桥，六角亭改为红柱灰瓦中式小亭，去掉日式竹筒“鹿威し”敲击声；保留锦鲤、荷花、睡莲、青蛙、蜻蜓、乌龟、鸢尾（花菖蒲）、芒草、竹林等。 |
| 界面 | 左上角板块名、简介（读取 `zones.json`）、实时天气与北京时间；右侧“池塘生态”面板列出本池动植物（中文名 + 一句介绍，读取 `campus3d/data/pond_species.json`），点击清单项镜头飞到对应物种（锦鲤/乌龟为跟随镜头）。 |
| 两个板块共用 | 同一场景用 `?zone=` 区分：`cuihu_water`（翠湖水景：石拱桥、20 条锦鲤）与 `library_lotus`（图书馆·荷花池：无桥、成片荷叶与荷花、只放养 8 条锦鲤、庭院灯布局不同）。 |
| 天气 / 季节 / 昼夜 | 与主页同一套逻辑（复用 `campus3d/js/eco-weather.js`）：`/api/weather` → 浏览器直连 Open-Meteo → 虚拟天气；季节按北京时间月份；太阳高度角按北京时间与校区经纬度计算（低于 -2° 为夜晚）。映射到原场景的天气预设：雨/毛毛雨/雷阵雨 → 雨，雪 → 冬雪，秋季晴/多云 → 秋，冬季无雪 → 冬日（落叶树枯枝），其余 → 晴，再叠加多云/阴/雾的云量与雾。夜晚：天空换成星空与月亮、月光照明、庭院灯亮起（点光源）、非冬季岸边出现萤火虫，蜻蜓停飞。 |
| 演示 | 按 **W** 打开演示面板（天气/季节/时间/流速/场景预设 晴·雨·秋·冬雪·夜晚），**T** 轮换天气，**H** 打开高级渲染参数，**I** 操作说明；也支持 URL 参数 `weather`、`season`、`hour`、`demo=1`、`quality=low|high`。自由镜头改用方向键移动（W 留给演示面板）。 |
| 性能 | 与全景共用“清晰 / 流畅”画质档（见下文）。清晰：像素比 `min(dpr, 2)`、SSAO / 体积光 / 景深；流畅：像素比 `min(dpr, 1.25)`、关闭这些特效。水面涟漪模拟网格 256²（手机或流畅档 128²）。不再因 CPU ≤ 4 核就默认低画质，而是按实测帧率决定：帧时间持续超过 22 ms 时先降渲染分辨率（下限 0.75）→ 切到流畅 → 关闭特效，并弹出带 **“恢复清晰”** 按钮的提示（点了之后本页不再自动降档）。 |
| 抚摸锦鲤（G） | 抚摸点一定在水里（离岸 sdf < -0.3 米，不合格时沿池岸找最近的合格岸点；荷花池版避开荷叶密集处），镜头蹲在岸上俯看；锦鲤到位判定距离 0.3 米，最多等 6 秒，超时把最近的锦鲤平滑引到手边。 |
| 资料来源 | 学校官网“绵阳校区 · 校园风采”页（https://tfswufe.edu.cn/zjxy/myyq/xyfc.htm）只有照片、没有文字说明，照片中可见水边垂柳与带遮阳伞的亲水平台，场景的垂柳据此设计；其余物种按四川绵阳常见水生 / 湿地动植物设计，面板中标注“示意”。 |

```
src/main/webapp/campus3d/pond/pond.html               池塘细节场景（改造自 koi-pond.html，文件头注明来源与 MIT 许可）
src/main/webapp/campus3d/pond/pond-campus.js          校园化外壳：板块参数、设备分级、天气/季节/昼夜同步、返回按钮、生态面板、演示面板
src/main/webapp/campus3d/pond/pond-campus.css         细节场景界面样式
src/main/webapp/campus3d/pond/LICENSE-koi-pond-garden.txt  Koi Pond Garden 的 MIT 许可全文
src/main/webapp/campus3d/data/pond_species.json       “池塘生态”清单（按板块）
src/main/webapp/campus3d/lib/three-r160.min.js        three.js r160 UMD（全景与细节场景共用，MIT）
tools/build_pond.py                                   由上游 koi-pond.html 生成 pond.html 与 js/pond-style-core.js 的脚本（见下文）
src/main/webapp/campus3d/lib/dat.gui-0.7.9.min.js     dat.gui 0.7.9（Apache-2.0，文件头保留许可声明）
```

### 池塘场景的生成脚本 `tools/build_pond.py`

`pond.html` 不是手写文件，而是由脚本从上游 Koi Pond Garden 的 `koi-pond.html`（提交 `18213ec`，脚本内校验 sha256）逐条替换生成，所有替换都断言命中次数；同时把池塘画风中两边共用的部分（噪声与程序化纹理、叶片卡与递归分枝树、Preetham 天空着色器、色温、天气预设、风动 GLSL、ACES 色调映射等）原样剪出到 `campus3d/js/pond-style-core.js`，全景与池塘逐字共用同一份代码。

```bash
git clone https://github.com/souranyp-stack/koi-pond-garden tools/koi-pond-garden
git -C tools/koi-pond-garden checkout 18213ec590e987f605cce6564471e6c0f9451d37
python3 tools/build_pond.py            # 或 python3 tools/build_pond.py <koi-pond.html 路径>
```

修改池塘场景（清晰度、抚摸锦鲤、中文化等）请改 `tools/build_pond.py` 后重新生成，不要直接改 `pond.html` / `pond-style-core.js`。

### 画风统一（全景 = 池塘同款写实风）

| 共享系统 | 说明 |
| --- | --- |
| 色调映射 / 曝光 | 同一 ACES 公式（`PONDSTYLE_TONEMAP_GLSL`）+ 同一曝光与天气调色；清晰档走 HDR 后期合成（泛光强度与池塘一致），流畅档用 three 内置 ACESFilmic（数学等价）。 |
| 天空 | 池塘的 Preetham 物理天空 + 程序化云层 + 星星月亮（`SKY_VS / SKY_FS`），天空立方体 → PMREM 环境光照（IBL），与池塘 `updateEnv()` 同法。 |
| 光照 / 天气 | `pondSunLight()` 太阳/月光色温与强度、半球光；`pondWeatherPreset()` 把 WMO 天气 + 季节映射到池塘的晴 / 雨 / 秋 / 冬雪预设并叠加多云/阴/雾；夜晚雾色压暗同一公式。北京时间昼夜、季节、天气来源逻辑不变。 |
| 植被 | 池塘同一套 `growTree` 递归分枝 + `addCard` 叶片卡生成香樟、桂花、银杏、水杉、垂柳、樱花；叶片透光、积雪/湿润/秋色着色补丁与池塘相同；草地用池塘同款程序化草地纹理。 |
| 建筑与路面 | 程序化红砖 / 白色涂料外墙 + 铝框玻璃窗（法线、粗糙度、夜间窗灯）、灰石勒脚、灰瓦坡屋面；花岗岩条石铺装、广场大石板、沥青路。 |
| 水面 | 翠湖、荷花池、游泳池为池塘水面的简化版：菲涅尔 + 天空 IBL 反射 + 平面反射（清晰档）+ 两层涟漪法线（池塘同款水面法线贴图）+ 雨点涟漪，冬季结冰；全景尺度不做折射与焦散。 |

飞鸟、小猫扑蝶、天气粒子、板块点击飞行、巡游、演示面板（W）全部保留。

### 画质：清晰 / 流畅

两个场景右下角 / 工具栏都有同一个“画质 清晰 | 流畅”切换，选择保存在 `localStorage`（`campus.gfx`），两页共用；URL 参数 `gfx=clear|smooth`（或旧参数 `quality=high|low`）可强制。未手动选择时：手机默认流畅、电脑默认清晰，运行中按实测帧率自动降档，降档提示带“恢复清晰”按钮。

| | 清晰 | 流畅 |
| --- | --- | --- |
| 全景 | 像素比 `min(dpr,2)`、HDR + 4×MSAA 后期（泛光/暗角）、2048 阴影贴图、水面平面反射、近处实景树最多 70 棵 | 像素比 `min(dpr,1)`、无后期、1024 阴影贴图、无平面反射、近处实景树最多 32 棵 |
| 池塘 | 像素比 `min(dpr,2)`、SSAO / 体积光 / 景深 | 像素比 `min(dpr,1.25)`、关闭上述特效、涟漪网格 128² |

全景性能手段：树木 / 灌木 / 路灯 / 鸟群 / 荷叶 / 花丛全部 `InstancedMesh`；同材质的建筑墙面、屋面、地面、道路合并成单个网格；树木按相机距离 LOD（近处实例化真实几何，远处一张预渲染公告板 impostor，每 0.25 秒重分配）；阴影正交相机只罩住观察点附近并按纹素对齐；流畅档关闭后期。

### 性能数据

一帧内全部 render 调用累计（含阴影、平面反射、后期 pass；`renderer.info.autoReset=false`），1280×720、北京时间正午、晴、夏季；测量脚本与原始数据不在仓库内（headless Chromium + SwiftShader 软件渲染，帧时间无参考价值，只比较 draw calls 与三角形数）。

| 视角 | 改造前（旧卡通风） | 改造后 · 清晰 | 改造后 · 流畅 |
| --- | --- | --- | --- |
| 全景俯视 | 313 次 / 12.1 万 | 146 次 / 11.0 万 | 93 次 / 10.3 万 |
| 板块近景（翠湖） | 278 次 / 10.2 万 | 142 次 / 5.5 万 | 105 次 / 6.8 万 |
| 街道视角 | 215 次 / 10.1 万 | 162 次 / 40.6 万 | 126 次 / 19.2 万 |
| 池塘（翠湖） | 739 次 / 1308 万（`quality=high`） | 541 次 / 884 万 | 732 次 / 1308 万 |

街道视角三角形增加是因为近处树木换成了池塘同款的真实分枝几何（最多 70 / 32 棵），远处仍为公告板；draw calls 全面下降。池塘数据为同一场景、同一参数下的单帧统计（含反射、折射、阴影等多个 pass）；清晰档数字低于流畅档的原因未逐 pass 拆解。真机 1080p 集成显卡帧率未在本环境实测（无 GPU）。

### 板块配置 `campus3d/data/zones.json`

每个板块包含：`id`、`name`、`icon`、`color`、`center`（中心坐标）、`polygon`（范围多边形）、`camera_distance`（点击后相机距离，米）、`area_code`（预留对接数据库 `plant_area.area_code`，当前为建议编码，第二阶段在 `plant_area` 中建同名记录即可关联）、`detail_scene`（板块细节 3D 场景，相对 `campus3d/` 的路径；`null` 表示建设中）、`intro`、`highlights`。坐标与 `campus_layout.json` 一致：官方平面图（2048×1998）像素坐标，x 向东、y 向南，1 像素约 0.4 米。

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

- [three.js](https://github.com/mrdoob/three.js) r160（MIT，见 `campus3d/lib/LICENSE-three.txt`）：全景与池塘统一使用 `three-r160.min.js`（UMD）；`OrbitControls.classic.js`、`GLTFLoader.classic.js` 为 r160 官方 ES 模块转成的经典 `<script>` 版本。原全景用的 r170 `three.classic.min.js` 已删除。
- 天空：全景改用池塘场景的 Preetham 物理天空 + 程序化云层（来自 Koi Pond Garden，MIT），与池塘共用同一着色器。
- 鸟群采用 Craig Reynolds 的 Boids 三规则（分离、对齐、聚合），思路同 three.js 官方示例 `webgl_gpgpu_birds`（MIT），这里为 CPU 计算 + `InstancedMesh` 的简化实现（36 只鸟）。
- 雨、雪、花瓣、落叶、萤火虫粒子、小猫与蝴蝶模型和动画为本项目自写代码，未引入任何需要构建工具的框架。
- 校园照片与平面图来自西南财经大学天府学院官网（图片来源：西南财经大学天府学院官网）。
- 池塘细节场景基于 [Koi Pond Garden](https://github.com/souranyp-stack/koi-pond-garden)（Copyright (c) 2026 Sourany Phomhome，MIT License，见 `campus3d/pond/LICENSE-koi-pond-garden.txt`）；使用 three.js r160 UMD（MIT）与 [dat.gui](https://github.com/dataarts/dat.gui) 0.7.9（Apache-2.0），均为本地文件。

### 已知限制

- 小猫、蝴蝶、鸟按卡通比例放大，远景可见；建筑高度为示意。
- 树木种类（香樟/桂花/银杏/水杉/垂柳/樱花）按位置随机分配，为示意数据，后续可改为读取 `plant` 表中的真实绿植。
- three r160 的 UMD 版在控制台打印一条“build/three.min.js 已弃用”的警告（不影响运行）；两页都没有改用 ES 模块，以保持无构建工具的经典脚本结构。
- 池塘细节场景渲染开销较大（反射、折射、焦散、后期），首次加载需编译着色器；集成显卡/手机会自动降为低画质。场景中的物种为示意设计，第三阶段再接入数据库中的真实动植物与增删动画。
