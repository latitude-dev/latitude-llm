import { LatitudeError } from '@latitude-data/constants/errors'
import { Result } from '../../lib/Result'
import {
  CommitsRepository,
  DocumentVersionsRepository,
} from '../../repositories'
import { Project } from '../../schema/models/types/Project'
import { User } from '../../schema/models/types/User'
import { PROJECT_MAIN_DOCUMENT } from '@latitude-data/constants/observabilityHack'
import Transaction from '../../lib/Transaction'
import { Workspace } from '../../schema/models/types/Workspace'
import { createNewDocument } from '../documents'

class MainDocumentError extends LatitudeError {
  public statusCode = 500
  public name = 'MainDocumentError'
  constructor(message: string) {
    super(message)
  }
}

/**
 * This handle the search or creation of the main document in a project.
 * It expects that ONLY one commit exists in draft mode,
 * and it will create the main document in that commit if it doesn't exist.
 */
export async function findOrCreateMainDocument(
  {
    workspace,
    project,
    user,
  }: {
    workspace: Workspace
    project: Project
    user?: User
  },
  transaction = new Transaction(),
) {
  return transaction.call(async (tx) => {
    const commitsScope = new CommitsRepository(project.workspaceId, tx)
    const result = await commitsScope.filterByProject(project.id)

    if (!Result.isOk(result)) return result

    const commits = result.value
    if (commits.length !== 1) {
      return Result.error(
        new MainDocumentError(
          `Expected exactly one draft commit for the project in workspace, but found ${commits.length}`,
        ),
      )
    }
    const commit = result.value[0]
    if (!commit) {
      return Result.error(
        new MainDocumentError(
          `No draft commit found for the project in workspace`,
        ),
      )
    }
    const docsRepo = new DocumentVersionsRepository(project.workspaceId, tx)
    const docsResult = await docsRepo.getDocumentsAtCommit(commit)
    if (!Result.isOk(docsResult)) return docsResult
    const document = docsResult.value.find(
      (d) => d.path === PROJECT_MAIN_DOCUMENT,
    )

    if (document) return Result.ok({ document, commit })

    // This will ensure they are in a draft coomit. This will fail if
    // this project has a `live` commit.
    const documentResult = await createNewDocument(
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
    if (!Result.isOk(documentResult)) return documentResult

    return Result.ok({ document: documentResult.value, commit })
  })
}
