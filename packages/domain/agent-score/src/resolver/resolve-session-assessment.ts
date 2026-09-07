import type { SessionAssessment } from "../entities/session-assessment.ts"
import type { NormalizedSessionAssessmentInput } from "../entities/session-assessment-input.ts"
import { buildSessionAssessmentCoverage } from "./build-assessment-coverage.ts"
import { buildSessionDimensionSummaries } from "./build-dimension-summaries.ts"
import { resolveSessionAssessmentItems } from "./resolve-assessment-findings.ts"

export const resolveSessionAssessment = (input: NormalizedSessionAssessmentInput): SessionAssessment => {
  const items = resolveSessionAssessmentItems(input.findings)
  const coverage = buildSessionAssessmentCoverage(input)
  return {
    sessionId: input.sessionId,
    items,
    dimensions: buildSessionDimensionSummaries({
      items,
      coverage: coverage.dimensions,
      observedMicrocents: input.observedMicrocents,
    }),
    coverage: coverage.coverage,
  }
}
