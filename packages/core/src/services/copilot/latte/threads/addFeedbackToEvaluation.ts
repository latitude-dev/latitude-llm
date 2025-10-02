import { NotImplementedError } from '@latitude-data/constants/errors'
import { env } from '@latitude-data/env'
import { database } from '../../../../client'
import {
  EvaluationType,
  EvaluationV2,
  HumanEvaluationMetric,
} from '../../../../constants'
import { Result } from '../../../../lib/Result'
import {
  EvaluationResultsV2Repository,
  EvaluationsV2Repository,
  ProviderLogsRepository,
} from '../../../../repositories'
import { ProviderLogDto } from '../../../../schema/types'
import { annotateEvaluationV2 } from '../../../evaluationsV2/annotate'
import { getCopilotDocument } from '../helpers'

export async function addFeedbackToEvaluationResult(
  {
    evaluationResultUuid,
    content,
  }: {
    evaluationResultUuid: string
    content: string
  },
  db = database,
) {
  if (!env.COPILOT_LATTE_CHANGES_FEEDBACK_HITL_EVALUATION_UUID) {
    return Result.error(
      new NotImplementedError(
        'The evaluation UUID for Latte changes feedback HITL is not set in the environment variables.',
      ),
    )
  }

  const latteData = await getCopilotDocument()
  if (!latteData.ok) {
    return Result.error(latteData.error!)
  }
  const {
    workspace: latteWorkspace,
    project: latteProject,
    commit: latteCommit,
    document: latteDocument,
  } = latteData.unwrap()

  const evaluationScope = new EvaluationsV2Repository(latteWorkspace.id, db)
  const evaluationFindResult = await evaluationScope.getAtCommitByDocument({
    projectId: latteProject.id,
    commitUuid: latteCommit.uuid,
    documentUuid: latteDocument.documentUuid,
    evaluationUuid: env.COPILOT_LATTE_CHANGES_FEEDBACK_HITL_EVALUATION_UUID,
  })
  if (!evaluationFindResult.ok) {
    return Result.error(evaluationFindResult.error!)
  }
  const evaluation = evaluationFindResult.unwrap() as EvaluationV2<
    EvaluationType.Human,
    HumanEvaluationMetric.Binary
  >

  const evaluationResultsScope = new EvaluationResultsV2Repository(
    latteWorkspace.id,
    db,
  )
  const evalResultResult =
    await evaluationResultsScope.findByUuid(evaluationResultUuid)
  if (!evalResultResult.ok) {
    return Result.error(evalResultResult.error!)
  }
  const evalResult = evalResultResult.unwrap()

  const providerLogScope = new ProviderLogsRepository(latteWorkspace.id, db)
  const providerLogResult = await providerLogScope.find(
    evalResult.evaluatedLogId,
  )
  if (!providerLogResult.ok) {
    return Result.error(providerLogResult.error!)
  }
  const providerLog = providerLogResult.unwrap() as unknown as ProviderLogDto

  return annotateEvaluationV2({
    workspace: latteWorkspace,
    commit: latteCommit,
    evaluation,
    providerLog,
    resultScore: evalResult.score!,
    resultMetadata: {
      reason: content,
    },
  })
}
