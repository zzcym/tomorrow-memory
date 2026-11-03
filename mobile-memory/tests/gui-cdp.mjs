/** GUI 测试台（移植自 mobile-agenda/tests/gui-cdp.mjs · R-34①）
 *  无头 Chrome（手机尺寸）+ CDP 驱动页面并截图。
 *
 *  用法: node tests/gui-cdp.mjs <scenario.json>
 *  scenario: { "url": "http://127.0.0.1:8645/index.html", "viewport": {"width":400,"height":860}, "steps": [
 *    { "eval": "JS 表达式,返回值记入结果" } | { "shot": "名字" } | { "click": "#css" } |
 *    { "fill": { "sel": "#id", "value": "文本" } } | { "wait": 300 } | { "note": "说明" } ] }
 *  输出: <GUI_OUT_DIR>/<前缀>_<名字>.png + 控制台打印每步 eval 结果
 *
 *  与母本的差异（**只加不减，逐步语义一字未改**）：
 *   · 参数全部走环境变量：CHROME / GUI_CDP_PORT / SHOT_PREFIX / VIEWPORT_W / VIEWPORT_H / GUI_OUT_DIR；
 *   · R-34③：任一断言失败时先抓一张 <前缀>_FAIL_<步骤号>.png 再把错误抛出去（母本只打印）。
 *   · 被测对象是**打包进 APK 的那份产物**：先 bash build-apk.sh，再指到 build/assets（staged dist）：
 *       python -m http.server 8645 --bind 127.0.0.1 --directory build/assets
 *     （仓库里的 test-server.py 服务的是 mobile-memory/assets —— 那是 legacy 手写版，只在
 *      legacy/handwritten-app 分支的 hotfix 验收时用，见 PRD §8.3-D 第 21/22 项。）
 *   · 四坑规避沿用母本：异常吞输出（R evaluation exceptionDetails 直接抛）、返回函数没调用括号（显式抛）、
 *     复用 profile 命中启发式缓存（每次全新 profile + URL cache-bust）。弹层动画期截图与 zIndex NaN
 *     属于**场景 JSON 的用例设计**，不在驱动器里 —— 下一轮补 §8.3 走查清单的场景文件时按 R-34② 逐条写。
 */
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = Number(process.env.GUI_CDP_PORT || 9333);
const PREFIX = process.env.SHOT_PREFIX || 'gui';
const OUT_DIR = process.env.GUI_OUT_DIR || join(ROOT, 'gui-test-screenshots');
const VP_W = Number(process.env.VIEWPORT_W || 400);
const VP_H = Number(process.env.VIEWPORT_H || 860);

const scenarioPath = process.argv[2];
if (!scenarioPath) {
  console.error('用法: node tests/gui-cdp.mjs <scenario.json>（CHROME / GUI_CDP_PORT / SHOT_PREFIX / VIEWPORT_W / VIEWPORT_H / GUI_OUT_DIR 均可用环境变量覆盖）');
  process.exit(1);
}
if (!existsSync(CHROME)) {
  console.error(`找不到 Chrome：${CHROME}\n  请用 CHROME=<路径> 指到本机浏览器（本脚本不下载任何外部工具）。`);
  process.exit(1);
}

const scenario = JSON.parse(readFileSync(scenarioPath, 'utf8'));
if (!scenario.url) { console.error('scenario 缺 url 字段'); process.exit(1); }
if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
const profile = join(ROOT, 'build', 'chrome-profile');
// 每次全新 profile:复用旧 profile 会命中 Chrome 的启发式缓存,测到的是上一版页面
try { rmSync(profile, { recursive: true, force: true }); } catch (e) { /* 被残留进程占用则忽略 */ }

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run',
  '--disable-dev-shm-usage', '--hide-scrollbars',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  `--window-size=${VP_W},${VP_H}`, 'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function connect() {
  for (let i = 0; i < 60; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = list.find((t) => t.type === 'page');
      if (page) return page.webSocketDebuggerUrl;
    } catch (e) { /* 未就绪 */ }
    await sleep(250);
  }
  throw new Error('Chrome 未启动');
}

class CDP {
  constructor(url) {
    this.ws = new WebSocket(url);
    this.id = 0;
    this.pending = new Map();
    this.events = [];
    this.ws.addEventListener('message', (m) => {
      const msg = JSON.parse(m.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { res, rej } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? rej(new Error(JSON.stringify(msg.error))) : res(msg.result);
      } else if (msg.method) this.events.push(msg);
    });
  }
  open() { return new Promise((r) => this.ws.addEventListener('open', r)); }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((res, rej) => {
      this.pending.set(id, { res, rej });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async waitEvent(name, ms = 8000) {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      if (this.events.some((e) => e.method === name)) {
        this.events = this.events.filter((e) => e.method !== name);
        return true;
      }
      await sleep(60);
    }
    return false;
  }
}

const cdp = new CDP(await connect());
await cdp.open();
await cdp.send('Page.enable');
await cdp.send('Runtime.enable');
const vp = scenario.viewport || { width: VP_W, height: VP_H };
await cdp.send('Emulation.setDeviceMetricsOverride',
  { width: vp.width, height: vp.height, deviceScaleFactor: 2, mobile: true });

const bust = (scenario.url || '').includes('?') ? `&t=${Date.now()}` : `?t=${Date.now()}`;
await cdp.send('Page.navigate', { url: scenario.url + bust });
await cdp.waitEvent('Page.loadEventFired');
await sleep(scenario.initialWait ?? 700);

const report = [];
const evalJs = async (expr, idx) => {
  const r = await cdp.send('Runtime.evaluate',
    { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) {
    throw new Error(`步骤 ${idx} 页面异常: ${JSON.stringify(r.exceptionDetails.exception?.description || r.exceptionDetails.text)}\n  表达式: ${expr}`);
  }
  // 箭头函数返回对象字面量时若漏了结尾 (), 结果是个函数,打印只剩 "{}",很难排查
  if (r.result.subtype === 'function' || r.result.type === 'function') {
    throw new Error(`步骤 ${idx} 表达式返回的是函数(末尾少了一对调用括号): ${expr}`);
  }
  return r.result.value;
};

/** R-34③：失败时输出截图与断言名 */
async function shot(tag) {
  const file = join(OUT_DIR, `${PREFIX}_${tag}.png`);
  try {
    const img = await cdp.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(file, Buffer.from(img.data, 'base64'), 'base64');
    return file;
  } catch (e) {
    return `截图失败(${e.message})`;
  }
}

const label = (step) => step.note || step.shot || step.click || step.fill?.sel || step.eval || JSON.stringify(step);

// 失败取证要用到"当前步骤"，故把游标提到 try 外面（for...of 的 const 绑定只在循环体内可见）
let idx = -1;
let step = null;

try {
  for ([idx, step] of (scenario.steps || []).entries()) {
    if (step.note) { report.push(`\n--- ${step.note} ---`); continue; }
    if (step.wait) { await sleep(step.wait); continue; }
    if (step.shot) {
      const file = await shot(step.shot);
      report.push(`[shot] ${step.shot} -> ${file}`);
      continue;
    }
    if (step.click) {
      const ok = await evalJs(`(()=>{const e=document.querySelector(${JSON.stringify(step.click)});if(!e)return 'NO_SUCH_ELEMENT';e.click();return 'clicked'})()`, idx);
      report.push(`[click] ${step.click} -> ${ok}`);
      if (ok !== 'clicked') throw new Error(`点击失败: ${step.click}`);
      await sleep(step.after ?? 260);
      continue;
    }
    if (step.fill) {
      const ok = await evalJs(`(()=>{const e=document.querySelector(${JSON.stringify(step.fill.sel)});if(!e)return 'NO_SUCH_ELEMENT';e.value=${JSON.stringify(step.fill.value)};e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));return 'filled'})()`, idx);
      report.push(`[fill] ${step.fill.sel} = ${step.fill.value} -> ${ok}`);
      if (ok !== 'filled') throw new Error(`填写失败: ${step.fill.sel}`);
      continue;
    }
    if (step.eval) {
      report.push(`[eval] ${step.eval}\n  => ${JSON.stringify(await evalJs(step.eval, idx))}`);
      continue;
    }
    throw new Error('未知步骤: ' + JSON.stringify(step));
  }
} catch (err) {
  console.log(report.join('\n'));
  const file = await shot(`FAIL_step${idx}_${String(label(step)).slice(0, 40).replace(/[\\/:*?"<>|\s]+/g, '_')}`);
  console.error(`\n✗ 断言失败（步骤 ${idx}：${label(step)}）\n  ${err.message}\n  失败现场截图: ${file}`);
  cdp.ws.close();
  chrome.kill();
  process.exit(1);
}

console.log(report.join('\n'));
cdp.ws.close();
chrome.kill();
process.exit(0);
