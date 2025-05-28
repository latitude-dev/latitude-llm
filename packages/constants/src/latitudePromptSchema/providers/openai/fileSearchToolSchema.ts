import { z } from 'zod'

export type ComparisonFilter = {
  key: string
  type: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte'
  value: string | number | boolean
}

export type CompoundFilter = {
  filters: Array<ComparisonFilter | CompoundFilter>
  type: 'and' | 'or'
}

export type Filter = ComparisonFilter | CompoundFilter

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

export const FileSearchToolSchema = z.object({
  type: z.literal('file_search'),
  vector_store_ids: z.array(z.string()),
  filters: FilterSchema.optional().nullable(),
  max_num_results: z.number().int().min(1).max(50).optional(),
  ranking_options: RankingOptionsSchema.optional(),
})

export type OpenAIFilesSearchTool = z.infer<typeof FileSearchToolSchema>
