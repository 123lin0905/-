# 运动场周边板块（zone/cdorm-sports · sports_ring）合并说明

本分支新增运动场周边细节场景 `campus3d/sports/sports.html`（`sports-scene.js` + 共用外壳 `campus3d/zone-kit/`），按学校官网绵阳校区导览图（`ref/official/sports/`）与平面图（0.4 米/像素）重建。坐标与全景一致：`x = (px − 1024) × 0.4`，`z = (py − 999) × 0.4`（米），所以 `zone_species.pos_x / pos_z` 直接是全景世界坐标。

**本分支没有改 `zones.json` 和 `campus_layout.json`**（多个板块分支同时在改这两个文件，留到合并时一次性处理，避免冲突）。场景本身不依赖这两处改动：`zones.json` 里找不到细节配置时用 `sports-scene.js` 内置的名称、简介和物种目录。合并到 main 时按下面修改。

## 1. `zones.json` → `sports_ring`（必须改，否则主页进不去、不能增删）

```json
{
  "id": "sports_ring",
  "detail_scene": "sports/sports.html",
  "editable": true,
  "catalog": ["camphor", "ginkgo", "metasequoia", "osmanthus", "cherry", "azalea", "hedge", "cat", "magpie", "sparrow", "butterfly"],
  "intro": "二环路北段与环校路之间的运动区：400 米标准田径场（足球场草坪）、高台上的 9 片篮球场、4 片网球场与 3 片排球场、L 形室外游泳池与白色体育训练馆，外围是行道树与林带。",
  "highlights": ["400 米跑道", "9 片篮球场", "L 形游泳池", "行道香樟", "林带"]
}
```

- `detail_scene`：主页 `ecohome.js` 有这个字段时才显示“进入板块细节 3D 场景 →”，并追加 `?zone=sports_ring&back=…`。
- `editable: true`：后端 `ZoneSpeciesService` 按这个字段放行写操作（否则 403 `zone_readonly`），场景里“✏️ 管理动植物”按钮也只在可编辑且登录为管理员 / 养护员时显示。
- `catalog`：与 `sports-scene.js` 的 `species.catalog` 一致。`cherry`、`hedge` 只在目录里，场景里默认没有个体。
- `intro` 里原来写的是“足球场为人工草坪”。导览图上是带割草条纹的草坪，看不出是真草还是人工草，场景里写的是“天然草”。**这一点请用实际情况确认**，再统一两边的措辞。
- `polygon`、`center`、`camera_distance` 不用改：新的网球场 / 排球场仍在原范围内（西南角最远到 (182, 415) 和 (226, 564)）。

## 2. `campus_layout.json` → `sports`（建议改，全景与细节场景一致）

全景 `campus-scene.js` 读这份数据。不改的话，全景里仍是两个游泳池，网球场、排球场也各是一整块。

| 条目 | 现状 | 改为（平面图像素，按细节场景实际几何换算） |
| --- | --- | --- |
| `pool1` + `pool2` | 两个矩形游泳池 | **合并成一个 `pool`**（L 形：50 × 21 米标准池 + 西南角 9 × 15 米浅水池）：`[[404,390],[527,367],[537,418],[436,437],[443,474],[421,478]]`。删除 `pool2` |
| （新增）池岸铺装 | — | 可选，进 `plazas`：`{"id":"pool_deck","poly":[[384,363],[541,333],[559,429],[451,450],[458,484],[408,493]]}` |
| `tennis` | 一块 `[[188,423],[334,395],[350,465],[204,491]]` | 4 片（2×2）围网场地外框：`[[182,415],[349,383],[365,466],[198,498]]`。全景如果要画单片，按 34 × 17 米一格切成 2×2 |
| `volley` | 一块 `[[204,499],[350,472],[366,538],[219,569]]` | 3 片场地外框：`[[214,503],[352,477],[363,538],[226,564]]` |
| `basket` | 一块 | 多边形不变；可加 `"courts": 9, "platform_h": 3`，供全景画 3×3 球场和毛石挡土墙 |
| `track` | `poly` + `field` | 不变（长边约 181 米，与 400 米跑道相符）。导览图上跑道东端比我们的多边形略短，差几米，暂不改 |
| `buildings[gongcheng]` | 名称“工程楼”，`style: brick`，`h: 16` | 名称改为“建筑与工程学院”，导览图上是灰色楼，建议 `style` 用灰色 / 白色系。细节场景把它拆成北楼 15.5 米和南侧 2 层坡顶附楼 8 米（`[[752,383],[785,376],[799,447],[768,455]]`） |
| `buildings[tiyu_side]` | 白色平顶盒子 8 米 | 导览图上是灰瓦四坡顶的敞廊（看台 / 体育用房），细节场景高 4.6 米，屋顶为四坡顶；全景可加 `roof: "hip"` |
| `buildings[tiyu]` | 矩形 | 细节场景南立面做成弧形外凸（约 14 像素），北墙沿 `[[392,540],[538,505]]`。全景可以不改 |

`js/campus-info.js` 第 60–61 行按 id 给 `pool1`（北池）/ `pool2`（南池）写了说明。合并时改成一条：`pool: { desc: "体育训练馆北侧的 L 形室外游泳池（标准池 + 西南角浅水池），北侧绿色看台台阶，西侧灰瓦敞廊。" }`。除此之外只有 `campus_layout.json` 本身用到这两个 id。

## 3. 数据库 / 演示存储

- `zone_species` 里还没有 `sports_ring` 的记录，没有旧数据需要迁移。
- 原有个体的 `seed_ref` 按物种编号（`camphor#0`、`ginkgo#2`、`metasequoia#1`…），顺序由 `sports-scene.js` 的 `species.seeds` 决定。**上线后不要调整 seeds 的顺序**，否则已保存的移植 / 移除记录会作用到别的个体上。
- 无后端时，编辑器的演示模式存在 `localStorage["sports_ring-species-demo:sports_ring"]`。
- 如需 `plant_area` 关联，建 `area_code = 'MY-ECO-SPORT'` 的记录（`zones.json` 里已有）。

## 4. 本分支对共用外壳 `zone-kit/` 的修复（dorm-c 分支合并时注意）

均为 bug 修复，没有改接口：

1. `zone-build.js` `hedge()`：`roundedBox()` 焊接后的几何没有 `uv`，原代码读 `uv.count` 直接抛错，整个场景加载失败。现在补建 `uv` 属性。
2. `zone-build.js` `polyL()`：`ShapeGeometry` 是索引几何，`fixWinding()` 却按“三个顶点一组”交换。需要翻转时面片会错乱，导致游泳池水面、足球场草坪、网球 / 排球场面层不显示。现在先 `toNonIndexed()` 再修正绕序。
3. `zone-build.js` 铁丝网材质：只用 `alphaTest 0.35` 时，远处 mipmap 平均后的 alpha 仍高于阈值，围网在远景里变成一圈不透明的黑墙。现在改为半透明混合（`transparent`、`opacity 0.8`、`depthWrite false`、`alphaTest 0.04`），网线颜色调浅、线宽 3→2。

dorm-c 分支如果也改了 `zone-kit/`，合并时三处都要保留。修复 2 会让 dorm-c 场景里原来因此缺失的地面面层重新出现，合并后请看一眼 dorm-c 的效果。
