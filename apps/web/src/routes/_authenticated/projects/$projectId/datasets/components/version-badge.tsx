import { Text } from "@repo/ui"

export function VersionBadge({ versionId }: { versionId?: string }) {
  return (
    <div className="flex items-center rounded-md border px-2.5 py-1 bg-muted/50">
      <Text.H6 color="foregroundMuted" className="font-mono uppercase tracking-wider">
        v:{versionId}
      </Text.H6>
    </div>
  )
}
