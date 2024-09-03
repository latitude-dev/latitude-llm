import { bigint, bigserial, index, text, varchar } from 'drizzle-orm/pg-core'

import { EvaluationMetadataType } from '../../constants'
import { latitudeSchema } from '../db-schema'
import { timestamps } from '../schemaHelpers'
import { evaluationTemplates } from './evaluationTemplates'

export const llmAsJudgeEvaluationMetadatas = latitudeSchema.table(
  'llm_as_judge_evaluation_metadatas',
  {
    id: bigserial('id', { mode: 'number' }).notNull().primaryKey(),
    metadataType: varchar('metadata_type', { length: 256 })
      .notNull()
      .default(EvaluationMetadataType.LlmAsJudge),
    ...timestamps(),
    prompt: text('prompt').notNull(),
    templateId: bigint('template_id', { mode: 'number' }).references(
      () => evaluationTemplates.id,
    ),
  },
  (table) => ({
    llmAsJudgeEvaluationMetadatasTemplateIdIdx: index(
      'llm_as_judge_evaluation_metadatas_template_id_idx',
    ).on(table.templateId),
  }),
)
