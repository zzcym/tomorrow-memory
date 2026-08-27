/**
 * OpenTelemetry 链路追踪初始化（Phase 5）
 *
 * - auto-instrumentations-node：HTTP / PostgreSQL / Redis 自动埋点
 * - OTLP HTTP exporter → Jaeger（OTEL_EXPORTER_OTLP_ENDPOINT）
 * - 无 Jaeger 时跳过初始化（no-op，零开销）
 *
 * LangGraph 节点级 span 在 llm-router 中手动创建（见 tools/llm-router.ts）。
 */

import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Resource } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';

let sdk: NodeSDK | null = null;
let initialized = false;

export function initTracing(opts: { enabled: boolean; endpoint: string; serviceName?: string }): void {
  if (initialized) return;
  initialized = true;
  if (!opts.enabled) {
    console.log('[OTEL] 链路追踪未启用（设置 OTEL_ENABLED=true + Jaeger 地址）');
    return;
  }
  try {
    sdk = new NodeSDK({
      resource: new Resource({
        [ATTR_SERVICE_NAME]: opts.serviceName ?? 'tomorrow-memory-server',
        [ATTR_SERVICE_VERSION]: '2.0.0',
      }),
      traceExporter: new OTLPTraceExporter({ url: opts.endpoint }),
      instrumentations: [
        getNodeAutoInstrumentations({
          '@opentelemetry/instrumentation-http': { enabled: true },
          '@opentelemetry/instrumentation-pg': { enabled: true },
          '@opentelemetry/instrumentation-ioredis': { enabled: true },
          '@opentelemetry/instrumentation-dns': { enabled: true },
        }),
      ],
    });
    sdk.start();
    console.log(`[OTEL] 链路追踪已启用 → ${opts.endpoint}`);
  } catch (err) {
    console.warn('[OTEL] 初始化失败（继续无追踪运行）:', (err as Error).message);
    sdk = null;
  }
}

export async function shutdownTracing(): Promise<void> {
  if (sdk) {
    await sdk.shutdown().catch(() => {});
    sdk = null;
  }
}
