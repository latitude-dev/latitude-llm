import { eq } from 'drizzle-orm'

import { User, Workspace } from '../../browser'
import { database } from '../../client'
import { env } from '@latitude-data/env'
import { publisher } from '../../events/publisher'
import { Result, TypedResult } from '../../lib/Result'
import Transaction from './../../lib/Transaction'
import { Invitation, users } from '../../schema'
import { createMembership } from '../memberships/create'
import { createInvitation } from '../invitations/createInvitation'
import { createUser } from './createUser'

export type InviteUserOutcome =
  | { status: 'invitation_created'; invitation: Invitation }
  | { status: 'user_added_to_workspace'; user: User }

export async function inviteUser(
  {
    name,
    email,
    workspace,
    author,
  }: {
    email: string
    name?: string
    workspace: Workspace
    author: User
  },
  db = database,
): Promise<TypedResult<InviteUserOutcome, Error>> {
  let user = await db.query.users.findFirst({ where: eq(users.email, email) })

  return Transaction.call<InviteUserOutcome>(async (tx) => {
    if (env.INVITE_ONLY && !user) {
      const invitationResult = await createInvitation(
        {
          email,
          invitedByUserId: author.id,
          workspaceId: workspace.id, // Pass as number
        },
        tx,
      )

      if (!invitationResult.ok) {
        return Result.error(invitationResult.error || new Error('Failed to create invitation.'))
      }

      const invitation = invitationResult.unwrap()
      publisher.publishLater({
        type: 'userInvitationCreated',
        data: {
          invitation: invitation,
          invitedByUserEmail: author.email,
          workspaceId: workspace.id,
        },
      })
      return Result.ok({ status: 'invitation_created', invitation })
    } else {
      // Either INVITE_ONLY is false, or user already exists
      if (!user) {
        // INVITE_ONLY is false and user does not exist: Create user
        const createUserResult = await createUser({ email, name: name ?? '' }, tx)
        if (!createUserResult.ok) {
          return Result.error(createUserResult.error || new Error('Failed to create user.'))
        }
        user = createUserResult.unwrap()
      }

      // User exists (either found or just created), add to workspace
      const membershipResult = await createMembership({ author, user: user!, workspace }, tx)
      if (!membershipResult.ok) {
        return Result.error(membershipResult.error || new Error('Failed to create membership.'))
      }
      
      // publisher.publishLater({ // Commenting out for now
      //   type: 'userAddedToWorkspace',
      //   data: {
      //     addedUserId: user!.id,
      //     invitingUserId: author.id,
      //     workspaceId: workspace.id, // Ensure workspace.id is string
      //   },
      // })
      return Result.ok({ status: 'user_added_to_workspace', user: user! })
    }
  }, db)
}
