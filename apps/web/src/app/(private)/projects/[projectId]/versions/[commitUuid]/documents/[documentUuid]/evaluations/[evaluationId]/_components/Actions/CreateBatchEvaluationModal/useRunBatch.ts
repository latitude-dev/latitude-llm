import { useCallback } from 'react'

import { runBatchEvaluationAction } from '$/actions/evaluations/runBatch'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import { DatasetVersion, DocumentVersion } from '@latitude-data/core/browser'

export type RunBatchParameters = Record<string, number | undefined>
export function useRunBatch({
  document,
  projectId,
  commitUuid,
  onSuccess,
}: {
  projectId: string
  document: DocumentVersion
  commitUuid: string
  onSuccess: () => void
}) {
  const {
    error,
    execute: run,
    isPending: isRunning,
  } = useLatitudeAction(runBatchEvaluationAction, { onSuccess })
  const errors = error?.fieldErrors
  const runBatch = useCallback(
    async ({
      evaluationIds,
      evaluationUuids,
      wantAllLines,
      datasetId,
      parameters,
      fromLine,
      toLine,
      datasetVersion,
    }: {
      evaluationIds?: number[]
      evaluationUuids?: string[]
      datasetId: number
      fromLine?: number
      toLine?: number
      wantAllLines: boolean
      parameters: RunBatchParameters
      datasetVersion: DatasetVersion
    }) => {
      const [result, errors] = await run({
        projectId: Number(projectId),
        documentUuid: document.documentUuid,
        commitUuid,
        evaluationIds,
        evaluationUuids,
        datasetId,
        datasetVersion,
        fromLine: wantAllLines ? undefined : fromLine,
        toLine: wantAllLines ? undefined : toLine,
        parameters,
      })
      if (errors) return
      return result
    },
    [run, projectId, document.documentUuid, commitUuid],
  )

  return {
    runBatch,
    isRunningBatch: isRunning,
    errors,
  }
}
