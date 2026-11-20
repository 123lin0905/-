# A 区宿舍生活区板块（zone/dorm-a）合并说明

本分支新增 A 区宿舍生活区的板块细节 3D 场景 `campus3d/dorm-a/dorm-a.html`（场景脚本 `dorm-a-scene.js`），复用板块细节场景工具包 `campus3d/zonekit/`（与教学楼绿化带 `teaching/` 同一套）。
**本分支没有改 `campus3d/data/zones.json`**，避免和其它板块分支冲突；合并时按下面第 1 节手工改。

## 1. `zones.json` 中 `dorm_life` 条目的改动

```diff
   "id": "dorm_life",
   ...
-  "detail_scene": null,
-  "editable": false,
-  "catalog": null,
+  "detail_scene": "dorm-a/dorm-a.html",
+  "editable": true,
+  "catalog": ["ginkgo", "camphor", "cherry", "osmanthus", "privet", "shrub_ball", "hedge", "flowerbed", "cat", "magpie", "sparrow", "butterfly"],
-  "intro": "A 区四栋学生公寓与一食堂、超市、商业街组成的生活区，楼间绿地以桂花、女贞和草坪为主，是学生日常活动最密集的区域。",
-  "highlights": ["桂花", "女贞", "楼间绿地"]
+  "intro": "四栋红砖板楼自西向东错开排列，楼南端立着乒乓球馆、健美操馆和武术 / 跆拳道馆三座圆形场馆；西边的学生食堂是椭圆形就餐大厅，屋顶一排玻璃天窗，底层是超市、书店、洗衣店和奶茶店。楼间草坪散植香樟、女贞和桂花。",
+  "highlights": ["桂花", "女贞", "银杏", "楼间绿地", "圆形场馆"]
```

- `detail_scene` 是相对 `campus3d/` 的路径；生态主页打开时会追加 `?zone=dorm_life&back=<主页路径>`。
- `catalog` 与场景脚本里 `ZK.start({ catalog })` 一致；`zones.json` 有 `catalog` 时以它为准（`zk-app.js` 先读 `zones.json`）。
- `intro` / `highlights` 可选：不改也行，场景脚本里自带一份（`cfg.intro` 优先于 `zones.json`）。
- 如果暂时不想开放编辑，`editable` 保持 `false`，仍可用 `?edit=1` 联调。
- `center`、`polygon`、`camera_distance`、`area_code`（`MY-ECO-DORM-A`）不变。

## 2. 物种目录

- 全部 12 个 key 都在工具包 `zk-species.js` 的共用目录里，**不需要新增物种**。
- 与教学楼绿化带相比去掉了 `jacaranda`（官方图上 A 区没有蓝花楹），加了 `privet`（女贞）作为楼间绿地主力树种。
- 数据库：`database/006_zone_dorm_a.sql` 补 `care_period` 中 `privet`、`hedge` 的养护周期（003 里没有，原来退回 `*plant` 默认值），并再次 `INSERT IGNORE` 区域档案 `MY-ECO-DORM-A`。不需要预置 `zone_species`：原有个体由场景生成，`seed_ref` 形如 `privet#3`。
- 浏览器演示模式（`speciesApi=none` 或无后端）把增删记录存在 `localStorage["dorm-a-species-demo:dorm_life"]`。

## 3. 场景与平面图的差异（按官方图，不改 `campus_layout.json`）

- A1–A4 用平面图轮廓，但**不用 `roundEnd` 圆头**：官方图上楼端是方的，南端是凸出的楼梯间和一层灰顶附属用房。
- 三座独立圆形场馆（半径 9.6 米、高 5.2 米）放在 A4 / A3 / A2 南端西侧：乒乓球馆 (525, 902)、健美操馆 (652, 878)、武术 / 跆拳道馆 (770, 849)（平面图像素）。A1 南端没有场馆。
- 学生食堂：平面图 `shitang1` 多边形换成椭圆就餐大厅（中心 (312, 838)，半轴 25 × 18.5 米，旋转 18°，高 8.4 米，4 个金字塔天窗）+ 北侧 3 层楼 + 西侧就餐平台；`chaoshi` 换成东侧弧形两层商业翼（超市 / 书店 / 洗衣），`yiwushi` + `shangye` 合并为南侧一排底层商铺与长廊架；`cainiao`（菜鸟驿站）在官方图上看不到，没有建。
- 宿舍 A 区支路（543,674)→(637,914) 会穿过健美操馆，场景改成沿 A4 东侧的消防通道；各楼东侧另有一条通道北接环校路。
- 校园全景（`campus-scene.js`）仍读 `campus_layout.json`，所以全景里 A 区还是圆头板楼、没有圆形场馆；若要统一，需要另行修改 `campus_layout.json`（会影响其它板块，本分支未做）。

## 4. 工具包改动（一处小修）

- `zonekit/zk-world.js` `finishGround()`：地面分类贴图（三张 CanvasTexture）加了 `t.flipY = false`。
  原来 CanvasTexture 默认 `flipY = true`，而着色器按 `suv = (世界 xz − 区域原点) / 区域尺寸` 采样，结果地面铺装（道路、广场、球场、红砖）在区域内**南北镜像**，
  与建筑、树木（按 `classAt()` 读的是未翻转的画布）对不上。教学楼绿化带的光华广场差不多关于区域中线对称，所以之前不明显；
  本场景区域不对称，一眼就能看出来（球场红色落在围网南边 30 米）。
- 这一修复对所有用 `zonekit` 的场景都生效，合并时请与教学楼分支的 `zonekit/` 一并处理（教学楼场景的地面会变成正确朝向，广场、道路位置可能需要复看）。
