import { Button, Icon, Text } from "@repo/ui"
import { Plus } from "lucide-react"
import {
  INTEGRATION_CATALOG,
  type IntegrationCatalogEntry,
  type IntegrationKey,
} from "../../../../../../domains/integrations/integration-catalog.ts"

/** Where the browser must do a full-page GET because the route 302s to the vendor. */
const INSTALL_HREFS: Partial<Record<IntegrationKey, string>> = {
  slack: "/integrations/slack/install",
  github: "/integrations/github/install",
}

function ConnectAction({
  entry,
  onConnectDispatchKind,
}: {
  readonly entry: IntegrationCatalogEntry
  readonly onConnectDispatchKind: (key: IntegrationKey) => void
}) {
  const href = INSTALL_HREFS[entry.key]

  if (href) {
    return (
      <Button asChild size="sm" variant="outline">
        <a href={href}>
          <Icon icon={Plus} size="sm" />
          Connect
        </a>
      </Button>
    )
  }

  return (
    <Button size="sm" variant="outline" onClick={() => onConnectDispatchKind(entry.key)}>
      <Icon icon={Plus} size="sm" />
      Connect
    </Button>
  )
}

/**
 * Everything not connected yet, always on the page rather than behind an "add"
 * affordance. With six integrations total the whole set fits, so hiding half of
 * them would cost a click and leave the page half empty.
 */
export function AvailableIntegrations({
  available,
  connected,
  onConnectDispatchKind,
}: {
  readonly available: readonly IntegrationKey[]
  readonly connected: ReadonlySet<IntegrationKey>
  readonly onConnectDispatchKind: (key: IntegrationKey) => void
}) {
  const entries = INTEGRATION_CATALOG.filter((entry) => available.includes(entry.key) && !connected.has(entry.key))

  if (entries.length === 0) {
    return <Text.H6 color="foregroundMuted">Every available integration is connected.</Text.H6>
  }

  return (
    <div className="grid grid-cols-1 gap-3 @[640px]:grid-cols-2">
      {entries.map((entry) => (
        <div key={entry.key} className="flex flex-col gap-3 rounded-lg border border-border p-4">
          <div className="flex min-w-0 flex-row items-center gap-2">
            <Icon icon={entry.icon} />
            <Text.H5M>{entry.label}</Text.H5M>
          </div>
          <Text.H6 color="foregroundMuted" className="flex-1">
            {entry.summary}
          </Text.H6>
          <div className="flex flex-row">
            <ConnectAction entry={entry} onConnectDispatchKind={onConnectDispatchKind} />
          </div>
        </div>
      ))}
    </div>
  )
}
