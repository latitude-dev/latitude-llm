import { bigint, bigserial, index, text } from 'drizzle-orm/pg-core'

import { latitudeSchema } from '../db-schema'
import { timestamps } from '../schemaHelpers'
import { evaluationAdvancedTemplates } from './evaluationAdvancedTemplates'

export const evaluationMetadataLlmAsJudgeAdvanced = latitudeSchema.table(
  'llm_as_judge_evaluation_metadatas',
  {
    id: bigserial('id', { mode: 'number' }).notNull().primaryKey(),
    prompt: text('prompt').notNull(),
    templateId: bigint('template_id', { mode: 'number' }).references(
      () => evaluationAdvancedTemplates.id,
    ),
    ...timestamps(),
  },
  (table) => ({
    llmAsJudgeEvaluationMetadatasTemplateIdIdx: index(
      'llm_as_judge_evaluation_metadatas_template_id_idx',
    ).on(table.templateId),
  }),
)
