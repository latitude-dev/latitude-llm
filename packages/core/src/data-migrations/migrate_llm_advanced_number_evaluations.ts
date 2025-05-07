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
  evaluationConfigurationNumerical,
  evaluationMetadataLlmAsJudgeAdvanced,
  evaluationResultableNumbers,
  evaluationResults,
  evaluations,
} from '../schema'
import { createEvaluationV2 } from '../services/evaluationsV2/create'
import {
  CommitsRepository,
  DocumentVersionsRepository,
  ProviderLogsRepository,
} from '../repositories'
import { createEvaluationResultV2 } from '../services/evaluationsV2/results/create'
import {
  buildConversation,
  Commit,
  Evaluation,
  EvaluationConfigurationNumerical,
  formatMessage,
  Workspace,
} from '../browser'
import { unsafelyFindWorkspace } from '../data-access'
import { normalizeScore } from '../services/evaluationsV2/shared'
import providerLogPresenter from '../services/providerLogs/presenter'
import { UnprocessableEntityError } from '../lib/errors'
import { Database } from '../client'
import { scan } from 'promptl-ai'
import { z } from 'zod'
import zodToJsonSchema from 'zod-to-json-schema'

export function main() {
  Transaction.call<string>(async (trx) => {
    const evals = await trx
      .select({
        ...getTableColumns(evaluations),
        connectedEvaluationId: connectedEvaluations.id,
        documentUuid: connectedEvaluations.documentUuid,
        metadata: getTableColumns(evaluationMetadataLlmAsJudgeAdvanced),
        configuration: getTableColumns(evaluationConfigurationNumerical),
      })
      .from(evaluations)
      .innerJoin(
        connectedEvaluations,
        eq(evaluations.id, connectedEvaluations.evaluationId),
      )
      .innerJoin(
        evaluationConfigurationNumerical,
        eq(
          evaluations.resultConfigurationId,
          evaluationConfigurationNumerical.id,
        ),
      )
      .innerJoin(
        evaluationMetadataLlmAsJudgeAdvanced,
        eq(evaluations.metadataId, evaluationMetadataLlmAsJudgeAdvanced.id),
      )
      .where(
        and(
          eq(
            evaluations.metadataType,
            EvaluationMetadataType.LlmAsJudgeAdvanced,
          ),
          eq(evaluations.resultType, EvaluationResultableType.Number),
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

      const workspace = await unsafelyFindWorkspace(evval.workspaceId)
      if (!workspace) continue

      const { config } = await scan({ prompt: evval.metadata.prompt })
      if (!config.model || !config.provider) continue

      const prompt = `${evval.metadata.prompt}

/* This step has been added to adapt this evaluation to the new evaluation's
* result schema. Feel free to change the prompt below considering the result
* should be a value between 0 and 100.
*/

<step schema={{${zodToJsonSchema(z.object({ score: z.number().min(0).max(100), reason: z.string() }), { target: 'openAi' })}}}>
The result schema has been changed to be a value between 0 and 100. Taking into
account the instructions from previous messages, please make sure to return the
expect output with a value between 0 and 100.
</step>
`

      const result = await createEvaluationV2({
        workspace,
        document,
        commit,
        settings: {
          name: evval.name,
          description: evval.description,
          type: EvaluationType.Llm,
          metric: LlmEvaluationMetric.Custom,
          // @ts-expect-error - TODO(Gerardo): fix this
          configuration: {
            model: config.model as string,
            provider: config.provider as string,
            prompt,
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
}

async function migrateEvaluationResults(
  oldEval: Evaluation & {
    configuration: EvaluationConfigurationNumerical
  },
  newEval: EvaluationV2<EvaluationType.Llm, LlmEvaluationMetric.Custom>,
  commit: Commit,
  workspace: Workspace,
  db: Database,
) {
  const oldEvalResults = await db
    .select({
      ...getTableColumns(evaluationResults),
      resultable: getTableColumns(evaluationResultableNumbers),
    })
    .from(evaluationResults)
    .innerJoin(
      evaluationResultableNumbers,
      eq(evaluationResults.resultableId, evaluationResultableNumbers.id),
    )
    .where(
      and(
        eq(evaluationResults.evaluationId, oldEval.id),
        eq(evaluationResults.resultableType, EvaluationResultableType.Number),
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
      rating: result.resultable.result,
      minRating: oldEval.configuration.minValue,
      maxRating: oldEval.configuration.maxValue,
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

function calculateNormalizedScore({
  rating,
  minRating,
  maxRating,
}: {
  rating: number
  minRating: number
  maxRating: number
}) {
  const score = Math.min(
    Math.max(Number(rating.toFixed(0)), minRating),
    maxRating,
  )

  let normalizedScore = normalizeScore(score, minRating, maxRating)

  const minThreshold = minRating
  const maxThreshold = maxRating
  const hasPassed = score >= minThreshold && score <= maxThreshold

  return { score, normalizedScore, hasPassed }
}
