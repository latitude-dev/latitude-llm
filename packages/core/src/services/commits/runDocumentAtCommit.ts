import { Chain } from '@latitude-data/compiler'
import {
  ChainEvent,
  ChainEventTypes,
  Commit,
  LATITUDE_EVENT,
  PROVIDER_EVENT,
  ProviderApiKey,
} from '$core/browser'
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
  let response: Promise<{ text: string; usage: Record<string, unknown> }>

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
    const { conversation, completed, config, apiKey, sentCount } =
      await doSomeCommonOperations({
        chain,
        previousResponse,
        scope,
        apiKey: previousApiKey,
        sentCount: previousCount,
      })

    controller.enqueue({
      data: {
        type: ChainEventTypes.Step,
        config: {
          provider: apiKey.provider,
        },
        ...conversation.config,
        messages: conversation.messages,
      },
      event: LATITUDE_EVENT,
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
      controller.enqueue({
        event: PROVIDER_EVENT,
        data: value,
      })
    }

    const response = {
      text: await result.text,
      usage: await result.usage,
    }

    if (completed) {
      controller.enqueue({
        event: LATITUDE_EVENT,
        data: {
          type: ChainEventTypes.Complete,
          config: conversation.config,
          messages: [
            {
              role: 'assistant',
              content: response.text,
            },
          ],
          usage: response.usage,
        },
      })

      controller.close()

      return response
    } else {
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
  } catch (error) {
    controller.error(error)

    throw error
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
    apiKey = await findApiKey({ scope, name: config.provider })
  }

  const msgs = conversation.messages.slice(sentCount)
  sentCount += msgs.length

  return { sentCount, apiKey, conversation, completed, config }
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
