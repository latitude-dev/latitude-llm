import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { useDocumentVersionActions } from '$/stores/actions/documentVersionActions'

/**
 * Returns document version operations scoped to the current sidebar commit/project.
 */
export function useSidebarDocumentVersions() {
  const { commit } = useCurrentCommit()
  const { project } = useCurrentProject()

  return useDocumentVersionActions({
    commitUuid: commit.uuid,
    projectId: project.id,
  })
}
