import { NotFoundError, type OrganizationId } from "@domain/shared"
import { Effect } from "effect"
import type { Sandbox } from "../entities/sandbox.ts"
import type { SandboxRepository } from "../ports/sandbox-repository.ts"

type SandboxRepositoryShape = (typeof SandboxRepository)["Service"]

/**
 * In-memory fake keyed by the sandbox org id. `parentByOrganizationId` lets a
 * test attach a sandbox to a parent so `countActiveByParentOrgId` can resolve
 * the family without a real `organizations` join.
 */
export const createFakeSandboxRepository = (overrides?: Partial<SandboxRepositoryShape>) => {
  const sandboxes = new Map<OrganizationId, Sandbox>()
  const parentByOrganizationId = new Map<OrganizationId, OrganizationId>()
  let stampCount = 0

  const repository: SandboxRepositoryShape = {
    findOptional: () => Effect.succeed<Sandbox | null>(null),
    stampActivity: () =>
      Effect.sync(() => {
        stampCount++
      }),
    create: (sandbox) =>
      Effect.sync(() => {
        sandboxes.set(sandbox.organizationId, sandbox)
      }),

    findByOrganizationId: (organizationId) => {
      const sandbox = sandboxes.get(organizationId)
      if (!sandbox) return Effect.fail(new NotFoundError({ entity: "Sandbox", id: organizationId }))
      return Effect.succeed(sandbox)
    },

    countActiveByParentOrgId: (parentOrgId) =>
      Effect.succeed(
        [...sandboxes.values()].filter(
          (sandbox) =>
            sandbox.status === "active" && parentByOrganizationId.get(sandbox.organizationId) === parentOrgId,
        ).length,
      ),

    // No-op: in-memory tests are single-threaded, so there's no lock to take.
    lockParentForCapCheck: () => Effect.void,

    setStatus: (organizationId, status) =>
      Effect.sync(() => {
        const sandbox = sandboxes.get(organizationId)
        if (sandbox) sandboxes.set(organizationId, { ...sandbox, status })
      }),

    delete: (organizationId) =>
      Effect.sync(() => {
        sandboxes.delete(organizationId)
      }),
    ...overrides,
  }

  return {
    repository,
    sandboxes,
    parentByOrganizationId,
    get stampCount() {
      return stampCount
    },
  }
}
