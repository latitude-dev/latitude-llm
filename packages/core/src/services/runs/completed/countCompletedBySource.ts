import { LOG_SOURCES, LogSources } from '../../../constants'
import { Result } from '../../../lib/Result'
import { PromisedResult } from '../../../lib/Transaction'
import { CommitsRepository } from '../../../repositories'
import { computeDocumentLogsWithMetadataCountBySource } from '../../documentLogs/computeDocumentLogsWithMetadata'

/**
 * Counts completed runs grouped by source.
 */
export async function countCompletedRunsBySource({
  workspaceId,
  projectId,
}: {
  workspaceId: number
  projectId: number
}): PromisedResult<Record<LogSources, number>, Error> {
  const repository = new CommitsRepository(workspaceId)
  const filtering = await repository.filterByProject(projectId)
  if (filtering.error) return Result.error(filtering.error)
  const commitIds = filtering.value.map((r) => r.id)

  try {
    const counts = await computeDocumentLogsWithMetadataCountBySource({
      projectId,
      workspaceId,
      filterOptions: { commitIds, logSources: LOG_SOURCES },
    })

    const countBySource: Record<LogSources, number> = LOG_SOURCES.reduce(
      (acc, source) => ({ ...acc, [source]: 0 }),
      {} as Record<LogSources, number>,
    )

    counts.forEach(({ source, count }) => {
      if (source) {
        countBySource[source as LogSources] = count
      }
    })

    return Result.ok(countBySource)
  } catch (error) {
    return Result.error(error as Error)
  }
}
