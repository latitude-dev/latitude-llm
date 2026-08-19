import { Alert, Button, Icon, Text } from "@repo/ui"
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
    <div className="flex min-w-0 flex-col gap-3">
      <Button asChild variant="ghost" size="sm" className="w-fit" aria-label={label}>
        {scope === "organization" ? (
          <Link to="/projects/$projectSlug/settings/organization/integrations" params={{ projectSlug }}>
            <Icon icon={ArrowLeftIcon} size="sm" />
            Back
          </Link>
        ) : (
          <Link to="/projects/$projectSlug/settings/integrations" params={{ projectSlug }}>
            <Icon icon={ArrowLeftIcon} size="sm" />
            Back
          </Link>
        )}
      </Button>
      <div className="flex min-w-0 items-center gap-2">
        <Icon icon={entry.icon} />
        <Text.H3M>{entry.label}</Text.H3M>
      </div>
    </div>
  )
}
