import type { Message, ToolCall } from '@latitude-data/compiler'
import {
  bigint,
  bigserial,
  index,
  integer,
  json,
  jsonb,
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

export const logSourcesEnum = latitudeSchema.enum(
  'log_source',
  Object.values(LogSources) as [string, ...string[]],
)

export const providerLogs = latitudeSchema.table(
  'provider_logs',
  {
    id: bigserial('id', { mode: 'number' }).notNull().primaryKey(),
    workspaceId: bigint('workspace_id', { mode: 'number' }),
    uuid: uuid('uuid').notNull().unique(),
    documentLogUuid: uuid('document_log_uuid'), // Note: this seems to be used for document logs and evaluation results, we should probably rename it or use two columns
    providerId: bigint('provider_id', { mode: 'number' }).references(
      () => providerApiKeys.id,
      {
        onDelete: 'restrict',
        onUpdate: 'cascade',
      },
    ),
    model: varchar('model'),
    finishReason: varchar('finish_reason').default('stop'),
    config: json('config').$type<PartialConfig>(),
    messages: json('messages').$type<Message[]>().notNull(),
    responseObject: jsonb('response_object').$type<unknown>(),
    responseText: text('response_text').$type<string>(),
    toolCalls: json('tool_calls').$type<ToolCall[]>().notNull().default([]),
    tokens: bigint('tokens', { mode: 'number' }),
    costInMillicents: integer('cost_in_millicents').notNull().default(0),
    duration: bigint('duration', { mode: 'number' }), // in milliseconds!
    source: logSourcesEnum('source').$type<LogSources>().notNull(),
    apiKeyId: bigint('apiKeyId', { mode: 'number' }).references(
      () => apiKeys.id,
      {
        onDelete: 'restrict',
        onUpdate: 'cascade',
      },
    ),
    generatedAt: timestamp('generated_at', { mode: 'date' }),
    ...timestamps(),
  },
  (table) => ({
    providerIdx: index('provider_idx').on(table.providerId),
    createdAtIdx: index('provider_logs_created_at_idx').on(table.createdAt),
    workspaceIdx: index().on(table.workspaceId),
    documentUuidIdx: index('document_uuid_idx').on(table.documentLogUuid),
    documentLogModelIdx: index('provider_logs_document_log_model_idx').on(
      table.documentLogUuid,
      table.model,
    ),
  }),
)
