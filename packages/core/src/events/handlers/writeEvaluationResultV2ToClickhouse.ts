import { captureException } from '../../utils/datadogCapture'
import { isFeatureEnabledByName } from '../../services/workspaceFeatures/isFeatureEnabledByName'
import { CommitsRepository } from '../../repositories'
import {
  EvaluationResultV2CreatedEvent,
  EvaluationResultV2UpdatedEvent,
} from '../events'
import { insertEvaluationResultV2Row } from '../../services/evaluationsV2/results/clickhouse/insert'

/**
 * Inserts evaluation result rows into ClickHouse on create events.
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

  await insertEvaluationResultV2Row({ result, evaluation, commit })
}

/**
 * Inserts evaluation result rows into ClickHouse on update events.
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

  await insertEvaluationResultV2Row({
    result,
    evaluation,
    commit: commitResult.value,
  })
}
