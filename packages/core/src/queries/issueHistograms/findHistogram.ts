import { and, eq } from 'drizzle-orm'
import { format } from 'date-fns'

import { issueHistograms } from '../../schema/models/issueHistograms'
import { type Commit } from '../../schema/models/types/Commit'
import { type Issue } from '../../schema/models/types/Issue'
import { IssueHistogram } from '../../schema/models/types/IssueHistogram'
import { scopedQuery } from '../scope'
import { tenancyFilter } from './filters'

export const findHistogram = scopedQuery(async function findHistogram(
  {
    workspaceId,
    commit,
    issue,
    date,
  }: {
    workspaceId: number
    commit: Commit
    issue: Issue
    date: Date
  },
  db,
): Promise<IssueHistogram | null> {
  const result = await db
    .select()
    .from(issueHistograms)
    .where(
      and(
        tenancyFilter(workspaceId),
        eq(issueHistograms.commitId, commit.id),
        eq(issueHistograms.issueId, issue.id),
        eq(issueHistograms.date, format(date, 'yyyy-MM-dd')),
      ),
    )
    .limit(1)

  return (result[0] as IssueHistogram) || null
})
