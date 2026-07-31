/**
 * Why average cost per session moved, as contributions in percentage points that
 * add up to the move itself.
 *
 * Cost per session is a product — `turns/session x steps/turn x tokens/step x
 * price/token` — and a product decomposes exactly in log space: each factor's
 * share of `ln(C_c / C_p)` is its share of the change, with no regression and no
 * double counting. A correlation would attribute the same rise twice, since
 * tokens grow with turns.
 *
 * Nothing here reads a repository or the pricing registry: every input is a
 * number, so the whole thing is exhaustively testable and safe for the browser
 * entry. It is also the shape the API/MCP surface will expose, so it must stay
 * independent of how the rows are rendered.
 */

/**
 * `turnsPerSession`, `stepsPerTurn` and `tokensPerStep` are the volume factors —
 * how much work a session does. The last three are all price: `modelMix` is
 * which models the tokens went to, `cacheEfficiency` is how much of the prompt
 * was charged at the read rate, and `pricePerToken` is whatever within-model
 * rate change is left after those two.
 */
const SESSION_COST_FACTORS = [
  "turnsPerSession",
  "stepsPerTurn",
  "tokensPerStep",
  "modelMix",
  "cacheEfficiency",
  "pricePerToken",
] as const
export type SessionCostFactor = (typeof SESSION_COST_FACTORS)[number]

/**
 * Sessions a period needs before its cost per session may be compared to another
 * period's. Below this one expensive session moves the average by tens of points,
 * so the decomposition would be arithmetic over noise — the same trap the
 * breakdown table's `278x avg` chip fell into.
 */
export const SESSION_COST_MIN_SESSIONS = 20

// Below this the cost is flat and the weights would divide by ~0, so every row reads 0.
const SESSION_COST_FLAT_LOG_EPSILON = 1e-6

// Sub-effects this close to cancelling each other out leave the factor they split
// with no change to divide by, whatever their individual sizes.
const NEGLIGIBLE_EFFECT_SHARE = 1e-9

/** Per price-list, so the same model slug served by two providers is two entries. */
export interface SessionCostModelSlice {
  readonly provider: string
  readonly model: string
  readonly tokens: number
  readonly costMicrocents: number
}

/**
 * One period's raw counts. `sessions` counts the session key the rollups use —
 * `session_id` where present, the trace id otherwise — so traffic that reported
 * no session id is a single-trace pseudo-session rather than being dropped.
 * `traceKeyedSessions` is how many of them are that, which is what lets the
 * caller say so instead of quietly renaming cost per trace.
 */
export interface SessionCostPeriod {
  readonly sessions: number
  readonly traceKeyedSessions: number
  /** Traces with a billable call: one turn of a conversation. */
  readonly turns: number
  /** Billable LLM calls: the steps a single turn took. */
  readonly steps: number
  readonly tokens: number
  readonly costMicrocents: number
  /** Calls whose model has no known pricing, so this period's cost is understated. */
  readonly unpricedCalls: number
  readonly models: readonly SessionCostModelSlice[]
}

export interface SessionCostContribution {
  readonly factor: SessionCostFactor
  /** Percentage points of the headline change, rounded so the rows sum to it exactly. */
  readonly points: number
  /** The factor's own before/after values, absent for the price sub-factors, which are not ratios. */
  readonly values: { readonly previous: number; readonly current: number } | null
}

/**
 * `notEnoughData` means no comparison is possible and only the headline should
 * render; `flat` means the comparison held still, which is a real answer and not
 * an error. Both leave `rows` empty rather than shipping zeros that look measured.
 */
export type SessionCostDecompositionStatus = "ok" | "flat" | "notEnoughData"

export interface CostPerSessionDecomposition {
  readonly status: SessionCostDecompositionStatus
  readonly previousCostPerSessionMicrocents: number
  readonly currentCostPerSessionMicrocents: number
  /** Null when the periods cannot be compared. Unrounded; `totalPoints` is what the rows sum to. */
  readonly changePct: number | null
  /** The headline change as shown, to the whole point. Every row's `points` sums to this. */
  readonly totalPoints: number
  /** Largest contribution first, so the row that explains the move reads first. */
  readonly rows: readonly SessionCostContribution[]
  /**
   * Session-count change, deliberately not a row: sessions are the denominator,
   * so growth in them does not move cost per session at all. Shown as context
   * because "we are simply busier" is the one cost story that is good news.
   */
  readonly volume: { readonly previousSessions: number; readonly currentSessions: number }
}

export interface DecomposeCostPerSessionInput {
  readonly previous: SessionCostPeriod
  readonly current: SessionCostPeriod
  /**
   * Change in price per token attributable to cache efficiency, in microcents per
   * token, signed the same way as the mix and rate effects. Its own row when
   * supplied; folded into `pricePerToken` when not.
   */
  readonly cacheEfficiencyEffect?: number | undefined
}

const costPerSession = (period: SessionCostPeriod): number =>
  period.sessions > 0 ? period.costMicrocents / period.sessions : 0

interface Factors {
  readonly turnsPerSession: number
  readonly stepsPerTurn: number
  readonly tokensPerStep: number
  readonly pricePerToken: number
}

/** Null when any denominator is empty, which is what makes the whole product unusable. */
function factorsOf(period: SessionCostPeriod): Factors | null {
  if (period.sessions <= 0 || period.turns <= 0 || period.steps <= 0 || period.tokens <= 0) return null
  if (period.costMicrocents <= 0) return null
  return {
    turnsPerSession: period.turns / period.sessions,
    stepsPerTurn: period.steps / period.turns,
    tokensPerStep: period.tokens / period.steps,
    pricePerToken: period.costMicrocents / period.tokens,
  }
}

const priceListKey = (slice: SessionCostModelSlice): string => `${slice.provider}/${slice.model}`

interface ModelPosition {
  readonly share: number
  readonly price: number
}

const positionsOf = (period: SessionCostPeriod): Map<string, ModelPosition> => {
  const positions = new Map<string, ModelPosition>()
  for (const slice of period.models) {
    if (slice.tokens <= 0) continue
    positions.set(priceListKey(slice), {
      share: slice.tokens / period.tokens,
      price: slice.costMicrocents / slice.tokens,
    })
  }
  return positions
}

/**
 * How much of the price move came from tokens shifting between price lists rather
 * than from any price changing: `sum((share_c - share_p) * price_p)`.
 *
 * A price list with no previous tokens is baselined at the previous period's
 * blended price, so simply routing traffic somewhere new is mix-neutral and only
 * that destination's deviation from the old average shows up as a rate change.
 */
function modelMixEffect({
  previous,
  current,
  previousBlendedPrice,
}: {
  readonly previous: Map<string, ModelPosition>
  readonly current: Map<string, ModelPosition>
  readonly previousBlendedPrice: number
}): number {
  let effect = 0
  for (const key of new Set([...previous.keys(), ...current.keys()])) {
    const previousPosition = previous.get(key)
    const shareDelta = (current.get(key)?.share ?? 0) - (previousPosition?.share ?? 0)
    effect += shareDelta * (previousPosition?.price ?? previousBlendedPrice)
  }
  return effect
}

/**
 * Splits one factor's contribution across sub-effects that sum to the factor's own
 * change, so the parts still add up to the whole. When the change is negligible
 * next to the sub-effects — a mix shift cancelled by a rate move — the factor
 * contributed nothing, and an even split keeps every part at that same nothing
 * instead of dividing by it.
 */
function allocate({
  contribution,
  effects,
}: {
  readonly contribution: number
  readonly effects: readonly number[]
}): readonly number[] {
  const total = effects.reduce((sum, effect) => sum + effect, 0)
  const magnitude = effects.reduce((sum, effect) => sum + Math.abs(effect), 0)
  if (total === 0 || Math.abs(total) <= NEGLIGIBLE_EFFECT_SHARE * magnitude) {
    return effects.map(() => contribution / effects.length)
  }
  return effects.map((effect) => (contribution * effect) / total)
}

/**
 * Whole points that still sum to the headline. The residual lands on the largest
 * contribution, where a one-point adjustment is proportionally smallest — if the
 * rows do not add up to the number above them, the card reads as decoration.
 */
function toWholePoints({
  raw,
  totalPoints,
}: {
  readonly raw: readonly { readonly factor: SessionCostFactor; readonly value: number }[]
  readonly totalPoints: number
}): readonly { readonly factor: SessionCostFactor; readonly points: number; readonly value: number }[] {
  const rounded = raw.map((entry) => ({ ...entry, points: Math.round(entry.value) }))
  const residual = totalPoints - rounded.reduce((sum, entry) => sum + entry.points, 0)
  if (residual === 0 || rounded.length === 0) return rounded

  let largest = 0
  for (let index = 1; index < rounded.length; index++) {
    const candidate = rounded[index]
    const incumbent = rounded[largest]
    if (candidate && incumbent && Math.abs(candidate.value) > Math.abs(incumbent.value)) largest = index
  }
  return rounded.map((entry, index) => (index === largest ? { ...entry, points: entry.points + residual } : entry))
}

const emptyResult = ({
  status,
  input,
  changePct,
}: {
  readonly status: SessionCostDecompositionStatus
  readonly input: DecomposeCostPerSessionInput
  readonly changePct: number | null
}): CostPerSessionDecomposition => ({
  status,
  previousCostPerSessionMicrocents: costPerSession(input.previous),
  currentCostPerSessionMicrocents: costPerSession(input.current),
  changePct,
  totalPoints: changePct === null ? 0 : Math.round(changePct),
  rows: [],
  volume: { previousSessions: input.previous.sessions, currentSessions: input.current.sessions },
})

export function decomposeCostPerSession(input: DecomposeCostPerSessionInput): CostPerSessionDecomposition {
  const { previous, current, cacheEfficiencyEffect } = input
  const previousFactors = factorsOf(previous)
  const currentFactors = factorsOf(current)
  const previousCost = costPerSession(previous)
  const currentCost = costPerSession(current)

  if (
    !previousFactors ||
    !currentFactors ||
    previous.sessions < SESSION_COST_MIN_SESSIONS ||
    current.sessions < SESSION_COST_MIN_SESSIONS
  ) {
    return emptyResult({ status: "notEnoughData", input, changePct: null })
  }

  const changePct = (currentCost / previousCost - 1) * 100
  const totalLog = Math.log(currentCost / previousCost)
  if (Math.abs(totalLog) < SESSION_COST_FLAT_LOG_EPSILON) return emptyResult({ status: "flat", input, changePct })

  const totalPoints = Math.round(changePct)
  const contributionOf = (factor: keyof Factors): number =>
    (Math.log(currentFactors[factor] / previousFactors[factor]) / totalLog) * changePct

  const priceContribution = contributionOf("pricePerToken")
  const mixEffect = modelMixEffect({
    previous: positionsOf(previous),
    current: positionsOf(current),
    previousBlendedPrice: previousFactors.pricePerToken,
  })
  const cacheEffect = cacheEfficiencyEffect ?? 0
  // The rate effect is the remainder rather than its own sum, so the three price
  // sub-effects always close on the price change however the cache one is defined.
  const rateEffect = currentFactors.pricePerToken - previousFactors.pricePerToken - mixEffect - cacheEffect
  const priceEffects =
    cacheEfficiencyEffect === undefined ? [mixEffect, rateEffect] : [mixEffect, cacheEffect, rateEffect]
  const priceParts = allocate({ contribution: priceContribution, effects: priceEffects })

  const values = (factor: keyof Factors): { previous: number; current: number } => ({
    previous: previousFactors[factor],
    current: currentFactors[factor],
  })
  const valuesByFactor = new Map<SessionCostFactor, { previous: number; current: number }>([
    ["turnsPerSession", values("turnsPerSession")],
    ["stepsPerTurn", values("stepsPerTurn")],
    ["tokensPerStep", values("tokensPerStep")],
  ])

  const raw: { readonly factor: SessionCostFactor; readonly value: number }[] = [
    { factor: "turnsPerSession", value: contributionOf("turnsPerSession") },
    { factor: "stepsPerTurn", value: contributionOf("stepsPerTurn") },
    { factor: "tokensPerStep", value: contributionOf("tokensPerStep") },
    { factor: "modelMix", value: priceParts[0] ?? 0 },
    ...(cacheEfficiencyEffect === undefined
      ? []
      : [{ factor: "cacheEfficiency" as SessionCostFactor, value: priceParts[1] ?? 0 }]),
    { factor: "pricePerToken", value: priceParts[priceParts.length - 1] ?? 0 },
  ]

  const rows = toWholePoints({ raw, totalPoints })
    .map(
      (entry): SessionCostContribution => ({
        factor: entry.factor,
        points: entry.points,
        values: valuesByFactor.get(entry.factor) ?? null,
      }),
    )
    .sort((a, b) => Math.abs(b.points) - Math.abs(a.points))

  return {
    status: "ok",
    previousCostPerSessionMicrocents: previousCost,
    currentCostPerSessionMicrocents: currentCost,
    changePct,
    totalPoints,
    rows,
    volume: { previousSessions: previous.sessions, currentSessions: current.sessions },
  }
}
