import { DocumentLogWithMetadataAndErrorAndEvaluationResult } from '$/app/(private)/projects/[projectId]/versions/[commitUuid]/documents/[documentUuid]/evaluations/[evaluationId]/_components/ManualEvaluationResults'
import useFetcher from '$/hooks/useFetcher'
import { ROUTES } from '$/services/routes'
import useSWR, { SWRConfiguration } from 'swr'

import { documentLogPresenter } from './documentLogs'

export function useDocumentLogsWithEvaluationResults(
  {
    evaluationId,
    documentUuid,
    commitUuid,
    projectId,
    page,
    pageSize,
  }: {
    evaluationId: number
    documentUuid: string
    commitUuid: string
    projectId: number
    page: string | undefined | null
    pageSize: string | undefined | null
  },
  opts?: SWRConfiguration,
) {
  const fetcher = useFetcher(
    ROUTES.api.projects
      .detail(projectId)
      .commits.detail(commitUuid)
      .documents.detail(documentUuid)
      .evaluations.detail({ evaluationId }).logs.root,
    {
      serializer: (rows) => rows.map(documentLogPresenter),
    },
  )

  return useSWR<DocumentLogWithMetadataAndErrorAndEvaluationResult[]>(
    [
      'documentLogsWithEvaluationResults',
      evaluationId,
      documentUuid,
      commitUuid,
      projectId,
      page,
      pageSize,
    ],
    fetcher,
    {
      ...opts,
      revalidateIfStale: false,
      revalidateOnFocus: false,
    },
  )
}
