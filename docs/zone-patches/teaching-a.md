# 教学楼绿化带板块（zone/teaching-a）合并说明

本分支新增教学楼绿化带（光华广场）细节场景 `campus3d/teaching/teaching.html`（场景脚本 `teaching/teaching-scene.js`，共用工具包 `campus3d/zonekit/`）。
为避免和其他板块分支在共享数据文件上冲突，**本分支没有改 `data/zones.json` 和 `data/campus_layout.json`**，合并到 main 时按下面手工改。

坐标约定：平面图像素 (px, py)，1 px = 0.4 米；场景米 `x = (px − 1024) × 0.4`，`z = (py − 999) × 0.4`（`zonekit/zk-world.js` 的 `W()`）。
编辑器保存到 `zone_species` 的 `pos_x / pos_z` 都按这个坐标。

## 1. `campus3d/data/zones.json`：`teaching_green` 板块

```jsonc
{
  "id": "teaching_green",
  // …… name / icon / color / center / polygon / camera_distance / area_code 不变 ……
  "detail_scene": "teaching/teaching.html",          // 原为 null：生态主页“进入板块细节”跳到本场景
  "editable": true,                                   // 原为 false：开放动植物增删（接口 /api/zones/teaching_green/species 才允许写）
  "catalog": ["ginkgo", "camphor", "cherry", "osmanthus", "jacaranda", "privet", "shrub_ball", "hedge", "flowerbed",
              "cat", "magpie", "sparrow", "butterfly"],   // 原为 null；与 teaching-scene.js 的 catalog 一致
  "intro": "光华广场是从校门通往图书馆的主轴：两侧各一排银杏，北端图书馆一侧的平台上立着“聚·散”不锈钢雕塑，旁边是草坪花池和樱花；广场两侧是红砖白框的教学楼，校门内东侧是浅蓝穹顶的学术报告厅。",
  "highlights": ["银杏大道", "聚·散雕塑", "蓝花楹", "行道香樟", "绿篱"]
}
```

说明：
- 原 `intro` 写的是“广场南端是不锈钢校园雕塑”，与官方地图不符（雕塑在北端、图书馆一侧），需要一起改。
- `editable` 不改为 true 时，细节场景照常能看，但“✏️ 管理动植物”按钮隐藏（联调可加 `?edit=1`），且接口写操作返回 403 `zone_readonly`。
- `zone_species` 表不需要迁移：`zone_id = 'teaching_green'`、`area_code = 'MY-ECO-TEACH'` 直接可用（表上没有板块外键 / 枚举）。

## 2. `campus3d/data/campus_layout.json`：雕塑位置

```jsonc
"sculpture": {
  "id": "sculpture",
  "name": "聚·散雕塑",                      // 原为“不锈钢校园雕塑”（可选：官方地图标注名）
  "pos": [1286, 1250],                      // 原为 [1494, 1609]（校门 / 报告厅旁）→ 光华广场北端、图书馆一侧
  "note": "银色不锈钢旋涡造型，立于红色半球台座+黑色石基上；位于光华广场北端平台，前方草坪花池，两侧樱花"
}
```

其余条目与官方地图一致，不用改：`plazas.guanghua` 多边形、`gates`、`buildings.gate_w / gate_e`（两座门卫室，雨棚和中间的圆形种植岛只在细节场景里建）、`buildings.baogaoting`（圆心 (1588,1567)，r = 40，style = dome）。

## 3. 建议一并修改（不在两个 JSON 里，属于全景页）

- `js/campus-info.js` 第 65 行雕塑简介写的是“光华广场南端”，应改为“光华广场北端、图书馆一侧”。
- `js/campus-scene.js` 第 455–457 行报告厅穹顶是灰色金属半球（scale.y = 0.55）；官方地图是**浅蓝色扁穹顶**，可把颜色改为约 `0x8fc3e6`、`scale.y` 降到约 0.3，和细节场景一致。
- 全景页的雕塑读 `L.sculpture.pos`，第 2 节改完后会自动移到广场北端，不用改代码。

## 4. 共享工具包 `campus3d/zonekit/` 的改动

`zonekit/` 也被 A 区宿舍分支（`zone/dorm-a`）使用。本分支改了三处，合并时请保留：

- `zk-world.js`：地面分类贴图加 `t.flipY = false`。这与 `zone/dorm-a` 的提交 aa19983 是同一行修改，合并时取任一边即可。不加这一行时，区域内的道路、广场和球场会南北镜像，和建筑对不上。
- `zk-flora.js`：给银杏加了 `autumnGold`。秋季时银杏整树变成金黄色，不再走共享秋色调色板里的红橙色（共享调色板仍用于樱花、蓝花楹等），使用独立的着色器缓存键 `zkleafg` / `zkimpg`。
- `zonekit.css`：加了 `body.zk [hidden] { display: none !important; }`。`.zk-label` 用了 `all: unset`，会让 `hidden` 属性失效：镜头背后或太远的建筑标签不隐藏，还会停在上一个视角的位置。

## 5. 已知差距（未处理）

- 俯视（el = 89°）时，远处的树使用绕竖轴旋转的公告板，从正上方看会变成细条。斜俯视和官方视角没有这个问题。要修复，需要为每个树种加一张顶视替身贴图（`zk-flora.js`）。
- 本地静态服务器下，实时天气接口 `/api/weather` 返回 404，Open-Meteo 直连被 CORS 拦截，场景会自动退回虚拟天气。部署到 Tomcat 后 `/api/weather` 可用，不属于场景问题。
