import { and, asc, desc, eq, getTableColumns, inArray, sum } from 'drizzle-orm'

import { ProviderLog } from '../browser'
import { NotFoundError } from '../lib/errors'
import { Result } from '../lib/Result'
import { documentLogs, providerLogs } from '../schema'
import { QueryOptions } from './repository'
import Repository from './repositoryV2'

const tt = getTableColumns(providerLogs)

export class ProviderLogsRepository extends Repository<ProviderLog> {
  get scopeFilter() {
    return eq(providerLogs.workspaceId, this.workspaceId)
  }

  get scope() {
    return this.db
      .select(tt)
      .from(providerLogs)
      .where(this.scopeFilter)
      .$dynamic()
  }

  async findByUuid(uuid: string) {
    const result = await this.scope
      .where(and(this.scopeFilter, eq(providerLogs.uuid, uuid)))
      .limit(1)

    if (!result.length) {
      return Result.error(
        new NotFoundError(`ProviderLog with uuid ${uuid} not found`),
      )
    }

    return Result.ok(result[0]!)
  }

  async findByDocumentUuid(documentUuid: string, opts: QueryOptions = {}) {
    const query = this.scope
      .innerJoin(
        documentLogs,
        eq(providerLogs.documentLogUuid, documentLogs.uuid),
      )
      .where(and(this.scopeFilter, eq(documentLogs.documentUuid, documentUuid)))
      .orderBy(asc(providerLogs.generatedAt))

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

    const result = await this.scope
      .where(
        and(
          this.scopeFilter,
          eq(providerLogs.documentLogUuid, documentLogUuid),
        ),
      )
      .orderBy(desc(providerLogs.generatedAt))
      .limit(1)

    if (!result.length) {
      return Result.error(new NotFoundError('ProviderLog not found'))
    }

    return Result.ok(result[0]!)
  }

  async findManyByDocumentLogUuid(documentLogUuids: string[]) {
    return await this.scope
      .where(
        and(
          this.scopeFilter,
          inArray(providerLogs.documentLogUuid, documentLogUuids),
        ),
      )
      .orderBy(desc(providerLogs.generatedAt))
  }

  async findByDocumentLogUuid(
    documentLogUuid: string,
    opts: QueryOptions = {},
  ) {
    const query = this.scope
      .where(
        and(
          this.scopeFilter,
          eq(providerLogs.documentLogUuid, documentLogUuid),
        ),
      )
      .orderBy(asc(providerLogs.generatedAt))

    if (opts.limit !== undefined) {
      query.limit(opts.limit)
    }
    if (opts.offset !== undefined) {
      query.offset(opts.offset)
    }

    const result = await query

    return Result.ok(result)
  }

  async statsByDocumentLogUuid(documentLogUuid: string) {
    const stats = await this.db
      .select({
        documentLogUuid: providerLogs.documentLogUuid,
        tokens: sum(providerLogs.tokens).mapWith(Number),
        duration: sum(providerLogs.duration).mapWith(Number),
        costInMillicents: sum(providerLogs.costInMillicents).mapWith(Number),
      })
      .from(providerLogs)
      .where(
        and(
          this.scopeFilter,
          eq(providerLogs.documentLogUuid, documentLogUuid),
        ),
      )
      .groupBy(providerLogs.documentLogUuid)
      .then((r) => r[0])

    return Result.ok({
      documentLogUuid: stats?.documentLogUuid ?? documentLogUuid,
      tokens: stats?.tokens ?? 0,
      duration: stats?.duration ?? 0,
      costInMillicents: stats?.costInMillicents ?? 0,
    })
  }
}
