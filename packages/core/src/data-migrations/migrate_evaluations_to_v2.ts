import { migrateLlmAdvancedBooleanEvaluations } from './migrate_llm_advanced_boolean_evaluations'
import { migrateLlmAdvancedNumberEvaluations } from './migrate_llm_advanced_number_evaluations'
import { migrateLlmSimpleBooleanEvaluations } from './migrate_llm_simple_boolean_evaluations'
import { migrateLlmSimpleNumberEvaluations } from './migrate_llm_simple_number_evaluations'
import { migrateManualBooleanEvaluations } from './migrate_manual_boolean_evaluations'
import { migrateManualNumberEvaluations } from './migrate_manual_number_evaluations'

export async function migrateEvaluationsToV2(workspaceIdStr: string) {
  const workspaceId = parseInt(workspaceIdStr, 10)
  if (isNaN(workspaceId)) {
    console.error(
      `Invalid workspaceId provided: ${workspaceIdStr}. It must be a number.`,
    )
    return
  }

  console.log('Migrating llm advanced boolean evaluations to v2...')
  await migrateLlmAdvancedBooleanEvaluations(workspaceIdStr)

  console.log('Migrating llm advanced number evaluations to v2...')
  await migrateLlmAdvancedNumberEvaluations(workspaceIdStr)

  console.log('Migrating llm simple boolean evaluations to v2...')
  await migrateLlmSimpleBooleanEvaluations(workspaceIdStr)

  console.log('Migrating llm simple number evaluations to v2...')
  await migrateLlmSimpleNumberEvaluations(workspaceIdStr)

  console.log('Migrating manual boolean evaluations to v2...')
  await migrateManualBooleanEvaluations(workspaceIdStr)

  console.log('Migrating manual number evaluations to v2...')
  await migrateManualNumberEvaluations(workspaceIdStr)
}
