import {
  HostedIntegrationType,
  IntegrationType,
} from '@latitude-data/constants'
import { z } from 'zod'

export const externalMcpIntegrationConfigurationSchema = z.object({
  url: z.string(),
})

export type ExternalMcpIntegrationConfiguration = z.infer<
  typeof externalMcpIntegrationConfigurationSchema
>

export const hostedMcpIntegrationConfigurationFormSchema = z.object({
  type: z.nativeEnum(HostedIntegrationType),
  env: z.record(z.string()).optional(),
})

export type HostedMcpIntegrationConfigurationForm = z.infer<
  typeof hostedMcpIntegrationConfigurationFormSchema
>

export const hostedMcpIntegrationConfigurationSchema = z.object({
  type: z.nativeEnum(HostedIntegrationType),
  url: z.string(),
})

export type HostedMcpIntegrationConfiguration = z.infer<
  typeof hostedMcpIntegrationConfigurationSchema
>

export const integrationConfigurationSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal(IntegrationType.ExternalMCP),
    configuration: externalMcpIntegrationConfigurationSchema,
  }),
  z.object({
    type: z.literal(IntegrationType.HostedMCP),
    configuration: hostedMcpIntegrationConfigurationSchema,
  }),
  z.object({
    // For internal use only, not supported in the db
    type: z.literal(IntegrationType.Latitude),
    configuration: z.null(),
  }),
])

export type IntegrationConfiguration = z.infer<
  typeof integrationConfigurationSchema
>
