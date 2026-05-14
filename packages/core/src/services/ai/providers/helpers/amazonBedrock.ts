import { z } from 'zod'

export const amazonBedrockConfigurationSchema = z.object({
  region: z.string(),
})

export type AmazonBedrockConfiguration = z.infer<
  typeof amazonBedrockConfigurationSchema
>
