import {
  bigint,
  bigserial,
  index,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'

import { EvaluationMetadataType } from '../../constants'
import { latitudeSchema } from '../db-schema'
import { workspaces } from '../models/workspaces'
import { timestamps } from '../schemaHelpers'

// import { evaluationResultTypes } from './evaluationResults'

export const metadataTypesEnum = latitudeSchema.enum('metadata_type', [
  EvaluationMetadataType.LlmAsJudgeAdvanced,
  // EvaluationMetadataType.LlmAsJudgeSimple,
])

export const evaluations = latitudeSchema.table(
  'evaluations',
  {
    id: bigserial('id', { mode: 'number' }).notNull().primaryKey(),
    uuid: uuid('uuid').notNull().unique().defaultRandom(),
    name: varchar('name', { length: 256 }).notNull(),
    description: text('description').notNull(),
    metadataType: metadataTypesEnum('metadata_type').notNull(),
    metadataId: bigint('metadata_id', { mode: 'number' }).notNull(),
    // TODO: This has been applied in the migration, but not added in the code yet to avoid errors during the deployment. Will be added in the next PR
    // resultType: evaluationResultTypes('result_type'),
    // resultConfigurationId: bigint('result_configuration_id', {
    //   mode: 'number',
    // }),
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
