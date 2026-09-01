import type { CostSource, SpanTokenCounts } from "../../entities/span.ts"
import { resolveSpanCost, usdToMicrocents } from "../../helpers/estimate-span-cost.ts"
import { stringAttr } from "../attributes.ts"
import type { OtlpKeyValue } from "../types.ts"
import { resolveTokens } from "./usage/tokens.ts"
import { first, fromFloat } from "./utils.ts"

const costInputCandidates = [
  fromFloat("gen_ai.usage.input_cost", usdToMicrocents),
  fromFloat("llm.cost.prompt", usdToMicrocents),
]

const costOutputCandidates = [
  fromFloat("gen_ai.usage.output_cost", usdToMicrocents),
  fromFloat("llm.cost.completion", usdToMicrocents),
]

const costTotalCandidates = [
  fromFloat("gen_ai.usage.total_cost", (v) => (v ? usdToMicrocents(v) : undefined)),
  fromFloat("gen_ai.usage.cost", (v) => (v ? usdToMicrocents(v) : undefined)),
  fromFloat("llm.cost.total", (v) => (v ? usdToMicrocents(v) : undefined)),
]

// ─── Resolve ─────────────────────────────────────────────

export interface ResolvedUsage extends SpanTokenCounts {
  readonly costInputMicrocents: number
  readonly costOutputMicrocents: number
  readonly costTotalMicrocents: number
  readonly costIsEstimated: boolean
  readonly costSource: CostSource
  /** Catalog provider the estimate came from. Empty unless we priced it ourselves. */
  readonly costPricedProvider: string
  /** Catalog model id the estimate came from, which may be a base entry of the reported model. */
  readonly costPricedModel: string
}

// ─── OpenClaw embedded usage ──────────────────────────────
//
// OpenClaw's diagnostics-otel plugin never emits flat gen_ai.usage.* attrs. It
// buries per-call usage — and the provider's real cost (USD) — inside the
// assistant message JSON on `openclaw.content.output_messages`:
//
//   [{ role, content, usage: { input, output, cacheRead, cacheWrite,
//        reasoningTokens, totalTokens, cost: { input, output, total, … } } }]
//
// `input` is ADDITIVE (excludes cache), matching ResolvedUsage's contract, so
// fields map straight across with no inclusive/additive inference. The same
// totals also ride on a standalone `openclaw.model.usage` span the plugin emits
// in its own orphan trace (dropped at ingest, see otlp/dropped-spans.ts) — this
// per-call copy lives on the model.call span inside the run trace.

interface OpenclawCost {
  readonly input?: unknown
  readonly output?: unknown
  readonly cacheRead?: unknown
  readonly cacheWrite?: unknown
  readonly total?: unknown
}

interface OpenclawUsage {
  readonly input?: unknown
  readonly output?: unknown
  readonly cacheRead?: unknown
  readonly cacheWrite?: unknown
  readonly reasoningTokens?: unknown
  readonly cost?: OpenclawCost
}

function nonNegative(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? Math.max(0, v) : 0
}

function extractEmbeddedUsage(outputMessagesJson: string): OpenclawUsage | undefined {
  try {
    const parsed: unknown = JSON.parse(outputMessagesJson)
    if (!Array.isArray(parsed)) return undefined
    const withUsage = parsed.find((m): m is { usage: OpenclawUsage } => {
      if (!m || typeof m !== "object") return false
      const usage = (m as { usage?: unknown }).usage
      return usage !== null && typeof usage === "object"
    })
    return withUsage?.usage
  } catch {
    return undefined
  }
}

function resolveEmbeddedMessageUsage(
  attrs: readonly OtlpKeyValue[],
  provider: string,
  model: string,
): ResolvedUsage | null {
  const raw = stringAttr(attrs, "openclaw.content.output_messages")
  if (!raw) return null
  const usage = extractEmbeddedUsage(raw)
  if (!usage) return null

  const tokensInput = nonNegative(usage.input)
  const tokensOutput = nonNegative(usage.output)
  const tokensCacheRead = nonNegative(usage.cacheRead)
  const tokensCacheCreate = nonNegative(usage.cacheWrite)
  const tokensReasoning = nonNegative(usage.reasoningTokens)
  if (tokensInput + tokensOutput + tokensCacheRead + tokensCacheCreate + tokensReasoning === 0) return null

  const tokens = { tokensInput, tokensOutput, tokensCacheRead, tokensCacheCreate, tokensReasoning }
  const cost = usage.cost && typeof usage.cost === "object" ? usage.cost : undefined

  // Cache costs fold into the input side so the two sides reconcile with the provider's own total.
  const reported =
    cost && typeof cost.total === "number"
      ? {
          inputMicrocents: usdToMicrocents(
            nonNegative(cost.input) + nonNegative(cost.cacheRead) + nonNegative(cost.cacheWrite),
          ),
          outputMicrocents: usdToMicrocents(nonNegative(cost.output)),
          totalMicrocents: usdToMicrocents(nonNegative(cost.total)),
        }
      : {}

  return { ...tokens, ...resolveSpanCost({ reported, provider, model, tokens }) }
}

interface ResolveUsageInput {
  readonly attrs: readonly OtlpKeyValue[]
  readonly provider: string
  readonly model: string
}

export function resolveUsage({ attrs, provider, model }: ResolveUsageInput): ResolvedUsage {
  // Some instrumentations carry usage in the message payload rather than as flat
  // gen_ai.usage.* attrs (OpenClaw) — prefer that when present.
  const embedded = resolveEmbeddedMessageUsage(attrs, provider, model)
  if (embedded) return embedded

  const tokens = resolveTokens(attrs, provider)

  return {
    ...tokens,
    ...resolveSpanCost({
      reported: {
        inputMicrocents: first(costInputCandidates, attrs),
        outputMicrocents: first(costOutputCandidates, attrs),
        totalMicrocents: first(costTotalCandidates, attrs),
      },
      provider,
      model,
      tokens,
    }),
  }
}
