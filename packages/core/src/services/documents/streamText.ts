import { Chain, Config, createChain, Message } from '@latitude-data/compiler'
import ai from '$core/ai'
import { DocumentVersion, ProviderApiKey } from '$core/browser'
import { findWorkspaceFromDocument } from '$core/data-access'
import { Result } from '$core/lib'
import { ProviderApiKeysRepository } from '$core/repositories'
import { CompletionTokenUsage } from 'ai'
import { z } from 'zod'

export const PROVIDER_EVENT = 'provider-event'
export const LATITUDE_EVENT = 'latitude-event'

export enum ChainEventTypes {
  Step = 'chain-step',
  Complete = 'chain-complete',
}

type ChainEvent = {
  data: {
    type: ChainEventTypes
    config: Config
    messages: Message[]
    response?: { text: string; usage: CompletionTokenUsage }
  }
  event: typeof LATITUDE_EVENT
}

export async function streamText({
  document,
  parameters,
}: {
  document: DocumentVersion
  parameters: Record<string, unknown>
}) {
  const workspace = await findWorkspaceFromDocument(document)
  if (!workspace) throw new Error('Workspace not found')

  const scope = new ProviderApiKeysRepository(workspace.id)
  const chain = createChain({ prompt: document.content, parameters })

  let stream: ReadableStream
  let response: Promise<{ text: string; usage: Record<string, unknown> }>

  await new Promise<void>((resolve) => {
    stream = new ReadableStream<ChainEvent>({
      start(controller) {
        response = iterate({ chain, scope, controller })

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
  apiKey,
  scope,
  controller,
  sentCount = 0,
  lastResponse,
}: {
  chain: Chain
  scope: ProviderApiKeysRepository
  controller: ReadableStreamDefaultController
  sentCount?: number
  apiKey?: ProviderApiKey
  lastResponse?: {
    text: string
    usage: Record<string, unknown>
  }
}) {
  try {
    const { completed, conversation } = await chain.step(lastResponse?.text)
    const config = validateConfig(conversation.config)
    if (!apiKey || apiKey?.name !== conversation.config.apikey) {
      apiKey = await findApiKey({ scope, name: config.apiKey })
    }

    const msgs = conversation.messages.slice(sentCount)
    sentCount += msgs.length

    controller.enqueue({
      data: {
        type: ChainEventTypes.Step,
        config: conversation.config,
        messages: msgs,
      },
      event: LATITUDE_EVENT,
    })

    const result = await ai({
      messages: conversation.messages,
      apiKey: apiKey.token,
      provider: apiKey.provider,
      model: config.model,
    })

    const reader = result.fullStream.getReader()
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      controller.enqueue({
        data: value,
        event: PROVIDER_EVENT,
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
          response,
        },
      })

      controller.close()

      return response
    } else {
      return iterate({
        chain,
        scope,
        controller,
        apiKey,
        sentCount,
        lastResponse: response,
      })
    }
  } catch (error) {
    controller.error(error)
    controller.close()

    return {
      text: `ERROR: ${(error as Error).message}`,
      usage: {},
    }
  }
}

function validateConfig(config: Record<string, unknown>) {
  const configSchema = z.object({
    model: z.string(),
    apiKey: z.string(),
  })

  return configSchema.parse(config)
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
