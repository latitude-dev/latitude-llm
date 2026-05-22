import { createFileRoute } from "@tanstack/react-router"
import { validateOAuthClientRegistrationMetadata } from "../../../lib/oauth-url-validation.ts"
import { getBetterAuth } from "../../../server/clients.ts"

const MCP_REGISTER_PATH = "/api/auth/mcp/register"

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
        return getBetterAuth().handler(request)
      },
      POST: async ({ request }: { request: Request }) => {
        const validationError = await validateMcpRegistrationRequest(request)
        if (validationError) return validationError

        return getBetterAuth().handler(request)
      },
    },
  },
})
