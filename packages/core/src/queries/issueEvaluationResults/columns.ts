import { getTableColumns } from 'drizzle-orm'

import { issueEvaluationResults } from '../../schema/models/issueEvaluationResults'

export const tt = getTableColumns(issueEvaluationResults)
