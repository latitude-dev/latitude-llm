import { omit } from 'lodash-es'

import { eq } from 'drizzle-orm'

import { scan } from 'promptl-ai'
import { Commit, DocumentVersion } from '../../schema/types'
import { DocumentType } from '../../constants'
import { findWorkspaceFromCommit } from '../../data-access/workspaces'
import { assertCommitIsDraft } from '../../lib/assertCommitIsDraft'
import { BadRequestError, NotFoundError } from '../../lib/errors'
import { Result, TypedResult } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { DocumentVersionsRepository } from '../../repositories/documentVersionsRepository'
import { documentVersions } from '../../schema/models/documentVersions'
import { pingProjectUpdate } from '../projects'
import { inheritDocumentRelations } from './inheritRelations'
import { updateListOfIntegrations } from './updateListOfIntegrations'

export async function getDocumentType({
  content,
}: {
  content: string
}): Promise<DocumentType> {
  if (!content || !content.trim().length) return DocumentType.Prompt

  const metadata = await scan({ prompt: content })
  const hasFrontmatter =
    metadata.config && Object.keys(metadata.config).length > 0

  if (!hasFrontmatter) return DocumentType.Prompt

  // Allow users to explicitly set type: prompt to override agent classification
  if (metadata.config.type === DocumentType.Prompt) return DocumentType.Prompt

  return DocumentType.Agent
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
  transaction = new Transaction(),
): Promise<TypedResult<DocumentVersion, Error>> {
  return await transaction.call(async (tx) => {
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
    })

    const newVersion = {
      ...oldVersion,
      ...updatedDocData,
      commitId: commit.id,
      documentType,
    } as DocumentVersion

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
      transaction,
    ).then((r) => r.unwrap())

    // Invalidate all resolvedContent for this commit
    await tx
      .update(documentVersions)
      .set({ resolvedContent: null })
      .where(eq(documentVersions.commitId, commit.id))

    await updateListOfIntegrations(
      {
        workspace: workspace!,
        projectId: commit.projectId,
        documentVersion: newVersion,
      },
      transaction,
    )

    await pingProjectUpdate(
      {
        projectId: commit.projectId,
      },
      transaction,
    ).then((r) => r.unwrap())

    return Result.ok(updatedDocs[0]!)
  })
}
