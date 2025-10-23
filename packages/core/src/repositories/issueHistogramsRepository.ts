import { and, eq, getTableColumns, inArray } from 'drizzle-orm'
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

  async getHistogramsAtCommit({
    commitUuid,
    projectId,
  }: {
    commitUuid: string
    projectId?: number
  }) {
    const commitResult = await this.getCommit({ commitUuid, projectId })
    if (commitResult.error) return commitResult

    const commit = commitResult.unwrap()
    const commits = await this.getCommits({ commit })
    const commitIds = commits.map((c) => c.id)

    return Result.ok(
      this.db
        .select()
        .from(issueHistograms)
        .where(
          and(
            eq(issueHistograms.workspaceId, this.workspaceId),
            eq(projects.id, commit.projectId),
            inArray(issueHistograms.commitId, commitIds),
          ),
        ),
    )
  }

  private async getCommits({ commit }: { commit: Commit }) {
    const repo = new CommitsRepository(this.workspaceId, this.db)
    return repo.getCommitsHistory({ commit })
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
