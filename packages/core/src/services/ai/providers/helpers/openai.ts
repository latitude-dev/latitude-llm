import { z } from 'zod'
import { OPENAI_PROVIDER_ENDPOINTS } from '@latitude-data/constants'

export const openAIProviderConfiguration = z.object({
  endpoint: z.enum(OPENAI_PROVIDER_ENDPOINTS).optional(),
})

export type OpenAIProviderConfiguration = z.infer<
  typeof openAIProviderConfiguration
>
