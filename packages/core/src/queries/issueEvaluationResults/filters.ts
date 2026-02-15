import { eq } from 'drizzle-orm'

import { issueEvaluationResults } from '../../schema/models/issueEvaluationResults'

export const tenancyFilter = (workspaceId: number) =>
  eq(issueEvaluationResults.workspaceId, workspaceId)
