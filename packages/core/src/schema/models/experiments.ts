import {
  bigint,
  bigserial,
  index,
  jsonb,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'

import { latitudeSchema } from '../db-schema'
import { timestamps } from '../schemaHelpers'
import { commits } from './commits'
import { ExperimentMetadata } from '@latitude-data/constants/experiments'
import { datasets } from './datasets'
import { sql } from 'drizzle-orm'
import { workspaces } from './workspaces'

export const experiments = latitudeSchema.table(
  'experiments',
  {
    id: bigserial('id', { mode: 'number' }).notNull().primaryKey(),
    uuid: uuid('uuid')
      .notNull()
      .default(sql`gen_random_uuid()`)
      .unique(),
    name: varchar('name', { length: 256 }).notNull(),
    workspaceId: bigint('workspace_id', { mode: 'number' })
      .notNull()
      .references(() => workspaces.id, {
        onDelete: 'cascade',
        onUpdate: 'cascade',
      }),
    commitId: bigint('commit_id', { mode: 'number' })
      .notNull()
      .references(() => commits.id, { onDelete: 'cascade' }),
    documentUuid: uuid('document_uuid').notNull(),
    evaluationUuids: uuid('evaluation_uuids')
      .array()
      .notNull()
      .default(sql`'{}'::uuid[]`),
    datasetId: bigint('dataset_id', { mode: 'number' }).references(
      () => datasets.id,
      {
        onDelete: 'restrict',
        onUpdate: 'cascade',
      },
    ),
    metadata: jsonb('metadata').$type<ExperimentMetadata>().notNull(),
    startedAt: timestamp('started_at'), // Start time can be null if experiment is still pending
    finishedAt: timestamp('finished_at'), // Finish time can be null if experiment has still not finished
    ...timestamps(),
  },
  (table) => ({
    workspaceIdIdx: index('experiments_workspace_id_idx').on(table.workspaceId),
    documentUuidIdx: index('experiments_document_uuid_idx').on(
      table.documentUuid,
    ),
    documentCommitIdx: index('experiments_document_commit_idx').on(
      table.commitId,
      table.documentUuid,
    ),
    datasetIdIdx: index('experiments_dataset_id_idx').on(table.datasetId),
  }),
)
