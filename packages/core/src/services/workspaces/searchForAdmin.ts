import { database } from '../../client'
import { Result } from '../../lib/Result'
import { workspaces } from '../../schema/models/workspaces'
import { ilike, or, sql } from 'drizzle-orm'

export type WorkspaceSearchResult = {
  id: number
  name: string
  createdAt: Date
}

export async function searchWorkspacesForAdmin(query: string, db = database) {
  const searchTerm = `%${query}%`

  const results = await db
    .select({
      id: workspaces.id,
      name: workspaces.name,
      createdAt: workspaces.createdAt,
    })
    .from(workspaces)
    .where(
      or(
        ilike(workspaces.name, searchTerm),
        sql`CAST(${workspaces.id} AS TEXT) LIKE ${searchTerm}`,
      ),
    )
    .orderBy(workspaces.name)
    .limit(20)

  return Result.ok(results)
}
