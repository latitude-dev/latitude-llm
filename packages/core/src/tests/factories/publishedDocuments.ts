import { type DocumentVersion } from '../../schema/models/types/DocumentVersion'
import { type Project } from '../../schema/models/types/Project'
import { type Workspace } from '../../schema/models/types/Workspace'
import { createPublishedDocument as createFn } from '../../services/publishedDocuments/create'

export async function createPublishedDocument({
  workspace,
  project,
  document,
  commitUuid,
}: {
  project: Project
  workspace: Workspace
  document: DocumentVersion
  commitUuid: string
}) {
  return createFn({
    workspace,
    project,
    document,
    commitUuid,
  }).then((r) => r.unwrap())
}
