import { Button, Modal, Text } from "@repo/ui"
import type { ReactNode } from "react"

interface ConfirmDialogProps {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  readonly title: string
  readonly description?: ReactNode
  readonly confirmLabel: string
  readonly cancelLabel?: string
  readonly destructive?: boolean
  readonly busy?: boolean
  readonly onConfirm: () => void
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancel",
  destructive = false,
  busy = false,
  onConfirm,
}: ConfirmDialogProps) {
  return (
    <Modal.Root open={open} onOpenChange={onOpenChange}>
      <Modal.Content dismissible size="small">
        <Modal.Header title={title} />
        {description ? (
          <Modal.Body>
            {typeof description === "string" ? <Text.H6 color="foregroundMuted">{description}</Text.H6> : description}
          </Modal.Body>
        ) : null}
        <Modal.Footer>
          <Button variant="outline" size="sm" disabled={busy} onClick={() => onOpenChange(false)}>
            {cancelLabel}
          </Button>
          <Button
            variant={destructive ? "destructive" : "default"}
            size="sm"
            disabled={busy}
            onClick={() => onConfirm()}
          >
            {busy ? "Working…" : confirmLabel}
          </Button>
        </Modal.Footer>
      </Modal.Content>
    </Modal.Root>
  )
}
