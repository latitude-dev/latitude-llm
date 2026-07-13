import { describe, expect, it, vi } from "vitest"
import {
  type CompleteOnboardingDeps,
  completeOnboardingInputSchema,
  runCompleteOnboarding,
} from "./complete-onboarding.ts"

describe("completeOnboardingInputSchema", () => {
  it("accepts a valid name + organization name", () => {
    const result = completeOnboardingInputSchema.safeParse({ name: "John Doe", organizationName: "Acme Inc." })
    expect(result.success).toBe(true)
  })

  it("trims both fields", () => {
    const result = completeOnboardingInputSchema.safeParse({ name: "  John Doe  ", organizationName: "  Acme  " })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toEqual({ name: "John Doe", organizationName: "Acme" })
    }
  })

  it("rejects a blank name with a friendly message", () => {
    const result = completeOnboardingInputSchema.safeParse({ name: "   ", organizationName: "Acme" })
    expect(result.success).toBe(false)
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path[0] === "name")
      expect(issue?.message).toBe("Please enter your name")
    }
  })

  it("rejects a blank organization name with a friendly message", () => {
    const result = completeOnboardingInputSchema.safeParse({ name: "John", organizationName: "  " })
    expect(result.success).toBe(false)
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path[0] === "organizationName")
      expect(issue?.message).toBe("Please enter an organization name")
    }
  })

  it("rejects fields above the max length", () => {
    expect(completeOnboardingInputSchema.safeParse({ name: "x".repeat(257), organizationName: "Acme" }).success).toBe(
      false,
    )
    expect(completeOnboardingInputSchema.safeParse({ name: "John", organizationName: "x".repeat(257) }).success).toBe(
      false,
    )
  })

  it("rejects missing fields", () => {
    expect(completeOnboardingInputSchema.safeParse({ name: "John" }).success).toBe(false)
    expect(completeOnboardingInputSchema.safeParse({ organizationName: "Acme" }).success).toBe(false)
  })
})

const makeDeps = (overrides: Partial<CompleteOnboardingDeps> = {}) => {
  const calls: string[] = []
  const deps: CompleteOnboardingDeps = {
    updateUserName: vi.fn(async () => {
      calls.push("updateUserName")
    }),
    generateOrganizationSlug: vi.fn(async () => {
      calls.push("generateOrganizationSlug")
      return "acme"
    }),
    createOrganization: vi.fn(async () => {
      calls.push("createOrganization")
      return { id: "org-123" }
    }),
    provisionWorkspace: vi.fn(async () => {
      calls.push("provisionWorkspace")
      return { defaultProjectSlug: "acmes-project" }
    }),
    setActiveOrganization: vi.fn(async () => {
      calls.push("setActiveOrganization")
    }),
    ...overrides,
  }
  return { deps, calls }
}

const INPUT = { actorUserId: "user-1", name: "John Doe", organizationName: "Acme" }

describe("runCompleteOnboarding", () => {
  it("returns the provisioned default project slug", async () => {
    const { deps } = makeDeps()
    const result = await runCompleteOnboarding(deps, INPUT)
    expect(result).toEqual({ defaultProjectSlug: "acmes-project" })
  })

  it("runs the steps in dependency order", async () => {
    const { deps, calls } = makeDeps()
    await runCompleteOnboarding(deps, INPUT)
    expect(calls).toEqual([
      "updateUserName",
      "generateOrganizationSlug",
      "createOrganization",
      "provisionWorkspace",
      "setActiveOrganization",
    ])
  })

  it("names the user, slugs and creates the org, then provisions + activates it with consistent ids", async () => {
    const { deps } = makeDeps()
    await runCompleteOnboarding(deps, INPUT)

    expect(deps.updateUserName).toHaveBeenCalledWith("John Doe")
    expect(deps.generateOrganizationSlug).toHaveBeenCalledWith("Acme")
    expect(deps.createOrganization).toHaveBeenCalledWith({ name: "Acme", slug: "acme" })
    expect(deps.provisionWorkspace).toHaveBeenCalledWith({
      organizationId: "org-123",
      actorUserId: "user-1",
      name: "Acme",
      slug: "acme",
      defaultProjectName: "Acme's project",
    })
    expect(deps.setActiveOrganization).toHaveBeenCalledWith({
      organizationId: "org-123",
      organizationSlug: "acme",
    })
  })

  it("aborts before creating the org when naming the user fails", async () => {
    const { deps } = makeDeps({
      updateUserName: vi.fn(async () => {
        throw new Error("name update failed")
      }),
    })

    await expect(runCompleteOnboarding(deps, INPUT)).rejects.toThrow("name update failed")
    expect(deps.createOrganization).not.toHaveBeenCalled()
    expect(deps.provisionWorkspace).not.toHaveBeenCalled()
    expect(deps.setActiveOrganization).not.toHaveBeenCalled()
  })

  it("does not provision or activate when org creation fails", async () => {
    const { deps } = makeDeps({
      createOrganization: vi.fn(async () => {
        throw new Error("org creation failed")
      }),
    })

    await expect(runCompleteOnboarding(deps, INPUT)).rejects.toThrow("org creation failed")
    expect(deps.updateUserName).toHaveBeenCalledTimes(1)
    expect(deps.provisionWorkspace).not.toHaveBeenCalled()
    expect(deps.setActiveOrganization).not.toHaveBeenCalled()
  })

  it("does not activate the org when provisioning fails", async () => {
    const { deps } = makeDeps({
      provisionWorkspace: vi.fn(async () => {
        throw new Error("provisioning failed")
      }),
    })

    await expect(runCompleteOnboarding(deps, INPUT)).rejects.toThrow("provisioning failed")
    expect(deps.createOrganization).toHaveBeenCalledTimes(1)
    expect(deps.setActiveOrganization).not.toHaveBeenCalled()
  })
})
