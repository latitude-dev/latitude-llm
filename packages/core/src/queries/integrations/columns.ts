import { getTableColumns } from 'drizzle-orm'

import { integrations } from '../../schema/models/integrations'

export const tt = getTableColumns(integrations)
