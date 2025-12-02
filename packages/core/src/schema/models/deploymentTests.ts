import { sql } from 'drizzle-orm'
import {
  bigint,
  bigserial,
  boolean,
  index,
  integer,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'

import { latitudeSchema } from '../db-schema'
import { users } from './users'
import { workspaces } from './workspaces'
import { projects } from './projects'
import { commits } from './commits'
import { timestamps } from '../schemaHelpers'

export const deploymentTests = latitudeSchema.table(
  'deployment_tests',
  {
    id: bigserial('id', { mode: 'number' }).notNull().primaryKey(),
    uuid: uuid('uuid')
      .notNull()
      .unique()
      .default(sql`gen_random_uuid()`),
    workspaceId: bigint('workspace_id', { mode: 'number' })
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    projectId: bigint('project_id', { mode: 'number' })
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    documentUuid: uuid('document_uuid').notNull(),

    // Version Configuration
    baselineCommitId: bigint('baseline_commit_id', { mode: 'number' })
      .notNull()
      .references(() => commits.id),
    challengerCommitId: bigint('challenger_commit_id', { mode: 'number' })
      .notNull()
      .references(() => commits.id),

    // Test Type & Settings
    testType: varchar('test_type', { length: 20 }).notNull(), // 'shadow' | 'ab'
    trafficPercentage: integer('traffic_percentage').default(50), // For A/B: % of traffic to challenger (0-100)

    // Status
    status: varchar('status', { length: 20 }).notNull().default('pending'), // 'pending' | 'running' | 'paused' | 'completed' | 'cancelled'
    startedAt: timestamp('started_at'),
    endedAt: timestamp('ended_at'),

    // Evaluation Configuration
    evaluationUuids: text('evaluation_uuids').default('{}'), // JSON array of evaluation UUIDs
    useCompositeEvaluation: boolean('use_composite_evaluation').default(true),

    // Metadata
    name: varchar('name', { length: 256 }),
    description: text('description'),
    createdByUserId: text('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),

    ...timestamps(),
    deletedAt: timestamp('deleted_at'),
  },
  (table) => [
    index('idx_deployment_tests_workspace').on(table.workspaceId),
    index('idx_deployment_tests_project').on(table.projectId),
    index('idx_deployment_tests_status').on(table.status),
    index('idx_deployment_tests_document').on(table.documentUuid),
    uniqueIndex('idx_active_test_per_document')
      .on(table.projectId, table.documentUuid)
      .where(
        sql`status IN ('pending', 'running', 'paused') AND deleted_at IS NULL`,
      ),
  ],
)
