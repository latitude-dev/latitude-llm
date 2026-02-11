import { getTableColumns } from 'drizzle-orm'

import { memberships } from '../../schema/models/memberships'
import { users } from '../../schema/models/users'

export const tt = {
  ...getTableColumns(users),
  confirmedAt: memberships.confirmedAt,
}
