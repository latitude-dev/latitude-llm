import { z } from 'zod'

// UserLocation schema
const UserLocationSchema = z.object({
  type: z.literal('approximate'),
  city: z.string().optional(),
  country: z.string().optional(),
  region: z.string().optional(),
  timezone: z.string().optional(),
})

const OPEN_AI_SEARCH_TYPES = ['web_search_preview', 'web_search_preview_2025_03_11'] as const

export const WebSearchToolSchema = z.object({
  type: z.enum(OPEN_AI_SEARCH_TYPES),
  search_context_size: z.enum(['low', 'medium', 'high']).optional(),
  user_location: UserLocationSchema.optional(),
})

export type OpenAIWebSearchTool = z.infer<typeof WebSearchToolSchema>
