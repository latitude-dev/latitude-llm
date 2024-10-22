import { bigint, bigserial, index, text, varchar } from 'drizzle-orm/pg-core'

import { latitudeSchema } from '../db-schema'
import { timestamps } from '../schemaHelpers'
import { providerApiKeys } from './providerApiKeys'

export const evaluationMetadataLlmAsJudgeNumerical = latitudeSchema.table(
  'evaluation_metadata_llm_as_judge_numerical',
  {
    id: bigserial('id', { mode: 'number' }).notNull().primaryKey(),
    providerApiKeyId: bigint('provider_api_key_id', { mode: 'number' })
      .notNull()
      .references(() => providerApiKeys.id),
    model: varchar('model', { length: 256 }).notNull(),
    objective: text('objective').notNull(),
    additionalInstructions: text('additional_instructions'),
    minValue: bigint('min_value', { mode: 'number' }).notNull(),
    maxValue: bigint('max_value', { mode: 'number' }).notNull(),
    minValueDescription: text('min_value_description'),
    maxValueDescription: text('max_value_description'),
    ...timestamps(),
  },
  (table) => ({
    evaluationMetadataLlmAsJudgeNumericalProviderApiKeyIdx: index(
      'evaluation_metadata_llm_as_judge_numerical_provider_api_key_id_idx',
    ).on(table.providerApiKeyId),
  }),
)
