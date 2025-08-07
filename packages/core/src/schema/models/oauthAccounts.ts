import { index, primaryKey, text } from 'drizzle-orm/pg-core'
import { latitudeSchema } from '../db-schema' // Import latitudeSchema
import { users } from './users'

export enum OAuthProvider {
  GOOGLE = 'google',
  GITHUB = 'github',
}

// Define the enum for OAuth providers
export const oauthProvidersEnum = latitudeSchema.enum('oauth_providers', [
  OAuthProvider.GOOGLE,
  OAuthProvider.GITHUB,
])

export const oauthAccounts = latitudeSchema.table(
  'oauth_accounts',
  {
    providerId: oauthProvidersEnum('provider_id').notNull(),
    providerUserId: text('provider_user_id').notNull(), // User ID from the provider
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }), // Link to your users table
  },
  (table) => {
    return {
      // Composite primary key ensures a user can only link one account per provider
      pk: primaryKey({ columns: [table.providerId, table.providerUserId] }),
      // Index on userId for efficient lookup of a user's linked accounts
      userIdIdx: index('oauth_accounts_user_id_idx').on(table.userId),
    }
  },
)
