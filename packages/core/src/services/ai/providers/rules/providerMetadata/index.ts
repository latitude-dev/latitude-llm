import type { Message } from '@latitude-data/constants/messages'

import { Providers } from '@latitude-data/constants'
import { toCamelCaseDeep } from '../../../../../lib/camelCaseRecursive'

export const PROVIDER_TO_METADATA_KEY: Record<Providers, string> = {
  [Providers.OpenAI]: 'openai',
  [Providers.Anthropic]: 'anthropic',
  [Providers.Groq]: 'groq',
  [Providers.Mistral]: 'mistral',
  [Providers.Azure]: 'azure',
  [Providers.Google]: 'google',
  [Providers.Custom]: 'custom',
  [Providers.GoogleVertex]: 'google',
  [Providers.AnthropicVertex]: 'anthropic',
  [Providers.XAI]: 'xai',
  [Providers.DeepSeek]: 'deepseek',
  [Providers.Perplexity]: 'perplexity',
  [Providers.AmazonBedrock]: 'amazon_bedrock',
}

const CONTENT_DEFINED_ATTRIBUTES = [
  'text',
  'type',
  'image',
  'mimeType', // Deprecated in v5, use 'mediaType' instead
  'mediaType', // v4 -> v5 migration
  'data',
  'toolCallId',
  'toolName',
  'args', // Deprecated in v5, use 'input' instead for tool calls
  'input', // v4 -> v5 migration
  // TODO: Add a test for this
  'result',
] as const

function processAttributes({
  attributes,
  content,
}: {
  attributes: string[]
  content: Record<string, unknown>
}) {
  const data = attributes.reduce((acc, key) => {
    const safeKey = key === 'cache_control' ? 'cacheControl' : key
    return { ...acc, [safeKey]: content[key] }
  }, {})
  return toCamelCaseDeep(data)
}

export function getProviderMetadataKey(provider: Providers) {
  return PROVIDER_TO_METADATA_KEY[provider]
}

export type ProviderMetadata = Record<string, Record<string, unknown>>

export function extractContentMetadata({
  content,
  provider,
}: {
  content: Record<string, unknown>
  provider: Providers
}) {
  const definedAttributes = Object.keys(content).filter((key) =>
    CONTENT_DEFINED_ATTRIBUTES.includes(
      key as (typeof CONTENT_DEFINED_ATTRIBUTES)[number],
    ),
  ) as (typeof CONTENT_DEFINED_ATTRIBUTES)[number][]

  const providerAttributes = Object.keys(content).filter(
    (key) => !CONTENT_DEFINED_ATTRIBUTES.includes(key as any),
  )

  const definedData = definedAttributes.reduce(
    // @ts-error - we are sure about the type here
    (acc, key) => ({ ...acc, [key]: content[key] }),
    {} as Record<(typeof CONTENT_DEFINED_ATTRIBUTES)[number], unknown>,
  )

  if (!providerAttributes.length) {
    return definedData
  }

  return {
    ...definedData,
    providerOptions: {
      [getProviderMetadataKey(provider)]: processAttributes({
        attributes: providerAttributes,
        content,
      }),
    },
  }
}

function removeUndefinedValues(data: Record<string, unknown>) {
  return Object.keys(data).reduce((acc, item) => {
    if (data[item] === undefined) return acc
    return { ...acc, [item]: data[item] }
  }, {})
}

type MessageWithMetadata = Message & {
  providerOptions?: Record<string, Record<string, unknown>>
}

export function extractMessageMetadata({
  message,
  provider,
}: {
  message: Message
  provider: Providers
}): MessageWithMetadata {
  const { role, content, toolCalls, ...rest } = message

  let common = removeUndefinedValues({
    role,
    content,
    toolCalls,
  }) as Message & { name?: string }

  if (Object.keys(rest).length === 0) return common

  if (role === 'user' && Object.hasOwnProperty.call(rest, 'name')) {
    // @ts-expect-error - name is not in Message type
    const name = rest.name
    common = {
      ...common,
      // Issue: https://github.com/vercel/ai/pull/2199
      name,
    }
  }

  const {
    name: _name,
    toolName: _toolName,
    toolId: _toolId,
    _promptlSourceMap,
    ...attributes
  } = rest as {
    name?: string
    [key: string]: unknown
  }

  if (!Object.keys(attributes).length) return common

  return {
    ...common,
    providerOptions: {
      [getProviderMetadataKey(provider)]: processAttributes({
        attributes: Object.keys(attributes),
        content: attributes,
      }),
    },
  }
}
