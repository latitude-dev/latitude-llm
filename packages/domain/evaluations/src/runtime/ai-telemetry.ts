import {
  AI_GENERATE_TELEMETRY_SPAN_NAMES,
  AI_GENERATE_TELEMETRY_TAGS,
  buildProjectScopedAiMetadata,
  type GenerateTelemetryCapture,
  type ProjectScopedAiIds,
} from "@domain/ai"

/** Org/project + issue/evaluation context shared by alignment, optimization, and GEPA activities. */
export type EvaluationAlignmentJudgeTelemetryScope = ProjectScopedAiIds & {
  readonly issueId: string
  readonly evaluationId: string | null
  readonly jobId?: string | null
}

export type EvaluationOptimizationJudgeTelemetryScope = EvaluationAlignmentJudgeTelemetryScope

const optionalJobIdMetadata = (jobId: string | null | undefined): Record<string, string> =>
  jobId !== undefined && jobId !== null && jobId.length > 0 ? { jobId } : {}

export const buildEvaluationAlignmentJudgeTelemetryCapture = (input: {
  readonly scope: EvaluationAlignmentJudgeTelemetryScope
  readonly traceId: string
  readonly exampleLabel: "positive" | "negative"
}): GenerateTelemetryCapture => {
  const { organizationId, projectId, issueId, evaluationId, jobId } = input.scope
  return {
    spanName: AI_GENERATE_TELEMETRY_SPAN_NAMES.evaluationJudgeAlignment,
    tags: [...AI_GENERATE_TELEMETRY_TAGS.evaluationJudgeAlignment],
    metadata: buildProjectScopedAiMetadata(
      { organizationId, projectId },
      {
        issueId,
        evaluationId,
        traceId: input.traceId,
        exampleLabel: input.exampleLabel,
        ...optionalJobIdMetadata(jobId),
      },
    ),
  }
}

export const buildEvaluationOptimizationJudgeTelemetryCapture = (input: {
  readonly scope: EvaluationOptimizationJudgeTelemetryScope
  readonly candidateHash: string
  readonly exampleTraceId: string
}): GenerateTelemetryCapture => {
  const { organizationId, projectId, issueId, evaluationId, jobId } = input.scope
  return {
    spanName: AI_GENERATE_TELEMETRY_SPAN_NAMES.evaluationJudgeOptimization,
    tags: [...AI_GENERATE_TELEMETRY_TAGS.evaluationJudgeOptimization],
    metadata: buildProjectScopedAiMetadata(
      { organizationId, projectId },
      {
        issueId,
        evaluationId,
        candidateHash: input.candidateHash,
        exampleTraceId: input.exampleTraceId,
        ...optionalJobIdMetadata(jobId),
      },
    ),
  }
}

export const buildEvaluationJudgeLiveTelemetryCapture = (input: {
  readonly organizationId: string
  readonly projectId: string
  readonly evaluationId: string
  readonly issueId: string
  readonly traceId: string
}): GenerateTelemetryCapture => ({
  spanName: AI_GENERATE_TELEMETRY_SPAN_NAMES.evaluationJudgeLive,
  tags: [...AI_GENERATE_TELEMETRY_TAGS.evaluationJudgeLive],
  metadata: buildProjectScopedAiMetadata(
    { organizationId: input.organizationId, projectId: input.projectId },
    {
      evaluationId: input.evaluationId,
      issueId: input.issueId,
      traceId: input.traceId,
    },
  ),
})

export const buildEvaluationGepaProposeTelemetryCapture = (
  scope: EvaluationAlignmentJudgeTelemetryScope & {
    readonly evaluationHash: string
    readonly candidateHash: string
  },
): GenerateTelemetryCapture => {
  const { organizationId, projectId, issueId, evaluationId, jobId, evaluationHash, candidateHash } = scope
  return {
    spanName: AI_GENERATE_TELEMETRY_SPAN_NAMES.evaluationProposeOptimization,
    tags: [...AI_GENERATE_TELEMETRY_TAGS.evaluationProposeOptimization],
    metadata: buildProjectScopedAiMetadata(
      { organizationId, projectId },
      {
        issueId,
        evaluationId,
        evaluationHash,
        candidateHash,
        ...optionalJobIdMetadata(jobId),
      },
    ),
  }
}
