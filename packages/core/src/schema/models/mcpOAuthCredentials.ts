import { bigint, bigserial, index, text, timestamp } from 'drizzle-orm/pg-core'

import { latitudeSchema } from '../db-schema'
import { timestamps } from '../schemaHelpers'
import { integrations } from './integrations'

export const mcpOAuthCredentials = latitudeSchema.table(
  'mcp_oauth_credentials',
  {
    id: bigserial('id', { mode: 'number' }).notNull().primaryKey(),
    integrationId: bigint('integration_id', { mode: 'number' })
      .notNull()
      .references(() => integrations.id, { onDelete: 'cascade' })
      .unique(),
    clientId: text('client_id'),
    clientSecret: text('client_secret'),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    tokenExpiresAt: timestamp('token_expires_at'),
    codeVerifier: text('code_verifier'),
    ...timestamps(),
  },
  (table) => ({
    integrationIdIdx: index('mcp_oauth_credentials_integration_id_idx').on(
      table.integrationId,
    ),
  }),
)
