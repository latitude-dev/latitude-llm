import { ChainEvent } from '@latitude-data/constants'
import {
  EvaluationType,
  EvaluationV2,
  LlmEvaluationMetricAnyCustom,
  Workspace,
} from '../../../browser'
import { buildLlmEvaluationRunFunction } from './shared'
import { buildProvidersMap } from '../../providerApiKeys/buildMap'
import { Result, TypedResult } from '../../../lib/Result'
import { generateUUIDIdentifier } from '../../../lib/generateUUID'

const buildStreamHandler =
  (stream: ReadableStream<ChainEvent>) =>
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

        onFinished?.()
      } catch (err) {
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
    workspace,
    providers: await buildProvidersMap({ workspaceId: workspace.id }),
    evaluation,
    prompt: evaluation.configuration.prompt,
    parameters,
    runArgs: { generateUUID: () => resultUuid },
  })

  if (result.error) return result

  const { runFunction, runArgs } = result.value
  const { stream } = runFunction(runArgs)
  const streamHandler = buildStreamHandler(stream)

  return Result.ok({ streamHandler })
}
