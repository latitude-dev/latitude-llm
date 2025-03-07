'use client'

import { compact } from 'lodash-es'
import { useCallback, useMemo } from 'react'

import { createEvaluationAction } from '$/actions/evaluations/create'
import { destroyEvaluationAction } from '$/actions/evaluations/destroy'
import { updateEvaluationContentAction } from '$/actions/evaluations/updateContent'
import useFetcher from '$/hooks/useFetcher'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import { ROUTES } from '$/services/routes'
import type { EvaluationDto } from '@latitude-data/core/browser'
import { useToast } from '@latitude-data/web-ui'
import useSWR, { SWRConfiguration } from 'swr'

export default function useEvaluations(
  opts: SWRConfiguration & {
    onSuccessCreate?: (evaluation: EvaluationDto) => void
    onSuccessUpdate?: (evaluation: EvaluationDto) => void
    params?: { documentUuid: string }
  } = {},
) {
  const { onSuccessCreate, onSuccessUpdate, params } = opts
  const { toast } = useToast()
  const { documentUuid } = params ?? {}
  const route = useMemo(
    () =>
      documentUuid
        ? `${ROUTES.api.evaluations.root}?documentUuid=${documentUuid}`
        : ROUTES.api.evaluations.root,
    [documentUuid],
  )
  const fetcher = useFetcher(route)
  const {
    data = [],
    mutate,
    isLoading,
    error: swrError,
  } = useSWR<EvaluationDto[]>(
    compact(['evaluations', documentUuid]),
    fetcher,
    opts,
  )

  const { execute: executeCreate, isPending: isCreating } = useLatitudeAction(
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
  const create = useCallback(
    async (args: Parameters<typeof executeCreate>[0]) => {
      const [result, error] = await executeCreate({ ...args, documentUuid })
      if (error) return
      return result
    },
    [documentUuid, executeCreate],
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
        onSuccessUpdate?.(newEval)

        toast({
          title: 'Success',
          description: `${newEval.name} updated successfully`,
        })
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

  const findEvaluation = useMemo(
    () => (evaluationUuid: string) =>
      data.find((e) => e.uuid === evaluationUuid),
    [data],
  )

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
    findEvaluation,
  }
}
