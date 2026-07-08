import { z } from "zod"

// Shared by the `completeOnboarding` server fn (`inputValidator`) and the welcome form.
export const completeOnboardingInputSchema = z.object({
  name: z
    .string()
    .transform((value) => value.trim())
    .pipe(z.string().min(1, "Please enter your name").max(256)),
  organizationName: z
    .string()
    .transform((value) => value.trim())
    .pipe(z.string().min(1, "Please enter an organization name").max(256)),
})

// Injected so ordering + error-propagation are unit-testable without Better Auth / Postgres.
export interface CompleteOnboardingDeps {
  readonly updateUserName: (name: string) => Promise<void>
  readonly generateOrganizationSlug: (organizationName: string) => Promise<string>
  readonly createOrganization: (input: { readonly name: string; readonly slug: string }) => Promise<{
    readonly id: string
  }>
  readonly provisionWorkspace: (input: {
    readonly organizationId: string
    readonly actorUserId: string
    readonly name: string
    readonly slug: string
    readonly defaultProjectName: string
  }) => Promise<{ readonly defaultProjectSlug: string }>
  readonly setActiveOrganization: (input: {
    readonly organizationId: string
    readonly organizationSlug: string
  }) => Promise<void>
}

interface RunCompleteOnboardingInput {
  readonly actorUserId: string
  readonly name: string
  readonly organizationName: string
}

interface CompleteOnboardingResult {
  readonly defaultProjectSlug: string
}

// Ordered steps: name user → slug → create org → provision workspace → activate. Any reject aborts the rest.
export async function runCompleteOnboarding(
  deps: CompleteOnboardingDeps,
  input: RunCompleteOnboardingInput,
): Promise<CompleteOnboardingResult> {
  await deps.updateUserName(input.name)

  const slug = await deps.generateOrganizationSlug(input.organizationName)
  const organization = await deps.createOrganization({ name: input.organizationName, slug })

  const workspace = await deps.provisionWorkspace({
    organizationId: organization.id,
    actorUserId: input.actorUserId,
    name: input.organizationName,
    slug,
    defaultProjectName: `${input.organizationName}'s project`,
  })

  await deps.setActiveOrganization({ organizationId: organization.id, organizationSlug: slug })

  return { defaultProjectSlug: workspace.defaultProjectSlug }
}
