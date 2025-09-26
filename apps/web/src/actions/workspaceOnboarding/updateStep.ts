'use server'

import { getWorkspaceOnboarding } from '@latitude-data/core/services/workspaceOnboarding/get'
import { authProcedure } from '../procedures'
import { nextOnboardingStep } from '@latitude-data/core/services/workspaceOnboarding/steps/nextOnboardingStep'
/**
 * Next onboarding step
 */
export const nextOnboardingStepAction = authProcedure
  .createServerAction()
  .handler(async ({ ctx }) => {
    const onboarding = await getWorkspaceOnboarding({
      workspace: ctx.workspace,
    }).then((r) => r.unwrap())

    return await nextOnboardingStep({
      onboarding,
    }).then((r) => r.unwrap())
  })
