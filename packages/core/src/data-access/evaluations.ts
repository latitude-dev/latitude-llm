import { eq } from 'drizzle-orm'

import { Evaluation } from '../browser'
import { database } from '../client'
import { evaluations } from '../schema'

export async function unsafelyFindEvaluation(
  id: number,
  db = database,
): Promise<Evaluation | undefined> {
  return await db.query.evaluations.findFirst({
    where: eq(evaluations.id, id),
  })
}
