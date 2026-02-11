'use server'

import { z } from 'zod'
import { unsafelyFindWorkspace } from '@latitude-data/core/data-access/workspaces'
import { unsafelyFindUserById } from '@latitude-data/core/queries/users/findById'
import { unsafelyFindMembershipByToken } from '@latitude-data/core/data-access/memberships'
import { NotFoundError } from '@latitude-data/constants/errors'
import { acceptInvitation } from '@latitude-data/core/services/invitations/accept'
import { setSession } from '$/services/auth/setSession'
import { ROUTES } from '$/services/routes'
import { errorHandlingProcedure } from '$/actions/procedures'
import { frontendRedirect } from '$/lib/frontendRedirect'

export const acceptInvitationAction = errorHandlingProcedure
  .inputSchema(
    z.object({
      membershipToken: z.string(),
      email: z.string().optional(),
    }),
  )
  .action(async ({ parsedInput }) => {
    const { membershipToken } = parsedInput
    const membership = await unsafelyFindMembershipByToken(
      membershipToken,
    ).then((r) => r.unwrap())
    const workspace = await unsafelyFindWorkspace(membership.workspaceId)
    if (!workspace) throw new NotFoundError('Workspace not found')

    const user = await unsafelyFindUserById({ id: membership.userId })
    if (!user) throw new NotFoundError('User not found')

    await acceptInvitation({ membership, user })
    await setSession({
      sessionData: {
        user: {
          id: user.id,
          email: user.email,
        },
        workspace,
      },
    })

    return frontendRedirect(ROUTES.root)
  })
