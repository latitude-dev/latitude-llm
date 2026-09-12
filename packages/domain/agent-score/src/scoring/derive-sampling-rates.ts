/**
 * Sampling rates the daily sweep derives from a project's traffic.
 *
 * A fixed rate cannot satisfy a fixed examined-count floor across projects of different sizes: at a
 * tenth, a project sitting on the window's session target examines a hundred sessions against a
 * floor of a thousand, and no amount of waiting fixes that. So the judge and the suite target a
 * number of examined sessions instead of a share of them. A small project examines nearly
 * everything and a large one examines a bounded sample, which bounds cost at both ends.
 *
 * Lowering the floors instead was rejected: at a hundred examined sessions the zero-harm lower bound
 * is 5, an interval spanning almost the whole scale, and a dimension that wide would dominate the
 * composite's interval while telling nobody anything.
 */
export interface SamplingTargets {
  /** Examined sessions each reader aims for over one window. */
  readonly outcomeExaminedTarget: number
  readonly safetyExaminedTarget: number
  /** Floor on the derived rate, so a very large project still examines something. */
  readonly minimumSamplingPercent: number
}

export const PROVISIONAL_SAMPLING_TARGETS: SamplingTargets = {
  outcomeExaminedTarget: 200,
  safetyExaminedTarget: 1_200,
  minimumSamplingPercent: 1,
}

export interface DerivedSamplingRates {
  /** Whole percent, as the flagger row stores it. */
  readonly taskOutcomePercent: number
  readonly safetySuitePercent: number
}

const rateFor = ({
  target,
  eligibleSessions,
  minimumPercent,
}: {
  readonly target: number
  readonly eligibleSessions: number
  readonly minimumPercent: number
}): number => {
  if (eligibleSessions <= 0) return 100
  const percent = Math.ceil((target / eligibleSessions) * 100)
  return Math.max(minimumPercent, Math.min(100, percent))
}

/**
 * The rates this project should run at, given what its window actually contains.
 *
 * Rounded up, because a rate that lands just under the target examines just under the floor and
 * publishes nothing. Both targets are deliberately above their floors: sessions are lost to
 * rate limits, incomplete suites and unreadable transcripts between selection and a usable verdict,
 * and a rate aimed exactly at the floor would miss it every time one of those happens.
 */
export const deriveSamplingRates = ({
  eligibleSessions,
  targets = PROVISIONAL_SAMPLING_TARGETS,
}: {
  readonly eligibleSessions: number
  readonly targets?: SamplingTargets
}): DerivedSamplingRates => ({
  taskOutcomePercent: rateFor({
    target: targets.outcomeExaminedTarget,
    eligibleSessions,
    minimumPercent: targets.minimumSamplingPercent,
  }),
  safetySuitePercent: rateFor({
    target: targets.safetyExaminedTarget,
    eligibleSessions,
    minimumPercent: targets.minimumSamplingPercent,
  }),
})
