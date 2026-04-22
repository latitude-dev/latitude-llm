import { Toaster } from "@repo/ui"
import "@repo/ui/styles/globals.css"
import { HotkeysProvider } from "@tanstack/react-hotkeys"
import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router"
import type { ReactNode } from "react"
import { lazy, Suspense } from "react"
import { getThemePreference } from "../domains/theme/theme.functions.ts"
import { GTM_CONTAINER_ID } from "../lib/analytics/gtm.ts"
import { SignupCompleteWatcher } from "../lib/analytics/signup-complete-watcher.tsx"
import { ErrorFallback } from "../lib/client-error-reporting.tsx"
import { AppQueryProvider } from "../lib/data/query-client.tsx"
import { PostHogProvider } from "../lib/posthog/posthog-provider.tsx"
import { useThemePreference } from "../lib/theme.ts"
import { useRootThemePreference } from "./-root-route-data.ts"

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
  loader: async () => {
    const theme = await getThemePreference()

    return { theme }
  },
  head: () => ({
    scripts: GTM_CONTAINER_ID
      ? [
          {
            children: `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${GTM_CONTAINER_ID}');`,
          },
        ]
      : [],
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
        {GTM_CONTAINER_ID ? (
          <noscript>
            <iframe
              title="Google Tag Manager"
              src={`https://www.googletagmanager.com/ns.html?id=${GTM_CONTAINER_ID}`}
              height="0"
              width="0"
              style={{ display: "none", visibility: "hidden" }}
            />
          </noscript>
        ) : null}
        <PostHogProvider />
        <SignupCompleteWatcher />
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
