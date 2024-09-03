'use client'

import type { EvaluationDto } from '@latitude-data/core/browser'
import { useSession, useToast } from '@latitude-data/web-ui'
import { createEvaluationAction } from '$/actions/evaluations/create'
import { fetchEvaluationsAction } from '$/actions/evaluations/fetch'
import { updateEvaluationContentAction } from '$/actions/evaluations/updateContent'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import useSWR, { SWRConfiguration } from 'swr'

export default function useEvaluations(
  opts: SWRConfiguration & {
    onSuccessCreate?: (evaluation: EvaluationDto) => void
  } = {},
) {
  const { workspace } = useSession()
  const { onSuccessCreate } = opts
  const { toast } = useToast()

  const {
    data = [],
    mutate,
    isLoading,
    error: swrError,
  } = useSWR<EvaluationDto[]>(
    ['evaluations', workspace.id],
    async () => {
      const [data, error] = await fetchEvaluationsAction()

      if (error) {
        console.error(error)

        toast({
          title: 'Error fetching evaluations',
          description: error.formErrors?.[0] || error.message,
          variant: 'destructive',
        })
        throw error
      }

      return data
    },
    opts,
  )

  const { execute: createEvaluation, isPending: isCreating } =
    useLatitudeAction(createEvaluationAction, {
      onSuccess: async ({ data: newEvaluation }) => {
        mutate([...(data ?? []), newEvaluation])
        onSuccessCreate?.(newEvaluation)

        toast({
          title: 'Success',
          description: `New Evaluation ${newEvaluation.name} created`,
        })
      },
    })

  const { execute: updateEvaluation, isPending: isUpdating } =
    useLatitudeAction(updateEvaluationContentAction, {
      onSuccess: ({ data: newEval }) => {
        const prevEvaluations = data
        mutate(
          prevEvaluations.map((prevEval) =>
            prevEval.uuid === newEval.uuid ? newEval : prevEval,
          ),
        )
      },
    })

  return {
    data,
    isLoading,
    createEvaluation,
    isCreating,
    updateEvaluation,
    isUpdating,
    error: swrError,
  }
}
