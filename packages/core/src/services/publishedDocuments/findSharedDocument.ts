import { eq, and } from 'drizzle-orm'

import { database } from '../../client'
import { unsafelyFindWorkspace } from '../../data-access'
import { NotFoundError, Result } from '../../lib'
import {
  CommitsRepository,
  DocumentVersionsRepository,
} from '../../repositories'
import { publishedDocuments } from '../../schema'

const NotFound = Result.error(
  new NotFoundError(
    'Prompt not found, check with the person that shared it to you',
  ),
)

async function findByUuid(uuid: string, db = database) {
  try {
    const shared = await db.query.publishedDocuments.findFirst({
      where: and(
        eq(publishedDocuments.uuid, uuid),
        eq(publishedDocuments.isPublished, true),
      ),
    })
    return Result.ok(shared)
  } catch {
    return NotFound
  }
}

export async function findSharedDocument(
  {
    publishedDocumentUuid,
  }: {
    publishedDocumentUuid: string | string[] | undefined
  },
  db = database,
) {
  const uuid = publishedDocumentUuid?.toString()
  if (!uuid) return NotFound

  const sharedResult = await findByUuid(uuid, db)
  if (sharedResult.error) return NotFound

  const shared = sharedResult.value
  if (!shared) return NotFound

  const workspace = await unsafelyFindWorkspace(shared.workspaceId)
  if (!workspace) return NotFound

  const commitsRepo = new CommitsRepository(shared.workspaceId, db)
  const commitResult = await commitsRepo.getHeadCommit(shared.projectId)

  if (commitResult.error) return NotFound
  const commit = commitResult.value
  if (!commit) return NotFound

  const repo = new DocumentVersionsRepository(shared.workspaceId, db)
  const result = await repo.getDocumentAtCommit({
    projectId: shared.projectId,
    commitUuid: commit.uuid,
    documentUuid: shared.documentUuid,
  })

  if (result.error) return NotFound

  const document = result.value

  return Result.ok({ workspace, shared, document, commit })
}
