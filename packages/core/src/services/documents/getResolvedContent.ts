import { Commit, DocumentVersion, Workspace } from '../../browser'
import { LatitudeError, UnprocessableEntityError } from '../../lib/errors'
import { Result, TypedResult } from '../../lib/Result'
import { DocumentVersionsRepository } from '../../repositories'
import { scanDocumentContent } from './scan'

/**
 * This is an internal method. It should always receives
 * workspaceId from a trusted source. Like for example API gateway that validates
 * requested documents belongs to the right workspace.
 */
export async function getResolvedContent({
  workspaceId,
  document,
  commit,
  customPrompt,
}: {
  workspaceId: Workspace['id']
  document: DocumentVersion
  commit: Commit
  customPrompt?: string
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

  if (
    customPrompt === undefined &&
    commit.mergedAt != null &&
    document.resolvedContent != null
  ) {
    return Result.ok(document.resolvedContent!)
  }

  const metadataResult = await scanDocumentContent({
    workspaceId,
    document: {
      ...document,
      content: customPrompt ?? document.content,
    },
    commit,
  })

  if (metadataResult.error) return metadataResult

  return Result.ok(metadataResult.unwrap().resolvedPrompt)
}
