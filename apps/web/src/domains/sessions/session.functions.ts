import { generateId, UnauthorizedError } from "@domain/shared"
import { createServerFn } from "@tanstack/react-start"
import { getRequestHeaders } from "@tanstack/react-start/server"
import { Effect } from "effect"
import { z } from "zod"
import { getBetterAuth, getOutboxWriter } from "../../server/clients.ts"

/** Throws {@link UnauthorizedError} when there is no authenticated session (for use inside server handlers). */
export function assertAuthenticatedSession<T>(session: T | null | undefined): asserts session is NonNullable<T> {
  if (session == null) {
    throw new UnauthorizedError({ message: "Unauthorized" })
  }
}

export const getSession = createServerFn({ method: "GET" }).handler(async () => {
  const headers = getRequestHeaders()
  const auth = getBetterAuth()

  const session = await auth.api.getSession({ headers })

  return session
})

export const ensureSession = createServerFn({ method: "GET" }).handler(async () => {
  const session = await getSession()

  assertAuthenticatedSession(session)

  return session
})

export const updateUserName = createServerFn({ method: "POST" })
  .inputValidator(z.object({ name: z.string().min(1).max(256) }))
  .handler(async ({ data }) => {
    const headers = getRequestHeaders()
    const auth = getBetterAuth()

    const session = await auth.api.getSession({ headers })
    assertAuthenticatedSession(session)

    const updated = await auth.api.updateUser({
      headers,
      body: { name: data.name },
    })

    return updated
  })

export const deleteCurrentUser = createServerFn({ method: "POST" }).handler(async () => {
  const headers = getRequestHeaders()
  const auth = getBetterAuth()

  const session = await auth.api.getSession({ headers })
  assertAuthenticatedSession(session)

  const userId = session.user.id
  const outboxWriter = getOutboxWriter()

  // Write a domain event for background deletion
  await Effect.runPromise(
    outboxWriter.write({
      id: generateId(),
      eventName: "UserDeletionRequested",
      aggregateType: "user",
      aggregateId: userId,
      organizationId: "system",
      payload: {
        organizationId: session.session.activeOrganizationId ?? "system",
        userId,
      },
      occurredAt: new Date(),
    }),
  )

  // Revoke the session so the user is logged out
  await auth.api.revokeSession({ headers, body: { token: session.session.token } })

  return { success: true }
})
