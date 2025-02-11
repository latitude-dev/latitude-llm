import { and, eq, getTableColumns } from 'drizzle-orm'
import { Span } from '../browser'
import { spans, traces } from '../schema'
import Repository from './repositoryV2'

export default class SpanRepository extends Repository<Span> {
  get scopeFilter() {
    return eq(traces.workspaceId, this.workspaceId)
  }

  get scope() {
    return this.db
      .select(getTableColumns(spans))
      .from(spans)
      .innerJoin(traces, eq(traces.traceId, spans.traceId))
      .where(this.scopeFilter)
      .$dynamic()
  }

  async findBySpanId(spanId: string) {
    return this.scope
      .where(and(this.scopeFilter, eq(spans.spanId, spanId)))
      .limit(1)
      .then((r) => r[0])
  }
}
