import { generateId, OrganizationId, RepositoryError, SqlClient, UserId } from "@domain/shared"
import { createFakeSqlClient } from "@domain/shared/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { SANDBOX_IDLE_ARCHIVE_DAYS } from "../constants.ts"
import { createSandbox } from "../entities/sandbox.ts"
import { SandboxRepository } from "../ports/sandbox-repository.ts"
import { createFakeSandboxRepository } from "../testing/fake-sandbox-repository.ts"
import { archiveIdleSandboxesUseCase } from "./archive-idle-sandboxes.ts"

const NOW = new Date("2026-06-08T03:00:00.000Z")
const DAY_MS = 24 * 60 * 60_000
const CREATED_BY = UserId(generateId())

const sandboxOrg = (n: number) => OrganizationId(`s${n}`.padEnd(24, "0"))

const seedSandbox = (
  fake: ReturnType<typeof createFakeSandboxRepository>,
  n: number,
  opts: { daysIdle: number; status?: "active" | "archived" },
) => {
  const organizationId = sandboxOrg(n)
  fake.sandboxes.set(
    organizationId,
    createSandbox({
      organizationId,
      createdByUserId: CREATED_BY,
      status: opts.status ?? "active",
      lastActivityAt: new Date(NOW.getTime() - opts.daysIdle * DAY_MS),
    }),
  )
  return organizationId
}

const provide = (fake: ReturnType<typeof createFakeSandboxRepository>) =>
  Layer.mergeAll(
    Layer.succeed(SandboxRepository, fake.repository),
    Layer.succeed(SqlClient, createFakeSqlClient({ organizationId: sandboxOrg(0) })),
  )

describe("archiveIdleSandboxesUseCase", () => {
  it("archives only active sandboxes idle past the flat threshold", async () => {
    const fake = createFakeSandboxRepository()
    seedSandbox(fake, 1, { daysIdle: SANDBOX_IDLE_ARCHIVE_DAYS + 1 }) // idle 8d → archive
    seedSandbox(fake, 2, { daysIdle: SANDBOX_IDLE_ARCHIVE_DAYS - 1 }) // idle 6d → keep
    seedSandbox(fake, 3, { daysIdle: 30 }) // idle 30d → archive

    const result = await Effect.runPromise(
      archiveIdleSandboxesUseCase({ now: () => NOW }).pipe(Effect.provide(provide(fake))),
    )

    expect(result).toEqual({ archived: 2 })
    expect(fake.sandboxes.get(sandboxOrg(1))?.status).toBe("archived")
    expect(fake.sandboxes.get(sandboxOrg(2))?.status).toBe("active")
    expect(fake.sandboxes.get(sandboxOrg(3))?.status).toBe("archived")
  })

  it("treats activity exactly at the cutoff as not-yet-idle", async () => {
    const fake = createFakeSandboxRepository()
    seedSandbox(fake, 1, { daysIdle: SANDBOX_IDLE_ARCHIVE_DAYS }) // exactly 7d → not strictly older → keep

    const result = await Effect.runPromise(
      archiveIdleSandboxesUseCase({ now: () => NOW }).pipe(Effect.provide(provide(fake))),
    )

    expect(result).toEqual({ archived: 0 })
    expect(fake.sandboxes.get(sandboxOrg(1))?.status).toBe("active")
  })

  it("ignores already-archived sandboxes (idempotent)", async () => {
    const fake = createFakeSandboxRepository()
    seedSandbox(fake, 1, { daysIdle: 30, status: "archived" })

    const result = await Effect.runPromise(
      archiveIdleSandboxesUseCase({ now: () => NOW }).pipe(Effect.provide(provide(fake))),
    )

    expect(result).toEqual({ archived: 0 })
  })

  it("propagates an archiveIdle failure", async () => {
    const fake = createFakeSandboxRepository({
      archiveIdle: () => Effect.fail(new RepositoryError({ cause: "boom", operation: "archiveIdle" })),
    })

    const exit = await Effect.runPromiseExit(
      archiveIdleSandboxesUseCase({ now: () => NOW }).pipe(Effect.provide(provide(fake))),
    )

    expect(exit._tag).toBe("Failure")
  })
})
