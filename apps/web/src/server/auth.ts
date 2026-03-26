import { OrganizationId, UnauthorizedError, UserId } from "@domain/shared"
import type { Session, User } from "@platform/db-postgres"
import { ensureSession } from "../domains/sessions/session.functions.ts"

interface AuthenticatedSession {
  readonly userId: UserId
  readonly organizationId: OrganizationId
}

// Organization plugin extends the base Session type with activeOrganizationId
type OrganizationSession = Session & {
  activeOrganizationId?: string | null
}

interface BetterAuthSession {
  user: User
  session: OrganizationSession
}

const isBetterAuthSession = (session: unknown): session is BetterAuthSession => {
  return (
    typeof session === "object" &&
    session !== null &&
    "user" in session &&
    typeof (session as Record<string, unknown>).user === "object" &&
    (session as Record<string, unknown>).user !== null &&
    "session" in session &&
    typeof (session as Record<string, unknown>).session === "object" &&
    (session as Record<string, unknown>).session !== null
  )
}

const getSessionUserId = (session: unknown): string | null => {
  if (!isBetterAuthSession(session)) {
    return null
  }

  return session.user.id ?? null
}

export const getSessionOrganizationId = (session: unknown): string | null => {
  if (!isBetterAuthSession(session)) {
    return null
  }

  return session.session.activeOrganizationId ?? null
}

export const requireUserSession = async (): Promise<UserId> => {
  const session = await ensureSession()
  const userId = getSessionUserId(session)

  if (!userId) {
    throw new UnauthorizedError({ message: "No user in session" })
  }

  return UserId(userId)
}

export const requireSession = async (): Promise<AuthenticatedSession> => {
  const session = await ensureSession()
  const userId = getSessionUserId(session)

  if (!userId) {
    throw new UnauthorizedError({ message: "No user in session" })
  }

  const organizationId = getSessionOrganizationId(session)
  if (!organizationId) {
    throw new UnauthorizedError({ message: "No active organization in session" })
  }

  return { userId: UserId(userId), organizationId: OrganizationId(organizationId) }
}
