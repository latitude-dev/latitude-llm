import { Chain, MessageRole } from '@latitude-data/compiler'
import {
  ChainCallResponse,
  ChainEvent,
  ChainEventTypes,
  StreamEventTypes,
} from '@latitude-data/core'
import type { Commit, ProviderApiKey } from '@latitude-data/core/browser'
import { findWorkspaceFromCommit } from '$core/data-access'
import { NotFoundError, Result } from '$core/lib'
import { streamToGenerator } from '$core/lib/streamToGenerator'
import { ProviderApiKeysRepository } from '$core/repositories'

import { ai, AILog, validateConfig } from '../ai'
import { createChainAtCommit } from './createChainAtCommit'

export async function runDocumentAtCommit({
  documentUuid,
  commit,
  parameters,
  logHandler,
}: {
  documentUuid: string
  commit: Commit
  parameters: Record<string, unknown>
  logHandler: (log: AILog) => void
}) {
  const workspace = await findWorkspaceFromCommit(commit)
  if (!workspace) throw Result.error(new NotFoundError('Workspace not found'))

  const result = await createChainAtCommit({
    documentUuid,
    commit,
    parameters,
    workspace,
  })
  if (result.error) return result

  const chain = result.value
  const scope = new ProviderApiKeysRepository(workspace.id)

  let stream: ReadableStream
  let response: Promise<ChainCallResponse> | undefined = undefined

  await new Promise<void>((resolve) => {
    stream = new ReadableStream<ChainEvent>({
      start(controller) {
        response = iterate({ chain, scope, controller, logHandler })

        resolve()
      },
    })
  })

  return Result.ok({
    stream: stream!,
    response: response!,
  })
}

function enqueueEvent(
  controller: ReadableStreamDefaultController,
  event: ChainEvent,
) {
  controller.enqueue(event)
}

async function iterate({
  chain,
  previousApiKey,
  scope,
  controller,
  previousCount = 0,
  previousResponse,
  logHandler,
}: {
  chain: Chain
  scope: ProviderApiKeysRepository
  controller: ReadableStreamDefaultController
  previousCount?: number
  previousApiKey?: ProviderApiKey
  previousResponse?: {
    text: string
    usage: Record<string, unknown>
  }
  logHandler: (log: AILog) => void
}) {
  try {
    const {
      newMessagesInStep,
      conversation,
      completed,
      config,
      apiKey,
      sentCount,
    } = await doSomeCommonOperations({
      chain,
      previousResponse,
      scope,
      apiKey: previousApiKey,
      sentCount: previousCount,
    })

    enqueueEvent(controller, {
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
        messages: conversation.messages,
        config: config,
        provider: apiKey,
      },
      { logHandler },
    )

    for await (const value of streamToGenerator(result.fullStream)) {
      enqueueEvent(controller, {
        event: StreamEventTypes.Provider,
        data: value,
      })
    }

    // TODO: The type on `ai` package return a different definition for `toolCalls`
    // than `@latitude-data/compiler` package. We have to unify the naming.
    // For now no toolCalls
    const response = {
      text: await result.text,
      usage: await result.usage,
      toolCalls: (await result.toolCalls).map((t) => ({
        id: t.toolCallId,
        name: t.toolName,
        arguments: t.args,
      })),
    }

    if (completed) {
      enqueueEvent(controller, {
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
          response,
        },
      })

      controller.close()

      return response
    } else {
      enqueueEvent(controller, {
        event: StreamEventTypes.Latitude,
        data: {
          type: ChainEventTypes.StepComplete,
          response,
        },
      })
      return iterate({
        chain,
        scope,
        controller,
        previousApiKey: apiKey,
        previousCount: sentCount,
        previousResponse: response,
        logHandler,
      })
    }
  } catch (e) {
    const error = e as Error
    enqueueEvent(controller, {
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
    return {
      text: error.message,
      usage: {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
      },
      toolCalls: [],
    }
  }
}

/**
 *  Performs some common operations needed for processing an iteration step
 **/
async function doSomeCommonOperations({
  chain,
  previousResponse,
  scope,
  apiKey,
  sentCount,
}: {
  chain: Chain
  previousResponse?: { text: string; usage: Record<string, unknown> }
  scope: ProviderApiKeysRepository
  apiKey?: ProviderApiKey
  sentCount: number
}) {
  const { completed, conversation } = await chain.step(previousResponse?.text)
  const config = validateConfig(conversation.config)
  if (!apiKey || apiKey?.name !== conversation.config.apikey) {
    // TODO: Maybe cache this to avoid unnecessary calls
    apiKey = await findApiKey({ scope, name: config.provider })
  }

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

async function findApiKey({
  scope,
  name,
}: {
  scope: ProviderApiKeysRepository
  name: string
}) {
  const apiKeyResult = await scope.findByName(name)
  if (apiKeyResult.error) throw apiKeyResult.error

  return apiKeyResult.value!
}
