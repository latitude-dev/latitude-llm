import type { TracerProvider } from "@opentelemetry/api"
import { type Instrumentation, registerInstrumentations } from "@opentelemetry/instrumentation"
import { AnthropicInstrumentation } from "@traceloop/instrumentation-anthropic"
import { BedrockInstrumentation } from "@traceloop/instrumentation-bedrock"
import { CohereInstrumentation } from "@traceloop/instrumentation-cohere"
import { LangChainInstrumentation } from "@traceloop/instrumentation-langchain"
import { LlamaIndexInstrumentation } from "@traceloop/instrumentation-llamaindex"
import { OpenAIInstrumentation } from "@traceloop/instrumentation-openai"
import { TogetherInstrumentation } from "@traceloop/instrumentation-together"
import { AIPlatformInstrumentation, VertexAIInstrumentation } from "@traceloop/instrumentation-vertexai"

/**
 * Supported LLM instrumentation types.
 * Use these string identifiers to enable auto-instrumentation.
 */
export type InstrumentationType =
  | "openai"
  | "anthropic"
  | "bedrock"
  | "cohere"
  | "langchain"
  | "llamaindex"
  | "togetherai"
  | "vertexai"
  | "aiplatform"

/**
 * Minimal interface for LLM instrumentation instances.
 * Extends OpenTelemetry's Instrumentation interface.
 */
interface LlmInstrumentation extends Instrumentation {
  manuallyInstrument?(module: unknown): void
}

/**
 * Options for creating LLM instrumentations.
 */
interface CreateInstrumentationsOptions {
  /** List of instrumentation types to enable. */
  instrumentations: InstrumentationType[]
  /**
   * Optional module references for auto-instrumentation.
   * If not provided, the instrumentation will attempt to require the module.
   * Used for Traceloop-based instrumentations.
   */
  modules?: Partial<Record<InstrumentationType, unknown>>
  /**
   * Per-instrumentation token enrichment settings.
   * @default { openai: true }
   */
  enrichTokens?: Partial<Record<InstrumentationType, boolean>>
}

interface InstrumentationConfig {
  ctor: new (config?: Record<string, unknown>) => LlmInstrumentation
  moduleName: string
  defaultEnrichTokens?: boolean
}

const INSTRUMENTATION_MAP: Record<InstrumentationType, InstrumentationConfig> = {
  openai: { ctor: OpenAIInstrumentation, moduleName: "openai", defaultEnrichTokens: true },
  anthropic: { ctor: AnthropicInstrumentation, moduleName: "@anthropic-ai/sdk" },
  bedrock: { ctor: BedrockInstrumentation, moduleName: "@aws-sdk/client-bedrock-runtime" },
  cohere: { ctor: CohereInstrumentation, moduleName: "cohere-ai" },
  langchain: { ctor: LangChainInstrumentation, moduleName: "langchain" },
  llamaindex: { ctor: LlamaIndexInstrumentation, moduleName: "llamaindex" },
  togetherai: { ctor: TogetherInstrumentation, moduleName: "together-ai", defaultEnrichTokens: false },
  vertexai: { ctor: VertexAIInstrumentation, moduleName: "@google-cloud/vertexai" },
  aiplatform: { ctor: AIPlatformInstrumentation, moduleName: "@google-cloud/aiplatform" },
}

/**
 * Internal function to create LLM instrumentation instances.
 * Not exported publicly - use registerLatitudeInstrumentations instead.
 */
async function createLatitudeInstrumentations(options: CreateInstrumentationsOptions): Promise<LlmInstrumentation[]> {
  const result: LlmInstrumentation[] = []

  for (const type of options.instrumentations) {
    const config = INSTRUMENTATION_MAP[type]
    if (!config) {
      console.warn(`[Latitude] Unknown instrumentation type: ${type}`)
      continue
    }

    const enrichTokens = options.enrichTokens?.[type] ?? config.defaultEnrichTokens
    const inst = new config.ctor(enrichTokens !== undefined ? { enrichTokens } : undefined)

    // Get module from explicit options or try to auto-require
    const moduleRef = options.modules?.[type] ?? (await tryRequire(config.moduleName))
    if (!moduleRef) {
      console.warn(
        `[Latitude] Module not found for ${type}: ${config.moduleName}. Install it or pass it explicitly in 'modules'.`,
      )
      continue
    }
    inst.manuallyInstrument?.(moduleRef)

    result.push(inst)
  }

  return result
}

async function tryRequire(moduleName: string): Promise<unknown | undefined> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- CJS require first so optional peer deps resolve in Node; dynamic import handles ESM-only packages.
    return require(moduleName)
  } catch {
    // Fallback to dynamic import for ESM environments
    try {
      const mod = await import(moduleName)
      return mod.default ?? mod
    } catch {
      return undefined
    }
  }
}

/**
 * Registers LLM instrumentations with the global OpenTelemetry instrumentation registry.
 *
 * This is a convenience wrapper around `createLatitudeInstrumentations` and
 * `@opentelemetry/instrumentation`'s `registerInstrumentations`.
 *
 * @example
 * ```typescript
 * import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node"
 * import { registerLatitudeInstrumentations, LatitudeSpanProcessor } from "@latitude-data/telemetry"
 *
 * const provider = new NodeTracerProvider({
 *   spanProcessors: [new LatitudeSpanProcessor(apiKey, projectSlug)],
 * })
 *
 * await registerLatitudeInstrumentations({
 *   instrumentations: ["openai", "anthropic"],
 *   tracerProvider: provider,
 * })
 *
 * provider.register()
 * ```
 */
export async function registerLatitudeInstrumentations(
  options: CreateInstrumentationsOptions & { tracerProvider: TracerProvider },
): Promise<void> {
  const instrumentations = await createLatitudeInstrumentations(options)
  registerInstrumentations({
    instrumentations,
    tracerProvider: options.tracerProvider,
  })
}
