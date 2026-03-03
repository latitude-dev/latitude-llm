import { createServerFn } from "@tanstack/react-start"
import { getRequestHeaders } from "@tanstack/react-start/server"
import { getBetterAuth } from "../../server/clients.ts"

type AuthSession = {
  readonly user: {
    readonly id: string
    readonly email: string
    readonly name?: string | null
  }
} | null

export const getSession = createServerFn({ method: "GET" }).handler(async (): Promise<AuthSession> => {
  const headers = getRequestHeaders()
  const auth = getBetterAuth()

  const session = (await auth.api.getSession({ headers })) as AuthSession

  return session
})

export const ensureSession = createServerFn({ method: "GET" }).handler(async () => {
  const session = await getSession()

  if (!session) {
    throw new Error("Unauthorized")
  }

  return session
})
