import { sql } from 'drizzle-orm'
import {
  bigint,
  bigserial,
  index,
  integer,
  text,
  timestamp,
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
    // Version Configuration
    challengerCommitId: bigint('challenger_commit_id', { mode: 'number' })
      .notNull()
      .references(() => commits.id),

    // Test Type & Settings
    testType: varchar('test_type', {
      length: 20,
      enum: ['shadow', 'ab'],
    }).notNull(),
    trafficPercentage: integer('traffic_percentage').default(50), // For A/B: % of traffic to challenger (0-100). For Shadow: % of traffic to shadow (defaults to 100)

    // Status
    status: varchar('status', {
      length: 20,
      enum: ['pending', 'running', 'paused', 'completed', 'cancelled'],
    })
      .notNull()
      .default('pending'),
    startedAt: timestamp('started_at'),
    endedAt: timestamp('ended_at'),

    // Metadata
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
    index('idx_deployment_tests_project_type_status').on(
      table.projectId,
      table.testType,
      table.status,
    ),
  ],
)
