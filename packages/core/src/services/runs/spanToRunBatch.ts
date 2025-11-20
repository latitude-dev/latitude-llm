import {
  CompletedRun,
  CompletionSpanMetadata,
  EvaluationType,
  HumanEvaluationMetric,
  PromptSpanMetadata,
  RUN_CAPTION_SIZE,
  RunAnnotation,
  Span,
  SpanType,
} from '../../constants'
import { Message } from '@latitude-data/constants/legacyCompiler'
import { formatMessage } from '../../helpers'
import {
  EvaluationResultsV2Repository,
  EvaluationsV2Repository,
  SpanMetadatasRepository,
  SpansRepository,
} from '../../repositories'
import { getEvaluationMetricSpecification } from '../evaluationsV2/specifications'

/**
 * Batched version of spanToRun that fetches data for multiple spans at once
 * to avoid N+1 query problems that cause memory issues in the container.
 */
export async function spansToRunsBatch({
  workspaceId,
  spans,
}: {
  workspaceId: number
  spans: Span<SpanType.Prompt>[]
}): Promise<CompletedRun[]> {
  if (spans.length === 0) return []

  const spansRepo = new SpansRepository(workspaceId)
  const spanMetadataRepo = new SpanMetadatasRepository(workspaceId)
  const evalsRepo = new EvaluationsV2Repository(workspaceId)
  const resultsRepo = new EvaluationResultsV2Repository(workspaceId)

  // Batch 1: Fetch all completion spans at once
  const completionSpansPromises = spans.map((span) =>
    spansRepo
      .findByParentAndType({ parentId: span.id, type: SpanType.Completion })
      .then((r) => ({ spanId: span.id, completionSpan: r[0] })),
  )
  const completionSpansData = await Promise.all(completionSpansPromises)
  const completionSpansMap = new Map(
    completionSpansData.map((d) => [d.spanId, d.completionSpan]),
  )

  // Batch 2: Fetch all completion span metadata at once
  const completionSpanIds = Array.from(completionSpansMap.values())
    .filter(Boolean)
    .map((s) => ({ spanId: s!.id, traceId: s!.traceId }))
  const completionMetadataPromises = completionSpanIds.map(
    ({ spanId, traceId }) =>
      spanMetadataRepo
        .get({ spanId, traceId })
        .then((r) => ({ spanId, metadata: r.value })),
  )
  const completionMetadataData = await Promise.all(completionMetadataPromises)
  const completionMetadataMap = new Map(
    completionMetadataData.map((d) => [d.spanId, d.metadata]),
  )

  // Batch 3: Fetch all prompt span metadata at once
  const promptMetadataPromises = spans.map((span) =>
    spanMetadataRepo
      .get({ spanId: span.id, traceId: span.traceId })
      .then((r) => ({ spanId: span.id, metadata: r.value })),
  )
  const promptMetadataData = await Promise.all(promptMetadataPromises)
  const promptMetadataMap = new Map(
    promptMetadataData.map((d) => [d.spanId, d.metadata]),
  )

  // Batch 4: Fetch all evaluation results at once
  const allResults = await resultsRepo.listBySpans(spans).then((r) => r.value)

  // Batch 5: Fetch unique evaluations for all spans
  const uniqueCommitDocs = new Map<
    string,
    { commitUuid: string; documentUuid: string }
  >()
  spans.forEach((span) => {
    if (span.commitUuid && span.documentUuid) {
      const key = `${span.commitUuid}:${span.documentUuid}`
      uniqueCommitDocs.set(key, {
        commitUuid: span.commitUuid,
        documentUuid: span.documentUuid,
      })
    }
  })

  const evaluationsPromises = Array.from(uniqueCommitDocs.values()).map(
    ({ commitUuid, documentUuid }) =>
      evalsRepo
        .listAtCommitByDocument({ commitUuid, documentUuid })
        .then((r) => ({
          key: `${commitUuid}:${documentUuid}`,
          evaluations: r.value,
        })),
  )
  const evaluationsData = await Promise.all(evaluationsPromises)
  const evaluationsMap = new Map(
    evaluationsData.map((d) => [d.key, d.evaluations]),
  )

  // Map results by span ID for quick lookup
  const resultsBySpanId = new Map<string, typeof allResults>()
  allResults.forEach((result) => {
    const spanId = result.evaluatedSpanId
    if (!resultsBySpanId.has(spanId)) {
      resultsBySpanId.set(spanId, [])
    }
    resultsBySpanId.get(spanId)!.push(result)
  })

  // Now build the runs with all the pre-fetched data
  return spans.map((span) => {
    let caption = 'Run finished successfully without any response'

    const completionSpan = completionSpansMap.get(span.id)
    if (completionSpan) {
      const completionSpanMetadata = completionMetadataMap.get(
        completionSpan.id,
      ) as CompletionSpanMetadata | undefined
      if (completionSpanMetadata) {
        const conversation = [
          ...((completionSpanMetadata.input ?? []) as unknown as Message[]),
          ...((completionSpanMetadata.output ?? []) as unknown as Message[]),
        ]
        if (conversation.length > 0) {
          caption = formatMessage(conversation.at(-1)!)
        }
      }
    }
    caption = caption.trim().slice(0, RUN_CAPTION_SIZE)

    const promptSpanMetadata = promptMetadataMap.get(span.id) as
      | PromptSpanMetadata
      | undefined

    const spanResults = resultsBySpanId.get(span.id) || []
    const evaluations =
      evaluationsMap.get(`${span.commitUuid}:${span.documentUuid}`) || []

    const annotations = spanResults
      .map((result) => {
        const evaluation = evaluations.find(
          (ev) => ev.uuid === result.evaluationUuid,
        )
        const metric = evaluation
          ? getEvaluationMetricSpecification(evaluation)
          : undefined
        if (!metric?.supportsManualEvaluation) return null

        return {
          result,
          evaluation,
        }
      })
      .filter(Boolean) as RunAnnotation<
      EvaluationType,
      HumanEvaluationMetric
    >[]

    return {
      uuid: span.documentLogUuid!,
      queuedAt: span.startedAt,
      startedAt: span.startedAt,
      endedAt: span.endedAt,
      caption,
      annotations,
      source: span.source!,
      span: { ...span, metadata: promptSpanMetadata },
    }
  })
}
