import { Cache, cache as redis, withCacheLock } from '../cache'
import {
  ACTIVE_RUN_CACHE_TTL,
  ACTIVE_RUNS_CACHE_KEY,
  ActiveRun,
  CompletedRun,
  DEFAULT_PAGINATION_SIZE,
  DocumentLogWithMetadataAndError,
  LOG_SOURCES,
  LogSources,
  Run,
  RUN_CAPTION_SIZE,
  RunAnnotation,
} from '../constants'
import { database } from '../client'
import { findLastProviderLogFromDocumentLogUuid } from '../data-access/providerLogs'
import { buildConversation, formatMessage } from '../helpers'
import { NotFoundError } from '../lib/errors'
import { Result } from '../lib/Result'
import {
  computeDocumentLogsWithMetadata,
  computeDocumentLogsWithMetadataCountBySource,
} from '../services/documentLogs/computeDocumentLogsWithMetadata'
import { fetchDocumentLogWithMetadata } from '../services/documentLogs/fetchDocumentLogWithMetadata'
import { getEvaluationMetricSpecification } from '../services/evaluationsV2/specifications'
import serializeProviderLog from '../services/providerLogs/serialize'
import { and, count, eq, inArray, isNull } from 'drizzle-orm'
import { commits } from '../schema/models/commits'
import { documentLogs } from '../schema/models/documentLogs'
import { CommitsRepository } from './commitsRepository'
import { EvaluationResultsV2Repository } from './evaluationResultsV2Repository'

// TODO: abstract into separate write services. Repostiries are for tenancy checks.
export class RunsRepository {
  protected workspaceId: number
  protected projectId: number

  constructor(workspaceId: number, projectId: number) {
    this.workspaceId = workspaceId
    this.projectId = projectId
  }

  private async logToRun(log: DocumentLogWithMetadataAndError) {
    const endedAt = new Date(log.createdAt)
    const startedAt = new Date(endedAt.getTime() - (log.duration ?? 0))

    let caption = 'Run finished successfully without any response'
    if (log.error.code) {
      caption = log.error.message ?? 'An unknown error occurred while running the prompt' // prettier-ignore
    } else {
      const providerLog = await findLastProviderLogFromDocumentLogUuid(log.uuid)
      if (providerLog) {
        const conversation = buildConversation(serializeProviderLog(providerLog)) // prettier-ignore
        if (conversation.length > 0) caption = formatMessage(conversation.at(-1)!) // prettier-ignore
      }
    }
    caption = caption.trim().slice(0, RUN_CAPTION_SIZE)

    const repository = new EvaluationResultsV2Repository(this.workspaceId)
    const results = await repository
      .listByDocumentLogs({
        projectId: this.projectId,
        documentUuid: log.documentUuid,
        documentLogUuids: [log.uuid],
      })
      .then((r) => (r.value ?? {})[log.uuid] ?? [])
    const annotations = results.filter(
      ({ evaluation }) =>
        getEvaluationMetricSpecification(evaluation).supportsManualEvaluation,
    ) as RunAnnotation[]

    return {
      uuid: log.uuid,
      queuedAt: startedAt,
      startedAt,
      endedAt,
      caption,
      log,
      annotations,
      source: log.source ?? LogSources.API,
    }
  }

  private async listCached(cache?: Cache) {
    const key = ACTIVE_RUNS_CACHE_KEY(this.workspaceId, this.projectId)
    cache = cache ?? (await redis())

    try {
      const payload = (await cache.get(key)) || '{}'
      let active = JSON.parse(payload) as Record<string, ActiveRun>
      active = Object.fromEntries(
        Object.entries(active)
          .map(
            ([uuid, run]) =>
              [
                uuid,
                {
                  ...run,
                  queuedAt: new Date(run.queuedAt),
                  startedAt: run.startedAt
                    ? new Date(run.startedAt)
                    : undefined,
                },
              ] as const,
          )
          .filter(
            ([_, run]) =>
              run.queuedAt.getTime() > Date.now() - ACTIVE_RUN_CACHE_TTL,
          ),
      )

      return Result.ok<Record<string, ActiveRun>>(active)
    } catch (error) {
      return Result.error(error as Error)
    }
  }

  async get({ runUuid }: { runUuid: string }) {
    const getting = await getLogCatched({
      documentLogUuid: runUuid,
      workspaceId: this.workspaceId,
    })
    if (!getting.error) {
      return Result.ok<Run>(await this.logToRun(getting.value))
    }

    const listing = await this.listCached()
    if (!listing.error && runUuid in listing.value) {
      return Result.ok<Run>(listing.value[runUuid])
    }

    return Result.error(new NotFoundError(`Run not found with uuid ${runUuid}`))
  }

  async listActive({
    page = 1,
    pageSize = DEFAULT_PAGINATION_SIZE,
    sources,
  }: {
    page?: number
    pageSize?: number
    sources?: LogSources[]
  }) {
    const listing = await this.listCached()
    if (listing.error) return Result.error(listing.error)
    const active = listing.value

    let runs = Object.values(active)

    // Filter by sources if provided
    if (sources && sources.length > 0) {
      runs = runs.filter((run) => {
        const runSource = run.source ?? LogSources.API
        return sources.includes(runSource)
      })
    }

    runs = runs.sort(
      (a, b) =>
        (b.startedAt?.getTime() ?? 0) - (a.startedAt?.getTime() ?? 0) ||
        b.queuedAt.getTime() - a.queuedAt.getTime(),
    )
    runs = runs.slice((page - 1) * pageSize, page * pageSize)

    return Result.ok<ActiveRun[]>(runs)
  }

  async countActive() {
    const listing = await this.listCached()
    if (listing.error) return Result.error(listing.error)
    const active = listing.value

    const counts: Record<LogSources, number> = {} as Record<LogSources, number>
    for (const source of LOG_SOURCES) {
      counts[source] = 0
    }

    for (const run of Object.values(active)) {
      const source = run.source ?? LogSources.API
      counts[source] = (counts[source] ?? 0) + 1
    }

    return Result.ok<Record<LogSources, number>>(counts)
  }

  async countActiveBySource() {
    const listing = await this.listCached()
    if (listing.error) return Result.error(listing.error)
    const active = listing.value

    const countBySource: Record<LogSources, number> = LOG_SOURCES.reduce(
      (acc, source) => ({ ...acc, [source]: 0 }),
      {} as Record<LogSources, number>,
    )

    Object.values(active).forEach((run) => {
      const source = run.source ?? LogSources.API
      countBySource[source] = (countBySource[source] ?? 0) + 1
    })

    return Result.ok<Record<LogSources, number>>(countBySource)
  }

  async listCompleted({
    page = 1,
    pageSize = DEFAULT_PAGINATION_SIZE,
    sources,
  }: {
    page?: number
    pageSize?: number
    sources?: LogSources[]
  }) {
    const repository = new CommitsRepository(this.workspaceId)
    const filtering = await repository.filterByProject(this.projectId)
    if (filtering.error) return Result.error<Error>(filtering.error)
    const commitIds = filtering.value.map((r) => r.id)

    const logSources = sources && sources.length > 0 ? sources : LOG_SOURCES

    const listing = await listLogsCatched({
      projectId: this.projectId,
      workspaceId: this.workspaceId,
      page: page.toString(),
      pageSize: pageSize.toString(),
      filterOptions: { commitIds, logSources },
    })
    if (listing.error) return Result.error(listing.error)
    const logs = listing.value

    const runs = await Promise.all(logs.map((log) => this.logToRun(log)))

    return Result.ok<CompletedRun[]>(runs)
  }

  async countCompleted() {
    const repository = new CommitsRepository(this.workspaceId)
    const filtering = await repository.filterByProject(this.projectId)
    if (filtering.error) return Result.error<Error>(filtering.error)
    const commitIds = filtering.value.map((r) => r.id)

    const counts: Record<LogSources, number> = {} as Record<LogSources, number>
    for (const source of LOG_SOURCES) {
      counts[source] = 0
    }

    const countsBySource = await database
      .select({
        source: documentLogs.source,
        count: count(),
      })
      .from(documentLogs)
      .innerJoin(
        commits,
        and(isNull(commits.deletedAt), eq(commits.id, documentLogs.commitId)),
      )
      .where(
        and(
          eq(commits.projectId, this.projectId),
          eq(documentLogs.workspaceId, this.workspaceId),
          inArray(documentLogs.commitId, commitIds),
        ),
      )
      .groupBy(documentLogs.source)

    for (const row of countsBySource) {
      const source = (row.source ?? LogSources.API) as LogSources
      counts[source] = Number(row.count)
    }

    return Result.ok<Record<LogSources, number>>(counts)
  }

  async countCompletedBySource() {
    const repository = new CommitsRepository(this.workspaceId)
    const filtering = await repository.filterByProject(this.projectId)
    if (filtering.error) return Result.error<Error>(filtering.error)
    const commitIds = filtering.value.map((r) => r.id)

    const counting = await countLogsBySourceCatched({
      projectId: this.projectId,
      workspaceId: this.workspaceId,
      filterOptions: { commitIds, logSources: LOG_SOURCES },
    })
    if (counting.error) return Result.error(counting.error)
    const counts = counting.value

    const countBySource: Record<LogSources, number> = LOG_SOURCES.reduce(
      (acc, source) => ({ ...acc, [source]: 0 }),
      {} as Record<LogSources, number>,
    )

    counts.forEach(({ source, count }) => {
      if (source) {
        countBySource[source as LogSources] = count
      }
    })

    return Result.ok<Record<LogSources, number>>(countBySource)
  }

  async create({
    runUuid,
    queuedAt,
    source,
  }: {
    runUuid: string
    queuedAt: Date
    source: LogSources
  }) {
    const lockKey = ACTIVE_RUNS_CACHE_KEY(this.workspaceId, this.projectId)

    return withCacheLock({
      lockKey,
      callbackFn: async (cache) => {
        const listing = await this.listCached(cache)
        if (listing.error) return Result.error(listing.error)
        const active = listing.value

        active[runUuid] = { uuid: runUuid, queuedAt, source }

        await cache.set(lockKey, JSON.stringify(active))

        return Result.ok<ActiveRun>(active[runUuid])
      },
    })
  }

  async update({
    runUuid,
    startedAt,
    caption,
  }: {
    runUuid: string
    startedAt?: Date
    caption?: string
  }) {
    const lockKey = ACTIVE_RUNS_CACHE_KEY(this.workspaceId, this.projectId)

    return withCacheLock({
      lockKey,
      callbackFn: async (cache) => {
        const listing = await this.listCached(cache)
        if (listing.error) return Result.error(listing.error)
        const active = listing.value

        if (!(runUuid in active)) {
          return Result.error(
            new NotFoundError(`Run not found with uuid ${runUuid}`),
          )
        }

        active[runUuid] = {
          ...active[runUuid],
          startedAt: startedAt ?? active[runUuid].startedAt,
          caption: caption ?? active[runUuid].caption,
        }

        await cache.set(lockKey, JSON.stringify(active))

        return Result.ok<ActiveRun>(active[runUuid])
      },
    })
  }

  async delete({ runUuid }: { runUuid: string }) {
    const lockKey = ACTIVE_RUNS_CACHE_KEY(this.workspaceId, this.projectId)

    return withCacheLock({
      lockKey,
      callbackFn: async (cache) => {
        const listing = await this.listCached(cache)
        if (listing.error) return Result.error(listing.error)
        const active = listing.value

        if (runUuid in active) delete active[runUuid]

        await cache.set(lockKey, JSON.stringify(active))

        return Result.ok<ActiveRun>(active[runUuid])
      },
    })
  }
}

async function getLogCatched(
  parameters: Parameters<typeof fetchDocumentLogWithMetadata>[0],
) {
  try {
    // Note: this function raises an error even though it uses the result pattern
    const result = await fetchDocumentLogWithMetadata(parameters)
    return result
  } catch (error) {
    return Result.error(error as Error)
  }
}

async function listLogsCatched(
  parameters: Parameters<typeof computeDocumentLogsWithMetadata>[0],
) {
  try {
    // Note: this function raises an error even though it uses the result pattern
    const result = await computeDocumentLogsWithMetadata(parameters)
    return Result.ok(result)
  } catch (error) {
    return Result.error(error as Error)
  }
}

async function countLogsBySourceCatched(
  parameters: Parameters<
    typeof computeDocumentLogsWithMetadataCountBySource
  >[0],
) {
  try {
    // Note: this function raises an error even though it uses the result pattern
    const result =
      await computeDocumentLogsWithMetadataCountBySource(parameters)
    return Result.ok(result)
  } catch (error) {
    return Result.error(error as Error)
  }
}
