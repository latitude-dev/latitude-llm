import { Commit, DocumentVersion, Project } from '../../../../browser'

export function projectPresenter(project: Project) {
  return {
    id: project.id,
    name: project.name,
    href: `/projects/${project.id}`,
  }
}

export function versionPresenter(commit: Commit) {
  return {
    uuid: commit.uuid,
    title: commit.title,
    isMerged: !!commit.mergedAt,
  }
}

export function promptPresenter({
  document,
  projectId,
  versionUuid,
}: {
  document: DocumentVersion
  projectId: number
  versionUuid: string
}) {
  if (document.deletedAt) {
    return {
      uuid: document.documentUuid,
      deleted: true,
    }
  }

  return {
    uuid: document.documentUuid,
    path: document.path,
    isAgent: document.documentType === 'agent',
    href: `/projects/${projectId}/versions/${versionUuid}/documents/${document.documentUuid}`,
  }
}
