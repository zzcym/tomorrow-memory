/** 明日日程 · 纯逻辑核心(无 DOM 依赖,可被 Node 单测;浏览器与原生 Java 侧各有一份等价实现) */
'use strict';

const Core = (() => {
  const pad2 = (n) => String(n).padStart(2, '0');
  const DOW_CN = ['一', '二', '三', '四', '五', '六', '日']; // 1=周一 … 7=周日

  function dateStr(d) {
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }
  function todayStr() { return dateStr(new Date()); }

  function parseDay(s) {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  function addDays(day, n) {
    const d = parseDay(day);
    d.setDate(d.getDate() + n);
    return dateStr(d);
  }
  /** 1=周一 … 7=周日 */
  function dowOf(day) {
    const w = parseDay(day).getDay();
    return w === 0 ? 7 : w;
  }
  function mondayOf(day) { return addDays(day, 1 - dowOf(day)); }

  function minutesOf(hhmm) {
    const [h, m] = hhmm.split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
  }
  function hhmmOf(min) {
    min = Math.max(0, Math.min(24 * 60, Math.round(min)));
    return `${pad2(Math.floor(min / 60))}:${pad2(min % 60)}`;
  }

  /** 12h 制中文时段:凌晨/上午/中午/下午/晚上 */
  function fmtTime(hhmm, use12) {
    if (!hhmm || !/^\d{1,2}:\d{2}/.test(hhmm)) return hhmm || '';
    const [h, m] = hhmm.split(':').map(Number);
    if (!use12) return `${pad2(h)}:${pad2(m)}`;
    const period = h < 6 ? '凌晨' : h < 12 ? '上午' : h === 12 ? '中午' : h < 18 ? '下午' : '晚上';
    let h12 = h % 12;
    if (h12 === 0) h12 = 12;
    return `${period}${h12}:${pad2(m)}`;
  }
  function fmtDateCN(day) {
    const d = parseDay(day);
    return `${d.getMonth() + 1}月${d.getDate()}日`;
  }

  const DT_RE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/;

  /** 跨天事件的延续日列表;不跨天返回 null。恰在 00:00 结束 = 占满前一天,延续到 endDay 前一天 */
  function crossDayEnds(start, end) {
    if (!end || end.length < 10) return null;
    const sd = start.slice(0, 10), ed = end.slice(0, 10);
    if (ed <= sd) return null;
    const last = end.endsWith(' 00:00') ? addDays(ed, -1) : ed;
    const days = [];
    for (let d = addDays(sd, 1); d <= last; d = addDays(d, 1)) days.push(d);
    return days.length ? days : null; // 跨午夜 1 小时内结束:无延续日,不算跨天
  }

  /** 展开单个事件在 [fromDay, toDay](闭区间,按日期)的发生 */
  function expandEvent(e, fromDay, toDay) {
    const out = [];
    if (!e) return out;
    const r = e.recur;
    if (!r || r.freq !== 'weekly') {
      if (!e.start) return out;
      const day = e.start.slice(0, 10);
      if (day >= fromDay && day <= toDay) out.push(occOf(e, day, 0));
      // 跨天事件:为后续每一天生成全天延续(PRD §1.4;恰在 00:00 结束=占满前一天)
      const end = e.end || '';
      const contDays = crossDayEnds(e.start, end);
      if (contDays) {
        for (const d of contDays) {
          if (d < fromDay || d > toDay) continue;
          out.push(contOcc(e, d));
        }
      }
      return out;
    }
    const semStart = /^\d{4}-\d{2}-\d{2}$/.test(r.semesterStart || '')
      ? r.semesterStart : mondayOf(todayStr());
    const weeks = Array.isArray(r.weeks) && r.weeks.length === 2
      ? [Math.max(1, r.weeks[0] | 0), Math.min(40, r.weeks[1] | 0)] : [1, 25];
    const parity = r.parity === 'odd' || r.parity === 'even' ? r.parity : 'all';
    const wd = (r.weekday | 0);
    const weekday = wd >= 1 && wd <= 7 ? wd : 1; // 与 Java 侧缺省一致
    const exWeeks = Array.isArray(r.exWeeks) ? r.exWeeks : [];
    for (let wk = weeks[0]; wk <= weeks[1]; wk++) {
      if (parity === 'odd' && wk % 2 === 0) continue;
      if (parity === 'even' && wk % 2 === 1) continue;
      if (exWeeks.indexOf(wk) >= 0) continue; // 停课周(ics EXDATE)
      const day = addDays(semStart, (wk - 1) * 7 + (weekday - 1));
      if (day < fromDay || day > toDay) continue;
      out.push(occOf(e, day, wk));
    }
    return out;
  }

  function occOf(e, day, weekNo) {
    const r = e.recur;
    if (r && r.freq === 'weekly') {
      const start = `${day} ${/^\d{1,2}:\d{2}/.test(r.start || '') ? normHm(r.start) : '00:00'}`;
      const end = r.end ? `${day} ${normHm(r.end)}` : '';
      return {
        eventId: e.id, day, weekNo: weekNo || 0, start, end,
        allDay: false, title: e.title || '', location: e.location || '',
        notes: e.notes || '', remindMinutes: e.remindMinutes,
      };
    }
    const start = e.start;
    return {
      eventId: e.id, day, weekNo: 0, start,
      end: e.end || '', allDay: !!e.allDay || !DT_RE.test(start),
      title: e.title || '', location: e.location || '', notes: e.notes || '',
      remindMinutes: e.remindMinutes,
    };
  }

  function normHm(s) {
    const m = /^(\d{1,2}):(\d{2})/.exec(s || '');
    if (!m) return '00:00';
    return `${pad2(Math.min(23, +m[1]))}:${pad2(Math.min(59, +m[2]))}`;
  }

  /** 跨天事件的"延续日"占位(全天,不重复提醒) */
  function contOcc(e, day) {
    return {
      eventId: e.id, day, weekNo: 0, cont: true,
      start: `${day} 00:00`, end: '',
      allDay: true, title: e.title || '',
      location: e.location || '', notes: e.notes || '',
    };
  }

  /** [fromDay, toDay] 内全部发生,按开始时间排序(全天在最前) */
  function occurrences(events, fromDay, toDay) {
    const list = [];
    for (const e of events || []) list.push(...expandEvent(e, fromDay, toDay));
    list.sort((a, b) => {
      if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
      return a.start.localeCompare(b.start);
    });
    return list;
  }

  /** 重叠事件分列(贪心,最多 3 列,更窄的归并到第 3 列);occs 须已按 start 排序;内部按天分组,跨天互不影响 */
  function layoutColumns(occs) {
    const MAX_COLS = 3;
    const marks = occs.map(() => ({ col: 0, cols: 1 }));
    // 按天分组(周视图混排多天,只比较当天时刻)
    const byDay = new Map();
    occs.forEach((o, i) => {
      const d = o.start.slice(0, 10);
      if (!byDay.has(d)) byDay.set(d, []);
      byDay.get(d).push(i);
    });
    for (const idxs of byDay.values()) {
      let cluster = [];
      let clusterEnd = -1;
      const flush = () => {
        if (!cluster.length) return;
        const colEnd = []; // 每列最晚 end(分钟)
        for (const i of cluster) {
          const s = minutesOf(occs[i].start.slice(11) || '00:00');
          const e = Math.max(s + 20, occs[i].end ? minutesOf(occs[i].end.slice(11)) : s + 60);
          let c = colEnd.findIndex((t) => t <= s);
          if (c < 0) { c = colEnd.length; colEnd.push(e); } else colEnd[c] = e;
          marks[i].col = Math.min(c, MAX_COLS - 1);
        }
        for (const i of cluster) marks[i].cols = Math.min(colEnd.length, MAX_COLS);
        cluster = [];
        clusterEnd = -1;
      };
      for (const i of idxs) {
        const o = occs[i];
        const s = minutesOf(o.start.slice(11) || '00:00');
        if (cluster.length && s >= clusterEnd) flush();
        cluster.push(i);
        const e = Math.max(s + 20, o.end ? minutesOf(o.end.slice(11)) : s + 60);
        clusterEnd = Math.max(clusterEnd, e);
      }
      flush();
    }
    return marks;
  }

  // ============ 课程表 JSON 归一化(宽容解析 AI 输出) ============
  // 契约:{courses:[{name, weekday, start:"08:00", end:"09:40", location?, teacher?, weeks:[1,16], parity?}]}
  function normalizeCourses(raw) {
    let list = raw;
    if (raw && !Array.isArray(raw) && Array.isArray(raw.courses)) list = raw.courses;
    if (!Array.isArray(list)) return [];
    const out = [];
    for (const c of list) {
      if (!c || typeof c !== 'object') continue;
      const title = str(c.name || c.title || c.course || c.courseName);
      const weekday = normWeekday(c.weekday ?? c.week_day ?? c.day ?? c.dayOfWeek);
      const start = normHm(str(c.start || c.startTime || c.begin));
      const endRaw = str(c.end || c.endTime || c.finish);
      const end = endRaw ? normHm(endRaw) : ''; // 缺 end 保持空,布局层默认 1 小时
      if (!title) {
        if (!weekday && !start) continue; // 空行,忽略
        out.push({ ok: false, title: '', problem: '缺课程名' });
        continue;
      }
      if (!weekday || !start) {
        out.push({ ok: false, title, problem: '缺少上课星期或时间' });
        continue;
      }
      const weeksRaw = c.weeks ?? c.weekRange ?? c.week;
      let weeks = null;
      if (Array.isArray(weeksRaw) && weeksRaw.length >= 2 && +weeksRaw[1] >= +weeksRaw[0]) {
        weeks = [Math.max(1, +weeksRaw[0] | 0), Math.min(40, +weeksRaw[1] | 0)];
      }
      const parity = (c.parity === 'odd' || c.parity === 'single' || c.parity === '单'
        || c.parity === '单周') ? 'odd'
        : (c.parity === 'even' || c.parity === 'double' || c.parity === '双'
          || c.parity === '双周') ? 'even' : 'all';
      out.push({
        ok: true, title, weekday, start, end,
        location: str(c.location || c.room || c.place || c.classroom),
        teacher: str(c.teacher),
        weeks, parity,
        problem: '',
      });
    }
    return out;
  }

  function str(s) { return typeof s === 'string' ? s.trim() : (s == null ? '' : String(s).trim()); }

  function normWeekday(v) {
    const n = typeof v === 'string'
      ? ({ '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '日': 7, '天': 7 }[v.replace('周', '').trim()] ?? parseInt(v, 10))
      : parseInt(v, 10);
    return n >= 1 && n <= 7 ? n : 0;
  }

  /** 纯文本行解析:每行一门课,如「周一 08:00-09:40 高等数学 教三-201 1-16周 单周」 */
  function parseCourseLines(text) {
    const DOW = { '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '日': 7, '天': 7 };
    const out = [];
    for (let line of String(text || '').split(/\n+/)) {
      line = line.trim().replace(/^[-*•\d.、\s]+/, '');
      if (!line) continue;
      let weekday = 0, start = '', end = '', weeks = null, parity = 'all';
      const wm = /周\s*([一二三四五六日天])/.exec(line) || /^([一二三四五六日天])(?=\s|$)/.exec(line);
      if (wm) weekday = DOW[wm[1]] || 0;
      const tm = /(\d{1,2})\s*[:：点]\s*(\d{2})?\s*[-–—~～至]\s*(\d{1,2})\s*[:：点]?\s*(\d{2})?/.exec(line);
      if (tm) {
        start = normHm(tm[1] + ':' + (tm[2] || '00'));
        end = normHm(tm[3] + ':' + (tm[4] || '00'));
      }
      const wkm = /(\d{1,2})\s*[-–—~～]\s*(\d{1,2})\s*周/.exec(line);
      if (wkm) weeks = [Math.max(1, +wkm[1] | 0), Math.min(40, +wkm[2] | 0)];
      if (/单周/.test(line)) parity = 'odd';
      if (/双周/.test(line)) parity = 'even';
      if (!weekday || !start) {
        out.push({ ok: false, title: line.slice(0, 24), problem: '缺星期或时间(格式:周一 08:00-09:40 课程名 教室 1-16周)' });
        continue;
      }
      let rest = line
        .replace(/周\s*[一二三四五六日天]/, ' ')
        .replace(/^([一二三四五六日天])(?=\s|$)/, ' ')
        .replace(/(\d{1,2})\s*[:：点]\s*(\d{2})?\s*[-–—~～至]\s*(\d{1,2})\s*[:：点]?\s*(\d{2})?/, ' ')
        .replace(/\d{1,2}\s*[-–—~～]\s*\d{1,2}\s*周/, ' ')
        .replace(/第\s*\d+\s*[-–~]\s*\d+\s*节/, ' ')
        .replace(/单周|双周/g, ' ')
        .replace(/[,，;；、|【】\[\]()()]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      const parts = rest.split(' ').filter(Boolean);
      out.push({
        ok: true,
        title: parts[0] || '(未命名)',
        weekday, start, end,
        location: parts.slice(1).join(' ') || '',
        teacher: '',
        weeks, parity,
        problem: '',
      });
    }
    return out;
  }

  /** 解析 .ics 日历文本 → 课程行(面向课表导出:VEVENT + WEEKLY RRULE)。
   *  锚点:取全部首发生日的最早周一作默认 semesterStart,周次相对它计算。 */
  function parseIcsCourses(text) {
    // 1. 行展开(续行以空格/Tab 开头)
    const raw = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const lines = [];
    for (const ln of raw.split('\n')) {
      if (/^[ \t]/.test(ln) && lines.length) lines[lines.length - 1] += ln.slice(1);
      else lines.push(ln);
    }
    // 2. 收集 VEVENT
    const events = [];
    let cur = null;
    let skipSub = false;
    for (const ln of lines) {
      const t = ln.trim();
      if (t === 'BEGIN:VEVENT') { cur = { exdates: [] }; skipSub = false; continue; }
      if (t === 'END:VEVENT') { if (cur) events.push(cur); cur = null; skipSub = false; continue; }
      if (!cur) continue;
      if (t === 'BEGIN:VALARM') { skipSub = true; continue; }
      if (t === 'END:VALARM') { skipSub = false; continue; }
      if (skipSub) continue; // 闹钟子组件的属性不覆盖事件本身
      const m = /^([A-Za-z-]+)(?:;[^:]*)?:([\s\S]*)$/.exec(t);
      if (!m) continue;
      const key = m[1].toUpperCase();
      const val = m[2].trim();
      if (key === 'DTSTART') cur.dtstart = icsDate(val);
      else if (key === 'DTEND') cur.dtend = icsDate(val);
      else if (key === 'DURATION') cur.duration = parseDuration(val);
      else if (key === 'SUMMARY') cur.summary = icsText(val);
      else if (key === 'LOCATION') cur.location = icsText(val);
      else if (key === 'DESCRIPTION') cur.description = icsText(val);
      else if (key === 'RRULE') cur.rrule = parseRrule(val);
      else if (key === 'EXDATE') {
        for (const part of val.split(',')) { const d = icsDate(part.trim()); if (d) cur.exdates.push(d); }
      }
    }
    // 3. 转课程行(semesterStart 锚 = 最早首发生日的周一)
    let anchor = null;
    for (const ev of events) {
      if (!ev.dtstart || !ev.dtstart.dateTime) continue; // 全天/无时间 → 非课程
      if (!anchor || ev.dtstart.day < anchor) anchor = ev.dtstart.day;
    }
    const semStart = anchor ? mondayOf(anchor) : mondayOf(todayStr());
    const out = [];
    for (const ev of events) {
      if (!ev.dtstart || !ev.dtstart.dateTime) continue;
      const r = ev.rrule || {};
      const day = ev.dtstart.day;
      const weekday = r.byday || dowOf(day);
      const start = ev.dtstart.hm;
      const end = ev.dtend && ev.dtend.hm ? ev.dtend.hm
        : ev.duration ? hmAdd(start, ev.duration) : hmAdd(start, 90);
      const step = r.interval >= 2 ? r.interval : 1;
      const w1 = weekNoOf(day, semStart);
      let w2 = w1;
      if (!ev.rrule || r.count === 1) w2 = w1;        // 无 RRULE/COUNT=1:单次课
      else if (r.count >= 1) w2 = w1 + (r.count - 1) * step;
      else if (r.until) w2 = weekNoOf(r.until, semStart);
      else w2 = w1 + 17; // 无限重复按一学期 18 周封顶
      let parity = 'all';
      if (step === 2) parity = (w1 % 2 === 1) ? 'odd' : 'even';
      // EXDATE:被排除日期 → 停课周号(同周内即剔除)
      const exWeeks = [];
      for (const d of ev.exdates) {
        if (!d) continue;
        const w = weekNoOf(d.day, semStart);
        if (w >= w1 && w <= w2 && exWeeks.indexOf(w) < 0) exWeeks.push(w);
      }
      out.push({
        ok: true,
        title: ev.summary || '(未命名)',
        weekday: Math.min(7, Math.max(1, weekday)),
        start, end,
        location: ev.location || '',
        teacher: (ev.description || '').split(/[\\n,，;；/]/)[0].slice(0, 20) || '',
        weeks: [Math.max(1, w1), Math.min(40, w2)],
        parity,
        exWeeks: exWeeks.length ? exWeeks : undefined,
        problem: '',
      });
    }
    return { courses: out, semesterStart: semStart };
  }

  function icsDate(val) {
    if (!val) return null;
    const utc = /[Zz]$/.test(val.trim());
    const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?)?/.exec(val.trim());
    if (!m) return null;
    let day = `${m[1]}-${m[2]}-${m[3]}`;
    let hm = m[4] ? `${m[4]}:${m[5] || '00'}` : null;
    if (utc && hm) {
      // UTC → 本地(课表只关心本地时分)
      const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +(m[5] || 0)));
      day = dateStr(d);
      hm = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
    }
    return { day, hm, dateTime: !!m[4] };
  }

  function icsText(val) {
    return val.replace(/\\n/g, ' ').replace(/\\,/g, ',').replace(/\\;/g, ';').trim();
  }

  function parseDuration(val) {
    const m = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?/.exec(val || '');
    if (!m) return 60;
    return (+m[1] || 0) * 1440 + (+m[2] || 0) * 60 + (+m[3] || 0);
  }

  function parseRrule(val) {
    const out = { byday: 0, interval: 1, count: 0, until: '' };
    for (const part of String(val || '').split(';')) {
      const eq = part.indexOf('=');
      if (eq < 0) continue;
      const k = part.slice(0, eq).trim().toUpperCase();
      const v = part.slice(eq + 1).trim();
      if (k === 'FREQ' && v.toUpperCase() !== 'WEEKLY') continue; // 非 WEEKLY 的课程行按单次处理
      if (k === 'INTERVAL') out.interval = Math.max(1, +v || 1);
      else if (k === 'COUNT') out.count = +v || 0;
      else if (k === 'UNTIL') { const d = icsDate(v); if (d) out.until = d.day; }
      else if (k === 'BYDAY') {
        const map = { MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6, SU: 7 };
        const first = v.split(',')[0].trim().toUpperCase().slice(-2);
        out.byday = map[first] || 0;
      }
    }
    return out;
  }

  function weekNoOf(day, semesterStart) {
    const diff = Math.round((parseDay(day) - parseDay(semesterStart)) / 86400000);
    return Math.floor(diff / 7) + 1;
  }

  function hmAdd(hm, minutes) {
    const total = minutesOf(hm) + minutes;
    return `${pad2(Math.min(23, Math.floor(total / 60)))}:${pad2(total % 60)}`;
  }

  /** 课程(归一化后) → 重复事件;semesterStart = 第一周周一的日期 */
  function courseToEvent(c, semesterStart) {
    const ev = {
      title: c.title,
      source: 'timetable',
      recur: {
        freq: 'weekly',
        weekday: c.weekday,
        start: c.start,
        end: c.end || '',
        semesterStart,
        weeks: c.weeks || [1, 25],
        parity: c.parity || 'all',
        ...(c.exWeeks && c.exWeeks.length ? { exWeeks: c.exWeeks } : {}),
      },
    };
    if (c.location) ev.location = c.location;
    if (c.teacher) ev.notes = c.teacher;
    return ev;
  }

  return {
    pad2, DOW_CN, dateStr, todayStr, parseDay, addDays, dowOf, mondayOf,
    minutesOf, hhmmOf, fmtTime, fmtDateCN, expandEvent, occurrences,
    normalizeCourses, parseCourseLines, parseIcsCourses, courseToEvent, crossDayEnds, contOcc, layoutColumns,
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Core;
