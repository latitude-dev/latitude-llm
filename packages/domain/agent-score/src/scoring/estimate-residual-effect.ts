/**
 * One session as the matched estimator sees it.
 *
 * `stratum` is the caller's match key — behaviour cluster, provider, model, size buckets, toolset,
 * streaming mode, whatever was available. Comparison only ever happens inside a stratum, so an
 * agent whose signal-bearing sessions are also its biggest sessions cannot have that difference
 * read as the signal's effect.
 *
 * `inclusionProbability` is the stored screening draw. Weighting by its inverse is what makes a
 * sampled positive stand for the sessions it was sampled from instead of for itself.
 */
export interface MatchedSession {
  readonly sessionId: string
  readonly stratum: string
  readonly outcome: number
  readonly inclusionProbability: number
  /** Signal groups present on this session. Membership is the treatment. */
  readonly exposedGroupIds: readonly string[]
  /** Deterministic 0 or 1, so the fit and the evaluation never share traffic. */
  readonly fold: 0 | 1
}

/** Support the estimator refuses to go below. Below these a difference is noise wearing a number. */
export interface ResidualSupportFloors {
  readonly minimumExposedSessions: number
  readonly minimumUnexposedSessions: number
  readonly minimumStrata: number
  /** Sessions per unit of shrinkage: the effect is scaled by n / (n + this). */
  readonly shrinkageConstant: number
}

export const DEFAULT_RESIDUAL_SUPPORT: ResidualSupportFloors = {
  minimumExposedSessions: 5,
  minimumUnexposedSessions: 5,
  minimumStrata: 1,
  shrinkageConstant: 20,
}

export const RESIDUAL_GAP_REASONS = ["noExposure", "noOverlap", "insufficientSupport"] as const
export type ResidualGapReason = (typeof RESIDUAL_GAP_REASONS)[number]

export type ResidualEffect =
  | {
      readonly measured: true
      /** Shrunken out-of-fold difference in the outcome's own unit. Never negative. */
      readonly effect: number
      readonly rawEffect: number
      readonly exposedSessions: number
      readonly unexposedSessions: number
      readonly usedStrata: number
      readonly droppedStrata: number
    }
  | { readonly measured: false; readonly reason: ResidualGapReason }

const weightOf = (session: MatchedSession): number =>
  session.inclusionProbability > 0 ? 1 / Math.min(1, session.inclusionProbability) : 0

const weightedMean = (sessions: readonly MatchedSession[]): number => {
  const weight = sessions.reduce((total, session) => total + weightOf(session), 0)
  if (weight <= 0) return 0
  return sessions.reduce((total, session) => total + weightOf(session) * session.outcome, 0) / weight
}

interface StratumEffect {
  readonly difference: number
  readonly exposedWeight: number
  readonly exposedCount: number
  readonly unexposedCount: number
}

const stratumEffects = ({
  sessions,
  groupId,
  floors,
}: {
  readonly sessions: readonly MatchedSession[]
  readonly groupId: string
  readonly floors: ResidualSupportFloors
}): { readonly used: StratumEffect[]; readonly dropped: number } => {
  const byStratum = new Map<string, MatchedSession[]>()
  for (const session of sessions) {
    byStratum.set(session.stratum, [...(byStratum.get(session.stratum) ?? []), session])
  }

  const used: StratumEffect[] = []
  let dropped = 0
  for (const stratum of byStratum.values()) {
    const exposed = stratum.filter((session) => session.exposedGroupIds.includes(groupId))
    const unexposed = stratum.filter((session) => !session.exposedGroupIds.includes(groupId))
    if (exposed.length === 0 || unexposed.length === 0) {
      dropped += 1
      continue
    }
    used.push({
      difference: weightedMean(exposed) - weightedMean(unexposed),
      exposedWeight: exposed.reduce((total, session) => total + weightOf(session), 0),
      exposedCount: exposed.length,
      unexposedCount: unexposed.length,
    })
  }
  return { used, dropped }
}

const combine = (effects: readonly StratumEffect[]): number => {
  const weight = effects.reduce((total, effect) => total + effect.exposedWeight, 0)
  if (weight <= 0) return 0
  return effects.reduce((total, effect) => total + effect.exposedWeight * effect.difference, 0) / weight
}

/**
 * The residual effect of one signal group on one outcome, matched, cross-fit and shrunken.
 *
 * The estimate is the exposure-weighted difference between signal-bearing and matched clean
 * sessions, computed once per fold on the sessions the other fold did not fit, then averaged. That
 * is what keeps a signal's promotion — which selected it *because* those sessions looked bad — from
 * being read back as its effect.
 *
 * A negative difference returns zero rather than a credit: a recurring defect cannot make an agent
 * cheaper or faster, so a negative reading is noise, and letting it offset a real deficit elsewhere
 * would be the "erase waste with luck" failure the score rules forbid.
 *
 * Weak comparisons are shrunk toward zero by `n / (n + shrinkageConstant)` instead of being
 * published raw, and comparisons with no overlap or too little support return not measured — which
 * the page renders as "effect not yet measured" rather than as a number.
 */
export const estimateResidualEffect = ({
  sessions,
  groupId,
  floors = DEFAULT_RESIDUAL_SUPPORT,
}: {
  readonly sessions: readonly MatchedSession[]
  readonly groupId: string
  readonly floors?: ResidualSupportFloors
}): ResidualEffect => {
  const exposed = sessions.filter((session) => session.exposedGroupIds.includes(groupId))
  const unexposed = sessions.filter((session) => !session.exposedGroupIds.includes(groupId))
  if (exposed.length === 0) return { measured: false, reason: "noExposure" }
  if (exposed.length < floors.minimumExposedSessions || unexposed.length < floors.minimumUnexposedSessions) {
    return { measured: false, reason: "insufficientSupport" }
  }

  const folds = [0, 1] as const
  const perFold = folds.map((fold) => {
    const evaluation = sessions.filter((session) => session.fold === fold)
    return stratumEffects({ sessions: evaluation, groupId, floors })
  })
  const usable = perFold.filter((fold) => fold.used.length >= floors.minimumStrata)
  const droppedStrata = perFold.reduce((total, fold) => total + fold.dropped, 0)
  if (usable.length === 0) return { measured: false, reason: "noOverlap" }

  const rawEffect = usable.reduce((total, fold) => total + combine(fold.used), 0) / usable.length
  const shrinkage = exposed.length / (exposed.length + floors.shrinkageConstant)

  return {
    measured: true,
    effect: Math.max(0, rawEffect) * shrinkage,
    rawEffect,
    exposedSessions: exposed.length,
    unexposedSessions: unexposed.length,
    usedStrata: usable.reduce((total, fold) => total + fold.used.length, 0),
    droppedStrata,
  }
}

/**
 * Scales a set of effects so their total stays inside a cap.
 *
 * The cap is the artifact's, and it is total rather than per-signal on purpose: twenty weak signals
 * must not add up to what no single one could claim. Scaling proportionally keeps their relative
 * sizes, which is what the cause list ranks on.
 */
export const capResidualEffects = <Key extends string>({
  effects,
  cap,
}: {
  readonly effects: ReadonlyMap<Key, number>
  readonly cap: number
}): Map<Key, number> => {
  const total = [...effects.values()].reduce((sum, effect) => sum + effect, 0)
  if (total <= cap || total <= 0) return new Map(effects)
  const scale = cap / total
  return new Map([...effects.entries()].map(([key, effect]) => [key, effect * scale]))
}
