import path from 'path'

import {
  createChain,
  readMetadata,
  Document as RefDocument,
} from '@latitude-data/compiler'
import { Commit, Workspace } from '$core/browser'
import { NotFoundError, Result } from '$core/lib'
import { DocumentVersionsRepository } from '$core/repositories'

export async function createChainAtCommit({
  workspace,
  documentUuid,
  commit,
  parameters,
}: {
  // TODO: review, we shouldn't need to pass workspace around so much
  workspace: Workspace
  documentUuid: string
  commit: Commit
  parameters: Record<string, unknown>
}) {
  const documentScope = new DocumentVersionsRepository(workspace.id)
  const docs = await documentScope.getDocumentsAtCommit(commit)
  if (docs.error) return Result.error(docs.error)

  const document = docs.value.find((d) => d.documentUuid === documentUuid)
  if (!document) return Result.error(new NotFoundError('Document not found'))

  let resolvedContent: string = document.resolvedContent!

  if (document.resolvedContent === undefined || commit.mergedAt === null) {
    const referenceFn = async (
      refPath: string,
      from?: string,
    ): Promise<RefDocument | undefined> => {
      const fullPath = path
        .resolve(path.dirname(`/${from ?? ''}`), refPath)
        .replace(/^\//, '')

      const document = docs.value.find((d) => d.path === fullPath)
      if (!document) return undefined

      return {
        path: fullPath,
        content: document.content,
      }
    }

    const metadata = await readMetadata({
      prompt: document.content,
      fullPath: document.path,
      referenceFn,
    })

    resolvedContent = metadata.resolvedPrompt
  }

  return Result.ok(createChain({ prompt: resolvedContent, parameters }))
}
