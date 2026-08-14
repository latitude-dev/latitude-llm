import { Icon, Status, Text } from "@repo/ui"
import { Link } from "@tanstack/react-router"
import { ChevronRight } from "lucide-react"
import {
  type ConnectedIntegration,
  integrationSlug,
} from "../../../../../../domains/integrations/integration-catalog.ts"

/** One connected integration. The whole row is the anchor, so cmd-click and copy-link work. */
export function IntegrationRow({
  integration,
  projectSlug,
  scope,
}: {
  readonly integration: ConnectedIntegration
  readonly projectSlug: string
  /** Which half of the split this row belongs to: the org-wide connection, or this project's settings. */
  readonly scope: "organization" | "project"
}) {
  const { entry, identity, detail, needsAttention, attentionLabel } = integration
  const className =
    "flex flex-row flex-wrap items-center justify-between gap-x-4 gap-y-2 p-4 transition-colors hover:bg-muted/50"
  const params = { projectSlug, integrationSlug: integrationSlug(entry.key) }
  const body = (
    <>
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
    </>
  )

  return scope === "organization" ? (
    <Link
      to="/projects/$projectSlug/settings/organization/integrations/$integrationSlug"
      params={params}
      aria-label={`Configure ${entry.label} for the organization`}
      className={className}
    >
      {body}
    </Link>
  ) : (
    <Link
      to="/projects/$projectSlug/settings/integrations/$integrationSlug"
      params={params}
      aria-label={`Configure ${entry.label} for this project`}
      className={className}
    >
      {body}
    </Link>
  )
}
