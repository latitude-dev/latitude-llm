import { User, Workspace } from '../../schema/types'
import { createOnboardingDataset } from '../datasets/createOnboardingDataset'
import { createDemoEvaluation } from '../evaluationsV2/createDemoEvaluation'
import Transaction from '../../lib/Transaction'
import { importOnboardingProject } from '../projects/import'
import { LatitudeError } from '../../lib/errors'
import { ONBOARDING_DOCUMENT_PATH } from '../../constants'
import { Result } from '../../lib/Result'

export async function createOnboardingResources(
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
    const { documents, commit } = await importOnboardingProject(
      { workspace, user },
      transaction,
    ).then((r) => r.unwrap())

    const onboardingDocument = documents.find(
      (document) => document.path === ONBOARDING_DOCUMENT_PATH,
    )
    if (!onboardingDocument) {
      return Result.error(new LatitudeError('Onboarding document not found'))
    }

    await createOnboardingDataset(
      { workspace, author: user },
      transaction,
    ).then((r) => r.unwrap())
    await createDemoEvaluation(
      { workspace, document: onboardingDocument, commit },
      transaction,
    ).then((r) => r.unwrap())

    return Result.ok(true)
  })
}
