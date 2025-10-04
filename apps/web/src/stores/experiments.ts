import { createExperimentAction } from '$/actions/experiments'
import useFetcher from '$/hooks/useFetcher'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import { ROUTES } from '$/services/routes'
import { toast } from '@latitude-data/web-ui/atoms/Toast'
import { useMemo } from 'react'
import useSWR, { SWRConfiguration } from 'swr'
import { Experiment, ExperimentDto } from '@latitude-data/core/schema/types'

const EMPTY_ARRAY: [] = []

export function useExperiments(
  {
    projectId,
    documentUuid,
    page = 1,
    pageSize = 25,
  }: {
    projectId: number
    documentUuid: string
    page?: number
    pageSize?: number
  },
  opts: SWRConfiguration & {
    onCreate?: (experiments: ExperimentDto[]) => void
  } = {},
) {
  const dataFetcher = useFetcher<ExperimentDto[]>(
    ROUTES.api.projects
      .detail(projectId)
      .documents.detail(documentUuid)
      .experiments.paginated({ page, pageSize }),
  )

  const countFetcher = useFetcher<number>(
    ROUTES.api.projects.detail(projectId).documents.detail(documentUuid)
      .experiments.count,
  )

  const {
    data = EMPTY_ARRAY,
    isLoading,
    mutate,
  } = useSWR<ExperimentDto[]>(
    ['experiments', projectId, documentUuid, page, pageSize],
    dataFetcher,
    opts,
  )

  const { data: count = undefined, mutate: mutateCount } = useSWR<number>(
    ['experiments', projectId, documentUuid, 'count'],
    countFetcher,
    opts,
  )

  const { execute: create, isPending: isCreating } = useLatitudeAction(
    createExperimentAction,
    {
      onSuccess: async ({ data: experiments }: { data: Experiment[] }) => {
        mutateCount((prev) => (prev ?? 0) + experiments.length, {
          revalidate: false,
        })

        const experimentDtos = experiments.map(
          (experiment) =>
            ({
              ...experiment,
              results: {
                passed: 0,
                failed: 0,
                errors: 0,
                totalScore: 0,
              },
            }) as ExperimentDto,
        )

        if (page === 1) {
          mutate(
            (prev) => {
              const newArray = prev ? [...prev] : []
              experimentDtos.forEach((experimentDto) => {
                const prevExperiment = prev?.find(
                  (exp) => exp.uuid === experimentDto.uuid,
                )

                if (prevExperiment) {
                  // this might happen due to race conditions with the experimentStatus websocket
                }
                newArray.unshift(experimentDto)
              })

              return newArray
            },
            {
              revalidate: false,
            },
          )
        }

        toast({
          title: 'Experiments created successfully',
          description: `Experiments created successfully`,
        })

        opts?.onCreate?.(experimentDtos)
        return experimentDtos
      },
      onError: async (error) => {
        if (error?.err?.name === 'ZodError') return
        toast({
          title: 'Error creating experiment',
          description: error?.err?.message,
          variant: 'destructive',
        })
      },
    },
  )

  return useMemo(
    () => ({
      mutate,
      count,
      data,
      isLoading,
      create,
      isCreating,
    }),
    [mutate, count, data, isLoading, create, isCreating],
  )
}
