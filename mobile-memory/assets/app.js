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
const PAGES = ['home', 'review', 'wordbook', 'me', 'about'];
let curPage = 'home';
function goto(page) {
  curPage = page;
  PAGES.forEach((p) => $('page-' + p).classList.toggle('active', p === page));
  closeMenu();
  $('tbTitle').textContent = page === 'home' ? '明日记忆' : page === 'review' ? '背单词'
    : page === 'wordbook' ? '单词本' : page === 'me' ? '我的' : '关于';
  if (page === 'review') renderReview();
  if (page === 'wordbook') renderWordbook();
  if (page === 'me') renderMe();
  if (page === 'home') setTimeout(() => $('searchInput').focus(), 80);
}

/* 汉堡菜单 */
function openMenu() { $('menuMask').classList.remove('hidden'); $('menuPop').classList.remove('hidden'); }
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

  return `
    <div class="lr">
      ${noHead ? '' : `<div class="lr-head">
        <h1 class="lr-word">${esc(d.word)}</h1>
        ${d.phonetic ? `<span class="lr-phon">/${esc(d.phonetic.replace(/^\/|\/$/g, ''))}/</span>` : ''}
      </div>`}
      ${groups
        ? `<div class="lr-groups">${groups.map((g, gi) => `
            <div class="lr-group">
              ${g.pos ? `<span class="lr-pos">${esc(g.pos)}</span>` : ''}
              <p class="lr-mean${gi === 0 ? ' lr-primary' : ''}">${esc((g.meanings || []).join(';'))}</p>
            </div>`).join('')}</div>`
        : fallbackMeans.map((m, mi) => `<p class="lr-mean${mi === 0 ? ' lr-primary' : ''}" style="margin-top:8px">${esc(m)}</p>`).join('')}
      ${d.definition && !compact ? `<p class="lr-def">${esc(d.definition)}</p>` : ''}
      ${ex.length ? `<div class="lr-examples">
        <p class="lr-sec-title">例句</p>
        ${ex.map((x) => `<div class="lr-ex">
          <p class="lr-ex-en">${esc(x.en)}</p>
          ${x.zh ? `<p class="lr-ex-zh">${esc(x.zh)}</p>` : ''}
        </div>`).join('')}
      </div>` : ''}
      ${exch.length ? `<details class="lr-more"><summary>词形变化</summary>
        <div class="lr-exch">${exch.map((x) => `<span class="lr-exch-item">${x}</span>`).join('')}</div>
      </details>` : ''}
    </div>`;
}

/* ================= 首页查词 ================= */
let lastLookupWord = '';

async function doLookup(word) {
  word = (word || '').trim();
  if (!word) return;
  $('searchInput').blur();
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
    $('lookupResult').innerHTML = renderLookup(data, false)
      + `<div class="lr-actions">
          <button class="btn btn-primary grow" id="wbAddBtn">加入单词本</button>
          <button class="btn btn-ghost" id="wbSpeakBtn">发音</button>
        </div>`;
    // 自动加入单词本(重复查不重复提示)
    const already = API.wbCache().some((x) => x.word === lastLookupWord);
    if (!already) {
      API.wbLocalAdd(lastLookupWord);
      toast('已加入单词本');
      syncWbQuiet();
    }
    $('wbAddBtn').addEventListener('click', () => {
      API.wbLocalAdd(lastLookupWord);
      syncWbQuiet();
      toast(already ? '已在单词本中' : '已加入单词本');
    });
    $('wbSpeakBtn').addEventListener('click', () => speak(lastLookupWord));
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
        <p class="hint">手机号 + 验证码;已有密码也可直接用密码登录。数据保存在云端,与网页版 tmword.xyz 互通</p>
        <div class="field"><label>手机号</label>
          <input id="loginPhone" type="tel" maxlength="11" placeholder="13xxxxxxxxx" inputmode="numeric"/></div>
        <div class="ev-grid2" style="display:grid;grid-template-columns:1fr 110px;gap:8px">
          <div class="field"><label>验证码</label>
            <input id="loginCode" type="number" inputmode="numeric" placeholder="6 位验证码"/></div>
          <div class="field"><label>&nbsp;</label>
            <button id="sendCodeBtn" class="btn btn-ghost" style="width:100%">发送验证码</button></div>
        </div>
        <div class="field"><label>密码(已设置过才填,可留空用验证码)</label>
          <input id="loginPwd" type="password" placeholder="可选"/></div>
        <button id="loginBtn" class="btn btn-primary" style="width:100%">登录</button>
        <p class="error-text hidden" id="loginErr"></p>
      </div>`;
    const phoneEl = $('loginPhone'), codeEl = $('loginCode'), pwdEl = $('loginPwd');
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
      const code = codeEl.value.trim();
      const pwd = pwdEl.value;
      if (!/^1[3-9]\d{9}$/.test(phone)) { showLoginErr('请输入正确的手机号'); return; }
      if (!pwd && !code) { showLoginErr('请填验证码或密码'); return; }
      const btn = $('loginBtn');
      btn.disabled = true; btn.textContent = '登录中…';
      try {
        const r = await API.login(phone, code, pwd);
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
    function showLoginErr(m) { const el = $('loginErr'); el.textContent = m; el.classList.remove('hidden'); }
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
      <input type="file" id="avatarFile" accept="image/*" class="hidden"/>
      <p class="hint" id="meStats" style="margin-top:10px">加载统计中…</p>
    </div>
    <div class="card">
      <h3>学习热力图</h3>
      <p class="hint" style="margin-bottom:8px" id="heatHint">近 52 周打卡记录</p>
      <div class="heatmap-scroll"><div class="heatmap" id="heatmap"><span class="hint">加载中…</span></div></div>
      <div class="heat-legend"><span>少</span>
        <i style="background:#e8f0ec"></i><i style="background:#bfe0d4"></i><i style="background:#6fb9a4"></i><i style="background:#2f8d76"></i><i style="background:#0f6b5c"></i>
        <span>多</span>
      </div>
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
    $('meStats').innerHTML = `单词本 <b>${pf.totalWords}</b> 词 · 累计复习 <b>${pf.reviewDays}</b> 天 · 每日目标 <b>${pf.daily_goal}</b> 词`;
    renderHeatmap($('heatmap'), pf.reviewDates || []);
  })();

  // 编辑昵称
  $('editProfileBtn').addEventListener('click', () => {
    const name = $('meName').textContent === (API.getAuth().phone) ? '' : $('meName').textContent;
    const v = prompt('昵称(最长 30 字)', name || '');
    if (v === null) return;
    const nv = v.trim().slice(0, 30);
    API.profileUpdate({ nickname: nv }).then(() => {
      API.setAuth(API.getToken(), API.getAuth().phone, nv);
      renderMe();
      toast('昵称已更新');
    }).catch((e) => toast(e.message, true));
  });

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
function renderHeatmap(el, reviewDates) {
  const counts = new Map();
  for (const d of reviewDates) counts.set(d, (counts.get(d) ?? 0) + 1);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = new Date(today.getTime() - 51 * 7 * 86400000);
  start.setDate(start.getDate() - start.getDay()); // 对齐周日
  const levels = ['#e8f0ec', '#bfe0d4', '#6fb9a4', '#2f8d76', '#0f6b5c'];
  let html = '';
  for (let w = 0; w < 53; w++) {
    html += '<div class="hm-week">';
    for (let d = 0; d < 7; d++) {
      const day = new Date(start.getTime() + (w * 7 + d) * 86400000);
      const key = day.getFullYear() + '-' + String(day.getMonth() + 1).padStart(2, '0') + '-' + String(day.getDate()).padStart(2, '0');
      const c = counts.get(key) ?? 0;
      const lv = c === 0 ? 0 : c === 1 ? 1 : c <= 3 ? 2 : c <= 6 ? 3 : 4;
      const future = day > today;
      html += `<i class="hm-cell${future ? ' future' : ''}" style="background:${future ? 'transparent' : levels[lv]}" title="${key}${c ? ' · ' + c + ' 次' : ''}"></i>`;
    }
    html += '</div>';
  }
  el.innerHTML = html;
}

/* ================= 单词本 ================= */
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
  body.innerHTML = `
    <p class="hint" style="margin:6px 2px 10px">共 ${sorted.length} 个单词,点击可发音,往左滑删除</p>
    <div class="card" style="padding:0 16px">
      ${sorted.map((x) => {
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
    const reset = () => { dx = 0; el.style.transform = ''; open = false; };
    el.addEventListener('pointerdown', (e) => { x0 = e.clientX - dx; dragged = false; });
    el.addEventListener('pointermove', (e) => {
      if (x0 === null) return;
      const ndx = Math.min(0, Math.max(-84, e.clientX - x0));
      if (Math.abs(ndx - dx) > 3) dragged = true;
      dx = ndx;
      el.style.transform = `translateX(${dx}px)`;
    });
    const end = () => {
      if (x0 === null) return;
      open = dx <= -50;
      dx = open ? -72 : 0;
      el.style.transform = dx ? `translateX(${dx}px)` : '';
      x0 = null;
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('click', () => {
      if (dragged || open) { dragged = false; if (open) reset(); return; } // 滑动后点击=复位,不发音
      speak(el.querySelector('.wb-word')?.textContent || '');
    });
  });
}

/* ================= 背单词(状态机见设计文档 §1) ================= */
const RV = {
  queue: [], idx: 0, total: 0,
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
    if (RV.idx >= RV.queue.length) renderReviewDone();
    else renderCardFace();
  } catch (e) {
    RV.submitting = false;
    document.querySelectorAll('.rv-rate').forEach((b) => (b.disabled = false));
    toast(e.code === 'AUTH' ? e.message : '评分未保存,请再按一次', 2500);
  }
}

function renderReviewDone(emptyQueue) {
  const s = RV.stats;
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
      <button class="btn btn-ghost" style="margin-top:24px" id="rvHome">返回首页</button>
    </div>`;
  $('rvHome').addEventListener('click', () => goto('home'));
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

/* ================= 启动 ================= */
API.setOn401(() => {
  goto('me');
  toast('登录已过期,请重新登录');
});

/** Android 返回键:返回 'exit' 才退出;否则消费(关菜单/回首页) */
window.onAndroidBack = () => {
  if (!$('menuPop').classList.contains('hidden')) { closeMenu(); return 'stay'; }
  if (curPage !== 'home') { goto('home'); return 'stay'; }
  return 'exit';
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
