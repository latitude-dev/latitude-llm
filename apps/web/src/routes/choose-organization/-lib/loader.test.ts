import { describe, expect, it, vi } from "vitest"
import type { EntryDestination } from "../../../lib/entry-destination.ts"
import { expectRedirect } from "../../../lib/test-utils.ts"
import { type ChooseOrganizationLoaderDeps, chooseOrganizationLoader } from "./loader.ts"

const orgs = [
  { id: "a", name: "Acme", slug: "acme" },
  { id: "b", name: "Beta", slug: "beta" },
]

const makeDeps = (overrides: Partial<ChooseOrganizationLoaderDeps> = {}): ChooseOrganizationLoaderDeps =>
  ({
    getSession: vi.fn(async () => ({ user: {}, session: {} })),
    resolveEntryDestination: vi.fn(async (): Promise<EntryDestination> => ({ kind: "choose", organizations: orgs })),
    ...overrides,
  }) as unknown as ChooseOrganizationLoaderDeps

describe("chooseOrganizationLoader", () => {
  it("redirects to /login when there is no session", async () => {
    const options = await expectRedirect(() =>
      chooseOrganizationLoader(
        makeDeps({ getSession: vi.fn(async () => null) as unknown as ChooseOrganizationLoaderDeps["getSession"] }),
      ),
    )
    expect(options.to).toBe("/login")
  })

  it("redirects a user with no orgs to create one", async () => {
    const options = await expectRedirect(() =>
      chooseOrganizationLoader(
        makeDeps({
          resolveEntryDestination: vi.fn(
            async (): Promise<EntryDestination> => ({
              kind: "welcome",
            }),
          ) as unknown as ChooseOrganizationLoaderDeps["resolveEntryDestination"],
        }),
      ),
    )
    expect(options.to).toBe("/welcome")
  })

  it("returns the org list for the picker when the user has several", async () => {
    await expect(chooseOrganizationLoader(makeDeps())).resolves.toEqual({ organizations: orgs })
  })
})
