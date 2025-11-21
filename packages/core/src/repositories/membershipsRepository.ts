import { eq, getTableColumns } from 'drizzle-orm'
import { type Membership } from '../schema/models/types/Membership'
import { NotFoundError } from '../lib/errors'
import { Result } from '../lib/Result'
import { memberships } from '../schema/models/memberships'
import RepositoryLegacy from './repository'

const tt = getTableColumns(memberships)

export class MembershipsRepository extends RepositoryLegacy<
  typeof tt,
  Membership
> {
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
