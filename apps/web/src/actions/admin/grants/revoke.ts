'use server'

import { BadRequestError } from '@latitude-data/constants/errors'
import { unsafelyFindWorkspace } from '@latitude-data/core/data-access'
import { GrantsRepository } from '@latitude-data/core/repositories'
import { revokeGrant } from '@latitude-data/core/services/grants/revoke'
import { z } from 'zod'
import { withAdmin } from '../../procedures'

export const revokeGrantAction = withAdmin
  .inputSchema(
    z.object({
      grantId: z.number(),
      workspaceId: z.number(),
    }),
  )
  .action(async ({ parsedInput }) => {
    const workspace = await unsafelyFindWorkspace(parsedInput.workspaceId)
    if (!workspace) {
      throw new BadRequestError('Workspace not found')
    }

    const grantsRepository = new GrantsRepository(parsedInput.workspaceId)
    let grant = await grantsRepository
      .find(parsedInput.grantId)
      .then((r) => r.unwrap())

    grant = await revokeGrant({ grant, workspace }).then((r) => r.unwrap())

    return grant
  })
