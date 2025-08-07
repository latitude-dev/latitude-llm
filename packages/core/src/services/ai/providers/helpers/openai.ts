import { OPENAI_PROVIDER_ENDPOINTS } from '@latitude-data/constants'
import { z } from 'zod'

export const openAIProviderConfiguration = z.object({
  endpoint: z.enum(OPENAI_PROVIDER_ENDPOINTS).optional(),
})

export type OpenAIProviderConfiguration = z.infer<
  typeof openAIProviderConfiguration
>
