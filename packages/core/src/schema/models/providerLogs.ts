import type { Message, ToolCall } from '@latitude-data/constants/messages'
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

import { sql } from 'drizzle-orm'
import { LogSources } from '../../constants'
import { PartialConfig } from '../../services/ai'
import { latitudeSchema } from '../db-schema'
import { apiKeys } from '../models/apiKeys'
import { timestamps } from '../schemaHelpers'
import { providerApiKeys } from './providerApiKeys'
import { workspaces } from './workspaces'
import { ChainStepResponse, StreamType } from '@latitude-data/constants'

export const logSourcesEnum = latitudeSchema.enum(
  'log_source',
  Object.values(LogSources) as [string, ...string[]],
)

export const providerLogs = latitudeSchema.table(
  'provider_logs',
  {
    id: bigserial('id', { mode: 'number' }).notNull().primaryKey(),
    workspaceId: bigint('workspace_id', { mode: 'number' }).references(
      () => workspaces.id,
      { onDelete: 'cascade' },
    ),
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
    messages: json('messages').$type<Message[]>().default([]),
    output: json('output').$type<ChainStepResponse<StreamType>['output']>(),
    responseObject: jsonb('response_object').$type<unknown>(),
    responseText: text('response_text').$type<string>(),
    responseReasoning: text('response_reasoning').$type<string>(),
    toolCalls: json('tool_calls').$type<ToolCall[]>().default([]),
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
    fileKey: varchar('file_key'), // Key for file storage containing JSON data
    ...timestamps(),
  },
  (table) => [
    index('provider_idx').on(table.providerId),
    index('provider_logs_created_at_idx').on(table.createdAt),
    index().on(table.workspaceId),
    index('document_uuid_idx').on(table.documentLogUuid),
    index('provider_logs_document_log_model_idx').on(
      table.documentLogUuid,
      table.model,
    ),
    index('provider_logs_created_at_brin_idx')
      .using('brin', sql`${table.createdAt}`)
      .with({
        pages_per_range: 32,
        autosummarize: true,
      })
      .concurrently(),
  ],
)
