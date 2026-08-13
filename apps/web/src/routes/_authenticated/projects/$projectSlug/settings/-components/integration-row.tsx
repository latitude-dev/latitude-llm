import { Icon, Status, Text } from "@repo/ui"
import { Link } from "@tanstack/react-router"
import { ChevronRight } from "lucide-react"
import { isAgentDispatchKind } from "../../../../../../domains/agent-dispatch/agent-dispatch-kinds.ts"
import type {
  ConnectedIntegration,
  IntegrationCatalogEntry,
} from "../../../../../../domains/integrations/integration-catalog.ts"

/**
 * Typed link to an integration's detail page. Slack and GitHub have their own
 * routes; the four dispatch kinds share the `$integrationKind` route — either
 * the project-scoped one (this project's override) or, from Global integrations,
 * the org-default edit page. Slack/GitHub have no Global-integrations-scoped
 * page, so they always go to their project-scoped route regardless of
 * `toGlobalIntegrations`.
 */
function IntegrationDetailLink({
  entry,
  projectSlug,
  toGlobalIntegrations = false,
  className,
  children,
}: {
  readonly entry: IntegrationCatalogEntry
  readonly projectSlug: string
  readonly toGlobalIntegrations?: boolean
  readonly className?: string
  readonly children: React.ReactNode
}) {
  const label = `Configure ${entry.label}`

  if (entry.key === "slack") {
    return (
      <Link
        to="/projects/$projectSlug/settings/integrations/slack"
        params={{ projectSlug }}
        aria-label={label}
        className={className}
      >
        {children}
      </Link>
    )
  }
  if (entry.key === "github") {
    return (
      <Link
        to="/projects/$projectSlug/settings/integrations/github"
        params={{ projectSlug }}
        aria-label={label}
        className={className}
      >
        {children}
      </Link>
    )
  }
  if (toGlobalIntegrations && isAgentDispatchKind(entry.key)) {
    return (
      <Link
        to="/projects/$projectSlug/settings/global-integrations/$integrationKind"
        params={{ projectSlug, integrationKind: entry.key }}
        aria-label={label}
        className={className}
      >
        {children}
      </Link>
    )
  }
  return (
    <Link
      to="/projects/$projectSlug/settings/integrations/$integrationKind"
      params={{ projectSlug, integrationKind: entry.key }}
      aria-label={label}
      className={className}
    >
      {children}
    </Link>
  )
}

/** One connected integration. The whole row is the anchor, so cmd-click and copy-link work. */
export function IntegrationRow({
  integration,
  projectSlug,
  toGlobalIntegrations = false,
}: {
  readonly integration: ConnectedIntegration
  readonly projectSlug: string
  /** True when this row is rendered on Global integrations — links to the org-default edit page instead of this project's. */
  readonly toGlobalIntegrations?: boolean
}) {
  const { entry, identity, detail, needsAttention, attentionLabel } = integration

  return (
    <IntegrationDetailLink
      entry={entry}
      projectSlug={projectSlug}
      toGlobalIntegrations={toGlobalIntegrations}
      className="flex flex-row flex-wrap items-center justify-between gap-x-4 gap-y-2 p-4 transition-colors hover:bg-muted/50"
    >
      <div className="flex min-w-0 flex-row items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-muted">
          <Icon icon={entry.icon} />
        </div>
        <div className="flex min-w-0 flex-col gap-0.5">
          <div className="flex flex-row items-center gap-2">
            <Text.H5 weight="semibold">{entry.label}</Text.H5>
            <Text.H6 color="foregroundMuted" ellipsis noWrap>
              {identity}
            </Text.H6>
          </div>
          <Text.H6 color="foregroundMuted">{detail}</Text.H6>
        </div>
      </div>
      <div className="flex shrink-0 flex-row items-center gap-3">
        {needsAttention ? (
          <Status variant="warning" label={attentionLabel ?? "Action needed"} />
        ) : (
          <Status variant="success" label="Active" />
        )}
        <Icon icon={ChevronRight} size="sm" color="foregroundMuted" />
      </div>
    </IntegrationDetailLink>
  )
}
