'use server'

import { getUserFromCredentials } from '$/data-access'
import { ROUTES } from '$/services/routes'
import { z } from 'zod'

import { setSession } from '$/services/auth/setSession'
import { withAdmin } from '../../procedures'
import { frontendRedirect } from '$/lib/frontendRedirect'

export const impersonateAction = withAdmin
  .inputSchema(z.object({ email: z.string().pipe(z.email()) }))
  .action(async ({ parsedInput }) => {
    const { user, workspace } = await getUserFromCredentials(parsedInput).then(
      (r) => r.unwrap(),
    )
    await setSession({
      sessionData: {
        impersonating: true,
        user,
        workspace,
      },
    })

    return frontendRedirect(ROUTES.root)
  })
