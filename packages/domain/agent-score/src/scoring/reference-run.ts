import type { BinomialInterval } from "./binomial-interval.ts"

/**
 * The chance a reference run contains none of an adverse event.
 *
 * Reliability and Safety both express cumulative risk this way and differ only in their horizon and
 * in what the adverse event is: a session that could not complete, or one the agent harmed somebody
 * in. Keeping the transform in one place is what stops the two drifting, in the same way
 * `estimateStratifiedRate` already holds the selection correction they share.
 */
export const survivalOverReferenceRun = ({
  adverseRate,
  referenceRunSessions,
}: {
  readonly adverseRate: number
  readonly referenceRunSessions: number
}): number => 100 * (1 - Math.min(1, Math.max(0, adverseRate))) ** referenceRunSessions

/**
 * The same transform applied to an interval on the adverse rate.
 *
 * It is monotone decreasing, so the bounds swap: the upper bound on how often the bad thing happens
 * produces the lower bound on the score. Doing this by hand at each call site is exactly the kind of
 * inversion that is wrong once and then wrong forever.
 */
export const survivalInterval = ({
  interval,
  referenceRunSessions,
}: {
  readonly interval: BinomialInterval
  readonly referenceRunSessions: number
}): BinomialInterval => ({
  lower: survivalOverReferenceRun({ adverseRate: interval.upper, referenceRunSessions }),
  upper: survivalOverReferenceRun({ adverseRate: interval.lower, referenceRunSessions }),
})
