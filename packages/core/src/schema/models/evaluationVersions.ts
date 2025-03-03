import {
  bigint,
  bigserial,
  boolean,
  foreignKey,
  index,
  jsonb,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import {
  EvaluationCondition,
  EvaluationConfiguration,
  EvaluationMetric,
  EvaluationType,
} from '../../constants'
import { latitudeSchema } from '../db-schema'
import { timestamps } from '../schemaHelpers'
import { documentVersions } from './documentVersions'
import { workspaces } from './workspaces'

export const evaluationVersions = latitudeSchema.table(
  'evaluation_versions',
  {
    id: bigserial('id', { mode: 'number' }).notNull().primaryKey(),
    workspaceId: bigint('workspace_id', { mode: 'number' })
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    commitId: bigint('commit_id', { mode: 'number' }).notNull(),
    evaluationUuid: uuid('evaluation_uuid').notNull().defaultRandom(),
    documentUuid: uuid('document_uuid').notNull(),
    name: varchar('name', { length: 256 }).notNull(),
    description: text('description').notNull(),
    type: varchar('type', { length: 128 }).notNull().$type<EvaluationType>(),
    metric: varchar('metric', { length: 128 })
      .notNull()
      .$type<EvaluationMetric>(),
    condition: varchar('condition', { length: 128 })
      .notNull()
      .$type<EvaluationCondition>(),
    threshold: bigint('threshold', { mode: 'number' }).notNull(),
    configuration: jsonb('configuration')
      .notNull()
      .$type<EvaluationConfiguration>(),
    // Denormalized configuration fields - create indexes if necessary
    live: boolean('live'),
    enableSuggestions: boolean('enable_suggestions'),
    autoApplySuggestions: boolean('auto_apply_suggestions'),
    ...timestamps(),
    deletedAt: timestamp('deleted_at'),
  },
  (table) => ({
    workspaceIdIdx: index('evaluation_versions_workspace_id_idx').on(
      table.workspaceId,
    ),
    documentVersionsFk: foreignKey({
      columns: [table.commitId, table.documentUuid],
      foreignColumns: [
        documentVersions.commitId,
        documentVersions.documentUuid,
      ],
      name: 'evaluation_versions_document_versions_fk',
    }).onDelete('cascade'),
    commitIdIdx: index('evaluation_versions_commit_id_idx').on(table.commitId),
    evaluationUuidIdx: index('evaluation_versions_evaluation_uuid_idx').on(
      table.evaluationUuid,
    ),
    uniqueEvaluationUuidCommitId: uniqueIndex(
      'evaluation_versions_unique_evaluation_uuid_commit_id',
    ).on(table.evaluationUuid, table.commitId),
    documentUuidIdx: index('evaluation_versions_document_uuid_idx').on(
      table.documentUuid,
    ),
  }),
)
