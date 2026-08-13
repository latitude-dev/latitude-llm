import { getModelForProvider, getModelPricing } from "@domain/models"
import { isUsageOperation } from "../entities/span.ts"

/**
 * Local inference runtimes: the model runs on the caller's own hardware, so there is no per-token
 * rate to find and the catalog will never grow one. Kept to runtimes that only ever mean "local" —
 * `custom` is deliberately absent, because customers use it for real paid proxies too
 * (`custom/deepseek-chat` is DeepSeek's own model behind a self-chosen label).
 */
const LOCAL_RUNTIME_PROVIDERS: ReadonlySet<string> = new Set(["lmstudio", "ollama", "ollamapc"])

/** The customer's own free-tier marker; the registry already refuses to price across a `:` modifier. */
const FREE_TIER_SUFFIX = ":free"

/** Why a provider/model pair can never carry a price, whatever the catalog does next. */
export const UNPRICEABLE_PAIR_REASONS = ["noPair", "localRuntime", "freeTier", "catalogDeclines"] as const
export type UnpriceablePairReason = (typeof UNPRICEABLE_PAIR_REASONS)[number]

/**
 * Why no catalog entry could ever price this pair, or `null` when a pair is a genuine gap.
 *
 * Split from {@link shouldReportUnpricedSpan} because the same judgement answers two questions: the
 * ingest path asks whether to alert, and the backoffice triage view asks whether a standing row is
 * ever worth a human's attention. Both must agree, so they read one rule set.
 */
export function unpriceablePairReason({
  provider,
  model,
}: {
  readonly provider: string
  readonly model: string
}): UnpriceablePairReason | null {
  // A missing provider/model is an instrumentation gap on the sender's side, diagnosed and owned
  // differently from a catalog gap.
  if (!provider || !model) return "noPair"

  if (LOCAL_RUNTIME_PROVIDERS.has(provider.toLowerCase())) return "localRuntime"
  if (model.toLowerCase().endsWith(FREE_TIER_SUFFIX)) return "freeTier"

  // The catalog lists this exact pair and gives it no rate — models.dev declining to price a
  // subscription host (Ollama Cloud), not an entry anyone is missing. The pricing check is what
  // separates that from a pair the catalog prices perfectly well: at ingest the two cannot be
  // confused (a priced pair never reaches here), but callers reading stored rows see both.
  const catalogued = getModelForProvider(provider, model)
  if (catalogued && !getModelPricing(catalogued)) return "catalogDeclines"

  return null
}

/**
 * Whether an unpriced span is worth alerting on, which is a narrower question than whether it was
 * unpriced. `costSource` stays `unpriced` for everything this rejects — the stored record and the
 * Cost page's coverage maths are unchanged; only the Datadog report is withheld.
 *
 * Reporting a zero that is *correct* trains the reader to ignore the issue, so each rejection here
 * is a case where no catalog entry could be the fix.
 */
export function shouldReportUnpricedSpan({
  provider,
  model,
  operation,
}: {
  readonly provider: string
  readonly model: string
  readonly operation: string
}): boolean {
  // Not spend: excluded from every cost figure, so a missing price cannot understate anything.
  if (!isUsageOperation(operation)) return false

  return unpriceablePairReason({ provider, model }) === null
}
