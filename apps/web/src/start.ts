import { createLogger, initializeObservability, trace } from "@repo/observability"
import { createStart } from "@tanstack/react-start"
import { tracingFnMiddleware } from "./middlewares/tracing-function-middleware.ts"
import { tracingRequestMiddleware } from "./middlewares/tracing-request-middleware.ts"
import { writeGateFnMiddleware } from "./middlewares/write-gate-middleware.ts"

export const startInstance = createStart(async () => {
  await initializeObservability({ serviceName: "web" })

  const tracer = trace.getTracer("web")
  const logger = createLogger("server-fn")

  return {
    requestMiddleware: [tracingRequestMiddleware({ tracer })],
    functionMiddleware: [tracingFnMiddleware({ tracer, logger }), writeGateFnMiddleware],
  }
})
