'use server'

import { markWorkspaceOnboardingComplete } from '@latitude-data/core/services/workspaceOnboarding/update'
import { getWorkspaceOnboarding } from '@latitude-data/core/services/workspaceOnboarding/get'
import { authProcedure } from '../procedures'

/**
 * Mark onboarding as complete
 */
export const completeOnboardingAction = authProcedure
  .createServerAction()
  .handler(async ({ ctx }) => {
    const onboarding = await getWorkspaceOnboarding({
      workspace: ctx.workspace,
    }).then((r) => r.unwrap())

    return await markWorkspaceOnboardingComplete({
      onboarding,
    }).then((r) => r.unwrap())
  })
