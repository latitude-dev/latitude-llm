import {
  bigint,
  bigserial,
  boolean,
  foreignKey,
  index,
  jsonb,
  text,
  timestamp,
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

export const evaluationsV2 = latitudeSchema.table(
  'evaluations_v2',
  {
    id: bigserial('id', { mode: 'number' }).notNull().primaryKey(),
    workspaceId: bigint('workspace_id', { mode: 'number' })
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    commitId: bigint('commit_id', { mode: 'number' }).notNull(),
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
    workspaceIdIdx: index('evaluations_v2_workspace_id_idx').on(
      table.workspaceId,
    ),
    documentVersionsFk: foreignKey({
      columns: [table.commitId, table.documentUuid],
      foreignColumns: [
        documentVersions.commitId,
        documentVersions.documentUuid,
      ],
      name: 'evaluations_v2_document_versions_fk',
    }).onDelete('cascade'),
    commitIdIdx: index('evaluations_v2_commit_id_idx').on(table.commitId),
    documentUuidIdx: index('evaluations_v2_document_uuid_idx').on(
      table.documentUuid,
    ),
  }),
)
