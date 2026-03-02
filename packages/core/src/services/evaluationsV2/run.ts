import {
  EVALUATION_SCORE_SCALE,
  EvaluationMetric,
  EvaluationResultValue,
  EvaluationType,
  EvaluationV2,
  MainSpanType,
  SpanWithDetails,
} from '../../constants'
import { publisher } from '../../events/publisher'
import { BadRequestError, UnprocessableEntityError } from '../../lib/errors'
import { generateUUIDIdentifier } from '../../lib/generateUUID'
import { isRetryableError } from '../../lib/isRetryableError'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { LegacyMessage } from '../../lib/vercelSdkFromV5ToV4/convertResponseMessages'
import {
  DocumentVersionsRepository,
  EvaluationResultsV2Repository,
} from '../../repositories'
import { type Commit } from '../../schema/models/types/Commit'
import { type Dataset } from '../../schema/models/types/Dataset'
import { type DatasetRow } from '../../schema/models/types/DatasetRow'
import { type Experiment } from '../../schema/models/types/Experiment'
import { WorkspaceDto } from '../../schema/models/types/Workspace'
import { assembleTraceWithMessages } from '../tracing/traces/assemble'
import { extractActualOutput, extractExpectedOutput } from './outputs/extract'
import { extractCustomReason } from './reasons/extract'
import { createEvaluationResultV2 } from './results/create'
import { EVALUATION_SPECIFICATIONS } from './specifications'

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
    datasetReason,
    datasetRow,
    commit,
    workspace,
    dry = false,
  }: {
    evaluation: EvaluationV2<T, M>
    span: SpanWithDetails<MainSpanType>
    experiment?: Experiment
    dataset?: Dataset
    datasetLabel?: string
    datasetReason?: string
    datasetRow?: DatasetRow
    commit: Commit
    workspace: WorkspaceDto
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
  if (found && !dry) {
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
    datasetRow &&
    datasetLabel &&
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

  const assembledTraceResult = await assembleTraceWithMessages({
    traceId: span.traceId,
    workspace,
    spanId: span.id,
  })
  if (!Result.isOk(assembledTraceResult)) {
    return Result.error(new UnprocessableEntityError('Cannot assemble trace'))
  }

  const { completionSpan } = assembledTraceResult.unwrap()
  if (!completionSpan) {
    return Result.error(
      new UnprocessableEntityError('Cannot find completion span'),
    )
  }

  if (!completionSpan.metadata) {
    return Result.error(
      new UnprocessableEntityError('Completion span metadata is missing'),
    )
  }

  const conversation = [
    ...completionSpan.metadata.input,
    ...(completionSpan.metadata.output ?? []),
  ] as unknown as LegacyMessage[]

  let value
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

    // Note: all expected output/reason errors are treated as non-learnable errors
    let expectedOutput = undefined
    let customReason = undefined
    if (dataset && datasetRow) {
      if (datasetLabel && evaluation.configuration.expectedOutput) {
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

      if (datasetReason) {
        customReason = await extractCustomReason({
          dataset: dataset,
          row: datasetRow,
          column: datasetReason,
        })
        if (customReason.error) {
          throw customReason.error
        }
      }
    }

    value = (await typeSpecification.run({
      metric: evaluation.metric,
      resultUuid: resultUuid,
      evaluation: evaluation,
      actualOutput: actualOutput,
      expectedOutput: expectedOutput?.value,
      customReason: customReason?.value,
      conversation,
      span,
      document: document,
      experiment: experiment,
      dataset: dataset,
      datasetLabel: datasetLabel,
      datasetReason: datasetReason,
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
    if (isRetryableError(error as Error)) {
      return Result.error(error as Error)
    }

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
