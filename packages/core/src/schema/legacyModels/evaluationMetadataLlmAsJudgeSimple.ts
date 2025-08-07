import { bigint, bigserial, text } from 'drizzle-orm/pg-core'

import { latitudeSchema } from '../db-schema'
import { timestamps } from '../schemaHelpers'
import { providerApiKeys } from '../models/providerApiKeys'

// NOTE: Deprecated
export const evaluationMetadataLlmAsJudgeSimple = latitudeSchema.table(
  'evaluation_metadata_llm_as_judge_simple',
  {
    id: bigserial('id', { mode: 'number' }).notNull().primaryKey(),
    providerApiKeyId: bigint('provider_api_key_id', { mode: 'number' })
      .notNull()
      .references(() => providerApiKeys.id),
    model: text('model').notNull(),
    objective: text('objective').notNull(),
    additionalInstructions: text('additional_instructions'),
    ...timestamps(),
  },
)
