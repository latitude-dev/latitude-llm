'use server'

import { MembershipsRepository } from '@latitude-data/core/repositories'
import { updateMembershipRole } from '@latitude-data/core/services/memberships/updateRole'
import {
  WorkspacePermissions,
  WorkspaceRoles,
} from '@latitude-data/core/permissions/workspace'
import { z } from 'zod'

import { withWorkspacePermission } from '../procedures'

export const updateMembershipRoleAction = withWorkspacePermission(
  WorkspacePermissions.ManageMembers,
)
  .inputSchema(
    z.object({
      userId: z.string(),
      role: z.enum(WorkspaceRoles),
    }),
  )
  .action(async ({ parsedInput: { userId, role }, ctx: { workspace } }) => {
    const membershipsScope = new MembershipsRepository(workspace.id)
    const membership = await membershipsScope
      .findByUserId(userId)
      .then((r) => r.unwrap())

    return await updateMembershipRole(membership, role).then((r) => r.unwrap())
  })
