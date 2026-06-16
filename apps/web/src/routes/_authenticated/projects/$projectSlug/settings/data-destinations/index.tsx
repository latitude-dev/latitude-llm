import { Text } from "@repo/ui"
import { createFileRoute } from "@tanstack/react-router"
import { useHasFeatureFlag } from "../../../../../../domains/feature-flags/feature-flags.collection.ts"
import { useRouteProject } from "../../-route-data.ts"
import { DestinationsSection } from "../-components/destinations-section.tsx"
import { SettingsPage } from "../-components/settings-page.tsx"

export const Route = createFileRoute("/_authenticated/projects/$projectSlug/settings/data-destinations/")({
  component: DataDestinationsSettingsPage,
})

const PAGE_TITLE = "Data destinations"
const PAGE_DESCRIPTION =
  "Continuously sync this project's data into your own systems, such as a data warehouse or analytics platform."

function DataDestinationsSettingsPage() {
  const project = useRouteProject()
  const destinationsEnabled = useHasFeatureFlag("destinations")

  if (!destinationsEnabled) {
    return (
      <SettingsPage title={PAGE_TITLE} description={PAGE_DESCRIPTION}>
        <Text.H6 color="foregroundMuted">Data destinations aren't enabled for this organization yet.</Text.H6>
      </SettingsPage>
    )
  }

  return (
    <SettingsPage title={PAGE_TITLE} description={PAGE_DESCRIPTION} fillHeight>
      <DestinationsSection projectId={project.id} projectSlug={project.slug} />
    </SettingsPage>
  )
}
