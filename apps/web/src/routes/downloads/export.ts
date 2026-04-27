import { parseEnvOptional } from "@platform/env"
import { verifySignedExportToken } from "@platform/storage-object"
import { withTracing } from "@repo/observability"
import { createFileRoute } from "@tanstack/react-router"
import { Effect } from "effect"
import { getStorageDisk } from "../../server/clients.ts"

export const Route = createFileRoute("/downloads/export")({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const url = new URL(request.url)
        const token = url.searchParams.get("token")
        if (!token) {
          return new Response("Missing token", { status: 400 })
        }

        const secret = Effect.runSync(parseEnvOptional("LAT_BETTER_AUTH_SECRET", "string"))
        if (!secret) {
          return new Response("Export downloads not configured", {
            status: 503,
          })
        }

        let key: string
        try {
          key = await Effect.runPromise(verifySignedExportToken(token, secret).pipe(withTracing))
        } catch {
          return new Response("Forbidden", { status: 403 })
        }

        const disk = getStorageDisk()
        const webStream = await disk.getStream(key).catch(() => null)
        if (!webStream) {
          return new Response("Not found", { status: 404 })
        }

        const filename = key.split("/").at(-1) ?? "export.zip"
        return new Response(webStream, {
          headers: {
            "Content-Type": "application/zip",
            "Content-Disposition": `attachment; filename="${filename}"`,
          },
        })
      },
    },
  },
})
