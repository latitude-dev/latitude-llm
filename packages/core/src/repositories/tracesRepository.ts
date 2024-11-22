import { and, count, desc, eq, getTableColumns } from 'drizzle-orm'

import { Trace } from '../browser'
import { spans, traces } from '../schema'
import Repository from './repositoryV2'

const tt = getTableColumns(traces)

export class TracesRepository extends Repository<Trace> {
  get scope() {
    return this.db
      .select()
      .from(traces)
      .innerJoin(projects, eq(projects.id, traces.projectId))
      .innerJoin(workspaces, eq(workspaces.id, projects.workspaceId))
      .where(eq(workspaces.id, this.workspaceId))
      .$dynamic()
  }

  async findByProjectId(projectId: number, page: number, pageSize: number) {
    const where = and(eq(tt.projectId, projectId))

    const [items, total] = await Promise.all([
      this.db
        .select({
          traceId: tt.traceId,
          name: tt.name,
          startTime: tt.startTime,
          endTime: tt.endTime,
          attributes: tt.attributes,
          status: tt.status,
          spanCount: count(spans.id),
        })
        .from(traces)
        .leftJoin(spans, eq(spans.traceId, traces.traceId))
        .where(where)
        .groupBy(tt.id)
        .orderBy(desc(tt.startTime))
        .limit(pageSize)
        .offset((page - 1) * pageSize),
      this.db
        .select({ value: count() })
        .from(traces)
        .where(where)
        .then((r) => r[0]?.value ?? 0),
    ])

    return { items, total }
  }
}
