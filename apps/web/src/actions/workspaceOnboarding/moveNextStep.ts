'use server'

import { getWorkspaceOnboarding } from '@latitude-data/core/services/workspaceOnboarding/get'
import { authProcedure } from '../procedures'
import { moveNextOnboardingStep } from '@latitude-data/core/services/workspaceOnboarding/steps/moveNextOnboardingStep'
import { z } from 'zod'
import { OnboardingStepKey } from '@latitude-data/constants/onboardingSteps'

/**
 * Move to the next onboarding step
 */
export const moveNextOnboardingStepAction = authProcedure
  .inputSchema(z.object({ currentStep: z.nativeEnum(OnboardingStepKey) }))
  .action(async ({ parsedInput, ctx }) => {
    if (!parsedInput.currentStep) {
      throw new Error('Current step is required')
    }
    const onboarding = await getWorkspaceOnboarding({
      workspace: ctx.workspace,
    }).then((r) => r.unwrap())

    const nextOnboardingStep = await moveNextOnboardingStep({
      onboarding,
      workspace: ctx.workspace,
      currentStep: parsedInput.currentStep,
    }).then((r) => r.unwrap())

    return nextOnboardingStep
  })
