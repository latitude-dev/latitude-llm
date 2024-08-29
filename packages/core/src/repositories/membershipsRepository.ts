import { eq } from 'drizzle-orm'

import { NotFoundError, Result } from '../lib'
import { memberships } from '../schema'
import Repository from './repository'

export class MembershipsRepository extends Repository {
  get scope() {
    return this.db
      .select()
      .from(memberships)
      .where(eq(memberships.workspaceId, this.workspaceId))
      .as('membershipsScope')
  }

  async findAll() {
    const result = await this.db.select().from(this.scope)
    return Result.ok(result)
  }

  async find(id: number) {
    const result = await this.db
      .select()
      .from(this.scope)
      .where(eq(this.scope.id, id))
    if (result.length === 0) {
      return Result.error(new NotFoundError('Membership not found'))
    }

    return Result.ok(result[0]!)
  }

  async findByUserId(userId: string) {
    const result = await this.db
      .select()
      .from(this.scope)
      .where(eq(this.scope.userId, userId))
    if (result.length === 0) {
      return Result.error(new NotFoundError('Membership not found'))
    }

    return Result.ok(result[0]!)
  }
}
