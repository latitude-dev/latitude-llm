import { HttpUnauthorizedError, OrganizationId, PermissionError, UnauthorizedError } from "@domain/shared"
import { createMembershipPostgresRepository } from "@platform/db-postgres"
import { Effect } from "effect"
import { ensureSession } from "../domains/sessions/session.functions.ts"
import { getPostgresClient } from "./clients.ts"

interface AuthenticatedSession {
  readonly userId: string
  readonly organizationId: string
}

const getSessionUserId = (session: unknown): string | null => {
  if (typeof session !== "object" || session === null) {
    return null
  }

  const user = Reflect.get(session, "user")
  if (typeof user !== "object" || user === null) {
    return null
  }

  const id = Reflect.get(user, "id")
  return typeof id === "string" ? id : null
}

const getSessionOrganizationId = (session: unknown): string | null => {
  if (typeof session !== "object" || session === null) {
    return null
  }

  const sessionData = Reflect.get(session, "session")
  if (typeof sessionData !== "object" || sessionData === null) {
    return null
  }

  const organizationId = Reflect.get(sessionData, "activeOrganizationId")
  return typeof organizationId === "string" ? organizationId : null
}

export const requireSession = async (): Promise<AuthenticatedSession> => {
  const session = await ensureSession()
  const userId = getSessionUserId(session)

  if (!userId) {
    throw new HttpUnauthorizedError()
  }

  const organizationId = getSessionOrganizationId(session)
  if (!organizationId) {
    throw new UnauthorizedError({ message: "No active organization in session" })
  }

  return { userId, organizationId }
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
