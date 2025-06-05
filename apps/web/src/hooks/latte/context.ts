import { useCommitsFromProject } from '$/stores/commitsStore'
import useDocumentVersions from '$/stores/documentVersions'
import useProjects from '$/stores/projects'
import { Commit, Project, DocumentVersion } from '@latitude-data/core/browser'
import { useParams, usePathname } from 'next/navigation'
import { useCallback, useMemo } from 'react'

export function useLatteContext() {
  const pathname = usePathname()

  const { projectId, commitUuid, documentUuid } = useParams<{
    projectId?: string
    commitUuid?: string
    documentUuid?: string
  }>()

  const { data: projects } = useProjects()
  const currentProject = useMemo(() => {
    if (!projectId) return undefined
    return projects?.find((p) => p.id === Number(projectId))
  }, [projects, projectId])

  const { data: commits } = useCommitsFromProject(currentProject?.id)
  const currentCommit = useMemo(() => {
    if (!commitUuid) return undefined
    return commits?.find((c) => c.uuid === commitUuid)
  }, [commits, commitUuid])

  const { data: documentVersions } = useDocumentVersions({
    commitUuid: currentCommit?.uuid,
    projectId: currentProject?.id,
  })
  const currentDocument = useMemo(() => {
    if (!documentUuid) return undefined
    return documentVersions?.find((d) => d.documentUuid === documentUuid)
  }, [documentVersions, documentUuid])

  return useCallback(() => {
    const meta = document.querySelector<HTMLMetaElement>(
      `meta[name="location-description"]`,
    )
    const locationDescription = meta?.content || 'The Latitude Platform'

    const items = contextItems({
      pathname,
      project: currentProject,
      commit: currentCommit,
      document: currentDocument,
    })

    return `
<context>
  The user is currently in this page: ${locationDescription}.
  ${items.map((item) => `<${item.name}>${item.value}</${item.name}>`).join('\n  ')}
</context>
    `
  }, [pathname, currentProject, currentCommit, currentDocument])
}

function contextItems({
  pathname,
  project,
  commit,
  document,
}: {
  pathname: string
  project?: Project
  commit?: Commit
  document?: DocumentVersion
}): { name: string; value: string }[] {
  const items: { name: string; value: string }[] = [
    { name: 'path', value: pathname },
  ]

  items.push({
    name: 'project',
    value: project
      ? JSON.stringify({ id: project.id, name: project.name })
      : 'No project',
  })
  if (!project) return items

  items.push({
    name: 'version',
    value: commit
      ? JSON.stringify({
          uuid: commit.uuid,
          title: commit.title,
          isMerged: !!commit.mergedAt,
        })
      : 'No version selected',
  })
  if (!commit) return items

  items.push({
    name: 'prompt',
    value: document
      ? JSON.stringify({ uuid: document.documentUuid, path: document.path })
      : 'No prompt selected',
  })
  if (!document) return items

  return items
}
