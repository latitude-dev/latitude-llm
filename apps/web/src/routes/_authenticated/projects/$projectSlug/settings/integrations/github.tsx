import { Button, GithubIcon, Icon, Text, Tooltip } from "@repo/ui"
import { createFileRoute, Link } from "@tanstack/react-router"
import { ArrowLeftIcon } from "lucide-react"
import { GithubIntegrationManage } from "../-components/github-manage.tsx"
import { SettingsPage } from "../-components/settings-page.tsx"

export const Route = createFileRoute("/_authenticated/projects/$projectSlug/settings/integrations/github")({
  component: GithubIntegrationManagePage,
})

function GithubIntegrationManagePage() {
  const { projectSlug } = Route.useParams()

  return (
    <SettingsPage
      title={
        <div className="flex min-w-0 flex-row items-center gap-2">
          <Tooltip
            asChild
            side="bottom"
            trigger={
              <Button asChild variant="ghost" className="h-7 w-7 p-0" aria-label="Back to integrations">
                <Link to="/projects/$projectSlug/settings/integrations" params={{ projectSlug }}>
                  <ArrowLeftIcon className="h-4 w-4 text-muted-foreground" />
                </Link>
              </Button>
            }
          >
            Back to integrations
          </Tooltip>
          <Icon icon={GithubIcon} />
          <Text.H3M>GitHub</Text.H3M>
        </div>
      }
      description="Connection and organization-wide defaults for the GitHub integration."
    >
      <GithubIntegrationManage projectSlug={projectSlug} />
    </SettingsPage>
  )
}
