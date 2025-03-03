import { eq, not } from 'drizzle-orm'

import { mcpServers } from '../schema/models/mcpServers'
import Repository from './repositoryV2'
import { McpServer } from '../schema/types'

export class McpServerRepository extends Repository<McpServer> {
  get scopeFilter() {
    return eq(mcpServers.workspaceId, this.workspaceId)
  }

  get scope() {
    return this.db.select().from(mcpServers).where(this.scopeFilter).$dynamic()
  }

  async findAllActive() {
    const result = await this.scope.where(not(eq(mcpServers.status, 'deleted')))

    return result
  }

  async findByName(name: string) {
    const result = await this.scope.where(eq(mcpServers.name, name)).limit(1)

    return result[0]
  }
}
