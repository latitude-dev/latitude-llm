import { IntegrationType } from '@latitude-data/constants'
import {
  externalMcpIntegrationConfigurationSchema,
  hostedMcpIntegrationConfigurationFormSchema,
  pipedreamIntegrationConfigurationSchema,
} from '@latitude-data/core/services/integrations/helpers/schema'
import { z } from 'zod'

const baseSchema = z.object({
  name: z.string(),
  type: z.nativeEnum(IntegrationType),
})

const fullCustomMcpConfigurationSchema = z.object({
  name: z.string(),
  type: z.literal(IntegrationType.ExternalMCP),
  configuration: externalMcpIntegrationConfigurationSchema,
})

const fullMcpServerConfigurationSchema = z.object({
  name: z.string(),
  type: z.literal(IntegrationType.HostedMCP),
  configuration: hostedMcpIntegrationConfigurationFormSchema,
})

const fullPipedreamConfigurationSchema = z.object({
  name: z.string(),
  type: z.literal(IntegrationType.Pipedream),
  configuration: pipedreamIntegrationConfigurationSchema,
})

export const inputSchema = z.discriminatedUnion('type', [
  fullCustomMcpConfigurationSchema,
  fullMcpServerConfigurationSchema,
  fullPipedreamConfigurationSchema,
])

export type CommonIntegrationInputKey = keyof typeof baseSchema.shape
export const COMMON_INTEGRATION_INPUT_FIELDS_KEYS = Object.keys(
  baseSchema.shape,
)
export type IntegrationInputSchema = z.infer<typeof inputSchema>
