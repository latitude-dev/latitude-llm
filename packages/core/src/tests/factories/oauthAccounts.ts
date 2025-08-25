import { faker } from '@faker-js/faker'

import { database } from '../../client'
import { oauthAccounts, OAuthProvider } from '../../schema'
import type { oauthAccounts as OauthAccountsTable } from '../../schema'
import { createUser } from './users'
import type { ICreateUser } from './users'

type OauthAccountsInsert = typeof OauthAccountsTable.$inferInsert

function makeRandomOAuthAccountData() {
  return {
    providerId: OAuthProvider.GOOGLE,
    providerUserId: `google-user-${faker.string.uuid()}`,
  }
}

export const createOAuthAccount = async (
  overrides: Partial<
    Omit<OauthAccountsInsert, 'id' | 'createdAt' | 'updatedAt'> & {
      user: Partial<ICreateUser>
    }
  > = {},
) => {
  const { user, ...rest } = overrides

  let userId = rest.userId
  if (!userId) {
    const createdUser = await createUser(user ?? {})
    userId = createdUser.id
  }

  const defaults = makeRandomOAuthAccountData()
  const data: OauthAccountsInsert = {
    ...defaults,
    ...rest,
    userId: userId!,
  }

  const [newOAuthAccount] = await database.insert(oauthAccounts).values(data).returning()

  return newOAuthAccount
}
