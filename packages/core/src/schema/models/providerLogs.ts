import { LogSources } from '$core/constants'
import { relations } from 'drizzle-orm'
import {
  bigint,
  bigserial,
  integer,
  json,
  text,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'

import { apiKeys } from '..'
import { latitudeSchema } from '../db-schema'
import { timestamps } from '../schemaHelpers'
import { providerApiKeys } from './providerApiKeys'

export const logSourcesEnum = latitudeSchema.enum('log_source', [
  LogSources.Playground,
  LogSources.API,
])

export const providerLogs = latitudeSchema.table('provider_logs', {
  id: bigserial('id', { mode: 'number' }).notNull().primaryKey(),
  uuid: uuid('uuid').notNull().unique(),
  documentLogUuid: uuid('document_log_uuid'),
  providerId: bigint('provider_id', { mode: 'number' })
    .notNull()
    .references(() => providerApiKeys.id, {
      onDelete: 'restrict',
      onUpdate: 'cascade',
    }),
  model: varchar('model'),
  config: json('config').notNull(),
  messages: json('messages').notNull(),
  responseText: text('response_text'),
  toolCalls: json('tool_calls'),
  tokens: bigint('tokens', { mode: 'number' }).notNull(),
  cost: integer('cost').notNull(),
  duration: bigint('duration', { mode: 'number' }).notNull(),
  source: logSourcesEnum('source').notNull(),
  apiKeyId: bigint('apiKeyId', { mode: 'number' }).references(
    () => apiKeys.id,
    {
      onDelete: 'restrict',
      onUpdate: 'cascade',
    },
  ),
  ...timestamps(),
})

export const providerLogsRelations = relations(providerLogs, ({ one }) => ({
  provider: one(providerApiKeys, {
    fields: [providerLogs.providerId],
    references: [providerApiKeys.id],
  }),
  apiKey: one(apiKeys, {
    fields: [providerLogs.apiKeyId],
    references: [apiKeys.id],
  }),
}))
