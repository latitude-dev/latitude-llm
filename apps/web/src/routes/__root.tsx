import { HeadContent, Outlet, Scripts, createRootRoute } from "@tanstack/react-router"
import "@repo/ui/styles/globals.css"

export const Route = createRootRoute({
  component: () => (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <HeadContent />
      </head>
      <body>
        <Outlet />
        <Scripts />
      </body>
    </html>
  ),
})
