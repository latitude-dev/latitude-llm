import { HeadContent, Outlet, Scripts, createRootRoute } from "@tanstack/react-router"
import type { ReactNode } from "react"
import "@repo/ui/styles/globals.css"
import { AppQueryProvider } from "../lib/data/query-client.tsx"

const TITLE = "Latitude - The Agent Engineering Platform"
const DESCRIPTION =
  "Latitude is the platform for building and running AI agents without code. With Latte, you can create complex automations using a single prompt. Latitude handles everything: creating the agents, connecting them to 2,500+ tools, and deploying them into production."
const URL = "https://app.latitude.so"

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
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
        <AppQueryProvider>
          <Outlet />
        </AppQueryProvider>
        <Scripts />
      </body>
    </html>
  )
}
