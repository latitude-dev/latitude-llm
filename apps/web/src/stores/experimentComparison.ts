import { ROUTES } from '$/services/routes'
import useFetcher from '$/hooks/useFetcher'
import useSWR, { SWRConfiguration } from 'swr'
import { useEvaluationsV2 } from './evaluationsV2'
import { useEffect, useMemo, useState } from 'react'
import {
  EventArgs,
  useSockets,
} from '$/components/Providers/WebsocketsProvider/useSockets'
import { ExperimentWithScores } from '@latitude-data/core/schema/models/types/Experiment'
import { EvaluationV2 } from '@latitude-data/core/constants'
import { useExperimentPolling } from '$/helpers/experimentPolling'

import { Commit } from '@latitude-data/core/schema/models/types/Commit'
import { DocumentVersion } from '@latitude-data/core/schema/models/types/DocumentVersion'
import { Project } from '@latitude-data/core/schema/models/types/Project'
const EMPTY_ARRAY: [] = []

export type BestRunMetadata = {
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

function getExperimentUuidsWithBestRunMetadata(
  experimentsWithScores: (ExperimentWithScores | undefined)[],
): BestRunMetadata {
  const results = experimentsWithScores.reduce(
    (
      acc: {
        cost: { bestValue: number; experimentUuids: string[] }
        tokens: { bestValue: number; experimentUuids: string[] }
        duration: { bestValue: number; experimentUuids: string[] }
      },
      experiment,
    ) => {
      const runMetadata = experiment?.runMetadata
      if (!runMetadata) return acc
      if (!runMetadata.count) return acc
      if (runMetadata.count === 0) return acc

      const cost = runMetadata.totalCost / runMetadata.count
      const tokens = runMetadata.totalTokens / runMetadata.count
      const duration = runMetadata.totalDuration / runMetadata.count

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

  const refreshIntervalFn = useExperimentPolling<ExperimentWithScores>()

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
          scores: {},
          runMetadata: {
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

  const [bestRunMetadata, setBestRunMetadata] = useState<BestRunMetadata>({
    cost: [],
    duration: [],
    tokens: [],
  })

  useEffect(() => {
    if (!experimentsWithScores) return
    setBestRunMetadata(
      getExperimentUuidsWithBestRunMetadata(experimentsWithScores),
    )
  }, [experimentsWithScores])

  useSockets({
    event: 'documentRunStatus',
    onMessage: (message: EventArgs<'documentRunStatus'>) => {
      if (!message) return
      if (message.event !== 'documentRunEnded') return

      const { metrics, experimentId } = message
      if (!metrics || !experimentId) return

      let alreadyRegistered = false
      setExperimentsWithScores((prev) => {
        if (alreadyRegistered) return prev
        alreadyRegistered = true

        if (!prev) return prev

        const prevExperimentIdx = prev.findIndex(
          (exp) => exp?.id === experimentId,
        )

        if (prevExperimentIdx === -1) return prev

        const prevExperiment = prev[prevExperimentIdx]!
        const prevRunMetadata = prevExperiment.runMetadata ?? {
          count: 0,
          totalCost: 0,
          totalTokens: 0,
          totalDuration: 0,
        }

        prev[prevExperimentIdx] = {
          ...prevExperiment,
          runMetadata: {
            ...prevExperiment.runMetadata,
            count: prevRunMetadata.count + 1,
            totalCost: prevRunMetadata.totalCost + metrics.runCost,
            totalTokens:
              prevRunMetadata.totalTokens + metrics.runUsage.totalTokens,
            totalDuration: prevRunMetadata.totalDuration + metrics.duration,
          },
        }

        return prev
      })
    },
  })

  return {
    experiments: experimentsWithScores,
    evaluations: evaluationsWithBestExperiments,
    bestRunMetadata,
    isLoading: isLoading || isLoadingEvaluations,
  }
}
