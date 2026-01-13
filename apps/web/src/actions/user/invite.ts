'use server'

import { inviteUser } from '@latitude-data/core/services/users/invite'
import { z } from 'zod'
import {
  WorkspacePermissions,
  WorkspaceRoles,
} from '@latitude-data/core/permissions/workspace'
import { applyUserPlanLimit } from '@latitude-data/core/services/subscriptions/limits/applyUserPlanLimit'
import { withWorkspacePermission } from '../procedures'

export const inviteUserAction = withWorkspacePermission(
  WorkspacePermissions.ManageMembers,
)
  .inputSchema(
    z.object({
      email: z.email(),
      name: z.string(),
      role: z.enum(WorkspaceRoles).optional(),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    await applyUserPlanLimit({ workspace: ctx.workspace }).then((r) =>
      r.unwrap(),
    )

    return await inviteUser({
      email: parsedInput.email,
      name: parsedInput.name,
      role: parsedInput.role,
      workspace: ctx.workspace,
      author: ctx.user,
    }).then((r) => r.unwrap())
  })
