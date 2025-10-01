'use server'

import { getWorkspaceOnboarding } from '@latitude-data/core/services/workspaceOnboarding/get'
import { authProcedure } from '../procedures'
import { moveNextOnboardingStep } from '@latitude-data/core/services/workspaceOnboarding/steps/moveNextOnboardingStep'

/**
 * Move to the next onboarding step
 */
export const moveNextOnboardingStepAction = authProcedure.action(
  async ({ ctx }) => {
    const onboarding = await getWorkspaceOnboarding({
      workspace: ctx.workspace,
    }).then((r) => r.unwrap())

    const nextOnboardingStep = await moveNextOnboardingStep({
      onboarding,
      workspace: ctx.workspace,
    }).then((r) => r.unwrap())

    return nextOnboardingStep
  },
)
