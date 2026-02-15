import { getTableColumns } from 'drizzle-orm'

import { issues } from '../../schema/models/issues'

export const tt = getTableColumns(issues)
