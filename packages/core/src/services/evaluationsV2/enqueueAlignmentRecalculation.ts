import {
  AlignmentMetricMetadata,
  EvaluationMetric,
  EvaluationType,
  EvaluationV2,
  LlmEvaluationMetric,
} from '../../constants'
import { publisher } from '../../events/publisher'
import { queues } from '../../jobs/queues'
import { evaluationVersions } from '../../schema/models/evaluationVersions'
import { type Commit } from '../../schema/models/types/Commit'
import { database, Database } from '../../client'
import { and, eq } from 'drizzle-orm'
import { generateConfigurationHash } from './generateConfigurationHash'

type EnqueueAlignmentRecalculationParams = {
  oldEvaluation: EvaluationV2<EvaluationType.Llm, LlmEvaluationMetric.Binary>
  newEvaluation: EvaluationV2<EvaluationType.Llm, LlmEvaluationMetric.Binary>
  commit: Commit
}

type EnqueueAlignmentRecalculationResult = {
  enqueued: boolean
  alignmentMetricMetadata?: AlignmentMetricMetadata
}

/**
 * Checks if the evaluation configuration has changed and enqueues a recalculation job if needed.
 * This is called after updating an evaluation to trigger alignment metric recalculation
 * when the criteria or other configuration that affects the alignment has changed.
 */
export async function enqueueAlignmentRecalculation(
  { oldEvaluation, newEvaluation, commit }: EnqueueAlignmentRecalculationParams,
  db: Database = database,
): Promise<EnqueueAlignmentRecalculationResult> {
  const effectiveIssueId = newEvaluation.issueId ?? oldEvaluation.issueId
  if (!effectiveIssueId) {
    return { enqueued: false }
  }

  const oldHash = generateConfigurationHash(oldEvaluation)
  const newHash = generateConfigurationHash(newEvaluation)

  if (oldHash === newHash) {
    return { enqueued: false }
  }

  const updatedAlignmentMetricMetadata: AlignmentMetricMetadata = {
    alignmentHash: newEvaluation.alignmentMetricMetadata?.alignmentHash ?? '',
    confusionMatrix: newEvaluation.alignmentMetricMetadata?.confusionMatrix ?? {
      truePositives: 0,
      trueNegatives: 0,
      falsePositives: 0,
      falseNegatives: 0,
    },
    lastProcessedPositiveSpanDate:
      newEvaluation.alignmentMetricMetadata?.lastProcessedPositiveSpanDate,
    lastProcessedNegativeSpanDate:
      newEvaluation.alignmentMetricMetadata?.lastProcessedNegativeSpanDate,
    recalculatingAt: new Date().toISOString(),
  }

  publisher.publishLater({
    type: 'evaluationV2AlignmentUpdated',
    data: {
      workspaceId: newEvaluation.workspaceId,
      evaluationUuid: newEvaluation.uuid,
      alignmentMetricMetadata: updatedAlignmentMetricMetadata,
    },
  })

  await db
    .update(evaluationVersions)
    .set({
      alignmentMetricMetadata: updatedAlignmentMetricMetadata,
    })
    .where(
      and(
        eq(evaluationVersions.commitId, commit.id),
        eq(evaluationVersions.evaluationUuid, newEvaluation.uuid),
      ),
    )

  const { maintenanceQueue } = await queues()
  await maintenanceQueue.add(
    'updateEvaluationAlignmentJob',
    {
      workspaceId: newEvaluation.workspaceId,
      commitId: commit.id,
      evaluationUuid: newEvaluation.uuid,
      documentUuid: newEvaluation.documentUuid,
      issueId: effectiveIssueId,
      source: 'configChange' as const,
    },
    { attempts: 1 },
  )

  return {
    enqueued: true,
    alignmentMetricMetadata: updatedAlignmentMetricMetadata,
  }
}

/**
 * Wrapper function that handles the type checking for evaluations.
 * Only enqueues recalculation for LLM Binary evaluations.
 */
export async function maybeEnqueueAlignmentRecalculation<
  T extends EvaluationType,
  M extends EvaluationMetric<T>,
>({
  oldEvaluation,
  newEvaluation,
  commit,
}: {
  oldEvaluation: EvaluationV2<T, M>
  newEvaluation: EvaluationV2<T, M>
  commit: Commit
}): Promise<EnqueueAlignmentRecalculationResult> {
  if (
    newEvaluation.type !== EvaluationType.Llm ||
    newEvaluation.metric !== LlmEvaluationMetric.Binary
  ) {
    return { enqueued: false }
  }

  const typedOldEvaluation = oldEvaluation as unknown as EvaluationV2<
    EvaluationType.Llm,
    LlmEvaluationMetric.Binary
  >
  const typedNewEvaluation = newEvaluation as unknown as EvaluationV2<
    EvaluationType.Llm,
    LlmEvaluationMetric.Binary
  >

  return enqueueAlignmentRecalculation({
    oldEvaluation: typedOldEvaluation,
    newEvaluation: typedNewEvaluation,
    commit,
  })
}
