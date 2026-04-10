import { Toaster } from "@repo/ui"
import "@repo/ui/styles/globals.css"
import { HotkeysProvider } from "@tanstack/react-hotkeys"
import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router"
import type { ReactNode } from "react"
import { lazy, Suspense } from "react"
import { ErrorFallback } from "../lib/client-error-reporting.tsx"
import { AppQueryProvider } from "../lib/data/query-client.tsx"
import { useThemePreference } from "../lib/theme.ts"

const TITLE = "Latitude - The Agent Engineering Platform"
const DESCRIPTION =
  "Latitude is the platform for building and running AI agents without code. With Latte, you can create complex automations using a single prompt. Latitude handles everything: creating the agents, connecting them to 2,500+ tools, and deploying them into production."
const URL = "https://app.latitude.so"
const AgentationToolbar = import.meta.env.DEV
  ? lazy(() => import("agentation").then((module) => ({ default: module.Agentation })))
  : null

export const Route = createRootRoute({
  errorComponent: ({ error, info, reset }) => (
    <ErrorFallback error={error} componentStack={info?.componentStack ?? null} reset={reset} />
  ),
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { name: "color-scheme", content: "light dark" },
      { property: "og:type", content: "website" },
      { property: "og:url", content: URL },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:site_name", content: "Latitude" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:url", content: URL },
      { name: "twitter:title", content: TITLE },
      { name: "twitter:description", content: DESCRIPTION },
    ],
    links: [{ rel: "icon", type: "image/svg+xml", href: "/favicon.svg" }],
  }),
  component: RootComponent,
})

function RootComponent() {
  return (
    <RootDocument>
      <Outlet />
    </RootDocument>
  )
}

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  const { theme } = useThemePreference()

  return (
    <html
      lang="en"
      className={theme === "dark" ? "dark" : undefined}
      style={{ colorScheme: theme }}
      suppressHydrationWarning
    >
      <head>
        <HeadContent />
      </head>
      <body>
        <AppQueryProvider>
          <HotkeysProvider>{children}</HotkeysProvider>
          <Toaster />
          {AgentationToolbar !== null ? (
            <Suspense fallback={null}>
              <AgentationToolbar endpoint="http://localhost:4747" />
            </Suspense>
          ) : null}
        </AppQueryProvider>
        <Scripts />
      </body>
    </html>
  )
}
