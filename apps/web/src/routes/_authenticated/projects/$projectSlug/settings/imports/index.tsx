import { createFileRoute } from "@tanstack/react-router"
import { useRouteProject } from "../../-route-data.ts"
import { ImportsPage } from "../-components/imports/imports-page.tsx"
import { SettingsPage } from "../-components/settings-page.tsx"

export const Route = createFileRoute("/_authenticated/projects/$projectSlug/settings/imports/")({
  component: ImportsSettingsPage,
})

const PAGE_TITLE = "Imports"
const PAGE_DESCRIPTION =
  "Import historical traces and spans from Langfuse, LangSmith, or Braintrust. Imports are bounded, asynchronous, and idempotent."

function ImportsSettingsPage() {
  const project = useRouteProject()

  return (
    <SettingsPage title={PAGE_TITLE} description={PAGE_DESCRIPTION} fillHeight>
      <ImportsPage projectId={project.id} projectSlug={project.slug} />
    </SettingsPage>
  )
}
