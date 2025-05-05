import {
  EvaluationMetadataType,
  EvaluationResultableType,
  EvaluationType,
  EvaluationV2,
  HumanEvaluationMetric,
} from '../constants'
import { Result } from '../lib/Result'
import Transaction from '../lib/Transaction'
import {
  evaluationConfigurationBoolean,
  evaluationMetadataManual,
  evaluationResultableBooleans,
} from '../schema'
import { createEvaluationV2 } from '../services/evaluationsV2/create'
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

export async function migrateManualBooleanEvaluations(workspaceIdStr: string) {
  const { workspaceId, workspace, migrationName } = await initializeMigration(
    workspaceIdStr,
    'Manual Boolean Migration',
  ).then((r) => r.unwrap())
  const stats = createMigrationStats()

  logMigrationProgress(
    migrationName,
    `Fetching evaluations for workspace ${workspaceId}...`,
  )
  const evals = await getEvaluations({
    workspaceId,
    evaluationMetadata: evaluationMetadataManual,
    evaluationConfiguration: evaluationConfigurationBoolean,
    evaluationResultableType: EvaluationResultableType.Boolean,
    evaluationMetadataType: EvaluationMetadataType.Manual,
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

    await Transaction.call(async (trx) => {
      try {
        let evalv2 = (await findExistingEvaluationV2(
          {
            name: evval.name,
            workspace,
            document,
            commit,
            metric: HumanEvaluationMetric.Binary,
            evaluationType: EvaluationType.Human,
          },
          trx,
        )) as
          | EvaluationV2<EvaluationType.Human, HumanEvaluationMetric.Binary>
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
                  type: EvaluationType.Human,
                  metric: HumanEvaluationMetric.Binary,
                  configuration: {
                    passDescription:
                      evval.configuration.trueValueDescription || '',
                    failDescription:
                      evval.configuration.falseValueDescription || '',
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
      } catch (e) {
        logMigrationError(migrationName, `Failed to create evaluation:`, e)
        stats.errorCount++
        return Result.error(e as Error)
      }
    })
  }

  logMigrationSummary(migrationName, stats, workspaceId)
  return Result.ok('done')
}
