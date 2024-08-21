import { Chain, createChain, MessageRole } from '@latitude-data/compiler'
import {
  ChainCallResponse,
  ChainEvent,
  ChainEventTypes,
  StreamEventTypes,
} from '@latitude-data/core'
import type {
  Commit,
  DocumentVersion,
  ProviderApiKey,
  Workspace,
} from '@latitude-data/core/browser'
import { NotFoundError, Result, UnprocessableEntityError } from '$core/lib'
import { streamToGenerator } from '$core/lib/streamToGenerator'
import { ProviderApiKeysRepository } from '$core/repositories'
import { v4 as uuid } from 'uuid'
import { ZodError } from 'zod'

import { ai, AILog, validateConfig } from '../ai'
import { getResolvedContent } from '../documents/getResolvedContent'

type CachedApiKeys = Map<string, ProviderApiKey>
async function cacheApiKeysByName({ workspaceId }: { workspaceId: number }) {
  const scope = new ProviderApiKeysRepository(workspaceId)
  const result = await scope.findAll().then((r) => r.unwrap())

  return result.reduce((acc, apiKey) => {
    acc.set(apiKey.name, apiKey)
    return acc
  }, new Map<string, ProviderApiKey>())
}

export function enqueueChainEvent(
  controller: ReadableStreamDefaultController,
  event: ChainEvent,
) {
  controller.enqueue(event)
}

export async function runDocumentAtCommit({
  workspaceId,
  document,
  commit,
  parameters,
  providerLogHandler,
  generateUUID = uuid,
}: {
  workspaceId: Workspace['id']
  document: DocumentVersion
  commit: Commit
  parameters: Record<string, unknown>
  providerLogHandler: (log: AILog) => void
  generateUUID?: typeof uuid
}) {
  const result = await getResolvedContent({
    workspaceId,
    document,
    commit,
  })

  if (result.error) return result

  const resolvedContent = result.value
  const chain = createChain({ prompt: resolvedContent, parameters })
  const documentLogUuid = generateUUID()

  let responseResolve: (value: ChainCallResponse) => void
  let responseReject: (reason?: any) => void

  const response = new Promise<ChainCallResponse>((resolve, reject) => {
    responseResolve = resolve
    responseReject = reject
  })

  const allApiKeys = await cacheApiKeysByName({ workspaceId })
  const stream = new ReadableStream<ChainEvent>({
    start(controller) {
      iterate({
        chain,
        allApiKeys,
        controller,
        providerLogHandler,
        documentLogUuid,
      })
        .then(responseResolve)
        .catch(responseReject)
    },
  })

  // Dummy handling of the response
  // This is helpful for not throwing the error
  // when no one is listening to the promise
  response.then(() => {}).catch(() => {})

  return Result.ok({
    stream,
    response,
    resolvedContent: result.value,
    documentLogUuid,
  })
}

async function iterate({
  chain,
  previousApiKey,
  allApiKeys,
  controller,
  previousCount = 0,
  previousResponse,
  providerLogHandler,
  documentLogUuid,
}: {
  chain: Chain
  allApiKeys: CachedApiKeys
  controller: ReadableStreamDefaultController
  previousCount?: number
  previousApiKey?: ProviderApiKey
  documentLogUuid: string
  previousResponse?: {
    text: string
    usage: Record<string, unknown>
  }
  providerLogHandler: (log: AILog) => void
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
      allApiKeys,
      apiKey: previousApiKey,
      sentCount: previousCount,
    })

    enqueueChainEvent(controller, {
      data: {
        type: ChainEventTypes.Step,
        isLastStep: completed,
        config: {
          provider: apiKey.provider,
        },
        messages: newMessagesInStep,
      },
      event: StreamEventTypes.Latitude,
    })

    const result = await ai(
      {
        documentLogUuid,
        messages: conversation.messages,
        config: config,
        provider: apiKey,
      },
      {
        providerLogHandler,
      },
    )

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
          config: conversation.config,
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
        chain,
        documentLogUuid,
        allApiKeys,
        controller,
        previousApiKey: apiKey,
        previousCount: sentCount,
        previousResponse: response,
        providerLogHandler,
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
  allApiKeys,
  previousResponse,
  apiKey,
  sentCount,
}: {
  chain: Chain
  allApiKeys: CachedApiKeys
  previousResponse?: { text: string; usage: Record<string, unknown> }
  apiKey?: ProviderApiKey
  sentCount: number
}) {
  const { completed, conversation } = await chain.step(previousResponse?.text)
  const config = validateConfig(conversation.config)
  apiKey = findApiKey({ allApiKeys, name: config.provider })

  // Only new message are sent in each step
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
  allApiKeys,
  name,
}: {
  allApiKeys: CachedApiKeys
  name: string
}) {
  const apiKey = allApiKeys.get(name)

  if (!apiKey) {
    throw new NotFoundError('ProviderApiKey not found')
  }

  return apiKey
}
