import { eq } from 'drizzle-orm'
import Transaction from '../../../lib/Transaction'
import { workspaceOnboarding } from '../../../schema/models/workspaceOnboarding'
import { Result } from '../../../lib/Result'
import { getNextAvailableStep } from './validateStep'
import { WorkspaceOnboarding } from '../../../schema/types'

export async function nextOnboardingStep(
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

    return Result.ok(updatedOnboardings[0]!)
  })
}
