import { eq, getTableColumns } from 'drizzle-orm'

import { NotFoundError, Result } from '../lib'
import { memberships } from '../schema'
import Repository from './repository'

const tt = getTableColumns(memberships)

export class MembershipsRepository extends Repository<typeof tt> {
  get scope() {
    return this.db
      .select()
      .from(memberships)
      .where(eq(memberships.workspaceId, this.workspaceId))
      .as('membershipsScope')
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
