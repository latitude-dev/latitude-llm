import { createFileRoute } from "@tanstack/react-router"
import { getBetterAuth } from "../../../server/clients.ts"

const buildTargetUrl = (request: Request): string => {
  const target = new URL(request.url)
  target.pathname = "/api/auth/.well-known/openid-configuration"
  target.search = ""
  return target.toString()
}

const handleMetadata = ({ request }: { request: Request }): Promise<Response> =>
  getBetterAuth().handler(new Request(buildTargetUrl(request), request))

export const Route = createFileRoute("/.well-known/openid-configuration/$")({
  server: {
    handlers: {
      GET: handleMetadata,
      HEAD: handleMetadata,
    },
  },
})
