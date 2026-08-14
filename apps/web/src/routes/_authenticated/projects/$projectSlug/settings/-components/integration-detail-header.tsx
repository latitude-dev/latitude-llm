import { Alert, Button, Icon, Text, Tooltip } from "@repo/ui"
import { Link } from "@tanstack/react-router"
import { ArrowLeftIcon } from "lucide-react"
import type { IntegrationCatalogEntry } from "../../../../../../domains/integrations/integration-catalog.ts"

/** Connecting is always organization-wide, so both scopes send the user to the same place. */
export function IntegrationNotConnected({
  entry,
  projectSlug,
}: {
  readonly entry: IntegrationCatalogEntry
  readonly projectSlug: string
}) {
  return (
    <Alert
      variant="default"
      showIcon
      title={`${entry.label} is not connected`}
      description="Connect it for the organization to configure it."
      cta={
        <Button asChild variant="outline">
          <Link to="/projects/$projectSlug/settings/organization/integrations" params={{ projectSlug }}>
            Connect for the organization
          </Link>
        </Button>
      }
    />
  )
}

/** Title for an integration's detail page, with the back arrow to the list it came from. */
export function IntegrationDetailHeader({
  entry,
  projectSlug,
  scope,
}: {
  readonly entry: IntegrationCatalogEntry
  readonly projectSlug: string
  readonly scope: "organization" | "project"
}) {
  const label = scope === "organization" ? "Back to organization integrations" : "Back to integrations"

  return (
    <div className="flex min-w-0 flex-row items-center gap-2">
      <Tooltip
        asChild
        side="bottom"
        trigger={
          <Button asChild variant="ghost" className="h-7 w-7 p-0" aria-label={label}>
            {scope === "organization" ? (
              <Link to="/projects/$projectSlug/settings/organization/integrations" params={{ projectSlug }}>
                <ArrowLeftIcon className="h-4 w-4 text-muted-foreground" />
              </Link>
            ) : (
              <Link to="/projects/$projectSlug/settings/integrations" params={{ projectSlug }}>
                <ArrowLeftIcon className="h-4 w-4 text-muted-foreground" />
              </Link>
            )}
          </Button>
        }
      >
        {label}
      </Tooltip>
      <Icon icon={entry.icon} />
      <Text.H3M>{entry.label}</Text.H3M>
    </div>
  )
}
