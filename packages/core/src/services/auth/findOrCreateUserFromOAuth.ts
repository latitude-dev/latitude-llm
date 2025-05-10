import { eq, and } from 'drizzle-orm'
// import { Workspace } from '../../browser' // Removed incorrect import
import { database } from '../../client'
import { validateInvitation } from '../invitations/validateInvitation'
import { useInvitation } from '../invitations/useInvitation'
import {
  users,
  oauthAccounts,
  memberships,
  workspaces,
  OAuthProvider,
  Invitation, // Added
  // type User as CoreUser, // Incorrect: 'User' type is not exported directly
} from '../../schema'

type CoreUser = typeof users.$inferSelect; // Correctly infer from users table
type CoreWorkspace = typeof workspaces.$inferSelect; // Define correct workspace type
// import setupServiceFn from '../users/setupService' // Will be replaced by direct calls
import { createUser } from '../users/createUser' // Added
import { createMembership } from '../memberships/create' // Added
import { BadRequestError, NotFoundError } from './../../lib/errors' // Added NotFoundError
import { Result } from './../../lib/Result'
import Transaction from './../../lib/Transaction'
import { env } from '@latitude-data/env'

interface FindOrCreateUserFromOAuthInput {
  providerId: OAuthProvider
  providerUserId: string
  email: string
  name: string
  invitationToken?: string // Added for invite-only flow
}

/**
 * Finds an existing user based on OAuth provider info or email,
 * or creates a new user, workspace, and membership using setupService if they don't exist.
 * Always ensures the OAuth account is linked.
 * Returns the full User and Workspace objects along with a flag indicating if the user is new.
 */
export function findOrCreateUserFromOAuth(
  { providerId, providerUserId, email, name, invitationToken }: FindOrCreateUserFromOAuthInput,
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

    // New user flow
    let newUser: CoreUser
    let targetWorkspace: CoreWorkspace

    if (env.INVITE_ONLY) {
      if (!invitationToken) {
        throw new BadRequestError('An invitation is required to create a new account.')
      }
      const validationResult = await validateInvitation({ token: invitationToken }, tx)
      if (!validationResult.ok) {
        throw new BadRequestError(validationResult.error?.message || 'Invalid or expired invitation token.')
      }
      const invitation: Invitation = validationResult.unwrap()
      if (email.toLowerCase() !== invitation.email.toLowerCase()) {
        throw new BadRequestError('The email provided does not match the invited email address.')
      }

      // Create user
      const createUserResult = await createUser(
        { email, name, confirmedAt: new Date() }, // OAuth users are auto-confirmed
        tx,
      )
      if (!createUserResult.ok) {
        throw new Error(createUserResult.error?.message || 'Failed to create user.')
      }
      newUser = createUserResult.unwrap()

      // Get the workspace from invitation
      const existingWorkspace = await tx.query.workspaces.findFirst({
        where: eq(workspaces.id, Number(invitation.workspaceId)), // Ensure workspaceId is number
      })
      if (!existingWorkspace) {
        throw new NotFoundError(`Invited workspace (ID: ${invitation.workspaceId}) not found.`)
      }
      targetWorkspace = existingWorkspace

      // Add user to the invited workspace
      const membershipResult = await createMembership(
        { user: newUser, workspace: targetWorkspace, author: newUser }, // author could be system or inviter if needed
        tx,
      )
      if (!membershipResult.ok) {
        throw new Error(membershipResult.error?.message || 'Failed to create membership in invited workspace.')
      }

      // Link OAuth account
      await tx.insert(oauthAccounts).values({
        providerId,
        providerUserId,
        userId: newUser.id,
      })

      // Mark invitation as used
      const useInviteResult = await useInvitation({ token: invitationToken /*, userId: newUser.id */ }, tx)
      if (!useInviteResult.ok) {
        console.error(
          `CRITICAL: User ${newUser.id} created via OAuth with invitation ${invitationToken}, but failed to mark token as used: ${useInviteResult.error?.message}`,
        )
        // Potentially throw to rollback, or handle as critical but non-blocking
      }
    } else {
      // INVITE_ONLY is false, use original setupServiceFn logic or its equivalent
      // For now, replicating the core parts of setupServiceFn for user and workspace creation:
      const createUserResult = await createUser(
        { email, name, confirmedAt: new Date() },
        tx,
      )
      if (!createUserResult.ok) {
        throw new Error(createUserResult.error?.message || 'Failed to create user.')
      }
      newUser = createUserResult.unwrap()

      // Create a new workspace for the user
      // This part would ideally use a refined `createWorkspace` service if `setupServiceFn` is too broad
      const newWorkspaceResult = await tx
        .insert(workspaces)
        .values({ name: `${name}'s Workspace`, creatorId: newUser.id /* other defaults */ })
        .returning()
      if (newWorkspaceResult.length === 0) {
        throw new Error('Failed to create workspace.')
      }
      targetWorkspace = newWorkspaceResult[0]

      // Add user to their new workspace
      const membershipResult = await createMembership(
        { user: newUser, workspace: targetWorkspace, author: newUser },
        tx,
      )
      if (!membershipResult.ok) {
        throw new Error(membershipResult.error?.message || 'Failed to create membership in new workspace.')
      }
      
      // Link OAuth account
      await tx.insert(oauthAccounts).values({
        providerId,
        providerUserId,
        userId: newUser.id,
      })
    }

    if (!newUser || !targetWorkspace) {
      // This case should ideally be unreachable due to prior checks and error throws
      // in the new user creation flow.
      console.error(
        'Critical error: newUser or targetWorkspace is undefined in findOrCreateUserFromOAuth before final return for new user.',
      )
      throw new Error('User or Workspace data is unexpectedly missing during new user processing.')
    }

    return Result.ok({
      user: newUser,
      workspace: targetWorkspace, // Use correctly typed variable
      isNewUser: true,
    })
  }, db)
}
