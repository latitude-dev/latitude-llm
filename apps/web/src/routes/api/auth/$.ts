import { createFileRoute } from "@tanstack/react-router"
import { getBetterAuth } from "../../../server/clients.ts"

export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        return getBetterAuth().handler(request)
      },
      POST: async ({ request }: { request: Request }) => {
        return getBetterAuth().handler(request)
      },
    },
  },
})
