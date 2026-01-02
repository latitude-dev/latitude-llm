import {
  bigint,
  bigserial,
  index,
  text,
  timestamp,
  varchar,
} from 'drizzle-orm/pg-core'

import { latitudeSchema } from '../db-schema'
import { timestamps } from '../schemaHelpers'
import { integrations } from './integrations'
import { workspaces } from './workspaces'
import { users } from './users'

export const mcpOAuthCredentials = latitudeSchema.table(
  'mcp_oauth_credentials',
  {
    id: bigserial('id', { mode: 'number' }).notNull().primaryKey(),
    workspaceId: bigint('workspace_id', { mode: 'number' })
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    integrationId: bigint('integration_id', { mode: 'number' })
      .notNull()
      .references(() => integrations.id, { onDelete: 'cascade' })
      .unique(),
    authorId: varchar('author_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    clientId: text('client_id'),
    clientSecret: text('client_secret'),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    tokenExpiresAt: timestamp('token_expires_at'),
    codeVerifier: text('code_verifier'),
    ...timestamps(),
  },
  (table) => ({
    workspaceIdIdx: index('mcp_oauth_credentials_workspace_id_idx').on(
      table.workspaceId,
    ),
    integrationIdIdx: index('mcp_oauth_credentials_integration_id_idx').on(
      table.integrationId,
    ),
    authorIdIdx: index('mcp_oauth_credentials_author_id_idx').on(
      table.authorId,
    ),
  }),
)
