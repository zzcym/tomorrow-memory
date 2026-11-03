/**
 * 应用配置：所有环境变量在此集中定义并做类型化解析
 */

import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
/** monorepo 根目录（server 包上一级） */
export const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');
// 显式加载 monorepo 根目录 .env（pnpm --filter 运行时 cwd 是包目录，dotenv 默认找不到）
dotenv.config({ path: path.join(PROJECT_ROOT, '.env') });

export type DbDriver = 'pg' | 'sqlite';

export interface AppConfig {
  /** 服务端口 */
  port: number;
  /** JWT 密钥（必填，无默认值生产环境会启动失败） */
  jwtSecret: string;
  /** 数据库驱动 */
  dbDriver: DbDriver;
  /** PostgreSQL 连接串（dbDriver=pg 时使用） */
  databaseUrl: string;
  /** SQLite 数据文件路径（dbDriver=sqlite 时使用） */
  sqlitePath: string;
  /** 有道翻译 API */
  youdaoAppKey: string;
  youdaoSecret: string;
  /** 管理后台密码 */
  adminPassword: string;
  /** DeepSeek API（Phase 2 使用） */
  deepseekApiKey: string;
  deepseekBaseUrl: string;
  /** Embedding 模型 API（Phase 2 使用） */
  embeddingApiKey: string;
  embeddingBaseUrl: string;
  embeddingModel: string;
  /** 向量数据库 Qdrant */
  qdrantUrl: string;
  /** Redis（缓存 + 事件流） */
  redisUrl: string;
  /** ClickHouse（学情分析事件库，Phase 5） */
  clickhouseUrl: string;
  /** OTLP 追踪导出地址（Jaeger，Phase 5） */
  otelExporterUrl: string;
  /** LangSmith（LangGraph 追踪，Phase 5） */
  langsmithApiKey: string;
  langsmithProject: string;
  /** 词典数据路径 */
  dictDbPath: string;
  examplesDbPath: string;
  ecDictPath: string;
  /** 数据文件所在目录（data.db 等；不再作为静态根） */
  dataDir: string;
  /** 静态文件根目录（仅该目录对外可读；绝不指向含 .env / 数据库 / 备份的目录） */
  publicDir: string;
  /** CORS 允许来源（多个用逗号分隔；默认 * 便于开发） */
  corsOrigin: string;
  /**
   * T-07（§4.4.4 / R-40④）：运行时开关种子的**原始环境变量值**（`FEATURE_FLAGS_JSON`）。
   * 解析在 `services/feature-flags.ts` 的 `parseFlagsSeed()`（唯一实现），
   * 装配层 `app.ts` 调它 → 本文件不 import services，保持依赖方向单一。
   * 表 `feature_flags` 里的行永远优先于这里；两处都没有时回退
   * `@tm/shared/constants/flags` 的 PRD §6.4-7 初值（唯一真相，此处不落第二份默认值）。
   */
  featureFlagsSeedJson: string;
  /** T-07 / R-17⑨：App 最新版本号（缺省 = 读 `mobile-memory/version.json`，再缺省 = 服务端自身版本） */
  appLatestVersion: string;
  /** T-07 / R-17⑨：APK 直链。留空时按 `APK_DOWNLOAD_BASE_URL` + 版本号自动拼（见 `routes/version.ts`） */
  apkDownloadUrl: string;
  /** T-07 / R-17⑨：更新说明（可选） */
  appReleaseNotes: string;
  /** 2026-11：APK 版本清单文件（唯一来源 `mobile-memory/version.json`，`/api/version` 的 latest 读它） */
  apkVersionFile: string;
  /** 2026-11：下载直链的站点前缀，如 `https://tmword.xyz`（空 = 不自动拼直链，等价于"不提示"） */
  apkDownloadBaseUrl: string;
  /** 2026-11：APK 存放目录（`GET /api/download/<file>` 只从这里取，默认 DATA_DIR/downloads） */
  downloadsDir: string;
}

function str(name: string, fallback = ''): string {
  const v = process.env[name];
  return v === undefined || v === '' ? fallback : v;
}

function num(name: string, fallback: number): number {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

export function loadConfig(): AppConfig {
  const dataDir = str('DATA_DIR', PROJECT_ROOT);
  const driver = str('DB_DRIVER', 'pg').toLowerCase();

  const config: AppConfig = {
    port: num('PORT', 3001),
    jwtSecret: str('JWT_SECRET', ''),
    dbDriver: driver === 'sqlite' ? 'sqlite' : 'pg',
    databaseUrl: str(
      'DATABASE_URL',
      'postgresql://tm_user:tm_pass_2024@localhost:5432/tomorrow_memory',
    ),
    sqlitePath: str('SQLITE_PATH', path.join(dataDir, 'data.db')),
    // 有道凭据不再提供代码默认值（历史默认值已泄漏进 git，需在有道后台轮换）
    youdaoAppKey: str('YOUDAO_APP_KEY', ''),
    youdaoSecret: str('YOUDAO_SECRET', ''),
    adminPassword: str('ADMIN_PASSWORD', ''),
    deepseekApiKey: str('DEEPSEEK_API_KEY', ''),
    deepseekBaseUrl: str('DEEPSEEK_BASE_URL', 'https://api.deepseek.com'),
    embeddingApiKey: str('EMBEDDING_API_KEY', ''),
    embeddingBaseUrl: str('EMBEDDING_BASE_URL', 'https://api.openai.com'),
    embeddingModel: str('EMBEDDING_MODEL', 'text-embedding-3-small'),
    qdrantUrl: str('QDRANT_URL', 'http://localhost:6333'),
    redisUrl: str('REDIS_URL', 'redis://localhost:6379'),
    clickhouseUrl: str('CLICKHOUSE_URL', 'http://localhost:8123'),
    otelExporterUrl: str('OTEL_EXPORTER_OTLP_ENDPOINT', 'http://localhost:4318/v1/traces'),
    langsmithApiKey: str('LANGSMITH_API_KEY', ''),
    langsmithProject: str('LANGSMITH_PROJECT', 'tomorrow-memory'),
    dictDbPath: str('DICT_DB_PATH', path.join(dataDir, 'stardict.db')),
    examplesDbPath: str('EXAMPLES_DB_PATH', path.join(dataDir, 'examples.db')),
    ecDictPath: str('EC_DICT_PATH', path.join(dataDir, 'ec-cedict.json')),
    dataDir,
    publicDir: str('PUBLIC_DIR', path.join(PROJECT_ROOT, 'public')),
    corsOrigin: str('CORS_ORIGIN', '*'),
    // ── T-07 追加（§4.4.4 开关种子 / R-17⑨ 版本清单）──
    featureFlagsSeedJson: str('FEATURE_FLAGS_JSON', ''),
    appLatestVersion: str('APP_LATEST_VERSION', ''),
    apkDownloadUrl: str('APK_DOWNLOAD_URL', ''),
    appReleaseNotes: str('APP_RELEASE_NOTES', ''),
    apkVersionFile: str('APK_VERSION_FILE', path.join(PROJECT_ROOT, 'mobile-memory', 'version.json')),
    // 站点前缀：给了才会自动拼 `<base>/api/download/tmword-<latest>.apk`。
    // 默认空 = 老行为（url 为空、客户端不提示），部署时按需打开，绝不编造直链。
    apkDownloadBaseUrl: str('APK_DOWNLOAD_BASE_URL', ''),
    downloadsDir: str('DOWNLOAD_DIR', path.join(dataDir, 'downloads')),
  };

  if (config.dbDriver === 'pg' && config.databaseUrl === '') {
    throw new Error('DATABASE_URL 未配置（DB_DRIVER=pg 时必填）');
  }

  // 防线：静态根绝不允许指向仓库根（否则 .env / 数据库 / 备份会被对外下载）
  const publicReal = path.resolve(config.publicDir);
  if (publicReal === path.resolve(PROJECT_ROOT)) {
    throw new Error('PUBLIC_DIR 不能指向仓库根目录（会泄漏 .env / 数据库 / 备份），请设置为专用子目录');
  }

  return config;
}
