import { env } from '@latitude-data/env'
import { database } from '../../../../client'
import { Result } from '../../../../lib/Result'
import {
  EvaluationsV2Repository,
  SpanMetadatasRepository,
  SpansRepository,
} from '../../../../repositories'
import { annotateEvaluationV2 } from '../../../evaluationsV2/annotate'
import { getCopilotDocument } from '../helpers'
import {
  NotFoundError,
  NotImplementedError,
} from '@latitude-data/constants/errors'
import {
  PromptSpanMetadata,
  SpanType,
  SpanWithDetails,
} from '@latitude-data/constants'

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
        'This environment does not support adding feedback to Latte threads',
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

  const spansRepo = new SpansRepository(latteWorkspace.id, db)
  const metadataRepo = new SpanMetadatasRepository(latteWorkspace.id)
  const span = await spansRepo.findByDocumentLogUuid(threadUuid)
  if (!span) {
    return Result.error(
      new NotFoundError(`Span not found with threadUuid ${threadUuid}`),
    )
  }
  const promptSpanMetadata = (await metadataRepo
    .get({ spanId: span.id, traceId: span.traceId })
    .then((r) => r.value)) as PromptSpanMetadata | undefined
  if (!promptSpanMetadata) {
    return Result.error(
      new NotFoundError(
        `Span metadata not found with spanId ${span.id} and traceId ${span.traceId}`,
      ),
    )
  }

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

  return annotateEvaluationV2({
    span: {
      ...span,
      metadata: promptSpanMetadata,
    } as SpanWithDetails<SpanType.Prompt>,
    evaluation,
    resultScore: Number(accepted),
    commit: latteCommit,
    workspace: latteWorkspace,
  })
}
