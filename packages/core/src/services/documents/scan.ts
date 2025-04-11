import path from 'path'

import { readMetadata, Document as RefDocument } from '@latitude-data/compiler'
import { type ConversationMetadata, scan } from 'promptl-ai'

import { Commit, DocumentVersion, Workspace } from '../../browser'
import { DocumentVersionsRepository } from '../../repositories'
import { LatitudeError } from './../../lib/errors'
import { Result } from './../../lib/Result'
import { TypedResult } from './../../lib/Result'
import { UnprocessableEntityError } from './../../lib/errors'

export async function getDocumentMetadata({
  document,
  getDocumentByPath,
}: {
  document: DocumentVersion
  getDocumentByPath: (path: string) => DocumentVersion | undefined
}) {
  const referenceFn = async (
    refPath: string,
    from?: string,
  ): Promise<RefDocument | undefined> => {
    const fullPath = path
      .resolve(path.dirname(`/${from ?? ''}`), refPath)
      .replace(/^\//, '')

    const doc = getDocumentByPath(fullPath)
    if (!doc) return undefined

    return {
      path: fullPath,
      content: doc.content,
    }
  }

  const metadata =
    document.promptlVersion === 0
      ? ((await readMetadata({
          prompt: document.content,
          fullPath: document.path,
          referenceFn,
        })) as ConversationMetadata)
      : await scan({
          prompt: document.content,
          fullPath: document.path,
          referenceFn,
        })
  return metadata
}

/**
 * This is an internal method. It should always receives
 * workspaceId from a trusted source. Like for example API gateway that validates
 * requested documents belongs to the right workspace.
 */
export async function scanDocumentContent({
  workspaceId,
  document,
  commit,
}: {
  workspaceId: Workspace['id']
  document: DocumentVersion
  commit: Commit
}): Promise<TypedResult<ConversationMetadata, LatitudeError>> {
  const documentScope = new DocumentVersionsRepository(workspaceId)
  const docs = await documentScope
    .getDocumentsAtCommit(commit)
    .then((r) => r.unwrap())

  const docInCommit = docs.find((d) => d.documentUuid === document.documentUuid)

  if (!docInCommit) {
    return Result.error(
      new UnprocessableEntityError('Document not found in commit', {}),
    )
  }

  const metadata = await getDocumentMetadata({
    document: docInCommit,
    getDocumentByPath: (path) => docs.find((d) => d.path === path),
  })

  return Result.ok(metadata)
}

export async function scanCommitDocumentContents({
  workspaceId,
  commit,
}: {
  workspaceId: Workspace['id']
  commit: Commit
}): Promise<
  TypedResult<{ [path: string]: ConversationMetadata }, LatitudeError>
> {
  const documentScope = new DocumentVersionsRepository(workspaceId)
  const docs = await documentScope
    .getDocumentsAtCommit(commit)
    .then((r) => r.unwrap())

  try {
    const metadata = await Promise.all(
      docs.map(
        async (doc) =>
          [
            doc.path,
            await scanDocumentContent({
              workspaceId,
              document: doc,
              commit,
            }).then((r) => r.unwrap()),
          ] as [string, ConversationMetadata],
      ),
    )

    return Result.ok(Object.fromEntries(metadata))
  } catch (error) {
    return Result.error(error as LatitudeError)
  }
}
