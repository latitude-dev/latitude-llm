import { and, eq, getTableColumns, inArray, sql } from 'drizzle-orm'
import { type Issue } from '../schema/models/types/Issue'
import RepositoryLegacy from './repository'
import { issueHistograms } from '../schema/models/issueHistograms'
import { Commit } from '../schema/models/types/Commit'
import { projects } from '../schema/models/projects'
import { CommitsRepository } from './commitsRepository'
import { Result } from '../lib/Result'

const tt = getTableColumns(issueHistograms)

export class IssueHistogramsRepository extends RepositoryLegacy<
  typeof tt,
  Issue
> {
  get scope() {
    return this.db
      .select(tt)
      .from(issueHistograms)
      .where(eq(issueHistograms.workspaceId, this.workspaceId))
      .as('issuesHistogramsScope')
  }

  async getHistogramStatsForCommitsSubquery({
    commitUuid,
    projectId,
  }: {
    commitUuid: string
    projectId?: number
  }) {
    const commitResult = await this.getCommit({ commitUuid, projectId })
    if (commitResult.error) return commitResult

    const commit = commitResult.value
    const commitsResult = await this.getCommits({ commit })
    if (commitsResult.error) return commitsResult

    const commits = commitsResult.value
    const commitIds = commits.map((c) => c.id)

    const results = this.db
      .select({
        issueId: issueHistograms.issueId,
        last7DaysCount: sql<number>`
          COALESCE(SUM(
            CASE
              WHEN ${issueHistograms.date} >= CURRENT_DATE - INTERVAL '7 days'
              THEN ${issueHistograms.count}
              ELSE 0
            END
          ), 0)
        `.as('last7DaysCount'),
        lastSeenDate: sql<Date>`MAX(${issueHistograms.date})`.as(
          'lastSeenDate',
        ),
        escalatingCount: sql<number>`
          COALESCE(SUM(
            CASE
              WHEN ${issueHistograms.date} >= CURRENT_DATE - INTERVAL '2 days'
              THEN ${issueHistograms.count}
              ELSE 0
            END
          ), 0)
        `.as('escalatingCount'),
      })
      .from(issueHistograms)
      .where(
        and(
          eq(issueHistograms.workspaceId, this.workspaceId),
          inArray(issueHistograms.commitId, commitIds),
        ),
      )
      .groupBy(issueHistograms.issueId)
      .as('histogramStats')

    return Result.ok(results)
  }

  private async getCommits({ commit }: { commit: Commit }) {
    const repo = new CommitsRepository(this.workspaceId, this.db)
    const commits = await repo.getCommitsHistory({ commit })
    return Result.ok(commits)
  }

  private async getCommit({
    commitUuid,
    projectId,
  }: {
    commitUuid: string
    projectId?: number
  }) {
    const commitsScope = new CommitsRepository(this.workspaceId, this.db)
    const commitResult = await commitsScope.getCommitByUuid({
      projectId,
      uuid: commitUuid,
    })
    if (commitResult.error) return commitResult

    return Result.ok(commitResult.unwrap())
  }
}
