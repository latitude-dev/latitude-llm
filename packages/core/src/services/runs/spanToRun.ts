import { Message } from '@latitude-data/constants/legacyCompiler'
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
import { formatMessage } from '../../helpers'
import {
  EvaluationResultsV2Repository,
  EvaluationsV2Repository,
  SpanMetadatasRepository,
  SpansRepository,
} from '../../repositories'
import { getEvaluationMetricSpecification } from '../evaluationsV2/specifications'

/**
 * Converts a document log to a Run object with annotations and metadata.
 */
export async function spanToRun({
  workspaceId,
  span,
}: {
  workspaceId: number
  span: Span<SpanType.Prompt>
}): Promise<CompletedRun> {
  let caption = 'Run finished successfully without any response'
  const spansRepo = new SpansRepository(workspaceId)
  const spanMetadataRepo = new SpanMetadatasRepository(workspaceId)
  const completionSpan = await spansRepo
    .findByParentAndType({ parentId: span.id, type: SpanType.Completion })
    .then((r) => r[0])
  if (completionSpan) {
    const completionSpanMetadata = (await spanMetadataRepo
      .get({ spanId: completionSpan.id, traceId: completionSpan.traceId })
      .then((r) => r.value)) as CompletionSpanMetadata | undefined
    if (completionSpanMetadata) {
      const conversation = [
        ...((completionSpanMetadata.input ?? []) as unknown as Message[]),
        ...((completionSpanMetadata.output ?? []) as unknown as Message[]),
      ]
      if (conversation.length > 0) caption = formatMessage(conversation.at(-1)!) // prettier-ignore
    }
  }
  caption = caption.trim().slice(0, RUN_CAPTION_SIZE)

  let promptSpanMetadata: PromptSpanMetadata | undefined
  if (span) {
    promptSpanMetadata = (await spanMetadataRepo
      .get({
        spanId: span.id,
        traceId: span.traceId,
      })
      .then((r) => r.value)) as PromptSpanMetadata | undefined
  }
  const evalsRepo = new EvaluationsV2Repository(workspaceId)
  const repository = new EvaluationResultsV2Repository(workspaceId)
  const results = await repository.listBySpans([span]).then((r) => r.value)
  const evaluations = await evalsRepo
    .listAtCommitByDocument({
      commitUuid: span.commitUuid!,
      documentUuid: span.documentUuid!,
    })
    .then((r) => r.value)
  const annotations = results
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
    .filter(Boolean) as RunAnnotation<EvaluationType, HumanEvaluationMetric>[]

  return {
    uuid: span.documentLogUuid!,
    queuedAt: span.startedAt,
    startedAt: span.startedAt,
    endedAt: span.endedAt,
    caption,
    annotations,
    source: span.source!,
    span: { ...span, metadata: promptSpanMetadata }, // prettier-ignore
  }
}
