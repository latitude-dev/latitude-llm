import { OrganizationId, UnauthorizedError, UserId } from "@domain/shared"
import { appendFileSync } from "node:fs"
import { ensureSession } from "../domains/sessions/session.functions.ts"

interface AuthenticatedSession {
  readonly userId: UserId
  readonly organizationId: OrganizationId
}

const debugLog = (payload: {
  readonly hypothesisId: string
  readonly location: string
  readonly message: string
  readonly data: Record<string, unknown>
}) => {
  appendFileSync("/opt/cursor/logs/debug.log", `${JSON.stringify({ ...payload, timestamp: Date.now() })}\n`)
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

export const getSessionOrganizationId = (session: unknown): string | null => {
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
    throw new UnauthorizedError({ message: "No user in session" })
  }

  const organizationId = getSessionOrganizationId(session)
  if (!organizationId) {
    // #region agent log
    debugLog({
      hypothesisId: "B",
      location: "apps/web/src/server/auth.ts:requireSession",
      message: "requireSession missing active organization",
      data: { userId },
    })
    // #endregion
    throw new UnauthorizedError({ message: "No active organization in session" })
  }

  // #region agent log
  debugLog({
    hypothesisId: "B",
    location: "apps/web/src/server/auth.ts:requireSession",
    message: "requireSession resolved session",
    data: { userId, organizationId },
  })
  // #endregion

  return { userId: UserId(userId), organizationId: OrganizationId(organizationId) }
}
