import { asc, desc, eq, getTableColumns } from 'drizzle-orm'

import { NotFoundError, Result } from '../lib'
import {
  documentLogs,
  providerApiKeys,
  providerLogs,
  workspaces,
} from '../schema'
import Repository, { QueryOptions } from './repository'

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

  async findByUuid(uuid: string) {
    const result = await this.db
      .select()
      .from(this.scope)
      .where(eq(this.scope.uuid, uuid))
      .limit(1)

    if (!result.length) {
      return Result.error(new NotFoundError('ProviderLog not found'))
    }

    return Result.ok(result[0]!)
  }

  async findByDocumentUuid(documentUuid: string, opts: QueryOptions = {}) {
    const query = this.db
      .select(this.scope._.selectedFields)
      .from(this.scope)
      .innerJoin(
        documentLogs,
        eq(documentLogs.uuid, this.scope.documentLogUuid),
      )
      .where(eq(documentLogs.documentUuid, documentUuid))
      .orderBy(asc(this.scope.generatedAt))

    if (opts.limit !== undefined) {
      query.limit(opts.limit)
    }
    if (opts.offset !== undefined) {
      query.offset(opts.offset)
    }

    const result = await query

    return Result.ok(result)
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

    return Result.ok(result[0]!)
  }

  async findByDocumentLogUuid(
    documentLogUuid: string,
    opts: QueryOptions = {},
  ) {
    const query = this.db
      .select()
      .from(this.scope)
      .where(eq(this.scope.documentLogUuid, documentLogUuid))
      .orderBy(asc(this.scope.generatedAt))

    if (opts.limit !== undefined) {
      query.limit(opts.limit)
    }
    if (opts.offset !== undefined) {
      query.offset(opts.offset)
    }

    const result = await query

    return Result.ok(result)
  }
}
