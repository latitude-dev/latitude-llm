import { captureException } from '../../utils/datadogCapture'
import { isFeatureEnabledByName } from '../../services/workspaceFeatures/isFeatureEnabledByName'
import { CommitsRepository } from '../../repositories'
import {
  EvaluationResultV2CreatedEvent,
  EvaluationResultV2UpdatedEvent,
} from '../events'
import { createEvaluationResult } from '../../services/evaluationsV2/results/clickhouse/create'
import { updateEvaluationResult } from '../../services/evaluationsV2/results/clickhouse/update'
import { findEvaluationResultById } from '../../queries/clickhouse/evaluationResultsV2/findById'

/**
 * Writes evaluation result rows into ClickHouse on create events.
 */
export const writeEvaluationResultV2CreatedToClickhouse = async ({
  data: event,
}: {
  data: EvaluationResultV2CreatedEvent
}) => {
  const { workspaceId, result, evaluation, commit } = event.data
  const enabled = await isFeatureEnabledByName(
    workspaceId,
    'clickhouse-evaluation-results-write',
  )
  if (!enabled.ok || !enabled.value) return

  const createResult = await createEvaluationResult({
    result,
    evaluation,
    commit,
  })
  if (createResult.error) {
    captureException(createResult.error, {
      workspaceId,
      evaluationUuid: evaluation.uuid,
      resultUuid: result.uuid,
      commitId: result.commitId,
      action: 'create',
    })
    return
  }
}

/**
 * Writes evaluation result rows into ClickHouse on update events.
 */
export const writeEvaluationResultV2UpdatedToClickhouse = async ({
  data: event,
}: {
  data: EvaluationResultV2UpdatedEvent
}) => {
  const { workspaceId, result, evaluation } = event.data
  const enabled = await isFeatureEnabledByName(
    workspaceId,
    'clickhouse-evaluation-results-write',
  )
  if (!enabled.ok || !enabled.value) return

  const commitsRepository = new CommitsRepository(workspaceId)
  const commitResult = await commitsRepository.getCommitById(result.commitId)
  if (commitResult.error) {
    captureException(commitResult.error)
    return
  }

  let existingRow: Awaited<ReturnType<typeof findEvaluationResultById>>
  try {
    existingRow = await findEvaluationResultById({
      workspaceId,
      id: result.id,
    })
  } catch (error) {
    captureException(error as Error, {
      workspaceId,
      evaluationUuid: evaluation.uuid,
      resultUuid: result.uuid,
      action: 'find-existing-row',
    })
    return
  }
  const commit = commitResult.value

  if (!existingRow) {
    const createResult = await createEvaluationResult({
      result,
      evaluation,
      commit,
    })
    if (createResult.error) {
      captureException(createResult.error, {
        workspaceId,
        evaluationUuid: evaluation.uuid,
        resultUuid: result.uuid,
        commitId: result.commitId,
        action: 'fallback-create',
      })
    }
    return
  }

  const updateResult = await updateEvaluationResult({
    existingRow,
    result,
    evaluation,
    commit,
  })
  if (updateResult.error) {
    captureException(updateResult.error, {
      workspaceId,
      evaluationUuid: evaluation.uuid,
      resultUuid: result.uuid,
      commitId: result.commitId,
      action: 'update',
    })
    return
  }
}
