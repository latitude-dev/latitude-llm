import { CopyButton, Text } from "@repo/ui"

export function VersionBadge({ versionId }: { versionId?: string | null; version?: number }) {
  if (!versionId) return null

  return (
    <div className="flex items-center gap-1 rounded-md border px-2.5 py-1 bg-muted/50">
      <Text.H6 color="foregroundMuted" className="font-mono uppercase tracking-wider">
        v:{versionId}
      </Text.H6>
      <CopyButton value={versionId} />
    </div>
  )
}
