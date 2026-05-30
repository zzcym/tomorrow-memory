// ===== DOM 元素 =====
const tabLookup = document.getElementById('tabLookup');
const tabReview = document.getElementById('tabReview');
const panelLookup = document.getElementById('panelLookup');
const panelReview = document.getElementById('panelReview');
const searchInput = document.getElementById('searchInput');
const searchBtn = document.getElementById('searchBtn');
const resultArea = document.getElementById('resultArea');
const flashcardArea = document.getElementById('flashcardArea');
const openWordbookBtn = document.getElementById('openWordbookBtn');
const closeWordbookBtn = document.getElementById('closeWordbookBtn');
const wordbook = document.getElementById('wordbook');
const overlay = document.getElementById('overlay');
const wordbookList = document.getElementById('wordbookList');
const wordCount = document.getElementById('wordCount');
const clearAllBtn = document.getElementById('clearAllBtn');
const toast = document.getElementById('toast');
const toastMsg = document.getElementById('toastMsg');
const toastUndo = document.getElementById('toastUndo');
const resizeHandle = document.getElementById('wordbookResizeHandle');
const btnLogin = document.getElementById('btnLogin');
const authModal = document.getElementById('authModal');
const authForm = document.getElementById('authForm');
const authPhone = document.getElementById('authPhone');
const authCode = document.getElementById('authCode');
const sendCodeBtn = document.getElementById('sendCodeBtn');
const authSubmit = document.getElementById('authSubmit');
const authError = document.getElementById('authError');
const closeAuthBtn = document.getElementById('closeAuthBtn');

// ===== 状态 =====
let wordbookData = [];
let undoWord = null;
let undoTimer = null;
let currentCardIndex = 0;
let reviewOrder = [];
let reviewMode = loadReviewMode();
let isCardAnimating = false;
let authToken = localStorage.getItem('authToken') || '';
let isLoggedIn = false;
let codeTimer = null;
let syncTimer = null;

const API_BASE = '';
const translationCache = {};
const MODE_LABELS = {
  sequential: '顺序背诵',
  random: '随机背诵',
  spaced: '间隔背诵',
};
const MODE_DESC = {
  sequential: '按加入顺序依次背诵',
  random: '随机打乱顺序背诵',
  spaced: '优先复习最久未背的单词',
};

// ===== 初始化 =====
initButtonPosition();
initAuth().then(() => {
  renderWordbook();
  updateBadge();
  buildReviewOrder();
  renderFlashcard();
});

// ===== Tab 切换 =====
tabLookup.addEventListener('click', () => switchTab('lookup'));
tabReview.addEventListener('click', () => switchTab('review'));

function switchTab(tab) {
  if (tab === 'lookup') {
    tabLookup.classList.add('active');
    tabReview.classList.remove('active');
    panelLookup.classList.add('active');
    panelReview.classList.remove('active');
    searchInput.focus();
  } else {
    tabReview.classList.add('active');
    tabLookup.classList.remove('active');
    panelReview.classList.add('active');
    panelLookup.classList.remove('active');
    currentCardIndex = 0;
    buildReviewOrder();
    renderFlashcard();
  }
}

// ===== 事件监听 =====
searchBtn.addEventListener('click', () => lookupWord());
searchInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') lookupWord();
});

openWordbookBtn.addEventListener('mousedown', onBtnDragStart);
openWordbookBtn.addEventListener('touchstart', onBtnDragStart, { passive: false });
openWordbookBtn.addEventListener('click', onBtnClick);
closeWordbookBtn.addEventListener('click', closeWordbook);
overlay.addEventListener('click', closeWordbook);
clearAllBtn.addEventListener('click', clearAll);
toastUndo.addEventListener('click', handleUndo);
resizeHandle.addEventListener('mousedown', onResizeStart);
resizeHandle.addEventListener('touchstart', onResizeStart, { passive: false });

btnLogin.addEventListener('click', () => {
  if (isLoggedIn) {
    logout();
  } else {
    showAuthModal();
  }
});
closeAuthBtn.addEventListener('click', hideAuthModal);
authModal.addEventListener('click', (e) => { if (e.target === authModal) hideAuthModal(); });
authForm.addEventListener('submit', handleAuth);
sendCodeBtn.addEventListener('click', sendCode);

document.addEventListener('keydown', onKeyboard);

// ===== 认证 =====
function showAuthModal() {
  authModal.classList.remove('hidden');
  authPhone.value = '';
  authCode.value = '';
  authError.classList.add('hidden');
  authSubmit.disabled = false;
  authSubmit.textContent = '登录 / 注册';
  resetCodeBtn();
  authPhone.focus();
}

function hideAuthModal() {
  authModal.classList.add('hidden');
  clearInterval(codeTimer);
}

function sendCode() {
  const phone = authPhone.value.trim();
  if (!/^1[3-9]\d{9}$/.test(phone)) {
    authError.textContent = '请输入正确的手机号';
    authError.classList.remove('hidden');
    return;
  }
  authError.classList.add('hidden');
  sendCodeBtn.disabled = true;

  fetch(API_BASE + '/api/send-code', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone }),
  }).then(resp => resp.json()).then(data => {
    if (!data.ok) {
      authError.textContent = data.error || '发送失败';
      authError.classList.remove('hidden');
      resetCodeBtn();
      return;
    }
    startCodeCountdown();
  }).catch(() => {
    authError.textContent = '网络错误，请确保服务已启动';
    authError.classList.remove('hidden');
    resetCodeBtn();
  });
}

function startCodeCountdown() {
  let sec = 60;
  sendCodeBtn.textContent = sec + 's 后重发';
  sendCodeBtn.disabled = true;
  clearInterval(codeTimer);
  codeTimer = setInterval(() => {
    sec--;
    sendCodeBtn.textContent = sec + 's 后重发';
    if (sec <= 0) resetCodeBtn();
  }, 1000);
}

function resetCodeBtn() {
  clearInterval(codeTimer);
  sendCodeBtn.textContent = '获取验证码';
  sendCodeBtn.disabled = false;
}

async function handleAuth(e) {
  e.preventDefault();
  const phone = authPhone.value.trim();
  const code = authCode.value.trim();
  if (!phone || !code) {
    authError.textContent = '请输入手机号和验证码';
    authError.classList.remove('hidden');
    return;
  }
  if (!/^1[3-9]\d{9}$/.test(phone)) {
    authError.textContent = '手机号格式不正确';
    authError.classList.remove('hidden');
    return;
  }

  authError.classList.add('hidden');
  authSubmit.disabled = true;
  authSubmit.textContent = '登录中...';

  try {
    const resp = await fetch(API_BASE + '/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, code }),
    });
    const data = await resp.json();
    if (!resp.ok) {
      authError.textContent = data.error || '登录失败';
      authError.classList.remove('hidden');
      authSubmit.disabled = false;
      authSubmit.textContent = '登录 / 注册';
      return;
    }
    loginSuccess(data.token, data.phone);
    hideAuthModal();
  } catch {
    authError.textContent = '网络错误，请确保服务已启动';
    authError.classList.remove('hidden');
    authSubmit.disabled = false;
    authSubmit.textContent = '登录 / 注册';
  }
}

async function initAuth() {
  const token = localStorage.getItem('authToken');
  if (!token) {
    wordbookData = loadWordbookLocal();
    return;
  }

  try {
    const resp = await fetch(API_BASE + '/api/me', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (resp.ok) {
      const data = await resp.json();
      loginSuccess(token, data.phone, true);
      return;
    }
  } catch {}

  localStorage.removeItem('authToken');
  wordbookData = loadWordbookLocal();
}

function loginSuccess(token, phone, silent) {
  authToken = token;
  isLoggedIn = true;
  localStorage.setItem('authToken', token);
  updateLoginUI(phone);

  // 合并本地单词到服务器
  const localWords = loadWordbookLocal();
  loadFromServer().then(serverData => {
    // 把本地独有的单词合并到服务器数据中
    const serverWords = new Set(serverData.map(w => w.word));
    const newWords = localWords.filter(w => !serverWords.has(w.word));
    if (newWords.length > 0) {
      wordbookData = [...newWords, ...serverData];
    } else {
      wordbookData = serverData;
    }
  }).catch(() => {
    wordbookData = localWords;
  }).finally(() => {
    saveWordbook();
    renderWordbook();
    updateBadge();
    buildReviewOrder();
    if (panelReview.classList.contains('active')) renderFlashcard();
  });
}

function logout() {
  if (!confirm('确定要退出登录吗？本地数据会保留。')) return;
  authToken = '';
  isLoggedIn = false;
  localStorage.removeItem('authToken');
  updateLoginUI('');
  wordbookData = loadWordbookLocal();
  renderWordbook();
  updateBadge();
  buildReviewOrder();
  if (panelReview.classList.contains('active')) renderFlashcard();
}

function updateLoginUI(phone) {
  if (phone) {
    const show = phone.slice(-4);
    btnLogin.textContent = show;
    btnLogin.title = phone + '（点击退出）';
    btnLogin.classList.add('logged-in');
  } else {
    btnLogin.textContent = '登录';
    btnLogin.title = '登录';
    btnLogin.classList.remove('logged-in');
  }
}

async function loadFromServer() {
  const resp = await fetch(API_BASE + '/api/wordbook', {
    headers: { Authorization: `Bearer ${authToken}` },
  });
  if (!resp.ok) throw new Error('failed');
  const d = await resp.json();
  return d.data || [];
}

function syncToServer() {
  if (!isLoggedIn) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(async () => {
    try {
      await fetch(API_BASE + '/api/wordbook', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ data: wordbookData }),
      });
    } catch {}
  }, 300);
}

function loadWordbookLocal() {
  try {
    return JSON.parse(localStorage.getItem('wordbook') || '[]');
  } catch {
    return [];
  }
}

// ===== 单词查询 =====
async function lookupWord() {
  const word = searchInput.value.trim();
  if (!word) return;

  showResult({ loading: true });

  try {
    const resp = await fetch(API_BASE + '/api/lookup?word=' + encodeURIComponent(word));
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      throw new Error(data.error || 'not_found');
    }
    const data = await resp.json();
    renderWord(data);
    autoAddToWordbook(data);
  } catch (err) {
    if (err.message === 'not_found') {
      showResult({ error: true, word });
    } else {
      showResult({ networkError: true });
    }
  }
}

// ===== 渲染查单词结果 =====
function showResult(state) {
  if (state.loading) {
    resultArea.innerHTML = '<div class="placeholder">查询中...</div>';
  } else if (state.error) {
    resultArea.innerHTML = `
      <div class="error-card">
        <p style="font-weight:600;font-size:1.1rem;">未找到单词 "${state.word}"</p>
        <p style="color:#999;margin-top:6px;">请检查拼写后重试</p>
      </div>`;
  } else if (state.networkError) {
    resultArea.innerHTML = `
      <div class="error-card">
        <p style="font-weight:600;">网络错误</p>
        <p style="color:#999;margin-top:6px;">请检查网络连接后重试</p>
      </div>`;
  }
}

function renderWord(data) {
  const word = data.word;
  const phonetic = data.phonetic || '';
  const tag = data.tag || '';
  const freq = data.freq || 0;
  const exchange = data.exchange || {};

  let meaningsHTML = '';

  if (data.groups && data.groups.length > 0) {
    data.groups.forEach(g => {
      const posLabel = g.pos ? `<span class="part-of-speech">${g.pos}</span>` : '';
      const meaningText = g.meanings.join('；');
      meaningsHTML += `
        <div class="meaning-section">
          ${posLabel}
          <span class="zh-meaning">${meaningText}</span>
        </div>`;
    });
  } else if (data.translation) {
    meaningsHTML = `<div class="definition-item"><div class="definition-text">${data.translation}</div></div>`;
  } else if (data.notFound) {
    meaningsHTML = '<div class="placeholder" style="color:#999">未找到该单词</div>';
  }

  // 词形变化
  let exchangeHTML = '';
  const exLabels = { plural: '复数', past: '过去式', present: '现在分词', third: '三单', pastParticiple: '过去分词', comparative: '比较级', superlative: '最高级' };
  const exEntries = Object.entries(exchange).filter(([k]) => exLabels[k]);
  if (exEntries.length > 0) {
    exchangeHTML = '<div class="exchange-row">' +
      exEntries.map(([k, v]) => `<span class="exchange-item">${exLabels[k]}: ${v}</span>`).join('') +
      '</div>';
  }

  // 标签
  let tagHTML = '';
  if (tag) {
    const tags = tag.split(' ').filter(t => t);
    tagHTML = '<div class="tag-row">' + tags.map(t => `<span class="tag-item">${t.toUpperCase()}</span>`).join('') + '</div>';
  }

  // 星级
  let starsHTML = '';
  if (freq > 0) {
    starsHTML = '<span class="freq-stars">' + '★'.repeat(Math.min(freq, 5)) + '</span>';
  }

  // 例句
  let examplesHTML = '';
  const examples = data.examples || [];
  if (examples.length > 0) {
    examplesHTML = '<div class="examples-section"><div class="examples-title">例句</div>' +
      examples.map(e => `
        <div class="example-item">
          <span class="example-pos">${e.pos}</span> "${e.en}"
        </div>`).join('') +
      '</div>';
  }

  resultArea.innerHTML = `
    <div class="word-card">
      <div class="word-head">
        <div>
          <span class="word-spelling">${word}</span>
          ${phonetic ? `<span class="word-phonetic">/${phonetic}/</span>` : ''}
          ${starsHTML}
        </div>
      </div>
      ${tagHTML}
      ${exchangeHTML}
      ${meaningsHTML}
      ${examplesHTML}
    </div>`;
}

function playAudio(src) {
  const audio = new Audio(src);
  audio.play().catch(() => {});
}

// ===== 单词本操作 =====
function autoAddToWordbook(data) {
  const word = data.word;
  const phonetic = data.phonetic || '';
  const zh = data.translation || '';
  const groups = data.groups || [];
  const exchange = data.exchange || {};
  const tag = data.tag || '';

  if (wordbookData.some(w => w.word === word)) {
    return;
  }

  wordbookData.unshift({ word, phonetic, meaning: zh, groups, exchange, tag, lastReviewTime: null });
  saveWordbook();
  renderWordbook();
  updateBadge();
  showToast(`"${word}" 已加入单词本`, word);
  buildReviewOrder();
}

function removeWord(word, e) {
  if (e) e.stopPropagation();
  wordbookData = wordbookData.filter(w => w.word !== word);
  saveWordbook();
  renderWordbook();
  updateBadge();
  buildReviewOrder();
  if (currentCardIndex >= reviewOrder.length) {
    currentCardIndex = Math.max(0, reviewOrder.length - 1);
  }
  if (panelReview.classList.contains('active')) {
    renderFlashcard();
  }
}

function handleUndo() {
  if (undoWord) {
    wordbookData = wordbookData.filter(w => w.word !== undoWord);
    saveWordbook();
    renderWordbook();
    updateBadge();
    undoWord = null;
    buildReviewOrder();
  }
  hideToast();
}

function clearAll() {
  if (wordbookData.length === 0) return;
  if (!confirm('确定要清空所有单词吗？')) return;
  wordbookData = [];
  saveWordbook();
  renderWordbook();
  updateBadge();
  reviewOrder = [];
  currentCardIndex = 0;
  if (panelReview.classList.contains('active')) {
    renderFlashcard();
  }
}

// ===== 复习顺序 =====
function buildReviewOrder() {
  if (reviewMode === 'sequential') {
    reviewOrder = [...Array(wordbookData.length).keys()];
  } else if (reviewMode === 'random') {
    reviewOrder = [...Array(wordbookData.length).keys()];
    shuffleArray(reviewOrder);
  } else if (reviewMode === 'spaced') {
    // 间隔背诵：按上次复习时间升序（从未复习过的排最前）
    const indexed = wordbookData.map((w, i) => ({ i, t: w.lastReviewTime || 0 }));
    indexed.sort((a, b) => a.t - b.t);
    reviewOrder = indexed.map(x => x.i);
  }
  if (currentCardIndex >= reviewOrder.length) {
    currentCardIndex = Math.max(0, reviewOrder.length - 1);
  }
}

function setReviewMode(mode) {
  reviewMode = mode;
  saveReviewMode(mode);
  currentCardIndex = 0;
  buildReviewOrder();
  renderFlashcard();
}

// ===== 标记已复习 =====
function markReviewed(cardIdx) {
  const realIdx = reviewOrder[cardIdx];
  if (realIdx != null && wordbookData[realIdx]) {
    wordbookData[realIdx].lastReviewTime = Date.now();
    saveWordbook();
  }
}

// ===== Toast =====
function showToast(msg, word) {
  clearTimeout(undoTimer);
  undoWord = word;
  toastMsg.textContent = msg;
  toast.classList.remove('hidden');
  undoTimer = setTimeout(() => hideToast(), 4000);
}

function hideToast() {
  toast.classList.add('hidden');
  undoWord = null;
  clearTimeout(undoTimer);
}

// ===== 单词本侧边栏 UI =====
function openWordbook() {
  wordbook.classList.add('open');
  overlay.classList.remove('hidden');
}

function closeWordbook() {
  wordbook.classList.remove('open');
  overlay.classList.add('hidden');
}

function renderWordbook() {
  if (wordbookData.length === 0) {
    wordbookList.innerHTML = '<div class="empty-state">暂无单词，去查询一个吧</div>';
  } else {
    wordbookList.innerHTML = wordbookData.map(w => `
      <div class="wordbook-item">
        <div>
          <div class="wordbook-word">${escapeHTML(w.word)}</div>
          <div class="wordbook-meaning">${escapeHTML(w.meaning)}</div>
        </div>
        <button class="wordbook-remove" data-word="${escapeHTML(w.word)}" title="移除">✕</button>
      </div>
    `).join('');

    wordbookList.querySelectorAll('.wordbook-remove').forEach(btn => {
      btn.addEventListener('click', (e) => removeWord(btn.dataset.word, e));
    });
  }
}

function updateBadge() {
  wordCount.textContent = wordbookData.length;
}

function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ===== 背单词 Flashcard =====
function renderFlashcard() {
  if (wordbookData.length === 0) {
    flashcardArea.innerHTML = `
      <div class="flashcard-empty">
        <p>还没有单词</p>
        <p>先去「查单词」添加一些吧</p>
      </div>`;
    return;
  }

  const realIdx = reviewOrder[currentCardIndex];
  const w = wordbookData[realIdx];
  if (!w) return;

  let defsHTML = '';
  const groups = w.groups || [];
  for (const g of groups) {
    defsHTML += `
      <div class="card-def-section">
        ${g.pos ? `<div class="card-pos">${g.pos}</div>` : ''}
        <div class="card-def">${g.meanings.join('；')}</div>
      </div>`;
  }
  if (!defsHTML && w.meaning) {
    defsHTML = `<div class="card-def" style="text-align:center">${w.meaning}</div>`;
  }

  const pos = wordbookData.length > 0 ? `${currentCardIndex + 1} / ${reviewOrder.length}` : '0 / 0';

  flashcardArea.innerHTML = `
    <div class="flashcard-progress">${pos} &nbsp;·&nbsp; ${MODE_LABELS[reviewMode]}</div>
    <div class="flashcard-stage">
      <div class="flashcard-container" id="flashcardContainer">
        <div class="flashcard-inner" id="flashcardInner">
          <div class="flashcard-front">
            <div class="card-word">${escapeHTML(w.word)}</div>
            ${w.phonetic ? `<div class="card-phonetic">${escapeHTML(w.phonetic)}</div>` : ''}
            <div class="tap-hint">点击翻转 · 左右拖动切换</div>
          </div>
          <div class="flashcard-back">
            <div class="card-word-sm">${escapeHTML(w.word)}</div>
            <div class="card-zh-main">${escapeHTML(w.meaning)}</div>
            ${defsHTML}
          </div>
        </div>
      </div>
    </div>
    <div class="flashcard-bottom">
      <span class="flashcard-hint">← → 键切换 · 空格翻转</span>
      <button id="btnMode" class="flashcard-mode-btn">${MODE_LABELS[reviewMode]}</button>
    </div>
  `;

  isCardAnimating = false;

  const container = document.getElementById('flashcardContainer');
  const inner = document.getElementById('flashcardInner');
  const stage = container.parentElement;
  const draggedRef = { value: false };

  container.addEventListener('mousedown', (e) => {
    draggedRef.value = false;
    onCardDragStart(e, container, stage, draggedRef);
  });
  container.addEventListener('touchstart', (e) => {
    draggedRef.value = false;
    onCardDragStart(e, container, stage, draggedRef);
  }, { passive: false });

  container.addEventListener('click', (e) => {
    if (!draggedRef.value && !isCardAnimating) {
      inner.classList.toggle('flipped');
      if (inner.classList.contains('flipped')) {
        markReviewed(currentCardIndex);
      }
    }
  });

  document.getElementById('btnMode').addEventListener('click', () => {
    const cycle = { sequential: 'random', random: 'spaced', spaced: 'sequential' };
    setReviewMode(cycle[reviewMode]);
  });

  // 自定义悬停提示
  const btnMode = document.getElementById('btnMode');
  const tooltip = document.createElement('div');
  tooltip.className = 'mode-tooltip';
  tooltip.textContent = MODE_DESC[reviewMode];
  btnMode.parentElement.appendChild(tooltip);

  btnMode.addEventListener('mouseenter', () => tooltip.classList.add('visible'));
  btnMode.addEventListener('mouseleave', () => tooltip.classList.remove('visible'));
}

// ===== 卡片拖动 =====
function onCardDragStart(e, container, stage, draggedRef) {
  if (isCardAnimating) return;
  container.classList.add('swiping');

  const point = e.touches ? e.touches[0] : e;
  const startX = point.clientX;
  const startY = point.clientY;
  let dx = 0;
  let hasMoved = false;

  // 去掉 transition 以跟手
  container.style.transition = 'none';

  function onMove(ev) {
    const p = ev.touches ? ev.touches[0] : ev;
    dx = p.clientX - startX;
    const dy = p.clientY - startY;

    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
      hasMoved = true;
      if (draggedRef) draggedRef.value = true;
    }

    if (hasMoved) {
      ev.preventDefault();
      const rotate = dx * 0.06; // 每像素偏移 0.06 度
      container.style.transform = `translateX(${dx}px) rotate(${rotate}deg)`;
      container.style.opacity = Math.max(0.4, 1 - Math.abs(dx) / (container.offsetWidth * 0.8));
    }
  }

  function onEnd() {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onEnd);
    document.removeEventListener('touchmove', onMove);
    document.removeEventListener('touchend', onEnd);
    container.classList.remove('swiping');

    const threshold = container.offsetWidth * 0.25;

    if (hasMoved && Math.abs(dx) > threshold) {
      // 飞出
      const direction = dx > 0 ? 1 : -1;
      flyCard(container, dx, direction);
    } else if (hasMoved) {
      // 弹回
      container.style.transition = 'transform 0.35s cubic-bezier(0.22, 0.61, 0.36, 1), opacity 0.35s ease';
      container.style.transform = 'translateX(0) rotate(0deg)';
      container.style.opacity = '1';
    }
  }

  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onEnd);
  document.addEventListener('touchmove', onMove, { passive: false });
  document.addEventListener('touchend', onEnd);
}

function flyCard(container, fromDx, direction) {
  isCardAnimating = true;
  const rotate = fromDx * 0.06;

  // 设置 CSS 变量作为动画起点
  container.style.setProperty('--fly-start-x', fromDx + 'px');
  container.style.setProperty('--fly-start-r', rotate + 'deg');
  container.style.transform = '';
  container.style.opacity = '1';

  const flyClass = direction > 0 ? 'fly-out-right' : 'fly-out-left';
  container.classList.add(flyClass);

  // 飞出后切换卡片
  const prevIndex = currentCardIndex;
  setTimeout(() => {
    markReviewed(prevIndex);

    if (direction < 0 && currentCardIndex < reviewOrder.length - 1) {
      currentCardIndex++;
    } else if (direction > 0 && currentCardIndex > 0) {
      currentCardIndex--;
    }

    container.classList.remove(flyClass);
    const slideClass = direction > 0 ? 'slide-in-left' : 'slide-in-right';

    // 重新渲染后加上滑入动画
    rebuildFlashcardDOM();
    const newContainer = document.getElementById('flashcardContainer');
    if (newContainer) {
      newContainer.classList.add(slideClass);
      newContainer.addEventListener('animationend', () => {
        newContainer.classList.remove(slideClass);
        isCardAnimating = false;
      }, { once: true });
    } else {
      isCardAnimating = false;
    }
  }, 280);
}

// 仅重建卡片 DOM，不触发完整的 renderFlashcard
function rebuildFlashcardDOM() {
  const realIdx = reviewOrder[currentCardIndex];
  const w = wordbookData[realIdx];
  if (!w) return;

  let defsHTML = '';
  const groups = w.groups || [];
  for (const g of groups) {
    defsHTML += `
      <div class="card-def-section">
        ${g.pos ? `<div class="card-pos">${g.pos}</div>` : ''}
        <div class="card-def">${g.meanings.join('；')}</div>
      </div>`;
  }
  if (!defsHTML && w.meaning) {
    defsHTML = `<div class="card-def" style="text-align:center">${w.meaning}</div>`;
  }

  const posStr = `${currentCardIndex + 1} / ${reviewOrder.length}`;
  flashcardArea.querySelector('.flashcard-progress').textContent = `${posStr} · ${MODE_LABELS[reviewMode]}`;

  const stage = flashcardArea.querySelector('.flashcard-stage');
  stage.innerHTML = `
    <div class="flashcard-container" id="flashcardContainer">
      <div class="flashcard-inner" id="flashcardInner">
        <div class="flashcard-front">
          <div class="card-word">${escapeHTML(w.word)}</div>
          ${w.phonetic ? `<div class="card-phonetic">${escapeHTML(w.phonetic)}</div>` : ''}
          <div class="tap-hint">点击翻转 · 左右拖动切换</div>
        </div>
        <div class="flashcard-back">
          <div class="card-word-sm">${escapeHTML(w.word)}</div>
          <div class="card-zh-main">${escapeHTML(w.meaning)}</div>
          ${defsHTML}
        </div>
      </div>
    </div>
  `;

  // 重新绑定事件
  const container = document.getElementById('flashcardContainer');
  const inner = document.getElementById('flashcardInner');
  const draggedRef = { value: false };

  container.addEventListener('mousedown', (e) => onCardDragStart(e, container, stage, draggedRef));
  container.addEventListener('touchstart', (e) => onCardDragStart(e, container, stage, draggedRef), { passive: false });

  container.addEventListener('click', (e) => {
    if (!draggedRef.value && !isCardAnimating) {
      inner.classList.toggle('flipped');
      if (inner.classList.contains('flipped')) {
        markReviewed(currentCardIndex);
      }
    }
  });
}

// ===== 键盘操作 =====
function onKeyboard(e) {
  // 只在背单词面板活跃时响应
  if (!panelReview.classList.contains('active')) return;
  if (isCardAnimating) return;
  // 不在输入框中
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;

  if (e.key === 'ArrowLeft' && currentCardIndex < reviewOrder.length - 1) {
    e.preventDefault();
    swipeViaKeyboard(-1);
  } else if (e.key === 'ArrowRight' && currentCardIndex > 0) {
    e.preventDefault();
    swipeViaKeyboard(1);
  } else if (e.key === ' ') {
    e.preventDefault();
    const inner = document.getElementById('flashcardInner');
    if (inner) {
      inner.classList.toggle('flipped');
      if (inner.classList.contains('flipped')) {
        markReviewed(currentCardIndex);
      }
    }
  }
}

function swipeViaKeyboard(direction) {
  // direction: -1 = left (next card), 1 = right (prev card)
  const container = document.getElementById('flashcardContainer');
  if (!container) return;

  isCardAnimating = true;
  const prevIndex = currentCardIndex;

  container.style.setProperty('--fly-start-x', '0px');
  container.style.setProperty('--fly-start-r', '0deg');
  const flyClass = direction < 0 ? 'fly-out-left' : 'fly-out-right';
  container.classList.add(flyClass);

  setTimeout(() => {
    markReviewed(prevIndex);

    if (direction < 0) {
      currentCardIndex++;
    } else {
      currentCardIndex--;
    }

    container.classList.remove(flyClass);
    const slideClass = direction < 0 ? 'slide-in-right' : 'slide-in-left';

    rebuildFlashcardDOM();
    const newContainer = document.getElementById('flashcardContainer');
    if (newContainer) {
      newContainer.classList.add(slideClass);
      newContainer.addEventListener('animationend', () => {
        newContainer.classList.remove(slideClass);
        isCardAnimating = false;
      }, { once: true });
    } else {
      isCardAnimating = false;
    }
  }, 280);
}

// ===== 按钮拖动 =====
let isDragging = false;
let dragStartX, dragStartY;
let btnStartLeft, btnStartTop;
let hasMoved = false;

function initButtonPosition() {
  const saved = loadBtnPosition();
  if (saved) {
    openWordbookBtn.style.left = saved.left + 'px';
    openWordbookBtn.style.top = saved.top + 'px';
    openWordbookBtn.style.right = 'auto';
    openWordbookBtn.style.transform = 'none';
  } else {
    openWordbookBtn.style.right = '30px';
    openWordbookBtn.style.top = '50%';
    openWordbookBtn.style.transform = 'translateY(-50%)';
  }
}

function onBtnDragStart(e) {
  isDragging = true;
  hasMoved = false;
  openWordbookBtn.classList.add('dragging');

  const point = e.touches ? e.touches[0] : e;
  dragStartX = point.clientX;
  dragStartY = point.clientY;

  const rect = openWordbookBtn.getBoundingClientRect();
  btnStartLeft = rect.left;
  btnStartTop = rect.top;

  openWordbookBtn.style.right = 'auto';
  openWordbookBtn.style.transform = 'none';
  openWordbookBtn.style.left = btnStartLeft + 'px';
  openWordbookBtn.style.top = btnStartTop + 'px';

  document.addEventListener('mousemove', onBtnDragMove);
  document.addEventListener('mouseup', onBtnDragEnd);
  document.addEventListener('touchmove', onBtnDragMove, { passive: false });
  document.addEventListener('touchend', onBtnDragEnd);
}

function onBtnDragMove(e) {
  if (!isDragging) return;
  e.preventDefault();

  const point = e.touches ? e.touches[0] : e;
  const dx = point.clientX - dragStartX;
  const dy = point.clientY - dragStartY;

  if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
    hasMoved = true;
  }

  let left = btnStartLeft + dx;
  let top = btnStartTop + dy;

  const size = openWordbookBtn.offsetWidth;
  left = Math.max(0, Math.min(left, window.innerWidth - size));
  top = Math.max(0, Math.min(top, window.innerHeight - size));

  openWordbookBtn.style.left = left + 'px';
  openWordbookBtn.style.top = top + 'px';
}

function onBtnDragEnd() {
  isDragging = false;
  openWordbookBtn.classList.remove('dragging');

  document.removeEventListener('mousemove', onBtnDragMove);
  document.removeEventListener('mouseup', onBtnDragEnd);
  document.removeEventListener('touchmove', onBtnDragMove);
  document.removeEventListener('touchend', onBtnDragEnd);

  const left = parseInt(openWordbookBtn.style.left);
  const top = parseInt(openWordbookBtn.style.top);
  if (!isNaN(left) && !isNaN(top)) {
    saveBtnPosition(left, top);
  }
}

function onBtnClick(e) {
  if (hasMoved) {
    e.preventDefault();
    e.stopPropagation();
  } else {
    openWordbook();
  }
}

function loadBtnPosition() {
  try {
    const pos = JSON.parse(localStorage.getItem('btnPosition'));
    if (pos && typeof pos.left === 'number' && typeof pos.top === 'number') {
      return pos;
    }
  } catch {}
  return null;
}

function saveBtnPosition(left, top) {
  localStorage.setItem('btnPosition', JSON.stringify({ left, top }));
}

// ===== 单词本缩放 =====
let isResizing = false;
let resizeStartX, resizeStartWidth;

function onResizeStart(e) {
  isResizing = true;
  resizeHandle.classList.add('active');

  const point = e.touches ? e.touches[0] : e;
  resizeStartX = point.clientX;
  resizeStartWidth = wordbook.offsetWidth;

  document.addEventListener('mousemove', onResizeMove);
  document.addEventListener('mouseup', onResizeEnd);
  document.addEventListener('touchmove', onResizeMove, { passive: false });
  document.addEventListener('touchend', onResizeEnd);

  e.preventDefault();
}

function onResizeMove(e) {
  if (!isResizing) return;
  e.preventDefault();

  const point = e.touches ? e.touches[0] : e;
  const dx = resizeStartX - point.clientX;
  let newWidth = resizeStartWidth + dx;

  newWidth = Math.max(260, Math.min(newWidth, window.innerWidth * 0.9));

  wordbook.style.width = newWidth + 'px';
  saveWordbookWidth(newWidth);
}

function onResizeEnd() {
  isResizing = false;
  resizeHandle.classList.remove('active');

  document.removeEventListener('mousemove', onResizeMove);
  document.removeEventListener('mouseup', onResizeEnd);
  document.removeEventListener('touchmove', onResizeMove);
  document.removeEventListener('touchend', onResizeEnd);
}

function loadWordbookWidth() {
  try {
    const w = parseInt(localStorage.getItem('wordbookWidth'));
    if (w >= 260 && w <= window.innerWidth * 0.9) return w;
  } catch {}
  return 380;
}

function saveWordbookWidth(w) {
  localStorage.setItem('wordbookWidth', String(w));
}

(function initWordbookWidth() {
  const w = loadWordbookWidth();
  wordbook.style.width = w + 'px';
})();

// ===== 工具函数 =====
function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

// ===== 本地存储 =====
function saveWordbook() {
  localStorage.setItem('wordbook', JSON.stringify(wordbookData));
  syncToServer();
}

function loadReviewMode() {
  const valid = ['sequential', 'random', 'spaced'];
  const saved = localStorage.getItem('reviewMode');
  return valid.includes(saved) ? saved : 'sequential';
}

function saveReviewMode(mode) {
  localStorage.setItem('reviewMode', mode);
}
