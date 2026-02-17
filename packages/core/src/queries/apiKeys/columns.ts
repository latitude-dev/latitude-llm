import { getTableColumns } from 'drizzle-orm'

import { apiKeys } from '../../schema/models/apiKeys'

export const tt = getTableColumns(apiKeys)
