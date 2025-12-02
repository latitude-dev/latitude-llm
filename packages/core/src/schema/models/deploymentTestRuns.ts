import { sql } from 'drizzle-orm'
import {
  bigint,
  bigserial,
  index,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'

import { latitudeSchema } from '../db-schema'
import { workspaces } from './workspaces'
import { deploymentTests } from './deploymentTests'

export const deploymentTestRuns = latitudeSchema.table(
  'deployment_test_runs',
  {
    id: bigserial('id', { mode: 'number' }).notNull().primaryKey(),
    uuid: uuid('uuid')
      .notNull()
      .unique()
      .default(sql`gen_random_uuid()`),
    workspaceId: bigint('workspace_id', { mode: 'number' })
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    deploymentTestId: bigint('deployment_test_id', { mode: 'number' })
      .notNull()
      .references(() => deploymentTests.id, { onDelete: 'cascade' }),

    // Run Context
    apiRequestId: varchar('api_request_id', { length: 256 }),
    customIdentifier: varchar('custom_identifier', { length: 256 }),

    // Routing Decision
    routedTo: varchar('routed_to', { length: 20 }).notNull(), // 'baseline' | 'challenger'

    // Linked Runs
    baselineDocumentLogUuid: uuid('baseline_document_log_uuid'),
    challengerDocumentLogUuid: uuid('challenger_document_log_uuid'),

    // Timing
    createdAt: timestamp('created_at')
      .notNull()
      .default(sql`now()`),
  },
  (table) => [
    index('idx_test_runs_test').on(table.deploymentTestId),
    index('idx_test_runs_request').on(table.apiRequestId),
  ],
)
