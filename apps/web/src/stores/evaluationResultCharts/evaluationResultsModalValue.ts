import { useCurrentProject } from '@latitude-data/web-ui/providers'
import useFetcher from '$/hooks/useFetcher'
import { ROUTES } from '$/services/routes'
import useSWR, { SWRConfiguration } from 'swr'

type ModalResult = {
  mostCommon: string
  percentage: number
}
export default function useEvaluationResultsModalValue(
  {
    commitUuid,
    documentUuid,
    evaluationId,
  }: {
    commitUuid: string
    documentUuid: string
    evaluationId: number
  },
  { fallbackData }: SWRConfiguration = {},
) {
  // TODO: remove this hook, pass the project id as a parameter
  const { project } = useCurrentProject()
  const fetcher = useFetcher<ModalResult>(
    ROUTES.api.projects
      .detail(project.id)
      .commits.detail(commitUuid)
      .documents.detail(documentUuid)
      .evaluations.detail({ evaluationId }).evaluationResults.modal,
    { fallback: null },
  )
  const { data, isLoading, error, mutate } = useSWR<
    ModalResult,
    ModalResult | undefined
  >(
    ['evaluationResultsModalQuery', commitUuid, documentUuid, evaluationId],
    fetcher,
    { fallbackData },
  )

  return {
    data,
    isLoading,
    error,
    refetch: mutate,
  }
}
