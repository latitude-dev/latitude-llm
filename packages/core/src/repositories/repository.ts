import { database } from '$core/client'
import { Subquery } from 'drizzle-orm'

export default abstract class Repository {
  protected workspaceId: number
  protected db = database

  constructor(workspaceId: number, db = database) {
    this.workspaceId = workspaceId
    this.db = db
  }

  abstract get scope(): Subquery
}
