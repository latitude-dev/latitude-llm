import { Message } from '@latitude-data/compiler'
import { env } from '@latitude-data/env'
import { setupJobs } from '@latitude-data/jobs'
import {
  CallWarning,
  CompletionTokenUsage,
  CoreMessage,
  FinishReason,
  jsonSchema,
  streamObject,
  streamText,
} from 'ai'
import { JSONSchema7 } from 'json-schema'
import { v4 } from 'uuid'

import {
  LogSources,
  ProviderApiKey,
  ProviderLog,
  Workspace,
} from '../../browser'
import { cache } from '../../cache'
import { publisher } from '../../events/publisher'
import { createProviderLog } from '../providerLogs/create'
import { createProvider, PartialConfig } from './helpers'

const DEFAULT_PROVIDER_MAX_RUNS = 100

export type FinishCallbackEvent = {
  finishReason: FinishReason
  usage: CompletionTokenUsage
  text: string
  toolCalls?:
    | {
        type: 'tool-call'
        toolCallId: string
        toolName: string
        args: any
      }[]
    | undefined
  toolResults?: never[] | undefined
  rawResponse?: {
    headers?: Record<string, string>
  }
  warnings?: CallWarning[]
}
export type FinishCallback = (event: FinishCallbackEvent) => void

export async function ai({
  workspace,
  provider: apiProvider,
  prompt,
  messages,
  config,
  documentLogUuid,
  source,
  schema,
  output,
  transactionalLogs = false,
}: {
  workspace: Workspace
  provider: ProviderApiKey
  config: PartialConfig
  messages: Message[]
  documentLogUuid?: string
  source: LogSources
  prompt?: string
  schema?: JSONSchema7
  output?: 'object' | 'array' | 'no-schema'
  transactionalLogs?: boolean
}) {
  await checkDefaultProviderUsage({ provider: apiProvider, workspace })

  const startTime = Date.now()
  const { provider, token: apiKey } = apiProvider
  const model = config.model
  const m = createProvider({ provider, apiKey, config })(model)
  const commonOptions = {
    model: m,
    prompt,
    messages: messages as CoreMessage[],
  }
  const { onFinish, providerLog } = createFinishHandler({
    isStructured: false,
    startTime,
    apiProvider,
    source,
    documentLogUuid,
    messages,
    config,
    transactionalLogs,
  })

  if (schema && output) {
    const result = await streamObject({
      ...commonOptions,
      schema: jsonSchema(schema),
      // @ts-expect-error - output is valid but depending on the type of schema
      // there might be a mismatch (e.g you pass an object schema but the
      // output is "array"). Not really an issue we need to defend atm.
      output,
      onFinish,
    })

    return {
      fullStream: result.fullStream,
      object: result.object,
      usage: result.usage,
      providerLog,
    }
  } else {
    const result = await streamText({
      ...commonOptions,
      onFinish,
    })

    return {
      fullStream: result.fullStream,
      text: result.text,
      usage: result.usage,
      toolCalls: result.toolCalls,
      providerLog,
    }
  }
}

const checkDefaultProviderUsage = async ({
  provider,
  workspace,
}: {
  provider: ProviderApiKey
  workspace: Workspace
}) => {
  if (provider.token === env.DEFAULT_PROVIDER_API_KEY) {
    const c = await cache()
    const value = await c.incr(
      `workspace:${workspace.id}:defaultProviderRunCount`,
    )

    if (value > DEFAULT_PROVIDER_MAX_RUNS) {
      throw new Error('You have exceeded your maximum number of free runs')
    }
  }
}

const createFinishHandler = ({
  isStructured,
  startTime,
  apiProvider,
  source,
  messages,
  config,
  transactionalLogs,
  documentLogUuid,
}: {
  isStructured: boolean
  startTime: number
  apiProvider: ProviderApiKey
  source: LogSources
  messages: Message[]
  config: PartialConfig
  transactionalLogs: boolean
  documentLogUuid?: string
}) => {
  let resolveProviderLog: (value?: ProviderLog) => void
  const providerLogPromise = new Promise<ProviderLog | undefined>((resolve) => {
    resolveProviderLog = resolve
  })

  return {
    providerLog: providerLogPromise,
    onFinish: async (event: any) => {
      const commonData = {
        uuid: v4(),
        source,
        generatedAt: new Date(),
        documentLogUuid,
        providerId: apiProvider.id,
        providerType: apiProvider.provider,
        model: config.model,
        config,
        messages,
        toolCalls: event.toolCalls?.map((t: any) => ({
          id: t.toolCallId,
          name: t.toolName,
          arguments: t.args,
        })),
        usage: event.usage,
        duration: Date.now() - startTime,
      }

      const payload = {
        type: 'aiProviderCallCompleted' as 'aiProviderCallCompleted',
        data: {
          ...commonData,
          responseText: event.text,
          responseObject: isStructured ? event.object : undefined,
        },
      }

      publisher.publishLater({
        type: payload.type,
        data: {
          ...payload.data,
          workspaceId: apiProvider.workspaceId,
        },
      })

      if (transactionalLogs) {
        const providerLog = await createProviderLog(payload.data).then((r) =>
          r.unwrap(),
        )
        resolveProviderLog(providerLog)
      } else {
        const queues = await setupJobs()
        queues.defaultQueue.jobs.enqueueCreateProviderLogJob(payload.data)
        resolveProviderLog()
      }
    },
  }
}

export { estimateCost } from './estimateCost'
export { validateConfig } from './helpers'
export type { PartialConfig, Config } from './helpers'
