import { type User } from '../../schema/models/types/User'
import { type Workspace } from '../../schema/models/types/Workspace'
import Transaction from '../../lib/Transaction'
import { createOnboardingProject } from '../projects/createOnboardingProject'
import { Result } from '../../lib/Result'

export async function createDatasetOnboarding(
  {
    workspace,
    user,
  }: {
    workspace: Workspace
    user: User
  },
  transaction = new Transaction(),
) {
  return transaction.call(async () => {
    const projectResult = await createOnboardingProject(
      {
        workspace,
        user,
      },
      transaction,
    )
    if (projectResult.error) {
      return projectResult
    }
    const { project, documents, commit } = projectResult.unwrap()

    return Result.ok({
      project,
      documents,
      commit,
    })
  })
}
