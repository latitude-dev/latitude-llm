import { defineQuery, defineSignal, setHandler } from '@temporalio/workflow'
import type { SimulationSettings } from '@latitude-data/constants/simulation'

import { fetchExperimentDataActivity } from '../activities/experiment/fetchData/proxy'
import { sendProgressUpdateActivity } from '../activities/experiment/sendProgress/proxy'
import { runDocumentActivity } from '../activities/document/run/proxy'
import { simulateTurnActivity } from '../activities/simulation/simulateTurn/proxy'
import { waitForSpanActivity } from '../activities/spans/waitForSpan/proxy'
import { runEvaluationActivity } from '../activities/evaluation/run/proxy'
import { completeExperimentActivity } from '../activities/experiment/complete/proxy'

export type ExperimentProgress = {
  total: number
  completed: number
  passed: number
  failed: number
  errors: number
  totalScore: number
  rowResults: RowResult[]
}

export type RowResult = {
  runUuid: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  documentRunSuccess?: boolean
  evaluationResults: EvaluationResultSummary[]
}

export type EvaluationResultSummary = {
  evaluationUuid: string
  success: boolean
  hasPassed?: boolean
  score?: number
  error?: string
}

export type ExperimentWorkflowParams = {
  workspaceId: number
  experimentUuid: string
}

export type ExperimentWorkflowResult = {
  success: boolean
  progress: ExperimentProgress
}

export const cancelSignal = defineSignal('cancel')
export const progressQuery = defineQuery<ExperimentProgress>('progress')

/**
 * Orchestrates the execution of an experiment across multiple dataset rows.
 *
 * 1. Fetches experiment configuration (document, commit, dataset rows, evaluations)
 * 2. For each row in parallel:
 *    a. Runs the document with row parameters
 *    b. If multi-turn simulation is enabled, simulates conversation turns
 *    c. Waits for the span to be available in the tracing system
 *    d. Runs all configured evaluations against the result
 * 3. Sends progress updates via websocket after each row completes
 * 4. Marks the experiment as complete when all rows are processed
 *
 * ## Activities Triggered
 *
 * - `fetchExperimentData` - Loads experiment config from database
 * - `runDocumentActivity` - Executes the prompt/document (runs queue)
 * - `simulateTurnActivity` - Simulates user responses for multi-turn (runs queue)
 * - `waitForSpanActivity` - Polls for span availability (runs queue)
 * - `runEvaluationActivity` - Runs each evaluation (evaluations queue)
 * - `sendProgressUpdateActivity` - Broadcasts progress via websocket
 * - `completeExperimentActivity` - Marks experiment as finished
 *
 * ## Signals & Queries
 *
 * - `cancelSignal` - Stops processing new rows (in-flight activities complete)
 * - `progressQuery` - Returns current progress state
 */
export async function experimentWorkflow(
  params: ExperimentWorkflowParams,
): Promise<ExperimentWorkflowResult> {
  let cancelled = false
  const progress: ExperimentProgress = {
    total: 0,
    completed: 0,
    passed: 0,
    failed: 0,
    errors: 0,
    totalScore: 0,
    rowResults: [],
  }

  setHandler(cancelSignal, () => {
    cancelled = true
  })

  setHandler(progressQuery, () => progress)

  const experimentData = await fetchExperimentDataActivity({
    workspaceId: params.workspaceId,
    experimentUuid: params.experimentUuid,
  })

  const { experiment, project, commit, document, rows, evaluationUuids } =
    experimentData
  const evaluationsPerRow = evaluationUuids.length

  progress.total = rows.length
  progress.rowResults = rows.map((row) => ({
    runUuid: row.uuid,
    status: 'pending' as const,
    evaluationResults: [],
  }))

  await sendProgressUpdateActivity({
    workspaceId: params.workspaceId,
    experimentUuid: params.experimentUuid,
    progress: {
      total: progress.total,
      completed: progress.completed,
      passed: progress.passed,
      failed: progress.failed,
      errors: progress.errors,
      totalScore: progress.totalScore,
    },
  })

  const rowPromises = rows.map(async (row, index) => {
    if (cancelled) return

    const rowResult = progress.rowResults[index]!
    rowResult.status = 'running'

    try {
      const documentResult = await runDocumentActivity({
        workspaceId: params.workspaceId,
        projectId: project.id,
        commitUuid: commit.uuid,
        documentUuid: document.documentUuid,
        experimentId: experiment.id,
        runUuid: row.uuid,
        parameters: row.parameters,
        customPrompt: experiment.metadata?.prompt,
        simulationSettings: experiment.metadata?.simulationSettings,
      })

      if (!documentResult.success || !documentResult.conversationUuid) {
        rowResult.status = 'failed'
        rowResult.documentRunSuccess = false
        progress.errors += 1 + evaluationsPerRow
        progress.completed++

        await sendProgressUpdateActivity({
          workspaceId: params.workspaceId,
          experimentUuid: params.experimentUuid,
          progress: {
            total: progress.total,
            completed: progress.completed,
            passed: progress.passed,
            failed: progress.failed,
            errors: progress.errors,
            totalScore: progress.totalScore,
          },
        })
        return
      }

      rowResult.documentRunSuccess = true
      let messages = documentResult.messages || []

      const simulationSettings = experiment.metadata?.simulationSettings as
        | SimulationSettings
        | undefined
      if (simulationSettings?.maxTurns && simulationSettings.maxTurns > 1) {
        let currentTurn = 2
        const maxTurns = Math.min(simulationSettings.maxTurns, 10)

        while (currentTurn <= maxTurns && !cancelled) {
          const turnResult = await simulateTurnActivity({
            workspaceId: params.workspaceId,
            documentLogUuid: documentResult.conversationUuid,
            messages,
            currentTurn,
            maxTurns,
          })

          if (turnResult.action === 'end') break

          messages = turnResult.messages
          currentTurn++
        }
      }

      const spanResult = await waitForSpanActivity({
        workspaceId: params.workspaceId,
        conversationUuid: documentResult.conversationUuid,
        maxAttempts: 30,
        delayMs: 500,
      })

      if (!spanResult.found) {
        rowResult.status = 'failed'
        progress.errors += evaluationsPerRow
        progress.completed++

        await sendProgressUpdateActivity({
          workspaceId: params.workspaceId,
          experimentUuid: params.experimentUuid,
          progress: {
            total: progress.total,
            completed: progress.completed,
            passed: progress.passed,
            failed: progress.failed,
            errors: progress.errors,
            totalScore: progress.totalScore,
          },
        })
        return
      }

      const parametersSource = experiment.metadata?.parametersSource as
        | { source: string; datasetLabels?: Record<string, string> }
        | undefined
      const datasetLabels =
        parametersSource?.source === 'dataset'
          ? parametersSource.datasetLabels || {}
          : {}

      const evaluationPromises = evaluationUuids.map(async (evaluationUuid) => {
        if (cancelled) return

        const evalResult = await runEvaluationActivity({
          workspaceId: params.workspaceId,
          commitId: commit.id,
          evaluationUuid,
          conversationUuid: documentResult.conversationUuid!,
          experimentUuid: params.experimentUuid,
          datasetId: experiment.datasetId ?? undefined,
          datasetLabel: datasetLabels[evaluationUuid],
          datasetRowId: row.datasetRowId,
        })

        rowResult.evaluationResults.push({
          evaluationUuid,
          success: evalResult.success,
          hasPassed: evalResult.hasPassed,
          score: evalResult.score,
          error: evalResult.error,
        })

        if (evalResult.success) {
          if (evalResult.hasPassed) {
            progress.passed++
          } else {
            progress.failed++
          }
          if (evalResult.score !== undefined) {
            progress.totalScore += evalResult.score
          }
        } else {
          progress.errors++
        }
      })

      await Promise.allSettled(evaluationPromises)

      rowResult.status = 'completed'
      progress.completed++

      await sendProgressUpdateActivity({
        workspaceId: params.workspaceId,
        experimentUuid: params.experimentUuid,
        progress: {
          total: progress.total,
          completed: progress.completed,
          passed: progress.passed,
          failed: progress.failed,
          errors: progress.errors,
          totalScore: progress.totalScore,
        },
      })
    } catch (_error) {
      rowResult.status = 'failed'
      progress.errors += 1 + evaluationsPerRow
      progress.completed++

      await sendProgressUpdateActivity({
        workspaceId: params.workspaceId,
        experimentUuid: params.experimentUuid,
        progress: {
          total: progress.total,
          completed: progress.completed,
          passed: progress.passed,
          failed: progress.failed,
          errors: progress.errors,
          totalScore: progress.totalScore,
        },
      })
    }
  })

  await Promise.allSettled(rowPromises)

  await completeExperimentActivity({
    workspaceId: params.workspaceId,
    experimentId: experiment.id,
  })

  await sendProgressUpdateActivity({
    workspaceId: params.workspaceId,
    experimentUuid: params.experimentUuid,
    progress: {
      total: progress.total,
      completed: progress.completed,
      passed: progress.passed,
      failed: progress.failed,
      errors: progress.errors,
      totalScore: progress.totalScore,
    },
  })

  return {
    success: !cancelled && progress.errors === 0,
    progress,
  }
}
