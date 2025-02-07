import { eq, getTableColumns } from 'drizzle-orm'

import { Trace } from '../browser'
import { traces, workspaces } from '../schema'
import Repository from './repositoryV2'

const tt = getTableColumns(traces)

export class TracesRepository extends Repository<Trace> {
  get scopeFilter() {
    return eq(workspaces.id, this.workspaceId)
  }

  get scope() {
    return this.db
      .select(tt)
      .from(traces)
      .innerJoin(workspaces, eq(workspaces.id, traces.workspaceId))
      .where(this.scopeFilter)
      .$dynamic()
  }
}
