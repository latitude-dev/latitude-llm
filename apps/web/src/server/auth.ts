import { UnauthorizedError } from "@repo/utils"
import { ensureSession } from "../domains/sessions/session.functions.ts"

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
    throw new UnauthorizedError({ httpMessage: "No user in session" })
  }

  const organizationId = getSessionOrganizationId(session)
  if (!organizationId) {
    throw new UnauthorizedError({ httpMessage: "No active organization in session" })
  }

  return { userId, organizationId }
}
