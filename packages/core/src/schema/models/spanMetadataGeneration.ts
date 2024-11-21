import {
  bigint,
  bigserial,
  index,
  integer,
  jsonb,
  varchar,
} from 'drizzle-orm/pg-core'

import { latitudeSchema } from '../db-schema'
import { timestamps } from '../schemaHelpers'

export const spanMetadataGeneration = latitudeSchema.table(
  'span_metadata_generation',
  {
    id: bigserial('id', { mode: 'number' }).notNull().primaryKey(),
    model: varchar('model'),
    modelParameters: jsonb('model_parameters'),
    input: jsonb('input'),
    output: jsonb('output'),
    inputTokens: bigint('prompt_tokens', { mode: 'number' })
      .notNull()
      .default(0),
    outputTokens: bigint('completion_tokens', { mode: 'number' })
      .notNull()
      .default(0),
    totalTokens: bigint('total_tokens', { mode: 'number' })
      .notNull()
      .default(0),
    inputCostInMillicents: integer('input_cost_in_millicents')
      .notNull()
      .default(0),
    outputCostInMillicents: integer('output_cost_in_millicents')
      .notNull()
      .default(0),
    totalCostInMillicents: integer('total_cost_in_millicents')
      .notNull()
      .default(0),
    ...timestamps(),
  },
  (table) => ({
    modelIdx: index('span_metadata_generation_model_idx').on(table.model),
  }),
)
