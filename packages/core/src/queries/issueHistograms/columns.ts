import { getTableColumns } from 'drizzle-orm'

import { issueHistograms } from '../../schema/models/issueHistograms'

export const tt = getTableColumns(issueHistograms)
