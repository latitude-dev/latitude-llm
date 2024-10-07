import { Chain, Message, MessageRole } from '@latitude-data/compiler'
import { CoreTool, ObjectStreamPart, TextStreamPart } from 'ai'
import { JSONSchema7 } from 'json-schema'
import { v4 } from 'uuid'

import { ProviderApiKey, Workspace } from '../../browser'
import {
  ChainEvent,
  ChainEventTypes,
  ChainStepResponse,
  LogSources,
  ProviderData,
  RunErrorCodes,
  StreamEventTypes,
  StreamType,
} from '../../constants'
import { streamToGenerator } from '../../lib/streamToGenerator'
import { ai, AIReturn, Config } from '../ai'
import { ChainError } from './ChainErrors'
import { ChainValidator, ValidatedStep } from './ChainValidator'
import { ProviderProcessor } from './ProviderProcessor'

export type CachedApiKeys = Map<string, ProviderApiKey>
type ConfigOverrides =
  | {
      schema: JSONSchema7
      output: 'object' | 'array'
    }
  | { output: 'no-schema' }

export async function runChain({
  workspace,
  chain,
  providersMap,
  source,
  generateUUID = v4,
  configOverrides,
}: {
  workspace: Workspace
  chain: Chain
  generateUUID?: () => string
  source: LogSources
  providersMap: CachedApiKeys
  configOverrides?: ConfigOverrides
}) {
  const documentLogUuid = generateUUID()

  let responseResolve: (value: ChainStepResponse<StreamType>) => void
  let responseReject: (error: ChainError<RunErrorCodes>) => void

  const response = new Promise<ChainStepResponse<StreamType>>(
    (resolve, reject) => {
      responseResolve = resolve
      responseReject = reject
    },
  )

  const startTime = Date.now()
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
        .catch(responseReject)
    },
  })

  return {
    stream,
    response,
    resolvedContent: chain.rawText,
    documentLogUuid,
    duration: response.then(() => Date.now() - startTime),
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
  const stepValidator = new ChainValidator({ prevText, chain, providersMap })
  const step = await stepValidator.call().then((r) => r.unwrap())

  try {
    const newMessagesInStep = step.conversation.messages.slice(previousCount)
    const sentCount = previousCount + newMessagesInStep.length
    publishStepStartEvent(controller, step, newMessagesInStep, documentLogUuid)

    const providerProcessor = new ProviderProcessor({
      source,
      documentLogUuid,
      config: step.config,
      apiProvider: step.provider,
      messages: step.conversation.messages,
    })
    const aiResult = await ai({
      workspace,
      messages: step.conversation.messages,
      config: step.config,
      provider: step.provider,
      schema: getSchemaForAI(step, configOverrides),
      output: getOutputForAI(step, configOverrides),
    })

    await streamAIResult(controller, aiResult)
    const response = await providerProcessor.call({
      aiResult,
      saveSyncProviderLogs: step.chainCompleted,
    })

    if (step.chainCompleted) {
      await handleCompletedChain(controller, step, response)

      return response
    } else {
      publishStepCompleteEvent(controller, response)

      return iterate({
        workspace,
        source,
        chain,
        documentLogUuid,
        providersMap,
        controller,
        previousCount: sentCount,
        previousResponse: response,
        configOverrides,
      })
    }
  } catch (e: unknown) {
    const error =
      e instanceof ChainError
        ? e
        : new ChainError({
            code: RunErrorCodes.Unknown,
            message: (e as Error).message,
          })

    enqueueChainEvent(controller, {
      event: StreamEventTypes.Latitude,
      data: {
        type: ChainEventTypes.Error,
        error: {
          name: error.name,
          message: error.message,
          stack: error.stack,
        },
      },
    })
    controller.close()

    throw error
  }
}

function getSchemaForAI(
  step: ValidatedStep,
  configOverrides?: ConfigOverrides,
) {
  return step.chainCompleted
    ? // @ts-expect-error - schema does not exist in some types of configOverrides which is fine
      configOverrides?.schema || step.config.schema
    : undefined
}

function getOutputForAI(
  step: ValidatedStep,
  configOverrides?: ConfigOverrides,
) {
  return step.chainCompleted
    ? configOverrides?.output || step.config.schema?.type || 'no-schema'
    : undefined
}

function publishStepStartEvent(
  controller: ReadableStreamDefaultController,
  stepResult: ValidatedStep,
  newMessagesInStep: Message[],
  documentLogUuid?: string,
) {
  enqueueChainEvent(controller, {
    data: {
      type: ChainEventTypes.Step,
      isLastStep: stepResult.chainCompleted,
      config: stepResult.conversation.config as Config,
      messages: newMessagesInStep,
      documentLogUuid,
    },
    event: StreamEventTypes.Latitude,
  })
}

async function streamAIResult(
  controller: ReadableStreamDefaultController,
  result: Awaited<AIReturn<StreamType>>,
) {
  for await (const value of streamToGenerator<
    TextStreamPart<Record<string, CoreTool>> | ObjectStreamPart<unknown>
  >(result.data.fullStream)) {
    enqueueChainEvent(controller, {
      event: StreamEventTypes.Provider,
      data: value as unknown as ProviderData,
    })
  }
}

async function handleCompletedChain(
  controller: ReadableStreamDefaultController,
  stepResult: ValidatedStep,
  response: ChainStepResponse<StreamType>,
) {
  enqueueChainEvent(controller, {
    event: StreamEventTypes.Latitude,
    data: {
      type: ChainEventTypes.Complete,
      config: stepResult.conversation.config as Config,
      documentLogUuid: response.documentLogUuid,
      response,
      messages: [
        {
          role: MessageRole.assistant,
          toolCalls:
            response.streamType === 'text' ? response.toolCalls || [] : [],
          content: buildContent(response),
        },
      ],
    },
  })

  controller.close()
}

function publishStepCompleteEvent(
  controller: ReadableStreamDefaultController,
  response: ChainStepResponse<StreamType>,
) {
  enqueueChainEvent(controller, {
    event: StreamEventTypes.Latitude,
    data: {
      type: ChainEventTypes.StepComplete,
      documentLogUuid: response.documentLogUuid,
      response: response,
    },
  })
}

function buildContent(response: ChainStepResponse<StreamType>) {
  if (response.streamType === 'text') {
    if (response.text && response.text.length > 0) return response.text
    if (response.toolCalls?.length > 0) {
      return `Tool calls requested:
${JSON.stringify(response.toolCalls, null, 2)}
      `
    }

    return response.text || ''
  }

  return ''
}

export function enqueueChainEvent(
  controller: ReadableStreamDefaultController,
  event: ChainEvent,
) {
  controller.enqueue(event)
}
