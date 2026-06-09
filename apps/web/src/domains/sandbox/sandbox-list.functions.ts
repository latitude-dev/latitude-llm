import { SandboxRepository } from "@domain/sandboxes"
import { SandboxRepositoryLive, withPostgres } from "@platform/db-postgres"
import { withTracing } from "@repo/observability"
import { createServerFn } from "@tanstack/react-start"
import { Effect } from "effect"
import { requireSession } from "../../server/auth.ts"
import { getAdminPostgresClient } from "../../server/clients.ts"

/**
 * A sandbox as seen from its *parent* live org — the shape the switcher and the
 * "your sandboxes" settings list render. The `organizationId` is the sandbox
 * org's own id (used to route into `/sandbox/:sandboxOrgId/...`).
 */
export interface SandboxListItemDto {
  readonly organizationId: string
  readonly name: string
  readonly slug: string
  readonly status: "active" | "archived"
  readonly lastActivityAt: string
  readonly createdAt: string
  readonly owner: { readonly name: string | null; readonly email: string } | null
}

/**
 * Lists every sandbox (active *and* archived) owned by the caller's active
 * (parent) org. Reads on the admin client because each sandbox's rows are
 * RLS-scoped to its *own* org, so a parent-scoped connection can't see them;
 * authorization is the session itself — the caller can only ever list their
 * own active org's family.
 */
export const listSandboxesForParentOrg = createServerFn({ method: "GET" }).handler(
  async (): Promise<readonly SandboxListItemDto[]> => {
    const { organizationId } = await requireSession()
    const client = getAdminPostgresClient()

    const items = await Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* SandboxRepository
        return yield* repo.listByParentOrgId(organizationId)
      }).pipe(withPostgres(SandboxRepositoryLive, client, organizationId), withTracing),
    )

    return items.map((item) => ({
      organizationId: item.sandbox.organizationId,
      name: item.organizationName,
      slug: item.organizationSlug,
      status: item.sandbox.status,
      lastActivityAt: item.sandbox.lastActivityAt.toISOString(),
      createdAt: item.sandbox.createdAt.toISOString(),
      owner: item.owner ? { name: item.owner.name, email: item.owner.email } : null,
    }))
  },
)
