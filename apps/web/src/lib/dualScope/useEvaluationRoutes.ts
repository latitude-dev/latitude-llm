import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { useProductAccess } from '$/components/Providers/SessionProvider'
import { ROUTES } from '$/services/routes'
import { useCallback, useMemo } from 'react'
import { isRootDocument } from './isRootDocument'

export function useEvaluationRoutes() {
  const { promptManagement } = useProductAccess()
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const { document } = useCurrentDocument()

  const useProjectLevelRoutes = isRootDocument({
    documentPath: document.path,
    promptManagement,
  })

  const evaluationDetail = useCallback(
    (evaluationUuid: string) => {
      if (useProjectLevelRoutes) {
        return ROUTES.projects
          .detail({ id: project.id })
          .evaluations.detail({ uuid: evaluationUuid }).root
      }
      return ROUTES.projects
        .detail({ id: project.id })
        .commits.detail({ uuid: commit.uuid })
        .documents.detail({ uuid: document.documentUuid })
        .evaluations.detail({ uuid: evaluationUuid }).root
    },
    [useProjectLevelRoutes, project.id, commit.uuid, document.documentUuid],
  )

  const evaluationEditor = useCallback(
    (evaluationUuid: string) => {
      if (useProjectLevelRoutes) {
        return ROUTES.projects
          .detail({ id: project.id })
          .evaluations.detail({ uuid: evaluationUuid }).editor.root
      }
      return ROUTES.projects
        .detail({ id: project.id })
        .commits.detail({ uuid: commit.uuid })
        .documents.detail({ uuid: document.documentUuid })
        .evaluations.detail({ uuid: evaluationUuid }).editor.root
    },
    [useProjectLevelRoutes, project.id, commit.uuid, document.documentUuid],
  )

  return useMemo(
    () => ({ evaluationDetail, evaluationEditor }),
    [evaluationDetail, evaluationEditor],
  )
}
