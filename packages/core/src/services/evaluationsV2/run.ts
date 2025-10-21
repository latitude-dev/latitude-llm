import {
  ChainError,
  NotFoundError,
  RunErrorCodes,
} from '@latitude-data/constants/errors'
import {
  EVALUATION_SCORE_SCALE,
  EvaluationMetric,
  EvaluationResultValue,
  EvaluationType,
  EvaluationV2,
} from '../../constants'
import { publisher } from '../../events/publisher'
import { buildConversation } from '../../helpers'
import { BadRequestError, UnprocessableEntityError } from '../../lib/errors'
import { generateUUIDIdentifier } from '../../lib/generateUUID'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import {
  DocumentLogsRepository,
  DocumentVersionsRepository,
  EvaluationResultsV2Repository,
  SpansRepository,
} from '../../repositories'
import { type Commit } from '../../schema/models/types/Commit'
import { type Dataset } from '../../schema/models/types/Dataset'
import { type DatasetRow } from '../../schema/models/types/DatasetRow'
import { type Experiment } from '../../schema/models/types/Experiment'
import { type Workspace } from '../../schema/models/types/Workspace'
import { ProviderLogDto } from '../../schema/types'
import { extractActualOutput, extractExpectedOutput } from './outputs/extract'
import { createEvaluationResultV2 } from './results/create'
import { EVALUATION_SPECIFICATIONS } from './specifications'

export async function runEvaluationV2<
  T extends EvaluationType,
  M extends EvaluationMetric<T>,
>(
  {
    evaluation,
    providerLog,
    experiment,
    dataset,
    datasetLabel,
    datasetRow,
    commit,
    workspace,
  }: {
    evaluation: EvaluationV2<T, M>
    providerLog: ProviderLogDto
    experiment?: Experiment
    dataset?: Dataset
    datasetLabel?: string
    datasetRow?: DatasetRow
    commit: Commit
    workspace: Workspace
  },
  transaction = new Transaction(),
) {
  const resultsRepository = new EvaluationResultsV2Repository(workspace.id)
  const findResult = await resultsRepository.findByEvaluatedLogAndEvaluation({
    evaluatedLogId: providerLog.id,
    evaluationUuid: evaluation.uuid,
  })
  if (findResult.ok) {
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

  if (!providerLog.documentLogUuid) {
    return Result.error(
      new BadRequestError('Provider log is not attached to a document log'),
    )
  }

  const documentLogsRepository = new DocumentLogsRepository(workspace.id)
  const documentLog = await documentLogsRepository
    .findByUuid(providerLog.documentLogUuid)
    .then((r) => r.unwrap())

  if (documentLog.documentUuid !== document.documentUuid) {
    return Result.error(
      new UnprocessableEntityError(
        'Cannot evaluate a log that is from a different document',
      ),
    )
  }

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

  if (dataset && datasetLabel && datasetRow) {
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
        'Cannot evaluate a log without a dataset row when expected output is required',
      ),
    )
  }

  let value
  try {
    const actualOutput = await extractActualOutput({
      providerLog: providerLog,
      configuration: evaluation.configuration.actualOutput,
    }).then((r) => r.unwrap())

    let expectedOutput = undefined
    if (dataset && datasetLabel && datasetRow) {
      expectedOutput = await extractExpectedOutput({
        dataset: dataset,
        row: datasetRow,
        column: datasetLabel,
        configuration: evaluation.configuration.expectedOutput,
      }).then((r) => r.unwrap())
    }

    value = (await typeSpecification.run({
      metric: evaluation.metric,
      resultUuid: resultUuid,
      evaluation: evaluation,
      actualOutput: actualOutput,
      expectedOutput: expectedOutput,
      conversation: buildConversation(providerLog),
      providerLog: providerLog,
      documentLog: documentLog,
      document: document,
      dataset: dataset,
      datasetLabel: datasetLabel,
      datasetRow: datasetRow,
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
    if (isErrorRetryable(error as Error)) return Result.error(error as Error)

    value = { error: { message: (error as Error).message } }
  }

  return transaction.call(
    async () => {
      // Look up the span for this providerLog
      let evaluatedSpanId: string | undefined
      let evaluatedTraceId: string | undefined
      if (providerLog.documentLogUuid) {
        const spansRepository = new SpansRepository(workspace.id)
        const spanResult = await spansRepository.findByDocumentLogUuid(
          providerLog.documentLogUuid,
        )
        if (spanResult.ok) {
          const span = spanResult.value!
          evaluatedSpanId = span.id
          evaluatedTraceId = span.traceId
        }
      }

      const { result } = await createEvaluationResultV2(
        {
          uuid: resultUuid,
          evaluation: evaluation,
          providerLog: providerLog,
          commit: commit,
          experiment: experiment,
          dataset: dataset,
          datasetRow: datasetRow,
          value: value as EvaluationResultValue<T, M>,
          workspace: workspace,
          evaluatedSpanId: evaluatedSpanId,
          evaluatedTraceId: evaluatedTraceId,
        },
        transaction,
      ).then((r) => r.unwrap())

      return Result.ok({ result })
    },
    async ({ result }) => {
      await publisher.publishLater({
        type: 'evaluationV2Ran',
        data: {
          workspaceId: workspace.id,
          evaluation: evaluation,
          result: result,
          commit: commit,
          providerLog: providerLog,
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
