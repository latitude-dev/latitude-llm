import { PromptConfig } from '@latitude-data/constants'
import { RunErrorCodes } from '@latitude-data/constants/errors'
import { Adapters, Chain as PromptlChain, scan } from 'promptl-ai'
import { z } from 'zod'
import {
  EvaluationType,
  EvaluationV2,
  LlmEvaluationMetric,
  LogSources,
  ProviderApiKey,
  Providers,
  Workspace,
} from '../../../browser'
import { database, Database } from '../../../client'
import { ChainError } from '../../../lib/chainStreamManager/ChainErrors'
import { ProviderLogsRepository } from '../../../repositories'
import { runChain } from '../../chains/run'

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
    schema?: S
    resultUuid: string
    evaluation: EvaluationV2<EvaluationType.Llm, M>
    providers: Map<string, ProviderApiKey>
    workspace: Workspace
  },
  db: Database = database,
) {
  let promptConfig
  let promptChain
  try {
    const result = await scan({ prompt })
    if (result.errors.length > 0) {
      throw new ChainError({
        code: RunErrorCodes.ChainCompileError,
        message: result.errors.join('\n'),
      })
    }

    promptConfig = result.config as PromptConfig
    promptChain = new PromptlChain({
      prompt: prompt,
      parameters: parameters,
      adapter: Adapters.default,
      includeSourceMap: true,
    })
  } catch (error) {
    if (error instanceof ChainError) throw error
    throw new ChainError({
      code: RunErrorCodes.ChainCompileError,
      message: (error as Error).message,
    })
  }

  let response
  try {
    const result = runChain({
      chain: promptChain,
      globalConfig: promptConfig,
      source: LogSources.Evaluation,
      promptlVersion: 1,
      persistErrors: false,
      generateUUID: () => resultUuid, // Note: this makes documentLogUuid = resultUuid
      promptSource: { ...evaluation, version: 'v2' as const },
      providersMap: providers,
      workspace: workspace,
    })

    const error = await result.error
    if (error) throw error

    response = await result.lastResponse
  } catch (error) {
    if (error instanceof ChainError) throw error
    throw new ChainError({
      code: RunErrorCodes.Unknown,
      message: (error as Error).message,
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

  if (response.streamType !== 'object') {
    throw new ChainError({
      code: RunErrorCodes.InvalidResponseFormatError,
      message: 'Evaluation conversation response is not an object',
    })
  }

  let verdict: S extends z.ZodSchema ? z.infer<S> : unknown = response.object
  if (schema) {
    const result = schema.safeParse(response.object)
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
