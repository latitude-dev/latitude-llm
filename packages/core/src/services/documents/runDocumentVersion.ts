import path from 'path'

import {
  Chain,
  createChain,
  readMetadata,
  Document as RefDocument,
} from '@latitude-data/compiler'
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
import {
  DocumentVersionsRepository,
  ProviderApiKeysRepository,
} from '$core/repositories'
import { z } from 'zod'

import { ai } from '../ai'

export async function runDocumentVersion({
  documentUuid,
  commit,
  parameters,
}: {
  documentUuid: string
  commit: Commit
  parameters: Record<string, unknown>
}) {
  const workspace = await findWorkspaceFromCommit(commit)
  if (!workspace) throw new Error('Workspace not found')

  const scope = new ProviderApiKeysRepository(workspace.id)
  const documentScope = new DocumentVersionsRepository(workspace.id)
  const docs = await documentScope.getDocumentsAtCommit(commit)
  if (docs.error) return Result.error(docs.error)

  const document = docs.value.find((d) => d.documentUuid === documentUuid)
  if (!document) return Result.error(new NotFoundError('Document not found'))

  let resolvedContent: string = document.resolvedContent!

  if (document.resolvedContent === undefined || commit.mergedAt === null) {
    const referenceFn = async (
      refPath: string,
      from?: string,
    ): Promise<RefDocument | undefined> => {
      const fullPath = path
        .resolve(path.dirname(`/${from ?? ''}`), refPath)
        .replace(/^\//, '')

      const document = docs.value.find((d) => d.path === fullPath)
      if (!document) return undefined

      return {
        path: fullPath,
        content: document.content,
      }
    }

    const metadata = await readMetadata({
      prompt: document.content,
      fullPath: document.path,
      referenceFn,
    })

    resolvedContent = metadata.resolvedPrompt
  }

  const chain = createChain({ prompt: resolvedContent, parameters })

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
  previousApiKey,
  scope,
  controller,
  previousCount = 0,
  previousResponse,
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

    const result = await ai({
      messages: conversation.messages,
      apiKey: apiKey.token,
      provider: apiKey.provider,
      model: config.model,
    })

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
      })
    }
  } catch (error) {
    controller.error(error)

    throw error
  }
}

export function validateConfig(config: Record<string, unknown>) {
  const configSchema = z.object({
    model: z.string(),
    provider: z.string(),
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
