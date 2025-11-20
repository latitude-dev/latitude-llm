import useFetcher from '$/hooks/useFetcher'
import { ActiveEvaluation } from '@latitude-data/constants/evaluations'
import { Project } from '@latitude-data/core/schema/models/types/Project'
import { SWRConfiguration } from 'swr'
import { ROUTES } from '$/services/routes'
import {
  EventArgs,
  useSockets,
} from '$/components/Providers/WebsocketsProvider/useSockets'
import { useCallback } from 'react'
import useSWR from 'swr'

export function useActiveEvaluations(
  {
    project,
  }: {
    project: Pick<Project, 'id'>
  },
  opts?: SWRConfiguration & {
    onEvaluationEnded?: (evaluation: ActiveEvaluation) => void
    onEvaluationFailed?: (evaluation: ActiveEvaluation) => void
  },
) {
  const fetcher = useFetcher<ActiveEvaluation[]>(
    ROUTES.api.projects.detail(project.id).activeEvaluations.root,
  )
  const {
    data = [],
    mutate,
    isLoading,
  } = useSWR<ActiveEvaluation[]>(
    ['activeEvaluations', project.id],
    fetcher,
    opts,
  )

  const onMessage = useCallback(
    (args: EventArgs<'evaluationStatus'>) => {
      if (!args) return

      mutate(
        (prev) => {
          if (!prev) return prev

          if (args.event === 'evaluationEnded') {
            if (opts?.onEvaluationEnded) {
              opts.onEvaluationEnded(args.evaluation)
            }
            return prev.filter(
              (evaluation) => evaluation.uuid !== args.evaluation.uuid,
            )
          }
          if (args.event === 'evaluationFailed') {
            if (opts?.onEvaluationFailed) {
              opts.onEvaluationFailed(args.evaluation)
            }
            return prev.filter(
              (evaluation) => evaluation.uuid !== args.evaluation.uuid,
            )
          }

          // For queued/started/progress events, add or update the evaluation
          const existingIndex = prev.findIndex(
            (e) => e.uuid === args.evaluation.uuid,
          )

          if (existingIndex >= 0) {
            // Update existing evaluation
            return prev.map((evaluation) =>
              evaluation.uuid === args.evaluation.uuid
                ? { ...evaluation, ...args.evaluation }
                : evaluation,
            )
          } else {
            return [args.evaluation, ...prev]
          }
        },
        { revalidate: false },
      )
    },
    [mutate, opts],
  )
  useSockets({ event: 'evaluationStatus', onMessage })
  return { data, isLoading }
}
