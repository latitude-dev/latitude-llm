import { eq, getTableColumns } from 'drizzle-orm'
import { Span } from '../browser'
import { spans, traces } from '../schema'
import Repository from './repositoryV2'

export default class SpanRepository extends Repository<Span> {
  get scope() {
    return this.db
      .select(getTableColumns(spans))
      .from(spans)
      .innerJoin(traces, eq(traces.traceId, spans.traceId))
      .where(eq(traces.workspaceId, this.workspaceId))
      .$dynamic()
  }

  findBySpanId(spanId: string) {
    return this.scope
      .where(eq(spans.spanId, spanId))
      .limit(1)
      .then((r) => r[0])
  }
}
