import { IntegrationType } from '@latitude-data/constants'
import {
  customMcpConfigurationSchema,
  insertMCPServerConfigurationSchema,
} from '@latitude-data/core/services/integrations/helpers/schema'
import { z } from 'zod'

const baseSchema = z.object({
  name: z.string(),
  type: z.nativeEnum(IntegrationType),
})

const fullCustomMcpConfigurationSchema = z.object({
  name: z.string(),
  type: z.literal(IntegrationType.CustomMCP),
  configuration: customMcpConfigurationSchema,
})

const fullMcpServerConfigurationSchema = z.object({
  name: z.string(),
  type: z.literal(IntegrationType.MCPServer),
  configuration: insertMCPServerConfigurationSchema,
})

export const inputSchema = z.discriminatedUnion('type', [
  fullCustomMcpConfigurationSchema,
  fullMcpServerConfigurationSchema,
])

export type CommonIntegrationInputKey = keyof typeof baseSchema.shape
export const COMMON_INTEGRATION_INPUT_FIELDS_KEYS = Object.keys(
  baseSchema.shape,
)
export type IntegrationInputSchema = z.infer<typeof inputSchema>
