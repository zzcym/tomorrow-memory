/** 浏览器测试用 AndroidBridge 模拟(真机 WebView 里 window.AndroidBridge 已存在,本文件自动失效;
 *  file:// 打包运行时也保持沉默) */
(function () {
  'use strict';
  if (window.AndroidBridge) return;
  if (location.protocol === 'file:') return;

  const pad = (n) => String(n).padStart(2, '0');
  const dayStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const today = dayStr(new Date());
  const tomorrow = dayStr(new Date(Date.now() + 86400000));
  const CRLF = String.fromCharCode(13) + String.fromCharCode(10);

  const MOCK_ICS = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'BEGIN:VEVENT',
    'DTSTART;TZID=Asia/Shanghai:20260914T080000',
    'DTEND;TZID=Asia/Shanghai:20260914T094000',
    'SUMMARY:高等数学(ics)',
    'LOCATION:教三-201',
    'DESCRIPTION:张老师',
    'RRULE:FREQ=WEEKLY;BYDAY=MO;COUNT=16',
    'END:VEVENT',
    'BEGIN:VEVENT',
    'DTSTART;TZID=Asia/Shanghai:20260916T140000',
    'DTEND;TZID=Asia/Shanghai:20260916T154000',
    'SUMMARY:操作系统(ics)',
    'LOCATION:二教-201',
    'RRULE:FREQ=WEEKLY;BYDAY=WE;COUNT=16',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join(CRLF);

  let events = [
    { id: 's1', title: '站会', start: `${today} 09:30`, end: `${today} 10:00`, location: '线上', createdAt: 1 },
    { id: 's2', title: '自习:高数作业', start: `${today} 14:00`, end: `${today} 15:30`, location: '图书馆三楼', createdAt: 2 },
    { id: 's3', title: '和小王吃饭', start: `${tomorrow} 20:00`, location: '三里屯', createdAt: 3 },
    { id: 's4', title: '买生日礼物', start: `${today} 00:00`, allDay: true, createdAt: 4 },
    {
      id: 'c101', title: '高等数学', location: '教三-201', notes: '张老师', source: 'timetable',
      recur: { freq: 'weekly', weekday: (new Date().getDay() || 7), start: '08:00', end: '09:40', semesterStart: `${today.slice(0, 4)}-09-07`, weeks: [1, 16], parity: 'all' },
    },
    {
      id: 'c102', title: '大学英语', location: '外语楼-305', source: 'timetable',
      recur: { freq: 'weekly', weekday: ((new Date().getDay() || 7) % 7) + 1, start: '10:00', end: '11:40', semesterStart: `${today.slice(0, 4)}-09-07`, weeks: [1, 16], parity: 'all' },
    },
  ];

  let settings = {
    llm: { baseUrl: 'https://api.deepseek.com', apiKey: 'sk-demo', model: 'deepseek-chat' },
    asr: { baseUrl: '', apiKey: '', model: '' },
    reminder: { defaultLeadMinutes: 60, digestTime: '21:30', digestEnabled: true },
    appearance: { theme: 'day', bgPath: '', timeFormat: '24h' },
    school: { semesterStart: '' },
  };

  let pickCount = 0;

  window.AndroidBridge = {
    getSettings: () => JSON.stringify(settings),
    saveSettings: (json) => {
      const patch = JSON.parse(json);
      const merge = (a, b) => {
        for (const k in b) a[k] = (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k])) ? merge(a[k] || {}, b[k]) : b[k];
        return a;
      };
      settings = merge(settings, patch);
      return JSON.stringify(settings);
    },
    getEvents: () => JSON.stringify(events),
    addEvents: (arrJson) => {
      const add = JSON.parse(arrJson);
      const now = Date.now();
      add.forEach((e, i) => { e.id = 'e' + now + i; if (!e.remindedAt) e.remindedAt = null; e.createdAt = now; events.push(e); });
      return JSON.stringify(events);
    },
    updateEvent: (json) => {
      const patch = JSON.parse(json);
      events = events.map((e) => (e.id === patch.id ? Object.assign({}, e, patch) : e));
      return JSON.stringify(events);
    },
    deleteEvent: (id) => {
      events = events.filter((e) => e.id !== id);
      return JSON.stringify(events);
    },
    parseText: (text) => {
      if (!text || !text.trim()) return JSON.stringify({ error: 'empty' });
      const t = text.replace(/\s/g, '');
      const hour = /晚上八点|晚八/.test(t) ? '20:00' : /早上八点|早八/.test(t) ? '08:00' : /中午/.test(t) ? '12:00' : '15:00';
      const day = /明天/.test(t) ? tomorrow : today;
      return JSON.stringify({ events: [{ title: t.length > 20 ? t.slice(0, 20) : t, start: `${day} ${hour}` }] });
    },
    startVoice: (preferCloud, token) => {
      setTimeout(() => {
        window.onVoiceState && window.onVoiceState(token, 'listening');
        setTimeout(() => window.onVoiceResult && window.onVoiceResult(token, '明天晚上八点和小王吃饭在三里屯'), 1000);
      }, 200);
    },
    stopVoice: (token) => { window.onVoiceResult && window.onVoiceResult(token, '明天早上八点交高数作业'); },
    cancelVoice: () => {},
    pickImage: (purpose) => {
      pickCount++;
      setTimeout(() => window.onImagePicked && window.onImagePicked(`mock://pick-${pickCount}.jpg`, purpose), 300);
    },
    pickIcs: () => {
      setTimeout(() => window.onIcsFile && window.onIcsFile(MOCK_ICS), 300);
    },
    pickBackup: () => {
      setTimeout(() => window.onBackupFile && window.onBackupFile(JSON.stringify({
        version: 2, exportedAt: Date.now(),
        events: [{ id: 'bak1', title: '备份里的事件', start: `${tomorrow} 12:00` }],
        settings,
      })), 300);
    },
    importAll: (json) => {
      const all = JSON.parse(json);
      if (!all.events) return -1;
      events = all.events;
      if (all.settings) settings = all.settings;
      return events.length;
    },
    clearEvents: () => { const n = events.length; events = []; return n; },
    exportData: () => '/tmp/mock-backup.json',
    testLlm: () => 'ok:233ms',
    readImageBase64: () => 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    testNotify: () => console.log('[mock] testNotify'),
    canExactAlarm: () => true,
    canNotify: () => true,
    openExactAlarmSettings: () => {},
    openNotifSettings: () => {},
    applyUiTheme: (t) => { console.log('[mock] applyUiTheme', t); },
  };
})();
