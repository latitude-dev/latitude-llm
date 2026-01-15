import { SerializedSpanPair } from '@latitude-data/constants/tracing'
import { Job } from 'bullmq'
import {
  EvaluationType,
  EvaluationV2,
  LlmEvaluationMetric,
} from '../../../constants'
import { unsafelyFindWorkspace } from '../../../data-access/workspaces'
import { publisher } from '../../../events/publisher'
import { NotFoundError } from '../../../lib/errors'
import { Result } from '../../../lib/Result'
import {
  CommitsRepository,
  EvaluationsV2Repository,
} from '../../../repositories'
import { generateConfigurationHash } from '../../../services/evaluationsV2/generateConfigurationHash'
import { evaluateConfiguration } from '../../../services/evaluationsV2/generateFromIssue/evaluateConfiguration'
import { updateEvaluationV2 } from '../../../services/evaluationsV2/update'
import { captureException } from '../../../utils/datadogCapture'

export type RecalculateAlignmentMetricJobData = {
  workspaceId: number
  commitId: number
  evaluationUuid: string
  documentUuid: string
  spanAndTraceIdPairsOfExamplesThatShouldPassTheEvaluation: SerializedSpanPair[]
  spanAndTraceIdPairsOfExamplesThatShouldFailTheEvaluation: SerializedSpanPair[]
  hasEvaluationConfigurationChanged: boolean
}

/*
  This job is a parent job of a BullMQ flow which recalculates the alignment metric of an evaluation when all its runEvaluationV2Job children have finished.
  
  The alignment metric used at the moment is the MCC (Matthews Correlation Coefficient)
*/
export const recalculateAlignmentMetricJob = async (
  job: Job<RecalculateAlignmentMetricJobData>,
) => {
  const {
    workspaceId,
    commitId,
    evaluationUuid,
    documentUuid,
    spanAndTraceIdPairsOfExamplesThatShouldPassTheEvaluation,
    spanAndTraceIdPairsOfExamplesThatShouldFailTheEvaluation,
    hasEvaluationConfigurationChanged,
  } = job.data

  const workspace = await unsafelyFindWorkspace(workspaceId)
  if (!workspace) throw new NotFoundError('Workspace not found')

  const commitRepository = new CommitsRepository(workspace.id)
  const commitResult = await commitRepository.find(commitId)
  if (!Result.isOk(commitResult)) {
    throw new Error(`Commit not found`)
  }
  const commit = commitResult.unwrap()

  const evaluationRepository = new EvaluationsV2Repository(workspace.id)
  const evaluation = (await evaluationRepository
    .getAtCommitByDocument({
      projectId: commit.projectId,
      commitUuid: commit.uuid,
      documentUuid,
      evaluationUuid,
    })
    .then((r) => r.unwrap())) as EvaluationV2<
    EvaluationType.Llm,
    LlmEvaluationMetric.Binary
  >

  try {
    const { failed, ignored, processed, unprocessed } =
      await job.getDependenciesCount()

    // When a runEvalJob fails, it will automatically run the parent and not wait for the other children to finish (the rest will be unprocessed)
    //  so in this scenario, we throw an error and retry the job after the exponential delay
    const tooManyFailedEvaluationRuns =
      (failed ?? 0) + (ignored ?? 0) + (unprocessed ?? 0) >
      (processed ?? 0) % 10

    if (tooManyFailedEvaluationRuns) {
      throw new Error(
        `${failed ?? 0} failed and ${ignored ?? 0} ignored children. Waiting for ${unprocessed ?? 0} unprocessed children to complete`,
      )
    }

    const childrenValues = await job.getChildrenValues()

    let alreadyCalculatedAlignmentMetricMetadata = undefined
    if (!hasEvaluationConfigurationChanged) {
      alreadyCalculatedAlignmentMetricMetadata = evaluation.alignmentMetricMetadata ?? undefined // prettier-ignore
    }

    const { confusionMatrix, latestPositiveSpanDate, latestNegativeSpanDate } =
      await evaluateConfiguration({
        childrenValues,
        spanAndTraceIdPairsOfExamplesThatShouldPassTheEvaluation,
        spanAndTraceIdPairsOfExamplesThatShouldFailTheEvaluation,
        alreadyCalculatedAlignmentMetricMetadata,
      }).then((r) => r.unwrap())

    const alignmentHash = generateConfigurationHash(evaluation)

    // Update cutoffs: use new dates from rebalanced results, otherwise keep existing
    const newPositiveCutoff =
      latestPositiveSpanDate ??
      evaluation.alignmentMetricMetadata?.lastProcessedPositiveSpanDate
    const newNegativeCutoff =
      latestNegativeSpanDate ??
      evaluation.alignmentMetricMetadata?.lastProcessedNegativeSpanDate

    const updatedAlignmentMetricMetadata = {
      confusionMatrix,
      alignmentHash,
      lastProcessedPositiveSpanDate: newPositiveCutoff,
      lastProcessedNegativeSpanDate: newNegativeCutoff,
      recalculatingAt: undefined,
    }

    await updateEvaluationV2({
      evaluation,
      workspace,
      commit: commit,
      alignmentMetricMetadata: updatedAlignmentMetricMetadata,
      force: true,
    }).then((r) => r.unwrap())

    publisher.publishLater({
      type: 'evaluationV2AlignmentUpdated',
      data: {
        workspaceId,
        evaluationUuid,
        alignmentMetricMetadata: updatedAlignmentMetricMetadata,
      },
    })
  } catch (error) {
    const { attemptsMade, opts } = job
    const maxAttempts = opts.attempts ?? 1
    // Job attemptsMade starts at 0
    const isLastAttempt = attemptsMade + 1 >= maxAttempts

    // Only failing in last attempt of the job, there are more attempts to retry to calculate the alignment metric if not
    if (isLastAttempt) {
      captureException(error as Error)

      const failedAlignmentMetricMetadata = {
        alignmentHash: evaluation.alignmentMetricMetadata?.alignmentHash ?? '',
        confusionMatrix: evaluation.alignmentMetricMetadata
          ?.confusionMatrix ?? {
          truePositives: 0,
          trueNegatives: 0,
          falsePositives: 0,
          falseNegatives: 0,
        },
        lastProcessedNegativeSpanDate:
          evaluation.alignmentMetricMetadata?.lastProcessedNegativeSpanDate ??
          undefined,
        lastProcessedPositiveSpanDate:
          evaluation.alignmentMetricMetadata?.lastProcessedPositiveSpanDate ??
          undefined,
        recalculatingAt: undefined,
      }

      await updateEvaluationV2({
        evaluation,
        workspace,
        commit: commit,
        alignmentMetricMetadata: failedAlignmentMetricMetadata,
        force: true,
      }).catch(() => {})

      publisher.publishLater({
        type: 'evaluationV2AlignmentUpdated',
        data: {
          workspaceId,
          evaluationUuid,
          alignmentMetricMetadata: failedAlignmentMetricMetadata,
        },
      })
    }

    // Throwing the error here will propagate the error to BullMQ, which will retry the job
    throw error
  }
}
