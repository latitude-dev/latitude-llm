/**
 * Why average cost per session moved, as a multiplier per factor.
 *
 * Cost per session is a product — `traces/session x calls/trace x tokens/call x
 * cost/token` — so each factor's own before/after ratio is a multiplier, and the
 * multipliers multiply to the headline ratio exactly. No shared synthetic unit:
 * every figure stays in the unit the factor is measured in.
 *
 * The price factor is split four ways because a blended per-token price moves for
 * reasons that are not price changes. Routing tokens to a dearer model, or simply
 * sending more prompt and the same output, both move it — so `modelMix` and
 * `tokenMix` absorb those and the two rate factors carry what actually repriced.
 *
 * Nothing here reads a repository or the pricing registry: every input is a
 * number, so the whole thing is exhaustively testable and safe for the browser
 * entry. It is also the shape the API/MCP surface will expose, so it must stay
 * independent of how the rows are rendered.
 */

/**
 * `tracesPerSession`, `callsPerTrace` and `tokensPerCall` are volume — how much
 * work a session does. The last four are the price factor, split so each points
 * at a different fix: which model got the tokens, how the tokens divided between
 * the cheap prompt side and the dear output side, and the two per-side rates.
 */
const SESSION_COST_FACTORS = [
  "tracesPerSession",
  "callsPerTrace",
  "tokensPerCall",
  "modelMix",
  "tokenMix",
  "promptRate",
  "outputRate",
] as const
export type SessionCostFactor = (typeof SESSION_COST_FACTORS)[number]

/** Prompt covers cache reads and writes; they are charged on the input side. */
export const TOKEN_SIDES = ["prompt", "output"] as const
export type TokenSide = (typeof TOKEN_SIDES)[number]

/**
 * Sessions a period needs before its cost per session may be compared to another
 * period's. Below this one expensive session moves the average by a multiple, so
 * the decomposition would be arithmetic over noise — the same trap the breakdown
 * table's `278x avg` chip fell into.
 */
export const SESSION_COST_MIN_SESSIONS = 20

/**
 * A factor whose multiplier is this close to 1 did not move. Matches the display
 * precision, so a row is folded away exactly when it would have read `x1.0`.
 */
export const SESSION_COST_QUIET_BAND = 0.05

/** Below this the cost is flat and the weights would divide by ~0, so nothing moved. */
const FLAT_LOG_EPSILON = 1e-6

// Sub-effects this close to cancelling each other out leave the factor they split
// with no change to divide by, whatever their individual sizes.
const NEGLIGIBLE_EFFECT_SHARE = 1e-9

/** Displayed multipliers carry two decimals, and must still multiply to the total. */
const DISPLAY_DECIMALS = 2

/**
 * One (price list x token side) bucket. Splitting by provider as well as model
 * because the same model slug served by two providers is two price lists, and
 * splitting by side because prompt and output are priced an order apart.
 */
export interface SessionCostCell {
  readonly provider: string
  readonly model: string
  readonly side: TokenSide
  readonly tokens: number
  readonly costMicrocents: number
}

/**
 * One period's raw counts. `sessions` counts the session key the rollups use —
 * `session_id` where present, the trace id otherwise — so traffic that reported
 * no session id is a single-trace pseudo-session rather than being dropped.
 * `traceKeyedSessions` is how many of them are that, which is what lets the
 * caller say so instead of quietly renaming cost per trace.
 *
 * Tokens and cost are derived from `cells` rather than carried alongside them, so
 * the price factor's four sub-effects always close on the price change.
 */
export interface SessionCostPeriod {
  readonly sessions: number
  readonly traceKeyedSessions: number
  /** Traces with a billable call. One request to an agent, not one conversational turn. */
  readonly traces: number
  /** Billable LLM calls: what a single trace spent to answer. */
  readonly calls: number
  /** Calls whose model has no known pricing, so this period's cost is understated. */
  readonly unpricedCalls: number
  readonly cells: readonly SessionCostCell[]
}

export const sessionCostTokens = (period: SessionCostPeriod): number =>
  period.cells.reduce((sum, cell) => sum + cell.tokens, 0)

export const sessionCostMicrocents = (period: SessionCostPeriod): number =>
  period.cells.reduce((sum, cell) => sum + cell.costMicrocents, 0)

/** The share move behind a mix row, so an abstract factor still names something concrete. */
export interface SessionCostShareShift {
  readonly label: string
  readonly previousShare: number
  readonly currentShare: number
}

export interface SessionCostContribution {
  /** Null on the folded row, which stands for several factors and so names none. */
  readonly factor: SessionCostFactor | null
  /** Multiplier on cost per session. Every row's multiplier multiplies to `totalMultiplier`. */
  readonly multiplier: number
  /** Before and after in the factor's own unit. Null for the price sub-factors, which are not ratios. */
  readonly values: { readonly previous: number; readonly current: number } | null
  /** What moved, for a mix row that has no before/after value of its own. */
  readonly shareShift: SessionCostShareShift | null
  /** How many quiet factors this row stands in for; 0 on a real factor. */
  readonly foldedFactors: number
}

/**
 * `notEnoughData` means no comparison is possible and only the headline should
 * render; `flat` means the comparison held still, which is a real answer and not
 * an error. Both leave `rows` empty rather than shipping ones that look measured.
 */
export type SessionCostDecompositionStatus = "ok" | "flat" | "notEnoughData"

export interface CostPerSessionDecomposition {
  readonly status: SessionCostDecompositionStatus
  readonly previousCostPerSessionMicrocents: number
  readonly currentCostPerSessionMicrocents: number
  /** Null when the periods cannot be compared. */
  readonly changePct: number | null
  /** `current / previous`, exact. The headline change is this figure. */
  readonly totalMultiplier: number | null
  /**
   * What the rows' displayed multipliers multiply to, which is the total to print
   * beneath them. A rounding step from `totalMultiplier` and never further.
   */
  readonly rowsMultiplyTo: number | null
  /** Largest move first. Quiet factors are folded into one trailing row. */
  readonly rows: readonly SessionCostContribution[]
  /**
   * Session-count change, deliberately not a row: sessions are the denominator,
   * so growth in them does not move cost per session at all. Its own block in the
   * UI, because "we are simply busier" is the one cost story that is good news.
   */
  readonly volume: { readonly previousSessions: number; readonly currentSessions: number }
}

export interface DecomposeCostPerSessionInput {
  readonly previous: SessionCostPeriod
  readonly current: SessionCostPeriod
}

const costPerSession = (period: SessionCostPeriod): number =>
  period.sessions > 0 ? sessionCostMicrocents(period) / period.sessions : 0

interface Factors {
  readonly tracesPerSession: number
  readonly callsPerTrace: number
  readonly tokensPerCall: number
  readonly costPerToken: number
}

type VolumeFactor = Exclude<keyof Factors, "costPerToken">

const VOLUME_FACTORS: readonly VolumeFactor[] = ["tracesPerSession", "callsPerTrace", "tokensPerCall"]

/** Null when any denominator is empty, which is what makes the whole product unusable. */
function factorsOf(period: SessionCostPeriod): Factors | null {
  const tokens = sessionCostTokens(period)
  const cost = sessionCostMicrocents(period)
  if (period.sessions <= 0 || period.traces <= 0 || period.calls <= 0 || tokens <= 0 || cost <= 0) return null
  return {
    tracesPerSession: period.traces / period.sessions,
    callsPerTrace: period.calls / period.traces,
    tokensPerCall: tokens / period.calls,
    costPerToken: cost / tokens,
  }
}

const modelKey = (cell: { provider: string; model: string }): string => `${cell.provider}/${cell.model}`
const cellKey = (cell: SessionCostCell): string => `${modelKey(cell)}/${cell.side}`

interface CellPosition {
  readonly share: number
  readonly price: number
}

interface ModelPosition {
  readonly share: number
  readonly averagePrice: number
  /** Token share within this model, by side, summing to 1. */
  readonly sideShares: Map<TokenSide, number>
}

interface Positions {
  readonly cells: Map<string, CellPosition>
  readonly models: Map<string, ModelPosition>
}

function positionsOf(period: SessionCostPeriod): Positions {
  const tokens = sessionCostTokens(period)
  const cells = new Map<string, CellPosition>()
  const modelTokens = new Map<string, number>()
  const modelCost = new Map<string, number>()
  const modelSideTokens = new Map<string, Map<TokenSide, number>>()

  for (const cell of period.cells) {
    if (cell.tokens <= 0) continue
    cells.set(cellKey(cell), { share: cell.tokens / tokens, price: cell.costMicrocents / cell.tokens })
    const key = modelKey(cell)
    modelTokens.set(key, (modelTokens.get(key) ?? 0) + cell.tokens)
    modelCost.set(key, (modelCost.get(key) ?? 0) + cell.costMicrocents)
    const sides = modelSideTokens.get(key) ?? new Map<TokenSide, number>()
    sides.set(cell.side, (sides.get(cell.side) ?? 0) + cell.tokens)
    modelSideTokens.set(key, sides)
  }

  const models = new Map<string, ModelPosition>()
  for (const [key, ownTokens] of modelTokens) {
    const sides = new Map<TokenSide, number>()
    for (const [side, sideTokens] of modelSideTokens.get(key) ?? []) sides.set(side, sideTokens / ownTokens)
    models.set(key, {
      share: ownTokens / tokens,
      averagePrice: (modelCost.get(key) ?? 0) / ownTokens,
      sideShares: sides,
    })
  }

  return { cells, models }
}

interface PriceEffects {
  readonly modelMix: number
  readonly tokenMix: number
  readonly promptRate: number
  readonly outputRate: number
}

/**
 * Splits the change in blended price per token four ways, exactly.
 *
 * Two levels of mix, then the rates. A model's share moving is valued at that
 * model's old average price, so rerouting to an identically-priced model is
 * mix-neutral; the sides moving within a model are valued at that model's own old
 * per-side prices, so growing the prompt while output holds shows up here rather
 * than as a rate cut. What is left is the two sides' prices actually changing.
 *
 * A price list with no previous tokens is baselined at the previous blended price,
 * and its side split at its current one, so a brand-new model contributes to mix
 * and not to either rate.
 */
function priceEffects({
  previous,
  current,
  previousBlendedPrice,
}: {
  readonly previous: Positions
  readonly current: Positions
  readonly previousBlendedPrice: number
}): PriceEffects {
  let modelMix = 0
  let tokenMix = 0
  const rates = new Map<TokenSide, number>(TOKEN_SIDES.map((side) => [side, 0]))

  for (const key of new Set([...previous.models.keys(), ...current.models.keys()])) {
    const previousModel = previous.models.get(key)
    const currentModel = current.models.get(key)
    const previousAverage = previousModel?.averagePrice ?? previousBlendedPrice
    modelMix += ((currentModel?.share ?? 0) - (previousModel?.share ?? 0)) * previousAverage

    if (!currentModel) continue
    for (const side of TOKEN_SIDES) {
      const currentSideShare = currentModel.sideShares.get(side) ?? 0
      const previousSideShare = previousModel ? (previousModel.sideShares.get(side) ?? 0) : currentSideShare
      const previousPrice = previous.cells.get(`${key}/${side}`)?.price ?? previousAverage
      tokenMix += currentModel.share * (currentSideShare - previousSideShare) * previousPrice

      const currentPrice = current.cells.get(`${key}/${side}`)?.price
      if (currentPrice === undefined) continue
      const cellShare = currentModel.share * currentSideShare
      rates.set(side, (rates.get(side) ?? 0) + cellShare * (currentPrice - previousPrice))
    }
  }

  return {
    modelMix,
    tokenMix,
    promptRate: rates.get("prompt") ?? 0,
    outputRate: rates.get("output") ?? 0,
  }
}

/**
 * Splits one factor's log contribution across sub-effects that sum to the factor's
 * own change, so the parts still multiply to the whole. When the change is
 * negligible next to the sub-effects — a mix shift cancelled by a rate move — the
 * factor contributed nothing, and an even split keeps every part at that same
 * nothing instead of dividing by it.
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

const round = (value: number): number => {
  const factor = 10 ** DISPLAY_DECIMALS
  return Math.round(value * factor) / factor
}

/**
 * Rounds every multiplier to display precision and nudges the largest row toward
 * the true total, so the rows a reader multiplies land on the figure printed under
 * them. A decomposition whose rows do not reconcile reads as decoration.
 *
 * The product of the rounded rows is what that figure has to be: absorbing the
 * whole residual into one row cannot close the gap, because that row's own
 * rounding error is then multiplied by everything else on the card. So the
 * displayed total follows the rows rather than the rows chasing the total — which
 * leaves it a rounding step away from `totalMultiplier`, and the headline change
 * beside it carries the exact figure.
 */
function reconcile({
  rows,
  totalMultiplier,
}: {
  readonly rows: readonly SessionCostContribution[]
  readonly totalMultiplier: number
}): { readonly rows: readonly SessionCostContribution[]; readonly rowsMultiplyTo: number } {
  if (rows.length === 0) return { rows, rowsMultiplyTo: round(totalMultiplier) }
  const rounded = rows.map((row) => ({ ...row, multiplier: round(row.multiplier) }))

  let largest = 0
  for (let index = 1; index < rounded.length; index++) {
    const candidate = rounded[index]
    const incumbent = rounded[largest]
    if (candidate && incumbent && Math.abs(Math.log(candidate.multiplier)) > Math.abs(Math.log(incumbent.multiplier))) {
      largest = index
    }
  }

  const others = rounded.reduce((product, row, index) => (index === largest ? product : product * row.multiplier), 1)
  const settled =
    others === 0
      ? rounded
      : rounded.map((row, index) =>
          index === largest ? { ...row, multiplier: round(round(totalMultiplier) / others) } : row,
        )

  return { rows: settled, rowsMultiplyTo: round(settled.reduce((product, row) => product * row.multiplier, 1)) }
}

/** The model whose token share moved most, so the mix row names a cause. */
function dominantShareShift({
  previous,
  current,
}: {
  readonly previous: Positions
  readonly current: Positions
}): SessionCostShareShift | null {
  let shift: SessionCostShareShift | null = null
  let widest = 0
  for (const key of new Set([...previous.models.keys(), ...current.models.keys()])) {
    const previousShare = previous.models.get(key)?.share ?? 0
    const currentShare = current.models.get(key)?.share ?? 0
    const move = Math.abs(currentShare - previousShare)
    // A swap moves both models equally; the one that gained share names the cause.
    const incumbentLost = shift !== null && shift.currentShare < shift.previousShare
    if (move < widest || (move === widest && !(currentShare > previousShare && incumbentLost))) continue
    widest = move
    shift = { label: key, previousShare, currentShare }
  }
  return shift
}

/** Prompt is the readable half of the split: the cheap side's share of the tokens. */
function promptShareShift({
  previous,
  current,
}: {
  readonly previous: SessionCostPeriod
  readonly current: SessionCostPeriod
}): SessionCostShareShift {
  const shareOf = (period: SessionCostPeriod): number => {
    const tokens = sessionCostTokens(period)
    if (tokens <= 0) return 0
    return period.cells.reduce((sum, cell) => (cell.side === "prompt" ? sum + cell.tokens : sum), 0) / tokens
  }
  return { label: "prompt tokens", previousShare: shareOf(previous), currentShare: shareOf(current) }
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
  totalMultiplier: changePct === null ? null : changePct / 100 + 1,
  rowsMultiplyTo: null,
  rows: [],
  volume: { previousSessions: input.previous.sessions, currentSessions: input.current.sessions },
})

/**
 * Folds the factors that did not move into one trailing row carrying their
 * combined multiplier, so the visible rows still multiply to the headline while
 * the card shows only what changed.
 */
function foldQuietFactors(rows: readonly SessionCostContribution[]): readonly SessionCostContribution[] {
  const moved = rows.filter((row) => Math.abs(row.multiplier - 1) >= SESSION_COST_QUIET_BAND)
  const quiet = rows.filter((row) => Math.abs(row.multiplier - 1) < SESSION_COST_QUIET_BAND)
  if (quiet.length === 0) return moved
  const combined = quiet.reduce((product, row) => product * row.multiplier, 1)
  return [...moved, { factor: null, multiplier: combined, values: null, shareShift: null, foldedFactors: quiet.length }]
}

export function decomposeCostPerSession(input: DecomposeCostPerSessionInput): CostPerSessionDecomposition {
  const { previous, current } = input
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

  const totalMultiplier = currentCost / previousCost
  const changePct = (totalMultiplier - 1) * 100
  const totalLog = Math.log(totalMultiplier)
  if (Math.abs(totalLog) < FLAT_LOG_EPSILON) return emptyResult({ status: "flat", input, changePct })

  const previousPositions = positionsOf(previous)
  const currentPositions = positionsOf(current)
  const effects = priceEffects({
    previous: previousPositions,
    current: currentPositions,
    previousBlendedPrice: previousFactors.costPerToken,
  })
  const priceLog = Math.log(currentFactors.costPerToken / previousFactors.costPerToken)
  const [modelMixLog = 0, tokenMixLog = 0, promptRateLog = 0, outputRateLog = 0] = allocate({
    contribution: priceLog,
    effects: [effects.modelMix, effects.tokenMix, effects.promptRate, effects.outputRate],
  })

  const volumeRows = VOLUME_FACTORS.map(
    (factor): SessionCostContribution => ({
      factor,
      multiplier: currentFactors[factor] / previousFactors[factor],
      values: { previous: previousFactors[factor], current: currentFactors[factor] },
      shareShift: null,
      foldedFactors: 0,
    }),
  )
  const priceRows: readonly SessionCostContribution[] = [
    {
      factor: "modelMix",
      multiplier: Math.exp(modelMixLog),
      values: null,
      shareShift: dominantShareShift({ previous: previousPositions, current: currentPositions }),
      foldedFactors: 0,
    },
    {
      factor: "tokenMix",
      multiplier: Math.exp(tokenMixLog),
      values: null,
      shareShift: promptShareShift({ previous, current }),
      foldedFactors: 0,
    },
    { factor: "promptRate", multiplier: Math.exp(promptRateLog), values: null, shareShift: null, foldedFactors: 0 },
    { factor: "outputRate", multiplier: Math.exp(outputRateLog), values: null, shareShift: null, foldedFactors: 0 },
  ]

  const ordered = [...volumeRows, ...priceRows].sort(
    (a, b) => Math.abs(Math.log(b.multiplier)) - Math.abs(Math.log(a.multiplier)),
  )

  return {
    status: "ok",
    previousCostPerSessionMicrocents: previousCost,
    currentCostPerSessionMicrocents: currentCost,
    changePct,
    totalMultiplier,
    ...reconcile({ rows: foldQuietFactors(ordered), totalMultiplier }),
    volume: { previousSessions: previous.sessions, currentSessions: current.sessions },
  }
}
