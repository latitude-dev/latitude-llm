import { and, eq, getTableColumns } from 'drizzle-orm'

import { NotFoundError, Result } from '../lib'
import { publishedDocuments } from '../schema'
import Repository from './repositoryV2'
import { PublishedDocument } from '../browser'

const tt = getTableColumns(publishedDocuments)

export class PublishedDocumentRepository extends Repository<PublishedDocument> {
  get scopeFilter() {
    return eq(publishedDocuments.workspaceId, this.workspaceId)
  }

  get scope() {
    return this.db
      .select(tt)
      .from(publishedDocuments)
      .where(this.scopeFilter)
      .$dynamic()
  }

  async findByUuid(uuid: string) {
    const results = await this.scope
      .where(and(this.scopeFilter, eq(publishedDocuments.uuid, uuid)))
      .limit(1)

    if (results.length === 0) {
      return Result.error(new NotFoundError('Published document not found'))
    }

    return Result.ok(results[0]!)
  }

  async findByDocumentUuid(documentUuid: string) {
    const results = await this.scope
      .where(
        and(
          this.scopeFilter,
          eq(publishedDocuments.documentUuid, documentUuid),
        ),
      )
      .limit(1)

    return results[0]
  }

  async findByProject(projectId: number) {
    return this.scope.where(
      and(this.scopeFilter, eq(publishedDocuments.projectId, projectId)),
    )
  }
}
