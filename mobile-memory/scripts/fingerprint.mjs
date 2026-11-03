#!/usr/bin/env node
/** 签名证书 SHA-256 指纹比对（RK-13 · T-20 判据⑨）
 *
 * 做什么：跑 `apksigner verify --print-certs <apk>`，把产物里**每一个签名者**的证书 SHA-256
 *        与仓库内基线 `mobile-memory/keystore-cert.sha256` 比对；不一致 → **exit 1**。
 * 为什么：keystore 一旦被重建/替换，签名标识就变了，存量用户无法覆盖安装（只能卸载重装 = 丢本机数据）。
 *        这条比对是"禁止发布与挂直链"的机器闸门（CI 的 apk job 每次构建后跑一次，见 T-22）。
 *
 * 用法：
 *   node scripts/fingerprint.mjs                          # 比对 mobile-memory 下最新的 tmword-*.apk
 *   node scripts/fingerprint.mjs --apk <path> [--baseline <path>]
 *   node scripts/fingerprint.mjs --print-keystore         # 只读打印 keystore 证书指纹（生成/核对基线用）
 *   node scripts/fingerprint.mjs --help
 *
 * 环境变量（与 build-apk.sh 同一套，脚本内无任何绝对路径与口令字面量 · B-08）：
 *   JAVA_HOME          JDK 17+（java / keytool）
 *   BT                 build-tools 目录（含 lib/apksigner.jar）；未给则从 ANDROID_HOME 自动发现
 *   ANDROID_HOME / ANDROID_SDK_ROOT
 *   APK_KEYSTORE       默认 ../keystore.jks（仓库内那一份；**本脚本只读，绝不生成或改写密钥**）
 *   APK_KEYSTORE_PASS  仅 --print-keystore 需要（经 keytool 的 -storepass:env 传入，不落命令行明文）
 *
 * 退出码：0 一致 / 1 不一致或前置条件缺失（一律 fail-closed，不给"看起来通过"的第三态）
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const MOBILE = join(HERE, '..');
const DEFAULT_BASELINE = join(MOBILE, 'keystore-cert.sha256');

const isWin = process.platform === 'win32';
const EXE = isWin ? '.exe' : '';

function die(msg, code = 1) {
  process.stderr.write(`指纹比对失败：${msg}\n`);
  process.exit(code);
}

function parseArgs(argv) {
  const opts = { apk: null, baseline: DEFAULT_BASELINE, printKeystore: false, help: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--apk') opts.apk = argv[++i];
    else if (a === '--baseline') opts.baseline = argv[++i];
    else if (a === '--print-keystore') opts.printKeystore = true;
    else if (a === '-h' || a === '--help') opts.help = true;
    else die(`未知参数：${a}（--help 看用法）`);
  }
  if (opts.apk) opts.apk = resolve(opts.apk);
  opts.baseline = resolve(opts.baseline);
  return opts;
}

function javaBin() {
  const home = process.env.JAVA_HOME;
  if (!home) die('缺少环境变量 JAVA_HOME（需要 JDK 17+ 里的 java/keytool）。RK-13 的比对照 B-08 口径不接受硬编码回退路径：请 export JAVA_HOME=<JDK 目录> 后重试。');
  const p = join(home.replace(/\\/g, '/'), 'bin', `java${EXE}`);
  if (!existsSync(p)) die(`JAVA_HOME=${home} 下找不到 ${p}`);
  return p;
}

function buildToolsDir() {
  const candidates = [];
  if (process.env.BT) candidates.push(process.env.BT.replace(/\\/g, '/'));
  const sdk = (process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || '').replace(/\\/g, '/');
  if (sdk) {
    const btRoot = join(sdk, 'build-tools');
    if (existsSync(btRoot)) {
      const vers = readdirSync(btRoot).sort(
        (a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }),
      );
      if (vers.length) candidates.push(join(btRoot, vers[vers.length - 1]));
    }
  }
  for (const dir of candidates) {
    if (existsSync(join(dir, 'lib', 'apksigner.jar'))) return dir;
    process.stderr.write(`  ! ${dir} 下没有 lib/apksigner.jar，继续尝试下一个候选\n`);
  }
  die('找不到含 lib/apksigner.jar 的 build-tools。请 export BT=<build-tools 目录>，或确保 ANDROID_HOME 下已安装 build-tools（本脚本按 B-08 不写死任何机器上的绝对路径）。');
}

/** apksigner 的输出形如：Signer #1 certificate SHA-256 digest: a359eb...123c */
function apkSignerDigests(apk) {
  if (!existsSync(apk)) die(`找不到待校验的 APK：${apk}（先跑 bash mobile-memory/build-apk.sh，或用 --apk 指定）`);
  const java = javaBin();
  const jar = join(buildToolsDir(), 'lib', 'apksigner.jar');
  let out = '';
  try {
    out = execFileSync(java, ['-jar', jar, 'verify', '--print-certs', apk], { encoding: 'utf8', maxBuffer: 8 << 20 });
  } catch (err) {
    const detail = `${err.stdout || ''}${err.stderr || ''}${err.message}`.trim().split('\n').slice(0, 6).join('\n  ');
    die(`apksigner verify 执行失败（APK 未签名 / 已损坏 / 工具链问题）：\n  ${detail}`);
  }
  const digests = [];
  for (const m of out.matchAll(/certificate SHA-256 digest:\s*([0-9a-fA-F:]+)/g)) digests.push(m[1]);
  if (!digests.length) die(`apksigner 输出里解析不到 "certificate SHA-256 digest" —— 输出格式变了还是签名丢了？原始输出前几行：\n  ${out.trim().split('\n').slice(0, 6).join('\n  ')}`);
  return { digests, raw: out };
}

/** keystore 里的证书指纹（只读）：keytool 输出形如 "SHA256: A3:59:...:3C" */
function keystoreDigests() {
  const ks = (process.env.APK_KEYSTORE || join(MOBILE, 'keystore.jks')).replace(/\\/g, '/');
  if (!existsSync(ks)) die(`找不到 keystore：${ks}。按 RK-13 **严禁 keytool 重新生成**（签名标识一变存量用户就无法覆盖安装）；请找回原件或用 APK_KEYSTORE=<路径> 指过去。`);
  const pass = process.env.APK_KEYSTORE_PASS;
  if (!pass) die('缺少环境变量 APK_KEYSTORE_PASS（--print-keystore 要读证书）。口令只从环境变量取；本脚本没有默认值，也不会写进任何文件（B-08）。');
  const keytool = join((process.env.JAVA_HOME || '').replace(/\\/g, '/'), 'bin', `keytool${EXE}`);
  if (!existsSync(keytool)) die(`JAVA_HOME 下找不到 keytool：${keytool}（本仓库的构建链要求 JDK 17+）`);
  const args = ['-J-Duser.language=en', '-J-Duser.country=US', '-list', '-v', '-keystore', ks];
  if (process.env.APK_KEYSTORE_TYPE) args.push('-storetype', process.env.APK_KEYSTORE_TYPE);
  args.push('-storepass:env', 'APK_KEYSTORE_PASS');
  let out = '';
  try {
    out = execFileSync(keytool, args, {
      encoding: 'utf8',
      env: { ...process.env, APK_KEYSTORE_PASS: pass },
      maxBuffer: 8 << 20,
    });
  } catch (err) {
    const detail = `${err.stdout || ''}${err.stderr || ''}`.trim().split('\n').slice(0, 6).join('\n  ');
    die(
      `keytool -list 执行失败：\n  ${detail}\n` +
        '  两个常见成因：① JAVA_HOME 指向的 JDK 太旧（本仓库的 keystore 是 PKCS12，JDK 8 的 keytool 按 JKS 读会报 "Invalid keystore format"；JDK 17+ 能自动识别）' +
        '—— 请 export JAVA_HOME=<JDK 17+>；② 确需指定类型时 export APK_KEYSTORE_TYPE=PKCS12。口令不对同样失败，但**不会**据此生成新证书（RK-13）。',
    );
  }
  const digests = [];
  for (const m of out.matchAll(/SHA256:\s*([0-9a-fA-F:]+)/g)) digests.push(m[1]);
  if (!digests.length) die('keytool 输出里解析不到 SHA256 指纹');
  return { ks, digests, output: out };
}

const norm = (hex) => hex.replace(/[^0-9a-fA-F]/g, '').toLowerCase();

/** 基线文件：# 开头是注释；其余行里任一 32 字节十六进制串都算一条基线（冒号分格与否都可，与 apksigner/keytool 输出同源） */
function readBaseline(path) {
  if (!existsSync(path)) die(`找不到指纹基线文件：${path}。它应随仓库提交（非机密，只是证书公钥指纹，RK-13）。`);
  const entries = [];
  const text = readFileSync(path, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    for (const m of line.matchAll(/(?:[0-9a-fA-F]{2}:){31}[0-9a-fA-F]{2}|[0-9a-fA-F]{64}/g)) entries.push(norm(m[0]));
  }
  if (!entries.length) die(`基线文件 ${path} 里解析不到任何 32 字节十六进制指纹 —— 别把它改成占位符。`);
  return { entries, text };
}

function main() {
  const opts = parseArgs(process.argv);
  if (opts.help) {
    process.stdout.write(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(0, 26).join('\n') + '\n');
    return 0;
  }

  if (opts.printKeystore) {
    const { ks, digests } = keystoreDigests();
    process.stdout.write(`# keystore: ${ks}\n`);
    for (const d of digests) process.stdout.write(`${norm(d)}\n`);
    return 0;
  }

  const apk = opts.apk || newestArtifact();
  const baseline = readBaseline(opts.baseline);
  const { digests, raw } = apkSignerDigests(apk);
  const actual = digests.map(norm).sort();
  const expected = [...new Set(baseline.entries)].sort();

  process.stdout.write(`APK      : ${apk}\n`);
  process.stdout.write(`基线     : ${opts.baseline}\n`);
  process.stdout.write(`签名者数 : ${actual.length}（基线登记 ${expected.length}）\n`);
  for (const d of raw.match(/Signer #\d+ certificate DN: .*/g) || []) process.stdout.write(`  ${d.trim()}\n`);
  actual.forEach((d) => process.stdout.write(`  实际指纹 SHA-256 = ${d}\n`));
  expected.forEach((d) => process.stdout.write(`  基线指纹 SHA-256 = ${d}\n`));

  const same = actual.length === expected.length && actual.every((d, i) => d === expected[i]);
  if (!same) {
    const unexpected = actual.filter((d) => !expected.includes(d));
    const missing = expected.filter((d) => !actual.includes(d));
    process.stderr.write(
      '\n签名证书指纹与基线**不一致** —— 按 RK-13 立即停止发布：禁止挂直链、禁止把该包推给用户。\n' +
        `  基线里没有的签名者：${unexpected.join(', ') || '（无）'}\n` +
        `  基线里有但产物里没有的：${missing.join(', ') || '（无）'}\n` +
        '  最常见成因：用错 keystore（APK_KEYSTORE 指到了别的文件）、CI secret 不是原件、或有人重建过证书。\n' +
        '  处置：人工找回原 keystore 后重跑；**不要**用新证书再生成一份基线来"对齐"。\n',
    );
    process.exit(1);
  }
  process.stdout.write(
    '\n✓ 证书指纹与基线一致。\n' +
      '  口径提醒：这只证明"本次产物 = 在册那把钥匙"，**不**证明它与上一版是同一把。\n' +
      '  换过签名代的版本（见 keystore-cert.sha256 的修订段）与旧包之间不可覆盖安装，\n' +
      '  存量用户须先卸载；这一点本脚本无法自动判定，以基线文件的历史为准。\n',
  );
  return 0;
}

function newestArtifact() {
  const found = readdirSync(MOBILE)
    .filter((f) => /^tmword-.*\.apk$/.test(f))
    .map((f) => ({ f, t: statSync(join(MOBILE, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t);
  if (!found.length) die(`mobile-memory/ 下没有 tmword-*.apk 产物，且未指定 --apk。先跑 bash mobile-memory/build-apk.sh。`);
  return join(MOBILE, found[0].f);
}

main();
