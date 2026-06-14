import type { MonitorTarget } from "@domain/monitors"
import { Button, Icon } from "@repo/ui"
import { BellPlusIcon } from "lucide-react"
import { useState } from "react"
import { targetAlertDraft } from "./alert-form-helpers.ts"
import { MonitorCreateModal } from "./monitor-create-modal.tsx"

/**
 * In-context monitor creation: opens the monitor modal pre-scoped to `target`
 * (a tool/user/all-X preset). The target is read-only in the modal; the user
 * picks the metric and threshold. Used from the Tools and Users sections.
 */
export function AddTargetMonitorButton({
  projectId,
  projectSlug,
  target,
  label = "Add monitor",
}: {
  readonly projectId: string
  readonly projectSlug: string
  readonly target: MonitorTarget
  readonly label?: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button variant="outline" size="sm" className="w-auto" onClick={() => setOpen(true)}>
        <Icon icon={BellPlusIcon} size="sm" />
        {label}
      </Button>
      {open ? (
        <MonitorCreateModal
          projectId={projectId}
          projectSlug={projectSlug}
          initialAlert={targetAlertDraft(target)}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  )
}
