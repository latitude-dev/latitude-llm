import { ApiKeyRepository, DEFAULT_API_KEY_NAME } from "@domain/api-keys"
import { organizationIdSchema } from "@domain/shared"
import { ApiKeyRepositoryLive, withPostgres } from "@platform/db-postgres"
import { withTracing } from "@repo/observability"
import { createServerFn } from "@tanstack/react-start"
import { Effect } from "effect"
import { z } from "zod"
import { getPostgresClient } from "../../server/clients.ts"
import { sandboxMiddleware } from "../../server/sandbox-middleware.ts"

/**
 * The sandbox's default `lat_sandbox_` API-key token, for the onboarding empty
 * state. Scoped to the sandbox org (behind `sandboxMiddleware`) so it returns
 * the *sandbox's* key — never the parent's live key, which would route dev
 * traffic to production. Returns `null` if no key exists yet.
 */
export const getSandboxDefaultApiKey = createServerFn({ method: "GET" })
  .middleware([sandboxMiddleware])
  .inputValidator(z.object({ sandboxOrgId: organizationIdSchema }))
  .handler(async ({ context }): Promise<{ readonly token: string | null }> => {
    const client = getPostgresClient()
    const keys = await Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* ApiKeyRepository
        return yield* repo.list()
      }).pipe(withPostgres(ApiKeyRepositoryLive, client, context.sandbox.organizationId), withTracing),
    )
    const defaultKey = keys.find((k) => k.name === DEFAULT_API_KEY_NAME) ?? keys[0]
    return { token: defaultKey?.token ?? null }
  })
