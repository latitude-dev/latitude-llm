'use server'

import { markWorkspaceOnboardingComplete } from '@latitude-data/core/services/workspaceOnboarding/update'
import { getWorkspaceOnboarding } from '@latitude-data/core/services/workspaceOnboarding/get'
import { authProcedure } from '../procedures'
import { frontendRedirect } from '$/lib/frontendRedirect'
import { ROUTES } from '$/services/routes'

export const skipOnboardingAction = authProcedure.action(async ({ ctx }) => {
  const onboarding = await getWorkspaceOnboarding({
    workspace: ctx.workspace,
  }).then((r) => r.unwrap())

  await markWorkspaceOnboardingComplete({
    onboarding,
  }).then((r) => r.unwrap())

  return frontendRedirect(ROUTES.dashboard.root)
})
