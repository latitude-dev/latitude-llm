import { getTableColumns } from 'drizzle-orm'

import { memberships } from '../../schema/models/memberships'

export const tt = getTableColumns(memberships)
