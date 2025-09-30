import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { workspaceOnboarding } from '../../schema/models/workspaceOnboarding'
import { getFirstStep } from './steps/getFirstStep'
import { Workspace } from '../../schema/types'

export async function createWorkspaceOnboarding(
  {
    workspace,
  }: {
    workspace: Workspace
  },
  transaction = new Transaction(),
) {
  return transaction.call(async (tx) => {
    const firstStepResult = await getFirstStep({ workspace }, tx)
    if (!Result.isOk(firstStepResult)) {
      return firstStepResult
    }
    const firstStep = firstStepResult.unwrap()
    const insertedOnboardings = await tx
      .insert(workspaceOnboarding)
      .values({
        workspaceId: workspace.id,
        currentStep: firstStep,
      })
      .returning()

    const onboarding = insertedOnboardings[0]!

    return Result.ok(onboarding)
  })
}
