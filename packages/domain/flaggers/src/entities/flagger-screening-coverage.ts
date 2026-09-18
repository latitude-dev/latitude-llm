import { z } from "zod"
import type { FlaggerScreeningDecision } from "./flagger-screening-decision.ts"

export const FLAGGER_SCREENING_COVERAGE_LIMITATIONS = [
  "skipped",
  "notSelected",
  "rateLimited",
  "executionFailed",
  "pending",
  "missingTelemetry",
] as const

export const flaggerScreeningCoverageLimitationSchema = z.enum(FLAGGER_SCREENING_COVERAGE_LIMITATIONS)
export type FlaggerScreeningCoverageLimitation = z.infer<typeof flaggerScreeningCoverageLimitationSchema>

export const flaggerScreeningSelectionEvidenceSchema = z.object({
  method: z.enum(["deterministic", "hinted", "uniform-sample", "ordinary-sample"]),
  inclusionProbability: z.number().min(0).max(1),
})
export type FlaggerScreeningSelectionEvidence = z.infer<typeof flaggerScreeningSelectionEvidenceSchema>

export const flaggerScreeningCoverageSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("examined"),
    selection: flaggerScreeningSelectionEvidenceSchema,
  }),
  z.object({
    status: z.literal("notExamined"),
    limitation: flaggerScreeningCoverageLimitationSchema,
    selection: flaggerScreeningSelectionEvidenceSchema.optional(),
  }),
])
export type FlaggerScreeningCoverage = z.infer<typeof flaggerScreeningCoverageSchema>

const selectionEvidence = (decision: FlaggerScreeningDecision): FlaggerScreeningSelectionEvidence | undefined => {
  if (decision.inclusionProbability === undefined) return undefined
  if (decision.reason === "skipped") return undefined
  if (decision.reason === "rate-limited") {
    return {
      method: decision.hintKinds.length > 0 ? "hinted" : "ordinary-sample",
      inclusionProbability: decision.inclusionProbability,
    }
  }
  return {
    method: decision.reason,
    inclusionProbability: decision.inclusionProbability,
  }
}

const isExecutionFailure = (decision: FlaggerScreeningDecision): boolean =>
  decision.outcome === "error" || decision.outcome === "indeterminate"

export const resolveFlaggerScreeningCoverage = (
  decision: FlaggerScreeningDecision | null,
): FlaggerScreeningCoverage => {
  if (decision === null) return { status: "notExamined", limitation: "missingTelemetry" }

  const selection = selectionEvidence(decision)
  if (decision.reason === "skipped") return { status: "notExamined", limitation: "skipped" }
  if (decision.reason === "rate-limited") {
    return {
      status: "notExamined",
      limitation: "rateLimited",
      ...(selection ? { selection } : {}),
    }
  }
  if (!decision.selected) {
    return {
      status: "notExamined",
      limitation: "notSelected",
      ...(selection ? { selection } : {}),
    }
  }
  if (isExecutionFailure(decision)) {
    return {
      status: "notExamined",
      limitation: "executionFailed",
      ...(selection ? { selection } : {}),
    }
  }
  if (decision.outcome === undefined) {
    return {
      status: "notExamined",
      limitation: "pending",
      ...(selection ? { selection } : {}),
    }
  }
  if (!selection) return { status: "notExamined", limitation: "missingTelemetry" }
  return { status: "examined", selection }
}
