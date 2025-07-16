import { ChainEvent } from '@latitude-data/constants'
import { z } from 'zod'
import {
  EvaluationType,
  EvaluationV2,
  LlmEvaluationMetricAnyCustom,
  Workspace,
} from '../../../browser'
import { Result, TypedResult } from '../../../lib/Result'
import { generateUUIDIdentifier } from '../../../lib/generateUUID'
import { buildProvidersMap } from '../../providerApiKeys/buildMap'
import { buildLlmEvaluationRunFunction } from './shared'
import { runChain } from '../../chains/run'
import { BACKGROUND, telemetry } from '../../../telemetry'

const buildStreamHandler =
  (
    stream: ReadableStream<ChainEvent>,
    $span: ReturnType<typeof telemetry.prompt>,
  ) =>
  async ({
    signal,
    onEvent,
    onError,
    onFinished,
  }: {
    signal: AbortSignal
    onEvent: (event: ChainEvent) => void
    onError: (error: Error) => void
    onFinished: () => void
  }) => {
    try {
      const reader = stream.getReader()
      let isAborted = false

      const abortHandler = () => {
        isAborted = true
        reader.cancel().catch(() => {})
      }

      signal?.addEventListener('abort', abortHandler)

      try {
        while (true) {
          const { value, done } = await reader.read()

          if (done || isAborted) break

          if (onEvent) {
            onEvent(value)
          }
        }

        $span.end()
        onFinished?.()
      } catch (err) {
        $span.fail(err as Error)
        onError(err as Error)
      } finally {
        signal?.removeEventListener('abort', abortHandler)
      }
    } catch (err) {
      onError(err as Error)
    }
  }

type StreamHandler = ReturnType<typeof buildStreamHandler>

export async function buildStreamEvaluationRun({
  workspace,
  evaluation,
  parameters,
}: {
  workspace: Workspace
  evaluation: EvaluationV2<EvaluationType.Llm, LlmEvaluationMetricAnyCustom>
  parameters: Record<string, any>
}): Promise<TypedResult<{ streamHandler: StreamHandler }, Error>> {
  const resultUuid = generateUUIDIdentifier()
  const result = await buildLlmEvaluationRunFunction({
    resultUuid,
    workspace,
    providers: await buildProvidersMap({ workspaceId: workspace.id }),
    evaluation,
    prompt: evaluation.configuration.prompt,
    parameters,
    schema: z.object({
      score: z
        .number()
        .int()
        .min(evaluation.configuration.minScore)
        .max(evaluation.configuration.maxScore),
      reason: z.string(),
    }),
  })
  if (result.error) return result

  const { runArgs } = result.unwrap()

  const $prompt = telemetry.prompt(BACKGROUND({ workspaceId: workspace.id }), {
    logUuid: resultUuid,
    promptUuid: evaluation.uuid,
    template: evaluation.configuration.prompt,
    parameters: parameters,
  })
  const { stream } = runChain({ context: $prompt.context, ...runArgs })
  const streamHandler = buildStreamHandler(stream, $prompt)

  return Result.ok({ streamHandler })
}
