# 板块数据补丁：图书馆、中心草坪（zone/library-lawn）

本分支新增了两个按官方校园地图还原的板块细节场景：

- `campus3d/library/library.html`：图书馆·馆前草坡
- `campus3d/lawn2/lawn.html`：中心草坪（新版，真实尺度）

两者共用 `campus3d/zone/` 引擎，动植物增删通过 `zone/zone-species.js` 接入 `js/species-editor.js`。

下面这些改动**还没有写进数据文件**，需要单独合并，因为它们会影响主页、池塘场景和数据库里已有的记录。

在 `zones.json` 合并之前，两个新场景都使用自己布局文件里的 `catalog`，不受 zones.json 旧配置影响。规则是：只有当 zones.json 里该板块的 `detail_scene` 等于场景的 `LAY.scene` 时，才改用 zones.json 的 `catalog`。所以 detail_scene 一旦改过来，就必须同时更新 catalog。

---

## 1. `campus3d/data/zones.json`

### 1.1 `library_lotus`：改名、改简介、改指向

官方地图上图书馆北侧**没有荷花池**，那里是一片草坡，坡上有种植土丘和新月形花境。校园里唯一的睡莲池在中心草坪的西南角，见 `ref/official/library_lotus/NOTES.md`。

`id` 保持 `library_lotus` 不变，因为 `area_code`、数据库的 `zone_id` 和主页链接都引用这个 id。

```json
{
  "id": "library_lotus",
  "name": "图书馆·馆前草坡",
  "icon": "🏛️",
  "detail_scene": "library/library.html",
  "editable": true,
  "catalog": ["camphor", "ginkgo", "osmanthus", "cherry", "crapemyrtle", "flowerbed", "shrub_ball", "cat", "butterfly", "magpie", "sparrow"],
  "intro": "校园中轴北端的图书馆：两层主馆配红砖壁柱与通长玻璃幕墙，东南角是三层入口楼和旗杆前庭。馆北是开阔的缓坡草地，坡上一处种植土丘围着紫、黄双色新月花境，石材园路呈 S 形弯过坡顶；馆西是逐级抬高的台地花田、蓝顶小亭与一列银杏。",
  "highlights": ["图书馆", "草坡", "土丘花境", "台地花田", "银杏", "香樟"]
}
```

- `center`、`polygon`、`camera_distance`、`area_code`、`color` 保持原值。
- 图标从 🪷 改为 🏛️ 是可选项。
- 主页上板块名称会显示为"图书馆·馆前草坡"。

### 1.2 `central_lawn`：指向新版场景，扩充目录

```json
{
  "id": "central_lawn",
  "detail_scene": "lawn2/lawn.html",
  "catalog": ["ginkgo", "osmanthus", "cherry", "camphor", "flowerbed", "shrub_ball", "cat", "butterfly", "magpie", "sparrow", "egret",
              "willow", "waterlily", "koi", "dragonfly",
              "crapemyrtle", "reed"]
}
```

- **必须新增**：`willow`、`waterlily`、`koi`、`dragonfly`（西南角池塘的垂柳、睡莲、锦鲤、蜻蜓）。
- **建议同时新增**：`crapemyrtle`（池边 4 株紫薇是场景原有个体）、`reed`（池边芦苇）。
  - 如果不加，紫薇原有个体仍会显示，并且可以选中、移植，但"中心草坪生态"清单里不会列出，编辑器目录里也不能新增。
- 建议把 `intro` 和 `highlights` 补上池塘：

```json
"intro": "A 区宿舍与第四教学楼之间斜向展开的开阔大草坪：西北缘一条蜿蜒的紫色花带衬着绿篱，林荫小道在树下穿行；西南角是垂柳、紫薇环绕的小池塘，水面浮着睡莲，锦鲤在叶间游动。",
"highlights": ["大草坪", "紫色花带", "林荫小道", "垂柳池塘", "睡莲", "锦鲤"]
```

- 旧版平面图插画风场景 `lawn/lawn.html` 保留，没有删除，需要时可以切回去。

### 1.3 池塘场景

`pond/pond-campus.js` 里的 `library_lotus` 变体（lotusExtra 26）指向不再存在的荷花池。

`detail_scene` 改过去以后，主页不会再用 `?zone=library_lotus` 打开 `pond/pond.html`。这个变体可以留着不用，也可以在后续清理时删掉。

---

## 2. `campus3d/data/campus_layout.json`

### 2.1 删除 `water[id=hehuachi]`

官方地图上这个位置是草坡，不是水面：

```json
{"id": "hehuachi", "name": "荷花池", "poly": [[1228, 778], [1290, 742], [1348, 752], [1343, 815], [1306, 878], [1254, 867], [1223, 825]]}
```

### 2.2 新增中心草坪西南角小池塘

多边形与 `lawn2/lawn-layout.js` 的 `POND` 完全相同：

```json
{"id": "lawn_pond", "name": "中心草坪小池塘",
 "poly": [[688, 1180], [700, 1168], [722, 1168], [742, 1178], [765, 1190], [783, 1204], [795, 1222], [800, 1245], [806, 1268], [812, 1288],
          [800, 1294], [788, 1278], [778, 1255], [765, 1240], [745, 1236], [722, 1238], [703, 1232], [692, 1215]]}
```

### 2.3 同步修改引用 `hehuachi` 的代码

- `js/eco-life.js`，约第 351 行：全景里的荷叶和荷花按 `w.id === "hehuachi"` 撒在池里。删掉 hehuachi 后这段会直接跳过，不会报错，但全景就没有荷叶了。
  - 建议改成 `"lawn_pond"`，改成睡莲。
  - 新池塘约 50 × 50 米，比原来小。数量建议从 46 / 12 减到约 14 / 5，`polyDist < 5` 的离岸距离改成 3。
- `js/campus-info.js`，第 53 行：把 `hehuachi: { desc: … }` 改成
  `lawn_pond: { desc: "中心草坪西南角的小池塘，垂柳与紫薇环绕，水面浮着睡莲，锦鲤在叶间游动。" }`。
- 全景主页的板块高亮和镜头只用 `zones.json` 的 `polygon` / `center`，不受影响。
- 小池塘在 `central_lawn` 的 `polygon` 边缘附近，靠近顶点 (758,1162)。可以考虑把这个多边形向西南扩一点，把池塘包进去，例如在 (758,1162) 和 (660,1092) 之间插入 (812,1300)、(690,1250)、(672,1170)。这一步是可选的。

---

## 3. 数据库 `zone_species`：旧坐标记录迁移

接口会把记录按 `zone_id` 原样返回，编辑器再把 `x`、`z` 当作当前场景的世界坐标。场景换了以后，旧记录的坐标系和原有个体编号（`seed_ref`）都对不上：

| 板块 | 旧场景 | 旧坐标系 | 新坐标系 |
|---|---|---|---|
| `library_lotus` | `pond/pond.html`（池塘变体） | 池塘场景局部坐标，与校园平面图没有固定换算 | 世界米，原点 = 平面图 (1260, 850)，1 米 = 2.5 像素 |
| `central_lawn` | `lawn/lawn.html`（微缩模型） | 1 单位 = 10 像素 = 4 米，原点 = 平面图 (932.5, 1035) | 世界米，原点 = 平面图 (870, 1090) |

新场景的处理方式：

- `species_key` 不在目录里的记录会被忽略，例如图书馆的 `lotus`、`iris`、`frog`、`turtle`。
- `seed_ref` 在新场景里找不到的记录也会被忽略。
- 但 `seed_ref` **同名、指向的却是另一株**的记录会被套到新个体上。例如旧草坪的 `ginkgo#0` 在 (722,938)，新场景的 `ginkgo#0` 是池边黄叶树。
- 新增个体会被放到错误的位置。

所以上线前需要先执行迁移，**之后**再把 `detail_scene` 切过去。建议另写 `database/006_zone_species_library_lawn.sql`。执行前先备份 `zone_species`，备份写到 DBA 自己的位置，不要写进仓库的 `database-backups/`。

```sql
USE plant;

-- 3.1 图书馆：旧记录全部来自池塘场景（荷花、鸢尾、青蛙…），坐标无法换算，软删除
UPDATE zone_species SET status = 'removed', updated_by = 'migration-006'
 WHERE zone_id = 'library_lotus' AND status = 'active';
-- 原有个体的 seed_ref（willow#0 等）在新场景含义不同，清空以免与新场景的 seed_ref 冲突（uk_zone_species_seed）
UPDATE zone_species SET seed_ref = NULL WHERE zone_id = 'library_lotus' AND seed_ref IS NOT NULL;

-- 3.2 中心草坪：旧原有个体（seed_ref）在新场景对应不同的树，作废
UPDATE zone_species SET status = 'removed', seed_ref = NULL, updated_by = 'migration-006'
 WHERE zone_id = 'central_lawn' AND seed_ref IS NOT NULL;
-- 新增个体：旧微缩坐标 → 新世界米
--   平面图 px = x_old * 10 + 932.5，py = z_old * 10 + 1035
--   x_new = (px - 870) * 0.4 = x_old * 4 + 25
--   z_new = (py - 1090) * 0.4 = z_old * 4 - 22
UPDATE zone_species
   SET pos_x = pos_x * 4 + 25, pos_z = pos_z * 4 - 22, updated_by = 'migration-006'
 WHERE zone_id = 'central_lawn' AND seed_ref IS NULL AND status = 'active' AND updated_by <> 'migration-006';
-- 迁移后落在新场景范围外（平面图 x 600–1130、y 880–1320 → x -108…104 米、z -84…92 米）的记录软删除
UPDATE zone_species SET status = 'removed'
 WHERE zone_id = 'central_lawn' AND status = 'active' AND (pos_x < -108 OR pos_x > 104 OR pos_z < -84 OR pos_z > 92);
```

- 旧草坪场景的 `scale` 是相对微缩模型的，新场景按真实尺度会自动乘原型尺寸，所以可以保留原值。
- 迁移后的新增个体可能落在道路或水面上，因为两版场景的道路宽度不同。编辑器加载时不会再检查放置规则。
  - 建议迁移后由管理员在场景里看一遍，个别个体手动移植。
  - 也可以加一条：在新场景用 `ZoneSpecies.canPlace` 批量检查，把不合格的记录列给管理员。
- 迁移脚本只能执行一次。上面用 `updated_by <> 'migration-006'` 防止 3.2 的坐标换算重复执行。

---

## 4. 验证

- 用 headless（Playwright + SwiftShader）跑 `library/library.html?test=1` 和 `lawn2/lawn.html?test=1`，加载完成后 `window.__zoneReady === true`，没有脚本错误。
  - 静态服务器下没有后端，所以 `/api/weather`、`/api/zones/...` 返回 404，Open-Meteo 被 CORS 拦截。编辑器会切到本地演示模式，天气改用虚拟天气，这是预期行为。
- 截图：`ref/result/library/`、`ref/result/lawn/`。
