import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import { ROUTES } from '$/services/routes'
import {
  useCurrentCommit,
  useCurrentProject,
} from '@latitude-data/web-ui/providers'

export function useGenerateDocumentLogDetailUrl({
  page,
  documentLogUuid,
}: {
  documentLogUuid: string | undefined
  page: number | undefined
}) {
  const { document } = useCurrentDocument()
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const queryParams = `page=${page}&logUuid=${documentLogUuid}`
  const route = ROUTES.projects
    .detail({ id: project.id })
    .commits.detail({ uuid: commit.uuid })
    .documents.detail({ uuid: document.documentUuid }).logs.root

  const url = `${route}?${queryParams}`
  if (page === undefined || !documentLogUuid) return { url: undefined }

  return {
    url,
  }
}
