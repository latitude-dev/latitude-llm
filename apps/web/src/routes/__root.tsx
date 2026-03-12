import { Toaster } from "@repo/ui"
import "@repo/ui/styles/globals.css"
import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router"
import { Agentation } from "agentation"
import type { ReactNode } from "react"
import { useEffect } from "react"
import { AppQueryProvider } from "../lib/data/query-client.tsx"

const TITLE = "Latitude - The Agent Engineering Platform"
const DESCRIPTION =
  "Latitude is the platform for building and running AI agents without code. With Latte, you can create complex automations using a single prompt. Latitude handles everything: creating the agents, connecting them to 2,500+ tools, and deploying them into production."
const URL = "https://app.latitude.so"
const HOST_THEME_MEDIA_QUERY = "(prefers-color-scheme: dark)"

export const Route = createRootRoute({
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
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <HostThemeSync />
        <AppQueryProvider>
          {children}
          <Toaster />
          {process.env.NODE_ENV === "development" && <Agentation endpoint="http://localhost:4747" />}
        </AppQueryProvider>
        <Scripts />
      </body>
    </html>
  )
}

function HostThemeSync() {
  useEffect(() => {
    const root = document.documentElement
    const media = window.matchMedia(HOST_THEME_MEDIA_QUERY)

    const applyTheme = (isDark: boolean) => {
      root.classList.toggle("dark", isDark)
      root.style.colorScheme = isDark ? "dark" : "light"
    }

    applyTheme(media.matches)

    const onThemeChange = (event: MediaQueryListEvent) => {
      applyTheme(event.matches)
    }

    media.addEventListener("change", onThemeChange)

    return () => {
      media.removeEventListener("change", onThemeChange)
    }
  }, [])

  return null
}
