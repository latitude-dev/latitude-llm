import { Result } from '../../../lib/Result'
import { PromisedResult } from '../../../lib/Transaction'
import {
  ONBOARDING_STEPS,
  OnboardingStepKey,
} from '@latitude-data/constants/onboardingSteps'
import { checkNextStepNecessary } from './checkNextStepNecessary'
import { type Workspace } from '../../../schema/models/types/Workspace'
import { database } from '../../../client'
import { OnboardingCompleteError } from './onboardingCompleteError'

export async function getNextAvailableStep(
  {
    currentStep,
    workspace,
  }: {
    currentStep: OnboardingStepKey
    workspace: Workspace
  },
  db = database,
): PromisedResult<OnboardingStepKey> {
  while (true) {
    const nextStep = getNextStep(currentStep)
    if (!nextStep) {
      return Result.error(new OnboardingCompleteError())
    }
    const checkNextStepNecessaryResult = await checkNextStepNecessary(
      {
        currentStep: nextStep,
        workspace,
      },
      db,
    )
    if (!Result.isOk(checkNextStepNecessaryResult)) {
      return checkNextStepNecessaryResult
    }
    const nextStepNecessary = checkNextStepNecessaryResult.unwrap()
    if (nextStepNecessary) {
      return Result.ok(nextStep)
    }
    currentStep = nextStep
  }
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
