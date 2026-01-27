import { useCallback } from 'react'

export const POLLING_INTERVAL_MS = 5000

type ExperimentLike = {
  startedAt?: Date | string | null
  finishedAt?: Date | string | null
}

/**
 * Checks if any experiments in the list are currently running
 */
export function hasRunningExperiments<T extends ExperimentLike>(
  experiments: (T | undefined)[],
): boolean {
  return experiments.some((exp) => exp && exp.startedAt && !exp.finishedAt)
}

/**
 * React hook that returns a refresh interval function for SWR polling
 * Polls every POLLING_INTERVAL_MS when experiments are running, otherwise pauses
 */
export function useExperimentPolling<T extends ExperimentLike>() {
  return useCallback((latestData: T[] | undefined) => {
    if (!latestData) return 0
    return hasRunningExperiments(latestData) ? POLLING_INTERVAL_MS : 0
  }, [])
}
