import { DetailSection, Input, Label, Switch, Text, useToast } from "@repo/ui"
import { eq } from "@tanstack/react-db"
import { createFileRoute } from "@tanstack/react-router"
import { FolderIcon, ShieldAlertIcon } from "lucide-react"
import { useCallback, useRef, useState } from "react"
import { updateProjectMutation, useProjectsCollection } from "../../../../domains/projects/projects.collection.ts"
import { ListingLayout as Layout } from "../../../../layouts/ListingLayout/index.tsx"
import { toUserMessage } from "../../../../lib/errors.ts"
import { useRouteProject } from "./-route-data.ts"

export const Route = createFileRoute("/_authenticated/projects/$projectSlug/settings")({
  component: ProjectSettingsPage,
})

function ProjectSettingsPage() {
  const { projectSlug } = Route.useParams()
  const { toast } = useToast()
  const routeProject = useRouteProject()
  const [isSavingKeepMonitoring, setIsSavingKeepMonitoring] = useState(false)
  const renameDebounceRef = useRef<ReturnType<typeof setTimeout>>(null)

  const { data: project } = useProjectsCollection(
    (projects) => projects.where(({ project }) => eq(project.slug, projectSlug)).findOne(),
    [projectSlug],
  )

  const currentProject = project ?? routeProject

  const handleProjectRename = useCallback(
    (name: string) => {
      if (renameDebounceRef.current) clearTimeout(renameDebounceRef.current)

      renameDebounceRef.current = setTimeout(() => {
        const trimmedName = name.trim()
        if (!trimmedName || trimmedName === currentProject.name) return

        const transaction = updateProjectMutation(currentProject.id, { name: trimmedName })
        void transaction.isPersisted.promise
          .then(() => {
            toast({ description: "Project name updated" })
          })
          .catch((error) => {
            toast({ variant: "destructive", description: toUserMessage(error) })
          })
      }, 600)
    },
    [currentProject.id, currentProject.name, toast],
  )

  const handleKeepMonitoringChange = async (checked: boolean) => {
    if (isSavingKeepMonitoring) return

    setIsSavingKeepMonitoring(true)
    try {
      const transaction = updateProjectMutation(currentProject.id, {
        settings: { keepMonitoring: checked },
      })
      await transaction.isPersisted.promise
      toast({ description: "Monitoring preference updated" })
    } catch (error) {
      toast({ variant: "destructive", description: toUserMessage(error) })
    } finally {
      setIsSavingKeepMonitoring(false)
    }
  }

  return (
    <Layout>
      <Layout.Content>
        <Layout.Actions>
          <Layout.ActionsRow>
            <Layout.ActionRowItem>
              <Text.H4 weight="bold">Settings</Text.H4>
            </Layout.ActionRowItem>
          </Layout.ActionsRow>
        </Layout.Actions>
        <Layout.List className="pt-2 gap-6">
          <DetailSection
            icon={<FolderIcon className="w-4 h-4" />}
            label="Project"
            contentClassName="max-h-none overflow-visible pl-1 pr-2 pt-2"
          >
            <Input
              key={currentProject.id}
              required
              type="text"
              label="Name"
              defaultValue={currentProject.name}
              onChange={(event) => handleProjectRename(event.target.value)}
              placeholder="Project name"
              aria-label="Project name"
            />
          </DetailSection>
          <DetailSection
            icon={<ShieldAlertIcon className="w-4 h-4" />}
            label="Issues"
            contentClassName="max-h-none overflow-visible px-2 pt-2"
          >
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
                checked={currentProject.settings.keepMonitoring ?? true}
                loading={isSavingKeepMonitoring}
                onCheckedChange={(checked) => void handleKeepMonitoringChange(checked)}
              />
            </div>
          </DetailSection>
        </Layout.List>
      </Layout.Content>
    </Layout>
  )
}
