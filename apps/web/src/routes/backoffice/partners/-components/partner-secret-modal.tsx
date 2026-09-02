import { Alert, Button, CopyableText, Modal, Text } from "@repo/ui"
import type { AdminPartnerSecretDto } from "../../../../domains/admin/partners.functions.ts"

interface PartnerSecretModalProps {
  readonly secret: AdminPartnerSecretDto | null
  readonly onClose: () => void
}

/** The only place a partner's raw HMAC secret is ever readable — it exists nowhere else in plaintext. */
export function PartnerSecretModal({ secret, onClose }: PartnerSecretModalProps) {
  return (
    <Modal
      dismissible
      size="large"
      open={secret !== null}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
      title={`HMAC secret for ${secret?.partner.name ?? ""}`}
      description="Copy it now and hand it to the partner over a secure channel."
      footer={<Button onClick={onClose}>I've copied it</Button>}
    >
      <div className="flex flex-col gap-4">
        <Alert
          variant="warning"
          description="This secret is stored encrypted and will never be shown again. If it is lost, rotate it — rotation is a hard swap, so the old secret stops working immediately."
        />
        <div className="flex flex-col gap-1">
          <Text.H6 color="foregroundMuted">Partner ID</Text.H6>
          <CopyableText value={secret?.partner.id ?? ""} tooltip="Copy partner ID" />
        </div>
        <div className="flex flex-col gap-1">
          <Text.H6 color="foregroundMuted">Partner Secret</Text.H6>
          <CopyableText value={secret?.rawSecret ?? ""} tooltip="Copy partner secret" />
        </div>
      </div>
    </Modal>
  )
}
