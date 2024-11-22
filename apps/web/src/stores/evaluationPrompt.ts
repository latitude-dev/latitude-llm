import useFetcher from '$/hooks/useFetcher'
import { ROUTES } from '$/services/routes'
import useSWR, { SWRConfiguration } from 'swr'

export default function useEvaluationPrompt(
  {
    evaluationId,
  }: {
    evaluationId: number
  },
  opts: SWRConfiguration = {},
) {
  const fetcher = useFetcher(
    ROUTES.api.evaluations.detail(evaluationId).prompt.root,
  )
  const { data, ...rest } = useSWR<string>(
    ['evaluationPrompt', evaluationId],
    fetcher,
    opts,
  )

  return {
    data,
    ...rest,
  }
}
