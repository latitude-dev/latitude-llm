import { getTableColumns } from 'drizzle-orm'

import { spans } from '../../schema/models/spans'

export const tt = getTableColumns(spans)
