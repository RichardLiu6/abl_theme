/* ============================================================
   abl_theme — 子表高密度展示（纯展示层 JS，禁业务逻辑，见 README）
   ------------------------------------------------------------
   作用：标准 Form 内所有普通 Table（Grid）统一：
     · 表格上方「显示行数 Rows：单行｜3行｜5行」控件（默认 3，页内状态，不持久化）
     · 双语表头拆两行（中文 / English）
     · 长文本单元格按 CSS 变量 --abl-gd-lines 统一 line-clamp；编码/数字单行（CSS 按字段类型/字段名判定）
     · 截断单元格 hover 出全文（事件委托，按需设 title，不扫描）
     · 编辑态 .form-grid 程序性纵向偏移归零（修 Link 下拉致表头上缘被裁 1-2px，原生同有）
     · Item 链接只显示编码（全局统一 link_formatter，不改 Item meta；原生 innerText 已转义）
   不做：不改字段值 / 权限 / GridView 列顺序或宽度 / user_settings / localStorage。
   不适用（选择器天然排除）：弹窗(.modal)内的表、行详情表单内的表、Table MultiSelect、
     报表 / 列表视图、打印。hidden 的 Table 不强显（控件随原控件一起隐藏）。
   测试入口：window.__ablGridDisplay（见文件末尾）；稳定 class：
     .abl-gd（已增强的 Table 控件根）· .abl-grid-lines-ctl（行数控件）· button[data-lines]
   ============================================================ */
(function () {
  'use strict';
  var VERSION = '1.0.0-rc1';
  var LINE_OPTS = [[1, '单行'], [3, '3行'], [5, '5行']];
  var DEFAULT_LINES = 3;
  var ROOT_CLS = 'abl-gd';
  var CTL_CLS = 'abl-grid-lines-ctl';
  var BODY_ON = 'abl-gd-on';
  var TABLE_SEL = '.frappe-control[data-fieldtype="Table"]';
  var EXCLUDE_SEL = '.modal, .form-in-grid, .grid-form-body, .grid-row-open';

  var lines = new Map();          // key: doctype::docname::fieldname → n（页内内存，刷新即回默认）
  var observers = new Map();      // control element → MutationObserver
  var enabled = false;
  var origItemFmt = null;
  var stats = { enhanceCalls: 0, headerPasses: 0 };

  function onReady(fn) {
    if (window.frappe && frappe.ui && frappe.ui.form && frappe.form && frappe.form.link_formatters && window.$) return fn();
    setTimeout(function () { onReady(fn); }, 50);
  }

  function itemCodeOnly(value) { return value == null ? '' : value; }
  function assertItemFormatter() {
    if (!enabled) return;
    var cur = frappe.form.link_formatters.Item;
    if (cur !== itemCodeOnly) {
      if (origItemFmt === null) origItemFmt = cur || false;
      frappe.form.link_formatters.Item = itemCodeOnly;
    }
  }

  function keyFor(ctl) {
    var frm = window.cur_frm;
    var dt = (frm && frm.doctype) || '';
    var dn = (frm && frm.docname) || '';
    return dt + '::' + dn + '::' + (ctl.getAttribute('data-fieldname') || '');
  }
  function eligible(ctl) {
    return ctl && ctl.matches(TABLE_SEL) && !ctl.closest(EXCLUDE_SEL) && !!ctl.closest('.form-layout');
  }

  function applyLines(ctl, n) {
    ctl.style.setProperty('--abl-gd-lines', String(n));
    var btns = ctl.querySelectorAll('.' + CTL_CLS + ' button[data-lines]');
    for (var i = 0; i < btns.length; i++) btns[i].setAttribute('aria-pressed', String(Number(btns[i].getAttribute('data-lines')) === n));
    ctl.setAttribute('data-abl-gd-lines', String(n));
  }

  function ensureControl(ctl) {
    var host = ctl.querySelector('.form-grid-container') || ctl.querySelector('.form-grid');
    if (!host) return;
    var bar = ctl.querySelector(':scope .' + CTL_CLS);
    if (!bar) {
      bar = document.createElement('div');
      bar.className = CTL_CLS;
      var lab = document.createElement('span');
      lab.className = CTL_CLS + '-label';
      lab.textContent = '显示行数 Rows';
      var seg = document.createElement('span');
      seg.className = CTL_CLS + '-seg';
      seg.setAttribute('role', 'group');
      LINE_OPTS.forEach(function (o) {
        var b = document.createElement('button');
        b.type = 'button';
        b.setAttribute('data-lines', String(o[0]));
        b.textContent = o[1];
        seg.appendChild(b);
      });
      bar.appendChild(lab); bar.appendChild(seg);
      host.parentNode.insertBefore(bar, host);
    }
    var k = keyFor(ctl);
    applyLines(ctl, lines.has(k) ? lines.get(k) : DEFAULT_LINES);
  }

  // 双语表头：「中文 English」→ 两行。只处理纯文本表头（单一文本节点），其余原样不动。
  function splitHeaders(ctl) {
    stats.headerPasses++;
    var cells = ctl.querySelectorAll('.grid-heading-row .grid-static-col[data-fieldname] .static-area');
    for (var i = 0; i < cells.length; i++) {
      var el = cells[i];
      if (el.hasAttribute('data-abl-gd-orig')) continue;
      if (el.childNodes.length !== 1 || el.firstChild.nodeType !== 3) continue;
      var t = el.textContent.trim();
      var m = t.match(/^(\S*[^\x00-\x7F]\S*)\s+(.+)$/);    // 首个含中文的词 = 中文行，其余 = 英文行
      if (!m) continue;
      el.setAttribute('data-abl-gd-orig', t);
      el.textContent = '';
      el.appendChild(document.createTextNode(m[1]));
      var en = document.createElement('span');
      en.className = 'abl-gd-en';
      en.textContent = m[2];
      el.appendChild(en);
    }
  }
  function restoreHeaders(root) {
    var els = (root || document).querySelectorAll('[data-abl-gd-orig]');
    for (var i = 0; i < els.length; i++) { els[i].textContent = els[i].getAttribute('data-abl-gd-orig'); els[i].removeAttribute('data-abl-gd-orig'); }
  }

  function enhanceControl(ctl) {
    if (!eligible(ctl)) return;
    ctl.classList.add(ROOT_CLS);
    ensureControl(ctl);
    splitHeaders(ctl);
    if (!observers.has(ctl)) {
      var queued = false;
      var mo = new MutationObserver(function () {        // 限定本控件、rAF 节流、只做幂等的轻量补装
        if (queued) return; queued = true;
        requestAnimationFrame(function () { queued = false; if (enabled && ctl.isConnected) { ensureControl(ctl); splitHeaders(ctl); } });
      });
      mo.observe(ctl, { childList: true, subtree: true });
      observers.set(ctl, mo);
    }
  }
  function enhance(root) {
    if (!enabled) return 0;
    stats.enhanceCalls++;
    var scope = root || document;
    var ctls = scope.querySelectorAll(TABLE_SEL);
    var n = 0;
    for (var i = 0; i < ctls.length; i++) { if (eligible(ctls[i])) { enhanceControl(ctls[i]); n++; } }
    // 回收已离开 DOM 的观察器
    observers.forEach(function (mo, el) { if (!el.isConnected) { mo.disconnect(); observers.delete(el); } });
    return n;
  }

  // —— 全局事件（委托，不扫描） ——
  function onClick(ev) {
    var b = ev.target.closest && ev.target.closest('.' + CTL_CLS + ' button[data-lines]');
    if (!b) return;
    ev.preventDefault(); ev.stopPropagation();
    var ctl = b.closest('.' + ROOT_CLS);
    if (!ctl) return;
    var n = Number(b.getAttribute('data-lines'));
    lines.set(keyFor(ctl), n);
    applyLines(ctl, n);
  }
  function onOver(ev) {                                   // 截断单元格按需补 title（只动自己加的）
    var sa = ev.target.closest && ev.target.closest('.' + ROOT_CLS + ' .grid-body .static-area');
    if (!sa) return;
    if (sa.hasAttribute('title') && !sa.hasAttribute('data-abl-gd-title')) return;
    var full = sa.textContent.replace(/\s+/g, ' ').trim();
    var cut = sa.scrollHeight > sa.clientHeight + 1 || sa.scrollWidth > sa.clientWidth + 1;
    if (full && cut) { sa.setAttribute('title', full); sa.setAttribute('data-abl-gd-title', '1'); }
    else if (sa.hasAttribute('data-abl-gd-title')) { sa.removeAttribute('title'); sa.removeAttribute('data-abl-gd-title'); }
  }
  function onScroll(ev) {                                 // .form-grid 为 overflow-y:hidden，归零程序性纵向偏移
    var g = ev.target;
    if (g && g.nodeType === 1 && g.scrollTop && g.classList.contains('form-grid') && g.closest('.' + ROOT_CLS)) g.scrollTop = 0;
  }
  function onFormRefresh(ev, frm) {
    assertItemFormatter();
    var w = frm && frm.layout && frm.layout.wrapper;
    enhance(w && (w.get ? w.get(0) : w) || document);
  }

  function enable() {
    if (enabled) return api.status();
    enabled = true;
    document.body.classList.add(BODY_ON);
    document.addEventListener('click', onClick, true);
    document.addEventListener('mouseover', onOver, true);
    document.addEventListener('scroll', onScroll, true);
    $(document).on('form-refresh.ablgd', onFormRefresh);
    assertItemFormatter();
    enhance(document);
    return api.status();
  }
  function disable() {                                    // 撤销：移除全部视觉改动（刷新页面效果相同）
    enabled = false;
    document.body.classList.remove(BODY_ON);
    document.removeEventListener('click', onClick, true);
    document.removeEventListener('mouseover', onOver, true);
    document.removeEventListener('scroll', onScroll, true);
    $(document).off('form-refresh.ablgd');
    observers.forEach(function (mo) { mo.disconnect(); });
    observers.clear();
    var bars = document.querySelectorAll('.' + CTL_CLS);
    for (var i = 0; i < bars.length; i++) bars[i].remove();
    var roots = document.querySelectorAll('.' + ROOT_CLS);
    for (var j = 0; j < roots.length; j++) { roots[j].classList.remove(ROOT_CLS); roots[j].style.removeProperty('--abl-gd-lines'); roots[j].removeAttribute('data-abl-gd-lines'); }
    var ts = document.querySelectorAll('[data-abl-gd-title]');
    for (var k = 0; k < ts.length; k++) { ts[k].removeAttribute('title'); ts[k].removeAttribute('data-abl-gd-title'); }
    restoreHeaders(document);
    if (origItemFmt !== null && frappe.form.link_formatters.Item === itemCodeOnly) {
      if (origItemFmt) frappe.form.link_formatters.Item = origItemFmt; else delete frappe.form.link_formatters.Item;
    }
    origItemFmt = null;
    lines.clear();
    return api.status();
  }

  var api = {
    version: VERSION,
    classes: { root: ROOT_CLS, control: CTL_CLS, bodyOn: BODY_ON },
    options: LINE_OPTS.map(function (o) { return o[0]; }),
    defaultLines: DEFAULT_LINES,
    enable: enable,
    disable: disable,
    enhance: function (root) { return enhance(root || document); },
    // setLines(n) = 当前页面所有已增强表；setLines(n, el) = 指定 Table 控件（或其内部任一元素）
    setLines: function (n, el) {
      if (LINE_OPTS.map(function (o) { return o[0]; }).indexOf(n) < 0) throw new Error('lines must be 1, 3 or 5');
      var targets = el ? [el.closest ? el.closest('.' + ROOT_CLS) : null] : Array.prototype.slice.call(document.querySelectorAll('.' + ROOT_CLS));
      targets.forEach(function (c) { if (c) { lines.set(keyFor(c), n); applyLines(c, n); } });
      return targets.filter(Boolean).length;
    },
    getLines: function (el) { var c = el && el.closest ? el.closest('.' + ROOT_CLS) : null; return c ? Number(c.getAttribute('data-abl-gd-lines')) : null; },
    status: function () {
      return {
        version: VERSION, enabled: enabled,
        enhancedTables: document.querySelectorAll('.' + ROOT_CLS).length,
        controls: document.querySelectorAll('.' + CTL_CLS).length,
        observers: observers.size,
        itemCodeOnly: !!(window.frappe && frappe.form && frappe.form.link_formatters && frappe.form.link_formatters.Item === itemCodeOnly),
        stats: { enhanceCalls: stats.enhanceCalls, headerPasses: stats.headerPasses },
      };
    },
  };
  window.__ablGridDisplay = api;

  onReady(function () {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', enable);
    else enable();
  });
})();
