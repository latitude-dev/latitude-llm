import { Database, database } from '../client'

export function scopedQuery<F extends { workspaceId: number }, R>(
  fn: (filters: F, db: Database) => R,
): (filters: F, db?: Database) => R {
  return (filters: F, db: Database = database) => {
    try {
      return fn(filters, db)
    } catch (e) {
      if (e instanceof Error && 'cause' in e) {
        throw e.cause
      } else {
        throw e
      }
    }
  }
}

export function unscopedQuery<F extends Record<string, unknown>, R>(
  fn: (filters: F, db: Database) => R,
): [keyof F] extends [never]
  ? (filters?: F, db?: Database) => R
  : (filters: F, db?: Database) => R {
  return (filters: F = {} as F, db: Database = database) => {
    try {
      return fn(filters, db)
    } catch (e) {
      if (e instanceof Error && 'cause' in e) {
        throw e.cause
      } else {
        throw e
      }
    }
  }
}
