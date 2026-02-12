import { NotImplementedError } from '@latitude-data/constants/errors'
import { env } from '@latitude-data/env'
import { database } from '../../../../client'
import {
  EvaluationType,
  EvaluationV2,
  HumanEvaluationMetric,
  SpanType,
  SpanWithDetails,
} from '../../../../constants'
import { Result } from '../../../../lib/Result'
import {
  EvaluationResultsV2Repository,
  EvaluationsV2Repository,
  SpanMetadatasRepository,
} from '../../../../repositories'
import { findSpan } from '../../../../queries/spans/findSpan'
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
  if (!evalResult.evaluatedTraceId || !evalResult.evaluatedSpanId) return

  const spanMetadataRepo = new SpanMetadatasRepository(latteWorkspace.id)
  const span = await findSpan(
    {
      workspaceId: latteWorkspace.id,
      traceId: evalResult.evaluatedTraceId,
      spanId: evalResult.evaluatedSpanId,
    },
    db,
  )
  const metadata = await spanMetadataRepo
    .get({
      traceId: evalResult.evaluatedTraceId,
      spanId: evalResult.evaluatedSpanId,
    })
    .then((r) => r.unwrap())

  return annotateEvaluationV2({
    workspace: latteWorkspace,
    commit: latteCommit,
    evaluation,
    span: { ...span, metadata } as SpanWithDetails<SpanType.Prompt>,
    resultScore: evalResult.score!,
    resultMetadata: {
      reason: content,
    },
  })
}
