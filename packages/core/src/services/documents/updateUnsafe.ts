import { omit } from 'lodash-es'
import { eq } from 'drizzle-orm'
import { cache } from '../../cache'
import { type Commit } from '../../schema/models/types/Commit'
import { type DocumentVersion } from '../../schema/models/types/DocumentVersion'
import { findWorkspaceFromCommit } from '../../data-access/workspaces'
import { BadRequestError, NotFoundError } from '../../lib/errors'
import { Result, TypedResult } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { DocumentVersionsRepository } from '../../repositories/documentVersionsRepository'
import { documentVersions } from '../../schema/models/documentVersions'
import { pingProjectUpdate } from '../projects'
import { canInheritDocumentRelations } from './inheritRelations'
import { updateListOfIntegrations } from './updateListOfIntegrations'
import { getDocumentType } from './update'
import { getDataCacheKey } from './getDataCacheKey'
import { hashContent } from '../../lib/hashContent'

/**
 * Updates a document without checking if the commit is merged.
 * This should only be used in specific cases where you need to bypass
 * the commit state check (e.g., force updating live commits).
 *
 * For normal use cases, use `updateDocument` instead.
 */
export async function updateDocumentUnsafe(
  {
    commit,
    document,
    data: { path, content, promptlVersion, deletedAt, mainEvaluationUuid },
  }: {
    commit: Commit
    document: DocumentVersion
    data: {
      path?: string
      content?: string | null
      promptlVersion?: number
      deletedAt?: Date | null
      mainEvaluationUuid?: string | null
    }
  },
  transaction = new Transaction(),
): Promise<TypedResult<DocumentVersion, Error>> {
  let pathsToInvalidate: string[] = []
  let workspaceIdToInvalidate: number | undefined

  const result = await transaction.call(
    async (tx) => {
      const updatedDocData = Object.fromEntries(
        Object.entries({
          path,
          content,
          promptlVersion,
          deletedAt,
          mainEvaluationUuid,
        }).filter(([_, v]) => v !== undefined),
      )

      const workspace = await findWorkspaceFromCommit(commit, tx)
      const docsScope = new DocumentVersionsRepository(workspace!.id, tx, {
        includeDeleted: true,
      })
      const documents = (await docsScope.getDocumentsAtCommit(commit)).unwrap()
      const doc = documents.find(
        (d) => d.documentUuid === document.documentUuid,
      )

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

      if (content) {
        newVersion.contentHash = hashContent(content)
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

      canInheritDocumentRelations({
        fromVersion: document,
        toVersion: updatedDocs[0]!,
      }).unwrap()

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

      workspaceIdToInvalidate = workspace!.id
      pathsToInvalidate =
        updatedDocs[0]!.path !== document.path
          ? [document.path, updatedDocs[0]!.path]
          : [updatedDocs[0]!.path]

      return Result.ok(updatedDocs[0]!)
    },
    async () => {
      if (workspaceIdToInvalidate === undefined) return
      if (pathsToInvalidate.length === 0) return

      try {
        const cacheClient = await cache()
        const keys = pathsToInvalidate.map((documentPath) =>
          getDataCacheKey({
            workspaceId: workspaceIdToInvalidate!,
            projectId: commit.projectId,
            commitUuid: commit.uuid,
            documentPath,
          }),
        )
        await cacheClient.del(...keys)
      } catch (_error) {
        // Ignore cache errors
      }
    },
  )

  return result
}
