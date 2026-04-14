import { LatitudeObservabilityTestError } from "@repo/utils"
import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/api/observability-test/error")({
  server: {
    handlers: {
      GET: () => {
        throw new LatitudeObservabilityTestError("web")
      },
    },
  },
})
