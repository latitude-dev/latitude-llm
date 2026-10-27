import { Alert, Button, CloseTrigger, Input, Modal, Switch, Text, useToast } from "@repo/ui"
import { useRouter } from "@tanstack/react-router"
import { useState } from "react"
import {
  adminCreateTraceDeletion,
  adminPreviewTraceDeletion,
  TRACE_DELETION_CONFIRMATION,
} from "../../../../domains/admin/trace-deletions.functions.ts"
import { toUserMessage } from "../../../../lib/errors.ts"

interface TraceDeletionButtonProps {
  readonly projectId: string
  readonly projectName: string
}

const EMPTY_SELECTOR = { tag: "", userId: "", sessionId: "", metadataKey: "", metadataValue: "", traceIds: "" }

export function TraceDeletionButton({ projectId, projectName }: TraceDeletionButtonProps) {
  const { toast } = useToast()
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(false)
  const [selector, setSelector] = useState(EMPTY_SELECTOR)
  const [matchedTraceCount, setMatchedTraceCount] = useState<number | null>(null)
  const [confirmText, setConfirmText] = useState("")
  const [includeDatasetRows, setIncludeDatasetRows] = useState(false)
  const [isBusy, setIsBusy] = useState(false)

  const traceIds = selector.traceIds
    .split(/[\s,]+/)
    .map((id) => id.trim())
    .filter(Boolean)
  const input = {
    projectId,
    tag: selector.tag,
    userId: selector.userId,
    sessionId: selector.sessionId,
    metadataKey: selector.metadataKey,
    metadataValue: selector.metadataValue,
    ...(traceIds.length > 0 ? { traceIds } : {}),
  }
  const isConfirmed = confirmText.toLowerCase() === TRACE_DELETION_CONFIRMATION

  const close = () => {
    setIsOpen(false)
    setSelector(EMPTY_SELECTOR)
    setMatchedTraceCount(null)
    setConfirmText("")
    setIncludeDatasetRows(false)
  }

  const update = (field: keyof typeof EMPTY_SELECTOR) => (event: { target: { value: string } }) => {
    setSelector((current) => ({ ...current, [field]: event.target.value }))
    setMatchedTraceCount(null)
  }

  const run = async (action: () => Promise<void>, failureTitle: string) => {
    setIsBusy(true)
    try {
      await action()
    } catch (error) {
      toast({ variant: "destructive", title: failureTitle, description: toUserMessage(error) })
    } finally {
      setIsBusy(false)
    }
  }

  const preview = () =>
    run(async () => {
      const result = await adminPreviewTraceDeletion({ data: input })
      setMatchedTraceCount(result.matchedTraceCount)
    }, "Could not preview the deletion")

  const confirm = () =>
    run(async () => {
      await adminCreateTraceDeletion({
        data: { ...input, includeDatasetRows, confirmation: TRACE_DELETION_CONFIRMATION },
      })
      toast({ description: `Deleting ${matchedTraceCount?.toLocaleString() ?? ""} traces from ${projectName}.` })
      close()
      void router.invalidate()
    }, "Could not start the deletion")

  return (
    <>
      <Button variant="destructive" size="sm" onClick={() => setIsOpen(true)}>
        Delete traces
      </Button>
      <Modal.Root
        open={isOpen}
        onOpenChange={(nextOpen) => {
          if (nextOpen) setIsOpen(true)
          else close()
        }}
      >
        <Modal.Content dismissible size="large">
          <Modal.Header
            title="Delete traces"
            description={
              <Text.H5 color="foregroundMuted">
                Permanently delete matching traces from{" "}
                <span className="font-medium text-foreground">{projectName}</span>, with their spans, scores,
                annotations, search indexes and session analyses.
              </Text.H5>
            }
          />
          <Modal.Body>
            <div className="flex flex-col gap-4">
              <Alert
                variant="destructive"
                description="This cannot be undone. Every filled field must match (they are ANDed), and only traces that started before the deletion is requested are deleted."
              />
              <div className="grid grid-cols-2 gap-3">
                <Input type="text" label="Tag" value={selector.tag} onChange={update("tag")} />
                <Input type="text" label="User id" value={selector.userId} onChange={update("userId")} />
                <Input type="text" label="Session id" value={selector.sessionId} onChange={update("sessionId")} />
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    type="text"
                    label="Metadata key"
                    value={selector.metadataKey}
                    onChange={update("metadataKey")}
                  />
                  <Input
                    type="text"
                    label="Metadata value"
                    value={selector.metadataValue}
                    onChange={update("metadataValue")}
                  />
                </div>
              </div>
              <Input
                type="text"
                label="Trace ids (up to 100, comma or space separated)"
                value={selector.traceIds}
                onChange={update("traceIds")}
              />
              <div className="flex items-center gap-3">
                <Button type="button" size="sm" variant="outline" disabled={isBusy} onClick={() => void preview()}>
                  Preview
                </Button>
                {matchedTraceCount !== null ? (
                  <Text.H5>
                    <span className="font-medium">{matchedTraceCount.toLocaleString()}</span> matching traces
                  </Text.H5>
                ) : null}
              </div>
              {matchedTraceCount !== null && matchedTraceCount > 0 ? (
                <>
                  <label
                    htmlFor="admin-trace-deletion-dataset-rows"
                    className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-border p-3"
                  >
                    <div className="flex flex-col gap-0.5">
                      <Text.H5M>Also delete dataset rows copied from these traces</Text.H5M>
                      <Text.H6 color="foregroundMuted">
                        Removes them from every dataset of the organization, including earlier versions
                      </Text.H6>
                    </div>
                    <Switch
                      id="admin-trace-deletion-dataset-rows"
                      checked={includeDatasetRows}
                      onCheckedChange={setIncludeDatasetRows}
                    />
                  </label>
                  <Text.H5 color="foregroundMuted">
                    Type <span className="font-medium text-foreground">{TRACE_DELETION_CONFIRMATION}</span> to confirm.
                  </Text.H5>
                  <Input
                    type="text"
                    label="Confirmation"
                    value={confirmText}
                    onChange={(event) => setConfirmText(event.target.value)}
                    placeholder={TRACE_DELETION_CONFIRMATION}
                  />
                </>
              ) : null}
            </div>
          </Modal.Body>
          <Modal.Footer>
            <CloseTrigger />
            <Button
              type="button"
              size="sm"
              variant="destructive"
              disabled={!isConfirmed || isBusy || !matchedTraceCount}
              onClick={() => void confirm()}
            >
              {isBusy ? "Working…" : "Delete traces"}
            </Button>
          </Modal.Footer>
        </Modal.Content>
      </Modal.Root>
    </>
  )
}
