import { Message, ToolCall } from '@latitude-data/compiler'
import {
  bigint,
  bigserial,
  integer,
  json,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'

import { LogSources } from '../../constants'
import { PartialConfig } from '../../services/ai'
import { latitudeSchema } from '../db-schema'
import { apiKeys } from '../models/apiKeys'
import { timestamps } from '../schemaHelpers'
import { providerApiKeys } from './providerApiKeys'

export const logSourcesEnum = latitudeSchema.enum('log_source', [
  LogSources.Playground,
  LogSources.API,
  LogSources.Evaluation,
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
  config: json('config').$type<PartialConfig>().notNull(),
  messages: json('messages').$type<Message[]>().notNull(),
  responseText: text('response_text').$type<string>().notNull().default(''),
  toolCalls: json('tool_calls').$type<ToolCall[]>().notNull().default([]),
  tokens: bigint('tokens', { mode: 'number' }).notNull(),
  cost_in_millicents: integer('cost_in_millicents').notNull().default(0),
  duration: bigint('duration', { mode: 'number' }).notNull(), // in milliseconds!
  source: logSourcesEnum('source').notNull(),
  apiKeyId: bigint('apiKeyId', { mode: 'number' }).references(
    () => apiKeys.id,
    {
      onDelete: 'restrict',
      onUpdate: 'cascade',
    },
  ),
  generatedAt: timestamp('generated_at', { mode: 'date' }).notNull(),
  ...timestamps(),
})
