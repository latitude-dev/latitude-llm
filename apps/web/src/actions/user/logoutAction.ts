'use server'

import { authProcedure } from '$/actions/procedures'
import { removeSession } from '$/services/auth/removeSession'
import { ROUTES } from '$/services/routes'
import { frontendRedirect } from '$/lib/frontendRedirect'

export const logoutAction = authProcedure.action(async ({ ctx }) => {
  await removeSession({ session: ctx.session })

  return frontendRedirect(ROUTES.auth.login)
})
