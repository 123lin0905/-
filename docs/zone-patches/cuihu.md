# 翠湖板块（zone/cuihu）合并说明

本分支把池塘细节场景 `campus3d/pond/pond.html` 从 7 × 12 米的日式锦鲤庭园改成按官方鸟瞰图重建的真实尺寸翠湖（0.4 米/平面图像素，场景原点 = 平面图 (366, 1515)，即南岸种植床北面的湖面）。合并到 main 时需要处理下面几件事。

## 1. 数据库 `zone_species` 里的旧记录（必须处理）

`zone_species` 中 `zone_id = 'cuihu_water'` 的记录是在旧庭园坐标系里保存的（`pos_x / pos_z` 大约在 ±9 米内，原点是旧锦鲤池中心），在新场景里含义已经变了：

| 记录 | 问题 | 建议 |
| --- | --- | --- |
| `seed_ref` = `willow#N` | 原有个体编号按场景里垂柳的生成顺序编号；新场景的垂柳数量、位置全不同，`willow#2` 已经是另一棵树。旧记录里的 `removed` / 移植坐标会作用到错误的树上。 | 删除或标记失效 |
| `seed_ref` = `lotus#N` | 翠湖没有荷花，这些原有个体已不存在，记录无法对应。 | 删除 |
| `seed_ref` = `waterlily#N` | 16 片精细睡莲叶仍在原点附近，但原点已从旧池中心移到南岸种植床北面，编号顺序也可能变化。 | 删除（让场景回到默认状态） |
| `seed_ref` = `koi#N` | 锦鲤槽位编号不变，但旧坐标在新湖里落点不同；无害但位置不对。 | 删除或保留均可 |
| `seed_ref IS NULL`（编辑器新增的个体） | 旧坐标在新场景里大多落在南岸种植床、湖面或岸边，乔木可能落进水里；`species_key = 'lotus'` 已从翠湖可选目录中去掉。 | 删除，或按需人工重新种植 |

建议在合并后执行（先备份；**不要改 `database-backups/`**）：

```sql
-- 翠湖场景已按真实尺寸重建，旧庭园坐标的个体记录全部作废
UPDATE zone_species SET status = 'removed', updated_by = 'zone_cuihu_migration'
 WHERE zone_id = 'cuihu_water' AND status = 'active';
-- 或者直接删除（care_log 里 target_type='zone_species' 的养护记录会指向不存在的 id，看是否需要一并清理）
-- DELETE FROM zone_species WHERE zone_id = 'cuihu_water';
```

`care_log` 中 `target_type = 'zone_species'` 且 `target_id` 指向上述记录的养护日志会变成“孤儿”，数据大屏 / 养护工作台统计时需要容忍或一并清理。

浏览器端的演示模式（无后端时）把记录存在 `localStorage["pond-species-demo:cuihu_water"]`，同样是旧坐标；演示前清一下浏览器存储即可。

## 2. 新的坐标与尺寸约定

- 场景米与平面图像素换算：`x = (px − 366) × 0.4`，`z = (py − 1515) × 0.4`（见 `tools/pond_cuihu.js`）。新记录的 `pos_x / pos_z` 都按这个坐标。
- 编辑器新增乔木的默认高度已改为真实比例：垂柳 8–9 米、香樟 9–11 米、桂花 3–4 米（`tools/pond_edit_hooks.js`）；放置规则同步改为离水 1.5 / 2 / 1 米以上（`pond/pond-species.js`）。
- `zones.json` 里 `cuihu_water.catalog` 去掉了 `lotus`；`care_period` 不需要改。

## 3. 生成文件：合并后重新生成，不要手工解冲突

`pond/pond.html`、`pond/pond-main.js`、`js/pond-style-core.js` 由 `tools/build_pond.py` 生成，且 `build_pond.py` 在构建时把 `campus_layout.json` 中的翠湖湖岸、湖心岛、`cuihu_plaza`、`cuihu_promenade` 和建筑 C1–C10、jiaoshi、juyou、B5、B6、jiaoxue3 的轮廓嵌入 `pond-main.js`。

- 这几个生成文件若有冲突，取任一边后在仓库根目录运行 `python3 tools/build_pond.py`（需要 `tools/koi-pond-garden/koi-pond.html`，见 README）重新生成。
- 其它板块分支（尤其是 C 区宿舍、教学楼）如果修改了上述建筑或 `campus_layout.json` 的翠湖条目，合并后也必须重新生成，否则翠湖场景里的建筑仍是旧轮廓。
- `build_pond.py` 断言这些建筑 id 都存在；若别的分支改了 id，构建会失败，需要同步修改 `_B_IDS`。

## 4. `campus_layout.json` 的翠湖条目

`water[id=cuihu]` 改为 43 点湖岸（南端两个湖湾）、湖心岛中心 (384, 1442)、`r` 30（细节场景用椭圆 `rx` 24 × `ry` 34、旋转 −18°）；新增 `plazas[id=cuihu_promenade]`。校园全景（`campus-scene.js`）读同一份数据，所以全景里的翠湖形状也会变；全景仍用圆形画湖心岛，与细节场景略有出入。

## 5. 其它

- `pond.html?zone=library_lotus` 现在也显示翠湖（`pond-campus.js` 只保留 `cuihu_water` 变体）。如果 main 上“图书馆·荷花池”板块仍指向 `pond/pond.html`，需要等它自己的细节场景合并后再改 `zones.json` 的 `detail_scene`，否则点进去看到的是翠湖。
- `pond_species.json` 的 `library_lotus` 清单未改动。
