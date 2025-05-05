import {
  EvaluationMetadataType,
  EvaluationResultableType,
  EvaluationType,
  EvaluationV2,
  LlmEvaluationMetric,
} from '../constants'
import { Result } from '../lib/Result'
import {
  evaluationConfigurationBoolean,
  evaluationMetadataLlmAsJudgeSimple,
  evaluationResultableBooleans,
} from '../schema'
import { createEvaluationV2 } from '../services/evaluationsV2/create'
import { ProviderApiKeysRepository } from '../repositories'

import {
  initializeMigration,
  logMigrationProgress,
  logMigrationSummary,
  createMigrationStats,
  logMigrationError,
  migrateEvaluationResultz,
} from './utils'
import Transaction from '../lib/Transaction'
import {
  getDocumentAndCommit,
  getEvaluations,
  findExistingEvaluationV2,
} from './utils'

const MIGRATION_NAME = 'LLM Simple Boolean Migration'

export async function migrateLlmSimpleBooleanEvaluations(
  workspaceIdStr: string,
) {
  const { workspaceId, workspace, migrationName } = await initializeMigration(
    workspaceIdStr,
    MIGRATION_NAME,
  ).then((r) => r.unwrap())
  const stats = createMigrationStats()

  logMigrationProgress(
    migrationName,
    `Fetching evaluations for workspace ${workspaceId}...`,
  )

  const evals = await getEvaluations({
    workspaceId,
    evaluationMetadata: evaluationMetadataLlmAsJudgeSimple,
    evaluationConfiguration: evaluationConfigurationBoolean,
    evaluationResultableType: EvaluationResultableType.Boolean,
    evaluationMetadataType: EvaluationMetadataType.LlmAsJudgeSimple,
  })

  logMigrationProgress(
    migrationName,
    `Found ${evals.length} evaluations to migrate`,
  )

  for (const evval of evals) {
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
        `Failed to get provider api key by id ${evval.metadata.providerApiKeyId}:`,
        providerApiKeyResult.error,
      )
      stats.errorCount++
      continue
    }

    const providerApiKey = providerApiKeyResult.value
    if (!providerApiKey) {
      logMigrationError(
        migrationName,
        `Provider api key not found for id ${evval.metadata.providerApiKeyId}`,
      )
      stats.errorCount++
      continue
    }

    logMigrationProgress(
      migrationName,
      `Processing evaluation ${evval.id} (${evval.name})`,
    )

    await Transaction.call(async (trx) => {
      try {
        let evalv2 = (await findExistingEvaluationV2(
          {
            name: evval.name,
            workspace,
            document,
            commit,
            metric: LlmEvaluationMetric.Binary,
            evaluationType: EvaluationType.Llm,
          },
          trx,
        )) as
          | EvaluationV2<EvaluationType.Llm, LlmEvaluationMetric.Binary>
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
                  metric: LlmEvaluationMetric.Binary,
                  configuration: {
                    provider: providerApiKey.name,
                    model: evval.metadata.model,
                    criteria:
                      evval.metadata.objective +
                      '\n\n' +
                      (evval.metadata.additionalInstructions || ''),
                    passDescription:
                      evval.configuration.trueValueDescription || '<missing>',
                    failDescription:
                      evval.configuration.falseValueDescription || '<missing>',
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
            evaluationResultable: evaluationResultableBooleans,
            evaluationResultableType: EvaluationResultableType.Boolean,
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
