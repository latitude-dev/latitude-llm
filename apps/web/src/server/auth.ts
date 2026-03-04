import { HttpUnauthorizedError, OrganizationId, PermissionError } from "@domain/shared"
import { createMembershipPostgresRepository } from "@platform/db-postgres"
import { Effect } from "effect"
import { ensureSession } from "../domains/sessions/session.functions.ts"
import { getPostgresClient } from "./clients.ts"

interface AuthenticatedSession {
  readonly userId: string
}

export const requireSession = async (): Promise<AuthenticatedSession> => {
  const session = (await ensureSession()) as { user?: { id: string } } | null

  if (!session?.user) {
    throw new HttpUnauthorizedError()
  }

  return { userId: session.user.id }
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
