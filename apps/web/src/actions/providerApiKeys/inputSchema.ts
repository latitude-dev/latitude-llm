import { z } from 'zod'
import { Providers } from '@latitude-data/core/browser'
import { vertexConfigurationSchema } from '@latitude-data/core/services/ai/providers/helpers/vertex'

const NO_CONFIGURATION_PROVIDERS = (
  Object.values(Providers) as Providers[]
).filter((p) => p !== Providers.GoogleVertex)

const baseSchema = z.object({
  name: z.string(),
  defaultModel: z.string().optional(),
  token: z.string(),
  url: z.string().optional(),
})

const vertexProviderSchema = z.object({
  provider: z.literal(Providers.GoogleVertex),
  ...baseSchema.shape,
  // NOTE: "token" is not realy used in Vertex but having it required makes life easier
  // from a type safety perspective in the codebase.
  // Only real issue if we wanted to setup Vertex as Default Provider in the
  // platform (which we don't do at the moment)
  token: z.string().optional().default('NO_TOKEN_PROVIDED'),
  configuration: vertexConfigurationSchema,
})

const nonConfigurationSchemas = NO_CONFIGURATION_PROVIDERS.map((p) =>
  z.object({
    provider: z.literal(p),
    ...baseSchema.shape,
    configuration: z.never(),
  }),
)

export const inputSchema = z.discriminatedUnion('provider', [
  vertexProviderSchema,
  ...nonConfigurationSchemas,
])

export type CommonProviderInputKey = keyof typeof baseSchema.shape
export const COMMON_PROVIDER_INPUT_FIELDS_KEYS = Object.keys(baseSchema.shape)
export type ProviderInputSchema = z.infer<typeof inputSchema>
