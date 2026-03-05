import { createServerFn } from "@tanstack/react-start"
import { getRequestHeaders } from "@tanstack/react-start/server"
import { getBetterAuth } from "../../server/clients.ts"

export const getSession = createServerFn({ method: "GET" }).handler(async () => {
  const headers = getRequestHeaders()
  const auth = getBetterAuth()

  const session = await auth.api.getSession({ headers })

  return session
})

export const ensureSession = createServerFn({ method: "GET" }).handler(async () => {
  const session = await getSession()

  if (!session) {
    throw new Error("Unauthorized")
  }

  return session
})
