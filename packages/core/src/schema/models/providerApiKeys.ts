import {
  bigint,
  bigserial,
  index,
  jsonb,
  text,
  timestamp,
  unique,
  varchar,
} from 'drizzle-orm/pg-core'

import { Providers } from '../../browser'
import {
  AmazonBedrockConfiguration,
  VertexConfiguration,
} from '../../services/ai'
import { OpenAIProviderConfiguration } from '../../services/ai/providers/helpers/openai'
import { latitudeSchema } from '../db-schema'
import { timestamps } from '../schemaHelpers'
import { users } from './users'
import { workspaces } from './workspaces'

export const providersEnum = latitudeSchema.enum('provider', [
  Providers.OpenAI,
  Providers.Anthropic,
  Providers.Groq,
  Providers.Mistral,
  Providers.Azure,
  Providers.Google,
  Providers.GoogleVertex,
  Providers.AnthropicVertex,
  Providers.XAI,
  Providers.DeepSeek,
  Providers.Perplexity,
  Providers.Custom,
  Providers.AmazonBedrock,
])

export type ProviderConfiguration<P extends Providers> =
  P extends Providers.GoogleVertex
    ? VertexConfiguration
    : P extends Providers.AmazonBedrock
      ? AmazonBedrockConfiguration
      : P extends Providers.OpenAI
        ? OpenAIProviderConfiguration
        : never

export const providerApiKeys = latitudeSchema.table(
  'provider_api_keys',
  {
    id: bigserial('id', { mode: 'number' }).notNull().primaryKey(),
    name: varchar('name').notNull(),
    token: varchar('token').notNull(),
    provider: providersEnum('provider').notNull(),
    url: varchar('url'),
    defaultModel: varchar('default_model'),
    authorId: text('author_id')
      .notNull()
      .references(() => users.id),
    workspaceId: bigint('workspace_id', { mode: 'number' })
      .notNull()
      .references(() => workspaces.id),
    lastUsedAt: timestamp('last_used_at'),
    deletedAt: timestamp('deleted_at'),
    configuration:
      jsonb('configuration').$type<ProviderConfiguration<Providers>>(),
    ...timestamps(),
  },
  (table) => ({
    workspaceIdIdx: index('provider_apikeys_workspace_id_idx').on(
      table.workspaceId,
    ),
    nameIdx: index().on(table.name, table.workspaceId, table.deletedAt),
    nameUniqueness: unique()
      .on(table.name, table.workspaceId, table.deletedAt)
      .nullsNotDistinct(),
    userIdIdx: index('provider_apikeys_user_id_idx').on(table.authorId),
    tokenIdx: index().on(
      table.token,
      table.provider,
      table.workspaceId,
      table.deletedAt,
    ),
  }),
)
