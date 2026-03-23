import { createServerFn } from "@tanstack/react-start"
import { getRequestHeaders } from "@tanstack/react-start/server"
import { z } from "zod"
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

export const updateUserName = createServerFn({ method: "POST" })
  .inputValidator(z.object({ name: z.string().min(1).max(256) }))
  .handler(async ({ data }) => {
    const headers = getRequestHeaders()
    const auth = getBetterAuth()

    const session = await auth.api.getSession({ headers })
    if (!session) {
      throw new Error("Unauthorized")
    }

    const updated = await auth.api.updateUser({
      headers,
      body: { name: data.name },
    })

    return updated
  })
