import type { SessionAssessment } from "../entities/session-assessment.ts"
import { SESSION_ASSESSMENT_PAGE_SIZE } from "../entities/session-assessment.ts"
import type { NormalizedSessionAssessmentInput } from "../entities/session-assessment-input.ts"
import {
  chronologyFromSessionAssessmentCursor,
  encodeSessionAssessmentCursor,
  type SessionAssessmentPageCursor,
} from "../pagination/session-assessment-cursor.ts"
import { buildSessionAssessmentCoverage } from "./build-assessment-coverage.ts"
import { buildSessionDimensionSummaries } from "./build-dimension-summaries.ts"
import {
  compareResolvedAssessmentItems,
  resolveSessionAssessmentItems,
  resolveSessionAssessmentItemsWithChronology,
} from "./resolve-assessment-findings.ts"

/**
 * Speed's observed denominator is the reconstructed critical path, not the session's active
 * execution time. An incomplete reconstruction reports nothing rather than substituting a duration
 * that would read as necessary time.
 */
const summaryInputs = (input: NormalizedSessionAssessmentInput) => {
  const evidence = input.costEvidence
  return {
    observedMicrocents: input.observedMicrocents,
    ...(evidence
      ? {
          ...(evidence.criticalPathComplete ? { observedCriticalPathNs: evidence.observedCriticalPathNs } : {}),
          costReadings: evidence.readings,
          avoidable: {
            measuredMicrocents: evidence.measuredAvoidableMicrocents,
            estimatedMicrocents: evidence.estimatedAvoidableMicrocents,
            measuredNs: evidence.measuredAvoidableNs,
            estimatedNs: evidence.estimatedAvoidableNs,
          },
        }
      : { observedCriticalPathNs: input.observedDurationNs }),
  }
}

export const resolveSessionAssessment = (input: NormalizedSessionAssessmentInput): SessionAssessment => {
  const items = resolveSessionAssessmentItems(input.findings)
  const coverage = buildSessionAssessmentCoverage(input)
  return {
    sessionId: input.sessionId,
    items,
    dimensions: buildSessionDimensionSummaries({
      items,
      coverage: coverage.dimensions,
      ...summaryInputs(input),
    }),
    coverage: coverage.coverage,
  }
}

export const resolveSessionAssessmentPage = (
  input: NormalizedSessionAssessmentInput,
  options: { readonly cutoff: Date; readonly cursor?: SessionAssessmentPageCursor },
): SessionAssessment => {
  const resolved = resolveSessionAssessmentItemsWithChronology(input.findings)
  const allItems = resolved.map(({ item }) => item)
  const coverage = buildSessionAssessmentCoverage(input)
  const cursor = options.cursor
  const cursorItem = cursor
    ? {
        item: {
          id: cursor.itemId,
          evidenceKey: cursor.evidenceKey,
        },
        chronology: chronologyFromSessionAssessmentCursor(cursor),
      }
    : undefined
  const remaining = cursorItem
    ? resolved.filter((item) => compareResolvedAssessmentItems(item, cursorItem) > 0)
    : resolved
  const page = remaining.slice(0, SESSION_ASSESSMENT_PAGE_SIZE)
  const lastItem = page.at(-1)

  return {
    sessionId: input.sessionId,
    items: page.map(({ item }) => item),
    ...(remaining.length > page.length && lastItem
      ? { nextCursor: encodeSessionAssessmentCursor({ cutoff: options.cutoff, lastItem }) }
      : {}),
    dimensions: buildSessionDimensionSummaries({
      items: allItems,
      coverage: coverage.dimensions,
      ...summaryInputs(input),
    }),
    coverage: coverage.coverage,
  }
}
