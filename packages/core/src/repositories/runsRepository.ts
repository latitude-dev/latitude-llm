import { Cache, cache as redis } from '../cache'
import {
  ACTIVE_RUN_CACHE_TTL,
  ACTIVE_RUN_CACHE_TTL_SECONDS,
  ACTIVE_RUNS_CACHE_KEY,
  ActiveRun,
  CompletedRun,
  DEFAULT_PAGINATION_SIZE,
  DocumentLogWithMetadataAndError,
  LOG_SOURCES,
  LogSources,
  Run,
  RUN_CAPTION_SIZE,
  RUN_SOURCES,
  RunAnnotation,
  RunSourceGroup,
} from '../constants'
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
      // Use HGETALL to get all runs from hash at once
      const hashData = await cache.hgetall(key)

      if (!hashData || Object.keys(hashData).length === 0) {
        return Result.ok<Record<string, ActiveRun>>({})
      }

      // Parse each hash value (JSON string) to ActiveRun
      const active: Record<string, ActiveRun> = {}
      const now = Date.now()

      for (const [runUuid, jsonValue] of Object.entries(hashData)) {
        try {
          const run = JSON.parse(jsonValue) as ActiveRun
          const queuedAt = new Date(run.queuedAt)

          // Filter expired runs
          if (queuedAt.getTime() > now - ACTIVE_RUN_CACHE_TTL) {
            active[runUuid] = {
              ...run,
              queuedAt,
              startedAt: run.startedAt ? new Date(run.startedAt) : undefined,
            }
          }
        } catch (parseError) {
          // Skip invalid entries
          continue
        }
      }

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

    // Try to get from hash using HGET
    const key = ACTIVE_RUNS_CACHE_KEY(this.workspaceId, this.projectId)
    const cache = await redis()

    try {
      const jsonValue = await cache.hget(key, runUuid)
      if (!jsonValue) {
        return Result.error(
          new NotFoundError(`Run not found with uuid ${runUuid}`),
        )
      }
      const run = JSON.parse(jsonValue) as ActiveRun
      return Result.ok<Run>({
        ...run,
        queuedAt: new Date(run.queuedAt),
        startedAt: run.startedAt ? new Date(run.startedAt) : undefined,
      })
    } catch (error) {
      if (error instanceof SyntaxError) {
        // Malformed JSON in cache - log and return not found
        return Result.error(
          new NotFoundError(`Run not found with uuid ${runUuid}`),
        )
      }
      // Redis connection error - rethrow or handle appropriately
      return Result.error(error as Error)
    }
  }

  async listActive({
    page = 1,
    pageSize = DEFAULT_PAGINATION_SIZE,
    sourceGroup,
  }: {
    page?: number
    pageSize?: number
    sourceGroup?: RunSourceGroup
  }) {
    const listing = await this.listCached()
    if (listing.error) return Result.error(listing.error)
    const active = listing.value

    let runs = Object.values(active)

    // Filter by sources if provided
    if (sourceGroup) {
      const sources = RUN_SOURCES[sourceGroup]

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
    sourceGroup,
  }: {
    page?: number
    pageSize?: number
    sourceGroup?: RunSourceGroup
  }) {
    const repository = new CommitsRepository(this.workspaceId)
    const filtering = await repository.filterByProject(this.projectId)
    if (filtering.error) return Result.error<Error>(filtering.error)
    const commitIds = filtering.value.map((r) => r.id)

    const logSources = sourceGroup ? RUN_SOURCES[sourceGroup] : LOG_SOURCES

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
    const key = ACTIVE_RUNS_CACHE_KEY(this.workspaceId, this.projectId)
    const cache = await redis()

    try {
      const activeRun: ActiveRun = { uuid: runUuid, queuedAt, source }
      const jsonValue = JSON.stringify(activeRun)

      // Use HSET to atomically add the run to the hash, refreshing the TTL of the key to 3 hours
      await cache.hset(
        key,
        runUuid,
        jsonValue,
        'EX',
        ACTIVE_RUN_CACHE_TTL_SECONDS,
      )

      return Result.ok<ActiveRun>(activeRun)
    } catch (error) {
      return Result.error(error as Error)
    }
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
    const key = ACTIVE_RUNS_CACHE_KEY(this.workspaceId, this.projectId)
    const cache = await redis()

    try {
      // Get the value of the hash field (O(1) operation)
      const jsonValue = await cache.hget(key, runUuid)
      if (!jsonValue) {
        return Result.error(
          new NotFoundError(`Run not found with uuid ${runUuid}`),
        )
      }

      const existingRun = JSON.parse(jsonValue) as ActiveRun
      const updatedRun: ActiveRun = {
        ...existingRun,
        startedAt: startedAt ?? existingRun.startedAt,
        caption: caption ?? existingRun.caption,
      }

      // Use HSET to atomically update the run in the hash, refreshing the TTL of the workspace/projectkey to 3 hours
      await cache.hset(
        key,
        runUuid,
        JSON.stringify(updatedRun),
        'EX',
        ACTIVE_RUN_CACHE_TTL_SECONDS,
      )

      return Result.ok<ActiveRun>(updatedRun)
    } catch (error) {
      return Result.error(error as Error)
    }
  }

  async delete({ runUuid }: { runUuid: string }) {
    const key = ACTIVE_RUNS_CACHE_KEY(this.workspaceId, this.projectId)
    const cache = await redis()

    try {
      // Get the value of the hash field (O(1) operation)
      const jsonValue = await cache.hget(key, runUuid)
      const deletedRun = jsonValue
        ? (JSON.parse(jsonValue) as ActiveRun)
        : undefined

      // Use HDEL to atomically remove the run from the hash (O(1) operation)
      await cache.hdel(key, runUuid)

      if (deletedRun) {
        return Result.ok<ActiveRun>(deletedRun)
      }

      return Result.error(
        new NotFoundError(`Run not found with uuid ${runUuid}`),
      )
    } catch (error) {
      return Result.error(error as Error)
    }
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
