import { getTableColumns } from 'drizzle-orm'

import { providerApiKeys } from '../../schema/models/providerApiKeys'

export const tt = getTableColumns(providerApiKeys)
