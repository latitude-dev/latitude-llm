import type { AssessmentReaderFact, NormalizedSessionAssessmentInput } from "../entities/session-assessment-input.ts"

export type ReaderLimitation = NonNullable<AssessmentReaderFact["limitation"]>

/** One reader's examined share across the window, and why it fell short where it did. */
export interface WindowReaderCoverage {
  readonly readerId: string
  readonly label: string
  readonly scoreDimensions: readonly AssessmentReaderFact["scoreDimensions"][number][]
  readonly applicableSessions: number
  readonly fullyReadSessions: number
  readonly readableUnits: number
  readonly applicableUnits: number
  /** Readable share of applicable units; 1 when the reader applied to nothing. */
  readonly coverage: number
  readonly limitations: Readonly<Partial<Record<ReaderLimitation, number>>>
}

interface Accumulator {
  label: string
  scoreDimensions: AssessmentReaderFact["scoreDimensions"]
  applicableSessions: number
  fullyReadSessions: number
  readableUnits: number
  applicableUnits: number
  limitations: Partial<Record<ReaderLimitation, number>>
}

/**
 * Per-reader coverage for the window, pooled rather than averaged.
 *
 * This is where an unmapped finish reason, an unrecognised provider error or an unbuilt frozen
 * reference becomes visible as a number instead of an absence. A dimension's interval cannot say
 * that a tenth of its sessions were never readable; only a denominator can, and the page needs it to
 * explain a withheld score rather than just reporting that one happened.
 */
export const tallyWindowReaderCoverage = (
  sessions: readonly NormalizedSessionAssessmentInput[],
  into: ReadonlyMap<string, WindowReaderCoverage> = new Map(),
): ReadonlyMap<string, WindowReaderCoverage> => {
  const accumulators = new Map<string, Accumulator>(
    [...into.entries()].map(([readerId, coverage]) => [
      readerId,
      {
        label: coverage.label,
        scoreDimensions: coverage.scoreDimensions,
        applicableSessions: coverage.applicableSessions,
        fullyReadSessions: coverage.fullyReadSessions,
        readableUnits: coverage.readableUnits,
        applicableUnits: coverage.applicableUnits,
        limitations: { ...coverage.limitations },
      },
    ]),
  )

  for (const session of sessions) {
    for (const reader of session.readers) {
      const accumulator = accumulators.get(reader.readerId) ?? {
        label: reader.label,
        scoreDimensions: reader.scoreDimensions,
        applicableSessions: 0,
        fullyReadSessions: 0,
        readableUnits: 0,
        applicableUnits: 0,
        limitations: {},
      }
      if (reader.applicable) {
        accumulator.applicableSessions += 1
        accumulator.applicableUnits += reader.totalCount
        accumulator.readableUnits += reader.readableCount
        if (reader.readableCount >= reader.totalCount) accumulator.fullyReadSessions += 1
      }
      if (reader.limitation) {
        accumulator.limitations[reader.limitation] = (accumulator.limitations[reader.limitation] ?? 0) + 1
      }
      accumulators.set(reader.readerId, accumulator)
    }
  }

  return new Map(
    [...accumulators.entries()].map(([readerId, accumulator]) => [
      readerId,
      {
        readerId,
        label: accumulator.label,
        scoreDimensions: [...accumulator.scoreDimensions],
        applicableSessions: accumulator.applicableSessions,
        fullyReadSessions: accumulator.fullyReadSessions,
        readableUnits: accumulator.readableUnits,
        applicableUnits: accumulator.applicableUnits,
        coverage: accumulator.applicableUnits === 0 ? 1 : accumulator.readableUnits / accumulator.applicableUnits,
        limitations: accumulator.limitations,
      },
    ]),
  )
}
