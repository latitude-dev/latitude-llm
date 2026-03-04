import { HttpUnauthorizedError, OrganizationId, PermissionError, UnauthorizedError } from "@domain/shared"
import { createMembershipPostgresRepository } from "@platform/db-postgres"
import { Effect } from "effect"
import { ensureSession } from "../domains/sessions/session.functions.ts"
import { getPostgresClient } from "./clients.ts"

interface AuthenticatedSession {
  readonly userId: string
  readonly organizationId: string
}

export const requireSession = async (): Promise<AuthenticatedSession> => {
  const session = (await ensureSession()) as {
    user?: { id: string }
    session?: {
      activeOrganizationId?: string | null
    }
  } | null

  if (!session?.user) {
    throw new HttpUnauthorizedError()
  }

  const organizationId = session.session?.activeOrganizationId
  if (!organizationId) {
    throw new UnauthorizedError({ message: "No active organization in session" })
  }

  return { userId: session.user.id, organizationId }
}

export const assertOrganizationMembership = async (organizationId: string, userId: string): Promise<void> => {
  const { db } = getPostgresClient()
  const membershipRepository = createMembershipPostgresRepository(db)

  const isMember = await Effect.runPromise(membershipRepository.isMember(OrganizationId(organizationId), userId))

  if (!isMember) {
    throw new PermissionError({
      message: "You do not have access to this organization",
      workspaceId: organizationId,
    })
  }
}
