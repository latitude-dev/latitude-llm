import { ROUTES } from '$/services/routes'
import useFetcher from '$/hooks/useFetcher'
import useSWR, { SWRConfiguration } from 'swr'
import { useEvaluationsV2 } from './evaluationsV2'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  EventArgs,
  useSockets,
} from '$/components/Providers/WebsocketsProvider/useSockets'
import { ExperimentWithScores } from '@latitude-data/core/schema/models/types/Experiment'
import { EvaluationV2 } from '@latitude-data/core/constants'

import { Commit } from '@latitude-data/core/schema/models/types/Commit'
import { DocumentVersion } from '@latitude-data/core/schema/models/types/DocumentVersion'
import { Project } from '@latitude-data/core/schema/models/types/Project'
const EMPTY_ARRAY: [] = []

const POLLING_INTERVAL_MS = 5000

function hasRunningExperiments(
  experiments: (ExperimentWithScores | undefined)[],
): boolean {
  return experiments.some((exp) => exp && exp.startedAt && !exp.finishedAt)
}

export type BestLogsMetadata = {
  cost: string[]
  duration: string[]
  tokens: string[]
}

function getExperimentUuidsWithBestScore(
  evaluationUuid: string,
  experimentsWithScores: (ExperimentWithScores | undefined)[],
): string[] {
  return experimentsWithScores.reduce(
    (acc: { bestValue: number; experimentUuids: string[] }, experiment) => {
      if (!experiment) return acc

      // Not included
      if (!experiment.scores[evaluationUuid]) return acc

      const evaluationScore = experiment.scores[evaluationUuid]!
      if (evaluationScore.count === 0) return acc // Invalid score
      const value = evaluationScore.totalNormalizedScore / evaluationScore.count

      // Not best
      if (value < acc.bestValue) return acc

      // Tied with best
      if (value === acc.bestValue) {
        return {
          ...acc,
          experimentUuids: [...acc.experimentUuids, experiment.uuid],
        }
      }

      // New best
      return { bestValue: value, experimentUuids: [experiment.uuid] }
    },
    { bestValue: -Infinity, experimentUuids: [] },
  ).experimentUuids
}

function getExperimentUuidsWithBestLogsMetadata(
  experimentsWithScores: (ExperimentWithScores | undefined)[],
): BestLogsMetadata {
  const results = experimentsWithScores.reduce(
    (
      acc: {
        cost: { bestValue: number; experimentUuids: string[] }
        tokens: { bestValue: number; experimentUuids: string[] }
        duration: { bestValue: number; experimentUuids: string[] }
      },
      experiment,
    ) => {
      const logsMetadata = experiment?.logsMetadata
      if (!logsMetadata) return acc
      if (!logsMetadata.count) return acc // Invalid logsMetadata
      if (logsMetadata.count === 0) return acc // Invalid logsMetadata

      const cost = logsMetadata.totalCost / logsMetadata.count
      const tokens = logsMetadata.totalTokens / logsMetadata.count
      const duration = logsMetadata.totalDuration / logsMetadata.count

      // Evaluate cost
      if (cost < acc.cost.bestValue) {
        acc.cost = { bestValue: cost, experimentUuids: [experiment.uuid] }
      } else if (cost === acc.cost.bestValue) {
        acc.cost.experimentUuids.push(experiment.uuid)
      }

      // Evaluate tokens
      if (tokens < acc.tokens.bestValue) {
        acc.tokens = { bestValue: tokens, experimentUuids: [experiment.uuid] }
      } else if (tokens === acc.tokens.bestValue) {
        acc.tokens.experimentUuids.push(experiment.uuid)
      }

      // Evaluate duration
      if (duration < acc.duration.bestValue) {
        acc.duration = {
          bestValue: duration,
          experimentUuids: [experiment.uuid],
        }
      } else if (duration === acc.duration.bestValue) {
        acc.duration.experimentUuids.push(experiment.uuid)
      }

      return acc
    },
    {
      cost: { bestValue: Infinity, experimentUuids: [] },
      tokens: { bestValue: Infinity, experimentUuids: [] },
      duration: { bestValue: Infinity, experimentUuids: [] },
    },
  )

  return {
    cost: results.cost.experimentUuids,
    tokens: results.tokens.experimentUuids,
    duration: results.duration.experimentUuids,
  }
}

export type EvaluationWithBestExperiment = EvaluationV2 & {
  bestExperimentUuids: string[]
}

export function useExperimentComparison(
  {
    project,
    commit,
    document,
    experimentUuids,
  }: {
    project: Project
    commit: Commit
    document: DocumentVersion
    experimentUuids: string[]
  },
  opts: SWRConfiguration = {},
) {
  const dataFetcher = useFetcher<ExperimentWithScores[]>(
    experimentUuids.length
      ? ROUTES.api.projects
          .detail(project.id)
          .documents.detail(document.documentUuid)
          .experiments.comparison(experimentUuids)
      : undefined,
  )

  const refreshIntervalFn = useCallback(
    (latestData: ExperimentWithScores[] | undefined) => {
      if (!latestData) return 0
      return hasRunningExperiments(latestData) ? POLLING_INTERVAL_MS : 0
    },
    [],
  )

  const { data = undefined, isLoading } = useSWR<ExperimentWithScores[]>(
    [
      'experimentsComparison',
      project.id,
      commit.uuid,
      document.documentUuid,
      experimentUuids.join(','),
    ],
    dataFetcher,
    {
      ...opts,
      refreshInterval: refreshIntervalFn,
    },
  )

  const { data: evaluations, isLoading: isLoadingEvaluations } =
    useEvaluationsV2({
      project,
      commit,
      document,
    })

  const [experimentsWithScores, setExperimentsWithScores] =
    useState<(ExperimentWithScores | undefined)[]>(EMPTY_ARRAY)

  useEffect(() => {
    // keep the experiments that were pre-loaded in a previous fetch, and only set as undefined those new that are now loading
    if (!data) {
      setExperimentsWithScores((prev) =>
        experimentUuids.map((experimentUuid) =>
          prev.find((experiment) => experiment?.uuid === experimentUuid),
        ),
      )
      return
    }

    setExperimentsWithScores(
      experimentUuids.map((experimentUuid) =>
        data.find((experiment) => experiment.uuid === experimentUuid),
      ),
    )
  }, [data, experimentUuids])

  const evaluationsWithBestExperiments = useMemo<
    EvaluationWithBestExperiment[] | undefined
  >(() => {
    if (!evaluations) return undefined
    // Get a list of all evaluation uuids from the current experiments
    const evaluationUuids = experimentsWithScores
      .filter(Boolean)
      .map((experiment) => experiment!.evaluationUuids)
      .flat()
      .filter(
        (evaluationUuid, index, self) => self.indexOf(evaluationUuid) === index,
      )

    // Return a list of all selected evaluations, and recalculate which experiments have the best score
    return evaluationUuids
      .map((evaluationUuid) => {
        const evaluation = evaluations.find(
          (evaluation) => evaluation.uuid === evaluationUuid,
        )

        if (!evaluation) return undefined

        const bestExperimentUuids = getExperimentUuidsWithBestScore(
          evaluationUuid,
          experimentsWithScores,
        )

        return {
          ...evaluation,
          bestExperimentUuids,
        }
      })
      .filter((e) => e !== undefined)
  }, [evaluations, experimentsWithScores])

  useSockets({
    event: 'experimentStatus',
    onMessage: (message: EventArgs<'experimentStatus'>) => {
      if (!message) return
      const { experiment: updatedExperiment } = message

      const index = experimentUuids.findIndex(
        (uuid) => uuid === updatedExperiment.uuid,
      )
      if (index === -1) return

      // Experiment is selected but not loaded, so we can create it
      setExperimentsWithScores((prev) => {
        const prevExperiment = prev[index]
        prev[index] = {
          // If the experiment is not loaded, we create it with empty scores and logsMetadata
          scores: {},
          logsMetadata: {
            count: 0,
            totalCost: 0,
            totalTokens: 0,
            totalDuration: 0,
          },
          ...prevExperiment, // If it did exist, we keep the previous scores
          ...updatedExperiment, // Update any values from the experiments
        }

        return [...prev]
      })
    },
  })

  useSockets({
    event: 'evaluationResultV2Created',
    onMessage: (message: EventArgs<'evaluationResultV2Created'>) => {
      if (!message) return
      message.result.experimentId
      const { result } = message

      if (
        !experimentsWithScores.some(
          (experiment) => experiment?.id === result.experimentId,
        )
      ) {
        return
      }

      setExperimentsWithScores((prev) => {
        if (!prev) return prev

        // Find the experiment that was updated
        const prevExperimentIdx = prev.findIndex(
          (exp) => exp?.id === result.experimentId,
        )

        if (prevExperimentIdx === -1) return prev

        const prevExperiment = prev[prevExperimentIdx]!
        const prevScore = prevExperiment.scores[result.evaluationUuid] ?? {
          count: 0,
          totalNormalizedScore: 0,
          totalScore: 0,
        }

        prev[prevExperimentIdx] = {
          // Update any values from the experiments
          ...prevExperiment,
          scores: {
            ...prevExperiment.scores,
            [result.evaluationUuid]: {
              count: prevScore.count + 1,
              totalNormalizedScore:
                prevScore.totalNormalizedScore + (result.normalizedScore ?? 0),
              totalScore: prevScore.totalScore + (result.score ?? 0),
            },
          },
        }

        return prev
      })
    },
  })

  const [bestLogsMetadata, setBestLogsMetadata] = useState<BestLogsMetadata>({
    cost: [],
    duration: [],
    tokens: [],
  })

  useEffect(() => {
    if (!experimentsWithScores) return
    setBestLogsMetadata(
      getExperimentUuidsWithBestLogsMetadata(experimentsWithScores),
    )
  }, [experimentsWithScores])

  useSockets({
    event: 'documentLogCreated',
    onMessage: (message: EventArgs<'documentLogCreated'>) => {
      const { documentLogWithMetadata } = message
      if (!documentLogWithMetadata) return

      let alreadyRegistered = false
      setExperimentsWithScores((prev) => {
        // Prevent StrictMode double rendering
        if (alreadyRegistered) return prev
        alreadyRegistered = true

        if (!prev) return prev

        // Find the experiment that was updated
        const prevExperimentIdx = prev.findIndex(
          (exp) => exp?.id === documentLogWithMetadata.experimentId,
        )

        if (prevExperimentIdx === -1) return prev

        const prevExperiment = prev[prevExperimentIdx]!
        const prevLogsMetadata = prevExperiment.logsMetadata ?? {
          count: 0,
          totalCost: 0,
          totalTokens: 0,
          totalDuration: 0,
        }

        prev[prevExperimentIdx] = {
          // Update any values from the experiments
          ...prevExperiment,
          logsMetadata: {
            ...prevExperiment.logsMetadata,
            count: prevLogsMetadata.count + 1,
            totalCost:
              prevLogsMetadata.totalCost +
              (documentLogWithMetadata.costInMillicents ?? 0),
            totalTokens:
              prevLogsMetadata.totalTokens +
              (documentLogWithMetadata.tokens ?? 0),
            totalDuration:
              prevLogsMetadata.totalDuration +
              (documentLogWithMetadata.duration ?? 0),
          },
        }

        return prev
      })
    },
  })

  return {
    experiments: experimentsWithScores,
    evaluations: evaluationsWithBestExperiments,
    bestLogsMetadata,
    isLoading: isLoading || isLoadingEvaluations,
  }
}
