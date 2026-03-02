import type { Effect } from "effect"
import type { MembershipCreationError, WorkspaceCreationError } from "../errors.ts"

/**
 * Workspace repository port
 *
 * Abstract interface for workspace persistence.
 */

export interface WorkspaceRepository {
  readonly create: (params: {
    name: string
    userId: string
  }) => Effect.Effect<{ id: string; name: string }, WorkspaceCreationError>
}

/**
 * Membership repository port
 */

export interface MembershipRepository {
  readonly create: (params: {
    userId: string
    workspaceId: string
    role: "owner" | "admin" | "member"
  }) => Effect.Effect<{ id: string }, MembershipCreationError>
}
