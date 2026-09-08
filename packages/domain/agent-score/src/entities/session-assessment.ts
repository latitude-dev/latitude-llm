import { scoreDimensionSchema, scoreEvidenceContractSchema, sessionIdSchema } from "@domain/shared"
import { z } from "zod"

export const SESSION_ASSESSMENT_PAGE_SIZE = 100

export const sessionAssessmentSourceSchema = z.enum(["metric", "signal", "flagger", "score", "moment"])
export type SessionAssessmentSource = z.infer<typeof sessionAssessmentSourceSchema>

export const sessionAssessmentPolaritySchema = z.enum(["negative", "unknown", "positive"])
export type SessionAssessmentPolarity = z.infer<typeof sessionAssessmentPolaritySchema>

export const sessionAssessmentImpactLevelSchema = z.enum(["low", "medium", "high"])
export type SessionAssessmentImpactLevel = z.infer<typeof sessionAssessmentImpactLevelSchema>

export const sessionEvidenceAnchorSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("message"),
    traceId: z.string().min(1),
    messageIndex: z.number().int().nonnegative(),
    partIndex: z.number().int().nonnegative().optional(),
    contentHash: z.string().min(1).optional(),
  }),
  z.object({
    kind: z.literal("span"),
    traceId: z.string().min(1),
    spanId: z.string().min(1),
  }),
  z.object({
    kind: z.literal("toolCall"),
    traceId: z.string().min(1),
    toolCallId: z.string().min(1),
    toolName: z.string().min(1).optional(),
    messageIndex: z.number().int().nonnegative().optional(),
  }),
  z.object({
    kind: z.literal("memoryEvent"),
    memoryEventId: z.string().min(1),
  }),
  z.object({
    kind: z.literal("score"),
    scoreId: z.string().min(1),
  }),
  z.object({
    kind: z.literal("signal"),
    signalId: z.string().min(1),
  }),
])
export type SessionEvidenceAnchor = z.infer<typeof sessionEvidenceAnchorSchema>

export const sessionEvidenceDestinationSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("sessionMessage"),
    traceId: z.string().min(1),
    messageIndex: z.number().int().nonnegative(),
    partIndex: z.number().int().nonnegative().optional(),
  }),
  z.object({
    kind: z.literal("span"),
    traceId: z.string().min(1),
    spanId: z.string().min(1),
  }),
  z.object({
    kind: z.literal("toolCall"),
    traceId: z.string().min(1),
    toolCallId: z.string().min(1),
  }),
  z.object({
    kind: z.literal("memoryEvent"),
    memoryEventId: z.string().min(1),
  }),
  z.object({
    kind: z.literal("score"),
    scoreId: z.string().min(1),
  }),
  z.object({
    kind: z.literal("signal"),
    signalId: z.string().min(1),
  }),
])
export type SessionEvidenceDestination = z.infer<typeof sessionEvidenceDestinationSchema>

export const sessionEvidenceImpactSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("taskOutcome"),
    verdict: z.enum(["success", "failure"]),
    probability: z.number().min(0).max(1).optional(),
  }),
  z.object({
    kind: z.literal("completion"),
    status: z.enum(["usable", "terminalFailure"]),
  }),
  z.object({
    kind: z.literal("incident"),
    status: z.enum(["recovered", "unrecovered"]),
    sameSubjectRecovered: z.boolean().optional(),
  }),
  z.object({
    kind: z.literal("spend"),
    observedMicrocents: z.number().nonnegative(),
    avoidableMicrocents: z.number().nonnegative().optional(),
  }),
  z.object({
    kind: z.literal("duration"),
    observedNs: z.number().nonnegative(),
    avoidableNs: z.number().nonnegative().optional(),
  }),
  z.object({
    kind: z.literal("outcomeAssociation"),
    probabilityChange: z.number().min(-1).max(1).optional(),
  }),
  z.object({
    kind: z.literal("safety"),
    status: z.enum(["exposure", "successfulDefense", "confirmedHarm"]),
    findingKind: z.string().min(1),
  }),
  z.object({
    kind: z.literal("observation"),
    value: z.number().optional(),
    unit: z.string().min(1).optional(),
  }),
])
export type SessionEvidenceImpact = z.infer<typeof sessionEvidenceImpactSchema>

export const sessionDimensionEffectSchema = z.intersection(
  scoreEvidenceContractSchema,
  z.object({
    direction: z.enum(["positive", "negative", "context"]),
    measurement: z.enum(["observed", "estimated", "notMeasured"]),
    benchmarkUse: z.enum(["direct", "modeled", "attributionOnly", "contextOnly"]),
    impact: sessionEvidenceImpactSchema.optional(),
  }),
)
export type SessionDimensionEffect = z.infer<typeof sessionDimensionEffectSchema>

export const sessionAssessmentItemSchema = z.object({
  id: z.string().min(1),
  evidenceKey: z.string().min(1),
  groupKey: z.string().min(1),
  label: z.string().min(1),
  description: z.string().min(1).optional(),
  occurredAt: z.date().optional(),
  source: sessionAssessmentSourceSchema,
  polarity: sessionAssessmentPolaritySchema,
  impactLevel: sessionAssessmentImpactLevelSchema,
  metricId: z.string().min(1).optional(),
  signalIds: z.array(z.string().min(1)),
  scoreIds: z.array(z.string().min(1)),
  occurrenceCount: z.number().int().positive(),
  effects: z.array(sessionDimensionEffectSchema),
  anchors: z.array(sessionEvidenceAnchorSchema),
  destinations: z.array(sessionEvidenceDestinationSchema),
})
export type SessionAssessmentItem = z.infer<typeof sessionAssessmentItemSchema>

const sessionDimensionSummaryBaseSchema = z.object({
  scoreDimension: scoreDimensionSchema,
  evidenceCounts: z.object({
    positive: z.number().int().nonnegative(),
    negative: z.number().int().nonnegative(),
    context: z.number().int().nonnegative(),
  }),
  measurementCounts: z.object({
    observed: z.number().int().nonnegative(),
    estimated: z.number().int().nonnegative(),
    notMeasured: z.number().int().nonnegative(),
  }),
  coverage: z.enum(["complete", "partial", "notExamined"]),
})

export const sessionDimensionSummarySchema = z.discriminatedUnion("scoreDimension", [
  sessionDimensionSummaryBaseSchema.extend({
    scoreDimension: z.literal("outcome"),
    taskOutcome: z
      .object({
        verdict: z.enum(["success", "failure"]).optional(),
        probability: z.number().min(0).max(1).optional(),
      })
      .optional(),
  }),
  sessionDimensionSummaryBaseSchema.extend({
    scoreDimension: z.literal("reliability"),
    completion: z.enum(["usable", "terminalFailure", "undetermined"]),
    recoveredIncidentCount: z.number().int().nonnegative(),
    unrecoveredIncidentCount: z.number().int().nonnegative(),
  }),
  sessionDimensionSummaryBaseSchema.extend({
    scoreDimension: z.literal("cost"),
    observedMicrocents: z.number().nonnegative().optional(),
    measuredAvoidableMicrocents: z.number().nonnegative().optional(),
    estimatedAvoidableMicrocents: z.number().nonnegative().optional(),
  }),
  sessionDimensionSummaryBaseSchema.extend({
    scoreDimension: z.literal("speed"),
    observedCriticalPathNs: z.number().nonnegative().optional(),
    measuredAvoidableNs: z.number().nonnegative().optional(),
    estimatedAvoidableNs: z.number().nonnegative().optional(),
  }),
  sessionDimensionSummaryBaseSchema.extend({
    scoreDimension: z.literal("safety"),
    exposureCount: z.number().int().nonnegative(),
    successfulDefenseCount: z.number().int().nonnegative(),
    confirmedHarmCount: z.number().int().nonnegative(),
  }),
])
export type SessionDimensionSummary = z.infer<typeof sessionDimensionSummarySchema>

export const sessionReaderSelectionSchema = z.object({
  method: z.enum(["deterministic", "hinted", "uniform-sample", "ordinary-sample"]),
  inclusionProbability: z.number().min(0).max(1),
})
export type SessionReaderSelection = z.infer<typeof sessionReaderSelectionSchema>

export const sessionCoverageLimitationSchema = z.enum([
  "skipped",
  "notSelected",
  "rateLimited",
  "executionFailed",
  "pending",
  "missingTelemetry",
  "unmappedTelemetry",
  "missingPricing",
  "criticalPathUnavailable",
])
export type SessionCoverageLimitation = z.infer<typeof sessionCoverageLimitationSchema>

const sessionReaderCoverageBaseSchema = z.object({
  readerId: z.string().min(1),
  label: z.string().min(1),
  scoreDimensions: z.array(scoreDimensionSchema),
})

export const sessionReaderCoverageSchema = z.discriminatedUnion("status", [
  sessionReaderCoverageBaseSchema.extend({
    status: z.literal("examined"),
    findingCount: z.number().int().nonnegative(),
    selection: sessionReaderSelectionSchema.optional(),
  }),
  sessionReaderCoverageBaseSchema.extend({
    status: z.literal("partiallyExamined"),
    findingCount: z.number().int().nonnegative(),
    readableCount: z.number().int().nonnegative(),
    totalCount: z.number().int().nonnegative(),
    limitation: sessionCoverageLimitationSchema,
    selection: sessionReaderSelectionSchema.optional(),
  }),
  sessionReaderCoverageBaseSchema.extend({
    status: z.literal("notExamined"),
    limitation: sessionCoverageLimitationSchema,
    selection: sessionReaderSelectionSchema.optional(),
  }),
  sessionReaderCoverageBaseSchema.extend({
    status: z.literal("notApplicable"),
  }),
])
export type SessionReaderCoverage = z.infer<typeof sessionReaderCoverageSchema>

export const sessionAssessmentCoverageSchema = z.object({
  readers: z.array(sessionReaderCoverageSchema),
})
export type SessionAssessmentCoverage = z.infer<typeof sessionAssessmentCoverageSchema>

export const sessionAssessmentCursorSchema = z.string().min(1)
export type SessionAssessmentCursor = z.infer<typeof sessionAssessmentCursorSchema>

export const sessionAssessmentSchema = z.object({
  sessionId: sessionIdSchema,
  items: z.array(sessionAssessmentItemSchema),
  nextCursor: sessionAssessmentCursorSchema.optional(),
  dimensions: z.array(sessionDimensionSummarySchema),
  coverage: sessionAssessmentCoverageSchema,
})
export type SessionAssessment = z.infer<typeof sessionAssessmentSchema>
