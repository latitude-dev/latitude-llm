import { Button, Container, FormWrapper, Input, useToast } from "@repo/ui"
import { eq } from "@tanstack/react-db"
import { createFileRoute, useRouter } from "@tanstack/react-router"
import { useEffect, useState } from "react"
import {
  updateOrganizationMutation,
  useOrganizationsCollection,
} from "../../../domains/organizations/organizations.collection.ts"
import { SettingsPageHeader } from "./-components/settings-page-header.tsx"

export const Route = createFileRoute("/_authenticated/settings/organization")({
  component: OrganizationSettingsPage,
})

function OrganizationSettingsPage() {
  const { organizationId } = Route.useRouteContext()
  const { toast } = useToast()
  const router = useRouter()
  const { data: org } = useOrganizationsCollection((orgs) =>
    orgs.where(({ organizations }) => eq(organizations.id, organizationId)).findOne(),
  )
  const [name, setName] = useState("")

  useEffect(() => {
    if (org) setName(org.name)
  }, [org?.id, org?.name])

  if (!org) return null

  const trimmed = name.trim()
  const isUnchanged = trimmed === org.name
  const canSave = trimmed.length > 0 && !isUnchanged

  const handleSave = () => {
    if (!canSave) return
    updateOrganizationMutation(org.id, { name: trimmed })
    toast({ description: "Organization name updated" })
    void router.invalidate()
  }

  return (
    <Container className="flex flex-col gap-8 p-6">
      <SettingsPageHeader title="Organization" description="Manage your organization details." />
      <div className="flex max-w-lg flex-col gap-8">
        <FormWrapper>
          <Input
            required
            type="text"
            label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Organization name"
          />
        </FormWrapper>
        <div>
          <Button type="button" size="sm" disabled={!canSave} onClick={handleSave}>
            Save
          </Button>
        </div>
      </div>
    </Container>
  )
}
