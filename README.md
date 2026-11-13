# 智慧校园绿化管理系统

Java Servlet + JSP + MyBatis 实现的校园绿化管理系统（西南财经大学天府学院 · 绵阳校区）。

## 生态主页（第一阶段：虚拟生态动态大屏；第二阶段：板块细节场景；画风统一：全景改为池塘同款写实风；板块进入提速；动植物增删）

> 网站入口现在先出现**人脸识别窗口**（`face_login.jsp`），访客选择“先不录入人脸 / 以访客进入”后进入下面的 3D 虚拟生态主页，详见文末“人脸识别登录与三类账户”。

3D 虚拟生态主页：加载动画进度条 → 全屏 3D 校园大屏。原系统首页 `index.jsp` 通过右上角 **“进入管理系统 →”** 进入，登录入口为 **“管理员登录”**；系统首页导航栏新增了 **“🌱 生态主页”** 按钮可返回大屏。

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

- 写操作要求会话中有 `adminUser`，且角色属于 `SYSTEM_ADMIN`、`SUPER_ADMIN`、`ADMIN`、`PLANT_ADMIN`、`MAINTENANCE_ADMIN`、`MAINTAINER`（`ZoneSpeciesService.EDITOR_ROLES`）。`AuthFilter` 对 `/api/zones/` 的非 GET 请求：未登录返回 JSON **401** `login_required`，访客（只读）与角色不符返回 **403** `forbidden`（不跳转登录页，因为调用方是三维场景里的 fetch）；Servlet 内再校验一次，并拒绝 `editable: false` 的板块（403 `zone_readonly`）。
- 数据库不可用时返回 **503** `{"error":"db_unavailable"}`（不返回 JDBC 原始错误文本），有编辑权限的身份进入演示模式。
- “✏️ 管理动植物”按钮只对有编辑权限的身份显示（GET 返回的 `can_edit`；数据库不可用时看 `/api/me`）；普通用户 / 访客看不到按钮。参数错误 400，板块或记录不存在 404。
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

### 中心草坪板块（平面图风 3D 场景 + 动植物增删）

在生态主页点 **中心草坪** → **“进入板块细节 3D 场景 →”** 打开 `campus3d/lawn/lawn.html?zone=central_lawn`；左上角 **“← 返回校园全景”** 回到 `ecohome.jsp?zone=central_lawn&autostart=1`，相机停在中心草坪板块。

| 项目 | 说明 |
| --- | --- |
| 画风来源 | 取自学校官网绵阳校区平面图 `campus3d/img/plan_official.jpg`：浅绿草地、米色道路带白描边、黄 / 肉色挤出的简洁建筑块（深色侧面）、柔和平光，像一个轻微等距俯视的微缩模型。颜色直接在平面图上取色（草地 `#9ccc8e`、道路 `#ddd0b4`、白色铺地、灰色广场、水面）。 |
| 底图 | `tools/build_lawn_ground.py`（依赖 numpy、scipy、Pillow）从平面图裁出中心草坪周边（像素范围 x 480–1385、y 615–1455，与 `lawn-scene.js` 的 `REGION` 一致），按颜色把像素归为 草地 / 道路 / 白色铺地 / 广场 / 水面，建筑、阴影和文字用最近的地面类别填掉，去 JPEG 噪点、放大 2 倍并抗锯齿，输出 `campus3d/lawn/lawn-ground.png`。道路轮廓与平面图一致；建筑由场景按 `campus_layout.json` 轮廓挤出。重新生成：`python3 tools/build_lawn_ground.py`。坐标：1 场景单位 = 平面图 10 像素 ≈ 4 米。 |
| 物种目录 | 植物 —— 银杏（秋季金黄、椭圆树冠）、桂花（秋季开花）、樱花（春季粉）、香樟、草花花丛 / 花境、灌木球；动物 —— 校园小猫（四种毛色）、蝴蝶（五种翅色）、喜鹊、麻雀、白鹭。全部为低多边形扁平风，由几种实例化图元（方块 / 圆球 / 圆锥 / 圆柱 / 翅膀 / 影子圆片）拼成；秋季有落叶贴地。右侧“中心草坪生态”清单点击即飞到对应物种。 |
| 动画 | 植物沿用通用编辑器的开坑土粒 → 幼苗 → 成株、带土球弧线移植、连根拔起（编辑器新增可选参数 `fx`，本板块用 `fx.flat` 扁平风土粒 / 土坑 / 土球，池塘仍用默认写实值）；小猫走进 / 走开、平时坐着摇尾巴、闲逛，看到附近蝴蝶会压低身子靠近再扑击，蝴蝶受惊飞高；蝴蝶盘旋飞入 / 飞走、扇翅；喜鹊、麻雀、白鹭飞来落地 / 起飞离开，平时觅食跳动。 |
| 放置规则 | 以底图颜色判断地面类别：植物和动物只能放在草坪上，不能在道路、白色铺地、广场、水面和建筑上；植物离道路 / 铺地要留出半个冠幅，不能压住原有的装饰树和灌木，植物之间由编辑器保持间距；蝴蝶可在道路上空。不合格时提示原因（如“不能种在道路，只能种在草坪 / 花境”“这里已有原有的树木 / 灌木，换个空地吧”）。 |
| 原有个体与保存 | 原有个体按平面图在草坪上散植（`seed_ref` 如 `ginkgo#0`），可选中、移植、移除；接口与权限、软删除、`seed_ref` 幂等与池塘完全相同（见上文“接口与权限”），记录存 `zone_species`。未登录 / 无权限 / 无数据库时为演示模式，保存在 `localStorage` 键 `lawn-species-demo:central_lawn`。 |
| 画质 / 性能 | 读取与全景、池塘共用的 `localStorage`「`campus.gfx`」：`clear` 清晰（像素比 ≤ 1.5）、`smooth` 流畅（像素比 1）、`eco` 省电（像素比 1、关抗锯齿、帧率上限 30、不画影子、装饰树减半）；也可用 URL `gfx=clear|smooth|eco`。每种图元一个 `InstancedMesh`，个体只是不渲染的代理 Object3D，每帧把矩阵写进实例；建筑合并为 1 个网格。俯视总览约 **10 次 draw calls**（底图 2 + 建筑 1 + 图元 6 + 编辑器辅助），无后期、无实时阴影贴图。左下角可显示帧率 / 批次 / 三角形统计。 |

```
src/main/webapp/campus3d/lawn/lawn.html          中心草坪细节场景页
src/main/webapp/campus3d/lawn/lawn-scene.js      场景：底图、建筑挤出、实例化图元、相机视角、画质档、返回按钮（导出 window.LAWN）
src/main/webapp/campus3d/lawn/lawn-species.js    动植物增删适配层：物种目录、放置规则、动物行为、原有个体
src/main/webapp/campus3d/lawn/lawn.css           界面样式
src/main/webapp/campus3d/lawn/lawn-ground.png    扁平纯色底图（由 tools/build_lawn_ground.py 生成）
tools/build_lawn_ground.py                       底图生成脚本
```

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

## 人脸识别登录与三类账户（管理员 / 养护人员 / 访客）

在原有 `admin_user` 账号、`LoginServlet`、`AuthFilter` 的基础上扩展，没有另起账户体系；原账号密码登录 `login.jsp` 保留为备用入口。

### 三类身份与入口

| 身份 | 对应角色（`security/Roles.java`） | 能做什么 | 导航里出现的入口 |
| --- | --- | --- | --- |
| 管理员 | `SYSTEM_ADMIN`、`SUPER_ADMIN`、`ADMIN`、`PLANT_ADMIN`、`MAINTENANCE_ADMIN`（原有细分权限不变） | 查看 / 整理后台数据；**数据大屏** `data_screen.jsp`；给自己录入人脸，给任一养护员录入 / 删除人脸；板块动植物增删 | 📊 数据大屏、🙂 人脸录入 |
| 养护人员（可多个） | `MAINTAINER`（`admin_user.maintainer_id` 关联 `maintainer` 档案 → `plant_area.maintainer_id` 得到负责区域） | **养护工作台** `care_workbench.jsp`：浇水 / 施肥 / 喂食；板块动植物增删改查（沿用 species-editor 权限）；给自己录入人脸 | 🧑‍🌾 养护工作台、🙂 人脸录入 |
| 普通用户（访客） | 未登录，或在人脸窗口点“先不录入人脸 / 以访客进入”（会话属性 `visitor=true`） | 只能浏览生态主页、板块场景、系统首页；编辑按钮隐藏，写接口 403 | 🙂 人脸登录 |

- 入口只在对应身份登录后出现在导航（`ecohome.jsp`、`index.jsp`、`admin.jsp`、各新页面顶栏）；直接访问 URL 也由 `AuthFilter.roleGate` 拦截：未登录 → 页面跳 `login.jsp` / 接口 **401**；访客或角色不符 → **403**。访客访问原有后台页面（`QueryServlet`、`AdminDashboardServlet` 等）同样 403。
- **管理员默认不能进养护工作台**（按需求字面）。要允许，改 `security/Roles.java` 一行：`CARE_ROLES` 里加上 `"SYSTEM_ADMIN"` 等角色。
- 登录后的落地页：养护员 → 养护工作台（负责区域排在最前）；`SYSTEM_ADMIN` / `SUPER_ADMIN` / `ADMIN` → 系统后台 `AdminDashboardServlet`；`PLANT_ADMIN` / `MAINTENANCE_ADMIN` → 系统首页 `index.jsp`。账号密码登录仍按原约定统一进 `index.jsp`（唯一例外：从人脸窗口“账号密码登录后录入人脸”过来的直接进录入页）。
- 新建养护员账号：系统后台“新增管理账号”选择角色“养护人员”，并选择关联的养护员档案；负责区域在“园区网格”里给区域指定养护员。演示账号 `keeper_zhang`（关联 WH-1001 张师傅）、`keeper_li`（关联 WH-1002 李工），初始密码 `123456`。

### 登录流程

1. 打开系统（`web.xml` 欢迎页 `face_login.jsp`）先出现人脸识别窗口。已登录 / 已选访客身份的会话直接去各自主页；退出登录后回到窗口但不自动开摄像头（`?logout=1`），避免刚退出又被识别登录。
2. 系统里还没有任何人脸时：提示 **“请先进行人脸录入”**，提供 **“先不录入人脸”**（以访客进入只读的生态主页）和“账号密码登录后录入人脸”。
3. 有人脸时：打开摄像头，连续取 3 帧合格人脸（单人、够近、清晰），特征平均后连同 antispoof / liveness 分数提交 `POST /api/face/identify`；服务端比对成功即建立该账号会话（换 session id），失败可重试、以访客进入或账号密码登录。
4. **录入的身份证明**：必须先用账号密码（或已录入的人脸）登录，只能给自己录入；管理员可以给任一养护员录入 / 删除（不能给其他管理员录入）。录入时按“正视 / 左转 / 右转 / 抬头 / 低头”采集 3–5 帧，服务端校验多帧两两相似（防混进别人）后取平均存为一条；一人可多条（默认最多 5 条）；同一张脸不能录到两个账号。

### 人脸识别实现

- 前端：[@vladmandic/human](https://github.com/vladmandic/human) **3.3.6**（MIT，Copyright (c) Vladimir Mandic），取自 npm 包 `@vladmandic/human@3.3.6`，**库和模型全部放在仓库静态资源里**，不依赖任何境外 CDN：
  - `face/vendor/human/human.esm.js`、`face/vendor/human/LICENSE-human.txt`
  - `face/vendor/human/models/`：`blazeface`（检测）、`facemesh`（关键点 / 头部角度）、`faceres`（1024 维人脸特征）、`antispoof`（防翻拍）、`liveness`（活体），约 12MB
  - `face/vendor/tfjs-wasm/*.wasm`：[@tensorflow/tfjs-backend-wasm](https://github.com/tensorflow/tfjs) 4.22.0（Apache-2.0）；human 默认的 `wasmPath` 指向 jsdelivr，已改为本地路径。默认用 WASM 后端（不依赖显卡驱动），可用 `?backend=webgl` 切换。
  - 公共模块 `face/face-core.js`，页面脚本 `face/face-login.js`、`face/face-enroll.js`；`/face/vendor/` 由 `StaticAssetFilter` 加 30 天缓存头和 gzip。
- 服务端比对（`security/FaceMatcher.java`）：特征向量只上传、从不下发到前端；余弦相似度，按账号取最高分，**最高分 ≥ 阈值且领先第二名账号 ≥ margin** 才算识别成功。faceres 特征非负，不同人的余弦相似度也有 0.25–0.5（用 human 自带样例实测），同一人不同照片约 0.5–0.9，所以默认阈值 0.60。
- 阈值可用 JVM 系统属性调整（`security/FaceConfig.java`，例：`CATALINA_OPTS="-Dface.threshold=0.65"`）：`face.threshold`（0.60）、`face.margin`（0.04）、`face.minReal`（0.30）、`face.minLive`（0.50）、`face.minFrameConsistency`（0.50）、`face.maxPerAccount`（5）、`face.maxAttempts`（同一 IP 5 分钟内识别次数，30，超出 429）。
- **活体 / 防翻拍只是基础防护**：antispoof、liveness 两个模型在浏览器里运行，服务端只能检查上报的分数，无法证明没被篡改；用 human 样例真人照片实测 antispoof 的 real 分数只有 0.40–0.80，所以 `minReal` 不能设高；自动化测试本身就是把**照片做成视频**喂给假摄像头并且通过了识别——说明高清照片 / 屏幕翻拍仍可能通过。需要更强保证时应改用带红外 / 3D 结构光的设备或服务端活体方案。

### 养护工作台（仅养护人员）

- 列出全部可养护个体：生态板块个体（`zone_species`，active）、绿植档案（`plant`）、生态动物档案（`animal`），按区域分组，**当前养护员负责区域的排在最前**（`plant_area.maintainer_id`，绿植另看 `maintainer_plant` 直接分配），可切换“只看我负责的 / 只看待办”。
- 植物：浇水、施肥；动物：喂食。状态按“上次操作时间 + 养护周期”计算（`Servlet/CareSchedule.java`）：从未做过 → 需要；到期 → 需要（显示逾期多久）；剩余 ≤ 周期 20%（至少 6 小时）→ 即将到期；周期为 0 → 不需要。
- 周期可配置：`care_period` 表按物种 key 配置，`*plant` / `*animal` 为默认（植物 3 天浇水、30 天施肥，动物每天喂食）；水生植物（荷花、睡莲、再力花、芦苇）不需要浇水，野生动物（青蛙、蜻蜓、蝴蝶、鸟类）不投喂；绿植档案优先用自身 `water_period_days` / `fertilize_period_days`，动物档案优先用 `feeding_cycle_days`。
- 点按钮即执行，写入 `care_log`（个体、操作类型、操作人、养护员档案、时间、备注），完成后状态刷新；绿植档案同时写原养护台账 `plant_maintenance` 并顺延下次日期，动物档案顺延 `next_feeding_date`。动植物的增删改仍在各生态板块里用“✏️ 管理动植物”完成（卡片上有进入板块的按钮）。

### 数据大屏（仅管理员，骨架）

`data_screen.jsp` + `console/data-screen.js`，数据来自 `GET /api/dashboard/stats`，风格与生态主页一致（深绿夜色 + 玻璃卡片）。第一版基础统计：各生态板块动植物数量（`zone_species` 登记数）、绿植 / 动物档案数、养护员人数（在岗）、近 7 天每天的浇水 / 施肥 / 喂食次数、当前待养护数量与清单、各区域负责人与待办。后续在接口和脚本上继续加图即可。

### 接口

| 方法 | 路径 | 权限 | 说明 |
| --- | --- | --- | --- |
| GET | `/api/face/status` | 公开 | `{enrolled}` 系统里是否已有人脸 |
| POST | `/api/face/identify` | 公开（限流） | `{embedding, real, live}` → 200 建立会话 + `redirect`；401 未识别；422 活体不通过；409 还没有人脸 |
| POST | `/api/face/guest` | 公开 | 以访客身份进入 |
| GET | `/api/face/profiles[?account_id=]` | 本人；管理员可看养护员 | 录入记录（不含特征向量） |
| POST | `/api/face/enroll` | 管理员 / 养护员本人；管理员可带 `account_id` 给养护员录 | `{embeddings:[3–5 帧], real, live, thumbnail?}` |
| DELETE | `/api/face/profiles/{id}` | 本人；管理员可删养护员的 | 删除一条 |
| GET | `/api/face/accounts` | 管理员 | 养护员账号列表与已录入条数 |
| GET | `/api/me` | 公开 | 当前身份与能力（`can_edit_species`、`can_care`、`can_dashboard`、`can_enroll_face`） |
| GET | `/api/care/targets` | 养护人员 | 个体与浇水 / 施肥 / 喂食状态、负责区域、待办数 |
| POST | `/api/care/logs` | 养护人员 | `{target_type, target_id, care_type, note?}` 执行一次养护 |
| GET | `/api/care/logs` | 养护人员 | 最近记录 |
| GET | `/api/dashboard/stats` | 管理员 | 大屏统计 |

未登录 401、访客 / 角色不符 403、参数错误 400、数据库不可用 **503**（只返回通用提示，JDBC 原始错误只写服务器日志）。

### 数据库

- `database/003_face_login_care.sql`：`face_profile`（account_id、role_code、model、dim、embedding MEDIUMBLOB、frames、thumbnail、created_by、created_at；一人可多条）、`care_log`、`care_period`（含默认周期），`admin_user.maintainer_id` 列，`admin_role` 补 `MAINTAINER`，为 `zones.json` 的生态板块补建 `plant_area` 区域档案。与 `DB/Jdbc.java`、`DB/JdbcAccountStore.java` 一致：接口首次访问时也会 `CREATE TABLE IF NOT EXISTS` / 补列，可重复执行。
- `database/004_demo_face_login_seed.sql`（可选，仅演示）：两个养护员账号，张师傅负责翠湖水景、图书馆·荷花池，李工负责中心草坪。

### 部署注意：摄像头需要 HTTPS 或 localhost

浏览器只在**安全上下文**（`https://`，或 `http://localhost` / `127.0.0.1`）里允许 `getUserMedia`。在本机用 `http://localhost:8080/...` 调试可以直接用；通过局域网 IP 或域名访问（如 `http://192.168.x.x:8080`）时摄像头会被浏览器禁止，页面会提示原因。正式部署任选其一：

- Tomcat 直接开 HTTPS：在 `conf/server.xml` 配置 8443 的 `<Connector ... SSLEnabled="true">` 并指定证书（校园内网可用学校 CA 或自签证书，自签需在各终端信任）；
- 或在 Tomcat 前放 Nginx 反向代理做 TLS 终止（`listen 443 ssl` → `proxy_pass http://127.0.0.1:8080`）。

模型约 12MB，首次打开人脸窗口时下载，之后走浏览器缓存（30 天）；全部从本站加载，国内网络无需访问境外 CDN。

### 测试

见 `tests/face-login/README.md`：`api_test.py`（后端接口与权限，跑 MariaDB + Tomcat）、`e2e_face.py`（Playwright + Chromium `--use-fake-device-for-media-stream --use-file-for-fake-video-capture` 喂人脸测试视频）；单元测试 `./mvnw -Dtest='FaceMatcherTest,CareScheduleTest,RolesTest,ZoneSpeciesServiceTest' test`。测试人脸图来自 human 仓库自带样例（`tests/face-login/samples/SOURCE.md`）。

### 已知限制

- 活体 / 防翻拍为基础防护（见上），不能替代专业活体检测；识别阈值是用少量样例估计的，正式使用前建议用本校真实人员、真实摄像头再标定一次 `face.threshold`。
- 原有 `DBTools.authenticateAdmin` 对任何账号都同时接受 `123456` 与演示默认密码（原有逻辑，本次未改）；而人脸录入的身份证明依赖账号密码登录，**正式上线前应去掉这条兜底并修改所有演示账号密码**，否则知道用户名的人就能登录并给该账号录入自己的脸。
- 生态板块里未改动过的“场景原有装饰个体”不在数据库中，工作台和大屏只统计 `zone_species` 里登记的个体，以及 `plant` / `animal` 档案。
- 全新库里若先由 DBTools 建表、后执行 001 脚本，表的排序规则会不一致，原有的 `countUnassignedPlants` 查询可能报 “Illegal mix of collations”（与本功能无关；`tests/face-login/setup_test_db.py` 里有统一排序规则的做法）；本次新增的跨表查询已显式写 `COLLATE`。
