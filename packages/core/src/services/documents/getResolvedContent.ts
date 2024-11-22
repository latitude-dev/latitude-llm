import path from 'path'

import { readMetadata, Document as RefDocument } from '@latitude-data/compiler'
import { scan } from '@latitude-data/promptl'

import { Commit, DocumentVersion, Workspace } from '../../browser'
import {
  LatitudeError,
  Result,
  TypedResult,
  UnprocessableEntityError,
} from '../../lib'
import { DocumentVersionsRepository } from '../../repositories'

/**
 * This is an internal method. It should always receives
 * workspaceId from a trusted source. Like for example API gateway that validates
 * requested documents belongs to the right workspace.
 */
export async function getResolvedContent({
  workspaceId,
  document,
  commit,
}: {
  workspaceId: Workspace['id']
  document: DocumentVersion
  commit: Commit
}): Promise<TypedResult<string, LatitudeError>> {
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

  if (commit.mergedAt != null && document.resolvedContent != null) {
    return Result.ok(document.resolvedContent!)
  }

  const referenceFn = async (
    refPath: string,
    from?: string,
  ): Promise<RefDocument | undefined> => {
    const fullPath = path
      .resolve(path.dirname(`/${from ?? ''}`), refPath)
      .replace(/^\//, '')

    const doc = docs.find((d) => d.path === fullPath)
    if (!doc) return undefined

    return {
      path: fullPath,
      content: doc.content,
    }
  }

  const metadata =
    document.promptlVersion === 0
      ? await readMetadata({
          prompt: document.content,
          fullPath: document.path,
          referenceFn,
        })
      : await scan({
          prompt: document.content,
          fullPath: document.path,
          referenceFn,
        })

  return Result.ok(metadata.resolvedPrompt)
}
