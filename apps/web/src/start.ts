import { initializeObservability } from "@repo/observability"
import { createMiddleware, createStart } from "@tanstack/react-start"

export const requestObservabilityMiddleware = createMiddleware({ type: "request" }).server(async ({ next }) => {
  await initializeObservability({
    serviceName: "web",
  })

  return next()
})

export const startInstance = createStart(() => {
  return {
    requestMiddleware: [requestObservabilityMiddleware],
  }
})
