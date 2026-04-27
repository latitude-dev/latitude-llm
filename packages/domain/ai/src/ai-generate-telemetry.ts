/**
 * Stable tag tuples and span names for Latitude `capture` on structured `AI.generate` calls.
 * Use with `GenerateInput.telemetry` / `GenerateTelemetryCapture`.
 *
 * Human-facing catalog of each feature (purpose, tags, call sites): `dev-docs/ai-generation-features.md`.
 */
export const AI_GENERATE_TELEMETRY_TAGS = {
  issueDetails: ["issue:details"],
  annotationEnrichPublication: ["annotation:enrichment"],
  queueSystemClassify: ["system-queue:classify"],
  queueSystemDraft: ["system-queue:draft"],
  evaluationJudgeLive: ["eval:execute", "live"],
  evaluationJudgeAlignment: ["eval:execute", "alignment"],
  evaluationJudgeOptimization: ["eval:execute", "optimization"],
  evaluationProposeOptimization: ["gepa:propose"],
} as const satisfies Record<string, readonly string[]>

export const AI_GENERATE_TELEMETRY_SPAN_NAMES = {
  issueDetails: "issue.details",
  annotationEnrichPublication: "annotation.enrich.publication",
  queueSystemClassify: "queue.system.classify",
  queueSystemDraft: "queue.system.draft",
  evaluationJudgeLive: "evaluation.judge.live",
  evaluationJudgeAlignment: "evaluation.judge.alignment",
  evaluationJudgeOptimization: "evaluation.judge.optimization",
  evaluationProposeOptimization: "evaluation.propose.optimization",
} as const satisfies Record<string, string>

export type ProjectScopedAiIds = {
  readonly organizationId: string
  readonly projectId: string
}

/**
 * Metadata for AI generate telemetry: always includes org + project, then subject fields with `undefined` omitted.
 */
export const buildProjectScopedAiMetadata = (
  scope: ProjectScopedAiIds,
  subject: Record<string, string | number | boolean | null | undefined>,
): Record<string, unknown> => {
  const metadata: Record<string, unknown> = {
    organizationId: scope.organizationId,
    projectId: scope.projectId,
  }
  for (const [key, value] of Object.entries(subject)) {
    if (value !== undefined) {
      metadata[key] = value
    }
  }
  return metadata
}
