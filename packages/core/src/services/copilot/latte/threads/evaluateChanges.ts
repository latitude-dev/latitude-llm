import { NotImplementedError } from '@latitude-data/constants/errors'
import { env } from '@latitude-data/env'
import { ProviderLogDto } from '../../../../browser'
import { database } from '../../../../client'
import { Result } from '../../../../lib/Result'
import {
  EvaluationsV2Repository,
  ProviderLogsRepository,
} from '../../../../repositories'
import { annotateEvaluationV2 } from '../../../evaluationsV2/annotate'
import { getCopilotDocument } from '../helpers'

export async function evaluateLatteThreadChanges(
  {
    threadUuid,
    accepted,
  }: {
    threadUuid: string
    accepted: boolean
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

  const providerLogScope = new ProviderLogsRepository(latteWorkspace.id, db)
  const providerLogResult =
    await providerLogScope.findLastByDocumentLogUuid(threadUuid)
  if (!providerLogResult.ok) {
    return Result.error(providerLogResult.error!)
  }
  const providerLog = providerLogResult.unwrap()

  const evaluationScope = new EvaluationsV2Repository(latteWorkspace.id, db)
  const evaluationResult = await evaluationScope.getAtCommitByDocument({
    projectId: latteProject.id,
    commitUuid: latteCommit.uuid,
    documentUuid: latteDocument.documentUuid,
    evaluationUuid: env.COPILOT_LATTE_CHANGES_FEEDBACK_HITL_EVALUATION_UUID,
  })
  if (!evaluationResult.ok) {
    return Result.error(evaluationResult.error!)
  }
  const evaluation = evaluationResult.unwrap()

  return annotateEvaluationV2(
    {
      providerLog: providerLog as unknown as ProviderLogDto,
      evaluation,
      resultScore: Number(accepted),
      commit: latteCommit,
      workspace: latteWorkspace,
    },
    db,
  )
}
