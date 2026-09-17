/** 明日记忆 · API 层(线上 tmword.xyz,JWT 鉴权,单词本离线队列) */
'use strict';

const API = (() => {
  const BASE = (typeof window !== 'undefined' && window.__API_BASE__) || 'https://tmword.xyz';
  const LS = {
    token: 'tm.token', phone: 'tm.phone', nickname: 'tm.nickname',
    recent: 'tm.recent', wbQueue: 'tm.wbQueue', wbCache: 'tm.wbCache',
    cardCache: 'tm.cardCache:', reviewDate: 'tm.reviewDate',
  };

  function getToken() { try { return localStorage.getItem(LS.token) || ''; } catch (e) { return ''; } }
  function setAuth(token, phone, nickname) {
    try {
      if (token) {
        localStorage.setItem(LS.token, token);
        localStorage.setItem(LS.phone, phone || '');
        localStorage.setItem(LS.nickname, nickname || '');
      } else {
        localStorage.removeItem(LS.token);
        localStorage.removeItem(LS.phone);
        localStorage.removeItem(LS.nickname);
      }
    } catch (e) { /* 忽略 */ }
    try { window.AndroidBridge && AndroidBridge.saveToken(token || ''); } catch (e) { /* 浏览器 */ }
  }
  function getAuth() {
    try {
      return {
        token: localStorage.getItem(LS.token) || '',
        phone: localStorage.getItem(LS.phone) || '',
        nickname: localStorage.getItem(LS.nickname) || '',
      };
    } catch (e) { return { token: '', phone: '', nickname: '' }; }
  }

  let on401 = null; // 登出回调
  function setOn401(fn) { on401 = fn; }

  /** fetch 封装:超时 12s,JSON,401 触发登出 */
  async function req(method, path, body, authed) {
    const headers = { 'Content-Type': 'application/json' };
    if (authed) {
      const t = getToken();
      if (!t) throw Object.assign(new Error('未登录'), { code: 'NOAUTH' });
      headers['Authorization'] = 'Bearer ' + t;
    }
    const ctrl = new AbortController();
    const tm = setTimeout(() => ctrl.abort(), 12000);
    let res;
    try {
      res = await fetch(BASE + path, {
        method, headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: ctrl.signal,
      });
    } catch (e) {
      clearTimeout(tm);
      throw Object.assign(new Error('网络连接失败,请检查网络'), { code: 'NETWORK', cause: e });
    }
    clearTimeout(tm);
    if (res.status === 401 && authed) {
      setAuth('', '', '');
      if (on401) on401();
      throw Object.assign(new Error('登录已过期,请重新登录'), { code: 'AUTH' });
    }
    let data = null;
    try { data = await res.json(); } catch (e) { /* 非 JSON */ }
    if (!res.ok) {
      const msg = (data && data.error) || `服务异常(${res.status})`;
      throw Object.assign(new Error(typeof msg === 'string' ? msg : '请求失败'), { code: 'HTTP' + res.status, status: res.status });
    }
    return data;
  }

  // ===== 认证 =====
  const sendCode = (phone) => req('POST', '/api/send-code', { phone });
  const login = (phone, code, password) =>
    req('POST', '/api/login', password ? { phone, password } : { phone, code });
  const me = () => req('GET', '/api/me', undefined, true);

  // ===== 查词(带本地缓存,离线可查最近词) =====
  async function lookup(word, direction) {
    const key = LS.cardCache + (word || '').trim().toLowerCase();
    try {
      const cached = localStorage.getItem(key);
      if (cached && !navigator.onLine) return { data: JSON.parse(cached), cached: true };
    } catch (e) { /* 忽略 */ }
    const data = await req('GET', `/api/lookup?word=${encodeURIComponent(word)}${direction ? '&direction=' + direction : ''}`);
    try { localStorage.setItem(key, JSON.stringify(data)); } catch (e) { /* 超限忽略 */ }
    return { data, cached: false };
  }
  function lookupCache(word) {
    try {
      const c = localStorage.getItem(LS.cardCache + (word || '').trim().toLowerCase());
      return c ? JSON.parse(c) : null;
    } catch (e) { return null; }
  }

  // ===== 最近查词 =====
  function recentList() {
    try { return JSON.parse(localStorage.getItem(LS.recent) || '[]'); } catch (e) { return []; }
  }
  function recentAdd(word, translation) {
    let list = recentList().filter((r) => r.word !== word);
    list.unshift({ word, translation: (translation || '').split('\n')[0].slice(0, 30), at: Date.now() });
    list = list.slice(0, 200);
    try { localStorage.setItem(LS.recent, JSON.stringify(list)); } catch (e) { /* 忽略 */ }
  }
  function recentClear() { try { localStorage.removeItem(LS.recent); } catch (e) { /* 忽略 */ } }

  // ===== 单词本(服务端全量覆盖模型;本地权威副本 + 待同步队列,防丢) =====
  function wbCache() {
    try { return JSON.parse(localStorage.getItem(LS.wbCache) || '[]'); } catch (e) { return []; }
  }
  function wbSaveCache(list) {
    try { localStorage.setItem(LS.wbCache, JSON.stringify(list.slice(0, 20000))); } catch (e) { /* 忽略 */ }
  }
  function wbQueue() {
    try { return JSON.parse(localStorage.getItem(LS.wbQueue) || '[]'); } catch (e) { return []; }
  }
  function wbSetQueue(q) {
    try { localStorage.setItem(LS.wbQueue, JSON.stringify(q.slice(0, 500))); } catch (e) { /* 忽略 */ }
  }

  /** 本地即时加词(乐观),入队待同步 */
  function wbLocalAdd(word) {
    word = (word || '').trim().toLowerCase();
    if (!word) return;
    const list = wbCache();
    if (list.some((x) => x.word === word)) return;
    list.push({ word, addedAt: Date.now() });
    wbSaveCache(list);
    const q = wbQueue().filter((x) => x.word !== word);
    q.push({ op: 'add', word, at: Date.now(), seq: nextSeq() });
    wbSetQueue(q);
  }
  function wbLocalRemove(word) {
    word = (word || '').trim().toLowerCase();
    wbSaveCache(wbCache().filter((x) => x.word !== word));
    const q = wbQueue().filter((x) => x.word !== word);
    q.push({ op: 'remove', word, at: Date.now(), seq: nextSeq() });
    wbSetQueue(q);
  }
  function wbLocalClear() {
    wbSaveCache([]);
    const q = wbQueue();
    q.push({ op: 'clear', at: Date.now(), seq: nextSeq() });
    wbSetQueue(q);
  }

  /** 队列条目自增序号:同步完成只清 seq ≤ 快照末尾的条目,窗口期新操作(同词翻转)永不误清 */
  function nextSeq() {
    let n = 0;
    try { n = (+localStorage.getItem('tm.wbSeq') || 0) + 1; localStorage.setItem('tm.wbSeq', String(n)); } catch (e) { n = Date.now(); }
    return n;
  }

  let wbSyncing = false;
  /** 把本地队列合并进服务端(拉远端→合并队列→整体 PUT);成功后只清 seq ≤ 快照末尾的条目 */
  async function wbSync() {
    if (wbSyncing) return wbCache();
    if (!getToken()) return wbCache();
    wbSyncing = true;
    try {
      let server = [];
      try {
        const r = await req('GET', '/api/wordbook', undefined, true);
        server = (r && r.data) || [];
      } catch (e) {
        if (e.code === 'NETWORK') throw e; // 离线:保留队列下次再试
        server = [];
      }
      const q = wbQueue();
      if (q.length) {
        const lastSeq = Math.max(...q.map((op) => op.seq || 0));
        const map = new Map(server.map((x) => [x.word, x]));
        for (const op of q) {
          const w = (op.word || '').trim().toLowerCase();
          if (op.op === 'add') map.set(w, { word: w, addedAt: op.at || Date.now() });
          else if (op.op === 'remove') map.delete(w);
          else if (op.op === 'clear') map.clear();
        }
        const merged = [...map.values()];
        await req('PUT', '/api/wordbook', { data: merged }, true);
        // 窗口期新增操作(seq 更大)保留,下轮补同步;同词翻转(add seq 小/remove seq 大)也正确
        wbSetQueue(wbQueue().filter((op) => (op.seq || 0) > lastSeq));
        wbSaveCache(merged);
        if (wbQueue().length) {
          wbSyncing = false;          // 有残留变更:立即自愈重同步
          return wbSync();
        }
      } else {
        wbSaveCache(server);
      }
      return wbCache();
    } finally {
      wbSyncing = false;
    }
  }

  // ===== 复习 =====
  const reviewToday = () => req('GET', '/api/review/today', undefined, true);
  const reviewCard = (word, rating) => req('POST', '/api/review', { word, rating }, true);

  // ===== 打卡/档案 =====
  const checkinStatus = () => req('GET', '/api/checkin/status', undefined, true);
  const checkin = () => req('POST', '/api/checkin', {}, true);
  const profile = () => req('GET', '/api/profile', undefined, true);
  const profileUpdate = (patch) => req('PUT', '/api/profile', patch, true);
  const passwordUpdate = (password) => req('PUT', '/api/password', { password }, true);

  return {
    LS, getToken, setAuth, getAuth, setOn401,
    sendCode, login, me,
    lookup, lookupCache,
    recentList, recentAdd, recentClear,
    wbCache, wbLocalAdd, wbLocalRemove, wbLocalClear, wbSync, wbQueue,
    reviewToday, reviewCard, checkinStatus, checkin, profile, profileUpdate, passwordUpdate,
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = API;
