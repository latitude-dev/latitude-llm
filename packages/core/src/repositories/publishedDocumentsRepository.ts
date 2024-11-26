import { eq } from 'drizzle-orm'

import { PublishedDocument } from '../browser'
import { NotFoundError, Result } from '../lib'
import { publishedDocuments } from '../schema'
import Repository from './repositoryV2'

export class PublishedDocumentRepository extends Repository<PublishedDocument> {
  get scope() {
    return this.db
      .select()
      .from(publishedDocuments)
      .where(eq(publishedDocuments.workspaceId, this.workspaceId))
      .$dynamic()
  }

  async findByUuid(uuid: string) {
    const results = await this.scope
      .where(eq(publishedDocuments.uuid, uuid))
      .limit(1)

    if (results.length === 0) {
      return Result.error(new NotFoundError('Published document not found'))
    }

    return Result.ok(results[0]!)
  }

  async findByDocumentUuid(documentUuid: string) {
    const results = await this.scope
      .where(eq(publishedDocuments.documentUuid, documentUuid))
      .limit(1)

    return results[0]
  }

  async findByProject(projectId: number) {
    return this.scope.where(eq(publishedDocuments.projectId, projectId))
  }
}
