import { Button, Container, FormWrapper, Input, Label, Switch, Text, useToast } from "@repo/ui"
import { eq } from "@tanstack/react-db"
import { getRouteApi } from "@tanstack/react-router"
import { useEffect, useState } from "react"
import {
  renameProjectMutation,
  updateProjectMutation,
  useProjectsCollection,
} from "../../../../../../domains/projects/projects.collection.ts"
import { SettingsPageHeader } from "../../../../settings/-components/settings-page-header.tsx"

const projectLayoutRoute = getRouteApi("/_authenticated/projects/$projectSlug")

export function ProjectGeneralSettingsPanel() {
  const { toast } = useToast()
  const { projectSlug } = projectLayoutRoute.useParams()
  const { project: routeProject } = projectLayoutRoute.useRouteContext()
  const { data: projectRow } = useProjectsCollection(
    (projects) => projects.where(({ project }) => eq(project.slug, projectSlug)).findOne(),
    [projectSlug],
  )
  const currentProject = projectRow ?? routeProject

  const [name, setName] = useState(currentProject.name)
  const [isSavingName, setIsSavingName] = useState(false)

  useEffect(() => {
    setName(currentProject.name)
  }, [currentProject.id, currentProject.name])

  const trimmed = name.trim()
  const baseline = currentProject.name.trim()
  const nameUnchanged = trimmed === baseline
  const canSaveName = trimmed.length > 0 && !nameUnchanged && !isSavingName

  const handleSaveName = async () => {
    if (!canSaveName) return
    setIsSavingName(true)
    try {
      const transaction = renameProjectMutation(currentProject.id, trimmed)
      await transaction.isPersisted.promise
      toast({ description: "Project name updated" })
    } catch {
      toast({ variant: "destructive", description: "Could not update project name" })
    } finally {
      setIsSavingName(false)
    }
  }

  const handleKeepMonitoringChange = (checked: boolean) => {
    updateProjectMutation(currentProject.id, { settings: { keepMonitoring: checked } })
  }

  return (
    <Container className="flex flex-col gap-8 p-6">
      <SettingsPageHeader
        title="Project"
        description="Rename this project and configure monitoring for resolved issues."
      />
      <div className="flex max-w-lg flex-col gap-[24px]">
        <FormWrapper>
          <Input
            required
            type="text"
            label="Project name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Project name"
          />
        </FormWrapper>
        <div>
          <Button type="button" size="sm" disabled={!canSaveName} onClick={() => void handleSaveName()}>
            {isSavingName ? "Saving…" : "Save name"}
          </Button>
        </div>
      </div>
      <div className="flex flex-col gap-4 rounded-lg border boder-secondary bg-secondary p-6">
        <div className="flex w-full flex-row items-center justify-between gap-4">
          <div className="flex flex-col gap-1">
            <Label htmlFor="project-keep-monitoring">Monitor resolved issues</Label>
            <Text.H6 color="foregroundMuted">
              When enabled, evaluations monitoring active issues stay active after the issues are resolved to detect
              further regressions
            </Text.H6>
          </div>
          <Switch
            id="project-keep-monitoring"
            checked={currentProject.settings.keepMonitoring ?? true}
            onCheckedChange={handleKeepMonitoringChange}
          />
        </div>
      </div>
    </Container>
  )
}
