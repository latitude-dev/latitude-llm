import { Span, EvaluationResultV2, EvaluationV2 } from '../../constants'
import { Message as LegacyMessage } from '@latitude-data/constants/legacyCompiler'
import { Result, TypedResult } from '../../lib/Result'
import { UnprocessableEntityError } from '../../lib/errors'
import { Workspace } from '../../schema/models/types/Workspace'
import { assembleTraceWithMessages } from '../tracing/traces/assemble'
import { adaptCompletionSpanMessagesToLegacy } from '../tracing/spans/fetching/findCompletionSpanFromTrace'
import { getEvaluationMetricSpecification } from '../evaluationsV2/specifications'
import { EvaluationResultSuccessValue } from '../../constants'

export type SpanMessagesWithReason = {
  messages: LegacyMessage[]
  reason: string
}

export function getReasonFromEvaluationResult(
  result: EvaluationResultV2 | undefined,
  evaluation: EvaluationV2 | undefined,
): string {
  if (!result || !evaluation || result.error) {
    return ''
  }
  const specification = getEvaluationMetricSpecification(evaluation)
  const resultReason = specification.resultReason as (
    result: EvaluationResultSuccessValue,
  ) => string | undefined
  return resultReason(result) ?? ''
}

/**
 * Builds an array of span messages with their evaluation reasons.
 * This is used to extract conversations from spans along with the reason
 * why an evaluation passed or failed.
 */
export async function buildSpanMessagesWithReasons({
  workspace,
  spans,
  evaluationResults,
  evaluations,
}: {
  workspace: Workspace
  spans: Pick<Span, 'id' | 'traceId'>[]
  evaluationResults: EvaluationResultV2[]
  evaluations: EvaluationV2[]
}): Promise<TypedResult<SpanMessagesWithReason[], Error>> {
  const messagesWithReasons: SpanMessagesWithReason[] = []

  for (const span of spans) {
    const assembledTraceResult = await assembleTraceWithMessages({
      traceId: span.traceId,
      workspace,
    })

    if (!Result.isOk(assembledTraceResult)) {
      return assembledTraceResult
    }

    const { completionSpan } = assembledTraceResult.unwrap()
    if (!completionSpan) {
      return Result.error(
        new UnprocessableEntityError('Could not find completion span'),
      )
    }

    const evaluationResult = evaluationResults.find(
      (result) =>
        result.evaluatedSpanId === span.id &&
        result.evaluatedTraceId === span.traceId,
    )

    const evaluation = evaluationResult
      ? evaluations.find((e) => e.uuid === evaluationResult.evaluationUuid)
      : undefined

    messagesWithReasons.push({
      messages: adaptCompletionSpanMessagesToLegacy(completionSpan),
      reason: getReasonFromEvaluationResult(evaluationResult, evaluation),
    })
  }

  return Result.ok(messagesWithReasons)
}
