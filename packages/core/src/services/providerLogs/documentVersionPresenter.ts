import type { Commit, DocumentVersion, DocumentVersionDto } from '../../browser'

export function documentVersionPresenter({
  documentVersion,
  commit,
}: {
  documentVersion: DocumentVersion
  commit: Commit
}): DocumentVersionDto {
  return {
    ...documentVersion,
    projectId: commit.projectId,
    commitUuid: commit.uuid,
  }
}
