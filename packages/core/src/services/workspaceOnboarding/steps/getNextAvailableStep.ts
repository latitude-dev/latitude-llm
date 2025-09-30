import { Result } from '../../../lib/Result'
import { PromisedResult } from '../../../lib/Transaction'
import {
  ONBOARDING_STEPS,
  OnboardingStepKey,
} from '@latitude-data/constants/onboardingSteps'

export async function getNextAvailableStep({
  currentStep,
}: {
  currentStep: OnboardingStepKey
}): PromisedResult<OnboardingStepKey> {
  const nextStep = getNextStep(currentStep)

  if (!nextStep) {
    return Result.error(new Error('Onboarding is complete'))
  }

  return Result.ok(nextStep)
}

function getNextStep(
  currentStep: OnboardingStepKey,
): OnboardingStepKey | undefined {
  const currentOrder = ONBOARDING_STEPS[currentStep].order
  return getStepByOrder(currentOrder + 1)
}

function getStepByOrder(order: number): OnboardingStepKey {
  return Object.entries(ONBOARDING_STEPS).find(
    ([, config]) => config.order === order,
  )?.[0] as OnboardingStepKey
}
