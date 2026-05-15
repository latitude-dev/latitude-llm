import type { TracerProvider } from "@opentelemetry/api"
import { type Instrumentation, registerInstrumentations } from "@opentelemetry/instrumentation"

const DOCS_URL = "https://github.com/latitude-dev/latitude-llm/tree/main/packages/telemetry/typescript#readme"

interface LlmInstrumentation extends Instrumentation {
  manuallyInstrument?(module: unknown): void
}

type InstrumentationCtor = new (config?: Record<string, unknown>) => LlmInstrumentation

interface IntegrationDef {
  /** Async loader for the underlying instrumentation ctor. */
  loadCtor: () => Promise<InstrumentationCtor>
  /** npm package the instrumentation is published from (surfaced in install hints). */
  packageName: string
  /** Optional shape normalizer — only set when the SDK accepts more than one valid input shape. */
  normalize?: (mod: unknown) => unknown
  /** Optional Traceloop ctor flag. */
  enrichTokens?: boolean
}

/** Exported for direct unit testing — internal otherwise. */
export const normalizeOpenAI = (mod: unknown): unknown => {
  const ns = mod as { OpenAI?: unknown; default?: unknown } | null | undefined
  return ns?.OpenAI ?? ns?.default ?? mod
}

/** Exported for direct unit testing — internal otherwise. */
export const normalizeAnthropic = (mod: unknown): unknown => {
  const hasAnthropicField = mod !== null && typeof mod === "object" && "Anthropic" in (mod as object)
  return hasAnthropicField ? mod : { Anthropic: mod }
}

/** Supported integration keys — exhaustive list. */
export type InstrumentationName =
  | "openai"
  | "openai-agents"
  | "anthropic"
  | "bedrock"
  | "cohere"
  | "langchain"
  | "llamaindex"
  | "togetherai"
  | "vertexai"
  | "aiplatform"

const INTEGRATIONS: Record<InstrumentationName, IntegrationDef> = {
  openai: {
    loadCtor: async () =>
      (await import("./instrumentations/openai/instrumentation.ts")).OpenAIInstrumentationWithResponses,
    packageName: "@traceloop/instrumentation-openai",
    normalize: normalizeOpenAI,
    enrichTokens: true,
  },
  "openai-agents": {
    loadCtor: async () =>
      (await import("./instrumentations/openai-agents/instrumentation.ts")).OpenAIAgentsInstrumentation,
    packageName: "@openai/agents",
  },
  anthropic: {
    loadCtor: async () => (await import("@traceloop/instrumentation-anthropic")).AnthropicInstrumentation,
    packageName: "@traceloop/instrumentation-anthropic",
    normalize: normalizeAnthropic,
  },
  bedrock: {
    loadCtor: async () => (await import("@traceloop/instrumentation-bedrock")).BedrockInstrumentation,
    packageName: "@traceloop/instrumentation-bedrock",
  },
  cohere: {
    loadCtor: async () => (await import("@traceloop/instrumentation-cohere")).CohereInstrumentation,
    packageName: "@traceloop/instrumentation-cohere",
  },
  langchain: {
    loadCtor: async () => (await import("@traceloop/instrumentation-langchain")).LangChainInstrumentation,
    packageName: "@traceloop/instrumentation-langchain",
  },
  llamaindex: {
    loadCtor: async () => (await import("@traceloop/instrumentation-llamaindex")).LlamaIndexInstrumentation,
    packageName: "@traceloop/instrumentation-llamaindex",
  },
  togetherai: {
    loadCtor: async () => (await import("@traceloop/instrumentation-together")).TogetherInstrumentation,
    packageName: "@traceloop/instrumentation-together",
    enrichTokens: false,
  },
  vertexai: {
    loadCtor: async () => (await import("@traceloop/instrumentation-vertexai")).VertexAIInstrumentation,
    packageName: "@traceloop/instrumentation-vertexai",
  },
  aiplatform: {
    loadCtor: async () => (await import("@traceloop/instrumentation-vertexai")).AIPlatformInstrumentation,
    packageName: "@traceloop/instrumentation-vertexai",
  },
}

/**
 * Map of integration name → LLM SDK module reference the consumer uses in app code.
 *
 * The value type is `object`, which admits both class constructors (functions,
 * like the default-export `OpenAI` class) and namespace imports (like
 * `import * as AnthropicSDK from "@anthropic-ai/sdk"`), but rejects primitives
 * (`true`, `42`, `"openai"`, `null`) at the type level.
 *
 * ```ts
 * import OpenAI from "openai"
 * import * as AnthropicSDK from "@anthropic-ai/sdk"
 *
 * new Latitude({
 *   apiKey: "...",
 *   instrumentations: {
 *     openai: OpenAI,
 *     anthropic: AnthropicSDK,
 *   },
 * })
 * ```
 */
export type InstrumentationsInput = Partial<Record<InstrumentationName, object | undefined>>

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

async function createLatitudeInstrumentations(input: InstrumentationsInput): Promise<LlmInstrumentation[]> {
  if (!isPlainObject(input)) {
    throw new TypeError(
      `[Latitude] instrumentations must be an object mapping integration names to LLM SDK modules ` +
        `(e.g. { openai: OpenAI, anthropic: AnthropicSDK }). Received: ${JSON.stringify(input)}. See ${DOCS_URL}.`,
    )
  }

  const result: LlmInstrumentation[] = []

  for (const [name, mod] of Object.entries(input)) {
    if (mod === undefined) continue
    const def = (INTEGRATIONS as Record<string, IntegrationDef | undefined>)[name]
    if (!def) {
      throw new TypeError(
        `[Latitude] instrumentations: unknown integration "${name}". ` +
          `Expected one of: ${Object.keys(INTEGRATIONS).join(", ")}. See ${DOCS_URL}.`,
      )
    }

    let Ctor: InstrumentationCtor
    try {
      Ctor = await def.loadCtor()
    } catch {
      console.warn(
        `[Latitude] Instrumentation package not installed for ${name}: ${def.packageName}. Add it as a dependency to enable this instrumentation.`,
      )
      continue
    }

    const inst = new Ctor(def.enrichTokens !== undefined ? { enrichTokens: def.enrichTokens } : undefined)
    const target = def.normalize ? def.normalize(mod) : mod
    inst.manuallyInstrument?.(target)
    result.push(inst)
  }

  return result
}

/**
 * Registers LLM instrumentations with the global OpenTelemetry instrumentation registry.
 *
 * @example
 * ```typescript
 * import OpenAI from "openai"
 * import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node"
 * import { LatitudeSpanProcessor, registerLatitudeInstrumentations } from "@latitude-data/telemetry"
 *
 * const provider = new NodeTracerProvider({
 *   spanProcessors: [new LatitudeSpanProcessor(apiKey, projectSlug)],
 * })
 *
 * await registerLatitudeInstrumentations({
 *   instrumentations: { openai: OpenAI },
 *   tracerProvider: provider,
 * })
 *
 * provider.register()
 * ```
 */
export async function registerLatitudeInstrumentations(options: {
  instrumentations: InstrumentationsInput
  tracerProvider: TracerProvider
}): Promise<void> {
  const instrumentations = await createLatitudeInstrumentations(options.instrumentations)
  registerInstrumentations({
    instrumentations,
    tracerProvider: options.tracerProvider,
  })
}
