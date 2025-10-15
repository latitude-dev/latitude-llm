import { type Workspace } from '../../../schema/models/types/Workspace'
import { database } from '../../../client'
import { Result } from '../../../lib/Result'
import { PromisedResult } from '../../../lib/Transaction'
import {
  ONBOARDING_STEPS,
  OnboardingStepKey,
} from '@latitude-data/constants/onboardingSteps'
import { checkNextStepNecessary } from './checkNextStepNecessary'
import { getNextAvailableStep } from './getNextAvailableStep'

export async function getFirstStep(
  {
    workspace,
  }: {
    workspace: Workspace
  },
  db = database,
): PromisedResult<OnboardingStepKey> {
  const firstStep = getFirstStepByOrder()
  const checkNextStepNecessaryResult = await checkNextStepNecessary(
    {
      currentStep: firstStep,
      workspace,
    },
    db,
  )
  if (!Result.isOk(checkNextStepNecessaryResult)) {
    return checkNextStepNecessaryResult
  }
  const setupIntegrationsIsNecessary = checkNextStepNecessaryResult.unwrap()
  if (setupIntegrationsIsNecessary) {
    return Result.ok(firstStep)
  }
  const getNextStepNecessaryResult = await getNextAvailableStep(
    {
      currentStep: firstStep,
      workspace,
    },
    db,
  )
  if (!Result.isOk(getNextStepNecessaryResult)) {
    return getNextStepNecessaryResult
  }
  const nextStepNecessary = getNextStepNecessaryResult.unwrap()
  return Result.ok(nextStepNecessary)
}

function getFirstStepByOrder(): OnboardingStepKey {
  return Object.entries(ONBOARDING_STEPS).sort(
    ([, a], [, b]) => a.order - b.order,
  )[0][0] as OnboardingStepKey
}
