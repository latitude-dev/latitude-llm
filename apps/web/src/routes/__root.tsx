import { Toaster } from "@repo/ui"
import "@repo/ui/styles/globals.css"
import { HotkeysProvider } from "@tanstack/react-hotkeys"
import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router"
import type { ReactNode } from "react"
import { lazy, Suspense } from "react"
import { getThemePreference } from "../domains/theme/theme.functions.ts"
import { ErrorFallback } from "../lib/client-error-reporting.tsx"
import { AppQueryProvider } from "../lib/data/query-client.tsx"
import { PostHogProvider } from "../lib/posthog/posthog-provider.tsx"
import { useThemePreference } from "../lib/theme.ts"
import { useRootThemePreference } from "./-root-route-data.ts"

const TITLE = "Latitude - AI Agent Observability & Monitoring"
const DESCRIPTION =
  "Open-source AI agent monitoring platform. Full observability into what's failing in production. Discover underlying issues and get alerts when something breaks."
const URL = "https://console.latitude.so"
const AgentationToolbar = import.meta.env.DEV
  ? lazy(() => import("agentation").then((module) => ({ default: module.Agentation })))
  : null

export const Route = createRootRoute({
  errorComponent: ({ error, info, reset }) => (
    <ErrorFallback error={error} componentStack={info?.componentStack ?? null} reset={reset} />
  ),
  loader: async () => {
    const theme = await getThemePreference()

    return { theme }
  },
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
  const initialTheme = useRootThemePreference()
  const { theme } = useThemePreference(initialTheme)

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
        <PostHogProvider />
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
