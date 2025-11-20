import {
  ChainError,
  NotFoundError,
  RunErrorCodes,
} from '@latitude-data/constants/errors'
import {
  CompletionSpanMetadata,
  EVALUATION_SCORE_SCALE,
  EvaluationMetric,
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
import {
  DocumentVersionsRepository,
  EvaluationResultsV2Repository,
} from '../../repositories'
import { type Commit } from '../../schema/models/types/Commit'
import { type Dataset } from '../../schema/models/types/Dataset'
import { type DatasetRow } from '../../schema/models/types/DatasetRow'
import { type Experiment } from '../../schema/models/types/Experiment'
import { type Workspace } from '../../schema/models/types/Workspace'
import { extractActualOutput, extractExpectedOutput } from './outputs/extract'
import { createEvaluationResultV2 } from './results/create'
import { EVALUATION_SPECIFICATIONS } from './specifications'
import { assembleTrace } from '../tracing/traces/assemble'
import { LegacyMessage } from '../../lib/vercelSdkFromV5ToV4/convertResponseMessages'
import { findLastSpanOfType } from '../tracing/spans/findLastSpanOfType'

export async function runEvaluationV2<
  T extends EvaluationType,
  M extends EvaluationMetric<T>,
>(
  {
    evaluation,
    span,
    experiment,
    dataset,
    datasetLabel,
    datasetRow,
    commit,
    workspace,
    dry = false,
  }: {
    evaluation: EvaluationV2<T, M>
    span: SpanWithDetails<SpanType.Prompt>
    experiment?: Experiment
    dataset?: Dataset
    datasetLabel?: string
    datasetRow?: DatasetRow
    commit: Commit
    workspace: Workspace
    dry?: boolean
  },
  transaction = new Transaction(),
) {
  const resultsRepository = new EvaluationResultsV2Repository(workspace.id)
  const found = await resultsRepository.findByEvaluatedSpanAndEvaluation({
    evaluatedSpanId: span.id,
    evaluatedTraceId: span.traceId,
    evaluationUuid: evaluation.uuid,
  })
  if (found) {
    return Result.error(
      new UnprocessableEntityError(
        'Cannot evaluate a log that is already evaluated for this evaluation',
      ),
    )
  }

  const resultUuid = generateUUIDIdentifier()
  const documentsRepository = new DocumentVersionsRepository(workspace.id)
  const document = await documentsRepository
    .getDocumentAtCommit({
      commitUuid: commit.uuid,
      documentUuid: evaluation.documentUuid,
    })
    .then((r) => r.unwrap())

  const typeSpecification = EVALUATION_SPECIFICATIONS[evaluation.type]
  if (!typeSpecification) {
    return Result.error(new BadRequestError('Invalid evaluation type'))
  }

  if (!typeSpecification.run) {
    return Result.error(
      new BadRequestError('Running is not supported for this evaluation'),
    )
  }

  const metricSpecification = typeSpecification.metrics[evaluation.metric]
  if (!metricSpecification) {
    return Result.error(new BadRequestError('Invalid evaluation metric'))
  }

  if (
    dataset &&
    datasetLabel &&
    datasetRow &&
    evaluation.configuration.expectedOutput
  ) {
    if (datasetRow.datasetId !== dataset.id) {
      return Result.error(
        new UnprocessableEntityError(
          'Cannot evaluate a row that is from a different dataset',
        ),
      )
    }
  } else if (metricSpecification.requiresExpectedOutput) {
    return Result.error(
      new UnprocessableEntityError(
        'Cannot evaluate a log without a dataset, label, row or configuration when expected output is required',
      ),
    )
  }

  const assembledSpan = await assembleTrace({
    traceId: span.traceId,
    workspace,
  }).then((r) => r.unwrap())
  if (!assembledSpan) {
    return Result.error(new UnprocessableEntityError('Cannot assemble trace'))
  }
  const completionSpan = findLastSpanOfType(
    assembledSpan.trace.children,
    SpanType.Completion,
  )
  if (!completionSpan) {
    return Result.error(
      new UnprocessableEntityError('Cannot find completion span'),
    )
  }
  const completionSpanMetadata =
    completionSpan.metadata as CompletionSpanMetadata
  const conversation = [
    ...completionSpanMetadata.input,
    ...(completionSpanMetadata.output ?? []),
  ] as unknown as LegacyMessage[]

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

    // Note: all expected output errors are treated as non-learnable errors
    let expectedOutput = undefined
    if (
      dataset &&
      datasetLabel &&
      datasetRow &&
      evaluation.configuration.expectedOutput
    ) {
      expectedOutput = await extractExpectedOutput({
        dataset: dataset,
        row: datasetRow,
        column: datasetLabel,
        configuration: evaluation.configuration.expectedOutput,
      })
      if (expectedOutput.error) {
        throw expectedOutput.error
      }
    }

    value = (await typeSpecification.run({
      metric: evaluation.metric,
      resultUuid: resultUuid,
      evaluation: evaluation,
      actualOutput: actualOutput,
      expectedOutput: expectedOutput,
      conversation,
      span,
      document: document,
      experiment: experiment,
      dataset: dataset,
      datasetLabel: datasetLabel,
      datasetRow: datasetRow,
      commit: commit,
      workspace: workspace,
      dry: dry,
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
    if (isErrorRetryable(error as Error)) return Result.error(error as Error)

    value = { error: { message: (error as Error).message } }
  }

  return transaction.call(
    async () => {
      const { result } = await createEvaluationResultV2(
        {
          uuid: resultUuid,
          evaluation: evaluation,
          span,
          commit: commit,
          experiment: experiment,
          dataset: dataset,
          datasetRow: datasetRow,
          value: value as EvaluationResultValue<T, M>,
          workspace: workspace,
          dry: dry,
        },
        transaction,
      ).then((r) => r.unwrap())

      return Result.ok({ result })
    },
    async ({ result }) => {
      if (dry) return

      await publisher.publishLater({
        type: 'evaluationV2Ran',
        data: {
          workspaceId: workspace.id,
          evaluation: evaluation,
          result: result,
          commit: commit,
          spanId: span.id,
          traceId: span.traceId,
        },
      })
    },
  )
}

export function isErrorRetryable(error: Error) {
  return (
    error instanceof NotFoundError ||
    (error instanceof ChainError && error.errorCode === RunErrorCodes.RateLimit)
  )
}
