import { CopyableText, Modal, Text } from "@repo/ui"
import { useSandboxDefaultApiKey } from "../../../../domains/sandbox/sandbox.collection.ts"

/**
 * Shows the bits needed to instrument against this sandbox — its name, the
 * current project's slug, and the `lat_sandbox_` API key — so the config is
 * reachable once the onboarding empty state (which also shows them) is gone.
 */
export function SandboxConfigModal({
  open,
  onOpenChange,
  sandboxOrgId,
  sandboxName,
  projectSlug,
}: {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  readonly sandboxOrgId: string
  readonly sandboxName: string
  readonly projectSlug?: string | undefined
}) {
  const { data: keyInfo, isLoading } = useSandboxDefaultApiKey(sandboxOrgId, open)

  return (
    <Modal
      open={open}
      dismissible
      onOpenChange={onOpenChange}
      title="Sandbox configuration"
      description="Point your app at these to stream development traces into this sandbox."
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <Text.H6 color="foregroundMuted">Sandbox</Text.H6>
          <Text.H5M>{sandboxName}</Text.H5M>
        </div>
        {projectSlug ? (
          <div className="flex flex-col gap-1">
            <Text.H6 color="foregroundMuted">Project slug</Text.H6>
            <CopyableText value={projectSlug} size="sm" tooltip="Copy project slug" />
          </div>
        ) : null}
        <div className="flex flex-col gap-1">
          <Text.H6 color="foregroundMuted">API key</Text.H6>
          {isLoading ? (
            <Text.H6 color="foregroundMuted">Loading…</Text.H6>
          ) : keyInfo?.token ? (
            <CopyableText value={keyInfo.token} size="sm" tooltip="Copy API key" />
          ) : (
            <Text.H6 color="foregroundMuted">No key yet — create one from sandbox settings.</Text.H6>
          )}
        </div>
      </div>
    </Modal>
  )
}
