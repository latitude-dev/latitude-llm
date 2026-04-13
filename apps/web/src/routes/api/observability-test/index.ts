import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/api/observability-test/")({
  server: {
    handlers: {
      GET: async () => {
        return new Response(JSON.stringify({ service: "web", observabilityTest: "armed" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      },
    },
  },
})
