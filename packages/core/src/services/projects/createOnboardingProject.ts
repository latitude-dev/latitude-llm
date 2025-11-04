import { type User } from '../../schema/models/types/User'
import { type Workspace } from '../../schema/models/types/Workspace'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { createProject } from './create'
import { createNewDocument } from '../documents/create'

/**
 * Creates an onboarding project with a single empty document to let the user fill in
 */
export async function createOnboardingProject(
  {
    workspace,
    user,
  }: {
    workspace: Workspace
    user: User
  },
  transaction = new Transaction(),
) {
  // Create a project named "Onboarding"
  const { project, commit } = await createProject(
    {
      name: 'Onboarding',
      workspace,
      user,
    },
    transaction,
  ).then((r) => r.unwrap())

  // Create an empty document to fill in by the user
  const documentResult = await createNewDocument(
    {
      workspace,
      user,
      commit,
      path: 'onboarding',
      createDemoEvaluation: true,
      includeDefaultContent: false,
    },
    transaction,
  )
  if (!Result.isOk(documentResult)) {
    return documentResult
  }

  const document = documentResult.unwrap()

  return Result.ok({
    project,
    documents: [document],
    commit,
  })
}
