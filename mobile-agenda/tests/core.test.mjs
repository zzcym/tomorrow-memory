/** 核心逻辑单测:node tests/core.test.mjs */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const Core = require('../assets/core.js');

let pass = 0, fail = 0;
function eq(actual, expected, label) {
  const a = JSON.stringify(actual), b = JSON.stringify(expected);
  if (a === b) { pass++; }
  else { fail++; console.error(`✗ ${label}\n  期望: ${b}\n  实际: ${a}`); }
}

// ---- 日期工具 ----
eq(Core.dowOf('2026-09-07'), 1, '2026-09-07 是周一');
eq(Core.dowOf('2026-09-13'), 7, '2026-09-13 是周日');
eq(Core.mondayOf('2026-09-07'), '2026-09-07', '周一是自己');
eq(Core.mondayOf('2026-09-12'), '2026-09-07', '周六所在周的周一');
eq(Core.addDays('2026-09-07', 6), '2026-09-13', '加 6 天');
eq(Core.addDays('2026-09-30', 7), '2026-10-07', '跨月');
eq(Core.fmtTime('20:00', true), '晚上8:00', '12h 晚八');
eq(Core.fmtTime('08:00', true), '上午8:00', '12h 早八');
eq(Core.fmtTime('12:30', true), '中午12:30', '12h 中午');
eq(Core.fmtTime('00:15', true), '凌晨12:15', '12h 凌晨(遵循手机惯例)');
eq(Core.fmtTime('18:00', false), '18:00', '24h 原样');

// ---- 一次性事件展开 ----
const events = [
  { id: 'a', title: '和小王吃饭', start: '2026-09-08 20:00', end: '2026-09-08 22:00', location: '三里屯' },
  { id: 'b', title: '全天事项', start: '2026-09-08 00:00', allDay: true },
  { id: 'a2', title: '范围外', start: '2026-09-20 10:00' },
];
let occs = Core.occurrences(events, '2026-09-08', '2026-09-08');
eq(occs.length, 2, '当天 2 条');
eq(occs[0].title, '全天事项', '全天排最前');
eq(occs[1].start, '2026-09-08 20:00', '时间正确');
occs = Core.occurrences(events, '2026-09-09', '2026-09-09');
eq(occs.length, 0, '第二天没有');

// ---- 课程(周重复)展开 ----
const courses = [
  {
    id: 'c1', title: '高等数学', source: 'timetable',
    recur: { freq: 'weekly', weekday: 1, start: '08:00', end: '09:40', semesterStart: '2026-09-07', weeks: [1, 16], parity: 'all' },
  },
  {
    id: 'c2', title: '大学英语·单周', source: 'timetable',
    recur: { freq: 'weekly', weekday: 3, start: '10:00', end: '11:40', semesterStart: '2026-09-07', weeks: [1, 16], parity: 'odd' },
  },
  {
    id: 'c3', title: '体育·双周', source: 'timetable',
    recur: { freq: 'weekly', weekday: 5, start: '16:00', end: '17:40', semesterStart: '2026-09-07', weeks: [1, 16], parity: 'even' },
  },
];
occs = Core.occurrences(courses, '2026-09-07', '2026-09-07');
eq(occs.length, 1, '第1周周一:只有高数');
eq(occs[0].start, '2026-09-07 08:00', '高数周一早八');
eq(occs[0].weekNo, 1, '第 1 周');
occs = Core.occurrences(courses, '2026-09-09', '2026-09-11');
eq(occs.length, 1, '周三单周英语有,周五双周体育无');
eq(occs[0].title, '大学英语·单周', '单周英语');
eq(occs[0].weekNo, 1, '第 1 周是单周');
occs = Core.occurrences(courses, '2026-09-10', '2026-09-11');
eq(occs.length, 0, '第 1 周周五:体育(双周)不上');
// 第 2 周(09-14~09-18)
occs = Core.occurrences(courses, '2026-09-14', '2026-09-18');
eq(occs.map((o) => o.title), ['高等数学', '体育·双周'], '第 2 周:高数+体育,单周英语无');
// 第 17 周(超出 weeks 范围)
occs = Core.occurrences(courses, '2026-12-28', '2026-12-31');
eq(occs.length, 0, '第 17 周全部结束');

// ---- 课程 JSON 归一化(宽容解析) ----
const raw = {
  courses: [
    { name: '数据结构', weekday: '一', start: '8:00', end: '9:40', location: '一教102', weeks: [1, 16] },
    { title: '英语', day: '周二', startTime: '10:00', endTime: '11:40', parity: '单' },
    { name: '缺时间' },
    { weekday: 4, start: '14:00' },
    { name: '体育', weekday: 5, start: '16:00', end: '17:40', weeks: [1, 16], parity: 'even' },
  ],
};
const courses2 = Core.normalizeCourses(raw);
eq(courses2.length, 5, '5 条输入 5 条输出');
eq(courses2[0].ok, true, '第 1 条可导入');
eq(courses2[0].weekday, 1, '「一」→ 1');
eq(courses2[0].start, '08:00', '8:00 → 08:00');
eq(courses2[1].weekday, 2, '「周二」→ 2');
eq(courses2[1].parity, 'odd', '「单」→ odd');
eq(courses2[2].ok, false, '缺时间标记不可导入');
eq(courses2[3].ok, false, '缺名字不可导入');
eq(courses2[4].parity, 'even', 'even 保留');

// 课程 → 事件
const ev = Core.courseToEvent(courses2[0], '2026-09-07');
eq(ev.source, 'timetable', '来源标记');
eq(ev.recur.weekday, 1, 'recur.weekday');
eq(ev.location, '一教102', '教室');
const occ = Core.expandEvent(ev, '2026-09-14', '2026-09-14');
eq(occ.length, 1, '第 2 周周一有课');
eq(occ[0].start, '2026-09-14 08:00', '第 2 周高数时刻');

// ---- 边界:空数据 ----
eq(Core.occurrences([], '2026-09-07', '2026-09-07').length, 0, '空列表');
eq(Core.occurrences(null, '2026-09-07', '2026-09-07').length, 0, 'null 安全');
eq(Core.normalizeCourses(null).length, 0, 'normalize null 安全');
eq(Core.normalizeCourses({ courses: 'x' }).length, 0, 'courses 非数组安全');

// ---- 测试报告要求的覆盖缺口 ----
// 1. 缺 end 的课程:保持空串,布局层默认 1 小时
const noEnd = Core.normalizeCourses({ courses: [{ name: '晨读', weekday: 2, start: '07:30' }] })[0];
eq(noEnd.end, '', '缺 end 保持空串');
const noEndOcc = Core.expandEvent(Core.courseToEvent(noEnd, '2026-09-07'), '2026-09-08', '2026-09-08');
eq(noEndOcc[0].end, '', '缺 end 的发生也不伪造 00:00');
// 2. weeks 降序 → 归一化时置 null → 展开用默认 [1,25]
const badWeeks = Core.normalizeCourses({ courses: [{ name: '.swap', weekday: 1, start: '08:00', weeks: [8, 3] }] })[0];
eq(badWeeks.weeks, null, 'weeks 降序置 null');
eq(Core.expandEvent(Core.courseToEvent(badWeeks, '2026-09-07'), '2026-09-07', '2026-09-07').length, 1, '降序 weeks 回落默认区间');
// 3. weekday 越界 → 回落周一(与 Java 一致),不产生 NaN 日期
const badDow = { id: 'x', title: '越界', recur: { freq: 'weekly', weekday: 9, start: '08:00', semesterStart: '2026-09-07', weeks: [1, 2], parity: 'all' } };
const badDowOcc = Core.expandEvent(badDow, '2026-09-07', '2026-09-14');
eq(badDowOcc.map((o) => o.day), ['2026-09-07', '2026-09-14'], 'weekday 越界回落周一');
// 4. 跨年展开
const crossYear = { id: 'y', title: '跨年课', recur: { freq: 'weekly', weekday: 1, start: '08:00', semesterStart: '2026-12-28', weeks: [1, 3], parity: 'all' } };
eq(Core.expandEvent(crossYear, '2027-01-01', '2027-01-10').map((o) => o.day), ['2027-01-04'], '跨年第二周 2027-01-04');
// 5. courseToEvent 无 weeks → 默认 [1,25]
const noWeeks = Core.normalizeCourses({ courses: [{ name: '选修', weekday: 6, start: '10:00', end: '11:40' }] })[0];
eq(Core.courseToEvent(noWeeks, '2026-09-07').recur.weeks, [1, 25], '无 weeks 默认 1-25');
// 6. 单元素 weeks / 非数组 weeks → 默认
const oneWeek = Core.normalizeCourses({ courses: [{ name: '单周值', weekday: 1, start: '08:00', weeks: [5] }] })[0];
eq(oneWeek.weeks, null, '单元素 weeks 置 null');
const strWeeks = Core.normalizeCourses({ courses: [{ name: '字符串周', weekday: 1, start: '08:00', weeks: '1-16' }] })[0];
eq(strWeeks.weeks, null, '字符串 weeks 置 null(不猜)');
// 7. fmtTime/hhmmOf 边界
eq(Core.fmtTime('18:30', true), '晚上6:30', '12h 晚上(18 点起算晚上)');
eq(Core.fmtTime('abc', true), 'abc', '非法串原样返回');
eq(Core.hhmmOf(-5), '00:00', 'hhmmOf 负值钳制');
eq(Core.hhmmOf(1500), '24:00', 'hhmmOf 超上限钳制');
// 8. 同刻度多条排序稳定(现代 JS 排序稳定,保持输入顺序)
const sameTime = Core.occurrences([
  { id: 'z2', title: 'B', start: '2026-09-07 10:00' },
  { id: 'z1', title: 'A', start: '2026-09-07 10:00' },
], '2026-09-07', '2026-09-07');
eq(sameTime.map((o) => o.eventId), ['z2', 'z1'], '同刻度保持输入顺序(稳定排序)');

// 9. 跨天事件:开始日进轴、后续日生成全天延续;恰在午夜结束 = 占满前一天(延续到前一天为止)
const crossEv = [
  { id: 'cd', title: '跨天任务', start: '2026-09-07 20:00', end: '2026-09-09 08:00' },
  { id: 'mid', title: '午夜结束', start: '2026-09-07 23:30', end: '2026-09-08 00:00' },
  { id: 'mid2', title: '两天到午夜', start: '2026-09-07 20:00', end: '2026-09-09 00:00' },
];
let crossOccs = Core.occurrences(crossEv, '2026-09-07', '2026-09-09');
eq(crossOccs.filter((o) => o.eventId === 'cd').map((o) => [o.day, o.allDay, !!o.cont]),
  [['2026-09-08', true, true], ['2026-09-09', true, true], ['2026-09-07', false, false]],
  '跨天:开始日 timed + 后续日全天延续(全天排最前)');
eq(crossOccs.filter((o) => o.eventId === 'mid').map((o) => o.day), ['2026-09-07'], '一晚到午夜:只有开始日,无延续');
eq(Core.crossDayEnds('2026-09-07 23:00', '2026-09-08 00:00'), null, '跨午夜 1 小时内结束:不算跨天,留在 24h 轴');
eq(crossOccs.filter((o) => o.eventId === 'mid2').map((o) => o.day),
  ['2026-09-08', '2026-09-07'], '两天到午夜:延续 09-08(全天在前)+ 开始日,09-09 当天无');
crossOccs = Core.occurrences(crossEv, '2026-09-08', '2026-09-08');
eq(crossOccs.length, 2, '延续日单独查询可见(两个跨天事件)');
eq(crossOccs.every((o) => o.allDay && o.cont), true, '延续日为全天 cont 占位');

// 10. layoutColumns:2 列 / 3 列 / 超过 3 列封顶
const mk = (s, e) => ({ start: `2026-09-07 ${s}`, end: e ? `2026-09-07 ${e}` : '' });
let m = Core.layoutColumns([mk('09:00', '10:00'), mk('09:30', '10:30')]);
eq(m.map((x) => [x.col, x.cols]), [[0, 2], [1, 2]], '2 个重叠分 2 列');
m = Core.layoutColumns([mk('09:00', '10:00'), mk('09:10', '10:00'), mk('09:20', '10:00'), mk('09:30', '10:00'), mk('09:40', '10:00')]);
eq(m.every((x) => x.cols === 3 && x.col <= 2), true, '5 个重叠封顶 3 列');
m = Core.layoutColumns([mk('09:00', '10:00'), mk('11:00', '12:00')]);
eq(m.map((x) => [x.col, x.cols]), [[0, 1], [0, 1]], '不重叠各占整行');

// 11. parseCourseLines:粘贴文本行解析
const lines = Core.parseCourseLines(
  '周一 08:00-09:40 高等数学 教三-201 1-16周\n' +
  '周三 14:00-15:40 操作系统 二教201 1-16周 单周\n' +
  '乱七八糟的一行\n' +
  '周五 16:00-17:40 体育 操场');
eq(lines.length, 4, '4 行 4 条输出');
eq([lines[0].ok, lines[0].weekday, lines[0].start, lines[0].end], [true, 1, '08:00', '09:40'], '第 1 行解析');
eq([lines[0].title, lines[0].location, lines[0].weeks], ['高等数学', '教三-201', [1, 16]], '第 1 行课名/教室/周次');
eq(lines[1].parity, 'odd', '单周标记');
eq(lines[2].ok, false, '无法解析的行标记不可导入');
eq([lines[3].title, lines[3].weekday, lines[3].weeks], ['体育', 5, null], '无周次默认全学期');
const lines2 = Core.parseCourseLines('周二 8点-9点40 大学英语 外语楼305 1-16周');
eq([lines2[0].start, lines2[0].end], ['08:00', '09:40'], '「点」字时间换算(8点=08:00)');
const lines3 = Core.parseCourseLines('周四 14:00～15:40 数据结构 一教102 1—8周');
eq([lines3[0].start, lines3[0].end, lines3[0].weeks], ['14:00', '15:40', [1, 8]], '全角波浪线与长破折号分隔符');

// 12. parseIcsCourses:WakeUp/小爱风格课表导出
const ics = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'PRODID:-//WakeUp//CN',
  'BEGIN:VEVENT',
  'DTSTART;TZID=Asia/Shanghai:20260907T080000',
  'DTEND;TZID=Asia/Shanghai:20260907T094000',
  'SUMMARY:高等数学',
  'LOCATION:教三-201',
  'DESCRIPTION:张老师',
  'RRULE:FREQ=WEEKLY;BYDAY=MO;COUNT=16',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'DTSTART:20260909T140000',
  'DTEND:20260909T154000',
  'SUMMARY:大学英语',
  'LOCATION:外语楼-305',
  'RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=WE;COUNT=8',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'DTSTART:20260911T160000',
  'DURATION:PT1H40M',
  'SUMMARY:很长的课程名称需要折行处理',
  'RRULE:FREQ=WEEKLY;BYDAY=FR;UNTIL=20261225T000000Z',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'DTSTART;VALUE=DATE:20261001',
  'SUMMARY:国庆节(全天,非课程)',
  'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');
// 折行:把长 SUMMARY 拆两行模拟 RFC5545 unfold
const icsFolded = ics.replace('SUMMARY:很长的课程名称需要折行处理', 'SUMMARY:很长的课程名称需\n 要折行处理');
const parsed = Core.parseIcsCourses(icsFolded);
eq(parsed.semesterStart, '2026-09-07', '锚点=最早首发生日的周一');
eq(parsed.courses.length, 3, '3 门课(全天事件被跳过)');
const [icsMath, icsEng, icsPe] = parsed.courses;
eq([icsMath.title, icsMath.weekday, icsMath.start, icsMath.end, icsMath.location, icsMath.teacher], ['高等数学', 1, '08:00', '09:40', '教三-201', '张老师'], '高数行完整');
eq(icsMath.weeks, [1, 16], 'COUNT=16 → 周 1-16');
eq([icsEng.weekday, icsEng.parity, icsEng.weeks], [3, 'odd', [1, 15]], 'INTERVAL=2 → 单周,8 次→1..15');
eq([icsPe.title, icsPe.end], ['很长的课程名称需要折行处理', '17:40'], '折行 SUMMARY 展开 + DURATION 换算结束');
eq(icsPe.weeks, [1, 16], 'UNTIL 12-25 → 第 16 周');
// 单次无 RRULE 的 VEVENT → 1 次课
const once = Core.parseIcsCourses('BEGIN:VEVENT\r\nDTSTART:20260915T190000\r\nDTEND:20260915T203000\r\nSUMMARY:讲座\r\nEND:VEVENT');
eq([once.courses[0].weeks, once.semesterStart], [[1, 1], '2026-09-14'], '无 RRULE 单次课:仅第 1 周');
// 空输入安全
eq(Core.parseIcsCourses('').courses.length, 0, '空文本安全');

// 13. layoutColumns 回归:跨天不互相聚簇、簇结束正确重置
const crossWk = [
  { start: '2026-09-14 09:00', end: '2026-09-14 10:00' }, // 周一
  { start: '2026-09-15 08:00', end: '2026-09-15 09:00' }, // 周二(时刻早于周一簇尾,但不同天)
  { start: '2026-09-16 14:00', end: '2026-09-16 15:00' }, // 周三孤立
];
const cwMarks = Core.layoutColumns(crossWk);
eq(cwMarks.map((m) => [m.col, m.cols]), [[0, 1], [0, 1], [0, 1]], '跨天不互相聚簇');
const seq = [
  { start: '2026-09-14 09:00', end: '2026-09-14 10:00' },
  { start: '2026-09-14 09:30', end: '2026-09-14 10:30' },
  { start: '2026-09-14 11:00', end: '2026-09-14 12:00' }, // 与前簇不重叠
];
const seqMarks = Core.layoutColumns(seq);
eq(seqMarks.map((m) => [m.col, m.cols]), [[0, 2], [1, 2], [0, 1]], '簇结束后孤立事件恢复整行');

// 14. ICS 修复回归:VALARM 不覆盖、UTC 转本地、EXDATE 停课周
const CRLF_STR = String.fromCharCode(13) + String.fromCharCode(10);
const icsFix = [
  'BEGIN:VCALENDAR',
  'BEGIN:VEVENT',
  'DTSTART:20260907T000000Z', // UTC 08:00(北京) → 本地 08:00
  'DTEND:20260907T014000Z',
  'SUMMARY:UTC课',
  'RRULE:FREQ=WEEKLY;BYDAY=MO;COUNT=16',
  'BEGIN:VALARM',
  'DTSTART:20260907T070000Z',
  'DURATION:PT5M',
  'DESCRIPTION:闹钟描述污染',
  'END:VALARM',
  'EXDATE:20260921T000000Z',
  'END:VEVENT',
  'END:VCALENDAR',
].join(CRLF_STR);
const fx = Core.parseIcsCourses(icsFix).courses[0];
// 北京 UTC+8:00:00Z → 08:00 本地(测试机时区即 +8)
eq([fx.start, fx.end], ['08:00', '09:40'], 'UTC Z 转本地时间');
eq(fx.teacher.indexOf('闹钟') < 0, true, 'VALARM 的 DESCRIPTION 不覆盖事件');
eq(fx.exWeeks, [3], 'EXDATE → 第 3 周停课');
const fxEvent = Core.courseToEvent(fx, '2026-09-07');
const fxOccs = Core.expandEvent(fxEvent, '2026-09-14', '2026-09-28');
eq(fxOccs.map((o) => o.day), ['2026-09-14', '2026-09-28'], '停课周 09-21 被跳过');

console.log(`\n单测结果: ${pass} 通过, ${fail} 失败`);
process.exit(fail ? 1 : 0);
