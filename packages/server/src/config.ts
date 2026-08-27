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
  /** 数据文件所在目录（前端静态文件、data.db 等） */
  dataDir: string;
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
    youdaoAppKey: str('YOUDAO_APP_KEY', '115fb00277c7315b'),
    youdaoSecret: str('YOUDAO_SECRET', 'EI7VnZNuHkft9z9ihlVXnInCV09Kjc7D'),
    adminPassword: str('ADMIN_PASSWORD', 'admin888'),
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
  };

  if (config.dbDriver === 'pg' && config.databaseUrl === '') {
    throw new Error('DATABASE_URL 未配置（DB_DRIVER=pg 时必填）');
  }

  return config;
}
