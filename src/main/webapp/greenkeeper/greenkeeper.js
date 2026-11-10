/*!
 * GreenKeeper.js v1.0.0
 * 园区绿植智能管理插件 —— 零依赖 / 单文件 / UMD
 *
 * 能力：
 *   1. 园区平面图上点选位置新增绿植，并上传/展示植物图片
 *   2. 绿植档案维护（名称、品种、编号、栽种日期、养护人、备注）
 *   3. 养护作业记录：施肥 / 放药 / 修剪（可扩展浇水、除草等）
 *   4. 按养护周期自动计算健康状态：正常 / 待养护 / 已逾期
 *   5. 维护时间轴、统计看板、localStorage 持久化、JSON 导入导出
 *
 * License: MIT
 */
(function (root, factory) {
  if (typeof define === 'function' && define.amd) define([], factory);
  else if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GreenKeeper = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var VERSION = '1.0.0';

  /* =======================================================================
   * 图标（内联 SVG，避免任何外部依赖）
   * ===================================================================== */
  function svg(d, size, extra) {
    return '<svg width="' + (size || 16) + '" height="' + (size || 16) + '" viewBox="0 0 24 24" ' +
      'fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" ' +
      'stroke-linejoin="round" aria-hidden="true">' + d + (extra || '') + '</svg>';
  }

  var ICONS = {
    leaf: svg('<path d="M4 20c0-8.5 6-14.5 16-16 .5 10.5-5 16.5-13.5 16H4z"/><path d="M4 20c2.8-6 7.6-10 14-11.6"/>', 16),
    leafBig: svg('<path d="M4 20c0-8.5 6-14.5 16-16 .5 10.5-5 16.5-13.5 16H4z"/><path d="M4 20c2.8-6 7.6-10 14-11.6"/>', 34),
    plus: svg('<path d="M12 5v14M5 12h14"/>'),
    download: svg('<path d="M12 3v12m0 0-4-4m4 4 4-4M4 19h16"/>'),
    upload: svg('<path d="M12 21V9m0 0-4 4m4-4 4 4M4 5h16"/>'),
    edit: svg('<path d="M4 20h4L20 8l-4-4L4 16v4z"/><path d="M14 6l4 4"/>'),
    trash: svg('<path d="M4 7h16M9.5 7V4h5v3M6 7l1 13h10l1-13M10 11v6M14 11v6"/>'),
    close: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
    check: svg('<path d="M5 12.5l4.5 4.5L19 7"/>'),
    more: svg('<circle cx="12" cy="12" r="1.4"/><circle cx="6" cy="12" r="1.4"/><circle cx="18" cy="12" r="1.4"/>'),
    zoomIn: svg('<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.6-3.6M11 8.4v5.2M8.4 11h5.2"/>'),
    zoomOut: svg('<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.6-3.6M8.4 11h5.2"/>'),
    reset: svg('<path d="M4 12a8 8 0 1 0 2.6-5.9M4 4.5V9h4.5"/>'),
    image: svg('<rect x="3.5" y="5" width="17" height="14" rx="2"/><path d="M3.5 15.5l4.5-4.5 3 3 3-3 6.5 6.5"/><circle cx="8.6" cy="9.4" r="1.3"/>'),
    calendar: svg('<rect x="4" y="5.5" width="16" height="14.5" rx="2"/><path d="M8 3.2v4.3M16 3.2v4.3M4 10.5h16"/>'),
    user: svg('<circle cx="12" cy="8" r="3.6"/><path d="M4.6 20.4c.9-3.6 3.9-5.8 7.4-5.8s6.5 2.2 7.4 5.8"/>'),
    pin: svg('<path d="M12 21s7-6.3 7-11a7 7 0 1 0-14 0c0 4.7 7 11 7 11z"/><circle cx="12" cy="10" r="2.6"/>'),
    fertilize: svg('<path d="M8 8h8l1.2 12H6.8L8 8z"/><path d="M10 8V6.2A2 2 0 0 1 12 4.2a2 2 0 0 1 2 2V8"/><path d="M12 12v4M10 14h4"/>', 18),
    pesticide: svg('<rect x="9" y="9" width="7.5" height="11.5" rx="1.4"/><path d="M11 9V6.4h4.5V9"/><path d="M15.5 6.4h3.2M18.7 4.6v3.6"/><path d="M11.6 13.2h2.4"/>', 18),
    prune: svg('<circle cx="6.4" cy="17.6" r="2.5"/><circle cx="17.6" cy="17.6" r="2.5"/><path d="M8.4 15.9 15.6 3.6M15.6 15.9 8.4 3.6"/>', 18),
    water: svg('<path d="M12 3.4c3 3.9 5.5 6.9 5.5 9.6a5.5 5.5 0 0 1-11 0c0-2.7 2.5-5.7 5.5-9.6z"/>', 18),
    weed: svg('<path d="M12 21v-9"/><path d="M12 12c-4 0-7-2-8-6.2 4 0 7 2.1 8 6.2z"/><path d="M12 13.4c4 0 7-2 8-6.2-4 0-7 2.1-8 6.2z"/>', 18),
    clock: svg('<circle cx="12" cy="12" r="8.2"/><path d="M12 7.4V12l3.2 2"/>')
  };

  /* 额外可记录的养护类型 -> 图标 */
  var EXTRA_ICONS = {
    '浇水': 'water',
    '除草': 'weed',
    '松土': 'weed',
    '补种': 'leaf',
    '换盆移植': 'leaf',
    '病虫害处理': 'pesticide'
  };

  var DEFAULT_RULES = [
    { type: '施肥', interval: 30, icon: 'fertilize', color: '#d98613' },
    { type: '放药', interval: 45, icon: 'pesticide', color: '#7c6cf0' },
    { type: '修剪', interval: 60, icon: 'prune', color: '#2f9e63' }
  ];

  var DEFAULT_OPTS = {
    container: null,              // 挂载点：CSS 选择器 或 DOM 元素
    mapImage: '',                 // 园区平面图（URL / base64）；留空则显示网格底板
    storageKey: 'greenkeeper.data.v1',
    editable: true,               // 是否允许新增 / 编辑 / 拖拽
    zoomable: true,               // 是否显示缩放控件
    careRules: DEFAULT_RULES,     // 养护周期规则
    extraRecordTypes: ['浇水', '除草', '松土', '补种', '换盆移植', '病虫害处理'],
    imageMaxWidth: 720,           // 上传图片压缩后的最大宽度
    seed: null,                   // 无本地数据时的初始绿植数据
    persist: true,                // 是否写入 localStorage
    onChange: null                // (plants, instance) => void
  };

  /* =======================================================================
   * 工具函数
   * ===================================================================== */
  function uid(prefix) {
    return (prefix || 'gk') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function clamp(v, min, max) {
    return v < min ? min : (v > max ? max : v);
  }

  function todayStr() {
    var d = new Date();
    var m = String(d.getMonth() + 1);
    var day = String(d.getDate());
    return d.getFullYear() + '-' + (m.length < 2 ? '0' + m : m) + '-' + (day.length < 2 ? '0' + day : day);
  }

  function parseDate(s) {
    if (!s) return null;
    var m = String(s).slice(0, 10).split('-');
    if (m.length !== 3) return null;
    var d = new Date(Number(m[0]), Number(m[1]) - 1, Number(m[2]));
    return isNaN(d.getTime()) ? null : d;
  }

  function dayDiff(from, to) {
    if (!from || !to) return 0;
    return Math.round((to.getTime() - from.getTime()) / 86400000);
  }

  function startOfToday() {
    var d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function iconFor(type) {
    var name = EXTRA_ICONS[type] || 'leaf';
    return ICONS[name] || ICONS.leaf;
  }

  function readAsDataURL(file, maxWidth, cb) {
    var reader = new FileReader();
    reader.onload = function (e) {
      var raw = e.target.result;
      if (!maxWidth) return cb(raw);
      var img = new Image();
      img.onload = function () {
        try {
          var scale = Math.min(1, maxWidth / img.width);
          var canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(img.width * scale));
          canvas.height = Math.max(1, Math.round(img.height * scale));
          var ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          cb(canvas.toDataURL('image/jpeg', 0.86));
        } catch (err) {
          cb(raw);
        }
      };
      img.onerror = function () { cb(raw); };
      img.src = raw;
    };
    reader.onerror = function () { cb(null); };
    reader.readAsDataURL(file);
  }

  /* =======================================================================
   * 主类
   * ===================================================================== */
  function GreenKeeper(options) {
    this.opts = {};
    for (var k in DEFAULT_OPTS) if (Object.prototype.hasOwnProperty.call(DEFAULT_OPTS, k)) this.opts[k] = DEFAULT_OPTS[k];
    if (options) for (var j in options) if (Object.prototype.hasOwnProperty.call(options, j)) this.opts[j] = options[j];

    this.plants = [];
    this.activeId = null;
    this.placing = false;
    this.zoom = 1;
    this.filter = '';
    this._storageReady = true;
    this._drag = null;
    this._destroyed = false;
    this._toasts = 0;

    this._load();
    if (this.opts.container) this.mount(this.opts.container);
  }

  GreenKeeper.VERSION = VERSION;
  GreenKeeper.ICONS = ICONS;

  /* ------------------------------ 生命周期 ------------------------------ */

  GreenKeeper.prototype.mount = function (container) {
    var el = typeof container === 'string' ? document.querySelector(container) : container;
    if (!el) throw new Error('[GreenKeeper] 找不到挂载容器: ' + container);

    this.container = el;
    el.classList.add('gk-root');
    el.innerHTML = this._skeleton();
    this.root = el;

    this.stage = el.querySelector('.gk-stage');
    this.stageWrap = el.querySelector('.gk-stage-wrap');
    this.markerLayer = el.querySelector('.gk-marker-layer');
    this.drawer = el.querySelector('.gk-drawer');
    this.mask = el.querySelector('.gk-mask');
    this.modalHost = el.querySelector('.gk-modal-host');
    this.toastWrap = el.querySelector('.gk-toast-wrap');
    this.fileInput = el.querySelector('.gk-file-image');
    this.jsonInput = el.querySelector('.gk-file-json');
    this.hintEl = el.querySelector('.gk-hint');
    this.zoomLayer = el.querySelector('.gk-zoom');

    this._bind();
    this._syncEditUI();
    this.render();
    return this;
  };

  GreenKeeper.prototype.destroy = function () {
    if (this.root) {
      this.root.removeEventListener('click', this._onClick, false);
      document.removeEventListener('keydown', this._onKey, false);
      this.stage.removeEventListener('pointerdown', this._onStageDown, false);
      this.stage.removeEventListener('pointermove', this._onStageMove, false);
      window.removeEventListener('pointerup', this._onStageUp, false);
      this.root.innerHTML = '';
      this.root.classList.remove('gk-root');
    }
    this._destroyed = true;
    this.root = null;
  };

  /* ------------------------------ 骨架 ------------------------------ */

  GreenKeeper.prototype._skeleton = function () {
    var map = this.opts.mapImage
      ? '<img class="gk-stage__map" src="' + esc(this.opts.mapImage) + '" alt="园区平面图" draggable="false">'
      : '<div class="gk-stage__blank"></div>';

    return '' +
      '<div class="gk-toolbar">' +
        '<div class="gk-title">' + ICONS.leaf + '<span>园区绿植智能管理</span></div>' +
        '<div class="gk-stats"></div>' +
        '<div class="gk-spacer"></div>' +
        '<button class="gk-btn gk-btn--primary" data-act="add">' + ICONS.plus + '新增绿植</button>' +
        '<button class="gk-btn" data-act="toggle-edit">' + ICONS.edit + '<span class="gk-edit-label">编辑模式</span></button>' +
        '<button class="gk-btn gk-btn--ghost" data-act="export">' + ICONS.download + '导出</button>' +
        '<button class="gk-btn gk-btn--ghost" data-act="import">' + ICONS.upload + '导入</button>' +
      '</div>' +
      '<div class="gk-body">' +
        '<div class="gk-stage-wrap">' +
          '<div class="gk-stage">' + map +
            '<div class="gk-marker-layer"></div>' +
          '</div>' +
          '<div class="gk-hint" style="display:none"></div>' +
          '<div class="gk-zoom">' +
            '<button data-act="zoom-in" title="放大">' + ICONS.zoomIn + '</button>' +
            '<button data-act="zoom-out" title="缩小">' + ICONS.zoomOut + '</button>' +
            '<button data-act="zoom-reset" title="复位">' + ICONS.reset + '</button>' +
          '</div>' +
        '</div>' +
        '<aside class="gk-drawer" data-open="0"></aside>' +
      '</div>' +
      '<div class="gk-toast-wrap"></div>' +
      '<div class="gk-mask" data-open="0"><div class="gk-modal-host"></div></div>' +
      '<input type="file" class="gk-file-image" accept="image/*" hidden>' +
      '<input type="file" class="gk-file-json" accept=".json,application/json" hidden>';
  };

  /* ------------------------------ 事件 ------------------------------ */

  GreenKeeper.prototype._bind = function () {
    var self = this;
    this._onClick = function (e) { self._handleClick(e); };
    this._onKey = function (e) {
      if (self._destroyed || !self.root) return;
      if (e.key === 'Escape') {
        if (self.placing) return self.cancelPlacing();
        if (self.mask.getAttribute('data-open') === '1') return self.closeModal();
      }
      if (e.key === 'Enter' && self.mask.getAttribute('data-open') === '1') {
        var ok = self.mask.querySelector('[data-act="modal-ok"]');
        if (ok && !ok.disabled) { e.preventDefault(); ok.click(); }
      }
    };
    this.root.addEventListener('click', this._onClick, false);
    document.addEventListener('keydown', this._onKey, false);

    this._onStageDown = function (e) { self._stageDown(e); };
    this._onStageMove = function (e) { self._stageMove(e); };
    this._onStageUp = function (e) { self._stageUp(e); };
    this.stage.addEventListener('pointerdown', this._onStageDown, false);
    this.stage.addEventListener('pointermove', this._onStageMove, false);
    window.addEventListener('pointerup', this._onStageUp, false);

    this.fileInput.addEventListener('change', function () {
      var f = this.files && this.files[0];
      this.value = '';
      if (f && self._onPickImage) self._onPickImage(f);
    });
    this.jsonInput.addEventListener('change', function () {
      var f = this.files && this.files[0];
      this.value = '';
      if (!f) return;
      var r = new FileReader();
      r.onload = function (ev) {
        try {
          self.importJSON(ev.target.result);
          self.toast('已导入 ' + self.plants.length + ' 条绿植数据');
        } catch (err) {
          self.toast('导入失败：JSON 格式不正确', 'error');
        }
      };
      r.readAsText(f, 'utf-8');
    });
  };

  GreenKeeper.prototype._handleClick = function (e) {
    var t = e.target.closest ? e.target.closest('[data-act]') : null;
    if (!t) return;
    var act = t.getAttribute('data-act');
    var self = this;

    switch (act) {
      case 'add': this.startPlacing(); break;
      case 'toggle-edit': this.setEditable(!this.opts.editable); break;
      case 'export': this.download(); break;
      case 'import': this.jsonInput.click(); break;
      case 'zoom-in': this.setZoom(this.zoom + 0.15); break;
      case 'zoom-out': this.setZoom(this.zoom - 0.15); break;
      case 'zoom-reset': this.setZoom(1); break;
      case 'close-drawer': this.select(null); break;
      case 'edit-plant': this.openPlantForm(this.getPlant(this.activeId)); break;
      case 'delete-plant':
        var p = this.getPlant(this.activeId);
        this.confirm({
          title: '删除绿植',
          text: '确定删除「' + (p ? p.name : '') + '」及其全部养护记录？该操作不可撤销。',
          okText: '删除',
          danger: true,
          onOk: function () { self.removePlant(self.activeId); self.toast('已删除'); }
        });
        break;
      case 'record': this.openRecordModal(this.activeId, t.getAttribute('data-type')); break;
      case 'more-record': this.openRecordModal(this.activeId, ''); break;
      case 'del-record':
        this.removeRecord(this.activeId, t.getAttribute('data-id'));
        break;
      case 'pick-image': this.fileInput.click(); break;
      case 'clear-image':
        this._pendingImage = '';
        var box = this.mask.querySelector('.gk-upload__box');
        if (box) this._paintUploadBox(box, '');
        break;
      case 'modal-close': this.closeModal(); break;
      case 'modal-ok': this._submitModal(); break;
      case 'focus': this.focusPlant(t.getAttribute('data-id')); break;
    }
  };

  /* ------------------------------ 地图交互 ------------------------------ */

  GreenKeeper.prototype._rel = function (e) {
    var r = this.stage.getBoundingClientRect();
    return {
      x: clamp(((e.clientX - r.left) / r.width) * 100, 0, 100),
      y: clamp(((e.clientY - r.top) / r.height) * 100, 0, 100)
    };
  };

  GreenKeeper.prototype._stageDown = function (e) {
    // 放置模式：单击落点后弹出新增表单
    if (this.placing) {
      if (e.button !== 0) return;
      e.preventDefault();
      this.openPlantForm(null, this._rel(e));
      return;
    }
    var mk = e.target.closest ? e.target.closest('.gk-marker') : null;
    if (!mk || !this.opts.editable) return;
    this._drag = { id: mk.getAttribute('data-id'), moved: false, sx: e.clientX, sy: e.clientY };
    mk.setPointerCapture && mk.setPointerCapture(e.pointerId);
    e.preventDefault();
  };

  GreenKeeper.prototype._stageMove = function (e) {
    if (this.placing) {
      this._paintGhost(e);
      return;
    }
    if (!this._drag) return;
    var dx = Math.abs(e.clientX - this._drag.sx);
    var dy = Math.abs(e.clientY - this._drag.sy);
    if (dx + dy < 4 && !this._drag.moved) return;
    this._drag.moved = true;
    var pos = this._rel(e);
    var mk = this.markerLayer.querySelector('.gk-marker[data-id="' + this._drag.id + '"]');
    if (mk) { mk.style.left = pos.x + '%'; mk.style.top = pos.y + '%'; }
  };

  GreenKeeper.prototype._stageUp = function (e) {
    if (!this._drag) return;
    var drag = this._drag;
    this._drag = null;
    var plant = this.getPlant(drag.id);
    if (!plant) return;
    if (!drag.moved) { this.select(plant.id); return; }
    var pos = this._rel(e);
    this.updatePlant(plant.id, { x: pos.x, y: pos.y });
    this.toast('已移动「' + plant.name + '」');
  };

  GreenKeeper.prototype._paintGhost = function (e) {
    var pos = this._rel(e);
    var g = this.stage.querySelector('.gk-ghost');
    if (!g) {
      g = document.createElement('div');
      g.className = 'gk-marker gk-ghost';
      g.style.pointerEvents = 'none';
      g.innerHTML = '<div class="gk-marker__inner"><div class="gk-marker__ring">' +
        '<span class="gk-marker__ph">' + ICONS.leafBig + '</span></div></div>';
      this.stage.appendChild(g);
    }
    g.style.left = pos.x + '%';
    g.style.top = pos.y + '%';
  };

  GreenKeeper.prototype.startPlacing = function () {
    if (!this.opts.editable) { this.toast('请先切换到编辑模式'); return; }
    this.placing = true;
    this.stage.setAttribute('data-placing', '1');
    this._showHint('点击平面图选择栽种位置，按 Esc 取消');
  };

  GreenKeeper.prototype.cancelPlacing = function () {
    this.placing = false;
    this.stage.removeAttribute('data-placing');
    var g = this.stage.querySelector('.gk-ghost');
    if (g) g.remove();
    this._showHint(null);
  };

  GreenKeeper.prototype._showHint = function (text) {
    if (!text) { this.hintEl.style.display = 'none'; return; }
    this.hintEl.textContent = text;
    this.hintEl.style.display = 'block';
  };

  GreenKeeper.prototype.setZoom = function (z) {
    this.zoom = clamp(z, 0.5, 2.5);
    this.stage.style.transform = this.zoom === 1 ? '' : 'scale(' + this.zoom.toFixed(2) + ')';
  };

  GreenKeeper.prototype.setEditable = function (v) {
    this.opts.editable = !!v;
    this._syncEditUI();
    this.render();
  };

  GreenKeeper.prototype._syncEditUI = function () {
    var label = this.root.querySelector('.gk-edit-label');
    if (label) label.textContent = this.opts.editable ? '编辑模式' : '浏览模式';
    var addBtn = this.root.querySelector('[data-act="add"]');
    if (addBtn) addBtn.disabled = !this.opts.editable;
    if (this.zoomLayer) this.zoomLayer.style.display = this.opts.zoomable ? '' : 'none';
  };

  /* ------------------------------ 渲染 ------------------------------ */

  GreenKeeper.prototype.render = function () {
    if (!this.root) return;
    this.renderMarkers();
    this.renderStats();
    this.renderDrawer();
  };

  GreenKeeper.prototype.renderStats = function () {
    var box = this.root.querySelector('.gk-stats');
    var total = this.plants.length;
    var due = 0, overdue = 0;
    var self = this;
    this.plants.forEach(function (p) {
      var c = self.computeCare(p).status;
      if (c === 'due') due++;
      else if (c === 'overdue') overdue++;
    });
    box.innerHTML =
      '<span class="gk-chip">共 <b>' + total + '</b> 株</span>' +
      (due ? '<span class="gk-chip" data-tone="amber">待养护 <b>' + due + '</b></span>' : '') +
      (overdue ? '<span class="gk-chip" data-tone="red">已逾期 <b>' + overdue + '</b></span>' : '') +
      (total && !due && !overdue ? '<span class="gk-chip">全部正常</span>' : '');
  };

  GreenKeeper.prototype.renderMarkers = function () {
    var self = this;
    var kw = this.filter.trim().toLowerCase();
    var html = this.plants.map(function (p) {
      var care = self.computeCare(p);
      var dim = kw && (p.name + ' ' + (p.code || '') + ' ' + (p.species || '')).toLowerCase().indexOf(kw) === -1;
      var inner = p.image
        ? '<img src="' + esc(p.image) + '" alt="' + esc(p.name) + '">'
        : '<span class="gk-marker__ph">' + ICONS.leafBig + '</span>';
      return '<div class="gk-marker" data-id="' + esc(p.id) + '" data-status="' + care.status + '"' +
        (dim ? ' data-dim="1"' : '') +
        (p.id === self.activeId ? ' data-active="1"' : '') +
        (self.opts.editable ? ' data-draggable="1"' : '') +
        ' style="left:' + p.x + '%;top:' + p.y + '%" title="' + esc(p.name) + '">' +
        '<div class="gk-marker__inner">' +
          '<div class="gk-marker__dot"></div>' +
          '<div class="gk-marker__ring">' + inner + '</div>' +
          '<div class="gk-marker__label">' + esc(p.name) + '</div>' +
        '</div></div>';
    }).join('');
    this.markerLayer.innerHTML = html;
  };

  GreenKeeper.prototype.renderDrawer = function () {
    var p = this.getPlant(this.activeId);
    if (!p) {
      this.drawer.setAttribute('data-open', '0');
      this.drawer.innerHTML = '';
      return;
    }
    this.drawer.setAttribute('data-open', '1');
    var care = this.computeCare(p);
    var statusText = { ok: '养护正常', due: '需要养护', overdue: '养护逾期' }[care.status];

    var cover = p.image
      ? '<img class="gk-drawer__cover" src="' + esc(p.image) + '" alt="' + esc(p.name) + '">'
      : '<div class="gk-drawer__cover gk-drawer__cover--ph">' + ICONS.leafBig + '</div>';

    // 快捷养护：施肥 / 放药 / 修剪 + 其他作业（2 x 2）
    var quickBtns = this.opts.careRules.map(function (r) {
      return '<button class="gk-btn" data-act="record" data-type="' + esc(r.type) + '">' +
        ICONS[r.icon] + '<span>' + esc(r.type) + '</span></button>';
    }).join('') +
    '<button class="gk-btn" data-act="more-record">' + ICONS.more + '<span>其他作业</span></button>';

    var careRows = care.items.map(function (it) {
      var latest = it.latest;
      var sub = latest
        ? '上次 ' + esc(latest.date) + '（' + it.days + ' 天前）' + (latest.operator ? ' · ' + esc(latest.operator) : '')
        : '暂无记录';
      return '<div class="gk-care__item" data-status="' + it.status + '">' +
        '<span class="gk-care__ico" style="color:' + it.rule.color + '">' + ICONS[it.rule.icon] + '</span>' +
        '<div class="gk-care__main">' +
          '<div class="gk-care__n">' + esc(it.rule.type) + '<span class="gk-tag">' + esc(it.msg) + '</span></div>' +
          '<div class="gk-care__s">' + sub + '</div>' +
        '</div>' +
        '<button class="gk-btn gk-btn--sm" data-act="record" data-type="' + esc(it.rule.type) + '">记录</button>' +
      '</div>';
    }).join('');

    var records = (p.records || []).slice().sort(function (a, b) {
      return a.date < b.date ? 1 : (a.date > b.date ? -1 : 0);
    });
    var timeline = records.length ? records.map(function (r) {
      var bits = [];
      if (r.operator) bits.push('作业人：' + esc(r.operator));
      if (r.amount) bits.push('用量/规格：' + esc(r.amount));
      if (r.note) bits.push(esc(r.note));
      return '<div class="gk-tl__item" data-type="' + esc(r.type) + '">' +
        '<button class="gk-tl__del" data-act="del-record" data-id="' + esc(r.id) + '" title="删除该记录">' + ICONS.trash + '</button>' +
        '<div class="gk-tl__h"><span class="gk-tl__t">' + esc(r.type) + '</span><span class="gk-tl__d">' + esc(r.date) + '</span></div>' +
        (bits.length ? '<div class="gk-tl__b">' + bits.join('<br>') + '</div>' : '') +
      '</div>';
    }).join('') : '<div class="gk-empty">还没有养护记录</div>';

    this.drawer.innerHTML =
      '<div class="gk-drawer__head">' + cover +
        '<button class="gk-drawer__close" data-act="close-drawer" title="收起">' + ICONS.close + '</button>' +
      '</div>' +
      '<div class="gk-drawer__title">' +
        '<h3>' + esc(p.name) +
          '<span class="gk-tag" data-status="' + care.status + '" style="' +
            (care.status === 'ok' ? '' : care.status === 'due' ? 'background:#f6e3bd;color:#c98200' : 'background:#f7d5d0;color:#cf4436') +
          '">' + statusText + '</span>' +
        '</h3>' +
        '<p>' + esc(p.species || '未填写品种') + (p.code ? ' · 编号 ' + esc(p.code) : '') + '</p>' +
      '</div>' +
      '<div class="gk-drawer__scroll">' +
        '<div class="gk-sec"><div class="gk-sec__t">快捷养护作业</div>' +
          '<div class="gk-quick">' + quickBtns + '</div></div>' +
        '<div class="gk-sec"><div class="gk-sec__t">养护状态</div>' +
          '<div class="gk-care">' + careRows + '</div></div>' +
        '<div class="gk-sec"><div class="gk-sec__t">绿植档案</div>' +
          '<dl class="gk-kv">' +
            '<dt>品种</dt><dd>' + esc(p.species || '-') + '</dd>' +
            '<dt>编号</dt><dd>' + esc(p.code || '-') + '</dd>' +
            '<dt>栽种</dt><dd>' + esc(p.plantedAt || '-') + '</dd>' +
            '<dt>养护人</dt><dd>' + esc(p.keeper || '-') + '</dd>' +
            '<dt>位置</dt><dd>' + p.x.toFixed(1) + '%, ' + p.y.toFixed(1) + '%</dd>' +
            '<dt>备注</dt><dd>' + (esc(p.note) || '-') + '</dd>' +
          '</dl></div>' +
        '<div class="gk-sec"><div class="gk-sec__t">维护时间轴 <span style="font-weight:400;color:var(--gk-text-3)">共 ' + records.length + ' 条</span></div>' +
          '<div class="gk-tl">' + timeline + '</div></div>' +
        '<div class="gk-sec" style="display:flex;gap:8px">' +
          '<button class="gk-btn gk-btn--block" data-act="edit-plant">' + ICONS.edit + '编辑档案</button>' +
          '<button class="gk-btn gk-btn--danger gk-btn--block" data-act="delete-plant">' + ICONS.trash + '删除</button>' +
        '</div>' +
      '</div>';
  };

  /* ------------------------------ 弹窗基础 ------------------------------ */

  GreenKeeper.prototype.openModal = function (html, opt) {
    this.modalHost.innerHTML = html;
    this.mask.setAttribute('data-open', '1');
    this._modalOpts = opt || {};
    var first = this.modalHost.querySelector('input,select,textarea');
    if (first) setTimeout(function () { first.focus(); }, 30);
  };

  GreenKeeper.prototype.closeModal = function () {
    this.mask.setAttribute('data-open', '0');
    this.modalHost.innerHTML = '';
    this._modalOpts = null;
    this._pendingImage = undefined;
    this._onPickImage = null;
  };

  GreenKeeper.prototype.confirm = function (o) {
    var okStyle = o.danger ? ' style="background:var(--gk-red);border-color:var(--gk-red)"' : '';
    this.openModal(
      '<div class="gk-modal gk-modal--sm">' +
        '<div class="gk-modal__h">' + esc(o.title || '确认') +
          '<button class="gk-btn gk-btn--ghost gk-btn--sm" data-act="modal-close">' + ICONS.close + '</button></div>' +
        '<div class="gk-modal__b"><div class="gk-note" style="background:var(--gk-red-l);color:var(--gk-red)">' + esc(o.text || '') + '</div></div>' +
        '<div class="gk-modal__f">' +
          '<button class="gk-btn" data-act="modal-close">取消</button>' +
          '<button class="gk-btn gk-btn--primary"' + okStyle + ' data-act="modal-ok">' + esc(o.okText || '确定') + '</button>' +
        '</div>' +
      '</div>', { onOk: o.onOk });
  };

  GreenKeeper.prototype._submitModal = function () {
    var opt = this._modalOpts;
    if (!opt || !opt.onOk) return this.closeModal();
    var keep = opt.onOk(this.modalHost);
    if (keep !== false) this.closeModal();
  };

  /* ------------------------------ 新增 / 编辑档案 ------------------------------ */

  GreenKeeper.prototype.openPlantForm = function (plant, coords) {
    if (!this.opts.editable) { this.toast('请先切换到编辑模式'); return; }
    var isEdit = !!plant;
    var d = plant || { name: '', species: '', code: '', plantedAt: todayStr(), keeper: '', note: '', image: '' };
    this._pendingImage = d.image || '';
    var self = this;

    var html =
      '<div class="gk-modal">' +
        '<div class="gk-modal__h">' + (isEdit ? '编辑绿植档案' : '新增绿植') +
          '<button class="gk-btn gk-btn--ghost gk-btn--sm" data-act="modal-close">' + ICONS.close + '</button></div>' +
        '<div class="gk-modal__b">' +
          '<div class="gk-field">' +
            '<label>绿植图片</label>' +
            '<div class="gk-upload">' +
              '<div class="gk-upload__box" data-act="pick-image"></div>' +
              '<div class="gk-upload__side">' +
                '<p>点击左侧方框上传照片，或粘贴网络图片地址。建议正面全株照片，自动压缩至 ' + this.opts.imageMaxWidth + 'px。</p>' +
                '<input class="gk-input" type="url" placeholder="https://...图片地址" data-field="imageUrl">' +
                '<button class="gk-btn gk-btn--sm" data-act="clear-image">清除图片</button>' +
              '</div>' +
            '</div>' +
          '</div>' +
          '<div class="gk-row">' +
            '<div class="gk-field"><label>名称 <i>*</i></label>' +
              '<input class="gk-input" data-field="name" placeholder="如：1号香樟" value="' + esc(d.name) + '"></div>' +
            '<div class="gk-field"><label>编号</label>' +
              '<input class="gk-input" data-field="code" placeholder="如：YQ-A-001" value="' + esc(d.code) + '"></div>' +
          '</div>' +
          '<div class="gk-row">' +
            '<div class="gk-field"><label>品种 / 学名</label>' +
              '<input class="gk-input" data-field="species" placeholder="如：香樟 Cinnamomum camphora" value="' + esc(d.species) + '"></div>' +
            '<div class="gk-field"><label>栽种日期</label>' +
              '<input class="gk-input" type="date" data-field="plantedAt" value="' + esc(d.plantedAt) + '"></div>' +
          '</div>' +
          '<div class="gk-field"><label>养护责任人</label>' +
            '<input class="gk-input" data-field="keeper" placeholder="如：张工" value="' + esc(d.keeper) + '"></div>' +
          '<div class="gk-field"><label>备注</label>' +
            '<textarea class="gk-textarea" data-field="note" placeholder="生长状况、土壤条件、注意事项等">' + esc(d.note) + '</textarea></div>' +
          (isEdit ? '' : '<div class="gk-note">位置：' + coords.x.toFixed(1) + '%, ' + coords.y.toFixed(1) + '%（保存后可在编辑模式下拖动调整）</div>') +
        '</div>' +
        '<div class="gk-modal__f">' +
          '<button class="gk-btn" data-act="modal-close">取消</button>' +
          '<button class="gk-btn gk-btn--primary" data-act="modal-ok">' + (isEdit ? '保存修改' : '确认新增') + '</button>' +
        '</div>' +
      '</div>';

    this.openModal(html, {
      onOk: function (host) {
        var val = function (f) {
          var el = host.querySelector('[data-field="' + f + '"]');
          return el ? el.value.trim() : '';
        };
        var url = val('imageUrl');
        if (url) self._pendingImage = url;
        var name = val('name');
        if (!name) { self.toast('请填写绿植名称', 'error'); return false; }

        var patch = {
          name: name,
          code: val('code'),
          species: val('species'),
          plantedAt: val('plantedAt'),
          keeper: val('keeper'),
          note: val('note'),
          image: self._pendingImage || ''
        };
        if (isEdit) {
          self.updatePlant(plant.id, patch);
          self.toast('档案已更新');
        } else {
          var np = self.addPlant(Object.assign({ x: coords.x, y: coords.y }, patch));
          self.select(np.id);
          self.toast('「' + np.name + '」已上图，共 ' + self.plants.length + ' 株');
        }
        self.cancelPlacing();
        return true;
      }
    });

    var box = this.modalHost.querySelector('.gk-upload__box');
    this._paintUploadBox(box, this._pendingImage);
    this._onPickImage = function (file) {
      readAsDataURL(file, self.opts.imageMaxWidth, function (data) {
        if (!data) return self.toast('图片读取失败', 'error');
        self._pendingImage = data;
        var b = self.modalHost.querySelector('.gk-upload__box');
        if (b) self._paintUploadBox(b, data);
      });
    };
    box.addEventListener('dragover', function (e) { e.preventDefault(); box.setAttribute('data-over', '1'); });
    box.addEventListener('dragleave', function () { box.removeAttribute('data-over'); });
    box.addEventListener('drop', function (e) {
      e.preventDefault();
      box.removeAttribute('data-over');
      var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f && f.type.indexOf('image/') === 0) self._onPickImage(f);
    });
  };

  GreenKeeper.prototype._paintUploadBox = function (box, src) {
    if (!box) return;
    box.innerHTML = src
      ? '<img src="' + esc(src) + '" alt="预览">'
      : ICONS.image + '<span>上传照片</span>';
  };

  /* ------------------------------ 养护记录 ------------------------------ */

  GreenKeeper.prototype.openRecordModal = function (plantId, type) {
    var plant = this.getPlant(plantId);
    if (!plant) { this.toast('请先选择一株绿植'); return; }
    if (!this.opts.editable) { this.toast('请先切换到编辑模式'); return; }

    var types = [];
    this.opts.careRules.forEach(function (r) { if (types.indexOf(r.type) === -1) types.push(r.type); });
    this.opts.extraRecordTypes.forEach(function (t) { if (types.indexOf(t) === -1) types.push(t); });

    var options = types.map(function (t) {
      return '<option value="' + esc(t) + '"' + (t === type ? ' selected' : '') + '>' + esc(t) + '</option>';
    }).join('');

    var self = this;
    var html =
      '<div class="gk-modal gk-modal--sm">' +
        '<div class="gk-modal__h">记录养护作业' +
          '<button class="gk-btn gk-btn--ghost gk-btn--sm" data-act="modal-close">' + ICONS.close + '</button></div>' +
        '<div class="gk-modal__b">' +
          '<div class="gk-note">目标绿植：<b>' + esc(plant.name) + '</b>' + (plant.code ? '（' + esc(plant.code) + '）' : '') + '</div>' +
          '<div class="gk-field"><label>作业类型 <i>*</i></label>' +
            '<select class="gk-select" data-field="type">' + options + '</select></div>' +
          '<div class="gk-row">' +
            '<div class="gk-field"><label>作业日期 <i>*</i></label>' +
              '<input class="gk-input" type="date" data-field="date" value="' + todayStr() + '"></div>' +
            '<div class="gk-field"><label>作业人</label>' +
              '<input class="gk-input" data-field="operator" placeholder="如：张工" value="' + esc(plant.keeper || '') + '"></div>' +
          '</div>' +
          '<div class="gk-field"><label>用量 / 规格</label>' +
            '<input class="gk-input" data-field="amount" placeholder="如：复合肥 0.5kg / 吡虫啉 20ml / 修剪冠幅 0.3m"></div>' +
          '<div class="gk-field"><label>作业说明</label>' +
            '<textarea class="gk-textarea" data-field="note" placeholder="作业内容、生长情况记录等"></textarea></div>' +
        '</div>' +
        '<div class="gk-modal__f">' +
          '<button class="gk-btn" data-act="modal-close">取消</button>' +
          '<button class="gk-btn gk-btn--primary" data-act="modal-ok">保存记录</button>' +
        '</div>' +
      '</div>';

    this.openModal(html, {
      onOk: function (host) {
        var val = function (f) {
          var el = host.querySelector('[data-field="' + f + '"]');
          return el ? el.value.trim() : '';
        };
        var rec = {
          type: val('type'),
          date: val('date') || todayStr(),
          operator: val('operator'),
          amount: val('amount'),
          note: val('note')
        };
        if (!rec.type) { self.toast('请选择作业类型', 'error'); return false; }
        self.addRecord(plant.id, rec);
        self.toast('已记录：' + rec.type + ' · ' + rec.date);
        return true;
      }
    });
  };

  /* ------------------------------ 业务逻辑 ------------------------------ */

  GreenKeeper.prototype.computeCare = function (plant) {
    var today = startOfToday();
    var items = this.opts.careRules.map(function (rule) {
      var latest = null;
      (plant.records || []).forEach(function (r) {
        if (r.type !== rule.type) return;
        if (!latest || String(r.date) > String(latest.date)) latest = r;
      });
      var days = latest ? Math.max(0, dayDiff(parseDate(latest.date) || today, today)) : null;
      var status = 'ok', msg = '';
      if (!latest) {
        status = 'overdue';
        msg = '从未' + rule.type;
      } else if (rule.interval && days >= rule.interval * 1.5) {
        status = 'overdue';
        msg = '逾期 ' + (days - rule.interval) + ' 天';
      } else if (rule.interval && days >= rule.interval) {
        status = 'due';
        msg = '应' + rule.type;
      } else {
        msg = rule.interval ? (rule.interval - days) + ' 天后' : '正常';
      }
      return { rule: rule, latest: latest, days: days, status: status, msg: msg };
    });

    var rank = { ok: 0, due: 1, overdue: 2 };
    var overall = 'ok';
    items.forEach(function (it) { if (rank[it.status] > rank[overall]) overall = it.status; });
    return { status: overall, items: items };
  };

  GreenKeeper.prototype.addPlant = function (data) {
    var plant = {
      id: uid('p'),
      name: data.name || '未命名绿植',
      species: data.species || '',
      code: data.code || '',
      plantedAt: data.plantedAt || todayStr(),
      keeper: data.keeper || '',
      note: data.note || '',
      image: data.image || '',
      x: typeof data.x === 'number' ? clamp(data.x, 0, 100) : 50,
      y: typeof data.y === 'number' ? clamp(data.y, 0, 100) : 50,
      createdAt: new Date().toISOString(),
      records: data.records ? data.records.slice() : []
    };
    this.plants.push(plant);
    this._commit();
    return plant;
  };

  GreenKeeper.prototype.updatePlant = function (id, patch) {
    var p = this.getPlant(id);
    if (!p) return null;
    for (var k in patch) {
      if (!Object.prototype.hasOwnProperty.call(patch, k)) continue;
      p[k] = patch[k];
    }
    this._commit();
    return p;
  };

  GreenKeeper.prototype.removePlant = function (id) {
    var i = this._index(id);
    if (i < 0) return false;
    this.plants.splice(i, 1);
    if (this.activeId === id) this.activeId = null;
    this._commit();
    return true;
  };

  GreenKeeper.prototype.getPlant = function (id) {
    var i = this._index(id);
    return i < 0 ? null : this.plants[i];
  };

  GreenKeeper.prototype.getPlants = function () {
    return this.plants;
  };

  GreenKeeper.prototype._index = function (id) {
    for (var i = 0; i < this.plants.length; i++) if (this.plants[i].id === id) return i;
    return -1;
  };

  GreenKeeper.prototype.addRecord = function (plantId, rec) {
    var p = this.getPlant(plantId);
    if (!p) return null;
    var record = {
      id: uid('r'),
      type: rec.type || '其他',
      date: rec.date || todayStr(),
      operator: rec.operator || '',
      amount: rec.amount || '',
      note: rec.note || '',
      createdAt: new Date().toISOString()
    };
    if (!p.records) p.records = [];
    p.records.push(record);
    this._commit();
    return record;
  };

  GreenKeeper.prototype.removeRecord = function (plantId, recordId) {
    var p = this.getPlant(plantId);
    if (!p || !p.records) return false;
    var before = p.records.length;
    p.records = p.records.filter(function (r) { return r.id !== recordId; });
    if (p.records.length === before) return false;
    this._commit();
    this.toast('已删除该条记录');
    return true;
  };

  GreenKeeper.prototype.select = function (id) {
    this.activeId = id || null;
    this.renderMarkers();
    this.renderDrawer();
  };

  GreenKeeper.prototype.focusPlant = function (id) {
    var p = this.getPlant(id);
    if (!p) return;
    if (this.activeId !== id) this.activeId = id;
    var wrap = this.stageWrap;
    var target = (p.y / 100) * this.stage.offsetHeight * this.zoom;
    wrap.scrollTo({ top: Math.max(0, target - wrap.clientHeight / 2), behavior: 'smooth' });
    this.render();
  };

  GreenKeeper.prototype.setFilter = function (kw) {
    this.filter = kw || '';
    this.renderMarkers();
  };

  /* ------------------------------ 持久化 ------------------------------ */

  GreenKeeper.prototype._commit = function () {
    this._save();
    this.render();
    if (typeof this.opts.onChange === 'function') {
      try { this.opts.onChange(this.plants, this); } catch (e) { /* noop */ }
    }
  };

  GreenKeeper.prototype._save = function () {
    if (!this.opts.persist) return;
    try {
      localStorage.setItem(this.opts.storageKey, JSON.stringify(this.plants));
    } catch (e) {
      if (this._storageReady) {
        this._storageReady = false;
        this.toast('浏览器本地存储不可用，数据仅保留在当前页面', 'error');
      }
    }
  };

  GreenKeeper.prototype._load = function () {
    var raw = null;
    if (this.opts.persist) {
      try { raw = localStorage.getItem(this.opts.storageKey); } catch (e) { raw = null; }
    }
    if (raw) {
      try {
        var arr = JSON.parse(raw);
        if (Array.isArray(arr)) { this.plants = arr; return; }
      } catch (e) { /* 忽略脏数据 */ }
    }
    if (Array.isArray(this.opts.seed)) {
      this.plants = this.opts.seed.map(function (d) {
        return {
          id: d.id || uid('p'),
          name: d.name || '未命名绿植',
          species: d.species || '',
          code: d.code || '',
          plantedAt: d.plantedAt || todayStr(),
          keeper: d.keeper || '',
          note: d.note || '',
          image: d.image || '',
          x: typeof d.x === 'number' ? d.x : 50,
          y: typeof d.y === 'number' ? d.y : 50,
          createdAt: new Date().toISOString(),
          records: Array.isArray(d.records) ? d.records.map(function (r) {
            return { id: r.id || uid('r'), type: r.type, date: r.date, operator: r.operator || '', amount: r.amount || '', note: r.note || '' };
          }) : []
        };
      });
      this._save();
    }
  };

  GreenKeeper.prototype.exportJSON = function () {
    return JSON.stringify({ app: 'GreenKeeper', version: VERSION, exportedAt: new Date().toISOString(), plants: this.plants }, null, 2);
  };

  GreenKeeper.prototype.importJSON = function (text) {
    var data = typeof text === 'string' ? JSON.parse(text) : text;
    var arr = Array.isArray(data) ? data : (data && data.plants);
    if (!Array.isArray(arr)) throw new Error('数据格式不正确');
    this.plants = arr.map(function (d) {
      return {
        id: d.id || uid('p'),
        name: d.name || '未命名绿植',
        species: d.species || '',
        code: d.code || '',
        plantedAt: d.plantedAt || '',
        keeper: d.keeper || '',
        note: d.note || '',
        image: d.image || '',
        x: typeof d.x === 'number' ? clamp(d.x, 0, 100) : 50,
        y: typeof d.y === 'number' ? clamp(d.y, 0, 100) : 50,
        createdAt: d.createdAt || new Date().toISOString(),
        records: Array.isArray(d.records) ? d.records : []
      };
    });
    this.activeId = null;
    this._commit();
    return this.plants.length;
  };

  GreenKeeper.prototype.download = function (filename) {
    var name = filename || ('园区绿植数据_' + todayStr() + '.json');
    var blob = new Blob([this.exportJSON()], { type: 'application/json;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    this.toast('已导出 ' + this.plants.length + ' 株绿植档案');
  };

  GreenKeeper.prototype.clear = function () {
    this.plants = [];
    this.activeId = null;
    this._commit();
  };

  /* ------------------------------ Toast ------------------------------ */

  GreenKeeper.prototype.toast = function (text, tone) {
    if (!this.toastWrap) return;
    var el = document.createElement('div');
    el.className = 'gk-toast';
    if (tone) el.setAttribute('data-tone', tone);
    el.textContent = text;
    this.toastWrap.appendChild(el);
    setTimeout(function () {
      el.style.transition = 'opacity .3s';
      el.style.opacity = '0';
      setTimeout(function () { el.remove(); }, 320);
    }, 2200);
  };

  /* 静态工厂 */
  GreenKeeper.create = function (options) {
    return new GreenKeeper(options);
  };

  return GreenKeeper;
});
