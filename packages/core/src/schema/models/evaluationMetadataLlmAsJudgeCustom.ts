import { bigint, bigserial, index, text, varchar } from 'drizzle-orm/pg-core'

import { latitudeSchema } from '../db-schema'
import { timestamps } from '../schemaHelpers'
import { providerApiKeys } from './providerApiKeys'

export const evaluationMetadataLlmAsJudgeCustom = latitudeSchema.table(
  'evaluation_metadata_llm_as_judge_custom',
  {
    id: bigserial('id', { mode: 'number' }).notNull().primaryKey(),
    providerApiKeyId: bigint('provider_api_key_id', { mode: 'number' })
      .notNull()
      .references(() => providerApiKeys.id),
    model: varchar('model', { length: 256 }).notNull(),
    objective: text('objective').notNull(),
    additionalInstructions: text('additional_instructions'),
    ...timestamps(),
  },
  (table) => ({
    evaluationMetadataLlmAsJudgeCustomProviderApiKeyIdx: index(
      'evaluation_metadata_llm_as_judge_custom_provider_api_key_id_idx',
    ).on(table.providerApiKeyId),
  }),
)
