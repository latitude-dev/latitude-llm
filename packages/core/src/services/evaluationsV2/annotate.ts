import {
  EVALUATION_SCORE_SCALE,
  EvaluationMetric,
  EvaluationResultMetadata,
  EvaluationResultV2,
  EvaluationResultValue,
  EvaluationType,
  EvaluationV2,
  SpanType,
  SpanWithDetails,
} from '../../constants'
import { publisher } from '../../events/publisher'
import { BadRequestError, UnprocessableEntityError } from '../../lib/errors'
import { generateUUIDIdentifier } from '../../lib/generateUUID'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { LegacyMessage } from '../../lib/vercelSdkFromV5ToV4/convertResponseMessages'
import { DocumentVersionsRepository } from '../../repositories'
import { type Commit } from '../../schema/models/types/Commit'
import { type Workspace } from '../../schema/models/types/Workspace'
import { type User } from '../../schema/models/types/User'
import { assembleTraceWithMessages } from '../tracing/traces/assemble'
import { extractActualOutput } from './outputs/extract'
import { createEvaluationResultV2 } from './results/create'
import { updateEvaluationResultV2 } from './results/update'
import { EVALUATION_SPECIFICATIONS } from './specifications'
import { EvaluationResultsV2Repository } from '../../repositories'

export async function annotateEvaluationV2<
  T extends EvaluationType,
  M extends EvaluationMetric<T>,
>(
  {
    workspace,
    commit,
    evaluation,
    span,
    resultScore,
    resultMetadata,
    currentUser,
    resultUuid: existingResultUuid,
  }: {
    workspace: Workspace
    commit: Commit
    evaluation: EvaluationV2<T, M>
    span: SpanWithDetails<SpanType.Prompt>
    resultScore: number
    resultMetadata?: Partial<EvaluationResultMetadata<T, M>>
    currentUser?: User
    resultUuid?: string
  },
  transaction = new Transaction(),
) {
  const resultUuid = existingResultUuid ?? generateUUIDIdentifier()
  const isUpdate = !!existingResultUuid
  const typeSpecification = EVALUATION_SPECIFICATIONS[evaluation.type]
  if (!typeSpecification) {
    return Result.error(new BadRequestError('Invalid evaluation type'))
  }

  if (!typeSpecification.annotate) {
    return Result.error(
      new BadRequestError('Annotating is not supported for this evaluation'),
    )
  }

  const metricSpecification = typeSpecification.metrics[evaluation.metric]
  if (!metricSpecification) {
    return Result.error(new BadRequestError('Invalid evaluation metric'))
  }

  const assembledTraceResult = await assembleTraceWithMessages({
    traceId: span.traceId,
    workspace,
  })
  if (!Result.isOk(assembledTraceResult)) {
    return Result.error(new BadRequestError('Could not assemble trace'))
  }

  const { completionSpan } = assembledTraceResult.unwrap()
  if (!completionSpan) {
    return Result.error(new BadRequestError('Could not find completion span'))
  }

  const conversation = [
    ...(completionSpan.metadata?.input ?? []),
    ...(completionSpan.metadata?.output ?? []),
  ] as unknown as LegacyMessage[]

  let value: EvaluationResultValue
  try {
    // Note: some actual output errors are learnable and thus are treated as failures
    const actualOutput = extractActualOutput({
      conversation,
      configuration: evaluation.configuration.actualOutput,
    })
    if (
      actualOutput.error &&
      !(actualOutput.error instanceof UnprocessableEntityError)
    ) {
      throw actualOutput.error
    }

    if (resultMetadata) {
      typeSpecification.resultMetadata.partial().parse(resultMetadata)
    }

    const documentsRepository = new DocumentVersionsRepository(workspace.id)
    const document = await documentsRepository
      .getDocumentAtCommit({
        commitUuid: commit.uuid,
        documentUuid: evaluation.documentUuid,
      })
      .then((r) => r.unwrap())

    value = (await typeSpecification.annotate({
      metric: evaluation.metric,
      resultUuid: resultUuid,
      resultScore: resultScore,
      resultMetadata: resultMetadata,
      evaluation: evaluation,
      actualOutput: actualOutput,
      conversation: conversation,
      span,
      document,
      commit: commit,
      workspace: workspace,
    })) as EvaluationResultValue // Note: Typescript cannot resolve conditional types including unbound type arguments: https://github.com/microsoft/TypeScript/issues/53455

    if (
      !value.error &&
      (value.normalizedScore < 0 ||
        value.normalizedScore > EVALUATION_SCORE_SCALE)
    ) {
      throw new UnprocessableEntityError(
        `Normalized metric score must be between 0 and ${EVALUATION_SCORE_SCALE}`,
      )
    }
  } catch (error) {
    value = { error: { message: (error as Error).message } }
  }

  let sendToAnalytics: boolean = false

  return await transaction.call(
    async (tx) => {
      let result: EvaluationResultV2<T, M>
      if (isUpdate) {
        const resultsRepo = new EvaluationResultsV2Repository(workspace.id, tx)
        const existingResult = await resultsRepo
          .findByUuid(resultUuid)
          .then((r) => r.unwrap())

        sendToAnalytics = existingResult.score !== resultScore

        const updated = await updateEvaluationResultV2(
          {
            workspace,
            commit,
            result: existingResult as EvaluationResultV2<T, M>,
            value: value as EvaluationResultValue<T, M>,
            evaluation,
          },
          transaction,
        ).then((r) => r.unwrap())
        result = updated.result
      } else {
        sendToAnalytics = true
        const created = await createEvaluationResultV2(
          {
            uuid: resultUuid,
            evaluation: evaluation,
            span,
            commit: commit,
            value: value as EvaluationResultValue<T, M>,
            workspace: workspace,
          },
          transaction,
        ).then((r) => r.unwrap())
        result = created.result
      }

      return Result.ok(result)
    },
    (result) =>
      publisher.publishLater({
        type: 'evaluationV2Annotated',
        data: {
          isNew: !isUpdate,
          userEmail: sendToAnalytics ? currentUser?.email || null : null,
          workspaceId: workspace.id,
          evaluation,
          result,
          commit,
          spanId: span.id,
          traceId: span.traceId,
        },
      }),
  )
}
