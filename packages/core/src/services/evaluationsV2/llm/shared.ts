// import { PromptConfig } from '@latitude-data/constants'
// import { RunErrorCodes } from '@latitude-data/constants/errors'
import { Adapters, Chain as PromptlChain, scan } from 'promptl-ai'
import { z } from 'zod'
import {
  EvaluationType,
  EvaluationV2,
  LlmEvaluationMetric,
  // LogSources,
  ProviderApiKey,
  Workspace,
} from '../../../browser'
import { database, Database } from '../../../client'
// import { ChainError } from '../../../lib/chainStreamManager/ChainErrors'
// import { ProviderLogsRepository } from '../../../repositories'
// import { runChain } from '../../chains/run'

export async function runPrompt<
  M extends LlmEvaluationMetric,
  S extends z.ZodSchema = z.ZodAny,
>(
  {
    prompt,
    parameters,
    // schema,
    // resultUuid,
    // evaluation,
    // providers,
    // workspace,
  }: {
    prompt: string
    parameters?: Record<string, unknown>
    schema?: S
    resultUuid: string
    evaluation: EvaluationV2<EvaluationType.Llm, M>
    providers: Map<string, ProviderApiKey>
    workspace: Workspace
  },
  _db: Database = database,
) {
  let promptConfig
  let promptChain
  try {
    promptConfig = (await scan({ prompt })).config // as PromptConfig
    promptChain = new PromptlChain({
      prompt: prompt,
      parameters: parameters,
      adapter: Adapters.default,
      includeSourceMap: true,
    })
  } catch (error) {
    // throw new ChainError({
    //   code: RunErrorCodes.ChainCompileError,
    //   message: (error as Error).message,
    // })
  }

  prompt
  promptConfig
  promptChain

  let response
  let error
  try {
    // const result = runChain({
    //   chain: promptChain,
    //   globalConfig: promptConfig,
    //   source: LogSources.Evaluation,
    //   promptlVersion: 1,
    //   persistErrors: false,
    //   generateUUID: () => resultUuid, // Note: this makes documentLogUuid = resultUuid
    //   promptSource: { ...evaluation, version: 'v2' as const },
    //   providersMap: providers,
    //   workspace: workspace,
    // })
    // response = await result.lastResponse
    // error = await result.error
  } catch (error) {
    // if (!(error instanceof ChainError)) {
    //   throw new ChainError({
    //     code: RunErrorCodes.Unknown,
    //     message: (error as Error).message,
    //   })
    // }
    // throw error
  }

  if (error) throw error

  // if (!promptChain.completed) {
  //   throw new ChainError({
  //     code: RunErrorCodes.AIRunError,
  //     message: 'Evaluation conversation is not completed',
  //   })
  // }

  // if (!response?.providerLog?.documentLogUuid) {
  //   throw new ChainError({
  //     code: RunErrorCodes.AIRunError,
  //     message: 'Evaluation conversation log not created',
  //   })
  // }

  // if (response.streamType !== 'object') {
  //   throw new ChainError({
  //     code: RunErrorCodes.InvalidResponseFormatError,
  //     message: 'Evaluation conversation response is not an object',
  //   })
  // }

  let verdict: S extends z.ZodSchema ? z.infer<S> : unknown = {} as any // response.object
  // if (schema) {
  //   const result = schema.safeParse(response.object)
  //   if (result.error) {
  //     throw new ChainError({
  //       code: RunErrorCodes.InvalidResponseFormatError,
  //       message: result.error.message,
  //     })
  //   }
  //   verdict = result.data
  // }

  // const repository = new ProviderLogsRepository(workspace.id, db)
  // const stats = await repository
  //   .statsByDocumentLogUuid('') // response.providerLog.documentLogUuid)
  //   .then((r) => r.unwrap())

  const stats = {
    documentLogUuid: '',
    tokens: 0,
    duration: 0,
    costInMillicents: 0,
  }

  return { response, stats, verdict }
}
