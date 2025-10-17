import { eq } from 'drizzle-orm'
import Transaction from '../../../lib/Transaction'
import { workspaceOnboarding } from '../../../schema/models/workspaceOnboarding'
import { Result } from '../../../lib/Result'
import { getNextAvailableStep } from './getNextAvailableStep'
import { type WorkspaceOnboarding } from '../../../schema/models/types/WorkspaceOnboarding'
import { OnboardingStepKey } from '@latitude-data/constants/onboardingSteps'
import { Workspace } from '../../../schema/models/types/Workspace'

export async function moveNextOnboardingStep(
  {
    onboarding,
    workspace,
    currentStep,
  }: {
    onboarding: WorkspaceOnboarding
    workspace: Workspace
    currentStep: OnboardingStepKey
  },
  transaction = new Transaction(),
) {
  return transaction.call(async (tx) => {
    const getNextAvailableStepResult = await getNextAvailableStep(
      {
        currentStep,
        workspace,
      },
      tx,
    )
    if (!Result.isOk(getNextAvailableStepResult)) {
      return getNextAvailableStepResult
    }

    const nextStep = getNextAvailableStepResult.unwrap()

    const updatedOnboardings = await tx
      .update(workspaceOnboarding)
      .set({ currentStep: nextStep })
      .where(eq(workspaceOnboarding.id, onboarding.id))
      .returning()

    const updatedOnboarding = updatedOnboardings[0]!

    return Result.ok(updatedOnboarding)
  })
}
