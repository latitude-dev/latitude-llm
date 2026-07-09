import { describe, expect, it, vi } from "vitest"
import type { EntryDestination } from "../../../lib/entry-destination.ts"
import { expectRedirect } from "../../../lib/test-utils.ts"
import { type AuthenticatedLoaderDeps, authenticatedLoader } from "./loader.ts"

const session = (overrides: Record<string, unknown> = {}) => ({
  user: { email: "user@acme.com" },
  session: { activeOrganizationId: "org-1", ...overrides },
})

const makeDeps = (overrides: Partial<AuthenticatedLoaderDeps> = {}): AuthenticatedLoaderDeps =>
  ({
    getSession: vi.fn(async () => session()),
    resolveEntryDestination: vi.fn(async (): Promise<EntryDestination> => ({ kind: "welcome" })),
    listProjects: vi.fn(async () => [{ id: "p1" }]),
    createProject: vi.fn(async () => ({ slug: "my-project" })),
    getSupportUserIdentity: vi.fn(async () => ({ hash: "sig" })),
    getBillingOverview: vi.fn(async () => ({ planSlug: "pro" })),
    isLatitudeStaffEmail: vi.fn(() => false),
    isProjectOnboardingPathname: vi.fn(() => false),
    ...overrides,
  }) as unknown as AuthenticatedLoaderDeps

const at = { pathname: "/projects/acme/traces" }

describe("authenticatedLoader", () => {
  it("redirects to /login when there is no session", async () => {
    const options = await expectRedirect(() =>
      authenticatedLoader(
        makeDeps({ getSession: vi.fn(async () => null) as unknown as AuthenticatedLoaderDeps["getSession"] }),
        at,
      ),
    )
    expect(options.to).toBe("/login")
  })

  it("routes a session with no active org via resolveEntryDestination (choose)", async () => {
    const options = await expectRedirect(() =>
      authenticatedLoader(
        makeDeps({
          getSession: vi.fn(async () =>
            session({ activeOrganizationId: undefined }),
          ) as unknown as AuthenticatedLoaderDeps["getSession"],
          resolveEntryDestination: vi.fn(
            async (): Promise<EntryDestination> => ({
              kind: "choose",
              organizations: [],
            }),
          ) as unknown as AuthenticatedLoaderDeps["resolveEntryDestination"],
        }),
        at,
      ),
    )
    expect(options.to).toBe("/choose-organization")
  })

  it("routes a session with no active org to /welcome when they have none", async () => {
    const options = await expectRedirect(() =>
      authenticatedLoader(
        makeDeps({
          getSession: vi.fn(async () =>
            session({ activeOrganizationId: null }),
          ) as unknown as AuthenticatedLoaderDeps["getSession"],
          resolveEntryDestination: vi.fn(
            async (): Promise<EntryDestination> => ({
              kind: "welcome",
            }),
          ) as unknown as AuthenticatedLoaderDeps["resolveEntryDestination"],
        }),
        at,
      ),
    )
    expect(options.to).toBe("/welcome")
  })

  it("creates a project and redirects to onboarding when the org has none (off the onboarding path)", async () => {
    const createProject = vi.fn(async () => ({ slug: "fresh-project" }))
    const options = await expectRedirect(() =>
      authenticatedLoader(
        makeDeps({
          listProjects: vi.fn(async () => []) as unknown as AuthenticatedLoaderDeps["listProjects"],
          createProject: createProject as unknown as AuthenticatedLoaderDeps["createProject"],
          isProjectOnboardingPathname: vi.fn(
            () => false,
          ) as unknown as AuthenticatedLoaderDeps["isProjectOnboardingPathname"],
        }),
        at,
      ),
    )
    expect(options.to).toBe("/projects/$projectSlug/onboarding")
    expect(options.params).toEqual({ projectSlug: "fresh-project" })
    expect(createProject).toHaveBeenCalledOnce()
  })

  it("does not self-heal a project while already on the onboarding path", async () => {
    const createProject = vi.fn(async () => ({ slug: "x" }))
    const result = await authenticatedLoader(
      makeDeps({
        listProjects: vi.fn(async () => []) as unknown as AuthenticatedLoaderDeps["listProjects"],
        createProject: createProject as unknown as AuthenticatedLoaderDeps["createProject"],
        isProjectOnboardingPathname: vi.fn(
          () => true,
        ) as unknown as AuthenticatedLoaderDeps["isProjectOnboardingPathname"],
      }),
      { pathname: "/projects/acme/onboarding" },
    )
    expect(createProject).not.toHaveBeenCalled()
    expect(result.organizationId).toBe("org-1")
  })

  it("returns the active org context with the billing overview for a tracked user", async () => {
    const result = await authenticatedLoader(makeDeps(), at)
    expect(result).toMatchObject({
      organizationId: "org-1",
      impersonatedBy: null,
      organizationBilling: { planSlug: "pro" },
    })
  })

  it("surfaces impersonation and skips billing for an impersonated (non-staff) session", async () => {
    const getBillingOverview = vi.fn(async () => ({ planSlug: "pro" }))
    const result = await authenticatedLoader(
      makeDeps({
        getSession: vi.fn(async () =>
          session({ impersonatedBy: "admin-9" }),
        ) as unknown as AuthenticatedLoaderDeps["getSession"],
        isLatitudeStaffEmail: vi.fn(() => false) as unknown as AuthenticatedLoaderDeps["isLatitudeStaffEmail"],
        getBillingOverview: getBillingOverview as unknown as AuthenticatedLoaderDeps["getBillingOverview"],
      }),
      at,
    )
    expect(result.impersonatedBy).toBe("admin-9")
    expect(getBillingOverview).not.toHaveBeenCalled()
    expect(result.organizationBilling).toBeNull()
  })

  it("skips the billing lookup for staff (excluded from analytics)", async () => {
    const getBillingOverview = vi.fn(async () => ({ planSlug: "pro" }))
    const result = await authenticatedLoader(
      makeDeps({
        isLatitudeStaffEmail: vi.fn(() => true) as unknown as AuthenticatedLoaderDeps["isLatitudeStaffEmail"],
        getBillingOverview: getBillingOverview as unknown as AuthenticatedLoaderDeps["getBillingOverview"],
      }),
      at,
    )
    expect(getBillingOverview).not.toHaveBeenCalled()
    expect(result.organizationBilling).toBeNull()
  })

  it("degrades to a null plan when billing lookup fails", async () => {
    const result = await authenticatedLoader(
      makeDeps({
        getBillingOverview: vi.fn(async () => {
          throw new Error("billing down")
        }) as unknown as AuthenticatedLoaderDeps["getBillingOverview"],
      }),
      at,
    )
    expect(result.organizationBilling).toBeNull()
  })
})
