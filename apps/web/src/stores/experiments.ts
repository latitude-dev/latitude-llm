import { createExperimentAction } from '$/actions/experiments'
import useFetcher from '$/hooks/useFetcher'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import { ROUTES } from '$/services/routes'
import { toast } from '@latitude-data/web-ui/atoms/Toast'
import { useMemo } from 'react'
import useSWR, { SWRConfiguration } from 'swr'
import { ExperimentDto } from '@latitude-data/core/schema/models/types/Experiment'
import { useExperimentPolling } from '$/helpers/experimentPolling'

import { Experiment } from '@latitude-data/core/schema/models/types/Experiment'
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
    fallbackData?: ExperimentDto[]
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

  const refreshIntervalFn = useExperimentPolling<ExperimentDto>()

  const {
    data = EMPTY_ARRAY,
    isLoading,
    mutate,
  } = useSWR<ExperimentDto[]>(
    ['experiments', projectId, documentUuid, page, pageSize],
    dataFetcher,
    {
      ...opts,
      refreshInterval: refreshIntervalFn,
    },
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
                const prevExperimentIdx = prev?.findIndex(
                  (exp: ExperimentDto) => exp.uuid === experimentDto.uuid,
                )

                if (
                  prevExperimentIdx !== undefined &&
                  prevExperimentIdx !== -1
                ) {
                  // this might happen due to race conditions with the experimentStatus websocket
                  // Update the existing experiment instead of adding a duplicate
                  newArray[prevExperimentIdx] = experimentDto
                } else {
                  // Only add if it doesn't already exist
                  newArray.unshift(experimentDto)
                }
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
        toast({
          title: 'Error creating experiment',
          description: error?.message,
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
