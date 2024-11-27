import { DocumentVersion, Project, Workspace } from '../../browser'
import { createPublishedDocument as createFn } from '../../services/publishedDocuments/create'

export async function createPublishedDocument({
  workspace,
  project,
  document,
}: {
  project: Project
  workspace: Workspace
  document: DocumentVersion
}) {
  return createFn({
    workspace,
    project,
    document,
  }).then((r) => r.unwrap())
}
