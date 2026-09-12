import type {
  SessionAssessment,
  SessionAssessmentItem,
  SessionDimensionEffect,
  SessionEvidenceAnchor,
  SessionEvidenceDestination,
  SessionEvidenceImpact,
} from "@domain/agent-score"
import { z } from "@hono/zod-openapi"

export const SessionAssessmentQuerySchema = z.object({
  cursor: z
    .string()
    .optional()
    .describe("Opaque cursor returned by a previous assessment page. Omit for the first page."),
})

const ScoreDimensionSchema = z
  .enum(["outcome", "reliability", "cost", "speed", "safety"])
  .describe("Agent Score dimension informed by this evidence.")

const EvidenceAnchorSchema = z
  .discriminatedUnion("kind", [
    z.object({
      kind: z.literal("message"),
      traceId: z.string().describe("Trace containing the referenced message."),
      messageIndex: z.number().int().nonnegative().describe("Zero-based message position in the trace conversation."),
      partIndex: z
        .number()
        .int()
        .nonnegative()
        .optional()
        .describe("Zero-based content-part position within the message."),
      contentHash: z.string().optional().describe("Stable hash used to recognize the referenced message content."),
    }),
    z.object({
      kind: z.literal("span"),
      traceId: z.string().describe("Trace containing the referenced span."),
      spanId: z.string().describe("Identifier of the referenced span."),
    }),
    z.object({
      kind: z.literal("toolCall"),
      traceId: z.string().describe("Trace containing the referenced tool call."),
      toolCallId: z.string().describe("Provider or SDK identifier of the referenced tool call."),
      toolName: z.string().optional().describe("Name of the invoked tool when available."),
      messageIndex: z.number().int().nonnegative().optional().describe("Message position containing the tool call."),
    }),
    z.object({
      kind: z.literal("memoryEvent"),
      memoryEventId: z.string().describe("Identifier of the referenced memory event."),
    }),
    z.object({ kind: z.literal("score"), scoreId: z.string().describe("Identifier of the referenced score.") }),
    z.object({ kind: z.literal("signal"), signalId: z.string().describe("Identifier of the referenced signal.") }),
  ])
  .openapi("SessionAssessmentEvidenceAnchor")

const EvidenceDestinationSchema = z
  .discriminatedUnion("kind", [
    z.object({
      kind: z.literal("sessionMessage"),
      traceId: z.string().describe("Trace containing the destination message."),
      messageIndex: z.number().int().nonnegative().describe("Zero-based message position to open."),
      partIndex: z.number().int().nonnegative().optional().describe("Zero-based content-part position to open."),
    }),
    z.object({
      kind: z.literal("span"),
      traceId: z.string().describe("Trace containing the destination span."),
      spanId: z.string().describe("Identifier of the destination span."),
    }),
    z.object({
      kind: z.literal("toolCall"),
      traceId: z.string().describe("Trace containing the destination tool call."),
      toolCallId: z.string().describe("Identifier of the destination tool call."),
    }),
    z.object({
      kind: z.literal("memoryEvent"),
      memoryEventId: z.string().describe("Identifier of the destination memory event."),
    }),
    z.object({ kind: z.literal("score"), scoreId: z.string().describe("Identifier of the destination score.") }),
    z.object({ kind: z.literal("signal"), signalId: z.string().describe("Identifier of the destination signal.") }),
  ])
  .openapi("SessionAssessmentEvidenceDestination")

const EvidenceImpactSchema = z
  .discriminatedUnion("kind", [
    z.object({
      kind: z.literal("taskOutcome"),
      verdict: z.enum(["success", "failure"]).describe("Observed task outcome."),
      probability: z.number().min(0).max(1).optional().describe("Estimated success probability when available."),
    }),
    z.object({
      kind: z.literal("completion"),
      status: z.enum(["usable", "terminalFailure"]).describe("Whether the session delivered usable output."),
    }),
    z.object({
      kind: z.literal("incident"),
      status: z.enum(["recovered", "unrecovered"]).describe("Whether execution recovered after the incident."),
      sameSubjectRecovered: z.boolean().optional().describe("Whether the same operation or tool later succeeded."),
    }),
    z.object({
      kind: z.literal("spend"),
      observedMicrocents: z.number().nonnegative().describe("Observed spend in microcents."),
      avoidableMicrocents: z.number().nonnegative().optional().describe("Spend attributed as avoidable when measured."),
    }),
    z.object({
      kind: z.literal("duration"),
      observedNs: z.number().nonnegative().describe("Observed duration in nanoseconds."),
      avoidableNs: z.number().nonnegative().optional().describe("Duration attributed as avoidable when measured."),
    }),
    z.object({
      kind: z.literal("outcomeAssociation"),
      probabilityChange: z.number().min(-1).max(1).optional().describe("Modeled change in success probability."),
    }),
    z.object({
      kind: z.literal("safety"),
      status: z.enum(["exposure", "successfulDefense", "confirmedHarm"]).describe("Observed safety result."),
      findingKind: z
        .string()
        .describe(
          "Machine-readable safety finding category. A structured detector result is one of injectionAttempt, injectionDefense, injectionCompliance, piiExposure, or piiDisclosure; an item derived from a signal's assigned role instead names that signal's detector.",
        ),
    }),
    z.object({
      kind: z.literal("observation"),
      value: z.number().optional().describe("Native numeric observation when available."),
      unit: z.string().optional().describe("Unit of the native observation when available."),
    }),
  ])
  .openapi("SessionAssessmentEvidenceImpact")

const CostFamilySchema = z
  .enum(["spend", "context", "tools", "memory", "recovery"])
  .describe("Cost family this evidence belongs to: spend, context, tools, memory, or recovery.")

const CostRawUnitSchema = z
  .enum([
    "microcents",
    "inputTokens",
    "cacheTokens",
    "contextLimitTokens",
    "toolCalls",
    "memoryOperations",
    "memoryReads",
    "memoryWrites",
    "completedSessions",
  ])
  .describe("Native unit used by the Cost metric.")

const EstimateRangeSchema = z
  .object({
    unit: z.string().describe("Unit both the point estimate and its bounds are expressed in."),
    point: z.number().describe("Point estimate in `unit`."),
    lower: z.number().optional().describe("Lower bound in `unit`, when the estimate is bounded."),
    upper: z.number().optional().describe("Upper bound in `unit`, when the estimate is bounded."),
    interpretation: z
      .enum(["identificationBound", "confidenceInterval"])
      .optional()
      .describe(
        "What the bounds mean. `identificationBound` is the range the evidence cannot narrow further; `confidenceInterval` is sampling uncertainty. Present whenever a bound is.",
      ),
  })
  .openapi("SessionAssessmentEstimateRange")

const CostEvaluationSchema = z
  .object({
    family: CostFamilySchema,
    rawValue: z.number().optional().describe("The metric's raw reading in `rawUnit`, when measured."),
    rawUnit: CostRawUnitSchema.optional().describe("Native unit of `rawValue`."),
    measurementState: z
      .enum(["measured", "unmeasured", "notApplicable"])
      .describe(
        "Whether this evidence was measured, could not be measured, or did not apply. This is not a health label.",
      ),
    nativeImpact: EstimateRangeSchema.optional().describe(
      "Impact in the family's own unit. Never a score: sessions do not receive Cost numbers.",
    ),
  })
  .openapi("SessionAssessmentCostEvaluation")

const CostMetricEvidenceSchema = z
  .object({
    metricId: z.string().describe("Stable identifier of the Cost metric."),
    family: CostFamilySchema,
    aggregation: z
      .enum(["resourceRatio", "eventRate", "sessionMean"])
      .describe("How the aggregate reading was calculated for this session."),
    measurementState: z
      .enum(["measured", "unmeasured", "notApplicable"])
      .describe("Whether the metric produced a raw session reading. This is not a health label."),
    rawUnit: CostRawUnitSchema,
    rawValue: z.number().optional().describe("Aggregate raw metric value when measured."),
    eligibleUnits: z.number().nonnegative().optional().describe("Total session units eligible for this metric."),
    adverseUnits: z
      .number()
      .nonnegative()
      .optional()
      .describe("Observed adverse units within `eligibleUnits`; never a calibrated penalty."),
    evidence: z
      .enum(["confirmed", "modeled"])
      .optional()
      .describe("Whether the reported native impact is directly confirmed or modeled."),
    nativeImpact: EstimateRangeSchema.optional().describe("Impact in the metric's native unit, when available."),
    limitations: z
      .array(
        z.enum([
          "missingContent",
          "truncatedContent",
          "missingPricing",
          "unknownModelContext",
          "unknownToolContract",
          "criticalPathUnavailable",
          "insufficientComparableCalls",
          "definitionPeriodIncomplete",
        ]),
      )
      .describe("Known limits on how completely the metric could examine the session."),
  })
  .openapi("SessionAssessmentCostMetricEvidence")

const CostFamilySummarySchema = z
  .object({
    family: CostFamilySchema,
    measurementState: z
      .enum(["measured", "partial", "unmeasured", "notApplicable"])
      .describe("Aggregate measurement state across this family's metrics. This is not a health label."),
    observedItemCount: z.number().int().nonnegative().describe("Evidence items carrying this family."),
    metrics: z.array(CostMetricEvidenceSchema).describe("Aggregate session-safe readings for this family's metrics."),
    nativeImpact: EstimateRangeSchema.optional().describe("Family impact in its own unit, when aggregated."),
  })
  .openapi("SessionAssessmentCostFamilySummary")

const effectFields = {
  direction: z.enum(["positive", "negative", "context"]).describe("How the evidence affects this dimension."),
  measurement: z
    .enum(["observed", "estimated", "notMeasured"])
    .describe("Whether the impact was measured, estimated, or left unquantified."),
  benchmarkUse: z
    .enum(["direct", "modeled", "attributionOnly", "contextOnly"])
    .describe("How this evidence may be used in benchmark calculations."),
  impact: EvidenceImpactSchema.optional().describe("Native structured impact carried by this evidence."),
  costEvaluation: CostEvaluationSchema.optional().describe(
    "Cost family evaluation for this evidence. Only Cost evidence carries one.",
  ),
} as const

const DimensionEffectSchema = z
  .discriminatedUnion("scoreDimension", [
    z.object({
      scoreDimension: z.literal("outcome").describe("Outcome dimension."),
      role: z.literal("taskOutcome").describe("Evidence about whether the task succeeded."),
      ...effectFields,
    }),
    z.object({
      scoreDimension: z.literal("reliability").describe("Reliability dimension."),
      role: z
        .enum(["completionOutcome", "operationalIncident"])
        .describe("Reliability evidence channel informed by this item."),
      ...effectFields,
    }),
    z.object({
      scoreDimension: z.literal("cost").describe("Cost dimension."),
      role: z.literal("spendEfficiency").describe("Evidence about useful versus avoidable spend."),
      ...effectFields,
    }),
    z.object({
      scoreDimension: z.literal("speed").describe("Speed dimension."),
      role: z.literal("criticalPathEfficiency").describe("Evidence about critical-path efficiency."),
      ...effectFields,
    }),
    z.object({
      scoreDimension: z.literal("safety").describe("Safety dimension."),
      role: z
        .enum(["confirmedHarm", "exposure", "successfulDefense"])
        .describe("Safety evidence channel informed by this item."),
      ...effectFields,
    }),
  ])
  .openapi("SessionAssessmentDimensionEffect")

const AssessmentItemSchema = z
  .object({
    id: z.string().describe("Stable identifier for this assessment item."),
    evidenceKey: z.string().describe("Stable identity of the underlying fact across recomputation."),
    groupKey: z.string().describe("Stable identity used to group equivalent findings and linked judgments."),
    label: z.string().describe("Short human-readable explanation of the evidence."),
    description: z.string().optional().describe("Additional explanation when available; never raw telemetry content."),
    occurredAt: z
      .string()
      .datetime()
      .optional()
      .describe("ISO-8601 timestamp for when the evidence occurred, when telemetry provides one."),
    source: z.enum(["metric", "signal", "flagger", "score", "moment"]).describe("Source that identified the fact."),
    polarity: z
      .enum(["negative", "unknown", "positive"])
      .describe("Whether the finding is harmful, beneficial, or requires interpretation."),
    impactLevel: z.enum(["low", "medium", "high"]).describe("Coarse impact level for ordering and display."),
    metricId: z.string().optional().describe("Canonical metric identifier when the item has benchmark semantics."),
    signalIds: z.array(z.string()).describe("Signals linked to the same underlying fact."),
    scoreIds: z.array(z.string()).describe("Scores linked to the same underlying fact."),
    occurrenceCount: z.number().int().positive().describe("Number of equivalent occurrences represented by this item."),
    effects: z.array(DimensionEffectSchema).describe("Dimension-specific interpretations of this evidence."),
    anchors: z
      .array(EvidenceAnchorSchema)
      .describe("Positions where the fact occurred, represented only by identifiers."),
    destinations: z
      .array(EvidenceDestinationSchema)
      .describe("Authorized product records that a caller can open for the underlying details."),
  })
  .openapi("SessionAssessmentItem")

const evidenceCounts = z.object({
  positive: z.number().int().nonnegative().describe("Number of positive evidence effects."),
  negative: z.number().int().nonnegative().describe("Number of negative evidence effects."),
  context: z.number().int().nonnegative().describe("Number of contextual evidence effects."),
})
const measurementCounts = z.object({
  observed: z.number().int().nonnegative().describe("Number of directly observed effects."),
  estimated: z.number().int().nonnegative().describe("Number of estimated effects."),
  notMeasured: z.number().int().nonnegative().describe("Number of effects without a numeric measurement."),
})
const dimensionFields = {
  evidenceCounts: evidenceCounts.describe("Evidence counts grouped by direction."),
  measurementCounts: measurementCounts.describe("Evidence counts grouped by measurement state."),
  coverage: z.enum(["complete", "partial", "notExamined"]).describe("Reader coverage for this dimension."),
} as const

const DimensionSummarySchema = z
  .discriminatedUnion("scoreDimension", [
    z.object({
      scoreDimension: z.literal("outcome").describe("Outcome dimension."),
      ...dimensionFields,
      taskOutcome: z
        .object({
          verdict: z.enum(["success", "failure"]).optional().describe("Observed task verdict when available."),
          probability: z.number().min(0).max(1).optional().describe("Estimated success probability when available."),
        })
        .optional()
        .describe("Resolved task outcome when available."),
    }),
    z.object({
      scoreDimension: z.literal("reliability").describe("Reliability dimension."),
      ...dimensionFields,
      completion: z.enum(["usable", "terminalFailure", "undetermined"]).describe("Resolved completion status."),
      recoveredIncidentCount: z.number().int().nonnegative().describe("Number of recovered operational incidents."),
      unrecoveredIncidentCount: z.number().int().nonnegative().describe("Number of unrecovered operational incidents."),
    }),
    z.object({
      scoreDimension: z.literal("cost").describe("Cost dimension."),
      ...dimensionFields,
      observedMicrocents: z.number().nonnegative().optional().describe("Total observed session spend in microcents."),
      measuredAvoidableMicrocents: z.number().nonnegative().optional().describe("Directly measured avoidable spend."),
      estimatedAvoidableMicrocents: z.number().nonnegative().optional().describe("Estimated avoidable spend."),
      families: z
        .array(CostFamilySummarySchema)
        .describe("All five Cost families, always present, with raw metric readings and their measurement state."),
    }),
    z.object({
      scoreDimension: z.literal("speed").describe("Speed dimension."),
      ...dimensionFields,
      observedCriticalPathNs: z
        .number()
        .nonnegative()
        .optional()
        .describe("Observed critical-path duration in nanoseconds."),
      measuredAvoidableNs: z.number().nonnegative().optional().describe("Directly measured avoidable duration."),
      estimatedAvoidableNs: z.number().nonnegative().optional().describe("Estimated avoidable duration."),
    }),
    z.object({
      scoreDimension: z.literal("safety").describe("Safety dimension."),
      ...dimensionFields,
      exposureCount: z.number().int().nonnegative().describe("Number of safety exposures."),
      successfulDefenseCount: z.number().int().nonnegative().describe("Number of successful safety defenses."),
      confirmedHarmCount: z.number().int().nonnegative().describe("Number of confirmed harmful outcomes."),
    }),
  ])
  .openapi("SessionAssessmentDimensionSummary")

const readerFields = {
  readerId: z.string().describe("Stable identifier of the evidence reader."),
  label: z.string().describe("Human-readable reader name."),
  scoreDimensions: z.array(ScoreDimensionSchema).describe("Dimensions the reader can inform."),
} as const
const limitation = z
  .enum([
    "skipped",
    "notSelected",
    "rateLimited",
    "executionFailed",
    "pending",
    "missingTelemetry",
    "unmappedTelemetry",
    "missingPricing",
    "missingContent",
    "truncatedContent",
    "unknownModelContext",
    "criticalPathUnavailable",
  ])
  .describe("Reason the reader could not completely examine the session.")
const selection = z
  .object({
    method: z.enum(["deterministic", "hinted", "uniform-sample", "ordinary-sample"]).describe("Selection method."),
    inclusionProbability: z.number().min(0).max(1).describe("Probability that this session was selected."),
  })
  .optional()
  .describe("Sampling details when this reader is not deterministic.")

const ReaderCoverageSchema = z
  .discriminatedUnion("status", [
    z.object({
      ...readerFields,
      status: z.literal("examined"),
      findingCount: z.number().int().nonnegative().describe("Number of findings produced by the reader."),
      selection,
    }),
    z.object({
      ...readerFields,
      status: z.literal("partiallyExamined"),
      findingCount: z.number().int().nonnegative().describe("Number of findings produced by readable inputs."),
      readableCount: z.number().int().nonnegative().describe("Number of inputs the reader could examine."),
      totalCount: z.number().int().nonnegative().describe("Total candidate inputs for the reader."),
      limitation,
      selection,
    }),
    z.object({ ...readerFields, status: z.literal("notExamined"), limitation, selection }),
    z.object({ ...readerFields, status: z.literal("notApplicable") }),
  ])
  .openapi("SessionAssessmentReaderCoverage")

export const SessionAssessmentSchema = z
  .object({
    sessionId: z.string().describe("Session represented by this assessment."),
    items: z.array(AssessmentItemSchema).describe("Chronological page of deduplicated evidence items."),
    nextCursor: z
      .string()
      .optional()
      .describe("Opaque cursor for the next evidence page. Absent when there are no more items."),
    dimensions: z
      .array(DimensionSummarySchema)
      .describe("Complete summaries for all five Agent Score dimensions, repeated on every page."),
    coverage: z
      .object({ readers: z.array(ReaderCoverageSchema).describe("Coverage status for each evidence reader.") })
      .describe("Complete reader coverage for the session, repeated on every page."),
  })
  .openapi("SessionAssessment")

type SessionAssessmentResponse = z.infer<typeof SessionAssessmentSchema>

const toAnchorResponse = (anchor: SessionEvidenceAnchor) => {
  switch (anchor.kind) {
    case "message":
      return {
        kind: anchor.kind,
        traceId: anchor.traceId,
        messageIndex: anchor.messageIndex,
        ...(anchor.partIndex !== undefined ? { partIndex: anchor.partIndex } : {}),
        ...(anchor.contentHash !== undefined ? { contentHash: anchor.contentHash } : {}),
      }
    case "span":
      return { kind: anchor.kind, traceId: anchor.traceId, spanId: anchor.spanId }
    case "toolCall":
      return {
        kind: anchor.kind,
        traceId: anchor.traceId,
        toolCallId: anchor.toolCallId,
        ...(anchor.toolName !== undefined ? { toolName: anchor.toolName } : {}),
        ...(anchor.messageIndex !== undefined ? { messageIndex: anchor.messageIndex } : {}),
      }
    case "memoryEvent":
      return { kind: anchor.kind, memoryEventId: anchor.memoryEventId }
    case "score":
      return { kind: anchor.kind, scoreId: anchor.scoreId }
    case "signal":
      return { kind: anchor.kind, signalId: anchor.signalId }
  }
}

const toDestinationResponse = (destination: SessionEvidenceDestination) => {
  switch (destination.kind) {
    case "sessionMessage":
      return {
        kind: destination.kind,
        traceId: destination.traceId,
        messageIndex: destination.messageIndex,
        ...(destination.partIndex !== undefined ? { partIndex: destination.partIndex } : {}),
      }
    case "span":
      return { kind: destination.kind, traceId: destination.traceId, spanId: destination.spanId }
    case "toolCall":
      return { kind: destination.kind, traceId: destination.traceId, toolCallId: destination.toolCallId }
    case "memoryEvent":
      return { kind: destination.kind, memoryEventId: destination.memoryEventId }
    case "score":
      return { kind: destination.kind, scoreId: destination.scoreId }
    case "signal":
      return { kind: destination.kind, signalId: destination.signalId }
  }
}

const toImpactResponse = (impact: SessionEvidenceImpact): SessionEvidenceImpact => {
  switch (impact.kind) {
    case "taskOutcome":
      return {
        kind: impact.kind,
        verdict: impact.verdict,
        ...(impact.probability !== undefined ? { probability: impact.probability } : {}),
      }
    case "completion":
      return { kind: impact.kind, status: impact.status }
    case "incident":
      return {
        kind: impact.kind,
        status: impact.status,
        ...(impact.sameSubjectRecovered !== undefined ? { sameSubjectRecovered: impact.sameSubjectRecovered } : {}),
      }
    case "spend":
      return {
        kind: impact.kind,
        observedMicrocents: impact.observedMicrocents,
        ...(impact.avoidableMicrocents !== undefined ? { avoidableMicrocents: impact.avoidableMicrocents } : {}),
      }
    case "duration":
      return {
        kind: impact.kind,
        observedNs: impact.observedNs,
        ...(impact.avoidableNs !== undefined ? { avoidableNs: impact.avoidableNs } : {}),
      }
    case "outcomeAssociation":
      return {
        kind: impact.kind,
        ...(impact.probabilityChange !== undefined ? { probabilityChange: impact.probabilityChange } : {}),
      }
    case "safety":
      return { kind: impact.kind, status: impact.status, findingKind: impact.findingKind }
    case "observation":
      return {
        kind: impact.kind,
        ...(impact.value !== undefined ? { value: impact.value } : {}),
        ...(impact.unit !== undefined ? { unit: impact.unit } : {}),
      }
  }
}

const toEffectResponse = (effect: SessionDimensionEffect): SessionDimensionEffect =>
  ({
    scoreDimension: effect.scoreDimension,
    role: effect.role,
    direction: effect.direction,
    measurement: effect.measurement,
    benchmarkUse: effect.benchmarkUse,
    ...(effect.impact ? { impact: toImpactResponse(effect.impact) } : {}),
    ...(effect.costEvaluation ? { costEvaluation: effect.costEvaluation } : {}),
  }) as SessionDimensionEffect

const toItemResponse = (item: SessionAssessmentItem): SessionAssessmentResponse["items"][number] => ({
  id: item.id,
  evidenceKey: item.evidenceKey,
  groupKey: item.groupKey,
  label: item.label,
  ...(item.description !== undefined ? { description: item.description } : {}),
  ...(item.occurredAt !== undefined ? { occurredAt: item.occurredAt.toISOString() } : {}),
  source: item.source,
  polarity: item.polarity,
  impactLevel: item.impactLevel,
  ...(item.metricId !== undefined ? { metricId: item.metricId } : {}),
  signalIds: [...item.signalIds],
  scoreIds: [...item.scoreIds],
  occurrenceCount: item.occurrenceCount,
  effects: item.effects.map(toEffectResponse),
  anchors: item.anchors.map(toAnchorResponse),
  destinations: item.destinations.map(toDestinationResponse),
})

export const toSessionAssessmentResponse = (assessment: SessionAssessment): SessionAssessmentResponse => ({
  sessionId: assessment.sessionId,
  items: assessment.items.map(toItemResponse),
  ...(assessment.nextCursor ? { nextCursor: assessment.nextCursor } : {}),
  dimensions: assessment.dimensions.map((dimension) => ({ ...dimension })),
  coverage: { readers: assessment.coverage.readers.map((reader) => ({ ...reader })) },
})
