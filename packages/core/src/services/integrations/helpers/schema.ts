import { z } from 'zod'

export const customMcpConfigurationSchema = z.object({
  url: z.string(),
})

export type CustomMCPConfiguration = z.infer<
  typeof customMcpConfigurationSchema
>

export const insertMCPServerConfigurationSchema = z.object({
  name: z.string(),
  runCommand: z.string(),
  environmentVariables: z.string().optional(),
})

export type InsertMCPServerConfiguration = z.infer<
  typeof insertMCPServerConfigurationSchema
>

export const integrationConfigurationSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('CustomMCP'),
    configuration: customMcpConfigurationSchema,
  }),
  z.object({
    type: z.literal('MCPServer'),
    configuration: insertMCPServerConfigurationSchema,
  }),
])

export type IntegrationConfiguration = z.infer<
  typeof integrationConfigurationSchema
>
