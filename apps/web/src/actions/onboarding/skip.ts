'use server'

import { markUserOnboardingComplete } from '@latitude-data/core/services/users/completeOnboarding'
import { authProcedure } from '../procedures'
import { frontendRedirect } from '$/lib/frontendRedirect'
import { ROUTES } from '$/services/routes'

export const skipOnboardingAction = authProcedure.action(async ({ ctx }) => {
  await markUserOnboardingComplete({
    user: ctx.user,
  }).then((r) => r.unwrap())

  return frontendRedirect(ROUTES.dashboard.root)
})

