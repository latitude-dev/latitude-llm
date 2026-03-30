import { Container, Label, Switch, Text, useToast } from "@repo/ui"
import { eq } from "@tanstack/react-db"
import { createFileRoute } from "@tanstack/react-router"
import { useCallback, useRef } from "react"
import {
  updateOrganizationMutation,
  useOrganizationsCollection,
} from "../../../domains/organizations/organizations.collection.ts"

export const Route = createFileRoute("/_authenticated/settings/issues")({
  component: IssuesSettingsPage,
})

function IssuesSettingsPage() {
  const { organizationId } = Route.useRouteContext()
  const { toast } = useToast()
  const { data: org } = useOrganizationsCollection((orgs) =>
    orgs.where(({ organizations }) => eq(organizations.id, organizationId)).findOne(),
  )
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null)

  const saveField = useCallback(
    (keepMonitoring: boolean) => {
      if (!org) return
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => {
        updateOrganizationMutation(org.id, { settings: { keepMonitoring } })
        toast({ description: "Monitoring preference updated" })
      }, 600)
    },
    [org, toast],
  )

  if (!org) return null

  return (
    <Container className="flex flex-col gap-8 pt-14">
      <Text.H4 weight="bold">Issues</Text.H4>
      <div className="flex max-w-lg flex-col gap-6">
        <div className="flex flex-row items-center justify-between">
          <div className="flex flex-col gap-1">
            <Label htmlFor="keep-monitoring">Monitor resolved issues</Label>
            <Text.H6 color="foregroundMuted">
              When enabled, evaluations monitoring active issues stay active even after an issue is resolved to detect
              further regressions
            </Text.H6>
          </div>
          <Switch id="keep-monitoring" checked={org.settings?.keepMonitoring ?? true} onCheckedChange={saveField} />
        </div>
      </div>
    </Container>
  )
}
