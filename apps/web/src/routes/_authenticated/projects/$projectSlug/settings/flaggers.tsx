import { Label, Switch, Text, useToast } from "@repo/ui"
import { eq } from "@tanstack/react-db"
import { createFileRoute } from "@tanstack/react-router"
import { updateFlaggerMutation, useProjectFlaggers } from "../../../../../domains/flaggers/flaggers.collection.ts"
import type { FlaggerRecord } from "../../../../../domains/flaggers/flaggers.functions.ts"
import { useProjectsCollection } from "../../../../../domains/projects/projects.collection.ts"
import { toUserMessage } from "../../../../../lib/errors.ts"
import { useRouteProject } from "../-route-data.ts"
import { SettingsPage } from "./-components/settings-page.tsx"

export const Route = createFileRoute("/_authenticated/projects/$projectSlug/settings/flaggers")({
  component: ProjectFlaggersSettingsPage,
})

function ProjectFlaggersSettingsPage() {
  const { projectSlug } = Route.useParams()
  const { toast } = useToast()
  const routeProject = useRouteProject()

  const { data: project } = useProjectsCollection(
    (projects) => projects.where(({ project }) => eq(project.slug, projectSlug)).findOne(),
    [projectSlug],
  )

  const currentProject = project ?? routeProject
  const { data: flaggers = [], isLoading: isLoadingFlaggers } = useProjectFlaggers(currentProject.id)

  const handleFlaggerEnabledChange = async (flagger: FlaggerRecord, checked: boolean) => {
    try {
      const transaction = updateFlaggerMutation({
        projectId: currentProject.id,
        id: flagger.id,
        slug: flagger.slug,
        enabled: checked,
      })
      await transaction.isPersisted.promise
      toast({ description: checked ? "Flagger enabled" : "Flagger disabled" })
    } catch (error) {
      toast({ variant: "destructive", description: toUserMessage(error) })
    }
  }

  return (
    <SettingsPage
      title="Flaggers"
      description="Flaggers automatically inspect new traces for known failure patterns and create issues when they detect regressions"
    >
      <div className="flex w-full flex-col gap-1">
        {isLoadingFlaggers ? null : flaggers.length === 0 ? (
          <Text.H5 color="foregroundMuted">No flaggers have been provisioned for this project yet</Text.H5>
        ) : (
          flaggers.map((flagger) => {
            const inputId = `flagger-${flagger.id}`
            return (
              <div
                key={flagger.id}
                className="flex w-full flex-row items-center justify-between gap-4 rounded-lg bg-muted/30 p-4"
              >
                <div className="flex flex-col gap-1">
                  <Label htmlFor={inputId}>{flagger.name}</Label>
                  <Text.H6 color="foregroundMuted">{flagger.description}</Text.H6>
                </div>
                <Switch
                  id={inputId}
                  checked={flagger.enabled}
                  onCheckedChange={(checked) => void handleFlaggerEnabledChange(flagger, checked)}
                  aria-label={`Toggle ${flagger.name}`}
                />
              </div>
            )
          })
        )}
      </div>
    </SettingsPage>
  )
}
