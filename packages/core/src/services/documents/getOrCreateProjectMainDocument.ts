import { Result } from '../../lib/Result'
import { DocumentVersionsRepository } from '../../repositories'
import { Workspace } from '../../schema/models/types/Workspace'
import { User } from '../../schema/models/types/User'
import { Commit } from '../../schema/models/types/Commit'
import { createNewDocument } from './create'
import { PROJECT_MAIN_DOCUMENT } from '@latitude-data/constants/observabilityHack'
import Transaction from '../../lib/Transaction'

/**
 * This is an experiment where we are testing how the system could work
 * without commit versions. Before moving on on a big refactor we do this little hack
 * to tie project level entities to a hidden `PROJECT_MAIN_DOCUMENT`
 * that will always exist and be up to date with the latest commit.
 */
export async function getOrCreateProjectMainDocument(
  {
    workspace,
    user,
    commit,
  }: {
    workspace: Workspace
    user: User
    commit: Commit
  },
  transaction = new Transaction(),
) {
  return transaction.call(async (tx) => {
    const docsRepo = new DocumentVersionsRepository(workspace.id, tx)
    const docsResult = await docsRepo.getDocumentsAtCommit(commit)
    if (docsResult.error) {
      return Result.error(docsResult.error)
    }

    const documents = docsResult.unwrap()
    const document = documents.find((d) => d.path === PROJECT_MAIN_DOCUMENT)

    if (document) return Result.ok(document)

    return createNewDocument(
      {
        workspace,
        user,
        commit,
        path: PROJECT_MAIN_DOCUMENT,
        content: '',
        includeDefaultContent: false,
      },
      transaction,
    )
  })
}
