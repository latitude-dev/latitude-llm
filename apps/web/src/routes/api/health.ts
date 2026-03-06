import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: async () => {
        return new Response(JSON.stringify({ status: "ok" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      },
    },
  },
})
