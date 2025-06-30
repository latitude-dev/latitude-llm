import { and, desc, eq, getTableColumns } from 'drizzle-orm'
import { Span } from '../browser'
import { Result } from '../lib/Result'
import { spans } from '../schema'
import Repository from './repositoryV2'

const tt = getTableColumns(spans)

export class SpansRepository extends Repository<Span> {
  get scopeFilter() {
    return eq(spans.workspaceId, this.workspaceId)
  }

  get scope() {
    return this.db
      .select(tt)
      .from(spans)
      .where(this.scopeFilter)
      .orderBy(desc(spans.startedAt), desc(spans.id))
      .$dynamic()
  }

  async get({ spanId, traceId }: { spanId: string; traceId: string }) {
    const result = await this.scope
      .where(
        and(this.scopeFilter, eq(spans.traceId, traceId), eq(spans.id, spanId)),
      )
      .limit(1)
      .then((r) => r[0])

    if (!result) return Result.nil()

    return Result.ok<Span>(result as Span)
  }
}
