import {
  ChainError,
  NotFoundError,
  RunErrorCodes,
} from '@latitude-data/constants/errors'
import {
  buildConversation,
  Commit,
  Dataset,
  DatasetRow,
  EVALUATION_SCORE_SCALE,
  EvaluationMetric,
  EvaluationResultValue,
  EvaluationType,
  EvaluationV2,
  Experiment,
  ProviderLogDto,
  Workspace,
} from '../../browser'
import { database, Database } from '../../client'
import { publisher } from '../../events/publisher'
import { BadRequestError, UnprocessableEntityError } from '../../lib/errors'
import { generateUUIDIdentifier } from '../../lib/generateUUID'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import {
  DocumentLogsRepository,
  DocumentVersionsRepository,
  EvaluationResultsV2Repository,
} from '../../repositories'
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
  db: Database = database,
) {
  const resultsRepository = new EvaluationResultsV2Repository(workspace.id, db)
  const result = await resultsRepository.findByEvaluatedLogAndEvaluation({
    evaluatedLogId: providerLog.id,
    evaluationUuid: evaluation.uuid,
  })

  if (result.ok) {
    return Result.error(
      new UnprocessableEntityError(
        'Cannot evaluate a log that is already evaluated for this evaluation',
      ),
    )
  }

  const resultUuid = generateUUIDIdentifier()

  const documentsRepository = new DocumentVersionsRepository(workspace.id, db)
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

  const documentLogsRepository = new DocumentLogsRepository(workspace.id, db)
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

  const conversation = buildConversation(providerLog)
  if (conversation.at(-1)?.role != 'assistant') {
    return Result.error(
      new UnprocessableEntityError(
        'Cannot evaluate a log that does not end with an assistant message',
      ),
    )
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

    value = (await typeSpecification.run(
      {
        metric: evaluation.metric,
        resultUuid: resultUuid,
        evaluation: evaluation,
        actualOutput: actualOutput,
        expectedOutput: expectedOutput,
        conversation: conversation,
        providerLog: providerLog,
        documentLog: documentLog,
        document: document,
        dataset: dataset,
        datasetLabel: datasetLabel,
        datasetRow: datasetRow,
        commit: commit,
        workspace: workspace,
      },
      db,
    )) as EvaluationResultValue // Note: Typescript cannot resolve conditional types including unbound type arguments: https://github.com/microsoft/TypeScript/issues/53455

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

  return await Transaction.call(async (tx) => {
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
      },
      tx,
    ).then((r) => r.unwrap())

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

    return Result.ok({ result })
  }, db)
}

export function isErrorRetryable(error: Error) {
  return (
    error instanceof NotFoundError ||
    (error instanceof ChainError && error.errorCode === RunErrorCodes.RateLimit)
  )
}
