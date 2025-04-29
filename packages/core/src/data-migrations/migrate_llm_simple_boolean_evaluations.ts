import { and, eq, getTableColumns } from 'drizzle-orm'
import {
  EvaluationMetadataType,
  EvaluationResultableType,
  EvaluationType,
  EvaluationV2,
  LlmEvaluationMetric,
} from '../constants'
import { Result } from '../lib/Result'
import Transaction from '../lib/Transaction'
import {
  connectedEvaluations,
  evaluationConfigurationBoolean,
  evaluationMetadataLlmAsJudgeSimple,
  evaluationResultableBooleans,
  evaluationResults,
  evaluations,
} from '../schema'
import { createEvaluationV2 } from '../services/evaluationsV2/create'
import {
  CommitsRepository,
  DocumentVersionsRepository,
  ProviderApiKeysRepository,
  ProviderLogsRepository,
} from '../repositories'
import { createEvaluationResultV2 } from '../services/evaluationsV2/results/create'
import {
  buildConversation,
  Commit,
  Evaluation,
  EvaluationConfigurationBoolean,
  formatMessage,
  Workspace,
} from '../browser'
import { unsafelyFindWorkspace } from '../data-access'
import { normalizeScore } from '../services/evaluationsV2/shared'
import providerLogPresenter from '../services/providerLogs/presenter'
import { UnprocessableEntityError } from '../lib/errors'
import { Database } from '../client'

Transaction.call<string>(async (trx) => {
  const evals = await trx
    .select({
      ...getTableColumns(evaluations),
      connectedEvaluationId: connectedEvaluations.id,
      documentUuid: connectedEvaluations.documentUuid,
      metadata: getTableColumns(evaluationMetadataLlmAsJudgeSimple),
      configuration: getTableColumns(evaluationConfigurationBoolean),
    })
    .from(evaluations)
    .innerJoin(
      connectedEvaluations,
      eq(evaluations.id, connectedEvaluations.evaluationId),
    )
    .innerJoin(
      evaluationConfigurationBoolean,
      eq(evaluations.resultConfigurationId, evaluationConfigurationBoolean.id),
    )
    .innerJoin(
      evaluationMetadataLlmAsJudgeSimple,
      eq(evaluations.metadataId, evaluationMetadataLlmAsJudgeSimple.id),
    )
    .where(
      and(
        eq(evaluations.metadataType, EvaluationMetadataType.LlmAsJudgeSimple),
        eq(evaluations.resultType, EvaluationResultableType.Boolean),
      ),
    )
    .execute()

  for (const evval of evals) {
    const docsScope = new DocumentVersionsRepository(evval.workspaceId, trx)
    const commitsScope = new CommitsRepository(evval.workspaceId, trx)

    const documentResult = await docsScope.getDocumentByUuid({
      documentUuid: evval.documentUuid,
    })
    if (documentResult.error) continue

    const document = documentResult.value
    if (!document) continue

    const commitResult = await commitsScope.find(document.commitId)
    if (commitResult.error) continue

    const commit = commitResult.value
    if (!commit) continue

    const providersScope = new ProviderApiKeysRepository(evval.workspaceId, trx)
    const providerApiKeyResult = await providersScope.find(
      evval.metadata.providerApiKeyId,
    )
    if (providerApiKeyResult.error) continue

    const providerApiKey = providerApiKeyResult.value
    if (!providerApiKey) continue

    const workspace = await unsafelyFindWorkspace(evval.workspaceId)
    if (!workspace) continue

    const result = await createEvaluationV2({
      workspace,
      document,
      commit,
      settings: {
        name: evval.name,
        description: evval.description,
        type: EvaluationType.Llm,
        metric: LlmEvaluationMetric.Binary,
        configuration: {
          provider: providerApiKey.provider,
          model: evval.metadata.model,
          criteria:
            evval.metadata.objective +
            '\n\n' +
            evval.metadata.additionalInstructions,
          passDescription: evval.configuration.trueValueDescription || '',
          failDescription: evval.configuration.falseValueDescription || '',
          reverseScale: false,
        },
      },
    })

    if (result.error) throw result.error

    await migrateEvaluationResults(
      evval,
      result.unwrap().evaluation,
      commit,
      workspace,
      trx,
    )
  }

  return Result.ok('done')
})

async function migrateEvaluationResults(
  oldEval: Evaluation & {
    configuration: EvaluationConfigurationBoolean
  },
  newEval: EvaluationV2<EvaluationType.Llm, LlmEvaluationMetric.Binary>,
  commit: Commit,
  workspace: Workspace,
  db: Database,
) {
  const oldEvalResults = await db
    .select({
      ...getTableColumns(evaluationResults),
      resultable: getTableColumns(evaluationResultableBooleans),
    })
    .from(evaluationResults)
    .innerJoin(
      evaluationResultableBooleans,
      eq(evaluationResults.resultableId, evaluationResultableBooleans.id),
    )
    .where(
      and(
        eq(evaluationResults.evaluationId, oldEval.id),
        eq(evaluationResults.resultableType, EvaluationResultableType.Boolean),
      ),
    )
    .execute()

  console.log('creating results...')

  for (const result of oldEvalResults) {
    if (!result.evaluationProviderLogId) continue
    if (!result.reason) continue

    const providersScope = new ProviderLogsRepository(newEval.workspaceId, db)
    const providerLogResult = await providersScope.find(result.providerLogId)
    if (providerLogResult.error) continue

    const providerLog = providerLogResult.value
    if (!providerLog) continue

    const stats = await providersScope.statsByDocumentLogUuid(result.uuid)
    if (stats.error) continue
    const { tokens, costInMillicents, duration } = stats.value

    const { score, normalizedScore, hasPassed } = calculateNormalizedScore({
      passed: result.resultable.result,
    })

    const providerLogDto = providerLogPresenter(providerLog)
    const conversation = buildConversation(providerLog)
    if (conversation.at(-1)?.role != 'assistant') {
      return Result.error(
        new UnprocessableEntityError(
          'Cannot evaluate a log that does not end with an assistant message',
        ),
      )
    }

    const actualOutput = formatMessage(conversation.at(-1)!)

    const final = await createEvaluationResultV2({
      evaluation: newEval,
      // TODO: transform to providerlo(bgdto
      providerLog: providerLogDto,
      commit,
      value: {
        score,
        normalizedScore,
        hasPassed,
        metadata: {
          actualOutput,
          evaluationLogId: result.evaluationProviderLogId,
          reason: result.reason,
          configuration: newEval.configuration,
          tokens,
          cost: costInMillicents,
          duration,
        },
      },
      workspace,
    })

    if (final.error) throw final.error

    console.log('.')
  }
}

function calculateNormalizedScore({ passed }: { passed: boolean }) {
  const score = passed ? 1 : 0

  let normalizedScore = normalizeScore(score, 0, 1)
  let hasPassed = score === 1

  return { score, normalizedScore, hasPassed }
}
