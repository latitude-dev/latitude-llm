import { eq, getTableColumns } from 'drizzle-orm'

import { NotFoundError, Result } from '../lib'
import { evaluations } from '../schema'
import Repository from './repository'

const tt = getTableColumns(evaluations)

export class EvaluationsRepository extends Repository<typeof tt> {
  get scope() {
    return this.db
      .select(tt)
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

  async findByName(name: string) {
    const result = await this.db
      .select()
      .from(this.scope)
      .where(eq(this.scope.name, name))

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
