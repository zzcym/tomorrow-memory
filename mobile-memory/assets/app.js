/** 明日记忆 · 界面逻辑(查词/背词卡片/单词本/登录;设计文档 docs/APP-DESIGN-BACKCARD.md) */
'use strict';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s || '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

/* ================= 通用 ================= */
let toastTm = null;
function toast(msg, ms) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toastTm);
  toastTm = setTimeout(() => t.classList.add('hidden'), ms || 2000);
}
function loading(on) { $('loadingBar').classList.toggle('hidden', !on); }

/* ================= 页面路由 ================= */
const PAGES = ['home', 'review', 'wordbook', 'me', 'about', 'security', 'password'];
const TITLES = { home: '明日记忆', review: '背单词', wordbook: '单词本', me: '我的', about: '关于', security: '账号安全', password: '修改密码' };
let curPage = 'home';
const pageStack = ['home'];        // 页面栈:支持任意层级导航(我的→账号安全→修改密码)

function renderPage(page) {
  PAGES.forEach((p) => $('page-' + p).classList.toggle('active', p === page));
  closeMenu();
  $('tbTitle').textContent = TITLES[page] || '明日记忆';
  $('backHome').classList.toggle('hidden', page === 'home');
  if (page === 'review') renderReview();
  if (page === 'wordbook') renderWordbook();
  if (page === 'me') renderMe();
  if (page === 'security') renderSecurity();
  if (page === 'password') renderPassword();
  if (page === 'home') setTimeout(() => $('searchInput').focus(), 80);
}

function goto(page) {
  const at = pageStack.indexOf(page);
  if (at >= 0) pageStack.length = at + 1;   // 切回栈中已有页:弹出其上的层级
  else pageStack.push(page);
  curPage = page;
  renderPage(page);
}

function goBack() {
  if (pageStack.length > 1) {
    pageStack.pop();
    curPage = pageStack[pageStack.length - 1];
    renderPage(curPage);
    return 'stay';
  }
  return 'exit';
}

/* 顶栏返回 */
$('backHome').addEventListener('click', () => goBack());

/* 汉堡菜单 */
function openMenu() { $('menuMask').classList.remove('hidden'); $('menuPop').classList.remove('hidden'); refreshReviewBadge(); } // 每次开菜单都取最新待背数,避免背到一半退出后显示旧数字
function closeMenu() { $('menuMask').classList.add('hidden'); $('menuPop').classList.add('hidden'); }
$('menuBtn').addEventListener('click', openMenu);
$('menuMask').addEventListener('click', closeMenu);
$('menuPop').addEventListener('click', (e) => {
  const item = e.target.closest('.menu-item');
  if (!item) return;
  const act = item.dataset.act;
  if (act === 'about') goto('about');
  else {
    if (!API.getToken() && act !== 'me') { goto('me'); toast('先登录后再使用'); return; }
    goto(act);
  }
});

/* ================= 查词结果渲染(首页与背词背面复用) ================= */
const EXCH_ZH = { p: '过去式', d: '过去分词', i: '现在分词', 3: '第三人称单数', s: '复数', r: '比较级', t: '最高级', 0: '原形' };

function renderLookup(d, opts) {
  const compact = opts === true || !!(opts && opts.compact);
  const noHead = !!(opts && opts.noHead);
  const groups = Array.isArray(d.groups) && d.groups.length ? d.groups : null;
  const fallbackMeans = groups ? [] : String(d.translation || '').split(/[;；\n]/).map((x) => x.trim()).filter(Boolean);
  const ex = (Array.isArray(d.examples) ? d.examples : []).slice(0, 2);
  const exch = d.exchange && typeof d.exchange === 'object'
    ? Object.entries(d.exchange).filter(([, v]) => v).map(([k, v]) => `${esc(EXCH_ZH[k] || k)} ${esc(v)}`) : [];

  const SPEAKER = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H2v6h4l5 4V5z" fill="currentColor" stroke="none"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/></svg>';
  // 英文释义按词性缩写分段(词典数据是多个义项串接,如 "... purpose n. an establishment ...")
  const defParts = String(d.definition || '')
    .split(/\s+(?=(?:n|v|vt|vi|adj|adv|prep|conj|pron|interj|art|num)\.\s)/)
    .map((x) => x.trim()).filter(Boolean);
  const defShown = compact ? defParts.slice(0, 1) : defParts.slice(0, 3);
  const defRest = defParts.slice(defShown.length);

  return `
    <div class="lr">
      ${noHead ? '' : `<div class="lr-head">
        <h1 class="lr-word">${esc(d.word)}</h1>
        <button class="lr-speak" data-say="${esc(d.word)}" aria-label="发音">${SPEAKER}</button>
        ${d.phonetic ? `<span class="lr-phon">/${esc(d.phonetic.replace(/^\/|\/$/g, ''))}/</span>` : ''}
      </div>`}
      ${groups
        ? `<div class="lr-groups">${groups.map((g, gi) => `
            <div class="lr-group">
              ${g.pos ? `<span class="lr-pos">${esc(g.pos)}</span>` : ''}
              <p class="lr-mean${gi === 0 ? ' lr-primary' : ''}">${esc((g.meanings || []).join(';'))}</p>
            </div>`).join('')}</div>`
        : fallbackMeans.map((m, mi) => `<p class="lr-mean${mi === 0 ? ' lr-primary' : ''}" style="margin-top:8px">${esc(m)}</p>`).join('')}
      ${defShown.length ? `<div class="lr-def">
        ${defShown.map((x) => `<p class="lr-def-line">${esc(x)}</p>`).join('')}
        ${defRest.length ? `<details class="lr-def-more"><summary>还有 ${defRest.length} 句释义</summary>
          ${defRest.map((x) => `<p class="lr-def-line">${esc(x)}</p>`).join('')}</details>` : ''}
      </div>` : ''}
      ${ex.length ? `<div class="lr-examples">
        <p class="lr-sec-title">例句</p>
        ${ex.map((x) => `<div class="lr-ex">
          <p class="lr-ex-en">${esc(x.en)}</p>
          ${x.zh ? `<p class="lr-ex-zh">${esc(x.zh)}</p>` : ''}
        </div>`).join('')}
      </div>` : ''}
      ${exch.length ? `<details class="lr-more"><summary>词形变化</summary>
        <div class="lr-exch">${exch.map((x) => {
          const sp = x.indexOf(' ');
          return `<span class="lr-exch-item"><small>${esc(x.slice(0, sp))}</small><b>${esc(x.slice(sp + 1))}</b></span>`;
        }).join('')}</div>
      </details>` : ''}
    </div>`;
}

/* 扬声器图标(事件委托:查词结果/背词背面通用) */
document.addEventListener('click', (e) => {
  const b = e.target.closest('.lr-speak');
  if (b) { speak(b.dataset.say); }
});

/* ================= 首页查词 ================= */
let lastLookupWord = '';

async function doLookup(word) {
  word = (word || '').trim();
  if (!word) return;
  $('searchInput').blur();
  $('page-home').classList.add('searched');
  $('lookupResult').innerHTML = '<p class="hint" style="padding:30px 0;text-align:center">查询中…</p>';
  loading(true);
  try {
    const { data, cached } = await API.lookup(word);
    // 中→英:返回 {query, sourceLang:'zh', results:[{word,pos,definition,synonyms}]}
    if (data.sourceLang === 'zh' && Array.isArray(data.results)) {
      renderZh2En(word, data);
      loading(false);
      return;
    }
    // 垃圾结果启发式:无词性分组且释义不含中文(第三方接口对未收录词返回乱码/时间戳)
    const hasCJK = /[\u4e00-\u9fff]/.test(data.translation || '') || (data.groups || []).some((g) => /[\u4e00-\u9fff]/.test((g.meanings || []).join('')));
    if (!hasCJK && !(data.groups || []).length) {
      showNotFound(word, cached);
      loading(false);
      return;
    }
    lastLookupWord = data.word || word.toLowerCase();
    // 查词默认加入单词本(不重复提示),无需按钮;发音在词头扬声器
    const already = API.wbCache().some((x) => x.word === lastLookupWord);
    if (!already) {
      API.wbLocalAdd(lastLookupWord);
      syncWbQuiet();
    }
    $('lookupResult').innerHTML = renderLookup(data, false);
    if (!already) toast('已加入单词本');
    API.recentAdd(lastLookupWord, data.translation || data.definition || '');
  } catch (e) {
    const cache = API.lookupCache(word);
    if (cache) {
      $('lookupResult').innerHTML = renderLookup(cache, false)
        + '<p class="error-text">当前离线,展示的是缓存结果</p>';
    } else if (e.status === 404) {
      $('lookupResult').innerHTML = `<div class="empty">词典里没有「${esc(word)}」<br/>试试英文单词,或换个说法</div>`;
    } else {
      $('lookupResult').innerHTML = `<div class="empty">${esc(e.message)}<br/><button class="btn btn-ghost btn-sm" style="margin-top:14px" onclick="doLookup('${esc(word).replace(/'/g, '')}')">重试</button></div>`;
    }
  } finally {
    loading(false);
  }
}

function speak(word) {
  try {
    const u = new SpeechSynthesisUtterance(word);
    u.lang = 'en-US';
    speechSynthesis.speak(u);
  } catch (e) { toast('发音不可用'); }
}

/** 未收录空态(带离线缓存兜底) */
function showNotFound(word, cached) {
  if (cached) {
    $('lookupResult').innerHTML = renderLookup(cached, false)
      + '<p class="error-text">当前离线,展示的是缓存结果</p>';
    return;
  }
  $('lookupResult').innerHTML = `<div class="empty">词典里没有「${esc(word)}」<br/>试试英文单词,或换个说法</div>`;
}

/** 中→英结果渲染 */
function renderZh2En(query, data) {
  const results = (data.results || []).filter((r) => r.word);
  if (!results.length) {
    $('lookupResult').innerHTML = `<div class="empty">「${esc(query)}」没有找到对应的英文<br/>试试换个说法</div>`;
    return;
  }
  $('lookupResult').innerHTML = `
    <div class="lr">
      <div class="lr-head">
        <h1 class="lr-word">${esc(query)}</h1>
        <span class="lr-phon">中文 → 英文</span>
      </div>
      <div class="lr-groups">
        ${results.slice(0, 6).map((r, i) => `
          <div class="zh2en-item" data-w="${esc(r.word)}">
            <p class="lr-mean${i === 0 ? ' lr-primary' : ''}">${esc(r.word)} <span class="lr-pos">${esc(r.pos || '')}</span></p>
            ${r.phonetic ? `<p class="lr-ex-zh">${esc(r.phonetic)}</p>` : ''}
            ${r.synonyms && r.synonyms.length ? `<p class="lr-ex-zh">近义:${esc(r.synonyms.join(', '))}</p>` : ''}
          </div>`).join('')}
      </div>
      <p class="hint" style="margin-top:10px">点英文词查看完整释义并加入单词本</p>
    </div>`;
  $('lookupResult').querySelectorAll('.zh2en-item').forEach((el) => {
    el.addEventListener('click', () => {
      $('searchInput').value = el.dataset.w;
      doLookup(el.dataset.w);
    });
  });
}

/* 最近查询(数据继续记录在 API 层,首页按用户要求不再展示) */

/* 搜索框事件(form submit:Enter 与按钮统一走这条路,最稳) */
$('searchForm').addEventListener('submit', (e) => {
  e.preventDefault();
  doLookup($('searchInput').value);
});

/* 单词本静默同步 */
let syncTm = null;
function syncWbQuiet() {
  clearTimeout(syncTm);
  syncTm = setTimeout(() => API.wbSync().catch(() => { /* 静默,队列保留 */ }), 800);
}

/* ================= 登录 / 我的 ================= */
let codeCdTm = null;
function renderMe() {
  const auth = API.getAuth();
  const body = $('meBody');
  if (!auth.token) {
    body.innerHTML = `
      <div class="card">
        <h3>登录 / 注册</h3>
        <p class="hint">手机号 + 验证码登录,未注册将自动注册;数据保存在云端,与网页版 tmword.xyz 互通</p>
        <div class="field"><label>手机号</label>
          <input id="loginPhone" type="tel" maxlength="11" placeholder="13xxxxxxxxx" inputmode="numeric"/></div>
        <div id="codeMode">
          <div class="field"><label>验证码</label>
            <div class="code-row">
              <input id="loginCode" type="number" inputmode="numeric" placeholder="6 位验证码"/>
              <button id="sendCodeBtn" class="send-code" type="button">发送验证码</button>
            </div>
          </div>
          <div class="login-switch"><a id="toPwdLogin">密码登录</a></div>
        </div>
        <div id="pwdMode" class="hidden">
          <div class="field"><label>密码</label>
            <input id="loginPwd" type="password" placeholder="登录密码"/></div>
          <div class="login-switch"><a id="toCodeLogin">验证码登录</a></div>
        </div>
        <button id="loginBtn" class="btn btn-primary" style="width:100%">登录</button>
        <p class="error-text hidden" id="loginErr"></p>
      </div>`;
    const phoneEl = $('loginPhone'), codeEl = $('loginCode'), pwdEl = $('loginPwd');
    let loginMode = 'code'; // 'code' 验证码登录(默认,未注册自动注册) | 'pwd' 密码登录
    const setLoginMode = (m) => {
      loginMode = m;
      $('codeMode').classList.toggle('hidden', m === 'pwd');
      $('pwdMode').classList.toggle('hidden', m === 'code');
      showLoginErr('');
    };
    $('toPwdLogin').addEventListener('click', () => setLoginMode('pwd'));
    $('toCodeLogin').addEventListener('click', () => setLoginMode('code'));
    $('sendCodeBtn').addEventListener('click', async () => {
      const phone = phoneEl.value.trim();
      if (!/^1[3-9]\d{9}$/.test(phone)) { showLoginErr('请输入正确的手机号'); return; }
      const btn = $('sendCodeBtn');
      btn.disabled = true;
      try {
        await API.sendCode(phone);
        toast('验证码已发送');
        let left = 60;
        btn.textContent = left + 's';
        codeCdTm = setInterval(() => {
          left -= 1;
          if (left <= 0) { clearInterval(codeCdTm); btn.disabled = false; btn.textContent = '发送验证码'; }
          else btn.textContent = left + 's';
        }, 1000);
      } catch (e) {
        btn.disabled = false;
        showLoginErr(e.message);
      }
    });
    $('loginBtn').addEventListener('click', async () => {
      const phone = phoneEl.value.trim();
      if (!/^1[3-9]\d{9}$/.test(phone)) { showLoginErr('请输入正确的手机号'); return; }
      if (loginMode === 'pwd') {
        if (!pwdEl.value) { showLoginErr('请输入密码'); return; }
      } else if (!codeEl.value.trim()) { showLoginErr('请输入验证码'); return; }
      const btn = $('loginBtn');
      btn.disabled = true; btn.textContent = '登录中…';
      try {
        const r = await API.login(phone, loginMode === 'pwd' ? '' : codeEl.value.trim(), pwdEl.value);
        API.setAuth(r.token, r.phone, r.nickname || '');
        toast('欢迎回来' + (r.nickname ? ',' + r.nickname : ''));
        renderMe();
        refreshReviewBadge();
      } catch (e) {
        showLoginErr(e.message);
      } finally {
        btn.disabled = false; btn.textContent = '登录';
      }
    });
    function showLoginErr(m) { const el = $('loginErr'); el.textContent = m; if (m) el.classList.remove('hidden'); else el.classList.add('hidden'); }
    return;
  }
  // 已登录:骨架(数据异步填充)
  body.innerHTML = `
    <div class="card" id="meHead">
      <div class="me-head-row">
        <button class="avatar" id="avatarBtn" aria-label="更换头像">${auth.nickname ? esc(auth.nickname.slice(0, 1).toUpperCase()) : '?'}</button>
        <div class="me-head-info">
          <div class="me-name" id="meName">${esc(auth.nickname || auth.phone || '用户')}</div>
          <div class="me-phone">${esc(auth.phone || '')}</div>
        </div>
        <button class="btn btn-ghost btn-sm" id="editProfileBtn">编辑</button>
      </div>
      <div class="nick-edit hidden" id="nickEdit">
        <input id="nickInput" maxlength="30" placeholder="昵称(最长 30 字)"/>
        <button class="btn btn-primary btn-sm" id="nickSave">保存</button>
        <button class="btn btn-ghost btn-sm" id="nickCancel">取消</button>
      </div>
      <input type="file" id="avatarFile" accept="image/*" class="hidden"/>
      <p class="hint" id="meStats" style="margin-top:10px">加载统计中…</p>
    </div>
    <div class="card">
      <h3>学习热力图</h3>
      <div class="hm-head">
        <p class="hint" style="margin:0">近 52 周打卡记录</p>
        <div class="hm-modes" id="hmModes">
          <button type="button" data-m="daily">每日</button>
          <button type="button" data-m="weekly">每周</button>
          <button type="button" data-m="total">累计</button>
        </div>
      </div>
      <div class="heatmap-scroll"><div class="heatmap-wrap"><div class="heatmap" id="heatmap"><span class="hint">加载中…</span></div><div class="hm-months" id="hmMonths"></div></div></div><div class="hm-tip" id="hmTip"></div>
      <div class="heat-legend"><span>少</span>
        <i style="background:#e8f0ec"></i><i style="background:#bfe0d4"></i><i style="background:#6fb9a4"></i><i style="background:#2f8d76"></i><i style="background:#0f6b5c"></i>
        <span>多</span>
      </div>
    </div>
    <div class="card" style="padding:4px 16px">
      <button class="me-row" id="securityBtn">账号安全<span class="me-row-arrow">›</span></button>
    </div>
    <div class="card">
      <button id="logoutBtn" class="btn btn-ghost" style="width:100%;color:var(--danger);border-color:var(--danger)">退出登录</button>
    </div>`;
  $('logoutBtn').addEventListener('click', () => {
    API.setAuth('', '', '');
    renderMe();
    refreshReviewBadge();
    toast('已退出');
  });
  $('securityBtn').addEventListener('click', () => goto('security'));

  // 拉档案:昵称/头像/统计/热力图数据
  (async () => {
    let pf;
    try { pf = await API.profile(); } catch (e) { $('meStats').textContent = '统计加载失败:' + e.message; return; }
    const head = $('meHead'); if (!head) return;
    if (pf.avatar) {
      const av = $('avatarBtn');
      av.style.backgroundImage = `url("${pf.avatar}")`;
      av.style.backgroundSize = 'cover';
      av.textContent = '';
    }
    if (pf.nickname) $('meName').textContent = pf.nickname;
    $('meStats').innerHTML = `单词本 <b>${pf.totalWords ?? 0}</b> 词 · 累计复习 <b>${pf.reviewDays ?? 0}</b> 天 · 每日目标 <b id="goalVal">${pf.daily_goal ?? 10}</b> 词 <button class="goal-edit" id="goalEditBtn">调整</button>`;
    const goalBtn = $('goalEditBtn');
    if (goalBtn) {
      goalBtn.addEventListener('click', () => {
        const input = document.createElement('input');
        input.type = 'number'; input.min = '1'; input.max = '1000'; input.value = $('goalVal').textContent;
        input.className = 'goal-input';
        $('goalVal').replaceWith(input);
        input.focus();
        const save = () => {
          const n = Math.max(1, Math.min(1000, +input.value || 10));
          API.profileUpdate({ daily_goal: n }).then(() => {
            renderMe();
            toast('每日目标已更新');
          }).catch((e) => { toast(e.message, true); renderMe(); });
        };
        input.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') save(); });
        input.addEventListener('blur', save);
      });
    }
    renderHeatmap($('heatmap'), pf.reviewDates || []);
  })();

  // 编辑昵称:App 内行内编辑(不依赖 WebView 对话框)
  $('editProfileBtn').addEventListener('click', () => {
    const cur = $('meName').textContent === (API.getAuth().phone) ? '' : $('meName').textContent;
    $('nickInput').value = cur;
    $('nickEdit').classList.remove('hidden');
    $('nickInput').focus();
  });
  $('nickCancel').addEventListener('click', () => $('nickEdit').classList.add('hidden'));
  const saveNick = () => {
    const nv = $('nickInput').value.trim().slice(0, 30);
    API.profileUpdate({ nickname: nv }).then(() => {
      API.setAuth(API.getToken(), API.getAuth().phone, nv);
      renderMe();
      refreshReviewBadge(); // 菜单上的登录态标签同步新昵称
      toast('昵称已更新');
    }).catch((e) => toast(e.message, true));
  };
  $('nickSave').addEventListener('click', saveNick);
  $('nickInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') saveNick(); });

  // 更换头像:系统文件选择 → canvas 压缩 512px JPEG → PUT profile
  $('avatarBtn').addEventListener('click', () => $('avatarFile').click());
  $('avatarFile').addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const size = 512;
        const canvas = document.createElement('canvas');
        const scale = Math.min(1, size / Math.max(img.width, img.height));
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        toast('上传中…');
        API.profileUpdate({ avatar: dataUrl }).then(() => {
          const av = $('avatarBtn');
          av.style.backgroundImage = `url("${dataUrl}")`;
          av.style.backgroundSize = 'cover';
          av.textContent = '';
          toast('头像已更新');
        }).catch((er) => toast(er.message, true));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  });
}

/** 52 周打卡热力图(与网页版同口径:reviewDates 按日计数,周日对齐) */
let hmMode = 'daily'; // daily 每日 | weekly 每周合计 | total 累计
try { hmMode = localStorage.getItem('tm.hmMode') || 'daily'; } catch (e) { /* 忽略 */ }

function renderHeatmap(el, reviewDates) {
  const dates = reviewDates || [];
  const counts = new Map();
  for (const d of dates) counts.set(d, (counts.get(d) ?? 0) + 1);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = new Date(today.getTime() - 51 * 7 * 86400000);
  start.setDate(start.getDate() - start.getDay()); // 对齐周日
  const levels = ['#e8f0ec', '#bfe0d4', '#6fb9a4', '#2f8d76', '#0f6b5c'];
  const CELL = 11, GAP = 3; // 与 .hm-cell/.heatmap 尺寸联动,月份标签按列定位
  const lv = (n) => n === 0 ? 0 : n === 1 ? 1 : n <= 3 ? 2 : n <= 6 ? 3 : 4;

  // 预生成 53 周 × 7 天
  const grid = [];
  const months = []; // {w, label}:某月 1 日所在的那一列标月份
  for (let w = 0; w < 53; w++) {
    const week = [];
    for (let d = 0; d < 7; d++) {
      const day = new Date(start.getTime() + (w * 7 + d) * 86400000);
      const key = day.getFullYear() + '-' + String(day.getMonth() + 1).padStart(2, '0') + '-' + String(day.getDate()).padStart(2, '0');
      week.push({ day, key, c: counts.get(key) ?? 0 });
    }
    grid.push(week);
    const first1 = week.find((x) => x.day.getDate() === 1 && x.day <= today);
    if (first1) months.push({ w, label: (first1.day.getMonth() + 1) + '月' });
  }

  // 各模式的颜色与提示文案
  const weekTotals = grid.map((week) => week.reduce((s, x) => s + x.c, 0));
  const totalAll = weekTotals.reduce((s, n) => s + n, 0);
  let cum = 0;
  const cells = [];
  grid.forEach((week, w) => {
    const ws = week[0].day, we = week[6].day;
    week.forEach((x) => {
      const future = x.day > today;
      let color = 'transparent', tip = '';
      if (!future) {
        if (hmMode === 'weekly') {
          const t = weekTotals[w];
          color = levels[lv(t)];
          tip = `${ws.getMonth() + 1}月${ws.getDate()}日~${we.getMonth() + 1}月${we.getDate()}日 · 本周背词 ${t} 次`;
        } else if (hmMode === 'total') {
          cum += x.c;
          const ratio = totalAll ? cum / totalAll : 0;
          color = levels[ratio === 0 ? 0 : ratio < 0.25 ? 1 : ratio < 0.5 ? 2 : ratio < 0.75 ? 3 : 4];
          tip = `${x.key.replace(/-/g, '/')} · 累计背词 ${cum} 次`;
        } else {
          color = levels[lv(x.c)];
          tip = `${x.key.replace(/-/g, '/')} · ${x.c ? '背词 ' + x.c + ' 次' : '未打卡'}`;
        }
      }
      cells.push(`<i class="hm-cell${future ? ' future' : ''}" data-tip="${esc(tip)}" style="background:${color}" title="${esc(tip)}"></i>`);
    });
  });

  let html = '';
  for (let w = 0; w < 53; w++) html += '<div class="hm-week">' + cells.slice(w * 7, w * 7 + 7).join('') + '</div>';
  el.innerHTML = html;
  const wrap = el.parentElement;
  wrap.querySelector('.hm-months').innerHTML =
    months.map((m) => `<span style="left:${m.w * (CELL + GAP)}px">${m.label}</span>`).join('');
  // 模式按钮选中态
  document.querySelectorAll('#hmModes button').forEach((b) => b.classList.toggle('active', b.dataset.m === hmMode));
  // 默认滚动到最右:一眼看到当前月份,向左滑看过去
  const scrollEl = wrap.parentElement;
  scrollEl.scrollLeft = scrollEl.scrollWidth;
  // 点击格子:信息条(滚动区外)显示日期与打卡次数(title 悬浮仅桌面可用)
  const tip = document.getElementById('hmTip');
  el.onclick = (e) => {
    const cell = e.target.closest('.hm-cell');
    if (!cell || cell.classList.contains('future') || !cell.dataset.tip) { tip.classList.remove('show'); return; }
    tip.textContent = cell.dataset.tip;
    tip.classList.add('show');
  };
  // 模式切换(每次 renderMe 重建按钮,需重绑)
  const modes = document.getElementById('hmModes');
  modes.onclick = (e) => {
    const b = e.target.closest('button[data-m]');
    if (!b || b.dataset.m === hmMode) return;
    hmMode = b.dataset.m;
    try { localStorage.setItem('tm.hmMode', hmMode); } catch (err) { /* 忽略 */ }
    renderHeatmap(el, dates);
  };
}

/* ================= 单词本 ================= */
// 展示顺序:'alpha' 按首字母(默认) | 'random' 乱序;乱序结果在单词集合不变时保持稳定
let wbMode = 'alpha';
try { wbMode = localStorage.getItem('tm.wbMode') || 'alpha'; } catch (e) { /* 忽略 */ }
let wbShuffled = null;
const wbMeaningTried = new Set(); // 本会话已补拉过释义的词,防止查不到的词死循环重拉
let wbGen = 0; // 渲染代际:切页/重渲染后作废后台补拉任务
const WB_ORDER_ICONS = {
  alpha: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h13M3 12h9M3 18h5"/><path d="M17 8v10"/><path d="M14 15l3 3 3-3"/></svg>',
  random: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="4" y1="4" x2="9" y2="9"/></svg>',
};
function wbOrderList(sorted) {
  if (wbMode === 'random') {
    const sig = sorted.map((x) => x.word).join('|');
    if (!wbShuffled || wbShuffled.sig !== sig) {
      const arr = [...sorted];
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      wbShuffled = { sig, arr };
    }
    return wbShuffled.arr;
  }
  return [...sorted].sort((a, b) => String(a.word).localeCompare(String(b.word)));
}

async function renderWordbook() {
  const body = $('wordbookBody');
  const cached = API.wbCache();
  if (!API.getToken()) { goto('me'); toast('先登录后再使用'); return; }
  body.innerHTML = `<p class="hint" style="padding:20px 0;text-align:center">加载中…</p>`;
  let list = cached;
  try { list = await API.wbSync(); } catch (e) {
    if (!cached.length) {
      body.innerHTML = `<div class="empty">${esc(e.message)}<br/><button class="btn btn-ghost btn-sm" style="margin-top:14px" id="wbRetry">重试</button></div>`;
      $('wbRetry').addEventListener('click', renderWordbook);
      return;
    }
    toast('离线中,展示本地缓存');
  }
  if (!list.length) {
    body.innerHTML = '<div class="empty">单词本还是空的<br/>去首页查一个单词吧</div>';
    return;
  }
  const sorted = [...list].sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
  const ordered = wbOrderList(sorted);
  body.innerHTML = `
    <div class="wb-toolbar">
      <p class="hint">共 ${ordered.length} 个单词,点击可发音,往左滑删除</p>
      <button class="wb-order" id="wbOrderBtn" aria-label="${wbMode === 'alpha' ? '当前按首字母排序,点击切换乱序' : '当前乱序,点击切换首字母排序'}">${WB_ORDER_ICONS[wbMode]}</button>
    </div>
    <div class="card" style="padding:0 16px;overflow:hidden">
      ${ordered.map((x) => {
        const c = API.lookupCache(x.word);
        const zh = c && (c.translation || (c.groups || [])[0]?.meanings?.join(';') || '').split('\n')[0].slice(0, 30) || '';
        return `<div class="wb-item">
          <div class="wb-swipe" data-w="${esc(x.word)}">
            <div class="wb-content">
              <div class="wb-word">${esc(x.word)}</div>
              ${zh ? `<div class="wb-zh">${esc(zh)}</div>` : ''}
            </div>
            <button class="wb-del-btn" data-w="${esc(x.word)}">删除</button>
          </div>
        </div>`;
      }).join('')}
    </div>`;
  bindSwipe(body);
  $('wbOrderBtn').addEventListener('click', () => {
    wbMode = wbMode === 'alpha' ? 'random' : 'alpha';
    if (wbMode === 'random') wbShuffled = null; // 每次切到乱序都重新洗一次
    try { localStorage.setItem('tm.wbMode', wbMode); } catch (e) { /* 忽略 */ }
    renderWordbook();
  });
  // 缺释义的词(如从其他设备同步)后台逐个补拉,完成后刷新一次;限流 30 次/分钟,间隔 2.1s
  const gen = ++wbGen;
  const missing = ordered.map((x) => x.word).filter((w) => !API.lookupCache(w) && !wbMeaningTried.has(w));
  if (missing.length) {
    (async () => {
      for (const w of missing) {
        if (gen !== wbGen) return; // 页面已重渲染或切走
        wbMeaningTried.add(w);
        try { await API.lookup(w); } catch (e) { /* 失败本会话不再重试,避免死循环 */ }
        if (gen !== wbGen) return;
        await new Promise((r) => setTimeout(r, 2100));
      }
      if (gen === wbGen && curPage === 'wordbook') renderWordbook();
    })();
  }
}

/** 左滑删除手势:条目左移露出红色删除按钮;点其他区域复位(Pointer Events,触摸/鼠标统一) */
function bindSwipe(container) {
  container.querySelectorAll('.wb-del-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      API.wbLocalRemove(btn.dataset.w);
      syncWbQuiet();
      renderWordbook();
    });
  });
  container.querySelectorAll('.wb-content').forEach((el) => {
    let x0 = null, dx = 0, open = false, dragged = false;
    const swipe = el.parentElement;
    const setReveal = (v) => swipe.classList.toggle('reveal', v); // reveal 才绘制删除按钮
    setReveal(false); // 闭合态不绘制按钮,杜绝共边渗色
    const reset = () => { dx = 0; el.style.transform = ''; open = false; setReveal(false); };
    el.addEventListener('pointerdown', (e) => { x0 = e.clientX - dx; dragged = false; });
    el.addEventListener('pointermove', (e) => {
      if (x0 === null) return;
      const ndx = Math.min(0, Math.max(-84, e.clientX - x0));
      if (ndx < dx && ndx < -1) setReveal(true); // 开始左滑才亮出按钮
      if (Math.abs(ndx - dx) > 3) dragged = true;
      dx = ndx;
      el.style.transform = `translateX(${dx}px)`;
    });
    const end = () => {
      if (x0 === null) return;
      open = dx <= -50;
      dx = open ? -84 : 0; // 吸附到删除按钮全宽(84px),视觉上"占满"
      el.style.transform = dx ? `translateX(${dx}px)` : '';
      if (!open) setReveal(false); // CSS 延迟 .17s 隐藏,等回弹播完
      x0 = null;
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('click', (e) => {
      if (e.target.closest('.wb-del-btn')) return;
      if (dragged || open) { dragged = false; if (open) reset(); return; } // 滑动后点击=复位,不发音
      speak(el.querySelector('.wb-word')?.textContent || '');
    });
  });
}

/* ================= 背单词(状态机见设计文档 §1) ================= */
const RV = {
  queue: [], idx: 0, total: 0,
  goal: 10, goalShown: false, // 每日目标:达标时弹一次"继续/结束"
  lastQueue: [],              // 本轮词单,完成页"重新背诵"用
  stats: { done: 0, r1: 0, r4: 0 },
  submitting: false,
  prefetching: false,
};

async function renderReview() {
  const body = $('reviewBody');
  if (!API.getToken()) {
    body.innerHTML = `
      <div class="rv-done">
        <div class="big">📇</div>
        <h2>背单词</h2>
        <p>登录后同步你的复习进度</p>
        <button class="btn btn-primary" style="margin-top:20px" id="rvLogin">去登录</button>
      </div>`;
    $('rvLogin').addEventListener('click', () => goto('me'));
    return;
  }
  body.innerHTML = `
    <div class="rv-top"><div class="rv-progress"><i style="width:0%"></i></div><span class="rv-count">…</span></div>
    <div class="rv-card" style="justify-content:center"><p class="hint">正在获取今日队列…</p></div>`;
  try {
    const r = await API.reviewToday();
    RV.queue = (r.queue || []).map((q) => q.word);
    RV.total = r.dueToday || RV.queue.length;
    RV.idx = 0;
    RV.stats = { done: 0, r1: 0, r4: 0 };
    RV.goalShown = false;
    API.profile().then((pf) => { RV.goal = pf.daily_goal || 10; }).catch(() => { /* 保持默认 10 */ });
    if (!RV.queue.length) { renderReviewDone(true); return; }
    renderCardFace();
    prefetchNext();
  } catch (e) {
    body.innerHTML = `
      <div class="rv-done">
        <h2>网络不可用</h2>
        <p>${esc(e.message)}</p>
        <button class="btn btn-ghost" style="margin-top:20px" id="rvRetry">重试</button>
      </div>`;
    $('rvRetry').addEventListener('click', renderReview);
  }
}

/** 串行预取队列前 2 张释义(限流保护:间隔 ≥300ms);翻卡时兜底再拉 */
function prefetchNext() {
  if (RV.prefetching) return;
  RV.prefetching = true;
  (async () => {
    for (const w of RV.queue.slice(RV.idx, RV.idx + 2)) {
      if (!API.lookupCache(w)) {
        try { await API.lookup(w); } catch (e) { /* 预取失败不重试 */ }
        await new Promise((res) => setTimeout(res, 320));
      }
    }
    RV.prefetching = false;
  })();
}

function currentCard() { return RV.queue[RV.idx] || ''; }

function renderCardFace() {
  const word = currentCard();
  if (!word) { renderReviewDone(); return; }
  const done = RV.stats.done;
  const pct = RV.total ? Math.round((done / RV.total) * 100) : 0;
  const info = API.lookupCache(word);
  $('reviewBody').innerHTML = `
    <div class="rv-top">
      <button class="btn btn-ghost btn-sm" id="rvBack">←</button>
      <div class="rv-progress"><i style="width:${pct}%"></i></div>
      <span class="rv-count">${done}/${RV.total}</span>
    </div>
    <div class="rv-card" id="rvCard">
      <h1 class="lr-word">${esc(word)}</h1>
      <span class="lr-phon">${info && info.phonetic ? '/' + esc(info.phonetic.replace(/^\/|\/$/g, '')) + '/' : '&nbsp;'}</span>
      <div class="rv-tip">点击卡片查看释义</div>
    </div>
    <div class="rv-ratings hidden" id="rvRatings">
      <button class="rv-rate" data-r="1" style="color:#D93025">忘记</button>
      <button class="rv-rate" data-r="2" style="color:#E8710A">困难</button>
      <button class="rv-rate primary-rate" data-r="3">良好</button>
      <button class="rv-rate" data-r="4" style="color:#1A73E8">轻松</button>
    </div>`;
  $('rvBack').addEventListener('click', () => goto('home'));
  $('rvCard').addEventListener('click', flipCard);
  // 翻面 DOM 预渲染(设计 §2:背面在正面时就渲染,翻面零延迟)
  RV.backRendered = false;
  prefetchNext();
}

async function flipCard() {
  const card = $('rvCard');
  if (!card || card.dataset.flipped) return;
  card.dataset.flipped = '1';
  const word = currentCard();
  card.innerHTML = `<p class="hint">释义加载中…</p>`;
  let d = API.lookupCache(word);
  if (!d) {
    try { d = (await API.lookup(word)).data; }
    catch (e) {
      card.innerHTML = `
        <p class="hint">词典未收录或网络失败,仅可评分</p>
        <p class="hint"><button class="btn btn-ghost btn-sm" id="rvDefRetry">重试释义</button></p>`;
      const rb = $('rvDefRetry');
      if (rb) rb.addEventListener('click', (ev) => { ev.stopPropagation(); card.dataset.flipped = ''; flipCard(); });
      $('rvRatings').classList.remove('hidden');
      bindRates();
      return;
    }
  }
  card.innerHTML = `
    <div class="back">
      <div class="lr-head" style="text-align:center">
        <span class="lr-word" style="font-size:20px">${esc(d.word || word)}</span>
        ${d.phonetic ? `<span class="lr-phon">/${esc(d.phonetic.replace(/^\/|\/$/g, ''))}/</span>` : ''}
      </div>
      <div style="margin-top:14px">${renderLookup(d, { compact: true, noHead: true })}</div>
    </div>
    <div class="rv-tip">听完记得怎么样?在下面选一个</div>`;
  card.style.justifyContent = 'flex-start';
  card.style.overflowY = 'auto';
  $('rvRatings').classList.remove('hidden');
  bindRates();
}

function bindRates() {
  document.querySelectorAll('.rv-rate').forEach((b) => {
    b.addEventListener('click', () => submitRate(+b.dataset.r));
  });
}

async function submitRate(rating) {
  if (RV.submitting) return; // 防双击
  RV.submitting = true;
  document.querySelectorAll('.rv-rate').forEach((b) => (b.disabled = true));
  const word = currentCard();
  try {
    await API.reviewCard(word, rating);
    RV.stats.done += 1;
    if (rating === 1) RV.stats.r1 += 1;
    if (rating === 4) RV.stats.r4 += 1;
    RV.idx += 1;
    RV.submitting = false;
    addRatedToday(word); // 记录今日已背,供"重新背诵"随时重走(即使跨会话)
    if (RV.idx >= RV.queue.length) renderReviewDone();
    else if (!RV.goalShown && RV.goal && RV.stats.done >= RV.goal) renderGoalDialog(); // 达到每日目标:询问继续或结束
    else renderCardFace();
  } catch (e) {
    RV.submitting = false;
    document.querySelectorAll('.rv-rate').forEach((b) => (b.disabled = false));
    toast(e.code === 'AUTH' ? e.message : '评分未保存,请再按一次', 2500);
  }
}

/** 达到每日目标:让用户选择继续背剩余的,还是到此结束 */
function renderGoalDialog() {
  RV.goalShown = true;
  const remain = RV.queue.length - RV.idx;
  $('reviewBody').innerHTML = `
    <div class="rv-done">
      <div class="big">🎯</div>
      <h2>今日目标达成</h2>
      <p>已完成 <b>${RV.stats.done}</b> 词(目标 ${RV.goal} 词),还剩 ${remain} 词。</p>
      <button class="btn btn-primary" style="margin-top:24px" id="goalContinue">继续背诵</button>
      <button class="btn btn-ghost" style="margin-top:10px" id="goalFinish">结束背诵</button>
    </div>`;
  $('goalContinue').addEventListener('click', renderCardFace);
  $('goalFinish').addEventListener('click', () => renderReviewDone());
}

/** 今日已背词单(本地记录,跨会话;日期变了自动作废) */
function ratedTodayList() {
  try {
    const rec = JSON.parse(localStorage.getItem('tm.ratedToday') || 'null');
    const t = new Date();
    const today = t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0');
    if (rec && rec.date === today) return rec.words || [];
  } catch (e) { /* 忽略 */ }
  return [];
}
function addRatedToday(word) {
  const words = ratedTodayList();
  if (!words.includes(word)) words.push(word);
  const t = new Date();
  const date = t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0');
  try { localStorage.setItem('tm.ratedToday', JSON.stringify({ date, words })); } catch (e) { /* 忽略 */ }
}

function renderReviewDone(emptyQueue) {
  const s = RV.stats;
  // "重新背诵"词池:本轮背过的队列优先;空队列(如重启后再进)用今日已背记录兜底
  const fromSession = RV.queue.length > 0 && (s.done > 0 || RV.idx > 0);
  const restartPool = fromSession ? [...RV.queue] : (emptyQueue ? ratedTodayList() : []);
  RV.lastQueue = restartPool;
  // 自动打卡(已打卡则服务端幂等忽略;失败静默,不打扰)
  if (API.getToken()) {
    API.checkinStatus().then((cs) => { if (!cs.checkedIn) return API.checkin(); })
      .then(() => {}).catch(() => {});
  }
  $('reviewBody').innerHTML = `
    <div class="rv-done">
      <div class="big">🌱</div>
      <h2>今日已清空</h2>
      <p>复习完成,剩下的交给时间。</p>
      ${!emptyQueue && s.done ? `<p style="margin-top:10px">本轮 ${s.done} 张 · 忘记 ${s.r1} · 轻松 ${s.r4}</p>` : ''}
      ${emptyQueue ? '<p style="margin-top:10px">今天的队列空空如也</p>' : ''}
      ${restartPool.length ? '<button class="btn btn-primary" style="margin-top:24px" id="rvRestart">重新背诵</button>' : ''}
      <button class="btn btn-ghost btn-sm" style="margin-top:12px" id="rvHome">返回首页</button>
    </div>`;
  $('rvHome').addEventListener('click', () => goto('home'));
  const restart = $('rvRestart');
  if (restart) {
    restart.addEventListener('click', () => {
      RV.queue = [...restartPool];
      RV.idx = 0;
      RV.total = RV.queue.length;
      RV.stats = { done: 0, r1: 0, r4: 0 };
      RV.goalShown = false;
      renderCardFace();
      prefetchNext();
    });
  }
  refreshReviewBadge();
}

/** 菜单上的待复习数徽标 + 登录态 label */
async function refreshReviewBadge() {
  const auth = API.getAuth();
  $('meLabel').textContent = auth.token ? (auth.nickname || auth.phone || '已登录') : '登录 / 注册';
  if (!auth.token) { $('miReviewCount').classList.add('hidden'); return; }
  try {
    const r = await API.reviewToday();
    const n = r.dueToday || 0;
    $('miReviewCount').textContent = n;
    $('miReviewCount').classList.toggle('hidden', n === 0);
  } catch (e) { /* 静默 */ }
}

/* ================= 账号安全(选项页) ================= */
function renderSecurity() {
  $('securityBody').innerHTML = `
    <div class="card" style="padding:4px 16px">
      <button class="me-row" id="toPasswordBtn">修改密码<span class="me-row-arrow">›</span></button>
    </div>`;
  $('toPasswordBtn').addEventListener('click', () => goto('password'));
}

/* ================= 修改密码(表单页) ================= */
function renderPassword() {
  const body = $('passwordBody');
  body.innerHTML = `
    <div class="card">
      <p class="hint">设置后可用手机号+密码登录,无需验证码</p>
      <div class="field"><label>新密码(至少 4 位)</label>
        <input id="pwdNew" type="password" placeholder="新密码"/></div>
      <div class="field"><label>确认新密码</label>
        <input id="pwdConfirm" type="password" placeholder="再输一次"/></div>
      <button id="pwdSaveBtn" class="btn btn-primary" style="width:100%">保存密码</button>
      <p class="error-text hidden" id="pwdErr"></p>
    </div>`;
  $('pwdSaveBtn').addEventListener('click', async () => {
    const p1 = $('pwdNew').value, p2 = $('pwdConfirm').value;
    const err = $('pwdErr');
    const fail = (m) => { err.textContent = m; err.classList.remove('hidden'); };
    if (p1.length < 4) return fail('密码至少 4 位');
    if (p1 !== p2) return fail('两次输入的密码不一致');
    const btn = $('pwdSaveBtn');
    btn.disabled = true; btn.textContent = '保存中…';
    try {
      await API.passwordUpdate(p1);
      err.classList.add('hidden');
      $('pwdNew').value = ''; $('pwdConfirm').value = '';
      toast('密码已更新,下次可用密码登录');
    } catch (e) {
      fail(e.message);
    } finally {
      btn.disabled = false; btn.textContent = '保存密码';
    }
  });
}

/* ================= 启动 ================= */
API.setOn401(() => {
  goto('me');
  refreshReviewBadge(); // 菜单标签回到"登录 / 注册"
  toast('登录已过期,请重新登录');
});

/** Android 返回键:返回 'exit' 才退出;否则消费(关菜单/回首页) */
window.onAndroidBack = () => {
  if (!$('menuPop').classList.contains('hidden')) { closeMenu(); return 'stay'; }
  return goBack();
};

function init() {
  try { window.AndroidBridge && AndroidBridge.saveToken(API.getToken()); } catch (e) { /* 浏览器 */ }
  renderRecent();
  // 小组件深链:直接聚焦搜索框
  let focused = false;
  try {
    const focus = window.AndroidBridge && AndroidBridge.consumeLaunchFocus && AndroidBridge.consumeLaunchFocus();
    focused = focus === 'search';
  } catch (e) { /* 浏览器 */ }
  goto('home');
  if (focused) setTimeout(() => $('searchInput').focus(), 200);
  if (API.getToken()) {
    refreshReviewBadge();
    syncWbQuiet();
  }
  // 回到前台刷新徽标与同步
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && API.getToken()) {
      refreshReviewBadge();
      syncWbQuiet();
    }
  });
}
init();
