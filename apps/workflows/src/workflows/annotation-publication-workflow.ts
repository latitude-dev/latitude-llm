import { proxyActivities } from "@temporalio/workflow"
import type * as activities from "../activities/index.ts"

const { enrichAnnotationForPublication, writePublishedAnnotationScore } = proxyActivities<typeof activities>({
  startToCloseTimeout: "5 minutes",
})

export const publishAnnotationWorkflow = async (input: {
  readonly organizationId: string
  readonly projectId: string
  readonly scoreId: string
  readonly preEnrichedFeedback?: string
}) => {
  if (input.preEnrichedFeedback !== undefined) {
    await writePublishedAnnotationScore({
      organizationId: input.organizationId,
      projectId: input.projectId,
      scoreId: input.scoreId,
      enrichedFeedback: input.preEnrichedFeedback,
      resolvedSessionId: null,
      resolvedSpanId: null,
    })

    return { action: "published" as const, scoreId: input.scoreId }
  }

  const enrichment = await enrichAnnotationForPublication(input)

  if (enrichment.status === "already-published") {
    return { action: "already-published" as const, scoreId: input.scoreId }
  }

  await writePublishedAnnotationScore({
    organizationId: input.organizationId,
    projectId: input.projectId,
    scoreId: input.scoreId,
    enrichedFeedback: enrichment.enrichedFeedback,
    resolvedSessionId: enrichment.resolvedSessionId,
    resolvedSpanId: enrichment.resolvedSpanId,
  })

  return { action: "published" as const, scoreId: input.scoreId }
}
