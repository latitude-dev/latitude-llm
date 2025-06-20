import { desc, eq, getTableColumns } from 'drizzle-orm'
import { Span } from '../browser'
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
}
