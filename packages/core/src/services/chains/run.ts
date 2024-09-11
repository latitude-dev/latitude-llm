import { Chain, MessageRole } from '@latitude-data/compiler'
import { v4 } from 'uuid'
import { ZodError } from 'zod'

import { ProviderApiKey } from '../../browser'
import {
  ChainCallResponse,
  ChainEvent,
  ChainEventTypes,
  LogSources,
  StreamEventTypes,
} from '../../constants'
import { NotFoundError, Result, UnprocessableEntityError } from '../../lib'
import { streamToGenerator } from '../../lib/streamToGenerator'
import { ai, Config, validateConfig } from '../ai'

export type CachedApiKeys = Map<string, ProviderApiKey>

export async function runChain({
  chain,
  apikeys,
  source,
  generateUUID = v4,
}: {
  chain: Chain
  generateUUID?: () => string
  source: LogSources
  apikeys: CachedApiKeys
}) {
  const documentLogUuid = generateUUID()

  let responseResolve: (value: ChainCallResponse) => void
  let responseReject: (reason?: any) => void

  const response = new Promise<ChainCallResponse>((resolve, reject) => {
    responseResolve = resolve
    responseReject = reject
  })

  const startTime = Date.now()
  const stream = new ReadableStream<ChainEvent>({
    start(controller) {
      iterate({
        source,
        chain,
        apikeys,
        controller,
        documentLogUuid,
      })
        .then(responseResolve)
        .catch(responseReject)
    },
  })

  return Result.ok({
    stream,
    response,
    resolvedContent: chain.rawText,
    documentLogUuid,
    duration: response.then(() => Date.now() - startTime),
  })
}

async function iterate({
  source,
  chain,
  previousApiKey,
  apikeys,
  controller,
  previousCount = 0,
  previousResponse,
  documentLogUuid,
}: {
  source: LogSources
  chain: Chain
  apikeys: CachedApiKeys
  controller: ReadableStreamDefaultController
  previousCount?: number
  previousApiKey?: ProviderApiKey
  documentLogUuid: string
  previousResponse?: {
    text: string
    usage: Record<string, unknown>
  }
}) {
  try {
    const {
      newMessagesInStep,
      conversation,
      completed,
      config,
      apiKey,
      sentCount,
    } = await doChainStep({
      chain,
      previousResponse,
      apikeys,
      apiKey: previousApiKey,
      sentCount: previousCount,
    })

    enqueueChainEvent(controller, {
      data: {
        type: ChainEventTypes.Step,
        isLastStep: completed,
        config: conversation.config as Config,
        messages: newMessagesInStep,
      },
      event: StreamEventTypes.Latitude,
    })

    const result = await ai({
      source,
      documentLogUuid,
      messages: conversation.messages,
      config: config,
      provider: apiKey,
    })

    for await (const value of streamToGenerator(result.fullStream)) {
      enqueueChainEvent(controller, {
        event: StreamEventTypes.Provider,
        data: value,
      })
    }

    // TODO: The type on `ai` package return a different definition for `toolCalls`
    // than `@latitude-data/compiler` package. We have to unify the naming.
    // For now no toolCalls
    const response: ChainCallResponse = {
      documentLogUuid,
      text: await result.text,
      usage: await result.usage,
      toolCalls: (await result.toolCalls).map((t) => ({
        id: t.toolCallId,
        name: t.toolName,
        arguments: t.args,
      })),
    }

    if (completed) {
      const completedResponse = {
        ...response,
        documentLogUuid,
      }
      enqueueChainEvent(controller, {
        event: StreamEventTypes.Latitude,
        data: {
          type: ChainEventTypes.Complete,
          config: conversation.config as Config,
          messages: [
            {
              role: MessageRole.assistant,
              toolCalls: response.toolCalls,
              content: response.text,
            },
          ],
          response: completedResponse,
        },
      })

      controller.close()

      return completedResponse
    } else {
      enqueueChainEvent(controller, {
        event: StreamEventTypes.Latitude,
        data: {
          type: ChainEventTypes.StepComplete,
          response,
        },
      })
      return iterate({
        source,
        chain,
        documentLogUuid,
        apikeys,
        controller,
        previousApiKey: apiKey,
        previousCount: sentCount,
        previousResponse: response,
      })
    }
  } catch (e) {
    const error = e as Error
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

    if (error instanceof ZodError) {
      throw new UnprocessableEntityError(
        'Error validating document configuration',
        error.formErrors.fieldErrors,
      )
    } else {
      throw error
    }
  }
}

/**
 *  Performs some common operations needed for processing an iteration step
 **/
async function doChainStep({
  chain,
  apikeys,
  previousResponse,
  apiKey,
  sentCount,
}: {
  chain: Chain
  apikeys: CachedApiKeys
  previousResponse?: { text: string; usage: Record<string, unknown> }
  apiKey?: ProviderApiKey
  sentCount: number
}) {
  const { completed, conversation } = await chain.step(previousResponse?.text)
  const config = validateConfig(conversation.config)
  apiKey = findApiKey({ apikeys, name: config.provider })

  const newMessagesInStep = conversation.messages.slice(sentCount)
  sentCount += newMessagesInStep.length

  return {
    sentCount,
    apiKey,
    conversation,
    completed,
    config,
    newMessagesInStep,
  }
}

function findApiKey({
  apikeys,
  name,
}: {
  apikeys: CachedApiKeys
  name: string
}) {
  const apiKey = apikeys.get(name)

  if (!apiKey) {
    throw new NotFoundError('ProviderApiKey not found')
  }

  return apiKey
}

export function enqueueChainEvent(
  controller: ReadableStreamDefaultController,
  event: ChainEvent,
) {
  controller.enqueue(event)
}
