import { useCallback } from 'react'

import { DocumentVersion } from '@latitude-data/core/browser'
import { runBatchEvaluationAction } from '$/actions/evaluations/runBatch'
import useLatitudeAction from '$/hooks/useLatitudeAction'

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
      wantAllLines,
      datasetId,
      parameters,
      fromLine,
      toLine,
    }: {
      datasetId: number | undefined
      fromLine: number | undefined
      toLine: number | undefined
      wantAllLines: boolean
      evaluationIds: number[]
      parameters: RunBatchParameters
    }) => {
      await run({
        projectId: Number(projectId),
        documentUuid: document.documentUuid,
        commitUuid,
        evaluationIds,
        datasetId: datasetId!,
        fromLine: wantAllLines ? undefined : fromLine,
        toLine: wantAllLines ? undefined : toLine,
        parameters,
      })
    },
    [run, projectId, document.documentUuid, commitUuid],
  )

  return {
    runBatch,
    isRunningBatch: isRunning,
    errors,
  }
}
