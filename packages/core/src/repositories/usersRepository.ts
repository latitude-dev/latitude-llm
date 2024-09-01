import { and, eq, getTableColumns } from 'drizzle-orm'

import { NotFoundError, Result } from '../lib'
import { memberships, users } from '../schema'
import Repository from './repository'

const tt = {
  ...getTableColumns(users),
  confirmedAt: memberships.confirmedAt,
}

export class UsersRepository extends Repository<typeof tt> {
  get scope() {
    return this.db
      .select(tt)
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

  async find(id: string) {
    const result = await this.db
      .select()
      .from(this.scope)
      .where(eq(this.scope.id, id))
    if (!result.length) return Result.error(new NotFoundError('User not found'))

    return Result.ok(result[0]!)
  }
}
