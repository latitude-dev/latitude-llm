import { omit } from 'lodash-es'

import { Message, MessageRole } from '@latitude-data/compiler'
import { env } from '@latitude-data/env'
import {
  CoreMessage,
  CoreTool,
  jsonSchema,
  streamObject,
  StreamObjectResult,
  streamText,
  StreamTextResult,
} from 'ai'
import { JSONSchema7 } from 'json-schema'

import { ProviderApiKey, Providers, StreamType, Workspace } from '../../browser'
import { LatitudeError } from '../../lib'
import { compactObject } from '../../lib/compactObject'
import { incrFreeRuns } from '../freeRunsManager'
import { createProvider, PartialConfig } from './helpers'

const MAX_FREE_RUNS = 1000

export type AIReturn<T extends StreamType> = T extends 'object'
  ? {
      type: 'object'
      data: Pick<
        StreamObjectResult<unknown, unknown, never>,
        'fullStream' | 'object' | 'usage'
      >
    }
  : T extends 'text'
    ? {
        type: 'text'
        data: Pick<
          StreamTextResult<Record<string, CoreTool<any, any>>>,
          'fullStream' | 'text' | 'usage' | 'toolCalls'
        >
      }
    : never

export async function ai({
  workspace,
  provider: apiProvider,
  prompt,
  messages,
  config,
  schema,
  output,
}: {
  // TODO: Review if workspace and provider are necessary
  // Maybe we should pass a valid `languageModel` from AI SDK
  workspace: Workspace
  provider: ProviderApiKey
  config: PartialConfig
  messages: Message[]
  prompt?: string
  schema?: JSONSchema7
  output?: 'object' | 'array' | 'no-schema'
}): Promise<AIReturn<StreamType>> {
  // FIXME: This is the quota limit. We want also to store this as
  // an error so it can't be here. Move to a service before invoking
  // the AI service.
  await checkDefaultProviderUsage({ provider: apiProvider, workspace })

  const { provider, token: apiKey, url } = apiProvider
  const model = config.model

  if (provider === Providers.Google) {
    const firstUserMessage = messages.find((m) => m.role === MessageRole.user)
    if (!firstUserMessage) {
      throw new LatitudeError(
        'Google provider requires at least one user message',
      )
    }
  }

  // FIXME: This also can generate an error. I think we should move out
  const languageModel = createProvider({
    provider,
    apiKey,
    config,
    ...(url ? { url } : {}),
  })(model)

  let commonOptions
  try {
    commonOptions = {
      ...omit(config, ['schema', 'tools']),
      model: languageModel,
      prompt,
      messages: messages as CoreMessage[],
      tools: buildTools(config.tools),
    }
  } catch (error) {
    throw new LatitudeError(`Failure parsing prompt configuration`)
  }

  if (schema && output) {
    const result = await streamObject({
      ...commonOptions,
      schema: jsonSchema(schema),
      // output is valid but depending on the type of schema
      // there might be a mismatch (e.g you pass an object schema but the
      // output is "array"). Not really an issue we need to defend atm.
      output: output as any,
    })

    return {
      type: 'object',
      data: {
        fullStream: result.fullStream,
        object: result.object,
        usage: result.usage,
      },
    }
  }

  const result = await streamText(commonOptions)
  return {
    type: 'text',
    data: {
      fullStream: result.fullStream,
      text: result.text,
      usage: result.usage,
      toolCalls: result.toolCalls,
    },
  }
}

const checkDefaultProviderUsage = async ({
  provider,
  workspace,
}: {
  provider: ProviderApiKey
  workspace: Workspace
}) => {
  if (provider.token !== env.DEFAULT_PROVIDER_API_KEY) return

  const value = await incrFreeRuns(workspace.id)

  if (value > MAX_FREE_RUNS) {
    throw new Error(
      'You have exceeded your maximum number of free runs for today',
    )
  }
}

const buildTools = (
  tools: Record<
    string,
    { description?: string; parameters: Record<string, any> }
  >,
) => {
  return tools
    ? Object.entries(tools).reduce<Record<string, CoreTool>>(
        (acc, [key, value]) => {
          acc[key] = compactObject({
            ...value,
            parameters: jsonSchema(value.parameters),
          }) as unknown as CoreTool

          return acc
        },
        {},
      )
    : undefined
}

export { estimateCost } from './estimateCost'
export type { Config, PartialConfig } from './helpers'
