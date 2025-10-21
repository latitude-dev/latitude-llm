import {
  AnyPgColumn,
  bigint,
  bigserial,
  boolean,
  index,
  jsonb,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import {
  EvaluationConfiguration,
  EvaluationMetric,
  EvaluationType,
} from '../../constants'
import { latitudeSchema } from '../db-schema'
import { timestamps } from '../schemaHelpers'
import { commits } from './commits'
import { workspaces } from './workspaces'
import { issues } from './issues'

export const evaluationVersions = latitudeSchema.table(
  'evaluation_versions',
  {
    id: bigserial('id', { mode: 'number' }).notNull().primaryKey(),
    workspaceId: bigint('workspace_id', { mode: 'number' })
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    commitId: bigint('commit_id', { mode: 'number' })
      .notNull()
      .references(() => commits.id, { onDelete: 'restrict' }),
    evaluationUuid: uuid('evaluation_uuid').notNull().defaultRandom(),
    documentUuid: uuid('document_uuid').notNull(),
    issueId: bigint('issue_id', { mode: 'number' }).references(
      (): AnyPgColumn => issues.id,
      { onDelete: 'set null' },
    ),
    name: varchar('name', { length: 256 }).notNull(),
    description: text('description').notNull(),
    type: varchar('type', { length: 128 }).notNull().$type<EvaluationType>(),
    metric: varchar('metric', { length: 128 })
      .notNull()
      .$type<EvaluationMetric>(),
    configuration: jsonb('configuration')
      .notNull()
      .$type<EvaluationConfiguration>(),
    // Denormalized configuration fields - create indexes if necessary
    evaluateLiveLogs: boolean('evaluate_live_logs'),
    enableSuggestions: boolean('enable_suggestions'),
    autoApplySuggestions: boolean('auto_apply_suggestions'),
    ...timestamps(),
    deletedAt: timestamp('deleted_at'),
  },
  (table) => [
    index('evaluation_versions_workspace_id_idx').on(table.workspaceId),
    uniqueIndex('evaluation_versions_unique_commit_id_evaluation_uuid').on(
      table.commitId,
      table.evaluationUuid,
    ),
    uniqueIndex(
      'evaluation_versions_unique_name_commit_id_document_uuid_deleted_at',
    ).on(table.name, table.commitId, table.documentUuid, table.deletedAt),
    index('evaluation_versions_commit_id_idx').on(table.commitId),
    index('evaluation_versions_evaluation_uuid_idx').on(table.evaluationUuid),
    index('evaluation_versions_document_uuid_idx').on(table.documentUuid),
    index('evaluation_v2_issue_id_idx').on(table.issueId),
  ],
)
