import { z } from 'zod'

type ComparisonFilter = {
  key: string
  type: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte'
  value: string | number | boolean
}

type CompoundFilter = {
  filters: Array<ComparisonFilter | CompoundFilter>
  type: 'and' | 'or'
}

type Filter = ComparisonFilter | CompoundFilter

const ComparisonFilterSchema: z.ZodType<ComparisonFilter> = z.object({
  key: z.string(),
  type: z.enum(['eq', 'ne', 'gt', 'gte', 'lt', 'lte']),
  value: z.union([z.string(), z.number(), z.boolean()]),
})

const CompoundFilterSchema: z.ZodType<CompoundFilter> = z.lazy(() =>
  z.object({
    filters: z.array(
      z.union([
        ComparisonFilterSchema,
        // recursive!
        CompoundFilterSchema,
      ]),
    ),
    type: z.enum(['and', 'or']),
  }),
)

const FilterSchema: z.ZodType<Filter> = z.union([
  ComparisonFilterSchema,
  CompoundFilterSchema,
])

const RankingOptionsSchema = z.object({
  ranker: z.enum(['auto', 'default-2024-11-15']).optional(),
  score_threshold: z.number().min(0).max(1).optional(),
})

const FileSearchToolSchema = z.object({
  type: z.literal('file_search'),
  vector_store_ids: z.array(z.string()),
  filters: FilterSchema.optional().nullable(),
  max_num_results: z.number().int().min(1).max(50).optional(),
  ranking_options: RankingOptionsSchema.optional(),
})

export const UserLocationSchema: z.ZodType<UserLocation> = z.object({
  type: z.literal('approximate'),
  city: z.string().nullable().optional(),
  country: z.string().nullable().optional(),
  region: z.string().nullable().optional(),
  timezone: z.string().nullable().optional(),
});

// WebSearchTool schema
export const WebSearchToolSchema: z.ZodType<WebSearchTool> = z.object({
  type: z.enum(['web_search_preview', 'web_search_preview_2025_03_11']),
  search_context_size: z.enum(['low', 'medium', 'high']).optional(),
  user_location: UserLocationSchema.optional().nullable(),
})

export const openAIConfigSchema = z.object({
  endpoints: z
    .object({
      responses: z
        .object({
          tools: z.array(FileSearchToolSchema).optional().nullable(),
        })
        .optional(),
    })
    .optional(),
})

export type OpenAIConfig = z.infer<typeof openAIConfigSchema>
