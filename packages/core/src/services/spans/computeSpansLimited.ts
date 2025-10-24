import { Cursor } from '../../schema/types'
import { DEFAULT_PAGINATION_SIZE } from '../../constants'
import { SpanType } from '@latitude-data/constants'
import { database } from '../../client'
import { SpansRepository } from '../../repositories/spansRepository'

export async function computeSpansLimited(
  {
    documentUuid,
    commitUuid,
    from,
    direction = 'forward',
    type,
  }: {
    documentUuid: string
    commitUuid: string
    from: Cursor<string, string> | null
    direction?: 'forward' | 'backward'
    type?: string
  },
  db = database,
) {
  const spansRepository = new SpansRepository(db as any)
  const result = await spansRepository.findByDocumentAndCommitLimited({
    documentUuid,
    commitUuid,
    type: type as SpanType,
    from: from ? { startedAt: from.value, id: from.id } : null,
    direction,
    limit: DEFAULT_PAGINATION_SIZE,
  })

  return {
    items: result.unwrap().items,
    next: result.unwrap().next
      ? { value: result.unwrap().next!.startedAt, id: result.unwrap().next!.id }
      : null,
    prev: result.unwrap().prev
      ? { value: result.unwrap().prev!.startedAt, id: result.unwrap().prev!.id }
      : null,
  }
}
