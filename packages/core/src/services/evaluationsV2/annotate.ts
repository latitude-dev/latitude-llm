import { database } from '../../client'
import {
  EVALUATION_SCORE_SCALE,
  EvaluationMetric,
  EvaluationResultMetadata,
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
} from '../../repositories'
import { type Commit } from '../../schema/models/types/Commit'
import { type Workspace } from '../../schema/models/types/Workspace'
import { type User } from '../../schema/models/types/User'
import { ProviderLogDto } from '../../schema/types'
import { extractActualOutput } from './outputs/extract'
import { createEvaluationResultV2 } from './results/create'
import { updateEvaluationResultV2 } from './results/update'
import { EVALUATION_SPECIFICATIONS } from './specifications'

export async function annotateEvaluationV2<
  T extends EvaluationType,
  M extends EvaluationMetric<T>,
>(
  {
    workspace,
    commit,
    providerLog,
    evaluation,
    resultScore,
    resultMetadata,
    currentUser,
  }: {
    workspace: Workspace
    commit: Commit
    currentUser?: User
    providerLog: ProviderLogDto
    evaluation: EvaluationV2<T, M>
    resultScore: number
    resultMetadata?: Partial<EvaluationResultMetadata<T, M>>
  },
  db = database,
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

  const conversation = buildConversation(providerLog)
  if (conversation.at(-1)?.role != 'assistant') {
    return Result.error(
      new UnprocessableEntityError(
        'Cannot evaluate a log that does not end with an assistant message',
      ),
    )
  }

  let value
  try {
    // Note: some actual output errors are learnable and thus are treated as failures
    const actualOutput = await extractActualOutput({
      providerLog: providerLog,
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

    value = (await typeSpecification.annotate(
      {
        metric: evaluation.metric,
        resultUuid: resultUuid,
        resultScore: resultScore,
        resultMetadata: resultMetadata,
        evaluation: evaluation,
        actualOutput: actualOutput,
        conversation: conversation,
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

  // TODO: We are stepping out of the db instance. This service should accept an instance of Transaction instead.
  const transaction = new Transaction()
  let alreadyExisted = false
  let sendToAnalytics = false

  return await transaction.call(
    async () => {
      let result

      alreadyExisted = !!existingResult.ok

      if (alreadyExisted) {
        const existing = existingResult.unwrap()
        // Check if score actually changed (ignore reason-only updates)
        sendToAnalytics = existing.score !== resultScore

        const { result: updatedResult } = await updateEvaluationResultV2(
          {
            workspace,
            commit,
            result: existing,
            value: value as EvaluationResultValue<T, M>,
          },
          transaction,
        ).then((r) => r.unwrap())
        result = updatedResult
      } else {
        // New annotation - always send analytics
        sendToAnalytics = true
        const { result: createdResult } = await createEvaluationResultV2(
          {
            uuid: resultUuid,
            evaluation: evaluation,
            providerLog: providerLog,
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
    ({ result }) => {
      // Always publish event, but only include userEmail when score changed
      // Analytics platform checks userEmail to decide whether to process the event
      // This prevents sending partial reason text from debounced updates
      publisher.publishLater({
        type: 'evaluationV2Annotated',
        data: {
          isNew: !alreadyExisted,
          userEmail: sendToAnalytics ? currentUser?.email || null : null,
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
