'use server'

import { getUserFromCredentials } from '$/data-access'
import { ROUTES } from '$/services/routes'
import { z } from 'zod'
import { unsafelyFindWorkspace } from '@latitude-data/core/data-access/workspaces'

import { setSession } from '$/services/auth/setSession'
import { withAdmin } from '../../procedures'
import { frontendRedirect } from '$/lib/frontendRedirect'

export const impersonateAction = withAdmin
  .inputSchema(z.object({ email: z.string().pipe(z.email()) }))
  .action(async ({ parsedInput }) => {
    const { user, workspace } = await getUserFromCredentials(parsedInput).then(
      (r) => r.unwrap(),
    )

    // Get full workspace with subscription
    const fullWorkspace = await unsafelyFindWorkspace(workspace.id)

    await setSession({
      sessionData: {
        user: {
          id: user.id,
          email: user.email,
        },
        workspace: fullWorkspace,
      },
    })

    return frontendRedirect(ROUTES.root)
  })
