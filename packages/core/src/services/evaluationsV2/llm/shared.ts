import {
  AGENT_RETURN_TOOL_NAME,
  ChainStepResponse,
  StreamType,
} from '@latitude-data/constants'
import { LatitudePromptConfig } from '@latitude-data/constants/latitudePromptSchema'
import { ChainError, RunErrorCodes } from '@latitude-data/constants/errors'
import { scan } from 'promptl-ai'
import { z } from 'zod'
import { zodToJsonSchema } from 'zod-to-json-schema'
import {
  DocumentType,
  EvaluationType,
  EvaluationV2,
  LLM_EVALUATION_PROMPT_PARAMETERS,
  LlmEvaluationMetric,
  LogSources,
  ProviderApiKey,
  Providers,
  Workspace,
} from '../../../browser'
import { database, Database } from '../../../client'
import { Result } from '../../../lib/Result'
import { ProviderLogsRepository } from '../../../repositories'
import { runAgent } from '../../agents/run'
import { runChain } from '../../chains/run'
import { createPromptlChain } from '../../../utils/promptlChain/createFromWorker'

export function promptTask({ provider }: { provider: ProviderApiKey }) {
  return `
${provider.provider === Providers.Anthropic ? '<user>' : ''}

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

${provider.provider === Providers.Anthropic ? '</user>' : ''}
`.trim()
}

export async function buildLlmEvaluationRunFunction<
  M extends LlmEvaluationMetric,
>({
  workspace,
  providers,
  evaluation,
  prompt,
  parameters,
  schema,
  runArgs: inputRunArgs = {},
}: {
  workspace: Workspace
  providers: Map<string, ProviderApiKey>
  evaluation: EvaluationV2<EvaluationType.Llm, M>
  prompt: string
  parameters?: Record<string, unknown>
  schema: z.ZodSchema
  runArgs?: {
    generateUUID?: () => string
  }
}) {
  let promptConfig: LatitudePromptConfig
  let promptChain
  try {
    const result = await scan({
      prompt: prompt,
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

    promptConfig = {
      ...result.config,
      ...(schema && { schema: zodToJsonSchema(schema, { target: 'openAi' }) }),
    } as LatitudePromptConfig
    promptChain = await createPromptlChain({
      prompt: prompt,
      parameters: parameters,
      includeSourceMap: true,
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
    ...inputRunArgs,
    chain: promptChain,
    globalConfig: promptConfig,
    configOverrides: schema
      ? {
          schema: zodToJsonSchema(schema, { target: 'openAi' }),
          output: 'object' as const,
        }
      : undefined,
    source: LogSources.Evaluation,
    promptlVersion: 1,
    persistErrors: false as false, // Note: required so TypeScript doesn't infer true
    promptSource: { ...evaluation, version: 'v2' as const },
    providersMap: providers,
    workspace: workspace,
  }

  const isAgent = promptConfig.type === DocumentType.Agent
  const runFunction = isAgent ? runAgent : runChain

  return Result.ok({ promptChain, promptConfig, runFunction, runArgs })
}

export async function runPrompt<
  M extends LlmEvaluationMetric,
  S extends z.ZodSchema = z.ZodAny,
>(
  {
    prompt,
    parameters,
    schema,
    resultUuid,
    evaluation,
    providers,
    workspace,
  }: {
    prompt: string
    parameters?: Record<string, unknown>
    schema: S
    resultUuid: string
    evaluation: EvaluationV2<EvaluationType.Llm, M>
    providers: Map<string, ProviderApiKey>
    workspace: Workspace
  },
  db: Database = database,
) {
  const { promptChain, promptConfig, runFunction, runArgs } =
    await buildLlmEvaluationRunFunction({
      workspace,
      providers,
      evaluation,
      prompt,
      parameters,
      schema,
      runArgs: {
        generateUUID: () => resultUuid, // Note: this makes documentLogUuid = resultUuid
      },
    }).then((r) => r.unwrap())

  let response
  try {
    const result = runFunction(runArgs)
    const error = await result.error
    if (error) throw error

    response = await result.lastResponse
  } catch (error) {
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

  if (!response?.providerLog?.documentLogUuid) {
    throw new ChainError({
      code: RunErrorCodes.AIRunError,
      message: 'Evaluation conversation log not created',
    })
  }

  let verdict: S extends z.ZodSchema ? z.infer<S> : unknown
  verdict = parseVerdict(response, promptConfig.type as DocumentType)

  if (schema) {
    const result = schema.safeParse(verdict)
    if (result.error) {
      throw new ChainError({
        code: RunErrorCodes.InvalidResponseFormatError,
        message: result.error.message,
      })
    }

    verdict = result.data
  }

  const repository = new ProviderLogsRepository(workspace.id, db)
  const stats = await repository
    .statsByDocumentLogUuid(response.providerLog.documentLogUuid)
    .then((r) => r.unwrap())

  return { response, stats, verdict }
}

function parseVerdict(
  response: ChainStepResponse<StreamType>,
  type?: DocumentType,
): any {
  if (type === DocumentType.Agent) {
    if (
      response.streamType !== 'text' ||
      response.toolCalls[0]?.name !== AGENT_RETURN_TOOL_NAME
    ) {
      throw new ChainError({
        code: RunErrorCodes.InvalidResponseFormatError,
        message: 'Evaluation conversation response is not an agent return call',
      })
    }

    return response.toolCalls[0].arguments
  }

  if (response.streamType !== 'object') {
    throw new ChainError({
      code: RunErrorCodes.InvalidResponseFormatError,
      message: 'Evaluation conversation response is not an object',
    })
  }

  return response.object
}
