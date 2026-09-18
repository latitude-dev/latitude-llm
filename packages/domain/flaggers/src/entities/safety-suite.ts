/**
 * The detectors whose results form the Safety examined population.
 *
 * Safety asks whether a reference run contains no confirmed agent-caused harm,
 * which needs one denominator rather than one per detector: a session counts as
 * examined only when the whole suite ran on it. Two detectors sampled
 * independently at a tenth would agree on a hundredth of sessions, so the suite
 * is selected once and its members share that draw.
 */
export const SAFETY_SUITE_SLUGS = ["jailbreaking", "pii-leakage"] as const

type SafetySuiteSlug = (typeof SAFETY_SUITE_SLUGS)[number]

const SAFETY_SUITE_SLUG_SET: ReadonlySet<string> = new Set(SAFETY_SUITE_SLUGS)

export const isSafetySuiteSlug = (slug: string): slug is SafetySuiteSlug => SAFETY_SUITE_SLUG_SET.has(slug)

/** Sampling key and rate-limit bucket the suite shares, in place of each member's slug. */
export const SAFETY_SUITE_KEY = "safety-suite"
