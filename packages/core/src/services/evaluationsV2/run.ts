import {
  buildConversation,
  Commit,
  DatasetRow,
  DatasetV2,
  EVALUATION_SCORE_SCALE,
  EvaluationMetric,
  EvaluationResultV2,
  EvaluationResultValue,
  EvaluationType,
  EvaluationV2,
  ProviderLog,
  Workspace,
} from '../../browser'
import { database, Database } from '../../client'
import { publisher } from '../../events/publisher'
import {
  BadRequestError,
  Result,
  Transaction,
  UnprocessableEntityError,
} from '../../lib'
import {
  DocumentLogsRepository,
  DocumentVersionsRepository,
} from '../../repositories'
import { evaluationResultsV2 } from '../../schema'
import serializeProviderLog from '../providerLogs/serialize'
import { EVALUATION_SPECIFICATIONS } from './shared'

export async function runEvaluationV2<
  T extends EvaluationType,
  M extends EvaluationMetric<T>,
>(
  {
    evaluation,
    providerLog,
    dataset,
    row,
    commit,
    workspace,
  }: {
    evaluation: EvaluationV2<T, M>
    providerLog: ProviderLog
    dataset?: DatasetV2
    row?: DatasetRow
    commit: Commit
    workspace: Workspace
  },
  db: Database = database,
) {
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

  const conversation = buildConversation(serializeProviderLog(providerLog))
  if (conversation.at(-1)?.role != 'assistant') {
    return Result.error(
      new UnprocessableEntityError(
        'Cannot evaluate a log that does not end with an assistant message',
      ),
    )
  }

  if ((dataset && !row) || (row && !dataset)) {
    return Result.error(
      new BadRequestError(
        'If a row is provided, a dataset must also be provided',
      ),
    )
  }

  if (dataset && row && row.datasetId !== dataset.id) {
    return Result.error(new BadRequestError('Row is not part of the dataset'))
  }

  const specification = EVALUATION_SPECIFICATIONS[evaluation.type]
  if (!specification) {
    return Result.error(new BadRequestError('Invalid evaluation type'))
  }

  let value
  try {
    value = (await specification.run(
      {
        metric: evaluation.metric,
        evaluation: evaluation,
        conversation: conversation,
        dataset: dataset,
        row: row,
        providerLog: providerLog,
        documentLog: documentLog,
        document: document,
        commit: commit,
        workspace: workspace,
      },
      db,
    )) as EvaluationResultValue // Note: Typescript cannot resolve conditional types including unbound type arguments: https://github.com/microsoft/TypeScript/issues/53455

    if (
      !value.error &&
      (value.score < 0 || value.score > EVALUATION_SCORE_SCALE)
    ) {
      throw new UnprocessableEntityError(
        `Metric score must be between 0 and ${EVALUATION_SCORE_SCALE}`,
      )
    }
  } catch (error) {
    value = {
      score: null,
      metadata: null,
      error: {
        message: (error as Error).message,
      },
    }
  }

  return await Transaction.call(async (tx) => {
    const { result } = await createEvaluationResultV2(
      {
        evaluation: evaluation,
        providerLog: providerLog,
        commit: commit,
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
        commit: commit,
        providerLog: providerLog,
      },
    })

    return Result.ok({ result })
  }, db)
}

export async function createEvaluationResultV2<
  T extends EvaluationType,
  M extends EvaluationMetric<T>,
>(
  {
    evaluation,
    providerLog,
    commit,
    value,
    usedForSuggestion,
    workspace,
  }: {
    evaluation: EvaluationV2<T, M>
    providerLog: ProviderLog
    commit: Commit
    value: EvaluationResultValue<T, M>
    usedForSuggestion?: boolean
    workspace: Workspace
  },
  db: Database = database,
) {
  return await Transaction.call(async (tx) => {
    const result = (await tx
      .insert(evaluationResultsV2)
      .values({
        workspaceId: workspace.id,
        commitId: commit.id,
        evaluationUuid: evaluation.uuid,
        evaluatedLogId: providerLog.id,
        ...value,
        usedForSuggestion: usedForSuggestion,
      })
      .returning()
      .then((r) => r[0]!)) as EvaluationResultV2<T, M>

    await publisher.publishLater({
      type: 'evaluationResultV2Created',
      data: {
        workspaceId: workspace.id,
        result: result,
      },
    })

    return Result.ok({ result })
  }, db)
}
