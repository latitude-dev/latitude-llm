import { eq, and } from 'drizzle-orm'
import { Workspace } from '../../browser'
import { database } from '../../client'
import { BadRequestError, Result, Transaction } from '../../lib'
import {
  users,
  oauthAccounts,
  memberships,
  workspaces,
  OAuthProvider,
} from '../../schema'
import setupServiceFn from '../users/setupService'

interface FindOrCreateUserFromOAuthInput {
  providerId: OAuthProvider
  providerUserId: string // e.g., googleUser.sub
  email: string
  name: string // Name provided by OAuth provider
  // You might add other fields like picture URL if needed
}

/**
 * Finds an existing user based on OAuth provider info or email,
 * or creates a new user, workspace, and membership using setupService if they don't exist.
 * Always ensures the OAuth account is linked.
 * Returns the full User and Workspace objects along with a flag indicating if the user is new.
 */
export function findOrCreateUserFromOAuth(
  { providerId, providerUserId, email, name }: FindOrCreateUserFromOAuthInput,
  db = database,
) {
  return Transaction.call(async (tx) => {
    const getUserAndWorkspace = async (userId: string) => {
      const user = await tx
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1)
        .then((res) => res[0])

      if (!user) return null

      const firstMembership = await tx
        .select({ workspaceId: memberships.workspaceId })
        .from(memberships)
        .where(eq(memberships.userId, userId))
        .limit(1)
        .then((res) => res[0])

      if (!firstMembership) return null

      const workspace = await tx
        .select()
        .from(workspaces)
        .where(eq(workspaces.id, firstMembership.workspaceId))
        .limit(1)
        .then((res) => res[0])

      if (!workspace) return null

      return { user, workspace }
    }

    const existingOAuthAccount = await tx
      .select({ userId: oauthAccounts.userId })
      .from(oauthAccounts)
      .where(
        and(
          eq(oauthAccounts.providerId, providerId),
          eq(oauthAccounts.providerUserId, providerUserId),
        ),
      )
      .limit(1)
      .then((res) => res[0])

    if (existingOAuthAccount) {
      const found = await getUserAndWorkspace(existingOAuthAccount.userId)
      if (!found) {
        throw new Error(
          `Data inconsistency: User ${existingOAuthAccount.userId} or their workspace not found.`,
        )
      }

      return Result.ok({ ...found, isNewUser: false })
    }

    const existingUserByEmail = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1)
      .then((res) => res[0])

    if (existingUserByEmail) {
      await tx.insert(oauthAccounts).values({
        providerId,
        providerUserId,
        userId: existingUserByEmail.id,
      })

      const found = await getUserAndWorkspace(existingUserByEmail.id)
      if (!found) {
        throw new BadRequestError(
          `Data inconsistency: User ${existingUserByEmail.id} or their workspace not found.`,
        )
      }
      return Result.ok({ ...found, isNewUser: false })
    }

    const setupResult = await setupServiceFn(
      {
        email,
        name,
        companyName: `${name}'s Workspace`,
      },
      tx,
    )

    if (setupResult.error) {
      throw setupResult.error
    }

    const { user: newUser, workspace: newWorkspaceDto } = setupResult.value

    await tx.insert(oauthAccounts).values({
      providerId,
      providerUserId,
      userId: newUser.id,
    })

    return Result.ok({
      user: newUser,
      workspace: newWorkspaceDto as Workspace,
      isNewUser: true,
    })
  }, db)
}
