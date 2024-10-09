import { Chain } from '@latitude-data/compiler'

import { ProviderApiKey, Workspace } from '../../browser'
import {
  ChainEvent,
  ChainStepResponse,
  LogSources,
  RunErrorCodes,
  StreamType,
} from '../../constants'
import { generateUUIDIdentifier } from '../../lib/generateUUID'
import { ai } from '../ai'
import { ChainError } from './ChainErrors'
import { ChainStreamConsumer } from './ChainStreamConsumer'
import { consumeStream } from './ChainStreamConsumer/consumeStream'
import { ChainValidator, ConfigOverrides } from './ChainValidator'
import { ProviderProcessor } from './ProviderProcessor'

export type CachedApiKeys = Map<string, ProviderApiKey>

async function handleError(error: ChainError<RunErrorCodes>) {
  // TODO: Extract this into a service responsible of
  // saving the error in the database
  // AiError are a special case. We want to save the error inside
  // ProviderProcessor class that's where the error is catched.
  // We throw those error and they arrive here but we filter it
  // We do this because provider logs will have a pointer to the error
  // providerLog.error_id = error.id
  // This way is easier for use to know when a provider log has errors by
  // joining the tables and in the UI check if providerLog.error_id is not null
  //
  // Also this service will need `errorableType` and `errorableUuid`
  // this way we associate the polymorphic relationship with the error
  // to the run documentLog.uuid or evaluationResult.uuid
  return error
}

export async function runChain({
  workspace,
  chain,
  providersMap,
  source,
  generateUUID = generateUUIDIdentifier,
  configOverrides,
}: {
  workspace: Workspace
  chain: Chain
  generateUUID?: () => string
  source: LogSources
  providersMap: CachedApiKeys
  configOverrides?: ConfigOverrides
}) {
  // TODO: this hast to be renamed to errorableUuid
  // We want to link 2 different entities with the errors
  // the AI run produce: Document logs and Evaluation results
  const documentLogUuid = generateUUID()

  let responseResolve: (value: ChainStepResponse<StreamType>) => void

  const response = new Promise<ChainStepResponse<StreamType>>((resolve) => {
    responseResolve = resolve
  })

  const chainStartTime = Date.now()
  const stream = new ReadableStream<ChainEvent>({
    start(controller) {
      iterate({
        workspace,
        source,
        chain,
        providersMap,
        controller,
        documentLogUuid,
        configOverrides,
      })
        .then(responseResolve)
        .catch(async (e: ChainError<RunErrorCodes>) => {
          await handleError(e)
        })
    },
  })

  return {
    stream,
    response,
    resolvedContent: chain.rawText,
    documentLogUuid,
    duration: response.then(() => Date.now() - chainStartTime),
  }
}

async function iterate({
  workspace,
  source,
  chain,
  providersMap,
  controller,
  previousCount = 0,
  previousResponse,
  documentLogUuid,
  configOverrides,
}: {
  workspace: Workspace
  source: LogSources
  chain: Chain
  providersMap: CachedApiKeys
  controller: ReadableStreamDefaultController
  previousCount?: number
  documentLogUuid: string
  previousResponse?: ChainStepResponse<StreamType>
  configOverrides?: ConfigOverrides
}) {
  const prevText = previousResponse?.text
  const chainValidator = new ChainValidator({
    workspace,
    prevText,
    chain,
    providersMap,
    configOverrides,
  })
  const streamConsumer = new ChainStreamConsumer({
    controller,
    previousCount,
    documentLogUuid,
  })

  try {
    const step = await chainValidator.call().then((r) => r.unwrap())
    const { messageCount, stepStartTime } = streamConsumer.setup(step)
    const providerProcessor = new ProviderProcessor({
      source,
      documentLogUuid,
      config: step.config,
      apiProvider: step.provider,
      messages: step.conversation.messages,
      saveSyncProviderLogs: step.chainCompleted,
    })
    const aiResult = await ai({
      messages: step.conversation.messages,
      config: step.config,
      provider: step.provider,
      schema: step.schema,
      output: step.output,
    }).then((r) => r.unwrap())

    const aiStreamConsumedResult = await consumeStream({
      controller,
      result: aiResult,
    })
    const response = await providerProcessor.call({
      aiResult,
      streamConsumedResult: aiStreamConsumedResult,
      startTime: stepStartTime,
    })

    if (step.chainCompleted) {
      streamConsumer.chainCompleted({ step, response })
      return response
    } else {
      streamConsumer.stepCompleted(response)
      return iterate({
        workspace,
        source,
        chain,
        documentLogUuid,
        providersMap,
        controller,
        previousCount: messageCount,
        previousResponse: response,
        configOverrides,
      })
    }
  } catch (e: unknown) {
    const error = streamConsumer.chainError(e)
    throw error
  }
}
