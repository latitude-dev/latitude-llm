import { beforeEach, describe, expect, it, vi } from "vitest"
import { expectRedirect } from "./test-utils.ts"

const { listOrganizationsMock, setActiveOrganizationMock } = vi.hoisted(() => ({
  listOrganizationsMock: vi.fn(),
  setActiveOrganizationMock: vi.fn(),
}))
vi.mock("../domains/organizations/organizations.functions.ts", () => ({ listOrganizations: listOrganizationsMock }))
vi.mock("../domains/auth/auth.functions.ts", () => ({ setActiveOrganization: setActiveOrganizationMock }))

const { resolveEntryDestination } = await import("./entry-destination.ts")

const org = (id: string) => ({ id, name: id, slug: `${id}-slug` })

describe("resolveEntryDestination", () => {
  beforeEach(() => {
    listOrganizationsMock.mockReset()
    setActiveOrganizationMock.mockReset()
  })

  it("sends a user with no orgs to create their first one, without activating", async () => {
    listOrganizationsMock.mockResolvedValue([])
    expect(await resolveEntryDestination()).toEqual({ kind: "welcome" })
    expect(setActiveOrganizationMock).not.toHaveBeenCalled()
  })

  it("treats a null org list as no orgs", async () => {
    listOrganizationsMock.mockResolvedValue(null)
    expect(await resolveEntryDestination()).toEqual({ kind: "welcome" })
  })

  it("activates the sole org and redirects into the app", async () => {
    listOrganizationsMock.mockResolvedValue([org("acme")])
    const options = await expectRedirect(() => resolveEntryDestination())
    expect(options.to).toBe("/")
    expect(setActiveOrganizationMock).toHaveBeenCalledWith({
      data: { organizationId: "acme", organizationSlug: "acme-slug" },
    })
  })

  it("sends a user with several orgs to the picker, carrying the list, without activating", async () => {
    const orgs = [org("a"), org("b")]
    listOrganizationsMock.mockResolvedValue(orgs)
    expect(await resolveEntryDestination()).toEqual({ kind: "choose", organizations: orgs })
    expect(setActiveOrganizationMock).not.toHaveBeenCalled()
  })
})
