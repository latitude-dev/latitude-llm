import { describe, expect, it, vi } from "vitest"
import type { EntryDestination } from "../../../lib/entry-destination.ts"
import { expectRedirect } from "../../../lib/test-utils.ts"
import { type WelcomeLoaderDeps, welcomeLoader } from "./loader.ts"

const makeDeps = (overrides: Partial<WelcomeLoaderDeps> = {}): WelcomeLoaderDeps =>
  ({
    getSession: vi.fn(async () => ({ user: {}, session: {} })),
    resolveEntryDestination: vi.fn(async (): Promise<EntryDestination> => ({ kind: "welcome" })),
    ...overrides,
  }) as unknown as WelcomeLoaderDeps

describe("welcomeLoader", () => {
  it("redirects to /login when there is no session", async () => {
    const options = await expectRedirect(() =>
      welcomeLoader(makeDeps({ getSession: vi.fn(async () => null) as unknown as WelcomeLoaderDeps["getSession"] })),
    )
    expect(options.to).toBe("/login")
  })

  it("redirects a user with several orgs to the picker", async () => {
    const options = await expectRedirect(() =>
      welcomeLoader(
        makeDeps({
          resolveEntryDestination: vi.fn(
            async (): Promise<EntryDestination> => ({
              kind: "choose",
              organizations: [],
            }),
          ) as unknown as WelcomeLoaderDeps["resolveEntryDestination"],
        }),
      ),
    )
    expect(options.to).toBe("/choose-organization")
  })

  it("renders (resolves without redirecting) for the 0-org case", async () => {
    await expect(welcomeLoader(makeDeps())).resolves.toBeUndefined()
  })
})
