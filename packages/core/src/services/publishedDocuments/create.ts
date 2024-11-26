import {
  DocumentVersion,
  HEAD_COMMIT,
  Project,
  PublishedDocument,
  Workspace,
} from '../../browser'
import { database } from '../../client'
import { Result, Transaction, UnprocessableEntityError } from '../../lib'
import { CommitsRepository } from '../../repositories'
import { PublishedDocumentRepository } from '../../repositories/publishedDocumentsRepository'
import { publishedDocuments } from '../../schema'

export async function createPublishedDocument(
  {
    project,
    workspace,
    document,
  }: {
    project: Project
    workspace: Workspace
    document: DocumentVersion
  },
  db = database,
) {
  const commitRepo = new CommitsRepository(workspace.id)
  const liveCommit = await commitRepo
    .getCommitByUuid({
      uuid: HEAD_COMMIT,
      projectId: project.id,
    })
    .then((r) => r.unwrap())

  if (liveCommit.id !== document.commitId) {
    return Result.error(
      new UnprocessableEntityError('Only live documents can be shared.', {
        documentUuid: 'Only live documents can be shared.',
      }),
    )
  }

  const scope = new PublishedDocumentRepository(workspace.id)
  const existing = await scope.findByDocumentUuid(document.documentUuid)

  if (existing) {
    return Result.error(
      new UnprocessableEntityError(
        'Document already has a published version.',
        {
          documentUuid: 'Document already has a published version.',
        },
      ),
    )
  }

  return await Transaction.call<PublishedDocument>(async (trx) => {
    const inserts = await trx
      .insert(publishedDocuments)
      .values({
        workspaceId: workspace.id,
        documentUuid: document.documentUuid,
        projectId: project.id,
        isPublished: false,
        canFollowConversation: false,
        title: document.path,
      })
      .returning()
    return Result.ok(inserts[0]!)
  }, db)
}
