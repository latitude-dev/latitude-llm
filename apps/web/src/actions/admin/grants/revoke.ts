'use server'

import { BadRequestError } from '@latitude-data/constants/errors'
import { unsafelyFindWorkspace } from '@latitude-data/core/data-access/workspaces'
import { GrantsRepository } from '@latitude-data/core/repositories'
import { revokeGrant } from '@latitude-data/core/services/grants/revoke'
import { z } from 'zod'
import { withAdmin } from '../../procedures'

export const revokeGrantAction = withAdmin
  .createServerAction()
  .input(
    z.object({
      grantId: z.number(),
      workspaceId: z.number(),
    }),
  )
  .handler(async ({ input }) => {
    const workspace = await unsafelyFindWorkspace(input.workspaceId)
    if (!workspace) {
      throw new BadRequestError('Workspace not found')
    }

    const grantsRepository = new GrantsRepository(input.workspaceId)
    let grant = await grantsRepository
      .find(input.grantId)
      .then((r) => r.unwrap())

    grant = await revokeGrant({ grant, workspace }).then((r) => r.unwrap())

    return grant
  })
