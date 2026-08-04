import { Modal } from "@repo/ui"
import { ImportWizard } from "../../../../../../../components/imports/import-wizard.tsx"
import type { ImportRecord } from "../../../../../../../domains/imports/imports.functions.ts"

/** The imports settings page's dialog framing around the shared wizard. */
export function ImportWizardModal({
  projectId,
  retryJob,
  onClose,
}: {
  readonly projectId: string
  readonly retryJob?: ImportRecord
  readonly onClose: () => void
}) {
  return (
    <Modal.Root open onOpenChange={(open) => !open && onClose()}>
      <Modal.Content dismissible size="medium">
        <Modal.Header title={retryJob ? "Retry trace import" : "Import traces"} />
        <ImportWizard
          projectId={projectId}
          chrome="modal"
          onCancel={onClose}
          onStarted={onClose}
          {...(retryJob ? { retryJob } : {})}
        />
      </Modal.Content>
    </Modal.Root>
  )
}
