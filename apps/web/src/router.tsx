import { createRouter as createTanStackRouter } from "@tanstack/react-router"
import { routeTree } from "./routeTree.gen.ts"

export function getRouter() {
  const router = createTanStackRouter({
    routeTree,
    defaultNotFoundComponent: () => {
      const currentPath = typeof window !== "undefined" ? window.location.pathname : ""
      if (currentPath) console.error(`[Router 404] Path not found: ${currentPath}`)
      return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-4">
          <h1 className="text-2xl font-bold">404 - Page Not Found</h1>
          <p className="text-muted-foreground">Path: {currentPath}</p>
          <a href="/" className="text-primary underline">
            Go home
          </a>
        </div>
      )
    },
  })

  return router
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
