import {
  DocumentVersion,
  HEAD_COMMIT,
  Project,
  PublishedDocument,
  Workspace,
} from '../../browser'
import { UnprocessableEntityError } from '../../lib/errors'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { CommitsRepository } from '../../repositories'
import { PublishedDocumentRepository } from '../../repositories/publishedDocumentsRepository'
import { publishedDocuments } from '../../schema'

export async function createPublishedDocument(
  {
    project,
    workspace,
    document,
    commitUuid,
    isPublished = false,
  }: {
    project: Project
    workspace: Workspace
    document: DocumentVersion
    commitUuid: string
    isPublished?: boolean
  },
  transaction = new Transaction(),
) {
  const commitRepo = new CommitsRepository(workspace.id)
  const liveCommit = await commitRepo
    .getHeadCommit(project.id)
    .then((r) => r.unwrap())

  if (!liveCommit) {
    return Result.error(
      new UnprocessableEntityError('Project has no commits.', {
        projectId: 'Project has no commits.',
      }),
    )
  }

  if (liveCommit.uuid !== commitUuid && commitUuid !== HEAD_COMMIT) {
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

  return await transaction.call<PublishedDocument>(async (trx) => {
    const inserts = await trx
      .insert(publishedDocuments)
      .values({
        workspaceId: workspace.id,
        documentUuid: document.documentUuid,
        projectId: project.id,
        isPublished,
        canFollowConversation: false,
        title: document.path,
      })
      .returning()
    return Result.ok(inserts[0]!)
  })
}
