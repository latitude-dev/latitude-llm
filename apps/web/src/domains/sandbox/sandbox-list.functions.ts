import { SandboxRepository } from "@domain/sandboxes"
import { SandboxRepositoryLive, withPostgres } from "@platform/db-postgres"
import { withTracing } from "@repo/observability"
import { createServerFn } from "@tanstack/react-start"
import { Effect } from "effect"
import { requireSession } from "../../server/auth.ts"
import { getAdminPostgresClient } from "../../server/clients.ts"

/**
 * The sandbox org ids owned by the caller's active (parent) org — all the
 * sidebar toggle needs to find-or-navigate the org's single sandbox. Reads on
 * the admin client because each sandbox's rows are RLS-scoped to its *own* org,
 * so a parent-scoped connection can't see them; authorization is the session
 * itself — the caller can only ever list their own active org's family.
 */
export const listSandboxOrgIdsForParentOrg = createServerFn({ method: "GET" }).handler(
  async (): Promise<readonly string[]> => {
    const { organizationId } = await requireSession()
    const client = getAdminPostgresClient()

    const ids = await Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* SandboxRepository
        return yield* repo.listOrganizationIdsByParentOrgId(organizationId)
      }).pipe(withPostgres(SandboxRepositoryLive, client, organizationId), withTracing),
    )

    return ids.map((id) => String(id))
  },
)
