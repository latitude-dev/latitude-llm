import { EvaluationResultV2 } from '@latitude-data/constants'
import { and, desc, eq, isNull } from 'drizzle-orm'

import { issueEvaluationResults } from '../../schema/models/issueEvaluationResults'
import { issues } from '../../schema/models/issues'
import { IssueEvaluationResult } from '../../schema/models/types/IssueEvaluationResult'
import { scopedQuery } from '../scope'
import { tt } from './columns'
import { tenancyFilter } from './filters'

export const findLastActiveAssignedIssue = scopedQuery(
  async function findLastActiveAssignedIssue(
    {
      workspaceId,
      resultId,
    }: {
      workspaceId: number
      resultId: Pick<EvaluationResultV2, 'id'>['id']
    },
    db,
  ): Promise<IssueEvaluationResult | undefined> {
    const result = await db
      .select(tt)
      .from(issueEvaluationResults)
      .innerJoin(issues, eq(issueEvaluationResults.issueId, issues.id))
      .where(
        and(
          tenancyFilter(workspaceId),
          eq(issueEvaluationResults.evaluationResultId, resultId),
          eq(isNull(issues.mergedAt), true),
        ),
      )
      .orderBy(desc(issueEvaluationResults.createdAt))
      .limit(1)

    return result[0] as IssueEvaluationResult | undefined
  },
)
