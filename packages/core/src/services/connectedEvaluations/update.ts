import { eq } from 'drizzle-orm'

import { ConnectedEvaluation } from '../../browser'
import { database } from '../../client'
import { Result } from '../../lib/Result'
import Transaction from './../../lib/Transaction'
import { connectedEvaluations } from '../../schema'
type UpdateData = {
  live: boolean
}

export async function updateConnectedEvaluation(
  {
    connectedEvaluation,
    data,
  }: {
    connectedEvaluation: ConnectedEvaluation
    data: UpdateData
  },
  db = database,
) {
  return Transaction.call(async (tx) => {
    const result = await tx
      .update(connectedEvaluations)
      .set({
        ...data,
      })
      .where(eq(connectedEvaluations.id, connectedEvaluation.id))
      .returning()

    const updatedEvaluation = result[0]
    if (!updatedEvaluation) {
      return Result.error(new Error('Connected evaluation not found'))
    }

    return Result.ok(updatedEvaluation)
  }, db)
}
