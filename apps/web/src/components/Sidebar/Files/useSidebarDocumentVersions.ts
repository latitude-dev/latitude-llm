import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import useDocumentVersions from '$/stores/documentVersions'

/**
 * Returns document version operations scoped to the current sidebar commit/project.
 */
export function useSidebarDocumentVersions() {
  const { commit } = useCurrentCommit()
  const { project } = useCurrentProject()

  return useDocumentVersions({
    commitUuid: commit.uuid,
    projectId: project.id,
  })
}
