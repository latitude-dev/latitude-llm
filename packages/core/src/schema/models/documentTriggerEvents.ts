import {
  bigint,
  bigserial,
  index,
  jsonb,
  text,
  uuid,
} from 'drizzle-orm/pg-core'

import { latitudeSchema } from '../db-schema'
import { timestamps } from '../schemaHelpers'
import { documentLogs } from '../legacyModels/documentLogs'
import { workspaces } from './workspaces'
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
    triggerUuid: uuid('trigger_uuid').notNull(),
    triggerType: documentTriggerTypeEnum('trigger_type').notNull(),
    triggerHash: text('trigger_hash').notNull(),
    payload:
      jsonb('payload').$type<
        DocumentTriggerEventPayload<DocumentTriggerType>
      >(),
    // FIXME: Remove dependency with documentLogs table
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
    documentTriggerEventsTriggerHashIdx: index(
      'document_trigger_events_trigger_hash_idx',
    ).on(table.triggerHash),
  }),
)
