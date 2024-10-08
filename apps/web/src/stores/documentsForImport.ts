import useFetcher from '$/hooks/useFetcher'
import { ROUTES } from '$/services/routes'
import useSWR, { SWRConfiguration } from 'swr'

interface DocumentForImport {
  documentUuid: string
  path: string
}

export default function useDocumentsForImport(
  { projectId }: { projectId?: number },
  opts?: SWRConfiguration,
) {
  const fetcher = useFetcher(
    projectId
      ? ROUTES.api.projects.detail(projectId).forImport.root
      : undefined,
  )
  const {
    data = [],
    mutate,
    ...rest
  } = useSWR<DocumentForImport[]>(
    ['api/documents/for-import', projectId],
    fetcher,
    opts,
  )

  return { data, mutate, ...rest }
}
