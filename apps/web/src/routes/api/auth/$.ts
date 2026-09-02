import { createFileRoute } from "@tanstack/react-router"
import { validateOAuthClientRegistrationMetadata } from "../../../lib/oauth-url-validation.ts"
import { getBetterAuth } from "../../../server/clients.ts"

const MCP_REGISTER_PATH = "/api/auth/mcp/register"
// BA's get-session echoes the whole token row, refresh token included, to any bearer; nothing of ours calls it.
const MCP_GET_SESSION_PATH = "/api/auth/mcp/get-session"

const isBlockedAuthPath = (request: Request): boolean => new URL(request.url).pathname === MCP_GET_SESSION_PATH

const notFoundResponse = () =>
  new Response(JSON.stringify({ error: "not_found" }), {
    status: 404,
    headers: { "Content-Type": "application/json" },
  })

const invalidClientMetadataResponse = (description: string) =>
  new Response(JSON.stringify({ error: "invalid_client_metadata", error_description: description }), {
    status: 400,
    headers: { "Content-Type": "application/json" },
  })

const validateMcpRegistrationRequest = async (request: Request): Promise<Response | null> => {
  const url = new URL(request.url)
  if (url.pathname !== MCP_REGISTER_PATH) return null

  let body: unknown
  try {
    body = await request.clone().json()
  } catch {
    return invalidClientMetadataResponse("Client registration body must be valid JSON")
  }

  const validationError = validateOAuthClientRegistrationMetadata(body)
  return validationError ? invalidClientMetadataResponse(validationError) : null
}

export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        if (isBlockedAuthPath(request)) return notFoundResponse()

        return getBetterAuth().handler(request)
      },
      POST: async ({ request }: { request: Request }) => {
        if (isBlockedAuthPath(request)) return notFoundResponse()

        const validationError = await validateMcpRegistrationRequest(request)
        if (validationError) return validationError

        return getBetterAuth().handler(request)
      },
    },
  },
})
