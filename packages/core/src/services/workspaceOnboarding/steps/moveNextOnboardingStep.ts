import { eq } from 'drizzle-orm'
import Transaction from '../../../lib/Transaction'
import { workspaceOnboarding } from '../../../schema/models/WorkspaceOnboarding'
import { Result } from '../../../lib/Result'
import { getNextAvailableStep } from './getNextAvailableStep'
import { WorkspaceOnboarding } from '../../../schema/types'

export async function moveNextOnboardingStep(
  {
    onboarding,
  }: {
    onboarding: WorkspaceOnboarding
  },
  transaction = new Transaction(),
) {
  return transaction.call(async (tx) => {
    if (!onboarding.currentStep) {
      return Result.error(new Error('Onboarding current step is not set'))
    }

    const getNextAvailableStepResult = await getNextAvailableStep({
      currentStep: onboarding.currentStep,
    })

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
