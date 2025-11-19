import { LogSources, RunSourceGroup, RUN_SOURCES } from '../../../constants'
import { Result } from '../../../lib/Result'
import { SpansRepository } from '../../../repositories'
import { PromisedResult } from '../../../lib/Transaction'

export async function countCompletedRunsBySource({
  workspaceId,
  projectId,
  sourceGroup,
}: {
  workspaceId: number
  projectId: number
  sourceGroup?: RunSourceGroup
}): PromisedResult<Record<LogSources, number>, Error> {
  // Determine which sources to include based on sourceGroup
  const sourcesToInclude =
    sourceGroup !== undefined
      ? RUN_SOURCES[sourceGroup]
      : Object.values(LogSources)

  // Use the repository's exact count method
  const spansRepo = new SpansRepository(workspaceId)
  const countsBySource = await spansRepo
    .countByProjectAndSource({
      projectId,
      source: sourcesToInclude,
    })
    .then((r) => r.unwrap())

  return Result.ok<Record<LogSources, number>>(countsBySource)
}
