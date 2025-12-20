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
import { NotFoundError } from '../../../lib/errors'
import { unsafelyFindWorkspace } from '../../../data-access/workspaces'
import { CommitsRepository } from '../../../repositories/commitsRepository'
import { getHITLSpansByDocument } from '../../../data-access/issues/getHITLSpansByDocument'
import { getYesterdayCutoff } from '../../../lib/getYesterdayCutoff'
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

  const evaluationsGroupedByDocument = evaluationsWithIssues.reduce(
    (acc, evaluation) => {
      acc[evaluation.documentUuid] = [
        ...(acc[evaluation.documentUuid] || []),
        evaluation,
      ]
      return acc
    },
    {} as Record<
      string,
      EvaluationV2<EvaluationType.Llm, LlmEvaluationMetric.Binary>[]
    >,
  )

  for (const [documentUuid, evaluations] of Object.entries(
    evaluationsGroupedByDocument,
  )) {
    const workspace = await unsafelyFindWorkspace(evaluations[0].workspaceId)
    if (!workspace) throw new NotFoundError('Workspace not found')

    const commitRepository = new CommitsRepository(workspace.id)
    const commitResult = await commitRepository.getCommitById(
      evaluations[0].commitId,
    )
    if (!Result.isOk(commitResult)) throw new NotFoundError('Commit not found')
    const commit = commitResult.unwrap()

    const spansResult = await getHITLSpansByDocument({
      workspace,
      commit,
      documentUuid,
      excludeIssueId: -1, // We want to get all spans, not just the ones that are not linked to any issue
      page: 1,
      pageSize: 1,
    })

    if (!Result.isOk(spansResult)) {
      captureException(
        new Error(`Error getting spans for document in dailyAlignmentMetricUpdateJob`), // prettier-ignore
        { documentUuid, workspaceId: workspace.id, commitId: commit.id },
      )
      continue
    }

    const { spans } = spansResult.unwrap()
    if (spans.length === 0) continue

    const yesterdayCutoff = getYesterdayCutoff()
    const hasSpansFromYesterday = spans.some(
      (span) => new Date(span.createdAt) >= yesterdayCutoff,
    )

    // We only will update the alignment metric of evaluations which have new HITL annotations added yesterday (since we update the alignment metric daily)
    if (!hasSpansFromYesterday) continue

    for (const evaluation of evaluations) {
      await maintenanceQueue.add(
        'updateEvaluationAlignmentJob',
        {
          workspaceId: evaluation.workspaceId,
          commitId: evaluation.commitId,
          evaluationUuid: evaluation.uuid,
          documentUuid: evaluation.documentUuid,
          issueId: evaluation.issueId,
        },
        { attempts: 1 },
      )
    }
  }
}
