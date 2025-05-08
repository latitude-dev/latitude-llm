import { and, count, desc, eq, not, notInArray } from 'drizzle-orm'
import { database } from '../client'
import { evaluationResults, evaluations, workspaces } from '../schema'
import { migrateLlmAdvancedBooleanEvaluations } from './migrate_llm_advanced_boolean_evaluations'
import { migrateLlmAdvancedNumberEvaluations } from './migrate_llm_advanced_number_evaluations'
import { migrateLlmSimpleBooleanEvaluations } from './migrate_llm_simple_boolean_evaluations'
import { migrateLlmSimpleNumberEvaluations } from './migrate_llm_simple_number_evaluations'
import { migrateManualBooleanEvaluations } from './migrate_manual_boolean_evaluations'
import { migrateManualNumberEvaluations } from './migrate_manual_number_evaluations'

export async function migrateEvaluationsToV2() {
  const evalCount = count(evaluationResults.id)
  const workspaceIds = await database
    .select({ evalCount, id: workspaces.id })
    .from(evaluationResults)
    .innerJoin(evaluations, eq(evaluationResults.evaluationId, evaluations.id))
    .innerJoin(workspaces, eq(evaluations.workspaceId, workspaces.id))
    .where(
      and(
        notInArray(workspaces.id, [10343, 8769, 12704, 1, 58, 10168]), // already migrated!
        not(eq(workspaces.name, 'wwwwwwwgnnnnammmmme ff')),
      ),
    )
    .groupBy(workspaces.id)
    .orderBy(desc(evalCount))
    .execute()

  let migratedCount = 0
  const totalWorkspaces = workspaceIds.length
  console.log('\n************************************************************')
  console.log(`Found ${totalWorkspaces} workspaces to migrate.`)
  console.log('\n************************************************************')

  for (const workspace of workspaceIds) {
    const workspaceId = workspace.id

    if (isNaN(workspaceId)) {
      console.error(
        `Invalid workspaceId provided: ${workspaceId}. It must be a number.`,
      )
      return
    }

    console.log('Migrating llm advanced boolean evaluations to v2...')
    await migrateLlmAdvancedBooleanEvaluations(String(workspaceId))

    console.log('Migrating llm advanced number evaluations to v2...')
    await migrateLlmAdvancedNumberEvaluations(String(workspaceId))

    console.log('Migrating llm simple boolean evaluations to v2...')
    await migrateLlmSimpleBooleanEvaluations(String(workspaceId))

    console.log('Migrating llm simple number evaluations to v2...')
    await migrateLlmSimpleNumberEvaluations(String(workspaceId))

    console.log('Migrating manual boolean evaluations to v2...')
    await migrateManualBooleanEvaluations(String(workspaceId))

    console.log('Migrating manual number evaluations to v2...')
    await migrateManualNumberEvaluations(String(workspaceId))

    migratedCount++
    console.log(
      '\n************************************************************',
    )
    console.log(
      `   Migrated ${workspaceId} (${migratedCount}/${totalWorkspaces})`,
    )
    console.log(
      '************************************************************\n',
    )
  }
}
