import { eq } from 'drizzle-orm'
import * as pkg from 'pg'

import { Evaluation } from '../../browser'
import { database } from '../../client'
import {
  BadRequestError,
  databaseErrorCodes,
  Result,
  Transaction,
} from '../../lib'
import { evaluations } from '../../schema'

export function destroyEvaluation(
  { evaluation }: { evaluation: Evaluation },
  db = database,
) {
  return Transaction.call(async (tx) => {
    try {
      const result = await tx
        .delete(evaluations)
        .where(eq(evaluations.id, evaluation.id))
        .returning()
      const deleted = result[0]

      return Result.ok(deleted)
    } catch (error) {
      if (
        error instanceof pkg.DatabaseError &&
        error.code === databaseErrorCodes.foreignKeyViolation
      ) {
        throw new BadRequestError(
          'Cannot delete evaluation because it is still used in at least one project',
        )
      }

      throw error
    }
  }, db)
}
