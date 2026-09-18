/**
 * Exact binomial confidence intervals for the score's endpoint dimensions.
 *
 * Outcome, Reliability, and Safety estimate a probability, and a window can
 * legitimately contain only successes or no failures at all. A normal
 * approximation collapses to a zero-width interval exactly there, which would
 * read as certainty about the one case the score is least certain about, so
 * these dimensions use Clopper-Pearson instead. It needs the inverse
 * regularized incomplete beta, which the repository has no dependency for and
 * which is short enough to carry directly.
 */

export interface BinomialInterval {
  readonly lower: number
  readonly upper: number
}

const LANCZOS_G = 7
const LANCZOS_COEFFICIENTS = [
  0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
  12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
] as const

const logGamma = (value: number): number => {
  if (value < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * value)) - logGamma(1 - value)

  const z = value - 1
  let series = LANCZOS_COEFFICIENTS[0]
  for (let index = 1; index < LANCZOS_COEFFICIENTS.length; index++) {
    series += LANCZOS_COEFFICIENTS[index]! / (z + index)
  }
  const t = z + LANCZOS_G + 0.5
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(series)
}

const CONTINUED_FRACTION_ITERATIONS = 200
const CONTINUED_FRACTION_EPSILON = 3e-16
const CONTINUED_FRACTION_FLOOR = 1e-300

/** Lentz's method for the incomplete beta continued fraction. */
const betaContinuedFraction = (a: number, b: number, x: number): number => {
  const qab = a + b
  const qap = a + 1
  const qam = a - 1
  let c = 1
  let d = 1 - (qab * x) / qap
  if (Math.abs(d) < CONTINUED_FRACTION_FLOOR) d = CONTINUED_FRACTION_FLOOR
  d = 1 / d
  let result = d

  for (let m = 1; m <= CONTINUED_FRACTION_ITERATIONS; m++) {
    const m2 = 2 * m
    const even = (m * (b - m) * x) / ((qam + m2) * (a + m2))
    d = 1 + even * d
    if (Math.abs(d) < CONTINUED_FRACTION_FLOOR) d = CONTINUED_FRACTION_FLOOR
    c = 1 + even / c
    if (Math.abs(c) < CONTINUED_FRACTION_FLOOR) c = CONTINUED_FRACTION_FLOOR
    d = 1 / d
    result *= d * c

    const odd = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2))
    d = 1 + odd * d
    if (Math.abs(d) < CONTINUED_FRACTION_FLOOR) d = CONTINUED_FRACTION_FLOOR
    c = 1 + odd / c
    if (Math.abs(c) < CONTINUED_FRACTION_FLOOR) c = CONTINUED_FRACTION_FLOOR
    d = 1 / d

    const step = d * c
    result *= step
    if (Math.abs(step - 1) < CONTINUED_FRACTION_EPSILON) break
  }

  return result
}

/** The regularized incomplete beta function, which is the binomial CDF in beta form. */
export const regularizedIncompleteBeta = (x: number, a: number, b: number): number => {
  if (x <= 0) return 0
  if (x >= 1) return 1

  const front = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log1p(-x))
  // The fraction converges quickly only on one side of this point; the identity
  // I(x; a, b) = 1 - I(1 - x; b, a) moves the other side onto the fast branch.
  return x < (a + 1) / (a + b + 2)
    ? (front * betaContinuedFraction(a, b, x)) / a
    : 1 - (front * betaContinuedFraction(b, a, 1 - x)) / b
}

const BISECTION_ITERATIONS = 100

/**
 * Inverted by bisection rather than Newton's method: the function is monotone
 * on [0, 1], so bisection cannot diverge, and one interval per window makes its
 * extra iterations free.
 */
export const inverseRegularizedIncompleteBeta = (probability: number, a: number, b: number): number => {
  if (probability <= 0) return 0
  if (probability >= 1) return 1

  let low = 0
  let high = 1
  for (let iteration = 0; iteration < BISECTION_ITERATIONS; iteration++) {
    const middle = (low + high) / 2
    if (regularizedIncompleteBeta(middle, a, b) < probability) low = middle
    else high = middle
  }
  return (low + high) / 2
}

export const DEFAULT_CONFIDENCE_LEVEL = 0.95

/**
 * The exact interval for `successes` out of `trials`.
 *
 * Stays non-degenerate at both boundaries: zero successes still has an upper
 * bound above zero, and an all-success window still has a lower bound below
 * one. No trials is not an estimate at all, so it returns the whole range.
 */
export const clopperPearsonInterval = (input: {
  readonly successes: number
  readonly trials: number
  readonly confidenceLevel?: number
}): BinomialInterval => {
  const { successes, trials } = input
  if (trials <= 0) return { lower: 0, upper: 1 }

  const alpha = 1 - (input.confidenceLevel ?? DEFAULT_CONFIDENCE_LEVEL)
  const lower = successes <= 0 ? 0 : inverseRegularizedIncompleteBeta(alpha / 2, successes, trials - successes + 1)
  const upper =
    successes >= trials ? 1 : inverseRegularizedIncompleteBeta(1 - alpha / 2, successes + 1, trials - successes)

  return { lower, upper }
}
