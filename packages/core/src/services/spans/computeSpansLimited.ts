import { Cursor } from '../../schema/types'
import { DEFAULT_PAGINATION_SIZE } from '../../constants'
import { SpanType } from '@latitude-data/constants'
import { SpansRepository } from '../../repositories/spansRepository'

export async function computeSpansLimited({
  documentUuid,
  commitUuid,
  from,
  type,
  workspaceId,
  limit = DEFAULT_PAGINATION_SIZE,
}: {
  documentUuid: string
  commitUuid: string
  from: Cursor<string, string> | null
  type?: string
  workspaceId: number
  limit?: number
}) {
  const spansRepository = new SpansRepository(workspaceId)
  const resultCount = await spansRepository.approximateCount({
    documentUuid,
    commitUuid,
  })
  const result = await spansRepository.findByDocumentAndCommitLimited({
    documentUuid,
    commitUuid,
    type: type as SpanType,
    from: from ? { startedAt: from.value, id: from.id } : undefined,
    limit,
  })

  const { items, next } = result.unwrap()

  return {
    items,
    count: resultCount.value,
    next: next ? { value: next.startedAt, id: next.id } : null,
  }
}
