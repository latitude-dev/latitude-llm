import { bigint, bigserial, boolean, index, text, timestamp, varchar } from 'drizzle-orm/pg-core'

import type { Events } from '../../events/events'
import { latitudeSchema } from '../db-schema'
import { timestamps } from '../schemaHelpers'
import { workspaces } from './workspaces'

export const webhooks = latitudeSchema.table(
  'webhooks',
  {
    id: bigserial('id', { mode: 'number' }).notNull().primaryKey(),
    workspaceId: bigint('workspace_id', { mode: 'number' })
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 256 }).notNull(),
    url: text('url').notNull(),
    secret: text('secret').notNull(), // For HMAC signing
    projectIds: bigint('project_ids', { mode: 'number' }).array().default([]), // Optional filter for specific projects
    isActive: boolean('is_active').notNull().default(true),
    lastTriggeredAt: timestamp('last_triggered_at'),
    ...timestamps(),
  },
  (table) => ({
    workspaceIdIdx: index('webhooks_workspace_id_idx').on(table.workspaceId),
    projectIdsIdx: index('webhooks_project_ids_idx').on(table.projectIds),
  }),
)

export const webhookDeliveries = latitudeSchema.table(
  'webhook_deliveries',
  {
    id: bigserial('id', { mode: 'number' }).notNull().primaryKey(),
    webhookId: bigint('webhook_id', { mode: 'number' })
      .notNull()
      .references(() => webhooks.id, { onDelete: 'cascade' }),
    eventType: varchar('event_type', { length: 256 }).$type<Events>().notNull(),
    status: varchar('status', { length: 64 }).notNull(), // 'success', 'failed', 'retrying'
    responseStatus: bigint('response_status', { mode: 'number' }),
    responseBody: text('response_body'),
    errorMessage: text('error_message'),
    attemptCount: bigint('attempt_count', { mode: 'number' }).notNull().default(1),
    nextRetryAt: timestamp('next_retry_at'),
    ...timestamps(),
  },
  (table) => ({
    webhookIdIdx: index('webhook_deliveries_webhook_id_idx').on(table.webhookId),
    statusIdx: index('webhook_deliveries_status_idx').on(table.status),
    nextRetryAtIdx: index('webhook_deliveries_next_retry_at_idx').on(table.nextRetryAt),
  }),
)
