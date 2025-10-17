import { type InferSelectModel } from 'drizzle-orm'

import { mcpServers } from '../mcpServers'

export type McpServer = InferSelectModel<typeof mcpServers>
