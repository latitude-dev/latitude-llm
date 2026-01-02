import { type InferSelectModel } from 'drizzle-orm'

import { mcpOAuthCredentials } from '../mcpOAuthCredentials'

export type McpOAuthCredentials = InferSelectModel<typeof mcpOAuthCredentials>
