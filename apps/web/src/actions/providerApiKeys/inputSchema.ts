import { z } from 'zod'
import { vertexConfigurationSchema } from '@latitude-data/core/services/ai/providers/helpers/vertex'
import { amazonBedrockConfigurationSchema } from '@latitude-data/core/services/ai/providers/helpers/amazonBedrock'
import { openAIProviderConfiguration } from '@latitude-data/core/services/ai/providers/helpers/openai'
import { Providers } from '@latitude-data/constants'

const WITH_CONFIG = [
  Providers.OpenAI,
  Providers.GoogleVertex,
  Providers.AnthropicVertex,
  Providers.AmazonBedrock,
]
const NO_CONFIGURATION_PROVIDERS = (
  Object.values(Providers) as Providers[]
).filter((p) => !WITH_CONFIG.includes(p))

const baseSchema = z.object({
  name: z.string(),
  defaultModel: z.string().optional(),
  token: z.string(),
  url: z.string().optional(),
})

const vertexProviderSchema = z.object({
  provider: z.literal(Providers.GoogleVertex),
  ...baseSchema.shape,
  token: z.string().optional().default('NO_TOKEN_PROVIDED'),
  configuration: vertexConfigurationSchema,
})

const vertexAnthropicProviderSchema = z.object({
  provider: z.literal(Providers.AnthropicVertex),
  ...baseSchema.shape,
  token: z.string().optional().default('NO_TOKEN_PROVIDED'),
  configuration: vertexConfigurationSchema,
})

const amazonBedrockProviderSchema = z.object({
  provider: z.literal(Providers.AmazonBedrock),
  ...baseSchema.shape,
  token: z.string().optional().default('NO_TOKEN_PROVIDED'),
  configuration: amazonBedrockConfigurationSchema,
})

const openAIProviderSchema = z.object({
  provider: z.literal(Providers.OpenAI),
  ...baseSchema.shape,
  configuration: openAIProviderConfiguration,
})

const nonConfigurationSchemas = NO_CONFIGURATION_PROVIDERS.map((p) =>
  z.object({
    provider: z.literal(p),
    ...baseSchema.shape,
    configuration: z.never().optional(),
  }),
)

export const inputSchema = z.discriminatedUnion('provider', [
  vertexProviderSchema,
  vertexAnthropicProviderSchema,
  amazonBedrockProviderSchema,
  openAIProviderSchema,
  ...nonConfigurationSchemas,
])

export type CommonProviderInputKey = keyof typeof baseSchema.shape
export const COMMON_PROVIDER_INPUT_FIELDS_KEYS = Object.keys(baseSchema.shape)
export type ProviderInputSchema = z.infer<typeof inputSchema>
