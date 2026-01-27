import { database } from '../../client'
import { Result } from '../../lib/Result'
import { users } from '../../schema/models/users'
import { workspaces } from '../../schema/models/workspaces'
import { projects } from '../../schema/models/projects'
import { ilike, or, sql, isNull, and } from 'drizzle-orm'

export type SearchEntityType = 'all' | 'user' | 'workspace' | 'project'

function getRelevanceScore(value: string, query: string): number {
  const lowerValue = value.toLowerCase()
  const lowerQuery = query.toLowerCase()

  if (lowerValue === lowerQuery) return 100
  if (lowerValue.startsWith(lowerQuery)) return 50
  return 10
}

function sortByRelevance<T>(
  items: T[],
  query: string,
  getSearchableFields: (item: T) => string[],
): T[] {
  return items.sort((a, b) => {
    const aFields = getSearchableFields(a)
    const bFields = getSearchableFields(b)
    const aScore = Math.max(...aFields.map((f) => getRelevanceScore(f, query)))
    const bScore = Math.max(...bFields.map((f) => getRelevanceScore(f, query)))
    return bScore - aScore
  })
}

export type UserSearchResult = {
  type: 'user'
  id: string
  email: string
  name: string | null
  createdAt: Date
}

export type WorkspaceSearchResult = {
  type: 'workspace'
  id: number
  name: string
  createdAt: Date
}

export type ProjectSearchResult = {
  type: 'project'
  id: number
  name: string
  workspaceId: number
  createdAt: Date
}

export type UnifiedSearchResult =
  | UserSearchResult
  | WorkspaceSearchResult
  | ProjectSearchResult

export type UnifiedSearchResponse = {
  users: UserSearchResult[]
  workspaces: WorkspaceSearchResult[]
  projects: ProjectSearchResult[]
}

async function searchUsers(query: string, db = database, limit = 10) {
  const searchTerm = `%${query}%`

  const results = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(or(ilike(users.email, searchTerm), ilike(users.name, searchTerm)))
    .orderBy(users.email)
    .limit(limit)

  return results.map((r) => ({ ...r, type: 'user' as const }))
}

async function searchWorkspaces(query: string, db = database, limit = 10) {
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
    .limit(limit)

  return results.map((r) => ({ ...r, type: 'workspace' as const }))
}

async function searchProjects(query: string, db = database, limit = 10) {
  const searchTerm = `%${query}%`

  const results = await db
    .select({
      id: projects.id,
      name: projects.name,
      workspaceId: projects.workspaceId,
      createdAt: projects.createdAt,
    })
    .from(projects)
    .where(
      and(
        isNull(projects.deletedAt),
        or(
          ilike(projects.name, searchTerm),
          sql`CAST(${projects.id} AS TEXT) LIKE ${searchTerm}`,
        ),
      ),
    )
    .orderBy(projects.name)
    .limit(limit)

  return results.map((r) => ({ ...r, type: 'project' as const }))
}

const MIN_QUERY_LENGTH = 2
const MAX_RESULTS_PER_ENTITY = 10

export async function unifiedSearchForAdmin(
  query: string,
  entityType: SearchEntityType = 'all',
  db = database,
) {
  const trimmedQuery = query.trim()

  if (trimmedQuery.length < MIN_QUERY_LENGTH) {
    return Result.ok({
      users: [],
      workspaces: [],
      projects: [],
    })
  }

  const searchPromises: Promise<void>[] = []
  const response: UnifiedSearchResponse = {
    users: [],
    workspaces: [],
    projects: [],
  }

  if (entityType === 'all' || entityType === 'user') {
    searchPromises.push(
      searchUsers(trimmedQuery, db, MAX_RESULTS_PER_ENTITY).then((results) => {
        response.users = sortByRelevance(results, trimmedQuery, (u) => [
          u.email,
          u.name || '',
        ])
      }),
    )
  }

  if (entityType === 'all' || entityType === 'workspace') {
    searchPromises.push(
      searchWorkspaces(trimmedQuery, db, MAX_RESULTS_PER_ENTITY).then(
        (results) => {
          response.workspaces = sortByRelevance(results, trimmedQuery, (w) => [
            w.name,
            String(w.id),
          ])
        },
      ),
    )
  }

  if (entityType === 'all' || entityType === 'project') {
    searchPromises.push(
      searchProjects(trimmedQuery, db, MAX_RESULTS_PER_ENTITY).then(
        (results) => {
          response.projects = sortByRelevance(results, trimmedQuery, (p) => [
            p.name,
            String(p.id),
          ])
        },
      ),
    )
  }

  await Promise.all(searchPromises)

  return Result.ok(response)
}
