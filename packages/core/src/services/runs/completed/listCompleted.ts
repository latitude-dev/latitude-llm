import {
  DEFAULT_PAGINATION_SIZE,
  RunSourceGroup,
  SpanType,
} from '../../../constants'
import { SpansRepository } from '../../../repositories'
import { mapSourceGroupToLogSources } from '../mapSourceGroupToLogSources'

export async function listPromptSpans({
  type = SpanType.Prompt,
  workspaceId,
  projectId,
  from,
  limit = DEFAULT_PAGINATION_SIZE,
  sourceGroup,
  startedAt,
}: {
  type?: SpanType
  workspaceId: number
  projectId: number
  from?: { startedAt: string; id: string }
  limit?: number
  sourceGroup?: RunSourceGroup
  startedAt?: { from?: Date; to?: Date }
}) {
  const logSources = mapSourceGroupToLogSources(sourceGroup)
  const spansRepo = new SpansRepository(workspaceId)

  return await spansRepo.findByProjectLimited({
    projectId,
    type,
    from,
    source: logSources,
    limit,
    startedAt,
  })
}
