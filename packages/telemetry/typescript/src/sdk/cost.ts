/**
 * Customer-supplied LLM cost ("bring your own cost").
 *
 * Cost is resolved when each span ends (`SpanCostTracker`) and applied at export time by
 * `ExportViewExporter` (see `export-view.ts`), which hands the inner exporter a Proxy whose
 * `attributes` carry the SDK cost. The original span is never mutated, so other span
 * processors / exporters on the host provider keep seeing exactly what the instrumentor wrote.
 *
 * Where the SDK sets cost it writes `gen_ai.usage.input_cost` / `output_cost` / `total_cost` (USD)
 * plus `latitude.cost.source = "user"`, and it owns the whole cost triple on that span: any cost an
 * instrumentor already wrote is replaced or removed (see `applyCost`).
 *
 * Precedence, highest first: `setLlmCost(span)` > `capture(..., { cost })` > `costResolver` >
 * `pricing` > nothing (the span is exported untouched and Latitude prices it server-side).
 */
import type { Span as ApiSpan, Attributes, AttributeValue } from "@opentelemetry/api"
import type { ReadableSpan } from "@opentelemetry/sdk-trace-node"
import { ATTRIBUTES, COST_SOURCE_USER } from "../constants/index.ts"

/**
 * Cost of one LLM call in USD. Give `input`/`output`, `total`, or all three. Passed as
 * `capture(name, fn, { cost })`, it is a cost per LLM call applied to every LLM call in the capture.
 */
export type LlmCost = {
  input?: number
  output?: number
  total?: number
}

/** USD per 1M tokens. A missing rate counts as 0 (e.g. embeddings have no output rate). */
export type ModelPricing = {
  inputPer1M?: number
  outputPer1M?: number
}

/** What a `costResolver` receives for each LLM-call span. */
export type LlmUsage = {
  readonly provider: string | undefined
  readonly model: string | undefined
  readonly inputTokens: number | undefined
  readonly outputTokens: number | undefined
  readonly operation: string
  readonly spanName: string
  readonly attributes: Readonly<Attributes>
}

export type CostResolver = (usage: LlmUsage) => LlmCost | null | undefined

/** Normalized cost: `total` is always present (input + output when not given). */
export type NormalizedCost = {
  readonly input?: number
  readonly output?: number
  readonly total: number
}

// Every cost key Latitude ingest reads. When the SDK sets cost it strips all of them before writing
// its own, so a stale instrumentor figure is never read alongside (or instead of) the SDK's.
const COST_KEYS_TO_STRIP: ReadonlySet<string> = new Set([
  ATTRIBUTES.costInput,
  ATTRIBUTES.costOutput,
  ATTRIBUTES.costTotal,
  "gen_ai.usage.cost",
  "llm.cost.prompt",
  "llm.cost.completion",
  "llm.cost.total",
])

// ─── LLM-call span detection ───────────────────────────────────────────────────
// USAGE_OPERATIONS mirrors packages/domain/spans/src/entities/span.ts: trace/session rollups and the
// Cost page only count usage/cost on these operations, so those are the only spans the SDK prices.
// The mapping to an operation mirrors packages/domain/spans/src/otlp/resolvers/operation.ts.

const USAGE_OPERATIONS: ReadonlySet<string> = new Set([
  "chat",
  "text_completion",
  "generate_content",
  "embeddings",
  "reranker",
])

const GENAI_OPERATION: Record<string, string> = { rerank: "reranker" }
const OPENINFERENCE_OPERATION: Record<string, string> = { LLM: "chat", EMBEDDING: "embeddings", RERANKER: "reranker" }
const OPENLLMETRY_OPERATION: Record<string, string> = {
  completion: "text_completion",
  embedding: "embeddings",
  rerank: "reranker",
}
// Vercel AI SDK: only the provider-call leaves. Wrappers (ai.generateText, ai.embed, ...) repeat
// their leaves' usage, so pricing them too would double count.
const VERCEL_OPERATION: Record<string, string> = {
  "ai.generateText.doGenerate": "chat",
  "ai.streamText.doStream": "chat",
  "ai.generateObject.doGenerate": "chat",
  "ai.streamObject.doStream": "chat",
  "ai.embed.doEmbed": "embeddings",
  "ai.embedMany.doEmbed": "embeddings",
}

// CrewAI's OpenInference instrumentor puts the whole conversation (and usage) on its AGENT span, with
// no LLM leaf; ingest counts that span as `chat`, so the SDK prices it too.
const CREWAI_OPENINFERENCE_SCOPE = "openinference.instrumentation.crewai"

const INPUT_TOKEN_KEYS = [
  "gen_ai.usage.input_tokens",
  "gen_ai.usage.prompt_tokens",
  "llm.token_count.prompt",
  "ai.usage.promptTokens",
  "ai.usage.inputTokens",
]
const OUTPUT_TOKEN_KEYS = [
  "gen_ai.usage.output_tokens",
  "gen_ai.usage.completion_tokens",
  "llm.token_count.completion",
  "ai.usage.completionTokens",
  "ai.usage.outputTokens",
]
const PROVIDER_KEYS = ["gen_ai.provider.name", "gen_ai.model.provider", "gen_ai.system", "llm.system", "llm.provider"]
// Vercel AI SDK names the provider by its API surface ("openai.chat"); only the vendor is kept.
const VERCEL_PROVIDER_KEY = "ai.model.provider"
const MODEL_KEYS = ["gen_ai.response.model", "gen_ai.request.model", "llm.model_name", "ai.model.id"]

function strAttr(attrs: Attributes, key: string): string | undefined {
  const value = attrs[key]
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined
}

function firstStr(attrs: Attributes, keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const value = strAttr(attrs, key)
    if (value !== undefined) return value
  }
  return undefined
}

function firstInt(attrs: Attributes, keys: readonly string[]): number | undefined {
  for (const key of keys) {
    const value = attrs[key]
    if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value)
  }
  return undefined
}

function providerOf(attrs: Attributes): string | undefined {
  return firstStr(attrs, PROVIDER_KEYS) ?? strAttr(attrs, VERCEL_PROVIDER_KEY)?.split(".")[0]
}

function openInferenceOperation(kind: string, scopeName: string): string {
  const upper = kind.toUpperCase()
  if (upper === "AGENT" && scopeName.startsWith(CREWAI_OPENINFERENCE_SCOPE)) return "chat"
  return OPENINFERENCE_OPERATION[upper] ?? kind.toLowerCase()
}

/** The span's operation if it is an LLM call Latitude counts usage for, else undefined. */
function usageOperation(attrs: Attributes, scopeName: string): string | undefined {
  if (attrs["latitude.capture.root"]) return undefined
  let operation: string | undefined
  const genai = strAttr(attrs, "gen_ai.operation.name")
  const kind = strAttr(attrs, "openinference.span.kind")
  const requestType = strAttr(attrs, "llm.request.type")
  const vercel = strAttr(attrs, "ai.operationId")
  if (genai !== undefined) operation = GENAI_OPERATION[genai] ?? genai
  else if (kind !== undefined) operation = openInferenceOperation(kind, scopeName)
  else if (requestType !== undefined) operation = OPENLLMETRY_OPERATION[requestType] ?? requestType
  else if (vercel !== undefined) operation = VERCEL_OPERATION[vercel]
  return operation !== undefined && USAGE_OPERATIONS.has(operation) ? operation : undefined
}

function extractUsage(span: ReadableSpan, operation: string): LlmUsage {
  const attrs = span.attributes ?? {}
  return {
    provider: providerOf(attrs),
    model: firstStr(attrs, MODEL_KEYS),
    inputTokens: firstInt(attrs, INPUT_TOKEN_KEYS),
    outputTokens: firstInt(attrs, OUTPUT_TOKEN_KEYS),
    operation,
    spanName: span.name,
    attributes: { ...attrs },
  }
}

// ─── Normalization ─────────────────────────────────────────────────────────────

function isValidAmount(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
}

/**
 * Validates a user cost and fills in the total. Returns undefined when nothing usable was given.
 * An explicit 0 is a valid cost. When `total` is absent it becomes input + output (a missing side
 * counts as 0), so an instrumentor's stale total can never survive next to the SDK's own sides.
 */
export function normalizeCost(cost: unknown, source: string): NormalizedCost | undefined {
  if (cost === undefined || cost === null) return undefined
  if (typeof cost !== "object") {
    console.warn(`[Latitude] Ignoring ${source} cost: expected an object, got ${typeof cost}`)
    return undefined
  }
  const raw = cost as Record<string, unknown>
  const picked: { input?: number; output?: number; total?: number } = {}
  for (const key of ["input", "output", "total"] as const) {
    const value = raw[key]
    if (value === undefined || value === null) continue
    if (!isValidAmount(value)) {
      console.warn(`[Latitude] Ignoring ${source} cost ${key}=${String(value)}: expected a finite number >= 0`)
      continue
    }
    picked[key] = value
  }
  if (picked.input === undefined && picked.output === undefined && picked.total === undefined) return undefined
  return { ...picked, total: picked.total ?? (picked.input ?? 0) + (picked.output ?? 0) }
}

type PricingTable = ReadonlyMap<string, { readonly input: number; readonly output: number }>

function normalizePricing(pricing: Record<string, ModelPricing> | undefined): PricingTable {
  const table = new Map<string, { input: number; output: number }>()
  for (const [key, entry] of Object.entries(pricing ?? {})) {
    if (!key.includes("/") || !entry || typeof entry !== "object") {
      console.warn(`[Latitude] Ignoring pricing entry "${key}": expected "<provider>/<model>" -> rates`)
      continue
    }
    const { inputPer1M, outputPer1M } = entry
    if (inputPer1M === undefined && outputPer1M === undefined) {
      console.warn(`[Latitude] Ignoring pricing entry "${key}": set inputPer1M and/or outputPer1M`)
      continue
    }
    if (
      (inputPer1M !== undefined && !isValidAmount(inputPer1M)) ||
      (outputPer1M !== undefined && !isValidAmount(outputPer1M))
    ) {
      console.warn(`[Latitude] Ignoring pricing entry "${key}": rates must be finite numbers >= 0`)
      continue
    }
    table.set(key.trim().toLowerCase(), { input: inputPer1M ?? 0, output: outputPer1M ?? 0 })
  }
  return table
}

function price(table: PricingTable, span: ReadableSpan, usage: LlmUsage): NormalizedCost | undefined {
  if (table.size === 0 || usage.provider === undefined) return undefined
  if (usage.inputTokens === undefined && usage.outputTokens === undefined) return undefined
  const attrs = span.attributes ?? {}
  // Response model first (what actually ran), then the requested one.
  for (const modelKey of MODEL_KEYS) {
    const model = strAttr(attrs, modelKey)
    if (model === undefined) continue
    const rates = table.get(`${usage.provider}/${model}`.toLowerCase())
    if (!rates) continue
    const input = ((usage.inputTokens ?? 0) * rates.input) / 1_000_000
    const output = ((usage.outputTokens ?? 0) * rates.output) / 1_000_000
    return { input, output, total: input + output }
  }
  return undefined
}

// ─── Explicit per-span cost (setLlmCost) ───────────────────────────────────────

// Keyed by the live span object, which is the same object the exporter later receives.
const explicitCosts = new WeakMap<object, NormalizedCost>()

let notUsageSpanWarned = false

function warnIfNotUsageSpan(span: ApiSpan): void {
  if (notUsageSpanWarned) return
  // The API span type hides attributes; the SDK span exposes them, as ReadableSpan does.
  const readable = span as Partial<Pick<ReadableSpan, "attributes" | "instrumentationScope" | "name">>
  const attrs = readable.attributes
  // Not an SDK span we can inspect, so there is no way to tell; never warn on a guess.
  if (attrs === null || typeof attrs !== "object") return
  if (usageOperation(attrs, readable.instrumentationScope?.name ?? "") !== undefined) return
  notUsageSpanWarned = true
  console.warn(
    `[Latitude] setLlmCost was called on span "${readable.name}", which is not an LLM-call span ` +
      `(gen_ai.operation.name=${JSON.stringify(attrs["gen_ai.operation.name"])}; expected one of ` +
      `${[...USAGE_OPERATIONS].join(", ")}). The cost is still set on the span, but trace and session ` +
      "totals and the Cost page will not count it. Call setLlmCost on the LLM-call span. This warning is logged once.",
  )
}

/**
 * Sets the cost (USD) of the LLM call `span` represents.
 *
 * Writes `gen_ai.usage.input_cost` / `output_cost` / `total_cost` and `latitude.cost.source="user"`
 * on the live span. When `total` is omitted it is input + output. A cost set here wins over
 * `capture(..., { cost })`, `costResolver` and `pricing`, and over any cost an instrumentor writes on
 * the same span (Latitude re-applies it at export). An explicit 0 is honoured.
 *
 * Call it on the LLM-call span, with `gen_ai.operation.name` already set to `chat`,
 * `text_completion`, `generate_content`, `embeddings` or `rerank`/`reranker` (or the OpenInference,
 * OpenLLMetry or Vercel AI SDK equivalent). Trace and session totals and the Cost page only count
 * cost on those spans. On any other span the cost is still set, and a warning is logged once per
 * process.
 */
export function setLlmCost(span: ApiSpan, cost: LlmCost): void {
  const normalized = normalizeCost(cost, "setLlmCost")
  if (!normalized) {
    console.warn("[Latitude] setLlmCost called without a valid input, output or total; ignoring")
    return
  }
  if (!span.isRecording()) return
  warnIfNotUsageSpan(span)
  const attributes: Attributes = {
    [ATTRIBUTES.costTotal]: normalized.total,
    [ATTRIBUTES.costSource]: COST_SOURCE_USER,
  }
  if (normalized.input !== undefined) attributes[ATTRIBUTES.costInput] = normalized.input
  if (normalized.output !== undefined) attributes[ATTRIBUTES.costOutput] = normalized.output
  span.setAttributes(attributes)
  explicitCosts.set(span, normalized)
}

// ─── Resolution, bookkeeping and export wrapper ────────────────────────────────

type CostResolutionOptions = {
  pricing?: Record<string, ModelPricing> | undefined
  costResolver?: CostResolver | undefined
}

export class CostResolution {
  private readonly pricing: PricingTable
  private readonly resolver: CostResolver | undefined

  constructor(options: CostResolutionOptions = {}) {
    this.pricing = normalizePricing(options.pricing)
    this.resolver = options.costResolver
  }

  resolve(span: ReadableSpan, captured: NormalizedCost | undefined): NormalizedCost | undefined {
    const explicit = explicitCosts.get(span)
    if (explicit) return explicit
    const attrs = span.attributes ?? {}
    // Marked by the user (set by hand, or setLlmCost on a span we can't correlate): trust it as-is.
    if (attrs[ATTRIBUTES.costSource] === COST_SOURCE_USER) return undefined
    const operation = usageOperation(attrs, span.instrumentationScope?.name ?? "")
    if (operation === undefined) return undefined
    if (captured) return captured
    if (!this.resolver && this.pricing.size === 0) return undefined
    const usage = extractUsage(span, operation)
    if (this.resolver) {
      let resolved: NormalizedCost | undefined
      try {
        resolved = normalizeCost(this.resolver(usage), "costResolver")
      } catch (error) {
        console.warn("[Latitude] costResolver threw; falling back to pricing:", error)
      }
      if (resolved) return resolved
    }
    return price(this.pricing, span, usage)
  }
}

/**
 * Resolves each span's cost when it ends and carries it to export without touching the span.
 * `onStart` remembers the capture-context cost; `onEnd` resolves the final cost *before* redaction
 * runs (so a redaction rule can't hide the attributes cost is resolved from). WeakMap entries vanish
 * with the span, so filtered-out spans don't leak.
 */
export class SpanCostTracker {
  private captureCosts = new WeakMap<object, NormalizedCost>()
  private resolvedCosts = new WeakMap<object, NormalizedCost>()

  constructor(private readonly resolution: CostResolution) {}

  onStart(span: object, cost: NormalizedCost): void {
    this.captureCosts.set(span, cost)
  }

  onEnd(span: ReadableSpan): void {
    let cost: NormalizedCost | undefined
    try {
      cost = this.resolution.resolve(span, this.captureCosts.get(span))
    } catch (error) {
      console.warn("[Latitude] Failed to resolve LLM cost; exporting span unchanged:", error)
    }
    this.captureCosts.delete(span)
    if (cost) this.resolvedCosts.set(span, cost)
  }

  costFor(span: object): NormalizedCost | undefined {
    return this.resolvedCosts.get(span)
  }

  clear(): void {
    this.captureCosts = new WeakMap()
    this.resolvedCosts = new WeakMap()
  }
}

/**
 * The SDK owns the cost triple once it sets cost: every instrumentor cost key is dropped, then the
 * SDK's keys are written. Total-only therefore drops instrumentor input/output costs instead of
 * leaving sides that no longer add up to the user's total.
 */
export function applyCost(attrs: Attributes, cost: NormalizedCost): Attributes {
  const merged: Record<string, AttributeValue | undefined> = {}
  for (const [key, value] of Object.entries(attrs)) {
    if (!COST_KEYS_TO_STRIP.has(key)) merged[key] = value
  }
  if (cost.input !== undefined) merged[ATTRIBUTES.costInput] = cost.input
  if (cost.output !== undefined) merged[ATTRIBUTES.costOutput] = cost.output
  merged[ATTRIBUTES.costTotal] = cost.total
  merged[ATTRIBUTES.costSource] = COST_SOURCE_USER
  return merged
}
