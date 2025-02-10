import { ConnectedEvaluation } from '@latitude-data/core/browser'
import { updateConnectedEvaluationAction } from '$/actions/connectedEvaluations/update'
import useFetcher from '$/hooks/useFetcher'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import { ROUTES } from '$/services/routes'
import useSWR, { SWRConfiguration } from 'swr'

export default function useConnectedEvaluations(
  {
    projectId,
    commitUuid,
    documentUuid,
  }: {
    projectId: number
    commitUuid: string
    documentUuid: string
  },
  opts: SWRConfiguration = {},
) {
  const fetcher = useFetcher(
    ROUTES.api.projects
      .detail(projectId)
      .commits.detail(commitUuid)
      .documents.detail(documentUuid).evaluations.root,
  )
  const {
    data = [],
    mutate,
    ...rest
  } = useSWR<ConnectedEvaluation[]>(
    ['connectedEvaluations', documentUuid],
    fetcher,
    opts,
  )

  const { execute: update, isPending: isUpdating } = useLatitudeAction(
    updateConnectedEvaluationAction,
    {
      onSuccess: ({
        data: updatedEvaluation,
      }: {
        data: ConnectedEvaluation
      }) => {
        mutate(
          (evaluations) =>
            evaluations?.map((evaluation) =>
              evaluation.id === updatedEvaluation.id
                ? updatedEvaluation
                : evaluation,
            ) ?? [updatedEvaluation],
        )
      },
    },
  )

  return {
    data,
    update,
    isUpdating,
    ...rest,
  }
}
