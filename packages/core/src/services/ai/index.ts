import { Message } from '@latitude-data/compiler'
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

import { LogSources, ProviderApiKey } from '../../browser'
import {
  createProviderLog,
  CreateProviderLogProps,
} from '../providerLogs/create'
import { createProvider, PartialConfig } from './helpers'

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

export type AILog = Omit<CreateProviderLogProps, 'apiKeyId' | 'source'>
export async function ai({
  provider: apiProvider,
  prompt,
  messages,
  config,
  documentLogUuid,
  source,
  schema = config.schema,
  output = config.schema?.type || 'no-schema',
  transactionalLogs = false,
  onFinish,
}: {
  provider: ProviderApiKey
  config: PartialConfig
  messages: Message[]
  documentLogUuid?: string
  prompt?: string
  source: LogSources
  schema?: JSONSchema7
  output?: 'object' | 'array' | 'no-schema'
  transactionalLogs?: boolean
  onFinish?: FinishCallback
}) {
  const startTime = Date.now()
  const {
    provider,
    token: apiKey,
    id: providerId,
    provider: providerType,
  } = apiProvider
  const model = config.model
  const m = createProvider({ provider, apiKey, config })(model)

  const commonOptions = {
    model: m,
    prompt,
    messages: messages as CoreMessage[],
  }

  const createFinishHandler = (isStructured: boolean) => async (event: any) => {
    const commonData = {
      uuid: v4(),
      source,
      generatedAt: new Date(),
      documentLogUuid,
      providerId,
      providerType,
      model,
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
      type: 'aiProviderCallCompleted',
      data: {
        ...commonData,
        responseText: event.text,
        responseObject: isStructured ? event.object : undefined,
      },
    }

    let providerLogUuid
    if (transactionalLogs) {
      const providerLog = await createProviderLog(payload.data).then((r) =>
        r.unwrap(),
      )
      providerLogUuid = providerLog.uuid
    } else {
      await setupJobs().defaultQueue.jobs.enqueueCreateProviderLogJob(
        payload.data,
      )
    }

    onFinish?.({ ...event, providerLogUuid })
  }

  if (schema && output) {
    const result = await streamObject({
      ...commonOptions,
      schema: jsonSchema(schema),
      // @ts-expect-error - output is vale but depending on the type of schema
      // there might be a mismatch (e.g you pass an object schema but the
      // output is "array"). Not really an issue we need to defend atm
      output,
      onFinish: createFinishHandler(true),
    })

    return {
      fullStream: result.fullStream,
      object: result.object,
      usage: result.usage,
    }
  } else {
    const result = await streamText({
      ...commonOptions,
      onFinish: createFinishHandler(false),
    })

    return {
      fullStream: result.fullStream,
      text: result.text,
      usage: result.usage,
      toolCalls: result.toolCalls,
    }
  }
}

export { estimateCost } from './estimateCost'
export { validateConfig } from './helpers'
export type { PartialConfig, Config } from './helpers'
