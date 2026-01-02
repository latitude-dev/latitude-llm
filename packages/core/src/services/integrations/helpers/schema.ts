import {
  HostedIntegrationType,
  IntegrationType,
} from '@latitude-data/constants'
import { z } from 'zod'

export const OAuthStatus = {
  pending: 'pending',
  completed: 'completed',
} as const

export type OAuthStatus = (typeof OAuthStatus)[keyof typeof OAuthStatus]

export const externalMcpIntegrationConfigurationSchema = z.object({
  url: z.string(),
  useOAuth: z.boolean().optional(),
  oauthStatus: z.enum(['pending', 'completed']).optional(),
  headers: z.record(z.string(), z.string()).optional(),
})

export type ExternalMcpIntegrationConfiguration = z.infer<
  typeof externalMcpIntegrationConfigurationSchema
>

export const hostedMcpIntegrationConfigurationFormSchema = z.object({
  type: z.enum(HostedIntegrationType),
  env: z.record(z.string(), z.string()).optional(),
})

export type HostedMcpIntegrationConfigurationForm = z.infer<
  typeof hostedMcpIntegrationConfigurationFormSchema
>

export const hostedMcpIntegrationConfigurationSchema = z.object({
  type: z.enum(HostedIntegrationType),
  url: z.string(),
})

export type HostedMcpIntegrationConfiguration = z.infer<
  typeof hostedMcpIntegrationConfigurationSchema
>

export const unconfiguredPipedreamIntegrationSchema = z.object({
  appName: z.string(),
  metadata: z
    .object({
      displayName: z.string(),
      imageUrl: z.string().optional(),
    })
    .optional(),
})

export type UnconfiguredPipedreamIntegrationConfiguration = z.infer<
  typeof unconfiguredPipedreamIntegrationSchema
>

export const pipedreamIntegrationConfigurationSchema =
  unconfiguredPipedreamIntegrationSchema.extend({
    connectionId: z.string(),
    externalUserId: z.string(),
    authType: z.enum(['oauth', 'keys', 'none']),
    oauthAppId: z.string().optional(), // Only required for OAuth apps
  })

export type PipedreamIntegrationConfiguration = z.infer<
  typeof pipedreamIntegrationConfigurationSchema
>

export const integrationConfigurationSchema = z.union([
  z.object({
    type: z.literal(IntegrationType.ExternalMCP),
    configuration: externalMcpIntegrationConfigurationSchema,
  }),
  z.object({
    type: z.literal(IntegrationType.HostedMCP),
    configuration: hostedMcpIntegrationConfigurationSchema,
  }),
  z.object({
    type: z.literal(IntegrationType.Pipedream),
    configuration: pipedreamIntegrationConfigurationSchema,
  }),
  z.object({
    type: z.literal(IntegrationType.Pipedream),
    configuration: unconfiguredPipedreamIntegrationSchema,
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
