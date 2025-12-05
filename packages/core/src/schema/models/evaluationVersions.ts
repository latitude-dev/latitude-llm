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
  AlignmentMetricMetadata,
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
    // Currently MCC, but generalizing name to alignmentMetric to allow for other metrics in the future
    alignmentMetric: bigint('alignment_metric', { mode: 'number' }),
    alignmentMetricMetadata: jsonb(
      'alignment_metric_metadata',
    ).$type<AlignmentMetricMetadata>(),
    // Denormalized configuration fields - create indexes if necessary
    evaluateLiveLogs: boolean('evaluate_live_logs'),
    enableSuggestions: boolean('enable_suggestions'),
    autoApplySuggestions: boolean('auto_apply_suggestions'),
    ...timestamps(),
    deletedAt: timestamp('deleted_at'),
    ignoredAt: timestamp('ignored_at'),
  },
  (table) => ({
    workspaceIdIdx: index('evaluation_versions_workspace_id_idx').on(
      table.workspaceId,
    ),
    uniqueCommitIdEvaluationUuid: uniqueIndex(
      'evaluation_versions_unique_commit_id_evaluation_uuid',
    ).on(table.commitId, table.evaluationUuid),
    uniqueNameCommitIdDocumentUuidDeletedAt: uniqueIndex(
      'evaluation_versions_unique_name_commit_id_document_uuid_deleted_at',
    ).on(table.name, table.commitId, table.documentUuid, table.deletedAt),
    commitIdIdx: index('evaluation_versions_commit_id_idx').on(table.commitId),
    evaluationUuidIdx: index('evaluation_versions_evaluation_uuid_idx').on(
      table.evaluationUuid,
    ),
    documentUuidIdx: index('evaluation_versions_document_uuid_idx').on(
      table.documentUuid,
    ),
    issueIdIdx: index('evaluation_v2_issue_id_idx').on(table.issueId),
  }),
)
