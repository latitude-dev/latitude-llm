import {
  CompletedRun,
  EvaluationType,
  HumanEvaluationMetric,
  RunAnnotation,
  Span,
  SpanType,
} from '../../constants'
import {
  EvaluationResultsV2Repository,
  EvaluationsV2Repository,
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
    span,
  }
}
