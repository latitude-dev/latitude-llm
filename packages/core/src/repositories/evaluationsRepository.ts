import { eq } from 'drizzle-orm'

import { NotFoundError, Result } from '../lib'
import { evaluations } from '../schema'
import Repository from './repository'

export class EvaluationsRepository extends Repository {
  get scope() {
    return this.db
      .select()
      .from(evaluations)
      .where(eq(evaluations.workspaceId, this.workspaceId))
      .as('evaluationsScope')
  }

  async find(id: number) {
    const result = await this.db
      .select()
      .from(this.scope)
      .where(eq(this.scope.id, id))
    if (!result.length) {
      return Result.error(new NotFoundError('Evaluation not found'))
    }

    return Result.ok(result[0]!)
  }

  async findAll() {
    const result = await this.db.select().from(this.scope)
    return Result.ok(result)
  }
}
