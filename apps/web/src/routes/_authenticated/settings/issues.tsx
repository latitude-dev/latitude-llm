import { Container, Label, Switch, Text, useToast } from "@repo/ui"
import { eq } from "@tanstack/react-db"
import { createFileRoute } from "@tanstack/react-router"
import { useState } from "react"
import {
  updateOrganizationMutation,
  useOrganizationsCollection,
} from "../../../domains/organizations/organizations.collection.ts"
import { toUserMessage } from "../../../lib/errors.ts"
import { useAuthenticatedOrganizationId } from "../-route-data.ts"

export const Route = createFileRoute("/_authenticated/settings/issues")({
  component: IssuesSettingsPage,
})

function IssuesSettingsPage() {
  const organizationId = useAuthenticatedOrganizationId()
  const { toast } = useToast()
  const { data: org } = useOrganizationsCollection((orgs) =>
    orgs.where(({ organizations }) => eq(organizations.id, organizationId)).findOne(),
  )
  const [isSaving, setIsSaving] = useState(false)

  const saveField = async (keepMonitoring: boolean) => {
    if (!org || isSaving) return

    setIsSaving(true)
    try {
      const transaction = updateOrganizationMutation(org.id, { settings: { keepMonitoring } })
      await transaction.isPersisted.promise
      toast({ description: "Monitoring preference updated" })
    } catch (error) {
      toast({ variant: "destructive", description: toUserMessage(error) })
    } finally {
      setIsSaving(false)
    }
  }

  if (!org) return null

  return (
    <Container className="flex flex-col gap-8 pt-14">
      <Text.H4 weight="bold">Issues</Text.H4>
      <div className="flex flex-col gap-4 rounded-lg border boder-secondary bg-secondary p-6">
        <div className="flex w-full flex-row items-center justify-between gap-4">
          <div className="flex flex-col gap-1">
            <Label htmlFor="keep-monitoring">Monitor resolved issues</Label>
            <Text.H6 color="foregroundMuted">
              When enabled, evaluations monitoring active issues stay active after the issues are resolved to detect
              further regressions
            </Text.H6>
          </div>
          <Switch
            id="keep-monitoring"
            checked={org.settings?.keepMonitoring ?? true}
            loading={isSaving}
            onCheckedChange={(checked) => void saveField(checked)}
          />
        </div>
      </div>
    </Container>
  )
}
