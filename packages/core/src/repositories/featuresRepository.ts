import { asc, eq, getTableColumns } from 'drizzle-orm'

import { Result } from '../lib/Result'
import { NotFoundError } from '../lib/errors'
import { features } from '../schema'
import { database } from '../client'

const tt = getTableColumns(features)

export class FeaturesRepository {
  constructor(private db = database) {}

  get scope() {
    return this.db.select(tt).from(features).as('featuresScope')
  }

  async findAll() {
    const result = await this.db
      .select()
      .from(this.scope)
      .orderBy(asc(this.scope.name))

    return Result.ok(result)
  }

  async find(id: number) {
    const result = await this.db
      .select()
      .from(this.scope)
      .where(eq(this.scope.id, id))
      .limit(1)

    if (!result.length) {
      return Result.error(new NotFoundError('Feature not found'))
    }

    return Result.ok(result[0]!)
  }

  async findByName(name: string) {
    const result = await this.db
      .select()
      .from(this.scope)
      .where(eq(this.scope.name, name))
      .limit(1)

    if (!result.length) {
      return Result.error(new NotFoundError('Feature not found'))
    }

    return Result.ok(result[0]!)
  }
}
