import { MINI_HISTOGRAM_STATS_DAYS } from '@latitude-data/constants/issues'
import { format, subDays } from 'date-fns'
import { and, eq, gte, inArray, SQL, sql } from 'drizzle-orm'

import { CommitsRepository } from '../../repositories/commitsRepository'
import { issueHistograms } from '../../schema/models/issueHistograms'
import { scopedQuery } from '../scope'
import { tenancyFilter } from './filters'
import { fillMissingDays } from './utils'

export const findHistogramForIssue = scopedQuery(
  async function findHistogramForIssue(
    {
      workspaceId,
      issueId,
      commitUuid,
      projectId,
      days,
    }: {
      workspaceId: number
      issueId: number
      commitUuid: string
      projectId: number
      days?: number
    },
    db,
  ) {
    const commitIds = await getCommitIds(
      { workspaceId, commitUuid, projectId },
      db,
    )

    const results = await fetchHistogramData(
      {
        workspaceId,
        issueIds: [issueId],
        commitIds,
        projectId,
        days,
      },
      db,
    )

    const dateCounts = results.map((r) => ({
      date: r.date,
      count: r.count,
    }))

    return fillMissingDays({ data: dateCounts, days })
  },
)

async function getCommitIds(
  {
    workspaceId,
    commitUuid,
    projectId,
  }: {
    workspaceId: number
    commitUuid: string
    projectId: number
  },
  db: Parameters<Parameters<typeof scopedQuery>[0]>[1],
) {
  const commitsRepo = new CommitsRepository(workspaceId, db)
  const commit = await commitsRepo
    .getCommitByUuid({
      projectId,
      uuid: commitUuid,
    })
    .then((r) => r.unwrap())

  const commits = await commitsRepo.getCommitsHistory({ commit })
  return commits.map((c: { id: number }) => c.id)
}

async function fetchHistogramData(
  {
    workspaceId,
    issueIds,
    commitIds,
    projectId,
    days = MINI_HISTOGRAM_STATS_DAYS,
  }: {
    workspaceId: number
    issueIds: number[]
    commitIds: number[]
    projectId: number
    days?: number
  },
  db: Parameters<Parameters<typeof scopedQuery>[0]>[1],
) {
  if (issueIds.length === 0) return []

  const startDate = subDays(new Date(), days)
  const formattedStartDate = format(startDate, 'yyyy-MM-dd')

  const whereConditions: SQL[] = [
    tenancyFilter(workspaceId),
    eq(issueHistograms.projectId, projectId),
    inArray(issueHistograms.issueId, issueIds),
    inArray(issueHistograms.commitId, commitIds),
    gte(issueHistograms.date, sql`${formattedStartDate}::date`),
  ]

  return db
    .select({
      issueId: issueHistograms.issueId,
      date: issueHistograms.date,
      count: sql<number>`COALESCE(SUM(${issueHistograms.count}), 0)`.as(
        'count',
      ),
    })
    .from(issueHistograms)
    .where(and(...whereConditions))
    .groupBy(issueHistograms.issueId, issueHistograms.date)
    .orderBy(issueHistograms.issueId, issueHistograms.date)
}
