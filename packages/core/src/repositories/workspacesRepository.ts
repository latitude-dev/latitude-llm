import { eq, getTableColumns } from 'drizzle-orm'

import { Database, database } from '../client'
import { NotFoundError, Result } from '../lib'
import { memberships, workspaces } from '../schema'

export class WorkspacesRepository {
  public userId: string
  private db: Database

  constructor(userId: string, db = database) {
    this.userId = userId
    this.db = db
  }

  get scope() {
    return this.db
      .select(getTableColumns(workspaces))
      .from(workspaces)
      .innerJoin(memberships, eq(memberships.workspaceId, workspaces.id))
      .where(eq(memberships.userId, this.userId))
      .as('workspacesScope')
  }

  async find(workspaceId: number) {
    const result = await this.db
      .select()
      .from(this.scope)
      .where(eq(this.scope.id, workspaceId))
      .limit(1)
    const workspace = result[0]

    if (!workspace) {
      return Result.error(new NotFoundError('Workspace not found'))
    }

    return Result.ok(workspace)
  }
}
