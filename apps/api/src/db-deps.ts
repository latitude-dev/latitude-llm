import type { PostgresDb } from "@platform/db-postgres"
import type { Context } from "hono"
import type { MiddlewareHandler } from "hono"
import type { Pool } from "pg"

export interface ApiDbDependencies {
  readonly db: PostgresDb
}

export interface ApiDatabaseDependencies extends ApiDbDependencies {
  readonly pool: Pool
}

const DB_DEPENDENCIES_KEY = "dbDependencies"

export const createDbDependenciesMiddleware = (dependencies: ApiDbDependencies): MiddlewareHandler => {
  return async (c, next) => {
    c.set(DB_DEPENDENCIES_KEY, dependencies)
    await next()
  }
}

export const getDbDependencies = (c: Context): ApiDbDependencies => {
  const dependencies = c.get(DB_DEPENDENCIES_KEY)
  if (!dependencies) {
    throw new Error("Database dependencies not found on request context")
  }
  return dependencies
}
