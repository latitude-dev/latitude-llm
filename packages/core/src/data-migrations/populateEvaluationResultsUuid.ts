import { eq, isNull } from 'drizzle-orm'

import { database } from '../client'
import { generateUUIDIdentifier } from '../lib'
import { evaluationResults } from '../schema'

export async function runDataMigration() {
  const evalResults = await database
    .select()
    .from(evaluationResults)
    .where(isNull(evaluationResults.uuid))

  if (!evalResults.length) {
    console.error('0 evaluation results found to update')
    return
  }

  console.log(`Found ${evalResults.length} evaluation results to update`)

  for (const evalResult of evalResults) {
    console.log('.')
    await database
      .update(evaluationResults)
      .set({
        uuid: generateUUIDIdentifier(),
      })
      .where(eq(evaluationResults.id, evalResult.id))
  }

  console.log('Data migration complete!')
}
