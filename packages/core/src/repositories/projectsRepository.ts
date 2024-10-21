import {
  and,
  count,
  eq,
  getTableColumns,
  isNotNull,
  isNull,
  max,
  sql,
} from 'drizzle-orm'

import { Project } from '../browser'
import { NotFoundError, Result } from '../lib'
import { commits, documentVersions, projects } from '../schema'
import Repository from './repository'

const NOT_FOUND_MSG = 'Project not found'

const tt = getTableColumns(projects)

export class ProjectsRepository extends Repository<typeof tt, Project> {
  get scope() {
    return this.db
      .select(tt)
      .from(projects)
      .where(eq(projects.workspaceId, this.workspaceId))
      .as('projectsScope')
  }

  async getProjectById(id: number) {
    const result = await this.db
      .select()
      .from(this.scope)
      .where(eq(this.scope.id, id))
    const project = result[0]

    if (!project) {
      return Result.error(new NotFoundError(NOT_FOUND_MSG))
    }

    return Result.ok(project)
  }

  async getFirstProject() {
    const result = await this.db.select().from(this.scope).limit(1)
    const project = result[0]
    if (!project) return Result.error(new NotFoundError(NOT_FOUND_MSG))

    return Result.ok(project)
  }

  async findAllActive() {
    const result = await this.db
      .select()
      .from(this.scope)
      .where(isNull(this.scope.deletedAt))

    return Result.ok(result)
  }

  async findAllActiveDocumentsWithAgreggatedData() {
    const lastMergedCommit = this.db.$with('lastMergedCommit').as(
      this.db
        .select({
          projectId: commits.projectId,
          maxVersion: max(commits.version).as('maxVersion'),
        })
        .from(commits)
        .where(and(isNull(commits.deletedAt), isNotNull(commits.mergedAt)))
        .groupBy(commits.projectId),
    )
    const aggredatedData = this.db.$with('aggredatedData').as(
      this.db
        .with(lastMergedCommit)
        .select({
          id: this.scope.id,
          documentCount: count(documentVersions.id).as('documentCount'),
          lastCreatedAtDocument: max(documentVersions.createdAt).as(
            'lastCreatedAtDocument',
          ),
        })
        .from(this.scope)
        .innerJoin(commits, eq(commits.projectId, this.scope.id))
        .innerJoin(
          lastMergedCommit,
          and(
            eq(lastMergedCommit.projectId, this.scope.id),
            eq(commits.version, lastMergedCommit.maxVersion),
          ),
        )
        .innerJoin(documentVersions, eq(documentVersions.commitId, commits.id))
        .where(isNull(this.scope.deletedAt))
        .groupBy(this.scope.id),
    )

    const result = await this.db
      .with(aggredatedData)
      .select({
        ...this.scope._.selectedFields,
        documentCount:
          sql<number>`CAST(CASE WHEN ${aggredatedData.documentCount} IS NULL THEN 0 ELSE ${aggredatedData.documentCount} END AS INTEGER)`.as(
            'documentCount',
          ),
        lastCreatedAtDocument: aggredatedData.lastCreatedAtDocument,
      })
      .from(this.scope)
      .leftJoin(aggredatedData, eq(aggredatedData.id, this.scope.id))
      .where(isNull(this.scope.deletedAt))

    return Result.ok(result)
  }
}
