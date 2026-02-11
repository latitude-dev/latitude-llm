import { Job } from 'bullmq'
import { queues } from '../../queues'
import { database } from '../../../client'
import { and, eq, getTableColumns, isNotNull, isNull, sql } from 'drizzle-orm'
import { evaluationVersions } from '../../../schema/models/evaluationVersions'
import {
  EvaluationType,
  EvaluationV2,
  LlmEvaluationMetric,
} from '../../../constants'
import { Result } from '../../../lib/Result'
import { unsafelyFindWorkspace } from '../../../data-access/workspaces'
import { CommitsRepository, IssuesRepository } from '../../../repositories'
import { findProjectById } from '../../../queries/projects/findById'
import { hasUnprocessedSpans } from '../../../data-access/issues/hasUnprocessedSpans'
import { captureException } from '../../../utils/datadogCapture'

export type DailyAlignmentMetricUpdateJobData = Record<string, never>

const tt = {
  ...getTableColumns(evaluationVersions),
  uuid: sql<string>`${evaluationVersions.evaluationUuid}`.as('uuid'),
  versionId: sql<number>`${evaluationVersions.id}::integer`.as('versionId'),
}

export async function dailyAlignmentMetricUpdateJob(
  _: Job<DailyAlignmentMetricUpdateJobData>,
) {
  const { maintenanceQueue } = await queues()

  const evaluationsWithIssues = (await database
    .select(tt)
    .from(evaluationVersions)
    .where(
      and(
        isNull(evaluationVersions.deletedAt),
        isNotNull(evaluationVersions.issueId),
        eq(evaluationVersions.type, EvaluationType.Llm),
        eq(evaluationVersions.metric, LlmEvaluationMetric.Binary),
      ),
    )
    .then((r) => r)) as EvaluationV2<
    EvaluationType.Llm,
    LlmEvaluationMetric.Binary
  >[]

  for (const evaluation of evaluationsWithIssues) {
    try {
      const workspace = await unsafelyFindWorkspace(evaluation.workspaceId)
      if (!workspace) continue

      const commitRepository = new CommitsRepository(workspace.id)
      const commitResult = await commitRepository.getCommitById(
        evaluation.commitId,
      )
      if (!Result.isOk(commitResult)) continue
      const commit = commitResult.unwrap()

      const project = await findProjectById({
        workspaceId: workspace.id,
        id: commit.projectId,
      })
      if (!project) continue

      const issueRepository = new IssuesRepository(workspace.id)
      const issue = await issueRepository.findById({
        project,
        issueId: evaluation.issueId!,
      })
      if (!issue) continue

      const hasNewSpansResult = await hasUnprocessedSpans({
        workspace,
        commit,
        issue,
        positiveSpanCutoffDate:
          evaluation.alignmentMetricMetadata?.lastProcessedPositiveSpanDate,
        negativeSpanCutoffDate:
          evaluation.alignmentMetricMetadata?.lastProcessedNegativeSpanDate,
      })

      if (!Result.isOk(hasNewSpansResult) || !hasNewSpansResult.unwrap()) {
        continue
      }

      await maintenanceQueue.add(
        'updateEvaluationAlignmentJob',
        {
          workspaceId: evaluation.workspaceId,
          commitId: evaluation.commitId,
          evaluationUuid: evaluation.uuid,
          documentUuid: evaluation.documentUuid,
          issueId: evaluation.issueId,
          source: 'daily' as const,
        },
        { attempts: 1 },
      )
    } catch (error) {
      captureException(error as Error, {
        evaluationUuid: evaluation.uuid,
        workspaceId: evaluation.workspaceId,
      })
    }
  }
}
