import { captureException } from '../../utils/datadogCapture'
import { isFeatureEnabledByName } from '../../services/workspaceFeatures/isFeatureEnabledByName'
import { CommitsRepository } from '../../repositories'
import {
  EvaluationResultV2CreatedEvent,
  EvaluationResultV2UpdatedEvent,
} from '../events'
import { createEvaluationResultV2InClickhouse } from '../../services/evaluationsV2/results/clickhouse/create'
import { updateEvaluationResultV2InClickhouse } from '../../services/evaluationsV2/results/clickhouse/update'
import { findEvaluationResultV2RowByUuid } from '../../queries/clickhouse/evaluationResultsV2/findByUuid'

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

  await createEvaluationResultV2InClickhouse({ result, evaluation, commit })
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

  const existingRow = await findEvaluationResultV2RowByUuid({
    workspaceId,
    uuid: result.uuid,
  })
  const commit = commitResult.value

  if (!existingRow) {
    await createEvaluationResultV2InClickhouse({ result, evaluation, commit })
    return
  }

  await updateEvaluationResultV2InClickhouse({
    existingRow,
    result,
    evaluation,
    commit,
  })
}
