import { Badge, Button, Icon, Input, Modal, Text } from "@repo/ui"
import { Plus } from "lucide-react"
import { useState } from "react"
import {
  INTEGRATION_CAPABILITY_LABELS,
  INTEGRATION_CAPABILITY_ORDER,
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
      <Button asChild size="sm">
        <a href={href}>
          <Icon icon={Plus} size="sm" />
          Connect
        </a>
      </Button>
    )
  }

  return (
    <Button size="sm" onClick={() => onConnectDispatchKind(entry.key)}>
      <Icon icon={Plus} size="sm" />
      Connect
    </Button>
  )
}

function CatalogTile({
  entry,
  isConnected,
  onConnectDispatchKind,
}: {
  readonly entry: IntegrationCatalogEntry
  readonly isConnected: boolean
  readonly onConnectDispatchKind: (key: IntegrationKey) => void
}) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
      <div className="flex flex-row items-start justify-between gap-3">
        <div className="flex min-w-0 flex-row items-center gap-2">
          <Icon icon={entry.icon} />
          <Text.H5M>{entry.label}</Text.H5M>
        </div>
        {isConnected ? <Badge variant="outlineSuccessMuted">Connected</Badge> : null}
      </div>
      <Text.H6 color="foregroundMuted">{entry.summary}</Text.H6>
      {isConnected ? null : (
        <div className="flex flex-row">
          <ConnectAction entry={entry} onConnectDispatchKind={onConnectDispatchKind} />
        </div>
      )}
    </div>
  )
}

/**
 * The browse-and-add surface. Kept separate from the connected list so adopting
 * an integration is a deliberate trip rather than permanent clutter.
 */
export function IntegrationCatalog({
  available,
  connected,
  onConnectDispatchKind,
}: {
  readonly available: readonly IntegrationKey[]
  readonly connected: ReadonlySet<IntegrationKey>
  readonly onConnectDispatchKind: (key: IntegrationKey) => void
}) {
  const [search, setSearch] = useState("")
  const query = search.trim().toLowerCase()

  const matches = INTEGRATION_CATALOG.filter(
    (entry) =>
      available.includes(entry.key) &&
      (query === "" ||
        entry.label.toLowerCase().includes(query) ||
        entry.summary.toLowerCase().includes(query) ||
        INTEGRATION_CAPABILITY_LABELS[entry.capability].toLowerCase().includes(query)),
  )

  const groups = INTEGRATION_CAPABILITY_ORDER.map((capability) => ({
    capability,
    entries: matches
      .filter((entry) => entry.capability === capability)
      // Connected last: still visible so nobody wonders where Slack went, but out of the way.
      .sort((a, b) => {
        const byState = Number(connected.has(a.key)) - Number(connected.has(b.key))
        return byState !== 0 ? byState : a.label.localeCompare(b.label)
      }),
  })).filter((group) => group.entries.length > 0)

  return (
    <div className="flex flex-col gap-6">
      <Input
        name="integration-search"
        value={search}
        placeholder="Search integrations"
        onChange={(event) => setSearch(event.target.value)}
      />

      {groups.length === 0 ? (
        <Text.H6 color="foregroundMuted">No integrations match “{search}”.</Text.H6>
      ) : (
        groups.map((group) => (
          <div key={group.capability} className="flex flex-col gap-3">
            <Text.H6M color="foregroundMuted">{INTEGRATION_CAPABILITY_LABELS[group.capability]}</Text.H6M>
            <div className="grid grid-cols-1 gap-3 @[700px]:grid-cols-2">
              {group.entries.map((entry) => (
                <CatalogTile
                  key={entry.key}
                  entry={entry}
                  isConnected={connected.has(entry.key)}
                  onConnectDispatchKind={onConnectDispatchKind}
                />
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  )
}

export function IntegrationCatalogModal({
  available,
  connected,
  onConnectDispatchKind,
  onClose,
}: {
  readonly available: readonly IntegrationKey[]
  readonly connected: ReadonlySet<IntegrationKey>
  readonly onConnectDispatchKind: (key: IntegrationKey) => void
  readonly onClose: () => void
}) {
  return (
    <Modal
      open
      dismissible
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
      title="Add integration"
      description="Connect Latitude to the tools your team already uses."
    >
      <IntegrationCatalog available={available} connected={connected} onConnectDispatchKind={onConnectDispatchKind} />
    </Modal>
  )
}
