import { bigint, bigserial, index, integer, text, timestamp } from 'drizzle-orm/pg-core'

import { timestamps } from '../schemaHelpers'
import { users } from './users'
import { workspaces } from './workspaces'
import { latitudeSchema } from '../db-schema'

// Define the possible states for a K8s application
export const k8sAppStatusEnum = latitudeSchema.enum('k8s_app_status', [
  'pending',
  'deploying',
  'deployed',
  'failed',
  'deleting',
  'deleted',
])

export const mcpServers = latitudeSchema.table(
  'mcp_servers',
  {
    id: bigserial('id', { mode: 'number' }).notNull().primaryKey(),
    name: text('name').notNull(),
    // Unique name with hash used for Kubernetes resources
    uniqueName: text('unique_name').notNull(),

    // Reference to the workspace (also used as namespace)
    workspaceId: bigint('workspace_id', { mode: 'number' })
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),

    // Reference to user who created the application
    authorId: text('author_id')
      .notNull()
      .references(() => users.id, { onDelete: 'set null' }),

    command: text('command').notNull(),

    // JSONB field of environment variables (encrypted)
    environmentVariables: text('environment_variables'),

    // Application status
    status: k8sAppStatusEnum('status').notNull(),

    // Deployment timestamps
    replicas: integer('replicas').notNull().default(1),
    deployedAt: timestamp('deployed_at'),
    lastUsedAt: timestamp('last_used_at').notNull().defaultNow(),
    lastAttemptAt: timestamp('last_attempt_at'),

    // k8s namespace
    namespace: text('namespace').notNull(),

    // k8s manifest YAML
    k8sManifest: text('k8s_manifest').notNull(),

    // internal URL where the app is accessible
    endpoint: text('endpoint').notNull(),

    // Standard timestamps (created_at, updated_at)
    ...timestamps(),
  },
  (table) => ({
    workspaceIdIdx: index('mcp_servers_workspace_id_idx').on(table.workspaceId),
    authorIdIdx: index('mcp_servers_author_id_idx').on(table.authorId),
    statusIdx: index('mcp_servers_status_idx').on(table.status),
    uniqueNameIdx: index('mcp_servers_unique_name_idx').on(table.uniqueName),
    lastUsedAtIdx: index('mcp_servers_last_used_at_idx').on(table.lastUsedAt),
  }),
)
