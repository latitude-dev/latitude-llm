import { DocumentVersion, Project, Workspace } from '../../schema/types'
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
