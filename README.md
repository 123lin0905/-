# 智慧校园绿化管理系统

Java Servlet + JSP + MyBatis 实现的校园绿化管理系统（西南财经大学天府学院 · 绵阳校区）。

## 生态主页（第一阶段：虚拟生态动态大屏；第二阶段：板块细节场景；画风统一：全景改为池塘同款写实风；板块进入提速；动植物增删）

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
| 性能 | 见下文“画质档与省电模式”与“性能数据”。树木、灌木、路灯、鸟群、荷叶、花丛全部 `InstancedMesh`；同材质的建筑墙面 / 屋面、地面、道路合并成单个网格；远处树木用公告板（impostor）；阴影只罩住观察点附近；雨/雪/花瓣/落叶/萤火虫为 GPU 粒子。 |

### 文件位置

```
src/main/webapp/ecohome.jsp                 生态主页（welcome-file），注入 contextPath 等配置
src/main/webapp/campus3d/index.html         同一套脚本的静态独立版（不经 Tomcat 也能用静态服务器打开调试）
src/main/webapp/campus3d/js/ecohome.js      主程序：加载进度、HUD、板块、昼夜/天气驱动、演示面板
src/main/webapp/campus3d/js/campus-scene.js 校园底图（建筑/道路/水体/场地/雕塑），迁移自 3D 交互地图
src/main/webapp/campus3d/js/eco-life.js     生态动态层：程序化树木（近处实例化几何 + 远处公告板）、灌木花丛、荷叶、鸟群、小猫与蝴蝶、路灯、粒子
src/main/webapp/campus3d/js/campus-look.js  全景渲染层：池塘同款天空/IBL/光照阴影/色调映射与后期、材质补丁、简化版池塘水面
src/main/webapp/campus3d/js/pond-style-core.js  从池塘场景抽出的共享画风代码（tools/build_pond.py 生成，勿手改）
src/main/webapp/campus3d/js/pond-style.js   共享光照模型、天气预设映射、“清晰 / 流畅 / 省电”画质档（两页共用，核显自动省电）
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
| 性能 | 与全景共用“清晰 / 流畅 / 省电”画质档（见下文“画质档与省电模式”）。清晰：像素比 `min(dpr, 2)`、SSAO / 体积光 / 景深；流畅：像素比 `min(dpr, 1.25)`、关闭这些特效；省电：像素比 1 × 0.85、512 静态阴影、关闭后期与 MSAA、草 / 叶片卡与锦鲤减半、30 fps 上限。水面涟漪模拟网格 256²（手机、流畅或省电档 128²）。核显 / 高 DPR 笔记本首次默认省电；其余按实测帧率只降不升（分辨率 1 → 0.8 → 流畅 → 省电），提示带 **“恢复清晰”** 按钮。 |
| 抚摸锦鲤（G） | 抚摸点一定在水里（离岸 sdf < -0.3 米，不合格时沿池岸找最近的合格岸点；荷花池版避开荷叶密集处），镜头蹲在岸上俯看；锦鲤到位判定距离 0.3 米，最多等 6 秒，超时把最近的锦鲤平滑引到手边；特写期间两侧面板隐藏。 |
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

### 画质档与省电模式（清晰 / 流畅 / 省电）

两个场景右上角都有同一个“画质 清晰 | 流畅 | 省电”切换（全景在顶栏按钮组最前、天气卡左侧；池塘在“池塘生态”面板左侧），选择保存在 `localStorage`（`campus.gfx`），两页共用，**用户手动选择后始终以用户为准**。

选择顺序：

1. URL 参数强制（只对本次打开有效，不写入本地设置）：`?quality=high|smooth|eco`，或 `?gfx=clear|smooth|eco`（旧参数 `quality=low` 等同流畅）。
2. 用户手动选择（`campus.gfx`）。
3. 设备识别（首次）：用 `WEBGL_debug_renderer_info` 读 GPU 名，含 Intel / Iris / UHD / HD Graphics / Radeon(TM) Graphics / Radeon Vega 核显 / Mali / Adreno / PowerVR / SwiftShader / llvmpipe 等核显或软件渲染（独显 Radeon RX / Pro 除外），或高 DPR 笔记本屏（`devicePixelRatio ≥ 1.5` 且物理宽度 `screen.width × dpr ≤ 2560`，如华为 MateBook 14 的 2160×1440 @150–200%）时默认 **省电**，并只提示一次“已为你的电脑切换到省电模式，可在右上角切换”（`campus.gfx.ecoHint`）；手机默认流畅；其余默认清晰。

| | 清晰 | 流畅 | 省电 |
| --- | --- | --- | --- |
| 全景 | 像素比 `min(dpr,2)`、HDR + 4×MSAA 后期（泛光/暗角）、2048 阴影、水面平面反射、近处实景树最多 70 棵 | 像素比 1、无后期、1024 阴影、无平面反射、近处实景树最多 32 棵 | 像素比 1、无后期、默认帧缓冲不开 MSAA、**512 静态阴影**（只在阴影范围/太阳方向变化时重画，另每 2 秒刷新）、近处实景树最多 16 棵、灌木 55 丛、飞鸟/蝴蝶减半、雨雪 0.3 倍、花瓣/落叶/萤火虫减半、**30 fps 上限** |
| 池塘 | 像素比 `min(dpr,2)`、SSAO / 体积光 / 景深 / 泛光、4096 阴影、反射 1/2 分辨率 | 像素比 `min(dpr,1.25)`、关闭 SSAO/体积光/景深、涟漪网格 128² | 像素比 **1 × 0.85 渲染缩放**、关闭全部后期（含泛光）与 MSAA、**512 静态阴影**、反射 1/8 + 折射 1/2 分辨率、草 / 叶片卡与原有锦鲤减半、雨雪 / 萤火虫 / 水下微粒减半、涟漪网格 128²、**30 fps 上限** |

- 30 fps 上限用“时间累积跳帧”：不够 33.3 ms 的 rAF 整帧跳过（不推进时钟、不渲染），余量带到下一帧，60/120/144 Hz 屏上都稳定在 30 fps 左右，不会忽快忽慢。
- 草 / 叶片卡减半：实例按“偶数在前、奇数在后”重排，省电时只画前一半，运行时切档立即生效；随机序列、布局和编辑器里的“原有个体”编号都不变。被省电隐藏的原有锦鲤不参与模拟与投影；编辑器放入的锦鲤不受影响。
- 实测（全景，一帧 draw calls，headless Chromium + SwiftShader 软件渲染，仅作三档之间的相对比较，不代表真机帧率）：**省电 75 / 流畅 93 / 清晰 146**。
- 左下角 HUD 显示当前帧率与档位（全景 `#eco-hud`，池塘 `#hud`，省电档注明“上限 30”）。
- 运行时切档不重载页面；全景的 WebGL 上下文抗锯齿开关在创建时决定，所以从省电切到流畅时，默认帧缓冲仍不带 MSAA（刷新页面后恢复），清晰档走后期目标自带的 4× MSAA 不受影响。

**自动降档只降不升**（未手动选择时）：全景清晰档连续 4 秒 < 40 fps → 流畅，流畅档连续 6 秒 < 24 fps → 省电，每次换档后冷却 8 秒；池塘帧时间连续 3 秒 > 24 ms 时依次：渲染分辨率 1 → 0.8（一次）→ 流畅 → 省电，每次调整后冷却 6 秒，渐进加载（植被分帧补种）完成之前不计。不会因为帧率回升而自动升回去；每一档的降档提示每页最多出现一次，带“恢复清晰”按钮（只在用户点击时恢复）。

**“画面一闪一闪”的修复**（核显笔记本上反馈）：

- 池塘自适应分辨率原来升降无滞回：帧时间 > 22 ms 1.5 秒就降 0.1，< 13 ms 4 秒又升 0.1，临界设备上在 0.75 ↔ 0.85 之间来回切；每次切换都 `setSize` + 销毁重建全部渲染目标 + 丢弃阴影贴图 + 叶片材质重编译，下一帧采样到空目标 / 无阴影 → 闪屏，重编译的卡顿又触发下一次降档。现在去掉自动回升，降档需持续 3 秒且有冷却；`setQuality` / `makeTargets` / `resize` 只在像素比、尺寸、画质档真正变化时才重建。
- 全景阴影：阴影范围随相机距离每帧连续变化（差 1 米就更新），纹素大小不停变 → 拉近拉远时阴影边缘抖动；纹素对齐只在世界 xz 上取整，太阳斜射时并未对齐到阴影贴图纹素 → 平移时阴影闪烁。现在范围按 1.25 倍分级带滞回，并在光源空间里按纹素对齐；太阳强度过阈值时阴影开关加滞回（避免反复开关导致材质重编译）。
- 全景 `ResizeObserver` 同尺寸回调也会销毁重建后期 / 反射目标，现在只在画布像素尺寸或档位变化时重建。
- 全景贴地薄层（路缘、标线、驳岸压顶石、场地线，离下层 5–15 厘米）远景下深度精度不够会 z-fighting，现在加 `polygonOffset`。

全景性能手段：树木 / 灌木 / 路灯 / 鸟群 / 荷叶 / 花丛全部 `InstancedMesh`；同材质的建筑墙面、屋面、地面、道路合并成单个网格；树木按相机距离 LOD（近处实例化真实几何，远处一张预渲染公告板 impostor，每 0.25 秒重分配）；阴影正交相机只罩住观察点附近并按纹素对齐；流畅档关闭后期。

### 板块进入提速（第三阶段 A）

从全景点击“进入板块细节 3D 场景”到池塘可交互，原来要等全部程序化纹理、全部植被生成完、所有着色器同步编译完才出第一帧。现在的做法：

| 手段 | 说明 |
| --- | --- |
| 渐进式加载 | 池塘分两阶段（`tools/pond_init.js`，由 `build_pond.py` 插入）：**第一阶段**只建池岸、地形、驳岸石、石桥小亭、水面、瀑布、庭院灯、锦鲤、手、后期 → 首帧 → 加载遮罩立即淡出，可以喂鱼 / 抚摸 / 切镜头；**第二阶段**在首帧后分帧补上植物纹理、垂柳 / 香樟 / 灌木 / 花境、荷花睡莲、乌龟、水下根系、萤火虫、落叶落花、蜻蜓、气泡。每一小节之间让出主线程；新对象先放进暂存组，`compileAsync` 编好着色器后再逐个挂进场景，避免卡帧。底部小条“正在补种：… xx%”显示第二阶段真实进度，完成后派发 `pond:full` 事件并置 `window.__pondFull = true`。 |
| compileAsync | 首帧前用 `renderer.compileAsync`（three r160）预编译场景着色器；浏览器支持 `KHR_parallel_shader_compile` 时由驱动在后台并行编译、不阻塞主线程，不支持时退回同步 `compile`。 |
| 纹理缓存（IndexedDB） | 花岗岩、卵石、草地、木纹、树皮、瓦片、水面法线、焦散等程序化纹理首次生成后存入 IndexedDB（`pond-style-core.js` 中的 `pondTexCache`），之后直接读取；键 = 生成代码的内容哈希，生成器改了自动失效。全景与池塘共用。URL 加 `?texcache=0` 可关闭缓存（每次重新生成，便于调试）。 |
| 主脚本可缓存 | 池塘主脚本从 `pond.html` 拆成 `pond/pond-main.js`，`pond.html` 以 `pond-main.js?v=<内容哈希>` 引用（`build_pond.py` 生成时计算），内容不变时浏览器长期缓存，改了自动换版本号。`pond.html` 本身只剩约 21 KB。 |
| StaticAssetFilter | `/campus3d/*` 静态资源过滤器（`Servlet/StaticAssetFilter.java`）：js / css / html / json / svg 按 `Accept-Encoding` 返回 gzip（压缩结果按“路径 + 修改时间”缓存在内存，只压一次，并带 `X-Raw-Length` 原始大小）；缓存头：带 `?v=` 版本号的资源一年 + `immutable`，`campus3d/lib/` 一个月，图片 / 模型一周，其余 `no-cache`（走 ETag / Last-Modified 协商）。 |
| 主页预取 | 全景主页加载完后空闲时（`requestIdleCallback`）把有细节场景的板块页面及其脚本 / 样式预先下载进浏览器缓存；选中板块时立即开始预取该板块。URL 加 `?prefetch=0` 可关闭。 |
| 真实进度条 | 点击“进入板块细节”时若预取还没完成，过渡遮罩按已下载字节数（`X-Raw-Length`）显示真实进度，下载完再跳转；池塘页加载遮罩的进度按实际生成步骤推进。 |

前后时间线（点击“进入板块细节”→ 池塘首帧可交互；headless Chromium + SwiftShader **软件渲染**、无 GPU 的沙箱实测，绝对值远慢于真机，只用于前后对比）：

| | 改造前 | 改造后 |
| --- | --- | --- |
| 冷启动（浏览器无缓存） | 74.1 s | **20.7 s** |
| 二次进入（有缓存） | 59.7 s | **15.1 s** |

改造后首帧出现时植被尚未补齐，之后在后台分帧补上（同一沙箱中第二阶段约需 1.5–2.5 分钟，真机 GPU 下快得多）。修复记录：第二阶段把暂存组里的对象挂进场景时，原先一次性 `scene.add(...多个对象)` 会因 three.js 内部回调 `this.add` 又落回暂存组，导致植被实际没有显示；已改为逐个挂入（`tools/pond_init.js` 的 `stageFlush`）。

### 性能数据

一帧内全部 render 调用累计（含阴影、平面反射、后期 pass；`renderer.info.autoReset=false`），1280×720、北京时间正午、晴、夏季；测量脚本与原始数据不在仓库内（headless Chromium + SwiftShader 软件渲染，帧时间无参考价值，只比较 draw calls 与三角形数）。

| 视角 | 改造前（旧卡通风） | 改造后 · 清晰 | 改造后 · 流畅 |
| --- | --- | --- | --- |
| 全景俯视 | 313 次 / 12.1 万 | 146 次 / 11.0 万 | 93 次 / 10.3 万 |
| 板块近景（翠湖） | 278 次 / 10.2 万 | 142 次 / 5.5 万 | 105 次 / 6.8 万 |
| 街道视角 | 215 次 / 10.1 万 | 162 次 / 40.6 万 | 126 次 / 19.2 万 |
| 池塘（翠湖） | 739 次 / 1308 万（`quality=high`） | 541 次 / 884 万 | 732 次 / 1308 万 |

街道视角三角形增加是因为近处树木换成了池塘同款的真实分枝几何（最多 70 / 32 棵），远处仍为公告板；draw calls 全面下降。池塘数据为同一场景、同一参数下的单帧统计（含反射、折射、阴影等多个 pass）；清晰档数字低于流畅档的原因未逐 pass 拆解。真机 1080p 集成显卡帧率未在本环境实测（无 GPU）。

### 动植物增删与栽种 / 移植动画（第三阶段 B，池塘试点 · 通用编辑器）

在池塘细节场景（翠湖水景、图书馆·荷花池）右侧“池塘生态”面板点 **“✏️ 管理动植物”** 进入编辑模式（植被还在后台补种时按钮置灰，显示“生态加载中…”）。镜头切到俯瞰，顶部徽标显示“编辑模式 · 保存到服务器”或“演示模式 · 未保存到服务器”。

| 操作 | 说明 |
| --- | --- |
| 新增 | 点“＋ 新增”→ 目录里选物种 → 鼠标在场景里移动出现放置预览（绿色可放 / 红色不可放，并提示原因，如“荷花是挺水植物，要种在水里”“乔木只能种在岸上（离水至少 0.9 米）”“离「垂柳」太近”“这里已有原有的树木或花境”——岸上植物会避开场景原有的树丛、灌木与花境，避免种进树冠里被遮住）→ 点击放下。 |
| 选中 / 移植 | 点中个体（场景原有的垂柳、荷叶、睡莲、锦鲤也可以选中）出现黄色选中环；“↔ 移植”模式下按住拖到新位置松开。 |
| 删除 | 选中后按 Delete 或“🗑 删除”，弹出确认框。 |
| 撤销 | “↶ 撤销”或 Ctrl+Z，可撤销新增 / 删除 / 移植。Esc 退出放置。 |
| 清单数量 | 面板清单实时显示数量：垂柳 / 荷花 / 睡莲 / 锦鲤显示总数“×N”（原有个体也登记在编辑器里）；其余物种显示新增数量“＋N”。 |
| 恢复 | 重新进入板块时读取已保存的记录：新增的个体直接出现、移除的原有个体不再显示、移植过的原有个体在新位置。 |

**物种目录（池塘）**：植物 —— 荷花、睡莲、菖蒲、再力花、芦苇、垂柳、香樟、桂花；动物 —— 锦鲤、青蛙、乌龟、蜻蜓。荷花 / 睡莲 / 垂柳 / 香樟 / 桂花复用池塘原有的生成算法（递归分枝树 + 叶片卡、荷叶 / 睡莲叶几何、荷花 `flower()`）和同一套材质，新种的与原有的画风一致；菖蒲、再力花、芦苇为新写株型；青蛙、乌龟、蜻蜓克隆场景里的模型；锦鲤为实例化渲染（名单扩到 24 条，编辑器放入的锦鲤用空位）。

**动画**：
- 地面栽种（乔木 / 芦苇）：开坑、土粒粒子飞溅 → 幼苗破土 → 长成（回弹缓动）→ 回填土粒、坑缩小消失。
- 移除植物：连根拔起，露出带根系的土球 → 提起、倾斜并缩小 → 坑回填；水生植物沉入水下并带涟漪。
- 移植：带根土球拔起 → 沿弧线移到新位置 → 落坑回填；睡莲顺着水面漂过去，一路带出涟漪。
- 水生植物（荷花、菖蒲、再力花）从水下冒出，带少量水珠和两圈涟漪（涟漪环为细环、低不透明度，与写实水面协调）；睡莲浮上水面。
- 动物入场 / 离场：锦鲤入水溅起水花（水珠粒子 + 水面波纹）、气泡后淡入，离场时下潜淡出（移植为“捞起 → 放入”）；青蛙抛物线跳入 / 跳走（落水有水花、落在睡莲叶上叶片下沉）；乌龟慢慢爬入 / 爬走（身体左右摆）；蜻蜓沿曲线飞入后悬停振翅，再飞走。
- 同一个体的新操作会先把旧动画快进到终点，动画可以随时打断。

**保存**：已登录且角色为管理员 / 养护员时实时保存到服务器（表 `zone_species`）；未登录、无权限、数据库不可用（接口 503）或网络错误时自动切到 **演示模式**，修改保存在浏览器 `localStorage`（键 `pond-species-demo:<板块id>`），面板明确提示“⚠ 演示模式，未保存到服务器”。

#### 接口与权限

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/zones/{zoneId}/species` | 公开。返回板块信息、`editable`、`can_edit`（当前会话能否编辑）、`user` 与全部记录（含已移除的原有个体，前端据此隐藏）。 |
| GET | `/api/zones/{zoneId}/species/{id}` | 公开。单条记录。 |
| POST | `/api/zones/{zoneId}/species` | 新增：`species_type`（plant / animal）、`species_key`、`species_name`、`x`、`z`、`rotation`、`scale`（0.2–3）、`quantity`、`status`；带 `seed_ref`（如 `willow#2`，场景原有个体）时按“板块 + seed_ref”幂等：已有记录则更新（200），否则新建（201）。 |
| PUT | `/api/zones/{zoneId}/species/{id}` | 移植 / 修改：`x`、`z`、`rotation`、`scale`、`quantity`、`status`。 |
| DELETE | `/api/zones/{zoneId}/species/{id}` | 软删除：`status = removed`，保留记录与操作人便于追溯。 |

- 写操作要求会话中有 `adminUser`，且角色属于 `SYSTEM_ADMIN`、`SUPER_ADMIN`、`ADMIN`、`PLANT_ADMIN`、`MAINTENANCE_ADMIN`、`MAINTAINER`（`ZoneSpeciesService.EDITOR_ROLES`）。`AuthFilter` 对 `/api/zones/` 的非 GET 请求：未登录返回 JSON **401** `login_required`，角色不符返回 **403** `forbidden`（不跳转登录页，因为调用方是三维场景里的 fetch）；Servlet 内再校验一次，并拒绝 `editable: false` 的板块（403 `zone_readonly`）。
- 数据库不可用时返回 **503** `{"error":"db_unavailable"}`，前端进入演示模式。参数错误 400，板块或记录不存在 404。
- 表结构：`database/002_zone_species.sql`（与 `JdbcZoneSpeciesStore.DDL` 一致；接口首次访问时也会 `CREATE TABLE IF NOT EXISTS`）。字段：`id`、`zone_id`、`area_code`（对应 `plant_area.area_code`）、`species_type`、`species_key`、`species_name`、`seed_ref`、`quantity`、`pos_x`、`pos_z`、`rotation_y`、`scale`、`status`、`created_by/at`、`updated_by/at`；唯一键 `(zone_id, seed_ref)`。
- 单元测试（内存存储，不需要数据库）：`./mvnw -Dtest=ZoneSpeciesServiceTest test`（`MyBatisTest` 需要真实数据库，所以用 `-Dtest` 只跑新测试；`pom.xml` 已把 surefire 升到 3.2.5 才能识别 JUnit 5）。

```
src/main/java/Servlet/ZoneSpeciesServlet.java     /api/zones/* 入口（读取 zones.json 的 area_code / editable）
src/main/java/Servlet/ZoneSpeciesService.java     业务逻辑与权限（与容器无关，便于单元测试）
src/main/java/DB/ZoneSpeciesStore.java            存取接口；JdbcZoneSpeciesStore（MySQL）/ MemoryZoneSpeciesStore（测试）
src/main/java/DB/MiniJson.java                    无依赖的小型 JSON 解析 / 序列化
src/main/java/org/example/demo1/ZoneSpecies.java  记录实体
src/main/webapp/campus3d/js/species-editor.js     通用编辑器（与场景解耦）
src/main/webapp/campus3d/pond/pond-species.js     池塘适配层：物种目录、放置规则、动物动画、原有个体
tools/pond_edit_hooks.js                          池塘场景钩子 window.PondEdit（由 build_pond.py 插入 pond-main.js）
database/002_zone_species.sql                     迁移脚本
```

#### 新板块接入步骤

1. `campus3d/data/zones.json`：给板块设 `"editable": true`，`"catalog"` 写允许增删的物种 key 列表（`null` 或 `editable: false` 为只读；全景页目前只读）。服务端同样读取 `editable`，只读板块的写请求返回 403。
2. 在该板块的细节场景页引入 `../js/species-editor.js` 和一个适配层脚本（参照 `pond/pond-species.js`），场景建完后调用 `SpeciesEditor.create({...})`，提供：
   - `catalog`：`[{ key, name, type: 'plant'|'animal', icon, desc, rule, radius, anim: 'tree'|'shrub'|'aquatic'|'floating', make(ind) → Object3D }]`；动物或由场景接管的个体可改为提供 `spawn / despawn / moveTo / enter / exit / transplant / idle` 钩子；
   - `canPlace(entry, x, z) → { ok, reason }` 放置规则；`pick(raycaster) → {x, y, z}` 地面 / 水面拾取；`surfaceY(x, z, entry)` 地表高度；
   - `seeds`：场景原有、允许选中的个体 `[{ ref: 'willow#0', key, obj }]`（`ref` 要稳定，后端按它记录原有个体的移除 / 移植）；
   - `zoneId`、`apiBase`（默认 `../../api/zones/`）、`storageKey`（演示模式本地存储键），以及可选 `hooks`（`ripple`、`splash`、`onToggle`）与 `onCounts`（清单数量回调）。
3. 调 `editor.buildUI(容器)` 放“✏️ 管理动植物”按钮，`editor.load()` 读取并恢复已保存状态，每帧调用 `editor.update(dt)`。
4. 数据库已执行 `database/002_zone_species.sql`（或让接口首次访问时自动建表）；需要关联绿化档案时在 `plant_area` 中建与 `area_code` 同名的区域。

### 板块配置 `campus3d/data/zones.json`

每个板块包含：`id`、`name`、`icon`、`color`、`center`（中心坐标）、`polygon`（范围多边形）、`camera_distance`（点击后相机距离，米）、`area_code`（预留对接数据库 `plant_area.area_code`，当前为建议编码，第二阶段在 `plant_area` 中建同名记录即可关联）、`detail_scene`（板块细节 3D 场景，相对 `campus3d/` 的路径；`null` 表示建设中）、`editable` / `catalog`（是否开放动植物增删及可增删的物种，见上文）、`intro`、`highlights`。坐标与 `campus_layout.json` 一致：官方平面图（2048×1998）像素坐标，x 向东、y 向南，1 像素约 0.4 米。

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
- 池塘细节场景渲染开销较大（反射、折射、焦散、后期），首次加载需编译着色器；集成显卡 / 高 DPR 笔记本首次默认省电档，手机默认流畅档。场景中的物种为示意设计；动植物增删目前只在池塘两个板块试点，记录保存在 `zone_species`，尚未与 `plant` 绿植档案逐株关联。
