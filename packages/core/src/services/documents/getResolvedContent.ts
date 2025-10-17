import { type Commit } from '../../schema/models/types/Commit'
import { type DocumentVersion } from '../../schema/models/types/DocumentVersion'
import { LatitudeError } from '../../lib/errors'
import { Result, TypedResult } from '../../lib/Result'
import { scanDocumentContent } from './scan'

export async function getResolvedContent({
  commit,
  document,
  customPrompt,
}: {
  document: DocumentVersion
  commit: Commit
  customPrompt?: string
}): Promise<TypedResult<string, LatitudeError>> {
  if (
    customPrompt === undefined &&
    commit.mergedAt != null &&
    document.resolvedContent != null
  ) {
    return Result.ok(document.resolvedContent!)
  }

  const metadataResult = await scanDocumentContent({
    document: {
      ...document,
      content: customPrompt ?? document.content,
    },
    commit,
  })

  if (metadataResult.error) return metadataResult

  return Result.ok(metadataResult.unwrap().resolvedPrompt)
}
