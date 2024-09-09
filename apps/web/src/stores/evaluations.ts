'use client'

import { compact, flatten } from 'lodash-es'

import type { EvaluationDto } from '@latitude-data/core/browser'
import { useToast } from '@latitude-data/web-ui'
import { createEvaluationAction } from '$/actions/evaluations/create'
import { destroyEvaluationAction } from '$/actions/evaluations/destroy'
import { fetchEvaluationsAction } from '$/actions/evaluations/fetch'
import { updateEvaluationContentAction } from '$/actions/evaluations/updateContent'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import useSWR, { SWRConfiguration } from 'swr'

export default function useEvaluations(
  opts: SWRConfiguration & {
    onSuccessCreate?: (evaluation: EvaluationDto) => void
    params?: { documentUuid: string }
  } = {},
) {
  const { onSuccessCreate } = opts
  const { toast } = useToast()

  const {
    data = [],
    mutate,
    isLoading,
    error: swrError,
  } = useSWR<EvaluationDto[]>(
    compact(['evaluations', ...flatten(Object.entries(opts?.params ?? {}))]),
    async () => {
      const [data, error] = await fetchEvaluationsAction(opts?.params)

      if (error) {
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

  const { execute: create, isPending: isCreating } = useLatitudeAction(
    createEvaluationAction,
    {
      onSuccess: async ({ data: newEvaluation }) => {
        mutate([...(data ?? []), newEvaluation])
        onSuccessCreate?.(newEvaluation)

        toast({
          title: 'Success',
          description: `New Evaluation ${newEvaluation.name} created`,
        })
      },
    },
  )

  const { execute: update, isPending: isUpdating } = useLatitudeAction(
    updateEvaluationContentAction,
    {
      onSuccess: ({ data: newEval }) => {
        const prevEvaluations = data
        mutate(
          prevEvaluations.map((prevEval) =>
            prevEval.uuid === newEval.uuid ? newEval : prevEval,
          ),
        )
      },
    },
  )

  const { execute: destroy } = useLatitudeAction(destroyEvaluationAction, {
    onSuccess: ({ data: deletedEvaluation }) => {
      toast({
        title: 'Success',
        description: `${deletedEvaluation.name} destroyed successfully`,
      })

      mutate(data.filter((e) => e.id !== deletedEvaluation.id))
    },
  })

  return {
    data,
    mutate,
    isLoading,
    create,
    isCreating,
    update,
    isUpdating,
    error: swrError,
    destroy,
  }
}
