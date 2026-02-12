import { LogSources, RunSourceGroup, RUN_SOURCES } from '../../../constants'
import { Result } from '../../../lib/Result'
import { countSpansByProjectAndSource } from '../../../queries/spans/countByProjectAndSource'
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
  const sourcesToInclude =
    sourceGroup !== undefined
      ? RUN_SOURCES[sourceGroup]
      : Object.values(LogSources)

  const countsBySource = await countSpansByProjectAndSource({
    workspaceId,
    projectId,
    source: sourcesToInclude,
  })

  return Result.ok<Record<LogSources, number>>(countsBySource)
}
