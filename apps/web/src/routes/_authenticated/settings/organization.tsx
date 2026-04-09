import { Button, Container, FormWrapper, Input, useToast } from "@repo/ui"
import { eq } from "@tanstack/react-db"
import { createFileRoute, getRouteApi, useRouter } from "@tanstack/react-router"
import { useEffect, useState } from "react"
import {
  updateOrganizationMutation,
  useOrganizationsCollection,
} from "../../../domains/organizations/organizations.collection.ts"
import { toUserMessage } from "../../../lib/errors.ts"
import { SettingsPageHeader } from "./-components/settings-page-header.tsx"

const authRoute = getRouteApi("/_authenticated")

export const Route = createFileRoute("/_authenticated/settings/organization")({
  component: OrganizationSettingsRoutePage,
})

function OrganizationSettingsRoutePage() {
  return <OrganizationSettingsPanel />
}

export function OrganizationSettingsPanel() {
  const { organizationId } = authRoute.useRouteContext()
  const { toast } = useToast()
  const router = useRouter()
  const { data: org } = useOrganizationsCollection((orgs) =>
    orgs.where(({ organizations }) => eq(organizations.id, organizationId)).findOne(),
  )
  const [name, setName] = useState("")
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (org) setName(org.name)
  }, [org?.id, org?.name])

  if (!org) return null

  const trimmed = name.trim()
  const baseline = org.name.trim()
  const isUnchanged = trimmed === baseline
  const canSave = trimmed.length > 0 && !isUnchanged && !isSaving

  const handleSave = async () => {
    if (!canSave) return
    setIsSaving(true)
    try {
      const transaction = updateOrganizationMutation(org.id, { name: trimmed })
      await transaction.isPersisted.promise
      toast({ description: "Organization name updated" })
      void router.invalidate()
    } catch (error) {
      toast({ variant: "destructive", description: toUserMessage(error) })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Container className="flex flex-col gap-8 p-6">
      <SettingsPageHeader title="Organization" description="Manage your organization details." />
      <div className="flex max-w-lg flex-col gap-[24px]">
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
          <Button type="button" size="sm" disabled={!canSave} onClick={() => void handleSave()}>
            {isSaving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </Container>
  )
}
