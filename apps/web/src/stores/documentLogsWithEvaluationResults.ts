import { compactObject } from '@latitude-data/core/lib/compactObject'
import useFetcher from '$/hooks/useFetcher'
import { ROUTES } from '$/services/routes'
import useSWR, { SWRConfiguration } from 'swr'

import { documentLogPresenter } from './documentLogs'
import { DocumentLogWithMetadataAndErrorAndEvaluationResult } from '$/app/(private)/projects/[projectId]/versions/[commitUuid]/documents/[documentUuid]/evaluations/[evaluationId]/_components/ManualEvaluationResults'

const EMPTY_LIST: DocumentLogWithMetadataAndErrorAndEvaluationResult[] = []
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
  const fetcher = useFetcher<
    DocumentLogWithMetadataAndErrorAndEvaluationResult[],
    DocumentLogWithMetadataAndErrorAndEvaluationResult[]
  >(
    ROUTES.api.projects
      .detail(projectId)
      .commits.detail(commitUuid)
      .documents.detail(documentUuid)
      .evaluations.detail({ evaluationId }).logs.root,
    {
      serializer: (rows) => rows.map(documentLogPresenter<false>),
      searchParams: compactObject({
        page: page ? String(page) : undefined,
        pageSize: pageSize ? String(pageSize) : undefined,
      }) as Record<string, string>,
    },
  )

  const { data = EMPTY_LIST, ...rest } = useSWR<
    DocumentLogWithMetadataAndErrorAndEvaluationResult[]
  >(
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

  return { data, ...rest }
}
