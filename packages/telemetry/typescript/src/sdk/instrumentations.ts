import type { TracerProvider } from "@opentelemetry/api"
import { type Instrumentation, registerInstrumentations } from "@opentelemetry/instrumentation"

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

type InstrumentationCtor = new (config?: Record<string, unknown>) => LlmInstrumentation

interface InstrumentationConfig {
  loadCtor: () => Promise<InstrumentationCtor>
  packageName: string
  moduleName: string
  defaultEnrichTokens?: boolean
}

const INSTRUMENTATION_MAP: Record<InstrumentationType, InstrumentationConfig> = {
  openai: {
    loadCtor: async () => (await import("@traceloop/instrumentation-openai")).OpenAIInstrumentation,
    packageName: "@traceloop/instrumentation-openai",
    moduleName: "openai",
    defaultEnrichTokens: true,
  },
  anthropic: {
    loadCtor: async () => (await import("@traceloop/instrumentation-anthropic")).AnthropicInstrumentation,
    packageName: "@traceloop/instrumentation-anthropic",
    moduleName: "@anthropic-ai/sdk",
  },
  bedrock: {
    loadCtor: async () => (await import("@traceloop/instrumentation-bedrock")).BedrockInstrumentation,
    packageName: "@traceloop/instrumentation-bedrock",
    moduleName: "@aws-sdk/client-bedrock-runtime",
  },
  cohere: {
    loadCtor: async () => (await import("@traceloop/instrumentation-cohere")).CohereInstrumentation,
    packageName: "@traceloop/instrumentation-cohere",
    moduleName: "cohere-ai",
  },
  langchain: {
    loadCtor: async () => (await import("@traceloop/instrumentation-langchain")).LangChainInstrumentation,
    packageName: "@traceloop/instrumentation-langchain",
    moduleName: "langchain",
  },
  llamaindex: {
    loadCtor: async () => (await import("@traceloop/instrumentation-llamaindex")).LlamaIndexInstrumentation,
    packageName: "@traceloop/instrumentation-llamaindex",
    moduleName: "llamaindex",
  },
  togetherai: {
    loadCtor: async () => (await import("@traceloop/instrumentation-together")).TogetherInstrumentation,
    packageName: "@traceloop/instrumentation-together",
    moduleName: "together-ai",
    defaultEnrichTokens: false,
  },
  vertexai: {
    loadCtor: async () => (await import("@traceloop/instrumentation-vertexai")).VertexAIInstrumentation,
    packageName: "@traceloop/instrumentation-vertexai",
    moduleName: "@google-cloud/vertexai",
  },
  aiplatform: {
    loadCtor: async () => (await import("@traceloop/instrumentation-vertexai")).AIPlatformInstrumentation,
    packageName: "@traceloop/instrumentation-vertexai",
    moduleName: "@google-cloud/aiplatform",
  },
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

    let Ctor: InstrumentationCtor
    try {
      Ctor = await config.loadCtor()
    } catch {
      console.warn(
        `[Latitude] Instrumentation package not installed for ${type}: ${config.packageName}. Add it as a dependency to enable this instrumentation.`,
      )
      continue
    }

    const enrichTokens = options.enrichTokens?.[type] ?? config.defaultEnrichTokens
    const inst = new Ctor(enrichTokens !== undefined ? { enrichTokens } : undefined)

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
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require(moduleName)
  } catch {
    // Fallback to dynamic import for ESM environments
    try {
      const mod = await import(/* @vite-ignore */ moduleName)
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
