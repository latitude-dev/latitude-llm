import {
  bigint,
  bigserial,
  index,
  text,
  timestamp,
  unique,
  varchar,
} from 'drizzle-orm/pg-core'

import { Providers } from '../../browser'
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
  Providers.Custom,
])

export const providerApiKeys = latitudeSchema.table(
  'provider_api_keys',
  {
    id: bigserial('id', { mode: 'number' }).notNull().primaryKey(),
    name: varchar('name').notNull(),
    token: varchar('token').notNull(),
    provider: providersEnum('provider').notNull(),
    url: varchar('url'),
    authorId: text('author_id')
      .notNull()
      .references(() => users.id),
    workspaceId: bigint('workspace_id', { mode: 'number' })
      .notNull()
      .references(() => workspaces.id),
    lastUsedAt: timestamp('last_used_at'),
    deletedAt: timestamp('deleted_at'),
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
    // TODO: This constrain is not working for some reason
    tokenUniquenessByProvider: unique()
      .on(table.token, table.provider, table.workspaceId, table.deletedAt)
      .nullsNotDistinct(),
  }),
)
