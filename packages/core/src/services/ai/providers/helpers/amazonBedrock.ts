import { z } from 'zod'

export const amazonBedrockConfigurationSchema = z.object({
  region: z.string(),
  accessKeyId: z.string(),
  secretAccessKey: z.string(),
  sessionToken: z.string().optional(),
})

export type AmazonBedrockConfiguration = z.infer<typeof amazonBedrockConfigurationSchema>
