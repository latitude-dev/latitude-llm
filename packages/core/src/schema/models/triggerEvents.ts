import { bigint, bigserial, index, jsonb, uuid } from 'drizzle-orm/pg-core'

import { latitudeSchema } from '../db-schema'
import { timestamps } from '../schemaHelpers'
import { documentLogs } from './documentLogs'
import { workspaces } from './workspaces'
import { commits } from './commits'

export const triggerEvents = latitudeSchema.table(
  'trigger_events',
  {
    id: bigserial('id', { mode: 'number' }).notNull().primaryKey(),
    workspaceId: bigint('workspace_id', { mode: 'number' })
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    triggerUuid: uuid('trigger_uuid').notNull(),
    commitId: bigint('commit_id', { mode: 'number' })
      .notNull()
      .references(() => commits.id, { onDelete: 'cascade' }),
    payload: jsonb('payload'),
    documentLogUuid: uuid('document_log_uuid').references(
      () => documentLogs.uuid,
      { onDelete: 'set null' },
    ),
    ...timestamps(),
  },
  (table) => ({
    triggerEventsWorkspaceIdx: index('trigger_events_workspace_idx').on(
      table.workspaceId,
    ),
    triggerUuidIdx: index('trigger_events_trigger_uuid_idx').on(
      table.triggerUuid,
    ),
    documentLogUuidIdx: index('trigger_events_document_log_uuid_idx').on(
      table.documentLogUuid,
    ),
  }),
)
