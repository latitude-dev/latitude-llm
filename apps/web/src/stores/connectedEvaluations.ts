import { useCallback } from 'react'

import { ConnectedEvaluation } from '@latitude-data/core/browser'
import { useToast } from '@latitude-data/web-ui'
import { updateConnectedEvaluationAction } from '$/actions/connectedEvaluations/update'
import useLatitudeAction from '$/hooks/useLatitudeAction'
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
  const { toast } = useToast()
  const {
    data = [],
    mutate,
    ...rest
  } = useSWR<ConnectedEvaluation[]>(
    ['connectedEvaluations', documentUuid],
    useCallback(async () => {
      const response = await fetch(
        `/api/documents/${projectId}/${commitUuid}/${documentUuid}/evaluations`,
        { credentials: 'include' },
      )
      if (!response.ok) {
        const error = await response.json()

        toast({
          title: 'Error fetching evaluations',
          description: error.formErrors?.[0] || error.message,
          variant: 'destructive',
        })

        return []
      }

      return response.json()
    }, [projectId, commitUuid, documentUuid]),
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
