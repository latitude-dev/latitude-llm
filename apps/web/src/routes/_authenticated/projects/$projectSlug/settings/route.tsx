import { createFileRoute } from "@tanstack/react-router"
import { ProjectGeneralSettingsPanel } from "./-components/project-general-settings-panel.tsx"

export const Route = createFileRoute("/_authenticated/projects/$projectSlug/settings")({
  component: ProjectSettingsPage,
})

function ProjectSettingsPage() {
  return <ProjectGeneralSettingsPanel />
}
