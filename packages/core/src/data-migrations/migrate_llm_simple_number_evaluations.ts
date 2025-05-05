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
  evaluationConfigurationNumerical,
  evaluationMetadataLlmAsJudgeSimple,
  evaluationResultableNumbers,
} from '../schema'
import { createEvaluationV2 } from '../services/evaluationsV2/create'
import { ProviderApiKeysRepository } from '../repositories'
import {
  createMigrationStats,
  getEvaluations,
  initializeMigration,
  logMigrationError,
  logMigrationProgress,
  logMigrationSummary,
  findExistingEvaluationV2,
  migrateEvaluationResultz,
} from './utils'
import { getDocumentAndCommit } from './utils'

export async function migrateLlmSimpleNumberEvaluations(
  workspaceIdStr: string,
) {
  const { workspaceId, workspace, migrationName } = await initializeMigration(
    workspaceIdStr,
    'LLM Simple Number Migration',
  ).then((r) => r.unwrap())
  const stats = createMigrationStats()

  logMigrationProgress(
    migrationName,
    `Fetching evaluations for workspace ${workspaceId}...`,
  )

  const evals = await getEvaluations({
    workspaceId,
    evaluationMetadata: evaluationMetadataLlmAsJudgeSimple,
    evaluationConfiguration: evaluationConfigurationNumerical,
    evaluationResultableType: EvaluationResultableType.Number,
    evaluationMetadataType: EvaluationMetadataType.LlmAsJudgeSimple,
  })

  logMigrationProgress(
    migrationName,
    `Found ${evals.length} evaluations to migrate`,
  )

  for (const evval of evals) {
    logMigrationProgress(
      migrationName,
      `Processing evaluation ${evval.id} (${evval.name})`,
    )
    stats.processedCount++
    const { document, commit } = await getDocumentAndCommit({
      workspaceId,
      documentUuid: evval.documentUuid,
    })
    if (!document) {
      logMigrationError(
        migrationName,
        `Could not find document for evaluation ${evval.id}`,
      )
      stats.errorCount++
      continue
    }
    if (!commit) {
      logMigrationError(
        migrationName,
        `Could not find commit for evaluation ${evval.id}`,
      )
      stats.errorCount++
      continue
    }

    const providersScope = new ProviderApiKeysRepository(workspaceId)
    const providerApiKeyResult = await providersScope.find(
      evval.metadata.providerApiKeyId,
    )
    if (providerApiKeyResult.error) {
      logMigrationError(
        migrationName,
        `Failed to get provider api key:`,
        providerApiKeyResult.error,
      )
      stats.errorCount++
      continue
    }

    const providerApiKey = providerApiKeyResult.value
    if (!providerApiKey) {
      logMigrationError(
        migrationName,
        `Provider api key not found for id: ${evval.metadata.providerApiKeyId}`,
      )
      stats.errorCount++
      continue
    }

    await Transaction.call(async (trx) => {
      try {
        let evalv2 = (await findExistingEvaluationV2(
          {
            name: evval.name,
            workspace,
            document,
            commit,
            metric: LlmEvaluationMetric.Rating,
            evaluationType: EvaluationType.Llm,
          },
          trx,
        )) as
          | EvaluationV2<EvaluationType.Llm, LlmEvaluationMetric.Rating>
          | undefined

        const result = evalv2
          ? Result.ok({ evaluation: evalv2 })
          : await createEvaluationV2(
              {
                workspace,
                document,
                commit,
                settings: {
                  name: evval.name,
                  description: evval.description,
                  type: EvaluationType.Llm,
                  metric: LlmEvaluationMetric.Rating,
                  configuration: {
                    provider: providerApiKey.name,
                    model: evval.metadata.model,
                    criteria:
                      evval.metadata.objective +
                      '\n\n' +
                      (evval.metadata.additionalInstructions || ''),
                    minRating: evval.configuration.minValue,
                    minRatingDescription:
                      evval.configuration.minValueDescription || '',
                    maxRating: evval.configuration.maxValue,
                    maxRatingDescription:
                      evval.configuration.maxValueDescription || '',
                    reverseScale: false,
                  },
                },
              },
              trx,
            )

        if (result.error) {
          logMigrationError(
            migrationName,
            `Failed to create evaluation:`,
            result.error,
          )
          stats.errorCount++

          return result
        }

        logMigrationProgress(
          migrationName,
          evalv2
            ? `Found existing evaluation ${evalv2.uuid}`
            : `Successfully created new evaluation ${result.unwrap().evaluation.uuid}`,
        )
        stats.successCount++

        await migrateEvaluationResultz(
          {
            workspace,
            oldEval: evval,
            newEval: result.unwrap().evaluation,
            evaluationResultable: evaluationResultableNumbers,
            evaluationResultableType: EvaluationResultableType.Number,
            migrationName,
          },
          trx,
        )

        return Result.nil()
      } catch (error) {
        logMigrationError(
          migrationName,
          `Failed to migrate evaluation ${evval.id}:`,
          error,
        )
        stats.errorCount++

        return Result.error(error as Error)
      }
    })
  }

  logMigrationSummary(migrationName, stats, workspaceId)
  return Result.ok('done')
}
