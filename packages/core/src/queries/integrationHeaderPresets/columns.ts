import { getTableColumns } from 'drizzle-orm'

import { integrationHeaderPresets } from '../../schema/models/integrationHeaderPresets'

export const tt = getTableColumns(integrationHeaderPresets)
