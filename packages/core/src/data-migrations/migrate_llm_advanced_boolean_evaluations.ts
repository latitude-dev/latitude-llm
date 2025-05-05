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
  evaluationConfigurationBoolean,
  evaluationMetadataLlmAsJudgeAdvanced,
  evaluationResultableBooleans,
} from '../schema'
import { createEvaluationV2 } from '../services/evaluationsV2/create'
import { scan } from 'promptl-ai'
import {
  createMigrationStats,
  getEvaluations,
  initializeMigration,
  logMigrationError,
  logMigrationProgress,
  logMigrationSummary,
  migrateEvaluationResultz,
} from './utils'
import { findExistingEvaluationV2, getDocumentAndCommit } from './utils'

export async function migrateLlmAdvancedBooleanEvaluations(
  workspaceIdStr: string,
) {
  const { workspaceId, workspace, migrationName } = await initializeMigration(
    workspaceIdStr,
    'LLM Advanced Boolean Evaluations',
  ).then((r) => r.unwrap())
  const stats = createMigrationStats()

  const evals = await getEvaluations({
    workspaceId,
    evaluationMetadata: evaluationMetadataLlmAsJudgeAdvanced,
    evaluationConfiguration: evaluationConfigurationBoolean,
    evaluationResultableType: EvaluationResultableType.Boolean,
    evaluationMetadataType: EvaluationMetadataType.LlmAsJudgeAdvanced,
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

    const { config } = await scan({ prompt: evval.metadata.prompt })
    if (!config.model || !config.provider) {
      logMigrationError(
        migrationName,
        `Failed to get model and provider from prompt: ${evval.metadata.prompt}`,
      )
      stats.errorCount++
      continue
    }

    const prompt = `${evval.metadata.prompt}

/* This step has been added to adapt this evaluation to the new evaluation's
* result schema. Feel free to change the prompt below considering the result
* should be a value between 0 and 100.
*/

<step schema={{{type:"object",properties:{score:{type:"number",minimum:0,maximum:100},reason:{type:"string"}},required:["score","reason"],additionalProperties:false,$schema:"https://json-schema.org/draft/2019-09/schema#"}}}>
The result schema has been changed to be a value between 0 and 100. Taking into
account the instructions from previous messages, if the result is falsy return
  a 0 and if the result is truthy return a 100. 
</step>`

    await Transaction.call(async (trx) => {
      try {
        let evalv2 = (await findExistingEvaluationV2(
          {
            name: evval.name,
            workspace,
            document,
            commit,
            metric: LlmEvaluationMetric.Custom,
            evaluationType: EvaluationType.Llm,
          },
          trx,
        )) as
          | EvaluationV2<EvaluationType.Llm, LlmEvaluationMetric.Custom>
          | undefined

        const result = evalv2
          ? Result.ok({ evaluation: evalv2 })
          : await createEvaluationV2({
              workspace,
              document,
              commit,
              settings: {
                name: evval.name,
                description: evval.description,
                type: EvaluationType.Llm,
                metric: LlmEvaluationMetric.Custom,
                configuration: {
                  model: config.model as string,
                  provider: config.provider as string,
                  prompt,
                  reverseScale: false,
                },
              },
            })

        if (result.error) {
          logMigrationError(
            migrationName,
            `Failed to create evaluation:`,
            result.error,
          )
          stats.errorCount++

          return result
        }

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
