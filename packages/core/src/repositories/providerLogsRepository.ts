import { Result } from '$core/lib'
import { providerApiKeys, providerLogs, workspaces } from '$core/schema'
import { asc, eq, getTableColumns, inArray } from 'drizzle-orm'

import Repository from './repository'

export class ProviderLogsRepository extends Repository {
  get scope() {
    return this.db
      .select(getTableColumns(providerLogs))
      .from(providerLogs)
      .innerJoin(
        providerApiKeys,
        eq(providerApiKeys.id, providerLogs.providerId),
      )
      .innerJoin(workspaces, eq(workspaces.id, providerApiKeys.workspaceId))
      .as('providerLogsScope')
  }

  async findByUuids(uuids: string[]) {
    const result = await this.db
      .select()
      .from(this.scope)
      .where(inArray(this.scope.uuid, uuids))
    return Result.ok(result)
  }

  async findByDocumentLogId(documentLogId: number) {
    const result = await this.db
      .select()
      .from(this.scope)
      .where(eq(this.scope.documentLogId, documentLogId))
      .orderBy(asc(this.scope.createdAt))
    return Result.ok(result)
  }
}
