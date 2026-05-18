import type { Organization } from "@domain/organizations"
import { Button, Input, useToast } from "@repo/ui"
import { eq } from "@tanstack/react-db"
import { useForm } from "@tanstack/react-form"
import { createFileRoute } from "@tanstack/react-router"
import {
  updateOrganizationMutation,
  useOrganizationsCollection,
} from "../../../../../domains/organizations/organizations.collection.ts"
import { toUserMessage } from "../../../../../lib/errors.ts"
import { createFormSubmitHandler, fieldErrorsAsStrings } from "../../../../../lib/form-server-action.ts"
import { useAuthenticatedOrganizationId } from "../../../-route-data.ts"
import { SettingsPage } from "./-components/settings-page.tsx"

export const Route = createFileRoute("/_authenticated/projects/$projectSlug/settings/organization")({
  component: OrganizationSettingsPage,
})

function OrganizationNameSection() {
  const organizationId = useAuthenticatedOrganizationId()
  const { data: org } = useOrganizationsCollection((orgs) =>
    orgs.where(({ organizations }) => eq(organizations.id, organizationId)).findOne(),
  )

  if (!org) return null
  return <OrganizationNameForm org={org} />
}

function OrganizationNameForm({ org }: { org: Organization }) {
  const { toast } = useToast()

  const form = useForm({
    defaultValues: { name: org.name },
    onSubmit: createFormSubmitHandler(
      async ({ name }) => {
        const trimmed = name.trim()
        const transaction = updateOrganizationMutation(org.id, { name: trimmed })
        await transaction.isPersisted.promise
      },
      {
        resetOnSuccess: false,
        onSuccess: () => {
          toast({ description: "Organization name updated" })
        },
        onError: (error) => {
          toast({ variant: "destructive", description: toUserMessage(error) })
        },
      },
    ),
  })

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault()
        void form.handleSubmit()
      }}
    >
      <form.Field name="name">
        {(field) => (
          <Input
            key={org.id}
            type="text"
            name={field.name}
            label="Organization name"
            value={field.state.value}
            onChange={(e) => field.handleChange(e.target.value)}
            errors={fieldErrorsAsStrings(field.state.meta.errors)}
            placeholder="Organization name"
            aria-label="Organization name"
          />
        )}
      </form.Field>
      <div className="self-start">
        <Button type="submit" isLoading={form.state.isSubmitting}>
          Save
        </Button>
      </div>
    </form>
  )
}

function OrganizationSettingsPage() {
  return (
    <SettingsPage title="Organization" description="Manage your organization details">
      <div className="flex w-full flex-col gap-6 @[800px]:w-1/2">
        <OrganizationNameSection />
      </div>
    </SettingsPage>
  )
}
