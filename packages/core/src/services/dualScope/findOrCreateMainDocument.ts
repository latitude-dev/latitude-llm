import { LatitudeError } from '@latitude-data/constants/errors'
import { Result, TypedResult } from '../../lib/Result'
import {
  CommitsRepository,
  DocumentVersionsRepository,
} from '../../repositories'
import { Project } from '../../schema/models/types/Project'
import { User } from '../../schema/models/types/User'
import { PROJECT_MAIN_DOCUMENT } from '@latitude-data/constants/dualScope'
import Transaction from '../../lib/Transaction'
import { Workspace } from '../../schema/models/types/Workspace'
import { createNewDocument } from '../documents'
import { Commit } from '../../schema/models/types/Commit'
import { DocumentVersion } from '../../schema/models/types/DocumentVersion'
import { Database, database } from '../../client'

class MainDocumentError extends LatitudeError {
  public statusCode = 500
  public name = 'MainDocumentError'
  constructor(message: string) {
    super(message)
  }
}

type MainDocumentResult = { document: DocumentVersion; commit: Commit }

async function findMainDocument(
  workspaceId: number,
  commit: Commit,
  db: Database,
): Promise<DocumentVersion | undefined> {
  const docsRepo = new DocumentVersionsRepository(workspaceId, db)
  const docsResult = await docsRepo.getDocumentsAtCommit(commit)
  if (!Result.isOk(docsResult)) return undefined
  return docsResult.value.find((d) => d.path === PROJECT_MAIN_DOCUMENT)
}

async function getDraftCommit(
  project: Project,
  db: Database,
): Promise<TypedResult<Commit, MainDocumentError>> {
  const commitsScope = new CommitsRepository(project.workspaceId, db)
  const commits = await commitsScope
    .filterByProject(project.id)
    .then((r) => r.unwrap())

  const commit = commits[0]

  if (!commit || commit.mergedAt) {
    return Result.error(
      new MainDocumentError(
        `No draft commit found for the project ${project.id} in workspace ${project.workspaceId}`,
      ),
    )
  }

  return Result.ok(commit)
}

/**
 * This handle the search or creation of the main document in a project.
 * It expects that ONLY one commit exists in draft mode,
 * and it will create the main document in that commit if it doesn't exist.
 *
 * Handles concurrent creation attempts gracefully by catching unique constraint
 * violations and re-fetching the document created by the concurrent request.
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
): Promise<TypedResult<MainDocumentResult, Error>> {
  const commitResult = await getDraftCommit(project, database)
  if (commitResult.error) return commitResult

  const commit = commitResult.value

  const existingDocument = await findMainDocument(
    project.workspaceId,
    commit,
    database,
  )
  if (existingDocument) return Result.ok({ document: existingDocument, commit })

  const documentResult = await createNewDocument(
    {
      workspace,
      user,
      commit,
      path: PROJECT_MAIN_DOCUMENT,
      content: '',
      includeDefaultContent: false,
      onConflictDoNothing: true,
    },
    transaction,
  )

  if (!Result.isOk(documentResult)) return documentResult

  return Result.ok({ document: documentResult.value, commit })
}
