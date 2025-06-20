import { desc, eq, getTableColumns, sql } from 'drizzle-orm'
import { Segment } from '../browser'
import { Result } from '../lib/Result'
import { segments } from '../schema'
import Repository from './repositoryV2'

const tt = getTableColumns(segments)

export class SegmentsRepository extends Repository<Segment> {
  get scopeFilter() {
    return eq(segments.workspaceId, this.workspaceId)
  }

  get scope() {
    return this.db
      .select(tt)
      .from(segments)
      .where(this.scopeFilter)
      .orderBy(desc(segments.startedAt), desc(segments.id))
      .$dynamic()
  }

  async listByPath({ segmentId }: { segmentId: string }) {
    const result = await this.db
      .execute(
        sql<Segment[]>`
        WITH RECURSIVE path AS (
          SELECT *, 0 AS level
          FROM ${segments}
          WHERE (
            ${segments.workspaceId} = ${this.workspaceId} AND  
            ${segments.id} = ${segmentId}
          )
          UNION ALL
          SELECT parent.*, child.level + 1
          FROM ${segments} AS parent
          INNER JOIN path AS child
          ON parent.id = child.parent_id
          WHERE child.level < 100
        ) SEARCH BREADTH FIRST BY level SET rank
        SELECT *
        FROM path
        ORDER BY rank DESC;`,
      )
      .then((r) => r.rows)

    return Result.ok<Segment[]>(result as any)
  }
}
