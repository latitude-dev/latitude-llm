import { DetailDrawer, Text } from "@repo/ui"

/**
 * Placeholder detail panel for M3 — opening a monitor row sets `monitorSlug` in
 * the URL and renders this stub. The full panel (config + incidents + lifecycle
 * actions) lands in M4; the file is named for that future component so M4
 * expands it in place rather than renaming.
 */
export function MonitorDetailDrawer({
  monitorName,
  onClose,
}: {
  readonly monitorName: string
  readonly onClose: () => void
}) {
  return (
    <DetailDrawer storeKey="monitor-detail-drawer-width" onClose={onClose} closeLabel="Close">
      <div className="flex flex-col gap-2 p-4">
        <Text.H4>{monitorName}</Text.H4>
        <Text.H6 color="foregroundMuted">
          Monitor configuration and incidents will appear here in an upcoming release.
        </Text.H6>
      </div>
    </DetailDrawer>
  )
}
