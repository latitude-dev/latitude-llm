import { z } from 'zod'

export const customMcpConfigurationSchema = z.object({
  url: z.string(),
})

export type CustomMCPConfiguration = z.infer<
  typeof customMcpConfigurationSchema
>
