import { Result } from '$core/lib'
import { providerApiKeys, providerLogs, workspaces } from '$core/schema'
import { asc, eq, getTableColumns } from 'drizzle-orm'

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

  async findByDocumentLogUuid(documentLogUuid: string) {
    const result = await this.db
      .select()
      .from(this.scope)
      .where(eq(this.scope.documentLogUuid, documentLogUuid))
      .orderBy(asc(this.scope.createdAt))
    return Result.ok(result)
  }
}
