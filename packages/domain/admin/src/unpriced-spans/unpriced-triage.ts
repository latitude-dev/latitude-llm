/**
 * Standing decisions about provider/model pairs that arrive with token usage and no price.
 *
 * This list holds only what code cannot work out for itself. "Did adding pricing fix it?" is
 * already answered twice over — `classifyUnpricedPair` re-reads the live registry, and fixed pairs
 * stop being written as `unpriced` at all — so a hand-kept entry for that would be a third source
 * of truth that can only drift. What no lookup can answer is a judgement:
 *
 * - `fixed` is a **tripwire**, not a mute. It asserts "we expect no occurrences after `fixedAt`";
 *   later spans mean the fix did not take (a second provider spelling, a path the alias missed) and
 *   the row is surfaced as regressed. Without the date, stale pre-fix rows and a failed fix look
 *   identical.
 * - `wontFix` covers pairs no catalog entry could ever fix and that the derived rules in
 *   `unpriceablePairReason` do not already catch — an internal routing alias only the customer can
 *   resolve, or a customer whose SDK reports the wrong provider.
 *
 * Adding an entry is a code change on purpose: the decision lands in the same PR as the reasoning
 * that produced it, and review sees both.
 */
export interface UnpricedTriageFixed {
  readonly provider: string
  readonly model: string
  readonly decision: "fixed"
  /** `YYYY-MM-DD` (UTC) the fix reached production. Occurrences after this are a regression. */
  readonly fixedAt: string
  readonly note: string
}

export interface UnpricedTriageWontFix {
  readonly provider: string
  readonly model: string
  readonly decision: "wontFix"
  /**
   * `neverPriceable` — an internal or local label with no public rate to look up.
   * `notOurs` — the reported provider is wrong; the customer has to fix their instrumentation.
   * `acceptedFree` — we have decided the zero is correct.
   */
  readonly reason: "neverPriceable" | "notOurs" | "acceptedFree"
  readonly note: string
}

export type UnpricedTriageEntry = UnpricedTriageFixed | UnpricedTriageWontFix

/**
 * `findModelByBareId` taught the registry to price a bare model id against the reported provider's
 * own namespaced catalog entry, which covers every pair below in one change. The tripwires stay
 * per-pair because detection is per-pair: a spelling the rule still misses shows up as one row
 * coming back, not as a broken mechanism.
 *
 * Recorded for the pairs where a silent relapse would cost real money. The long tail the same
 * change also fixed (`openrouter/deepseek-v4-flash`, `llama-3.1-8b-instruct`, `gpt-4o-mini`,
 * together under 60K tokens over 30 days) is left out: it would read as `active` if it came back,
 * which is enough for usage that small.
 */
const BARE_ID_FIX_NOTE =
  "Priced by findModelByBareId against OpenRouter's own `<vendor>/<model>` entry. A relapse means the bare id stopped resolving — check the catalog entry still carries the vendor prefix."
const BARE_ID_FIXED_AT = "2026-07-31"

export const UNPRICED_TRIAGE: readonly UnpricedTriageEntry[] = [
  {
    provider: "openrouter",
    model: "grok-4.5",
    decision: "fixed",
    fixedAt: BARE_ID_FIXED_AT,
    note: `${BARE_ID_FIX_NOTE} Largest single gap found: 30,068 calls and 2.07B tokens over 30 days.`,
  },
  {
    provider: "openrouter",
    model: "glm-5.2",
    decision: "fixed",
    fixedAt: BARE_ID_FIXED_AT,
    note: `${BARE_ID_FIX_NOTE} 30,102 calls and 1.67B tokens over 30 days.`,
  },
  {
    provider: "openrouter",
    model: "gpt-5.5",
    decision: "fixed",
    fixedAt: BARE_ID_FIXED_AT,
    note: `${BARE_ID_FIX_NOTE} 245M tokens over 30 days.`,
  },
  {
    provider: "openrouter",
    model: "kimi-k3",
    decision: "fixed",
    fixedAt: BARE_ID_FIXED_AT,
    note: `${BARE_ID_FIX_NOTE} 144M tokens over 30 days.`,
  },
  {
    provider: "openrouter",
    model: "claude-sonnet-4",
    decision: "fixed",
    fixedAt: BARE_ID_FIXED_AT,
    note: BARE_ID_FIX_NOTE,
  },
  {
    provider: "openrouter",
    model: "gemini-3-flash-preview",
    decision: "fixed",
    fixedAt: BARE_ID_FIXED_AT,
    note: `${BARE_ID_FIX_NOTE} The only one of these still producing unpriced spans when the fix was written, so it is the first tripwire that will actually be exercised.`,
  },
  {
    provider: "anthropic",
    model: "qwen3.7-max",
    decision: "wontFix",
    reason: "notOurs",
    note: "Anthropic-compatible SDK pointed at a Qwen endpoint, so gen_ai.provider.name is wrong. Anthropic does not sell this model and rates across the 23 hosts that do span 3x, so any price we picked would be invented.",
  },
  {
    provider: "anthropic",
    model: "mimo-v2.5-pro",
    decision: "wontFix",
    reason: "notOurs",
    note: "Same misreported provider as anthropic/qwen3.7-max; MiMo is Xiaomi's, and host rates span 4.3x.",
  },
  {
    provider: "anthropic",
    model: "kimi-k3",
    decision: "wontFix",
    reason: "notOurs",
    note: "Same misreported provider as anthropic/qwen3.7-max; kimi-k3 is Moonshot's.",
  },
  {
    provider: "custom",
    model: "local-fast",
    decision: "wontFix",
    reason: "neverPriceable",
    note: "Internal routing alias with no catalog match on any provider. Only the customer knows what it points at.",
  },
  {
    provider: "custom",
    model: "council-fast",
    decision: "wontFix",
    reason: "neverPriceable",
    note: "Internal routing alias with no catalog match on any provider.",
  },
  {
    provider: "custom",
    model: "council-primary",
    decision: "wontFix",
    reason: "neverPriceable",
    note: "Internal routing alias with no catalog match on any provider.",
  },
  {
    provider: "custom",
    model: "glm-4.7-flash:q4_K_M",
    decision: "wontFix",
    reason: "neverPriceable",
    note: "`q4_K_M` is a GGUF quantisation tag, so this is a local llama.cpp/Ollama build behind a self-chosen provider label. No per-token rate exists.",
  },
]

const triageKey = (provider: string, model: string): string => `${provider.toLowerCase()} ${model.toLowerCase()}`

const TRIAGE_BY_PAIR: ReadonlyMap<string, UnpricedTriageEntry> = new Map(
  UNPRICED_TRIAGE.map((entry) => [triageKey(entry.provider, entry.model), entry]),
)

export function findUnpricedTriage(provider: string, model: string): UnpricedTriageEntry | null {
  return TRIAGE_BY_PAIR.get(triageKey(provider, model)) ?? null
}
