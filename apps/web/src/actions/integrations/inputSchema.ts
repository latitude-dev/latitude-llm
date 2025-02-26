import { IntegrationType } from '@latitude-data/constants'
import { customMcpConfigurationSchema } from '@latitude-data/core/services/integrations/helpers/schema'
import { z } from 'zod'

const baseSchema = z.object({
  name: z.string(),
  type: z.nativeEnum(IntegrationType),
})

const fullCustomMcpConfigurationSchema = z.object({
  ...baseSchema.shape,
  configuration: customMcpConfigurationSchema,
})

export const inputSchema = z.discriminatedUnion('type', [
  fullCustomMcpConfigurationSchema,
])

export type CommonIntegrationInputKey = keyof typeof baseSchema.shape
export const COMMON_INTEGRATION_INPUT_FIELDS_KEYS = Object.keys(
  baseSchema.shape,
)
export type IntegrationInputSchema = z.infer<typeof inputSchema>
