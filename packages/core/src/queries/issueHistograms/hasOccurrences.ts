import { and, eq, sql } from 'drizzle-orm'

import { issueHistograms } from '../../schema/models/issueHistograms'
import { scopedQuery } from '../scope'
import { tenancyFilter } from './filters'

export const hasOccurrences = scopedQuery(async function hasOccurrences(
  {
    workspaceId,
    issueId,
  }: {
    workspaceId: number
    issueId: number
  },
  db,
): Promise<boolean> {
  const result = await db
    .select({ exists: sql<boolean>`TRUE` })
    .from(issueHistograms)
    .where(
      and(tenancyFilter(workspaceId), eq(issueHistograms.issueId, issueId)),
    )
    .limit(1)
    .then((r) => r[0])

  return !!result?.exists
})
