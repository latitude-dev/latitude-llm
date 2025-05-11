import {
  buildConversation,
  Commit,
  EVALUATION_SCORE_SCALE,
  EvaluationMetric,
  EvaluationResultMetadata,
  EvaluationResultValue,
  EvaluationType,
  EvaluationV2,
  formatMessage,
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
    providerLog,
    commit,
    workspace,
  }: {
    resultScore: number
    resultMetadata?: Partial<EvaluationResultMetadata<T, M>>
    evaluation: EvaluationV2<T, M>
    providerLog: ProviderLogDto
    commit: Commit
    workspace: Workspace
  },
  db: Database = database,
) {
  const resultsRepository = new EvaluationResultsV2Repository(workspace.id, db)
  const existingResult =
    await resultsRepository.findByEvaluatedLogAndEvaluation({
      evaluatedLogId: providerLog.id,
      evaluationUuid: evaluation.uuid,
    })

  const resultUuid = existingResult.ok
    ? existingResult.unwrap().uuid
    : generateUUIDIdentifier()

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

  const conversation = buildConversation(providerLog)
  if (conversation.at(-1)?.role != 'assistant') {
    return Result.error(
      new UnprocessableEntityError(
        'Cannot evaluate a log that does not end with an assistant message',
      ),
    )
  }

  const actualOutput = formatMessage(conversation.at(-1)!)

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

  let value
  try {
    if (resultMetadata) {
      typeSpecification.resultMetadata.partial().parse(resultMetadata)
    }

    value = (await typeSpecification.annotate(
      {
        metric: evaluation.metric,
        resultUuid: resultUuid,
        resultScore: resultScore,
        resultMetadata: resultMetadata,
        evaluation: evaluation,
        actualOutput: actualOutput,
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

  return await Transaction.call(async (tx) => {
    let result
    if (existingResult.ok) {
      const { result: updatedResult } = await updateEvaluationResultV2(
        {
          result: existingResult.unwrap(),
          commit: commit,
          value: value as EvaluationResultValue<T, M>,
          workspace: workspace,
        },
        tx,
      ).then((r) => r.unwrap())
      result = updatedResult
    } else {
      const { result: createdResult } = await createEvaluationResultV2(
        {
          uuid: resultUuid,
          evaluation: evaluation,
          providerLog: providerLog,
          commit: commit,
          value: value as EvaluationResultValue<T, M>,
          workspace: workspace,
        },
        tx,
      ).then((r) => r.unwrap())
      result = createdResult
    }

    await publisher.publishLater({
      type: 'evaluationV2Annotated',
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
