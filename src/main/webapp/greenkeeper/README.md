# GreenKeeper.js

**园区绿植智能管理插件** —— 零依赖、单文件、UMD，可直接 `<script>` 引入，也可在 Vue / React 项目中 `new`。

在园区平面图上点选落点新增绿植并展示照片，按养护周期自动计算施肥 / 放药 / 修剪的待办状态，沉淀完整维护台账。

---

## 快速开始

```html
<link rel="stylesheet" href="greenkeeper.css">
<div id="app" style="height:720px"></div>

<script src="greenkeeper.js"></script>
<script>
  var gk = new GreenKeeper({
    container: '#app',
    mapImage: 'assets/campus-map.svg',   // 园区平面图，留空则显示网格底板
    seed: [ /* 可选初始数据 */ ]
  });
</script>
```

直接打开 `index.html` 可查看带示例数据的完整演示。

---

## 目录结构

```
greenkeeper/
├── greenkeeper.js      # 插件本体（UMD，约 1000 行）
├── greenkeeper.css     # 样式（浅色主题，CSS 变量可改色）
├── index.html          # 演示页（含 6 株示例绿植）
├── test-smoke.js       # jsdom 冒烟测试：node test-smoke.js
└── assets/
    ├── campus-map.svg  # 园区平面图示意
    └── plant-*.svg     # 示例植物照片
```

---

## 核心能力

| 能力 | 说明 |
| --- | --- |
| 地图新增绿植 | 点「新增绿植」→ 在平面图上单击落点 → 填档案并上传照片 |
| 照片展示 | 上传后自动压缩至 720px 宽并转 base64；标记上显示缩略图，抽屉显示大图 |
| 档案管理 | 名称、品种/学名、编号、栽种日期、养护责任人、备注；支持编辑与删除 |
| 养护作业 | 施肥 / 放药 / 修剪 三个周期作业 + 浇水、除草、松土、补种、换盆移植、病虫害处理 |
| 智能预警 | 按各作业周期自动判定：`正常` → `待养护`（超周期）→ `已逾期`（超 1.5 倍周期）；标记边框变橙/变红，顶部统计条汇总 |
| 维护时间轴 | 每个手术都有独立的作业记录（日期、作业人、用量、说明），可单条删除 |
| 拖拽调位 | 编辑模式下直接拖动标记调整植株位置 |
| 数据持久化 | 自动写入 `localStorage`；支持 JSON 导出 / 导入 |
| 视图控制 | 缩放（50%–250%）、复位、编辑 / 浏览模式切换 |
| 响应式 | 窄屏自动将详情抽屉改为浮层 |

---

## 配置项

```js
new GreenKeeper({
  container: '#app',            // 必需：挂载点（选择器或 DOM 元素）
  mapImage: '',                 // 园区平面图 URL / base64，空则用网格底板
  storageKey: 'greenkeeper.data.v1',
  editable: true,               // false = 纯浏览模式，禁止新增/编辑/拖拽
  zoomable: true,
  persist: true,                // 是否写 localStorage
  imageMaxWidth: 720,           // 上传图片压缩后的最大宽度
  seed: null,                   // 无本地数据时的初始绿植数组
  careRules: [                  // 养护周期规则（决定预警逻辑与快捷按钮）
    { type: '施肥', interval: 30, icon: 'fertilize', color: '#d98613' },
    { type: '放药', interval: 45, icon: 'pesticide', color: '#7c6cf0' },
    { type: '修剪', interval: 60, icon: 'prune',    color: '#2f9e63' }
  ],
  extraRecordTypes: ['浇水', '除草', '松土', '补种', '换盆移植', '病虫害处理'],
  onChange: function (plants, instance) {
    // 数据变化回调：在此同步到后端
  }
});
```

**数据结构**

```js
{
  id: 'p_xxx',
  name: '1号香樟',
  species: '香樟 Cinnamomum camphora',
  code: 'YQ-A-001',
  plantedAt: '2019-03-12',
  keeper: '张建国',
  note: '主干道行道树',
  image: 'data:image/jpeg;base64,...',   // 或 http 图片地址
  x: 39, y: 63,                          // 图上百分比坐标 0–100
  records: [
    { id:'r_xxx', type:'施肥', date:'2026-09-23', operator:'张建国',
      amount:'有机肥 2.0kg', note:'环状沟施，覆土浇水' }
  ]
}
```

---

## API

```js
gk.addPlant({ name, x, y, ... })        // 新增绿植，返回植株对象
gk.updatePlant(id, patch)               // 更新档案
gk.removePlant(id)                      // 删除植株（含记录）
gk.getPlant(id) / gk.getPlants()

gk.addRecord(plantId, { type, date, operator, amount, note })
gk.removeRecord(plantId, recordId)

gk.computeCare(plant)                   // → { status:'ok|due|overdue', items:[...] }
gk.select(id) / gk.focusPlant(id)       // 选中 / 滚动定位
gk.setFilter('香樟')                    // 关键字高亮过滤（非匹配植株变暗）
gk.setEditable(true) / gk.setZoom(1.2)

gk.exportJSON() / gk.importJSON(json) / gk.download('台账.json')
gk.clear() / gk.destroy()

GreenKeeper.VERSION                     // '1.0.0'
```

---

## 在框架中接入

```js
// Vue 3
import GreenKeeper from './greenkeeper.js';
import './greenkeeper.css';

onMounted(() => {
  gk = new GreenKeeper({
    container: ref.value,
    mapImage: '/campus-map.png',
    onChange: (plants) => save(plants)     // 或直接双向绑定
  });
});
onUnmounted(() => gk.destroy());
```

React 同理：把容器 `ref.current` 传给 `container`，在 `useEffect` 中创建、在清理函数里 `destroy()`。

---

## 对接真实业务

* **落库**：在 `onChange(plants)` 里调后端接口，把 `plants` 整体或增量上报。
* **拉取**：页面初始化时把后端数据通过 `importJSON()` 或 `seed` 注入。
* **植物识别**：上传照片时调用百度 AI「植物识别」接口自动填 `species`（`/rest/2.0/image-classify/v1/plant`）。
* **IoT 联动**：土壤墒情 / 气象站数据可用 `updatePlant` 写入 `note`，或扩展 `careRules` 增加「灌溉」周期项。
* **一树一档二维码**：按 `code` 字段生成二维码贴在树干上，扫码直达该植株详情（`gk.focusPlant(id)`）。

---

## 测试

```bash
node test-smoke.js
```

覆盖挂载、标记渲染、图片展示、状态计算、增删改、时间轴、导入导出、持久化、模式切换与销毁，共 27 项断言。

## License

MIT
