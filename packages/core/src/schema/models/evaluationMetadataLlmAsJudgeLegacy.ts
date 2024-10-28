import { bigint, bigserial, index, jsonb, text } from 'drizzle-orm/pg-core'

import { latitudeSchema } from '../db-schema'
import { timestamps } from '../schemaHelpers'
import { EvaluationResultConfiguration } from '../types'
import { evaluationLegacyTemplates } from './evaluationLegacyTemplates'

export const evaluationMetadataLlmAsJudgeLegacy = latitudeSchema.table(
  'llm_as_judge_evaluation_metadatas',
  {
    id: bigserial('id', { mode: 'number' }).notNull().primaryKey(),
    prompt: text('prompt').notNull(),
    configuration:
      jsonb('configuration').$type<EvaluationResultConfiguration>(),
    templateId: bigint('template_id', { mode: 'number' }).references(
      () => evaluationLegacyTemplates.id,
    ),
    ...timestamps(),
  },
  (table) => ({
    llmAsJudgeEvaluationMetadatasTemplateIdIdx: index(
      'llm_as_judge_evaluation_metadatas_template_id_idx',
    ).on(table.templateId),
  }),
)
