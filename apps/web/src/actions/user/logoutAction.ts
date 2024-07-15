'use server'

import { authProcedure } from '$/actions/procedures'
import { removeSession } from '$/services/auth/removeSession'
import { ROUTES } from '$/services/routes'
import { redirect } from 'next/navigation'

export const logoutAction = authProcedure
  .createServerAction()
  .handler(async ({ ctx }) => {
    removeSession({ session: ctx.session })

    redirect(ROUTES.auth.login)
  })
