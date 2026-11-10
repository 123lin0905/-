/* GreenKeeper 冒烟测试（jsdom）—— 验证挂载、渲染、新增、养护记录、状态计算、导入导出 */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const DIR = __dirname;
const dom = new JSDOM('<!DOCTYPE html><html><body><div id="app"></div></body></html>', {
  url: 'http://localhost/',
  pretendToBeVisual: true
});

global.window = dom.window;
global.document = dom.window.document;
global.Image = dom.window.Image;
global.FileReader = dom.window.FileReader;
global.Blob = dom.window.Blob;
global.URL = dom.window.URL;
global.localStorage = dom.window.localStorage;
global.self = dom.window;

const src = fs.readFileSync(path.join(DIR, 'greenkeeper.js'), 'utf8');
const factory = new Function('window', 'document', 'self', 'module', 'exports', src + '\nreturn module.exports;');
const mod = { exports: {} };
factory(dom.window, dom.window.document, dom.window, mod, mod.exports);
const GreenKeeper = mod.exports;

const assert = (cond, msg) => {
  if (!cond) { console.error('FAIL: ' + msg); process.exitCode = 1; }
  else console.log('ok  - ' + msg);
};

function ago(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

const gk = new GreenKeeper({
  container: '#app',
  mapImage: '',
  seed: [
    { name: '1号香樟', code: 'A-001', species: '香樟', x: 30, y: 40, keeper: '张工',
      image: 'data:image/svg+xml;base64,AAA',
      records: [
        { type: '施肥', date: ago(5), operator: '张工' },
        { type: '放药', date: ago(10) },
        { type: '修剪', date: ago(20) }
      ] },
    { name: '环路绿篱', code: 'D-100', species: '女贞', x: 70, y: 80, records: [] }
  ]
});

assert(!!gk.root, '插件挂载成功');
assert(gk.plants.length === 2, 'seed 载入 2 株，实际 ' + gk.plants.length);
assert(dom.window.document.querySelectorAll('.gk-marker').length === 2, '渲染出 2 个地图标记');
assert(dom.window.document.querySelector('.gk-marker img') !== null, '标记显示植物图片');
assert(gk.computeCare(gk.plants[0]).status === 'ok', '常态植株状态为 ok');
assert(gk.computeCare(gk.plants[1]).status === 'overdue', '无记录植株状态为 overdue');

// 状态标签渲染
const stats = dom.window.document.querySelector('.gk-stats').textContent;
assert(/共\s*2\s*株/.test(stats), '统计条显示总株数: ' + stats.trim());
assert(stats.indexOf('已逾期') > -1, '统计条提示已逾期');

// 新增绿植（模拟地图落点新增）
const p = gk.addPlant({ name: '新种月季', species: '月季', code: 'C-021', x: 42, y: 19.5, image: 'data:image/svg+xml;base64,BBB' });
assert(gk.plants.length === 3, '新增后为 3 株');
assert(p.x === 42 && p.y === 19.5, '坐标按点位写入');
assert(dom.window.document.querySelectorAll('.gk-marker').length === 3, '地图标记同步新增');

// 选中 -> 抽屉渲染
gk.select(p.id);
const drawer = dom.window.document.querySelector('.gk-drawer');
assert(drawer.getAttribute('data-open') === '1', '详情抽屉打开');
const quick = drawer.querySelectorAll('.gk-quick .gk-btn');
assert(quick.length === 4, '快捷养护按钮 4 个（施肥/放药/修剪/其他），实际 ' + quick.length);
const types = Array.from(quick).map(b => b.textContent.trim());
assert(types.indexOf('施肥') > -1 && types.indexOf('放药') > -1 && types.indexOf('修剪') > -1, '包含施肥/放药/修剪: ' + types.join(','));
assert(types.indexOf('其他作业') > -1, '包含其他作业入口');

// 记录养护作业
gk.addRecord(p.id, { type: '施肥', date: ago(1), operator: '李敏', amount: '复合肥 1kg', note: '环状沟施' });
gk.addRecord(p.id, { type: '放药', date: ago(200), operator: '李敏' });
assert(p.records.length === 2, '写入 2 条养护记录');
assert(gk.computeCare(p).status === 'overdue', '放药逾期 200 天 -> overdue');
const tl = dom.window.document.querySelectorAll('.gk-tl__item');
assert(tl.length === 2, '时间轴渲染 2 条，实际 ' + tl.length);
assert(gk.computeCare(p).items[0].msg.indexOf('天后') > -1, '施肥 30 天周期显示剩余天数: ' + gk.computeCare(p).items[0].msg);

// 删除记录
gk.removeRecord(p.id, p.records[0].id);
assert(p.records.length === 1, '删除记录后剩 1 条');
assert(gk.computeCare(p).status === 'overdue', '施肥记录清空后 -> overdue');

// 导出 / 导入
const json = gk.exportJSON();
assert(JSON.parse(json).plants.length === 3, '导出 JSON 含 3 株');
const gk2 = new GreenKeeper({ container: dom.window.document.createElement('div'), mapImage: '', persist: false });
gk2.importJSON(json);
assert(gk2.plants.length === 3, '导入到新实例成功');
assert(gk2.plants[2].name === '新种月季', '导入内容正确');

// 持久化
assert(!!dom.window.localStorage.getItem('greenkeeper.data.v1'), 'localStorage 已写入');

// 编辑/浏览模式
gk.setEditable(false);
assert(dom.window.document.querySelector('[data-act="add"]').disabled === true, '浏览模式下新增按钮禁用');
gk.setEditable(true);
assert(dom.window.document.querySelector('[data-act="add"]').disabled === false, '编辑模式下新增按钮可用');

// 删除植株
gk.removePlant(p.id);
assert(gk.plants.length === 2, '删除植株后剩 2 株');

// 销毁
gk.destroy();
assert(dom.window.document.querySelector('#app').innerHTML === '', 'destroy 清理 DOM');

console.log('\n冒烟测试结束。');
