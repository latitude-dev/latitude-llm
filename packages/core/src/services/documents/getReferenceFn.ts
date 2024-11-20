import path from 'path'

import {
  Document as RefDocument,
  ReferencePromptFn,
} from '@latitude-data/compiler'

import { Commit, Workspace } from '../../browser'
import { LatitudeError, Result, TypedResult } from '../../lib'
import { DocumentVersionsRepository } from '../../repositories'

export async function getReferenceFn({
  workspaceId,
  commit,
}: {
  workspaceId: Workspace['id']
  commit: Commit
}): Promise<TypedResult<ReferencePromptFn, LatitudeError>> {
  const documentScope = new DocumentVersionsRepository(workspaceId)
  const docsResult = await documentScope.getDocumentsAtCommit(commit)

  if (docsResult.error) return Result.error(docsResult.error)
  const docs = docsResult.unwrap()

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

  return Result.ok(referenceFn)
}
