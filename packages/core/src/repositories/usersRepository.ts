import { Result } from '$core/lib'
import { memberships, users } from '$core/schema'
import { and, eq, getTableColumns } from 'drizzle-orm'

import Repository from './repository'

export class UsersRepository extends Repository {
  get scope() {
    return this.db
      .select(getTableColumns(users))
      .from(users)
      .innerJoin(
        memberships,
        and(
          eq(memberships.userId, users.id),
          eq(memberships.workspaceId, this.workspaceId),
        ),
      )
      .as('usersScope')
  }

  async findAll() {
    const result = await this.db.select().from(this.scope)
    return Result.ok(result)
  }
}
