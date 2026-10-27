import type { FilterSet } from "@domain/shared"
import { Alert, Button, CloseTrigger, Input, Modal, Switch, Text, useToast } from "@repo/ui"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import {
  createTraceDeletion,
  previewTraceDeletion,
  TRACE_DELETION_CONFIRMATION,
} from "../../../../../domains/trace-deletions/trace-deletions.functions.ts"
import { toUserMessage } from "../../../../../lib/errors.ts"
import type { BulkSelection } from "../../../../../lib/hooks/useSelectableRows.ts"

interface DeleteTracesModalProps {
  readonly projectId: string
  readonly selection: BulkSelection<string>
  readonly filters: FilterSet
  readonly hasSearchQuery: boolean
  readonly onClose: () => void
  readonly onDeleted: () => void
}

export function DeleteTracesModal({
  projectId,
  selection,
  filters,
  hasSearchQuery,
  onClose,
  onDeleted,
}: DeleteTracesModalProps) {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [confirmText, setConfirmText] = useState("")
  const [includeDatasetRows, setIncludeDatasetRows] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const input = { projectId, selection, filters, hasSearchQuery }

  const preview = useQuery({
    queryKey: ["trace-deletion-preview", input],
    queryFn: () => previewTraceDeletion({ data: input }),
    retry: false,
    gcTime: 0,
  })
  const matchedTraceCount = preview.data?.matchedTraceCount ?? null
  const previewError = preview.error ? toUserMessage(preview.error) : null

  const confirm = async () => {
    setIsDeleting(true)
    try {
      await createTraceDeletion({ data: { ...input, includeDatasetRows, confirmation: TRACE_DELETION_CONFIRMATION } })
      void queryClient.invalidateQueries({ queryKey: ["trace-deletions", projectId] })
      toast({
        title: "Deleting traces",
        description: "They disappear shortly. Track progress under Settings → Data deletion.",
      })
      onDeleted()
    } catch (error) {
      toast({ variant: "destructive", title: "Could not delete traces", description: toUserMessage(error) })
    } finally {
      setIsDeleting(false)
    }
  }

  const isConfirmed = confirmText.trim().toLowerCase() === TRACE_DELETION_CONFIRMATION
  const traces = matchedTraceCount === 1 ? "trace" : "traces"

  return (
    <Modal.Root open onOpenChange={(open) => !open && onClose()}>
      <Modal.Content dismissible>
        <Modal.Header
          title="Delete traces"
          description="Permanently delete the selected traces with their spans, scores, annotations, search indexes and session analyses."
        />
        <Modal.Body>
          <div className="flex flex-col gap-4">
            <Alert
              variant="destructive"
              description="This cannot be undone. Only traces that started before you confirm are deleted."
            />
            {previewError ? (
              <Text.H5 color="destructive">{previewError}</Text.H5>
            ) : matchedTraceCount === null ? (
              <Text.H5 color="foregroundMuted">Counting matching traces…</Text.H5>
            ) : (
              <Text.H5>
                <span className="font-medium">{matchedTraceCount.toLocaleString()}</span> {traces} will be deleted.
              </Text.H5>
            )}
            {matchedTraceCount ? (
              <label
                htmlFor="delete-traces-dataset-rows"
                className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-border p-3"
              >
                <div className="flex flex-col gap-0.5">
                  <Text.H5M>Also delete dataset rows copied from these traces</Text.H5M>
                  <Text.H6 color="foregroundMuted">
                    Removes them from every dataset of the organization, including earlier versions
                  </Text.H6>
                </div>
                <Switch
                  id="delete-traces-dataset-rows"
                  checked={includeDatasetRows}
                  onCheckedChange={setIncludeDatasetRows}
                />
              </label>
            ) : null}
            {matchedTraceCount ? (
              <Input
                type="text"
                label={`Type "${TRACE_DELETION_CONFIRMATION}" to confirm`}
                value={confirmText}
                onChange={(event) => setConfirmText(event.target.value)}
                placeholder={TRACE_DELETION_CONFIRMATION}
              />
            ) : null}
          </div>
        </Modal.Body>
        <Modal.Footer>
          <CloseTrigger />
          <Button
            variant="destructive"
            disabled={!isConfirmed || !matchedTraceCount || isDeleting}
            isLoading={isDeleting}
            onClick={() => void confirm()}
          >
            Delete {matchedTraceCount?.toLocaleString() ?? ""} {traces}
          </Button>
        </Modal.Footer>
      </Modal.Content>
    </Modal.Root>
  )
}
