import { OnboardingStepKey } from '@latitude-data/constants/onboardingSteps'
import { Workspace } from '../../../schema/types'
import { getNextAvailableStep } from './getNextAvailableStep'
import { Result } from '../../../lib/Result'
import { database } from '../../../client'
import { PromisedResult } from '../../../lib/Transaction'
import { getFirstStep } from './getFirstStep'

export async function calculateAllSteps(
  {
    workspace,
  }: {
    workspace: Workspace
  },
  db = database,
): PromisedResult<OnboardingStepKey[]> {
  const firstStepResult = await getFirstStep({ workspace }, db)
  if (!Result.isOk(firstStepResult)) {
    return firstStepResult
  }
  const firstStep = firstStepResult.unwrap()

  const steps: OnboardingStepKey[] = []
  steps.push(firstStep)
  let workingStep = firstStep

  while (true) {
    const nextStepResult = await getNextAvailableStep(
      {
        currentStep: workingStep,
        workspace,
      },
      db,
    )
    if (!Result.isOk(nextStepResult)) {
      if (nextStepResult.error.message === 'Onboarding is complete') {
        return Result.ok(steps)
      }
      return nextStepResult
    }
    const nextStep = nextStepResult.unwrap()
    steps.push(nextStep)
    workingStep = nextStep
  }
}
