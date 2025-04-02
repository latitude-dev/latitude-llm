import { useCurrentProject } from '@latitude-data/web-ui/providers'
import useFetcher from '$/hooks/useFetcher'
import { ROUTES } from '$/services/routes'
import useSWR, { SWRConfiguration } from 'swr'

type MeanResult = {
  meanValue: number
  minValue: number
  maxValue: number
}
export default function useEvaluationResultsMeanValue(
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
  // TODO: remove useCurrentProject, pass the project id as a parameter
  const { project } = useCurrentProject()
  const fetcher = useFetcher<MeanResult>(
    ROUTES.api.projects
      .detail(project.id)
      .commits.detail(commitUuid)
      .documents.detail(documentUuid)
      .evaluations.detail({ evaluationId }).evaluationResults.mean,
    { fallback: null },
  )
  const { data, isLoading, error, mutate } = useSWR<MeanResult>(
    ['evaluationResultsMeanQuery', commitUuid, documentUuid, evaluationId],
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
