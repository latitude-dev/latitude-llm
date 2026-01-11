'use server'

import { MembershipsRepository } from '@latitude-data/core/repositories'
import { destroyMembership } from '@latitude-data/core/services/memberships/destroy'
import { z } from 'zod'
import { WorkspacePermissions } from '@latitude-data/core/permissions/workspace'

import { withWorkspacePermission } from '../procedures'

export const destroyMembershipAction = withWorkspacePermission(
  WorkspacePermissions.ManageMembers,
)
  .inputSchema(z.object({ id: z.string() }))
  .action(async ({ parsedInput: { id }, ctx: { workspace, user } }) => {
    if (user.id === id) {
      throw new Error('You cannot remove yourself from the workspace.')
    }

    const membershipsScope = new MembershipsRepository(workspace.id)
    const membership = await membershipsScope
      .findByUserId(id)
      .then((r) => r.unwrap())

    return await destroyMembership(membership).then((r) => r.unwrap())
  })
