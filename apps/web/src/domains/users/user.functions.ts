import { createServerFn } from "@tanstack/react-start"
import { getRequestHeaders } from "@tanstack/react-start/server"
import z from "zod"
import { getBetterAuth } from "../../server/clients.ts"

export const updateUser = createServerFn({ method: "POST" })
  .inputValidator(z.object({ name: z.string().min(1).max(256) }))
  .handler(async ({ data }) => {
    await getBetterAuth().api.updateUser({
      body: {
        name: data.name,
      },
      headers: await getRequestHeaders(),
    })
  })
