import { Button, Icon } from "@repo/ui"
import { DatabaseIcon } from "lucide-react"
import { useState } from "react"
import { AddToDatasetModal } from "./add-to-dataset-modal.tsx"

export function AddTraceToDatasetAction({
  projectId,
  traceId,
}: {
  readonly projectId: string
  readonly traceId: string
}) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)} type="button">
        <Icon icon={DatabaseIcon} />
        Add to dataset
      </Button>
      <AddToDatasetModal
        open={open}
        onOpenChange={setOpen}
        projectId={projectId}
        selection={{ mode: "selected", rowIds: [traceId] }}
        selectedCount={1}
        onSuccess={() => setOpen(false)}
      />
    </>
  )
}
