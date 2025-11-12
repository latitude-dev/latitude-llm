import {
  EVALUATION_SCORE_SCALE,
  EvaluationMetric,
  EvaluationResultMetadata,
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
import {
  DocumentVersionsRepository,
  EvaluationResultsV2Repository,
} from '../../repositories'
import { type Commit } from '../../schema/models/types/Commit'
import { type Workspace } from '../../schema/models/types/Workspace'
import { findFirstSpanOfType } from '../tracing/spans/findFirstSpanOfType'
import { assembleTrace } from '../tracing/traces/assemble'
import { extractActualOutput } from './outputs/extract'
import { createEvaluationResultV2 } from './results/create'
import { updateEvaluationResultV2 } from './results/update'
import { EVALUATION_SPECIFICATIONS } from './specifications'

export async function annotateEvaluationV2<
  T extends EvaluationType,
  M extends EvaluationMetric<T>,
>(
  {
    resultScore,
    resultMetadata,
    evaluation,
    span,
    commit,
    workspace,
  }: {
    resultScore: number
    resultMetadata?: Partial<EvaluationResultMetadata<T, M>>
    evaluation: EvaluationV2<T, M>
    span: SpanWithDetails<SpanType.Prompt>
    commit: Commit
    workspace: Workspace
  },
  transaction = new Transaction(),
) {
  const resultsRepository = new EvaluationResultsV2Repository(workspace.id)
  const existingResult =
    await resultsRepository.findByEvaluatedSpanAndEvaluation({
      evaluatedSpanId: span.id,
      evaluatedTraceId: span.traceId,
      evaluationUuid: evaluation.uuid,
    })
  const resultUuid = existingResult
    ? existingResult.uuid
    : generateUUIDIdentifier()

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

  let conversation
  const assembledtrace = await assembleTrace({
    traceId: span.traceId,
    workspace,
  }).then((r) => r.value)
  if (assembledtrace) {
    const completionSpan = findFirstSpanOfType(
      assembledtrace.trace.children,
      SpanType.Completion,
    )
    if (!completionSpan) {
      return Result.error(new BadRequestError('Could not find completion span'))
    }

    conversation = [
      ...(completionSpan.metadata?.input ?? []),
      ...(completionSpan.metadata?.output ?? []),
    ] as unknown as LegacyMessage[]
  }
  if (!conversation) {
    return Result.error(new BadRequestError('Could not find conversation'))
  }

  let value
  try {
    // Note: some actual output errors are learnable and thus are treated as failures
    const actualOutput = await extractActualOutput({
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

  return await transaction.call(
    async () => {
      let result
      if (existingResult) {
        const { result: updatedResult } = await updateEvaluationResultV2(
          {
            workspace,
            result: existingResult,
            commit: commit,
            value: value as EvaluationResultValue<T, M>,
          },
          transaction,
        ).then((r) => r.unwrap())
        result = updatedResult
      } else {
        const { result: createdResult } = await createEvaluationResultV2(
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
        result = createdResult
      }

      return Result.ok({ result })
    },
    ({ result }) =>
      publisher.publishLater({
        type: 'evaluationV2Annotated',
        data: {
          workspaceId: workspace.id,
          evaluation: evaluation,
          result: result,
          commit: commit,
          spanId: span.id,
          traceId: span.traceId,
        },
      }),
  )
}
