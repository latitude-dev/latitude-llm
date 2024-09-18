import { and, eq, getTableColumns } from 'drizzle-orm'

import { User } from '../browser'
import { database } from '../client'
import { memberships, users } from '../schema'
import Repository from './repository'

const tt = {
  ...getTableColumns(users),
  confirmedAt: memberships.confirmedAt,
}

export class UsersRepository extends Repository<typeof tt, User> {
  static async findByEmail(email: string) {
    return database.query.users.findFirst({
      columns: {
        id: true,
        email: true,
      },
      where: eq(users.email, email),
    })
  }

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
}
