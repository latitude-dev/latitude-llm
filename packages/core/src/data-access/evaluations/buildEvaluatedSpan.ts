import {
  ActualOutputConfiguration,
  EvaluableSpanType,
  Span,
} from '@latitude-data/constants'
import { BadRequestError } from '@latitude-data/constants/errors'
import { Result, TypedResult } from '../../lib/Result'
import { Workspace } from '../../schema/models/types/Workspace'
import { extractActualOutput } from '../../services/evaluationsV2/outputs/extract'
import { assembleTraceWithMessages } from '../../services/tracing/traces/assemble'

function isValidConfiguration(
  configuration: object,
): configuration is ActualOutputConfiguration {
  if (typeof configuration !== 'object' || configuration === null) {
    return false
  }

  return (
    'messageSelection' in configuration &&
    'parsingFormat' in configuration &&
    typeof configuration.messageSelection === 'string' &&
    typeof configuration.parsingFormat === 'string'
  )
}

function extractActualOutputConfiguration(
  configParam: string | null | undefined,
): TypedResult<ActualOutputConfiguration> {
  if (!configParam) {
    return Result.error(new BadRequestError('Missing configuration parameter'))
  }

  try {
    const maybeConfiguration = JSON.parse(configParam)
    if (!isValidConfiguration(maybeConfiguration)) {
      return Result.error(
        new BadRequestError('Invalid actual output configuration'),
      )
    }
    return Result.ok(maybeConfiguration)
  } catch (_) {
    return Result.error(new BadRequestError('Invalid configuration parameter'))
  }
}

/**
 * This service receives a span that can be evaluated and produce
 * the necessary info to show in the UI that trace so the users can see what they're evaluating. This is specially useful when picking the expected output out of the actualOutput configured in the evaluation
 */
export async function buildEvaluatedSpan({
  workspace,
  span,
  maybeConfiguration,
}: {
  workspace: Workspace
  span: Span<EvaluableSpanType>
  maybeConfiguration: string | null | undefined
}) {
  const configurationResult =
    extractActualOutputConfiguration(maybeConfiguration)
  if (!Result.isOk(configurationResult)) return configurationResult

  const configuration = configurationResult.value
  const assembledTraceResult = await assembleTraceWithMessages({
    traceId: span.traceId,
    workspace,
    spanId: span.id,
  })

  if (!Result.isOk(assembledTraceResult)) {
    return Result.error(new BadRequestError('Could not assemble trace'))
  }

  const { completionSpan } = assembledTraceResult.unwrap()
  if (!completionSpan) {
    return Result.error(new BadRequestError('Could not find completion span'))
  }

  const messages = [
    ...(completionSpan.metadata?.input ?? []),
    ...(completionSpan.metadata?.output ?? []),
  ]

  const actualOutputResult = extractActualOutput({
    conversation: messages,
    configuration,
  })

  if (!Result.isOk(actualOutputResult)) return actualOutputResult

  return Result.ok({
    documentLogUuid: span.documentLogUuid,
    actualOutput: actualOutputResult.value,
    messages,
  })
}
