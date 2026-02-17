import type { Message } from '@latitude-data/constants/messages'
import {
  ChainStepResponse,
  MainSpanType,
  StreamType,
} from '@latitude-data/constants'
import { ChainError, RunErrorCodes } from '@latitude-data/constants/errors'
import { LatitudePromptConfig } from '@latitude-data/constants/latitudePromptSchema'
import { Adapters, Chain, Chain as PromptlChain, scan } from 'promptl-ai'
import { z } from 'zod'
import {
  EvaluationType,
  EvaluationV2,
  LLM_EVALUATION_PROMPT_PARAMETERS,
  LlmEvaluationMetric,
  LogSources,
  SpanType,
  SpanWithDetails,
} from '../../../constants'
import { formatConversation } from '../../../helpers'
import { Result } from '../../../lib/Result'
import { updatePromptMetadata } from '../../../lib/updatePromptMetadata'
import { type Commit } from '../../../schema/models/types/Commit'
import { type ProviderApiKey } from '../../../schema/models/types/ProviderApiKey'
import { WorkspaceDto } from '../../../schema/models/types/Workspace'
import {
  BACKGROUND,
  type LatitudeTelemetry,
  telemetry as realTelemetry,
} from '../../../telemetry'
import { runChain } from '../../chains/run'
import { parsePrompt } from '../../documents/parse'
import { estimateCost } from '../../ai'

const TO_MILLICENTS_FACTOR = 100_000

export function promptTask() {
  return `
<user>
  Based on the given instructions, evaluate the assistant response:
  \`\`\`
  {{ actualOutput }}
  \`\`\`

  For context, here is the full conversation:
  \`\`\`
  {{ conversation }}
  \`\`\`

  {{ if toolCalls?.length }}
    Also, here are the tool calls that the assistant requested:
    \`\`\`
    {{ toolCalls }}
    \`\`\`
  {{ else }}
    Also, the assistant did not request any tool calls.
  {{ endif }}

  Finally, here is some additional metadata about the conversation. It may or may not be relevant for the evaluation.
  - Cost: {{ cost }} cents.
  - Tokens: {{ tokens }} tokens.
  - Duration: {{ duration }} seconds.
</user>
`.trim()
}

export function buildEvaluationParameters({
  span,
  completionSpan,
  actualOutput,
  conversation,
  expectedOutput,
}: {
  span: SpanWithDetails<MainSpanType>
  completionSpan?: SpanWithDetails<SpanType.Completion>
  actualOutput: string
  conversation: Message[]
  expectedOutput?: string
}) {
  return {
    parameters:
      span.metadata && 'parameters' in span.metadata
        ? span.metadata.parameters
        : {},
    prompt:
      span.metadata && 'template' in span.metadata
        ? span.metadata.template
        : '',
    cost: completionSpan?.metadata?.cost,
    tokens: completionSpan?.metadata?.tokens,
    duration: completionSpan?.duration,
    actualOutput,
    ...(expectedOutput !== undefined && { expectedOutput }),
    conversation: formatConversation(conversation),
  }
}

export async function buildLlmEvaluationRunFunction<
  M extends LlmEvaluationMetric,
>({
  resultUuid,
  workspace,
  providers,
  evaluation,
  prompt,
  parameters,
  schema,
}: {
  resultUuid: string
  workspace: WorkspaceDto
  providers: Map<string, ProviderApiKey>
  evaluation: EvaluationV2<EvaluationType.Llm, M>
  prompt: string
  parameters?: Record<string, unknown>
  schema?: z.ZodType
}) {
  let promptConfig: LatitudePromptConfig
  let promptChain: PromptlChain
  try {
    if (schema) {
      prompt = updatePromptMetadata(prompt, {
        schema: z.toJSONSchema(schema, { target: 'openapi-3.0' }),
        structuredOutputs: true,
        strictJsonSchema: true,
      })
    }

    const ast = await parsePrompt(prompt).then((r) => r.unwrap())
    const result = await scan({
      prompt,
      serialized: ast,
      withParameters: LLM_EVALUATION_PROMPT_PARAMETERS as unknown as string[],
    })
    if (result.errors.length > 0) {
      return Result.error(
        new ChainError({
          code: RunErrorCodes.ChainCompileError,
          message: result.errors.join('\n'),
        }),
      )
    }

    promptConfig = result.config as LatitudePromptConfig
    promptChain = new Chain({
      serialized: { ast },
      prompt: prompt,
      parameters: parameters,
      includeSourceMap: true,
      adapter: Adapters.default,
    })
  } catch (error) {
    if (error instanceof ChainError) return Result.error(error)
    return Result.error(
      new ChainError({
        code: RunErrorCodes.ChainCompileError,
        message: (error as Error).message,
      }),
    )
  }

  const runArgs = {
    generateUUID: () => resultUuid,
    chain: promptChain,
    source: LogSources.Evaluation,
    promptSource: { ...evaluation, version: 'v2' as const },
    providersMap: providers,
    workspace: workspace,
  }

  return Result.ok({ promptChain, promptConfig, runArgs })
}

export async function runPrompt<
  M extends LlmEvaluationMetric,
  S extends z.ZodType = z.ZodType,
>({
  prompt,
  parameters,
  schema,
  resultUuid,
  evaluation,
  providers,
  commit,
  workspace,
  telemetry = realTelemetry,
}: {
  prompt: string
  parameters?: Record<string, unknown>
  schema?: S
  resultUuid: string
  evaluation: EvaluationV2<EvaluationType.Llm, M>
  providers: Map<string, ProviderApiKey>
  commit: Commit
  workspace: WorkspaceDto
  telemetry?: LatitudeTelemetry
}) {
  const { promptChain, promptConfig, runArgs } =
    await buildLlmEvaluationRunFunction({
      resultUuid,
      workspace,
      providers,
      evaluation,
      prompt,
      parameters,
      schema,
    }).then((r) => r.unwrap())

  const ctx = telemetry.context.setAttributes(
    BACKGROUND({ workspaceId: workspace.id }),
    {
      'latitude.documentLogUuid': resultUuid,
      'latitude.commitUuid': commit.uuid,
      'latitude.promptUuid': evaluation.uuid,
      'latitude.projectId': String(commit.projectId),
      'latitude.source': LogSources.Evaluation,
    },
  )
  const $prompt = telemetry.span.prompt(
    {
      template: prompt,
      parameters: parameters,
    },
    ctx,
  )

  let response
  let duration: number | undefined
  try {
    const result = runChain({ context: $prompt.context, ...runArgs })
    const error = await result.error
    if (error) throw error

    response = await result.response
    duration = await result.duration

    $prompt.end()
  } catch (error) {
    $prompt.fail(error as Error)

    if (error instanceof ChainError) throw error

    const e = error as Error
    throw new ChainError({
      code: RunErrorCodes.Unknown,
      message: e.message,
      details: {
        stack: e.stack || '',
      },
    })
  }

  if (!promptChain.completed) {
    throw new ChainError({
      code: RunErrorCodes.AIRunError,
      message: 'Evaluation conversation is not completed',
    })
  }

  if (!response) {
    throw new ChainError({
      code: RunErrorCodes.AIRunError,
      message: 'Evaluation conversation response missing',
    })
  }

  const verdict = parseVerdict({ response, schema })
  const provider = providers.get(promptConfig.provider)
  const tokenUsage = response.usage
  const totalTokens = tokenUsage?.totalTokens ?? 0
  const costInMillicents =
    provider && promptConfig.model && tokenUsage
      ? Math.floor(
          estimateCost({
            provider: provider.provider,
            model: promptConfig.model as string,
            usage: tokenUsage,
          }) * TO_MILLICENTS_FACTOR,
        )
      : 0

  const stats = {
    documentLogUuid: resultUuid,
    tokens: totalTokens,
    duration: duration ?? 0,
    costInMillicents,
  }

  return { response, stats, verdict }
}

function parseVerdict<T extends z.ZodTypeAny>({
  response,
  schema,
}: {
  response: ChainStepResponse<StreamType>
  schema?: T
}): z.infer<T> {
  if (response.streamType !== 'object') {
    throw new ChainError({
      code: RunErrorCodes.InvalidResponseFormatError,
      message: 'Evaluation conversation response is not an object',
    })
  }

  const object = response.object
  if (!schema) return response.object

  const result = schema.safeParse(object)
  if (!result.success) {
    throw new ChainError({
      code: RunErrorCodes.InvalidResponseFormatError,
      message: result.error.message,
    })
  }

  return result.data
}
