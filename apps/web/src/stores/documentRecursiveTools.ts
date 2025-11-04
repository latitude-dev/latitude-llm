import useFetcher from '$/hooks/useFetcher'
import { ROUTES } from '$/services/routes'
import { ToolManifestDict } from '@latitude-data/constants/tools'
import useSWR, { SWRConfiguration } from 'swr'

export default function useDocumentRecursiveTools(
  {
    projectId,
    commitUuid,
    documentUuid,
  }: {
    projectId: number
    commitUuid: string
    documentUuid: string
  },
  opts?: SWRConfiguration,
) {
  const fetcher = useFetcher<ToolManifestDict>(
    ROUTES.api.projects
      .detail(projectId)
      .commits.detail(commitUuid)
      .documents.detail(documentUuid).tools.root,
  )

  const { data, isLoading } = useSWR<ToolManifestDict>(
    ['documentRecursiveTools', projectId, commitUuid, documentUuid],
    fetcher,
    opts,
  )

  return { data, isLoading }
}
