import { type Commit } from '../../schema/models/types/Commit'
import { type DocumentVersion } from '../../schema/models/types/DocumentVersion'
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
