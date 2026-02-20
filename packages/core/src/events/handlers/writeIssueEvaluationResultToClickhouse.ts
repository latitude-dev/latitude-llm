import { captureException } from '../../utils/datadogCapture'
import { isFeatureEnabledByName } from '../../services/workspaceFeatures/isFeatureEnabledByName'
import {
  IssueEvaluationResultLinkedEvent,
  IssueEvaluationResultUnlinkedEvent,
} from '../events'
import {
  addIssueIdToEvaluationResult,
  removeIssueIdFromEvaluationResult,
} from '../../services/issueEvaluationResults/clickhouse/updateIssueIds'

export const writeIssueEvaluationResultLinkedToClickhouse = async ({
  data: event,
}: {
  data: IssueEvaluationResultLinkedEvent
}) => {
  const { workspaceId, issueId, evaluationResultId } = event.data

  const enabled = await isFeatureEnabledByName(
    workspaceId,
    'clickhouse-evaluation-results-write',
  )
  if (!enabled.ok || !enabled.value) return

  const result = await addIssueIdToEvaluationResult({
    workspaceId,
    evaluationResultId,
    issueId,
  })

  if (result.error) {
    captureException(result.error, {
      workspaceId,
      evaluationResultId,
      issueId,
      action: 'link',
    })
  }
}

export const writeIssueEvaluationResultUnlinkedToClickhouse = async ({
  data: event,
}: {
  data: IssueEvaluationResultUnlinkedEvent
}) => {
  const { workspaceId, issueId, evaluationResultId } = event.data

  const enabled = await isFeatureEnabledByName(
    workspaceId,
    'clickhouse-evaluation-results-write',
  )
  if (!enabled.ok || !enabled.value) return

  const result = await removeIssueIdFromEvaluationResult({
    workspaceId,
    evaluationResultId,
    issueId,
  })

  if (result.error) {
    captureException(result.error, {
      workspaceId,
      evaluationResultId,
      issueId,
      action: 'unlink',
    })
  }
}
