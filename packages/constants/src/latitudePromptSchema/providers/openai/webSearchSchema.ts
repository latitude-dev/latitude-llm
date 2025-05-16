import { z } from 'zod'

// UserLocation schema
const UserLocationSchema = z.object({
  type: z.literal('approximate'),
  city: z.string().nullable().optional(),
  country: z.string().nullable().optional(),
  region: z.string().nullable().optional(),
  timezone: z.string().nullable().optional(),
})

// WebSearchTool schema
export const WebSearchToolSchema = z.object({
  type: z.enum(['web_search_preview', 'web_search_preview_2025_03_11']),
  search_context_size: z.enum(['low', 'medium', 'high']).optional(),
  user_location: UserLocationSchema.optional().nullable(),
})
