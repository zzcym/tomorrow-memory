/** 明日日程 v2 · 界面逻辑(时间轴/周视图/语音/课程表导入/主题) */
'use strict';

const $ = (id) => document.getElementById(id);
const B = () => window.AndroidBridge;
const USE12 = () => (S.settings.appearance || {}).timeFormat === '12h';

const HOUR_H = 56;          // 日视图每小时像素
const HOUR_H_WEEK = 34;     // 周视图每小时像素

const S = {
  events: [],
  settings: {},
  view: { mode: 'day', day: Core.todayStr() },
  pending: [],              // 解析结果待确认
  courseDraft: [],          // 课程识别结果
  voice: { state: 'idle', recording: false },
};

// ================= 工具 =================
function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
function fmtT(hhmm) { return Core.fmtTime(hhmm, USE12()); }
function dtLocalVal(dt) { return (dt || '').replace(' ', 'T'); }
function showToast(msg, long, action) {
  const t = $('toast');
  t.innerHTML = '';
  const span = document.createElement('span');
  span.textContent = msg;
  t.appendChild(span);
  if (action) {
    const btn = document.createElement('button');
    btn.className = 'toast-act';
    btn.textContent = action.label;
    btn.addEventListener('click', () => {
      clearTimeout(t._tm);
      t.classList.add('hidden');
      action.fn();
    });
    t.appendChild(btn);
  }
  t.classList.remove('hidden');
  clearTimeout(t._tm);
  t._tm = setTimeout(() => t.classList.add('hidden'), long ? 5000 : 2200);
}
function showErr(id, msg) {
  const el = $(id);
  if (!msg) { el.classList.add('hidden'); return; }
  el.textContent = msg;
  el.classList.remove('hidden');
}
function icon(name) { return (window.ICONS && ICONS[name]) || ''; }

/** 按标题稳定散列取分类色(默认墨青,其余 5 色) */
function evColor(title) {
  const s = String(title || '');
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return ['', 'c-blue', 'c-orange', 'c-green', 'c-slate', 'c-red'][h % 6];
}

// ================= 抽屉管理 =================
let openSheet = null;
function sheetOpen(id) {
  closeSheet();
  openSheet = id;
  $('sheetMask').classList.remove('hidden');
  $(id).classList.remove('hidden');
}
function closeSheet() {
  if (openSheet) $(openSheet).classList.add('hidden');
  openSheet = null;
  $('sheetMask').classList.add('hidden');
}
$('sheetMask').addEventListener('click', closeSheet);
document.querySelectorAll('.sheet-close').forEach((b) => {
  b.addEventListener('click', closeSheet);
  b.innerHTML = icon('close');
});

// ================= 底部导航 =================
function gotoPage(name) {
  document.querySelectorAll('.nav-item').forEach((b) => b.classList.toggle('active', b.dataset.nav === name));
  document.querySelectorAll('.page').forEach((p) => p.classList.remove('active'));
  $(`view-${name}`).classList.add('active');
  if (name === 'settings') loadSettingsTab();
  $('menuPop').classList.add('hidden');
}
document.querySelectorAll('.nav-item').forEach((btn) => {
  btn.addEventListener('click', () => gotoPage(btn.dataset.nav));
});

// ================= 设置存取 =================
const DEFAULT_SETTINGS = {
  llm: { baseUrl: '', apiKey: '', model: 'deepseek-chat' },
  asr: { baseUrl: '', apiKey: '', model: '' },
  reminder: { defaultLeadMinutes: 60, digestTime: '21:30', digestEnabled: true },
  appearance: { theme: 'day', bgPath: '', timeFormat: '24h' },
};
function saveSettingsRaw(patch) {
  try {
    S.settings = JSON.parse(B().saveSettings(JSON.stringify(patch)));
  } catch (e) { /* 保留内存态 */ }
  applyTheme();
  applyBg();
}

// ================= 主题与背景 =================
function applyTheme() {
  const t = (S.settings.appearance || {}).theme || 'day';
  document.documentElement.dataset.theme = t;
  try { B().applyUiTheme(t); } catch (e) { /* 浏览器环境无此方法 */ }
}
// auto 主题:系统深浅色切换时实时响应(uiMode 变更不再重建 Activity)
if (window.matchMedia) {
  try {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if ((S.settings.appearance || {}).theme === 'auto') applyTheme();
    });
  } catch (e) { /* 旧 WebView 无 addEventListener */ }
}
function applyBg() {
  const path = (S.settings.appearance || {}).bgPath || '';
  const body = document.body;
  if (!path) {
    body.classList.remove('has-bg');
    body.style.backgroundImage = '';
    return;
  }
  const key = 'bgData:' + path;
  let data = null;
  try { data = localStorage.getItem(key); } catch (e) { /* 忽略 */ }
  if (data) { setBg(data); return; }
  try {
    data = B().readImageBase64(path);
    if (data) {
      try { localStorage.setItem(key, data); } catch (e) { /* 超限就不缓存 */ }
      setBg(data);
    } else {
      // 背景文件已不存在:回退纯色并清除设置项
      saveSettingsRaw({ appearance: Object.assign({}, S.settings.appearance, { bgPath: '' }) });
    }
  } catch (e) { /* 忽略 */ }
  function setBg(d) {
    body.classList.add('has-bg');
    body.style.backgroundImage = `url("${d}")`;
  }
}

// ================= 顶栏与菜单 =================
$('menuBtn').innerHTML = icon('dots');
$('menuBtn').addEventListener('click', (e) => {
  e.stopPropagation();
  $('menuPop').classList.toggle('hidden');
});
document.addEventListener('click', (e) => {
  if (!$('menuPop').contains(e.target)) $('menuPop').classList.add('hidden');
});
$('menuPop').addEventListener('click', (e) => {
  const item = e.target.closest('.menu-item');
  if (!item) return;
  $('menuPop').classList.add('hidden');
  const act = item.dataset.act;
  if (act === 'courses') openCourseSheet();
  if (act === 'appearance') openAppearanceSheet();
  if (act === 'testNotify') {
    try {
      B().testNotify();
      showToast('测试通知已发送,看通知栏');
    } catch (err) { showToast('发送失败:' + err.message, true); }
  }
});
$('viewSeg').addEventListener('click', (e) => {
  const btn = e.target.closest('.seg-btn');
  if (!btn) return;
  S.view.mode = btn.dataset.mode;
  document.querySelectorAll('#viewSeg .seg-btn').forEach((b) => b.classList.toggle('active', b === btn));
  gotoPage('timeline'); // 在设置页也能直接切日/周
  renderTimeline();
});
$('warnFix').addEventListener('click', () => {
  if (S.warnExact) B().openExactAlarmSettings();
  else B().openNotifSettings();
});

function renderTopbar() {
  const today = Core.todayStr();
  const backBtn = $('backToday');
  if (S.view.mode === 'day') {
    const day = S.view.day;
    const dow = Core.DOW_CN[Core.dowOf(day) - 1];
    const n = Core.occurrences(S.events, day, day).length;
    $('tbTitle').textContent = `${Core.fmtDateCN(day)} 周${dow}`;
    $('tbSub').textContent = n ? `${n} 项日程` : '没有日程';
    backBtn.classList.toggle('hidden', day === today);
  } else {
    const mon = Core.mondayOf(S.view.day);
    const sun = Core.addDays(mon, 6);
    const n = Core.occurrences(S.events, mon, sun).length;
    // 日期区间由星期表头展示,顶栏只放教学周/周数,避免拥挤
    const course = S.events.find((e) => e.source === 'timetable' && e.recur && e.recur.semesterStart);
    let title = `${Core.fmtDateCN(mon)} 那一周`;
    if (course) {
      const wk = Math.round((Core.parseDay(mon) - Core.parseDay(course.recur.semesterStart)) / 86400000 / 7) + 1;
      if (wk >= 1 && wk <= 40) title = `第 ${wk} 教学周`;
    }
    $('tbTitle').textContent = title;
    $('tbSub').textContent = `共 ${n} 项`;
    backBtn.classList.toggle('hidden', mon === Core.mondayOf(today));
  }
}

// ================= 日视图:周条 =================
function renderWeekStrip() {
  const strip = $('weekStrip');
  const mon = Core.mondayOf(S.view.day);
  const today = Core.todayStr();
  strip.innerHTML = '';
  for (let i = 0; i < 7; i++) {
    const day = Core.addDays(mon, i);
    const cell = document.createElement('button');
    cell.className = 'ws-day' + (day === S.view.day ? ' selected' : '') + (day === today ? ' today' : '');
    cell.innerHTML = `<span class="ws-dow">周${Core.DOW_CN[i]}</span><span class="ws-num">${Core.parseDay(day).getDate()}</span>`;
    cell.addEventListener('click', () => { S.view.day = day; renderTimeline(); });
    strip.appendChild(cell);
  }
}

// ================= 日视图:时间轴 =================
let hourFmtCache = null;
function renderHours() {
  const hours = $('tlHours');
  const fmt = USE12();
  if (hours.childElementCount === 24 && hourFmtCache === fmt) return; // 格式变了要重建
  hourFmtCache = fmt;
  hours.innerHTML = '';
  for (let h = 0; h < 24; h++) {
    const row = document.createElement('div');
    row.className = 'tl-hour';
    row.style.height = HOUR_H + 'px';
    const label = fmt
      ? (h === 0 ? '凌晨12' : h === 12 ? '中午12' : h < 12 ? String(h) : String(h - 12))
      : String(h).padStart(2, '0');
    row.innerHTML = `<span class="tl-hlabel">${label}</span>`;
    hours.appendChild(row);
  }
}


/** 跨天事件的 chip:由 core.js 的展开层生成延续日,视图层不再单独扫描 */

function renderDayView() {
  renderHours();
  renderWeekStrip();
  const day = S.view.day;
  const today = Core.todayStr();
  $('backToday').classList.toggle('hidden', day === today);

  const occs = Core.occurrences(S.events, day, day);
  // 跨天事件(结束日在开始日之后)进全天条,不进 24h 轴
  const crossDay = occs.filter((o) => !o.allDay && !o.cont && o.end && Core.crossDayEnds(o.start, o.end));
  const timed = occs.filter((o) => !o.allDay && !o.cont && !(o.end && Core.crossDayEnds(o.start, o.end)));
  const allDay = occs.filter((o) => o.allDay); // 含跨天延续日(cont)

  // 全天条(含跨天与跨天延续)
  const bar = $('alldayBar');
  const chips = [
    ...allDay.map((o) => ({
      eventId: o.eventId,
      title: o.cont ? `${o.title}(跨天,进行中)` : o.title,
    })),
    ...crossDay.map((o) => ({
      eventId: o.eventId,
      title: `${o.title}(${o.start.slice(11)} 至 ${Core.fmtDateCN(o.end.slice(0, 10))} ${o.end.slice(11)})`,
    })),
  ];
  if (chips.length) {
    bar.classList.remove('hidden');
    bar.innerHTML = chips.map((o) =>
      `<button class="ev-block all-day c-slate" data-eid="${escapeHtml(o.eventId)}"><span class="evb-title">${escapeHtml(o.title)}</span></button>`).join('');
    bar.querySelectorAll('.ev-block').forEach((c) => {
      c.addEventListener('click', () => openEventDetail(c.dataset.eid));
    });
  } else {
    bar.classList.add('hidden');
  }

  // 事件块
  const layer = $('tlEvents');
  layer.innerHTML = '';
  const marks = Core.layoutColumns(timed);
  timed.forEach((o, i) => {
    const { col, cols } = marks[i];
    const startMin = Core.minutesOf(o.start.slice(11) || '00:00');
    const endMin = o.end ? Math.max(startMin + 20, Core.minutesOf(o.end.slice(11))) : startMin + 60;
    const top = startMin / 1440 * (24 * HOUR_H);
    const height = Math.max(24, (endMin - startMin) / 1440 * (24 * HOUR_H) - 2);
    const w = 100 / cols;
    const block = document.createElement('div');
    block.className = 'ev-block ' + evColor(o.title);
    block.style.top = top + 'px';
    block.style.height = height + 'px';
    block.style.left = `calc(${col * w}% + ${col * 3}px)`;
    block.style.width = `calc(${w}% - 4px)`;
    const past = day < today || (day === today && endMin < nowMinutes());
    const ongoing = day === today && startMin <= nowMinutes() && endMin > nowMinutes();
    if (past) block.classList.add('past');
    if (ongoing) block.classList.add('ongoing');
    block.innerHTML = `
      <div class="evb-time">${fmtT(o.start.slice(11))}${o.end ? ' – ' + fmtT(o.end.slice(11)) : ''}</div>
      <div class="evb-title">${escapeHtml(o.title)}</div>
      ${height > 44 && o.location ? `<div class="evb-loc">${escapeHtml(o.location)}</div>` : ''}`;
    block.addEventListener('click', () => openEventDetail(o.eventId, o));
    layer.appendChild(block);
  });

  // 当前时间线
  updateNowLine();

  // 滚动到合适位置
  const scroller = $('timelineScroll');
  let target = 7 * HOUR_H;
  if (day === today) {
    target = Math.max(0, (nowMinutes() - 90) / 1440 * (24 * HOUR_H));
  } else if (timed.length) {
    target = Math.max(0, Core.minutesOf(timed[0].start.slice(11)) / 1440 * (24 * HOUR_H) - 60);
  }
  scroller.scrollTop = Math.min(target, 24 * HOUR_H - scroller.clientHeight + 8);
}

function nowMinutes() {
  const n = new Date();
  return n.getHours() * 60 + n.getMinutes();
}

function updateNowLine() {
  const line = $('nowLine');
  if (S.view.mode !== 'day' || S.view.day !== Core.todayStr()) {
    line.classList.add('hidden');
    return;
  }
  line.classList.remove('hidden');
  line.style.top = (nowMinutes() / 1440 * (24 * HOUR_H)) + 'px';
}
setInterval(updateNowLine, 30000);

// 点击空白处新建
$('timeline').addEventListener('click', (e) => {
  if (e.target.closest('.ev-block')) return;
  if (e.target !== e.currentTarget && !e.target.classList.contains('tl-hour') && !e.target.classList.contains('tl-hlabel')) return;
  const rect = $('timeline').getBoundingClientRect();
  const y = e.clientY - rect.top; // #timeline 随内容滚动,视口差即内容坐标
  const min = Math.round((y / (24 * HOUR_H) * 1440) / 15) * 15;
  const hm = Core.hhmmOf(Math.min(23 * 60 + 45, Math.max(0, min)));
  openEventDetail(null, null, { day: S.view.day, time: hm });
});

// 日切换
$('prevDay').addEventListener('click', () => { S.view.day = Core.addDays(S.view.day, -1); renderTimeline(); });
$('nextDay').addEventListener('click', () => { S.view.day = Core.addDays(S.view.day, 1); renderTimeline(); });
$('backToday').addEventListener('click', () => { S.view.day = Core.todayStr(); renderTimeline(); }); // 日/周通用
// 周切换
$('prevWeek').addEventListener('click', () => { S.view.day = Core.addDays(S.view.day, -7); renderTimeline(); });
$('nextWeek').addEventListener('click', () => { S.view.day = Core.addDays(S.view.day, 7); renderTimeline(); });
// 滑动换天
let touchX = null, touchY = null;
$('timelineScroll').addEventListener('touchstart', (e) => {
  touchX = e.touches[0].clientX; touchY = e.touches[0].clientY;
}, { passive: true });
$('timelineScroll').addEventListener('touchend', (e) => {
  if (touchX == null) return;
  const dx = e.changedTouches[0].clientX - touchX;
  const dy = e.changedTouches[0].clientY - touchY;
  if (Math.abs(dx) > 60 && Math.abs(dy) < 40) {
    S.view.day = Core.addDays(S.view.day, dx < 0 ? 1 : -1);
    renderTimeline();
  }
  touchX = null;
}, { passive: true });

// ================= 周视图 =================
function renderWeekView() {
  const today = Core.todayStr();
  const mon = Core.mondayOf(S.view.day);
  const days = $('wgDays');
  days.innerHTML = '';
  for (let i = 0; i < 7; i++) {
    const day = Core.addDays(mon, i);
    const d = Core.parseDay(day);
    const cell = document.createElement('button');
    cell.className = 'wg-day' + (day === today ? ' today' : '');
    cell.innerHTML = `<span>周${Core.DOW_CN[i]}</span><span class="num">${d.getDate()}</span>`;
    cell.addEventListener('click', () => { S.view.day = day; switchMode('day'); });
    days.appendChild(cell);
  }

  const grid = $('weekgrid');
  grid.innerHTML = '';
  grid.style.height = (24 * HOUR_H_WEEK) + 'px';
  // 刻度:标签在时刻列内,横线从列右侧开始
  for (let h = 0; h < 24; h++) {
    const lab = document.createElement('span');
    lab.className = 'wg-hlabel';
    lab.style.top = (h * HOUR_H_WEEK) + 'px';
    lab.textContent = h;
    grid.appendChild(lab);
    const line = document.createElement('i');
    line.className = 'wg-hour';
    line.style.top = (h * HOUR_H_WEEK) + 'px';
    grid.appendChild(line);
  }
  // 7 列(flex 子项,由 CSS 等分)
  const cols = [];
  for (let i = 0; i < 7; i++) {
    const day = Core.addDays(mon, i);
    const col = document.createElement('div');
    col.className = 'wg-col' + (day === today ? ' today' : '');
    col.dataset.day = day;
    grid.appendChild(col);
    cols.push(col);
  }
  // 全天条(周):整周的全天与跨天事件
  const weekOccs = Core.occurrences(S.events, mon, Core.addDays(mon, 6));
  const wBar = $('weekAllDay');
  const wChips = weekOccs.filter((o) => o.allDay || o.cont || (!o.allDay && o.end && Core.crossDayEnds(o.start, o.end)));
  if (wChips.length) {
    wBar.classList.remove('hidden');
    wBar.innerHTML = wChips.map((o) =>
      `<button class="ev-block all-day c-slate" data-eid="${escapeHtml(o.eventId)}"><span class="evb-title">${o.allDay ? '' : '(跨天) '}${escapeHtml(o.title)}</span></button>`).join('');
    wBar.querySelectorAll('.ev-block').forEach((c) => {
      c.addEventListener('click', () => openEventDetail(c.dataset.eid));
    });
  } else {
    wBar.classList.add('hidden');
  }

  // 事件(同一天重叠分列,不互相叠压)
  const timedWeek = weekOccs.filter((o) => !o.allDay && !o.cont
    && !(o.end && Core.crossDayEnds(o.start, o.end)));
  const marks = Core.layoutColumns(timedWeek);
  timedWeek.forEach((o, i) => {
    const col = cols.find((c) => c.dataset.day === o.day);
    if (!col) return;
    const { col: ci, cols: cn } = marks[i];
    const block = document.createElement('div');
    const startMin = Core.minutesOf(o.start.slice(11) || '00:00');
    const endMin = o.end ? Math.max(startMin + 20, Core.minutesOf(o.end.slice(11))) : startMin + 60;
    block.className = 'ev-block mini ' + evColor(o.title);
    block.style.top = (startMin / 1440 * (24 * HOUR_H_WEEK)) + 'px';
    block.style.height = Math.max(18, (endMin - startMin) / 1440 * (24 * HOUR_H_WEEK) - 2) + 'px';
    block.style.left = `calc(${(ci * 100) / cn}% + 1px)`;
    block.style.width = `calc(${100 / cn}% - 2px)`;
    block.innerHTML = `<span class="evb-title">${escapeHtml(o.title)}</span>`;
    block.addEventListener('click', () => openEventDetail(o.eventId, o));
    col.appendChild(block);
  });
  // 周视图当前线
  if (today >= mon && today <= Core.addDays(mon, 6)) {
    const nowL = document.createElement('div');
    nowL.className = 'now-line wg-now';
    const idx = Core.dowOf(today) - 1;
    nowL.style.left = `calc(var(--wg-gutter) + (100% - 2 * var(--wg-gutter)) * ${idx} / 7)`;
    nowL.style.width = `calc((100% - 2 * var(--wg-gutter)) / 7)`;
    nowL.style.top = (nowMinutes() / 1440 * (24 * HOUR_H_WEEK)) + 'px';
    grid.appendChild(nowL);
  }
  $('wgScroll').scrollTop = Math.max(0, (7 * 60) / 1440 * (24 * HOUR_H_WEEK));
}

function switchMode(mode) {
  S.view.mode = mode;
  document.querySelectorAll('#viewSeg .seg-btn').forEach((b) => b.classList.toggle('active', b.dataset.mode === mode));
  renderTimeline();
}

// ================= 时间轴总渲染 =================
function renderTimeline() {
  $('dayView').classList.toggle('hidden', S.view.mode !== 'day');
  $('weekView').classList.toggle('hidden', S.view.mode !== 'week');
  renderTopbar();
  if (S.view.mode === 'day') renderDayView();
  else renderWeekView();
}

// ================= 事件详情 / 新建 =================
function openEventDetail(eventId, occ, create) {
  const body = $('eventBody');
  const actions = $('eventActions');
  const ev = eventId ? S.events.find((e) => e.id === eventId) : null;
  $('eventSheetTitle').innerHTML = (create ? '新建日程' : ev && ev.recur ? '课程表日程' : '日程详情')
    + '<button class="sheet-close" id="eventCloseDyn"></button>';

  if (ev && ev.recur) {
    const r = ev.recur;
    body.innerHTML = `
      <div class="ev-detail">
        <div class="evd-title">${escapeHtml(ev.title)}</div>
        <div class="evd-row">${icon('clock')} 每周${'一二三四五六日'[r.weekday - 1] || '?'} ${fmtT(r.start)}${r.end ? ' – ' + fmtT(r.end) : ''}</div>
        ${ev.location ? `<div class="evd-row">${icon('pin')} ${escapeHtml(ev.location)}</div>` : ''}
        ${ev.notes ? `<div class="evd-row">${icon('note')} ${escapeHtml(ev.notes)}</div>` : ''}
        <div class="evd-row muted">第 ${r.weeks ? r.weeks[0] + '–' + r.weeks[1] : '1–25'} 周${r.parity === 'odd' ? ' · 单周' : r.parity === 'even' ? ' · 双周' : ''}</div>
        <div class="evd-row muted">来自课程表,如需调整请删除后重新导入</div>
      </div>`;
    actions.innerHTML = '<button id="eventDeleteBtn" class="btn btn-danger grow">删除整门课程</button>';
    $('eventDeleteBtn').addEventListener('click', () => {
      S.events = JSON.parse(B().deleteEvent(ev.id));
      closeSheet(); renderTimeline();
      showToast('已删除「' + ev.title + '」');
    });
    sheetOpen('sheetEvent');
    const c = $('eventCloseDyn');
    if (c) { c.innerHTML = icon('close'); c.addEventListener('click', closeSheet); }
    return;
  }

  // 新建或编辑单条
  const isCreate = !!create || !ev;
  const isAllDayEdit = !isCreate && !!ev.allDay; // 全天事件编辑保持全天
  const baseDay = isCreate ? create.day : (occ ? occ.day : ev.start.slice(0, 10));
  const baseTime = isCreate ? create.time : (ev.start.slice(11) || '00:00');
  const val = {
    title: ev ? ev.title : '',
    start: `${baseDay}T${baseTime}`,
    end: ev && ev.end ? dtLocalVal(ev.end) : '',
    location: ev ? (ev.location || '') : '',
    notes: ev ? (ev.notes || '') : '',
    remind: ev ? (ev.remindMinutes === undefined || ev.remindMinutes === null ? 'default'
      : String(ev.remindMinutes)) : 'default',
  };
  if (isAllDayEdit) {
    body.innerHTML = `
      <div class="ev-allDay" style="margin:0 0 10px">全天事件(不指定具体时刻)</div>
      <div class="field"><label>标题</label><input id="evTitle" value="${escapeHtml(val.title)}" placeholder="做什么"/></div>
      <div class="field"><label>日期</label><input id="evStart" type="date" value="${baseDay}"/></div>
      <div class="field"><label>地点(可选)</label><input id="evLoc" value="${escapeHtml(val.location)}" placeholder="在哪"/></div>
      <div class="field"><label>备注(可选)</label><input id="evNotes" value="${escapeHtml(val.notes)}"/></div>`;
  } else {
    body.innerHTML = `
      <div class="field"><label>标题</label><input id="evTitle" value="${escapeHtml(val.title)}" placeholder="做什么"/></div>
      <div class="ev-grid2">
        <div class="field"><label>开始</label><input id="evStart" type="datetime-local" value="${val.start}"/></div>
        <div class="field"><label>结束(可选)</label><input id="evEnd" type="datetime-local" value="${val.end}"/></div>
      </div>
      <div class="field"><label>地点(可选)</label><input id="evLoc" value="${escapeHtml(val.location)}" placeholder="在哪"/></div>
      <div class="field"><label>备注(可选)</label><input id="evNotes" value="${escapeHtml(val.notes)}"/></div>
      <div class="field"><label>提醒</label>
        <select id="evRemind">
          <option value="default">跟随默认</option>
          <option value="0">准时</option>
          <option value="5">提前 5 分钟</option>
          <option value="15">提前 15 分钟</option>
          <option value="30">提前 30 分钟</option>
          <option value="60">提前 1 小时</option>
          <option value="120">提前 2 小时</option>
          <option value="1440">提前 1 天</option>
          <option value="-1">不提醒</option>
        </select></div>`;
    $('evRemind').value = val.remind;
  }

  if (isCreate) {
    actions.innerHTML = '<button id="eventSaveBtn" class="btn btn-primary grow">添加</button>';
  } else {
    actions.innerHTML = `
      <button id="eventSaveBtn" class="btn btn-primary grow">保存修改</button>
      <button id="eventDeleteBtn" class="btn btn-ghost">删除</button>`;
    $('eventDeleteBtn').addEventListener('click', () => {
      S.events = JSON.parse(B().deleteEvent(ev.id));
      closeSheet(); renderTimeline();
      showToast('已删除');
    });
  }
  $('eventSaveBtn').addEventListener('click', () => {
    const title = $('evTitle').value.trim();
    let start = $('evStart').value.replace('T', ' ');
    if (isAllDayEdit) start = `${start} 00:00`;
    if (!title) { showToast('先写个标题'); return; }
    if (!start) { showToast('请选择开始时间'); return; }
    const obj = {
      title,
      start,
      allDay: isAllDayEdit ? true : false,
      location: $('evLoc').value.trim(),
      notes: $('evNotes').value.trim(),
    };
    const endInput = $('evEnd');
    if (isAllDayEdit || !endInput) {
      obj.end = ''; // 明确清空
    } else {
      obj.end = endInput.value ? endInput.value.replace('T', ' ') : '';
    }
    const rm = $('evRemind');
    if (rm && rm.value !== 'default') obj.remindMinutes = +rm.value;
    else if (rm) obj.remindMinutes = null; // 恢复跟随默认
    try {
      if (isCreate) {
        S.events = JSON.parse(B().addEvents(JSON.stringify([obj])));
      } else {
        S.events = JSON.parse(B().updateEvent(JSON.stringify(Object.assign({ id: ev.id }, obj))));
      }
      closeSheet(); renderTimeline();
      showToast(isCreate ? '已添加,提醒已设置 ✓' : '已保存 ✓');
    } catch (e) {
      showToast('保存失败:' + e.message, true);
    }
  });
  sheetOpen('sheetEvent');
  const c = $('eventCloseDyn');
  if (c) { c.innerHTML = icon('close'); c.addEventListener('click', closeSheet); }
}

// ================= 语音 =================
$('micBtn').innerHTML = icon('mic');
const voOrb = $('voOrb');
voOrb.innerHTML = '<span class="vo-ic">' + icon('mic') + '</span>';

function voiceSetState(state, text, hint) {
  S.voice.state = state;
  voOrb.classList.toggle('recording', state === 'listening' || state === 'recording');
  voOrb.classList.toggle('busy', state === 'processing');
  $('voState').textContent = text || '';
  if (hint !== undefined) $('voHint').textContent = hint || '';
}
// 会话令牌:每次真正开始说话生成新 token,经原生回调原样带回;过期/取消后的迟到回调一律丢弃
let recCapTimer = null;
function clearRecCap() { if (recCapTimer) { clearTimeout(recCapTimer); recCapTimer = null; } }
function openVoiceOverlay() {
  $('voiceOverlay').classList.remove('hidden');
  voiceSetState('idle', '点一下开始说话', '例如:「明天晚上八点和小王吃饭」');
}
function closeVoiceOverlay() {
  clearRecCap();
  $('voiceOverlay').classList.add('hidden');
  S.voice.state = 'idle';
  S.voice.token = null;
}
$('micBtn').addEventListener('click', openVoiceOverlay);
$('voCancel').addEventListener('click', () => {
  try { B().cancelVoice(); } catch (e) { /* 忽略 */ }
  closeVoiceOverlay();
});
voOrb.addEventListener('click', () => {
  if (S.voice.state === 'idle') {
    S.voice.recording = false;
    S.voice.token = 'v' + Date.now();
    voiceSetState('listening', '正在听,请说话…');
    const preferCloud = (() => {
      try { return localStorage.getItem('voicePreferCloud') === '1'; } catch (e) { return false; }
    })();
    try {
      B().startVoice(preferCloud, S.voice.token);
    } catch (e) {
      voiceFallback(e.message || '语音服务不可用');
    }
  } else if (S.voice.state === 'recording') {
    voiceSetState('processing', '识别中…');
    try { B().stopVoice(S.voice.token); } catch (e) { voiceFallback(e.message || '识别失败'); }
  }
  // listening/processing 状态下点击忽略,等回调
});

function voiceFallback(msg) {
  closeVoiceOverlay();
  $('textInput').value = '';
  showErr('textError', msg ? msg + '。可以直接打字,或用输入法的语音输入' : '');
  sheetOpen('sheetText');
  setTimeout(() => { $('textInput').focus(); }, 150);
}
$('voiceRetryBtn').addEventListener('click', () => {
  closeSheet();
  openVoiceOverlay();
});
$('textSubmitBtn').addEventListener('click', () => {
  const text = $('textInput').value.trim();
  if (!text) { showErr('textError', '先写点什么吧'); return; }
  doParse(text, 'sheetText');
});

// 原生回调(校验会话令牌:取消/重开后,迟到的结果一律丢弃)
window.onVoiceState = (token, state) => {
  if (!token || token !== S.voice.token) return;
  if (state === 'listening') voiceSetState('listening', '正在听,请说话…');
  else if (state === 'recording') {
    S.voice.recording = true;
    voiceSetState('recording', '录音中…说完再点一下圆圈结束');
    clearRecCap();
    recCapTimer = setTimeout(() => { // 最长 60 秒自动收尾
      if (S.voice.state === 'recording') {
        voiceSetState('processing', '识别中…');
        try { B().stopVoice(S.voice.token); } catch (e) { voiceFallback('录音超时'); }
      }
    }, 60000);
  } else if (state === 'processing') voiceSetState('processing', '识别中…');
};
window.onVoiceResult = (token, text) => {
  clearRecCap();
  if (!token || token !== S.voice.token) return; // 已取消或已重开
  try {
    localStorage.setItem('voiceFailCount', '0');
    if (S.voice.recording) localStorage.setItem('voicePreferCloud', '1'); // 云端转写成功过就一直走云端
  } catch (e) { /* 忽略 */ }
  closeVoiceOverlay();
  if (text) doParse(text, null);
};
window.onVoiceError = (token, msg, code) => {
  clearRecCap();
  if (!token || token !== S.voice.token) return; // 已取消或已重开
  if (code === 'unavailable') { voiceFallback(msg); return; }
  // 系统识别连续失败 2 次 → 之后默认走云端转写(如果配了)
  try {
    const fails = (+localStorage.getItem('voiceFailCount') || 0) + 1;
    localStorage.setItem('voiceFailCount', String(fails));
    if (fails >= 2) localStorage.setItem('voicePreferCloud', '1');
  } catch (e) { /* 忽略 */ }
  voiceFallback(msg); // 不再只是 toast:给出重试/打字双入口
};

// ================= 解析 → 确认 =================
async function doParse(text, fromSheet) {
  let toastTm = null;
  showToast('解析中…', true);
  try {
    const res = JSON.parse(B().parseText(text));
    if (fromSheet) closeSheet();
    clearTimeout(toastTm);
    $('toast').classList.add('hidden');
    if (res.error) {
      showErr('textError', res.error);
      sheetOpen('sheetText');
      $('textInput').value = text;
      showErr('textError', res.error);
      return;
    }
    if (!res.events || !res.events.length) {
      sheetOpen('sheetText');
      $('textInput').value = text;
      showErr('textError', '没有识别出日程,试着加上时间,如「明天晚上8点…」');
      return;
    }
    S.pending = res.events;
    renderConfirm();
  } catch (e) {
    sheetOpen('sheetText');
    $('textInput').value = text;
    showErr('textError', '解析失败:' + e.message);
  }
}

function renderConfirm() {
  const list = $('confirmList');
  list.innerHTML = '';
  S.pending.forEach((ev, i) => {
    const row = document.createElement('div');
    row.className = 'parsed-event';
    const timeVal = ev.allDay ? '' : dtLocalVal(ev.start);
    row.innerHTML = `
      <div class="pe-head">
        <input data-i="${i}" data-f="title" value="${escapeHtml(ev.title)}" placeholder="标题"/>
        <button class="pe-del" data-i="${i}" aria-label="删除这一条">${icon('trash')}</button>
      </div>
      <div class="ev-row2">
        <input data-i="${i}" data-f="start" type="${ev.allDay ? 'text' : 'datetime-local'}"
               value="${escapeHtml(timeVal)}" placeholder="时间" ${ev.allDay ? 'disabled' : ''}/>
        <input data-i="${i}" data-f="location" value="${escapeHtml(ev.location || '')}" placeholder="地点(可选)"/>
      </div>
      ${ev.allDay ? '<div class="ev-allDay">全天事件(未指定具体时间)</div>' : ''}`;
    list.appendChild(row);
  });
  list.querySelectorAll('input').forEach((input) => {
    input.addEventListener('change', () => {
      const ev = S.pending[+input.dataset.i];
      if (input.dataset.f === 'title') ev.title = input.value;
      if (input.dataset.f === 'location') ev.location = input.value;
      if (input.dataset.f === 'start' && input.value) ev.start = input.value.replace('T', ' ');
    });
  });
  list.querySelectorAll('.pe-del').forEach((btn) => {
    btn.addEventListener('click', () => {
      S.pending.splice(+btn.dataset.i, 1);
      if (!S.pending.length) { closeSheet(); showToast('已全部移除'); return; }
      renderConfirm();
    });
  });
  showErr('quickError', '');
  sheetOpen('sheetQuick');
}
$('quickClose') && ($('quickClose').innerHTML = icon('close'));
$('saveAllBtn').addEventListener('click', () => {
  const valid = S.pending.filter((e) => e.title && e.start);
  if (!valid.length) return;
  const before = S.events.length;
  S.events = JSON.parse(B().addEvents(JSON.stringify(valid)));
  const added = S.events.slice(before);
  S.pending = [];
  closeSheet();
  showToast(`已保存 ${valid.length} 项,提醒已设置 ✓`, true, {
    label: '撤销',
    fn: () => {
      for (const a of added) S.events = JSON.parse(B().deleteEvent(a.id));
      renderTimeline();
      showToast('已撤销');
    },
  });
});
$('discardBtn').addEventListener('click', () => { S.pending = []; closeSheet(); });

// ================= 课程表导入(.ics 文件 / 粘贴文本) =================
function openCourseSheet() {
  $('coursePasteText').value = '';
  showErr('courseError', '');
  $('courseLoading').classList.add('hidden');
  sheetOpen('sheetCourse');
}
$('courseIcsBtn').addEventListener('click', () => {
  try { B().pickIcs(); } catch (e) { showErr('courseError', '无法打开文件选择器,请更新安装包'); }
});
window.onIcsFile = (text) => {
  $('courseLoading').classList.remove('hidden');
  setTimeout(() => {
    $('courseLoading').classList.add('hidden');
    try {
      const parsed = Core.parseIcsCourses(text);
      const ok = parsed.courses.filter((c) => c.ok);
      if (!ok.length) {
        showErr('courseError', '这个 .ics 里没有识别出带时间的课程。请确认是课程表 app 导出的课表文件');
        return;
      }
      S.courseDraft = parsed.courses;
      renderCoursePreview(parsed.semesterStart);
    } catch (e) {
      showErr('courseError', '解析失败:' + (e.message || '文件格式不对'));
    }
  }, 50);
};
$('courseParseBtn').addEventListener('click', () => {
  const text = $('coursePasteText').value.trim();
  if (!text) { showErr('courseError', '先选择 .ics 文件,或粘贴文本'); return; }
  const courses = parsePastedCourses(text);
  const ok = courses.filter((c) => c.ok);
  if (!ok.length) {
    showErr('courseError', '没有解析出课程。确认粘贴的是 AI 输出的完整 JSON,或每行一门课:周一 08:00-09:40 课程名 教室 1-16周');
    return;
  }
  S.courseDraft = courses;
  renderCoursePreview('');
});

/** 粘贴内容 → 课程列表:优先 JSON(容忍围栏/前后废话),否则按行解析 */
function parsePastedCourses(text) {
  const t = String(text || '').trim();
  // 优先定位 {"courses":…}(容忍前面废话里出现花括号)
  const key = t.indexOf('{"courses"');
  const st = key >= 0 ? key : t.indexOf('{');
  const en = t.lastIndexOf('}');
  if (st >= 0 && en > st) {
    try {
      const courses = Core.normalizeCourses(JSON.parse(t.slice(st, en + 1)));
      if (courses.length) return courses;
    } catch (e) { /* 落到行解析 */ }
  }
  return Core.parseCourseLines(t);
}

function renderCoursePreview(defaultSemStart) {
  const list = $('coursePreviewList');
  list.innerHTML = '';
  S.courseDraft.forEach((c, i) => {
    const row = document.createElement('div');
    row.className = 'course-row' + (c.ok ? '' : ' bad');
    if (!c.ok) {
      row.innerHTML = `<label class="cr-check"><input type="checkbox" disabled/></label>
        <div class="cr-main"><div class="cr-title">${escapeHtml(c.title || '(未识别)')}</div>
        <div class="cr-sub error-text">${escapeHtml(c.problem)}</div></div>`;
      list.appendChild(row);
      return;
    }
    const dowOpts = [1, 2, 3, 4, 5, 6, 7].map((n) =>
      `<option value="${n}" ${c.weekday === n ? 'selected' : ''}>周${'一二三四五六日'[n - 1]}</option>`).join('');
    const wkStr = c.weeks ? `${c.weeks[0]}-${c.weeks[1]}` : '';
    row.innerHTML = `
      <label class="cr-check"><input type="checkbox" data-i="${i}" checked/></label>
      <div class="cr-main">
        <input class="cr-title" data-i="${i}" data-f="title" value="${escapeHtml(c.title)}"/>
        <div class="ev-row2">
          <select data-i="${i}" data-f="weekday">${dowOpts}</select>
          <input data-i="${i}" data-f="start" type="time" value="${c.start}"/>
          <input data-i="${i}" data-f="end" type="time" value="${c.end}"/>
        </div>
        <div class="ev-row2">
          <input data-i="${i}" data-f="location" value="${escapeHtml(c.location)}" placeholder="教室"/>
          <input data-i="${i}" data-f="weeks" value="${wkStr}" placeholder="周次如 1-16"/>
          <select data-i="${i}" data-f="parity">
            <option value="all" ${c.parity === 'all' ? 'selected' : ''}>每周</option>
            <option value="odd" ${c.parity === 'odd' ? 'selected' : ''}>单周</option>
            <option value="even" ${c.parity === 'even' ? 'selected' : ''}>双周</option>
          </select>
        </div>
        ${c.teacher ? `<div class="cr-sub">授课:${escapeHtml(c.teacher)}</div>` : ''}
      </div>`;
    list.appendChild(row);
  });
  list.querySelectorAll('input[data-f],select[data-f]').forEach((inp) => {
    inp.addEventListener('change', () => {
      const c = S.courseDraft[+inp.dataset.i];
      const f = inp.dataset.f;
      if (f === 'title') c.title = inp.value.trim();
      if (f === 'weekday') c.weekday = +inp.value;
      if (f === 'start') c.start = inp.value || c.start;
      if (f === 'end') c.end = inp.value;
      if (f === 'location') c.location = inp.value.trim();
      if (f === 'parity') c.parity = inp.value;
      if (f === 'weeks') {
        const m = /^(\d+)\s*[-–~]\s*(\d+)$/.exec(inp.value.trim());
        c.weeks = m ? [Math.max(1, +m[1]), Math.min(40, +m[2])] : null;
        inp.value = c.weeks ? c.weeks.join('-') : '';
      }
    });
  });
  // 默认学期开始:ics 锚点 > 设置里的值 > 本周一
  $('semesterStart').value = defaultSemStart
    || (S.settings.school && S.settings.school.semesterStart)
    || Core.mondayOf(Core.todayStr());
  // 替换提示
  const oldCount = S.events.filter((e) => e.source === 'timetable').length;
  showErr('courseError', '');
  sheetOpen('sheetCoursePreview');
  const tip = $('courseReplaceTip');
  if (tip) tip.textContent = oldCount ? `导入后将替换现有课程表的 ${oldCount} 条课程` : '';
}
$('courseImportBtn').addEventListener('click', () => {
  const checks = document.querySelectorAll('#coursePreviewList input[type="checkbox"]:checked');
  const semStart = $('semesterStart').value || (S.settings.school && S.settings.school.semesterStart) || Core.mondayOf(Core.todayStr());
  const picked = [];
  checks.forEach((c) => picked.push(S.courseDraft[+c.dataset.i]));
  const events = picked.map((c) => Core.courseToEvent(c, semStart));
  if (!events.length) { showToast('至少勾选一门课程'); return; }
  // 重导课表 = 替换之前导入的全部课程,避免堆积重复
  const old = S.events.filter((e) => e.source === 'timetable');
  for (const e of old) S.events = JSON.parse(B().deleteEvent(e.id));
  S.events = JSON.parse(B().addEvents(JSON.stringify(events)));
  // 记住学期锚点,下次导入与设置页共用
  saveSettingsRaw({ school: Object.assign({}, S.settings.school, { semesterStart: semStart }) });
  closeSheet();
  switchMode('day');
  S.view.day = Core.todayStr();
  renderTimeline();
  showToast(old.length
    ? `已替换旧课程表,导入 ${events.length} 门课程 ✓`
    : `已导入 ${events.length} 门课程 ✓`);
});


// ================= 外观 =================
function openAppearanceSheet() {
  const ap = S.settings.appearance || {};
  syncSeg('themeSeg', ap.theme || 'day');
  syncSeg('fmtSeg', ap.timeFormat || '24h');
  sheetOpen('sheetAppearance');
}
function syncSeg(segId, activeVal) {
  const seg = $(segId);
  seg.querySelectorAll('.seg-btn').forEach((b) => {
    const v = b.dataset.theme !== undefined ? b.dataset.theme : b.dataset.fmt;
    b.classList.toggle('active', v === activeVal);
  });
}
$('themeSeg').addEventListener('click', (e) => {
  const b = e.target.closest('.seg-btn'); if (!b) return;
  saveSettingsRaw({ appearance: Object.assign({}, S.settings.appearance, { theme: b.dataset.theme }) });
  syncSeg('themeSeg', b.dataset.theme);
});
$('fmtSeg').addEventListener('click', (e) => {
  const b = e.target.closest('.seg-btn'); if (!b) return;
  saveSettingsRaw({ appearance: Object.assign({}, S.settings.appearance, { timeFormat: b.dataset.fmt }) });
  syncSeg('fmtSeg', b.dataset.fmt);
  renderTimeline();
});
$('bgPickBtn').addEventListener('click', () => {
  try { B().pickImage('bg'); } catch (e) { showToast('无法打开相册'); }
});
window.onImagePicked = (path) => {
  saveSettingsRaw({ appearance: Object.assign({}, S.settings.appearance, { bgPath: path }) });
  closeSheet();
  showToast('背景已更换');
};
window.onImagePickError = (msg) => showToast('选图失败:' + msg, true);
$('bgClearBtn').addEventListener('click', () => {
  saveSettingsRaw({ appearance: Object.assign({}, S.settings.appearance, { bgPath: '' }) });
  closeSheet();
  showToast('已恢复默认背景');
});

// ================= 设置页 =================
function loadSettingsTab() {
  const s = S.settings;
  const llm = s.llm || {}, asr = s.asr || {}, r = s.reminder || {}, sch = s.school || {};
  $('llmBaseUrl').value = llm.baseUrl || '';
  $('llmApiKey').value = llm.apiKey || '';
  $('llmModel').value = llm.model || 'deepseek-chat';
  $('asrBaseUrl').value = asr.baseUrl || '';
  $('asrApiKey').value = asr.apiKey || '';
  $('asrModel').value = asr.model || '';
  $('leadMinutes').value = r.defaultLeadMinutes || 60;
  $('digestTime').value = r.digestTime || '21:30';
  $('digestEnabled').checked = r.digestEnabled !== false;
  $('semesterStartSetting').value = sch.semesterStart || '';
  // 语音链路状态(PRD §6)
  let preferCloud = false;
  try { preferCloud = localStorage.getItem('voicePreferCloud') === '1'; } catch (e) { /* 忽略 */ }
  $('voiceModeHint').textContent = preferCloud
    ? '当前优先使用云端转写(系统识别多次失败后已自动切换)。若系统识别已恢复,可重置'
    : '当前优先使用手机自带语音识别,不可用时自动降级';
  $('resetVoiceMode').classList.toggle('hidden', !preferCloud);
  let can = true;
  try { can = B().canExactAlarm(); } catch (e) { /* 浏览器 */ }
  $('exactHint').textContent = can
    ? '✓ 精确提醒已授权,提醒会准点送达'
    : '⚠️ 未授权「闹钟和提醒」,提醒可能延迟。点顶部警告条去授权';
}

function collectSettings() {
  return {
    llm: {
      baseUrl: $('llmBaseUrl').value.trim(),
      apiKey: $('llmApiKey').value.trim(),
      model: $('llmModel').value.trim() || 'deepseek-chat',
    },
    asr: {
      baseUrl: $('asrBaseUrl').value.trim(),
      apiKey: $('asrApiKey').value.trim(),
      model: $('asrModel').value.trim(),
    },
    reminder: {
      defaultLeadMinutes: Math.max(0, +$('leadMinutes').value || 60),
      digestTime: $('digestTime').value || '21:30',
      digestEnabled: $('digestEnabled').checked,
    },
    school: {
      semesterStart: $('semesterStartSetting').value || '',
    },
  };
}
$('saveSettingsBtn').addEventListener('click', () => {
  saveSettingsRaw(collectSettings());
  showToast('设置已保存 ✓');
  loadSettingsTab();
});
$('resetVoiceMode').addEventListener('click', () => {
  try { localStorage.removeItem('voicePreferCloud'); localStorage.setItem('voiceFailCount', '0'); } catch (e) { /* 忽略 */ }
  loadSettingsTab();
  showToast('已恢复系统语音优先');
});
// LLM 连通测试
$('testLlmBtn').addEventListener('click', () => {
  saveSettingsRaw(collectSettings());
  const el = $('llmTestResult');
  el.classList.remove('hidden');
  el.textContent = '测试中…';
  setTimeout(() => {
    try {
      const r = String(B().testLlm());
      el.textContent = r.startsWith('ok') ? '✓ 连通正常(' + r.slice(3) + ')' : '✗ ' + r;
    } catch (e) {
      el.textContent = '✗ ' + e.message;
    }
  }, 60);
});

// 桌面小组件排查
$('widgetHelpBtn').addEventListener('click', () => {
  const el = $('widgetHelpBtn');
  const tip = document.getElementById('widgetHelpTip');
  if (!tip) return;
  tip.classList.remove('hidden');
});

// 数据导出/导入/清空
$('exportDataBtn').addEventListener('click', () => {
  const el = $('dataMsg');
  el.classList.remove('hidden');
  try {
    const r = String(B().exportData());
    el.textContent = r.startsWith('/') ? '✓ 已导出到 ' + r : r;
  } catch (e) { el.textContent = '✗ ' + e.message; }
});
$('importDataBtn').addEventListener('click', () => {
  try { B().pickBackup(); } catch (e) { showToast('无法打开文件选择器'); }
});
window.onBackupFile = (text) => {
  try {
    const preview = JSON.parse(text);
    if (!preview.version || !Array.isArray(preview.events)) {
      showToast('不是有效的备份文件(缺版本号或日程数据)', true); return;
    }
    const cnt = preview.events.length;
    if (!window.__importArmed) {
      window.__importArmed = true;
      showToast('将覆盖现有全部日程,共 ' + cnt + ' 条;再点一次「导入备份」确认', true);
      setTimeout(() => { window.__importArmed = false; }, 5000);
      return;
    }
    window.__importArmed = false;
    const n = B().importAll(text);
    if (n < 0) { showToast('导入失败:文件格式不对', true); return; }
    S.events = JSON.parse(B().getEvents());
    S.settings = JSON.parse(B().getSettings());
    applyTheme(); applyBg(); renderTimeline(); loadSettingsTab();
    showToast(`已导入 ${n} 条日程 ✓`);
  } catch (e) { showToast('导入失败:' + e.message, true); }
};
let clearArmed = false;
$('clearDataBtn').addEventListener('click', () => {
  if (!clearArmed) {
    clearArmed = true;
    $('clearDataBtn').textContent = '再点一次确认清空';
    setTimeout(() => { clearArmed = false; $('clearDataBtn').textContent = '清空全部日程'; }, 3000);
    return;
  }
  const n = B().clearEvents();
  S.events = JSON.parse(B().getEvents());
  clearArmed = false;
  $('clearDataBtn').textContent = '清空全部日程';
  renderTimeline();
  showToast(`已清空 ${n} 条日程`);
});

$('testNotifyBtn').addEventListener('click', () => {
  saveSettingsRaw(collectSettings());
  B().testNotify();
  showToast('测试通知已发送,看通知栏');
});

// ================= 启动 =================
function fillStaticIcons() {
  document.querySelectorAll('[data-icon]').forEach((el) => {
    if (!el.firstChild) el.innerHTML = icon(el.dataset.icon);
  });
}

function refreshWarnBar() {
  let canExact = true, canNotify = true;
  try { canExact = B().canExactAlarm(); } catch (e) { /* 忽略 */ }
  try { canNotify = B().canNotify(); } catch (e) { /* 忽略 */ }
  S.warnExact = !canExact;
  const msgs = [];
  if (!canExact) msgs.push('未授权「闹钟和提醒」,提醒可能延迟');
  if (!canNotify) msgs.push('未开通知权限,提醒不会显示');
  $('warnText').textContent = msgs.join(';');
  $('warnBar').classList.toggle('hidden', msgs.length === 0);
}

function init() {
  try {
    S.settings = JSON.parse(B().getSettings());
    S.events = JSON.parse(B().getEvents());
  } catch (e) {
    S.settings = {}; S.events = [];
  }
  applyTheme();
  applyBg();
  fillStaticIcons();
  refreshWarnBar();
  renderTimeline();
  loadSettingsTab();
  // 原生侧可能改了数据(通知/小组件路径),回到前台时刷新
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      try { S.events = JSON.parse(B().getEvents()); } catch (e) { /* 忽略 */ }
      refreshWarnBar();
      renderTimeline();
    }
  });
}

// 通知深链:点提醒通知跳到那一天
window.onDeepLink = (day) => {
  gotoPage('timeline');
  S.view.day = day;
  switchMode('day');
};
init();
