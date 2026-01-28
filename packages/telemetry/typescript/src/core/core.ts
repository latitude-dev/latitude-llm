import { InstrumentationScope, SCOPE_LATITUDE } from '@latitude-data/constants'
import * as otel from '@opentelemetry/api'
import { NodeTracerProvider, SpanExporter } from '@opentelemetry/sdk-trace-node'

export const BACKGROUND = () => otel.ROOT_CONTEXT

// Note: Only exporting typescript instrumentations
export enum Instrumentation {
  Anthropic = InstrumentationScope.Anthropic,
  AIPlatform = InstrumentationScope.AIPlatform,
  Bedrock = InstrumentationScope.Bedrock,
  Cohere = InstrumentationScope.Cohere,
  Langchain = InstrumentationScope.Langchain,
  Latitude = InstrumentationScope.Latitude,
  LlamaIndex = InstrumentationScope.LlamaIndex,
  OpenAI = InstrumentationScope.OpenAI,
  OpenAIAgents = InstrumentationScope.OpenAIAgents,
  TogetherAI = InstrumentationScope.TogetherAI,
  VertexAI = InstrumentationScope.VertexAI,
}

export class LifecycleManager {
  private readonly nodeProvider: NodeTracerProvider
  private readonly exporter: SpanExporter

  constructor(nodeProvider: NodeTracerProvider, exporter: SpanExporter) {
    this.nodeProvider = nodeProvider
    this.exporter = exporter
  }

  async flush() {
    await this.nodeProvider.forceFlush()
    await this.exporter.forceFlush?.()
  }

  async shutdown() {
    await this.flush()
    await this.nodeProvider.shutdown()
    await this.exporter.shutdown?.()
  }
}

class ScopedTracerProvider implements otel.TracerProvider {
  private readonly scope: string
  private readonly version: string
  private readonly provider: otel.TracerProvider

  constructor(scope: string, version: string, provider: otel.TracerProvider) {
    this.scope = scope
    this.version = version
    this.provider = provider
  }

  getTracer(_name: string, _version?: string, options?: otel.TracerOptions) {
    return this.provider.getTracer(this.scope, this.version, options)
  }
}

export class TracerManager {
  private readonly nodeProvider: NodeTracerProvider
  private readonly scopeVersion: string

  constructor(nodeProvider: NodeTracerProvider, scopeVersion: string) {
    this.nodeProvider = nodeProvider
    this.scopeVersion = scopeVersion
  }

  get(scope: Instrumentation) {
    return this.provider(scope).getTracer('')
  }

  provider(scope: Instrumentation) {
    return new ScopedTracerProvider(
      `${SCOPE_LATITUDE}.${scope}`,
      this.scopeVersion,
      this.nodeProvider,
    )
  }
}
