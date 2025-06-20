import { omit } from 'lodash-es'

import { eq } from 'drizzle-orm'

import { scan } from 'promptl-ai'
import { Commit, DocumentType, DocumentVersion } from '../../browser'
import { database } from '../../client'
import { findWorkspaceFromCommit } from '../../data-access'
import { assertCommitIsDraft } from '../../lib/assertCommitIsDraft'
import { BadRequestError, NotFoundError } from '../../lib/errors'
import { DocumentVersionsRepository } from '../../repositories/documentVersionsRepository'
import { documentVersions } from '../../schema'
import { pingProjectUpdate } from '../projects'
import { inheritDocumentRelations } from './inheritRelations'
import { Result } from './../../lib/Result'
import { TypedResult } from './../../lib/Result'
import Transaction from './../../lib/Transaction'

export async function getDocumentType({
  content,
  promptlVersion,
}: {
  content: string
  promptlVersion: number
}): Promise<DocumentType> {
  if (promptlVersion === 0) return DocumentType.Prompt
  if (!content || !content.trim().length) return DocumentType.Prompt

  try {
    const metadata = await scan({ prompt: content })
    const documentTypeConfig = metadata.config['type'] as
      | DocumentType
      | undefined
    if (!documentTypeConfig) return DocumentType.Prompt
    if (Object.values(DocumentType).includes(documentTypeConfig)) {
      return documentTypeConfig
    }

    return DocumentType.Prompt
  } catch (_) {
    return DocumentType.Prompt
  }
}

// TODO: refactor, can be simplified
export async function updateDocument(
  {
    commit,
    document,
    path,
    content,
    promptlVersion,
    deletedAt,
  }: {
    commit: Commit
    document: DocumentVersion
    path?: string
    content?: string | null
    promptlVersion?: number
    deletedAt?: Date | null
  },
  db = database,
): Promise<TypedResult<DocumentVersion, Error>> {
  return await Transaction.call(async (tx) => {
    const updatedDocData = Object.fromEntries(
      Object.entries({ path, content, promptlVersion, deletedAt }).filter(
        ([_, v]) => v !== undefined,
      ),
    )

    const asertResult = assertCommitIsDraft(commit)
    asertResult.unwrap()

    if (commit.mergedAt !== null) {
      return Result.error(new BadRequestError('Cannot modify a merged commit'))
    }

    const workspace = await findWorkspaceFromCommit(commit, tx)
    const docsScope = new DocumentVersionsRepository(workspace!.id, tx, {
      includeDeleted: true,
    })
    const documents = (await docsScope.getDocumentsAtCommit(commit)).unwrap()
    const doc = documents.find((d) => d.documentUuid === document.documentUuid)

    if (!doc) {
      return Result.error(new NotFoundError('Document does not exist'))
    }

    if (path !== undefined) {
      if (
        documents.find(
          (d) => d.path === path && d.documentUuid !== doc.documentUuid,
        )
      ) {
        return Result.error(
          new BadRequestError('A document with the same path already exists'),
        )
      }
    }

    const oldVersion = omit(document, ['id', 'commitId', 'updatedAt'])
    const documentType = await getDocumentType({
      content: content || oldVersion.content,
      promptlVersion: promptlVersion || oldVersion.promptlVersion,
    })

    const newVersion = {
      ...oldVersion,
      ...updatedDocData,
      commitId: commit.id,
      documentType,
    }

    const updatedDocs = await tx
      .insert(documentVersions)
      .values(newVersion)
      .onConflictDoUpdate({
        target: [documentVersions.documentUuid, documentVersions.commitId],
        set: newVersion,
      })
      .returning()

    if (updatedDocs.length === 0) {
      return Result.error(new NotFoundError('Document does not exist'))
    }

    await inheritDocumentRelations(
      {
        fromVersion: document,
        toVersion: updatedDocs[0]!,
        workspace: workspace!,
      },
      tx,
    ).then((r) => r.unwrap())

    // Invalidate all resolvedContent for this commit
    await tx
      .update(documentVersions)
      .set({ resolvedContent: null })
      .where(eq(documentVersions.commitId, commit.id))

    await pingProjectUpdate(
      {
        projectId: commit.projectId,
      },
      tx,
    ).then((r) => r.unwrap())

    return Result.ok(updatedDocs[0]!)
  }, db)
}
