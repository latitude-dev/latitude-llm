import { bigint, bigserial, index, jsonb, uuid } from 'drizzle-orm/pg-core'

import { latitudeSchema } from '../db-schema'
import { timestamps } from '../schemaHelpers'
import { documentLogs } from './documentLogs'
import { workspaces } from './workspaces'
import { commits } from './commits'
import { DocumentTriggerType } from '@latitude-data/constants'
import { DocumentTriggerEventPayload } from '@latitude-data/constants/documentTriggers'
import { documentTriggerTypeEnum } from './documentTriggers'

export const documentTriggerEvents = latitudeSchema.table(
  'document_trigger_events',
  {
    id: bigserial('id', { mode: 'number' }).notNull().primaryKey(),
    workspaceId: bigint('workspace_id', { mode: 'number' })
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    commitId: bigint('commit_id', { mode: 'number' })
      .notNull()
      .references(() => commits.id, { onDelete: 'cascade' }),
    triggerUuid: uuid('trigger_uuid').notNull(),
    triggerType: documentTriggerTypeEnum('trigger_type').notNull(),
    payload:
      jsonb('payload').$type<
        DocumentTriggerEventPayload<DocumentTriggerType>
      >(),
    documentLogUuid: uuid('document_log_uuid').references(
      () => documentLogs.uuid,
      { onDelete: 'set null' },
    ),
    ...timestamps(),
  },
  (table) => ({
    documentTriggerEventsWorkspaceIdx: index(
      'document_trigger_events_workspace_idx',
    ).on(table.workspaceId),
    documentTriggerEventsTriggerUuidIdx: index(
      'document_trigger_events_trigger_uuid_idx',
    ).on(table.triggerUuid),
    documentTriggerEventsDocumentLogUuidIdx: index(
      'document_trigger_events_document_log_uuid_idx',
    ).on(table.documentLogUuid),
  }),
)
