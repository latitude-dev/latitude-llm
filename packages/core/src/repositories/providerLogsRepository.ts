import { and, asc, desc, eq, getTableColumns, inArray, sum } from 'drizzle-orm'

import {
  HydratedProviderLog,
  ProviderLog,
  ProviderLogFileData,
} from '../browser'
import { diskFactory } from '../lib/disk'
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

  async hydrateProviderLog(providerLog: ProviderLog) {
    if (!providerLog.fileKey) {
      // Fallback to existing columns for backwards compatibility
      return Result.ok({
        ...providerLog,
        config: providerLog.config,
        messages: providerLog.messages,
        output: providerLog.output,
        responseObject: providerLog.responseObject,
        responseText: providerLog.responseText,
        responseReasoning: providerLog.responseReasoning,
        toolCalls: providerLog.toolCalls,
      } as HydratedProviderLog)
    }

    try {
      const disk = diskFactory('private')
      const fileContent = await disk.get(providerLog.fileKey)
      const fileData: ProviderLogFileData = JSON.parse(fileContent)

      return Result.ok({
        ...providerLog,
        ...fileData,
      } as HydratedProviderLog)
    } catch (error) {
      // Fallback to existing columns if file storage fails
      return Result.ok({
        ...providerLog,
        config: providerLog.config,
        messages: providerLog.messages,
        output: providerLog.output,
        responseObject: providerLog.responseObject,
        responseText: providerLog.responseText,
        responseReasoning: providerLog.responseReasoning,
        toolCalls: providerLog.toolCalls,
      } as HydratedProviderLog)
    }
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

  async findHydratedByUuid(uuid: string) {
    const result = await this.findByUuid(uuid)
    if (result.error) {
      return result
    }

    return this.hydrateProviderLog(result.unwrap())
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

  async findLastHydratedByDocumentLogUuid(documentLogUuid: string | undefined) {
    const result = await this.findLastByDocumentLogUuid(documentLogUuid)
    if (result.error) {
      return result
    }

    return this.hydrateProviderLog(result.unwrap())
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
