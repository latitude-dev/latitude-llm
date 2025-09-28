import { Commit, DocumentVersion } from '../../schema/types'
import { DocumentVersionDto } from '../../constants'

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
