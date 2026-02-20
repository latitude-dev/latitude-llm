import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { useProductAccess } from '$/components/Providers/SessionProvider'
import { buildTraceUrlWithParams } from '$/lib/buildTraceUrl'
import { ROUTES } from '$/services/routes'
import { Span } from '@latitude-data/constants'
import { useCallback } from 'react'
import { isRootDocument } from './isRootDocument'

type BuildTraceUrlArgs = {
  commitUuid: string
  documentUuid: string
  span: Pick<Span, 'id' | 'documentLogUuid'>
  expandedDocumentLogUuid?: string
}

export function useBuildTraceUrl() {
  const { promptManagement } = useProductAccess()
  const { project } = useCurrentProject()
  const { document } = useCurrentDocument()

  const useProjectLevelRoutes = isRootDocument({
    documentPath: document.path,
    promptManagement,
  })

  return useCallback(
    (args: BuildTraceUrlArgs) => {
      const routePath = useProjectLevelRoutes
        ? ROUTES.projects.detail({ id: project.id }).traces.root
        : ROUTES.projects
            .detail({ id: project.id })
            .commits.detail({ uuid: args.commitUuid })
            .documents.detail({ uuid: args.documentUuid }).traces.root

      return buildTraceUrlWithParams({
        routePath,
        span: args.span,
        expandedDocumentLogUuid: args.expandedDocumentLogUuid,
      })
    },
    [useProjectLevelRoutes, project.id],
  )
}
