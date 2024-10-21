import { compactObject } from '@latitude-data/core/lib/compactObject'
import { DocumentLogWithMetadataAndError } from '@latitude-data/core/repositories'
import useFetcher from '$/hooks/useFetcher'
import { ROUTES } from '$/services/routes'
import useSWR, { SWRConfiguration } from 'swr'

const EMPTY_ARRAY: [] = []
export default function useDocumentLogs(
  {
    documentUuid,
    commitUuid,
    projectId,
    page,
    pageSize,
  }: {
    documentUuid: string
    commitUuid: string
    projectId: number
    page: number | null
    pageSize: number | null
  },
  { fallbackData }: SWRConfiguration = {},
) {
  const fetcher = useFetcher(
    ROUTES.api.projects
      .detail(projectId)
      .commits.detail(commitUuid)
      .documents.detail(documentUuid).documentLogs.root,
    {
      serializer: (rows) => rows.map(documentLogPresenter),
      searchParams: compactObject({
        page: page ? String(page) : undefined,
        pageSize: pageSize ? String(pageSize) : undefined,
      }) as Record<string, string>,
    },
  )

  const { data = EMPTY_ARRAY, mutate } = useSWR<
    DocumentLogWithMetadataAndError[]
  >(
    ['documentLogs', documentUuid, commitUuid, projectId, page, pageSize],
    fetcher,
    { fallbackData },
  )

  return { data, mutate }
}

export function documentLogPresenter(
  documentLog: DocumentLogWithMetadataAndError,
) {
  return {
    ...documentLog,
    createdAt: new Date(documentLog.createdAt),
  }
}
