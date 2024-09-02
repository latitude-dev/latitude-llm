import { asc, desc, eq, getTableColumns } from 'drizzle-orm'

import { ProviderLog } from '../browser'
import { NotFoundError, Result } from '../lib'
import { providerApiKeys, providerLogs, workspaces } from '../schema'
import Repository from './repository'

const tt = getTableColumns(providerLogs)

export class ProviderLogsRepository extends Repository<typeof tt> {
  get scope() {
    return this.db
      .select(tt)
      .from(providerLogs)
      .innerJoin(
        providerApiKeys,
        eq(providerApiKeys.id, providerLogs.providerId),
      )
      .innerJoin(workspaces, eq(workspaces.id, providerApiKeys.workspaceId))
      .as('providerLogsScope')
  }

  async findLastByDocumentLogUuid(documentLogUuid: string | undefined) {
    if (!documentLogUuid) {
      return Result.error(new NotFoundError('documentLogUuid is required'))
    }

    const result = await this.db
      .select()
      .from(this.scope)
      .where(eq(this.scope.documentLogUuid, documentLogUuid))
      .orderBy(desc(this.scope.generatedAt))
      .limit(1)

    if (!result.length) {
      return Result.error(new NotFoundError('ProviderLog not found'))
    }

    return Result.ok(result[0]! as ProviderLog)
  }

  async findByDocumentLogUuid(documentLogUuid: string) {
    const result = await this.db
      .select()
      .from(this.scope)
      .where(eq(this.scope.documentLogUuid, documentLogUuid))
      .orderBy(asc(this.scope.generatedAt))
    return Result.ok(result)
  }
}
