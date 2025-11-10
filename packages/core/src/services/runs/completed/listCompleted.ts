import {
  CompletedRun,
  DEFAULT_PAGINATION_SIZE,
  LOG_SOURCES,
  RUN_SOURCES,
  RunSourceGroup,
} from '../../../constants'
import { Result } from '../../../lib/Result'
import { PromisedResult } from '../../../lib/Transaction'
import { CommitsRepository } from '../../../repositories'
import { computeDocumentLogsWithMetadata } from '../../documentLogs/computeDocumentLogsWithMetadata'
import { logToRun } from '../logToRun'

export async function listCompletedRuns({
  workspaceId,
  projectId,
  page = 1,
  pageSize = DEFAULT_PAGINATION_SIZE,
  sourceGroup,
}: {
  workspaceId: number
  projectId: number
  page?: number
  pageSize?: number
  sourceGroup?: RunSourceGroup
}): PromisedResult<CompletedRun[], Error> {
  const repository = new CommitsRepository(workspaceId)
  const filtering = await repository.filterByProject(projectId)
  if (filtering.error) return Result.error(filtering.error)
  const commitIds = filtering.value.map((r) => r.id)

  const logSources = sourceGroup ? RUN_SOURCES[sourceGroup] : LOG_SOURCES

  try {
    const logs = await computeDocumentLogsWithMetadata({
      projectId,
      workspaceId,
      page: page.toString(),
      pageSize: pageSize.toString(),
      filterOptions: { commitIds, logSources },
    })

    const runs = await Promise.all(
      logs.map((log) =>
        logToRun({ log, workspaceId, projectId }).then((r) => r.unwrap()),
      ),
    )

    // CompletedRun requires all fields to be present, which logToRun provides
    return Result.ok(runs as CompletedRun[])
  } catch (error) {
    return Result.error(error as Error)
  }
}
