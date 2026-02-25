import { cache } from '../../../cache'
import { Result, TypedResult } from '../../../lib/Result'
import { type Commit } from '../../../schema/models/types/Commit'
import { type DocumentVersion } from '../../../schema/models/types/DocumentVersion'
import { type Workspace } from '../../../schema/models/types/Workspace'
import { getDataCacheKey } from '../getDataCacheKey'
import { updateDocument } from '../update'
import { validateDocumentMetadata } from './validateDocumentMetadata'

type ValidatedMetadata = Awaited<ReturnType<typeof validateDocumentMetadata>>

export type UpdateDocumentContentResponse = {
  document: DocumentVersion
  metadata: ValidatedMetadata
}

export async function updateDocumentContent({
  workspace,
  commit,
  document,
  prompt,
}: {
  workspace: Workspace
  commit: Commit
  document: DocumentVersion
  prompt: string
}): Promise<TypedResult<UpdateDocumentContentResponse>> {
  const metadata = await validateDocumentMetadata({
    workspace,
    commit,
    document,
    prompt,
  })
  const result = await updateDocument({
    commit,
    document,
    content: prompt,
  })
  if (result.error) return result

  try {
    const cacheClient = await cache()
    await cacheClient.del(
      getDataCacheKey({
        workspaceId: workspace.id,
        projectId: commit.projectId,
        commitUuid: commit.uuid,
        documentPath: document.path,
      }),
    )
  } catch (_error) {
    // Ignore cache errors
  }

  return Result.ok({
    document: result.value,
    metadata,
  })
}
