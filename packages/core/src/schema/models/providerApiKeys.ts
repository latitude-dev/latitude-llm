import { Providers } from '$core/browser'
import { relations } from 'drizzle-orm'
import {
  bigint,
  bigserial,
  index,
  text,
  timestamp,
  unique,
  varchar,
} from 'drizzle-orm/pg-core'

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
])

export const providerApiKeys = latitudeSchema.table(
  'provider_api_keys',
  {
    id: bigserial('id', { mode: 'number' }).notNull().primaryKey(),
    name: varchar('name').notNull(),
    token: varchar('token').notNull(),
    provider: providersEnum('provider').notNull(),
    authorId: text('author_id')
      .notNull()
      .references(() => users.id),
    workspaceId: bigint('workspace_id', { mode: 'number' })
      .notNull()
      .references(() => workspaces.id),
    lastUsedAt: timestamp('last_used_at'),
    ...timestamps(),
  },
  (table) => ({
    workspaceIdIdx: index('provider_apikeys_workspace_id_idx').on(
      table.workspaceId,
    ),
    userIdIdx: index('provider_apikeys_user_id_idx').on(table.authorId),
    uniqueTokenByProvider: unique('provider_apikeys_token_provider_unique').on(
      table.token,
      table.provider,
    ),
  }),
)

export const providerApiKeysRelations = relations(
  providerApiKeys,
  ({ one }) => ({
    author: one(users, {
      fields: [providerApiKeys.authorId],
      references: [users.id],
    }),
    workspace: one(workspaces, {
      fields: [providerApiKeys.workspaceId],
      references: [workspaces.id],
    }),
  }),
)
