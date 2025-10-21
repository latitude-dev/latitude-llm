import {
  bigint,
  bigserial,
  index,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'

import { latitudeSchema } from '../db-schema'
import { workspaces } from '../models/workspaces'
import { timestamps } from '../schemaHelpers'

// NOTE: Deprecated but do not delete
export enum EvaluationMetadataType {
  LlmAsJudgeAdvanced = 'llm_as_judge',
  LlmAsJudgeSimple = 'llm_as_judge_simple',
  Manual = 'manual',
}

export const metadataTypesEnum = latitudeSchema.enum('metadata_type', [
  EvaluationMetadataType.LlmAsJudgeAdvanced,
  EvaluationMetadataType.LlmAsJudgeSimple,
  EvaluationMetadataType.Manual,
])

// NOTE: Deprecated but do not delete
export const evaluations = latitudeSchema.table(
  'evaluations',
  {
    id: bigserial('id', { mode: 'number' }).notNull().primaryKey(),
    uuid: uuid('uuid').notNull().unique().defaultRandom(),
    name: varchar('name', { length: 256 }).notNull(),
    description: text('description').notNull(),
    metadataType: metadataTypesEnum('metadata_type').notNull(),
    metadataId: bigint('metadata_id', { mode: 'number' }).notNull(),
    resultType: text('result_type'),
    resultConfigurationId: bigint('result_configuration_id', {
      mode: 'number',
    }),
    workspaceId: bigint('workspace_id', { mode: 'number' })
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    deletedAt: timestamp('deleted_at'),
    ...timestamps(),
  },
  (table) => ({
    evaluationWorkspaceIdx: index('evaluation_workspace_idx').on(
      table.workspaceId,
    ),
    evaluationMetadataIdx: index('evaluation_metadata_idx').on(
      table.metadataId,
      table.metadataType,
    ),
    deletedAt: index('evaluations_deleted_at_idx').on(table.deletedAt),
  }),
)
