import type { Message } from '@latitude-data/compiler'

import { Providers } from '../../models'

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
}

const CONTENT_DEFINED_ATTRIBUTES = [
  'text',
  'type',
  'image',
  'mimeType',
  'data',
  'toolCallId',
  'toolName',
  'args',
  // TODO: Add a test for this
  'result',
] as const

type AttrArgs = { attributes: string[]; content: Record<string, unknown> }

function genericAttributesProcessor({ attributes, content }: AttrArgs) {
  return attributes.reduce((acc, key) => ({ ...acc, [key]: content[key] }), {})
}

function anthropicAttributesProcessor({ attributes, content }: AttrArgs) {
  return attributes.reduce((acc, key) => {
    const safeKey = key === 'cache_control' ? 'cacheControl' : key
    return { ...acc, [safeKey]: content[key] }
  }, {})
}

function processAttributes({
  attributes,
  provider,
  content,
}: AttrArgs & {
  provider: Providers
}) {
  switch (provider) {
    case Providers.Anthropic:
      return anthropicAttributesProcessor({ attributes, content })
    default:
      return genericAttributesProcessor({ attributes, content })
  }
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
    // @ts-ignore
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
        provider,
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
    // @ts-ignore
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
        provider,
        content: attributes,
      }),
    },
  }
}
