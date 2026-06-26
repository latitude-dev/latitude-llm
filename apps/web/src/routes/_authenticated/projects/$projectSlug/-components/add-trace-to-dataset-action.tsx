import { Button, Icon } from "@repo/ui"
import { DatabaseIcon } from "lucide-react"
import { useState } from "react"
import {
  addTracesToDatasetFunction,
  createDatasetFromTracesFunction,
} from "../../../../../domains/datasets/datasets.functions.ts"
import { AddToDatasetModal } from "./add-to-dataset-modal.tsx"

export function AddTraceToDatasetAction({
  projectId,
  traceId,
  description,
}: {
  readonly projectId: string
  readonly traceId: string
  readonly description?: string
}) {
  const [open, setOpen] = useState(false)
  const selection = { mode: "selected" as const, rowIds: [traceId] }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} type="button">
        <Icon icon={DatabaseIcon} size="sm" />
        Add to dataset
      </Button>
      <AddToDatasetModal
        open={open}
        onOpenChange={setOpen}
        projectId={projectId}
        itemLabel="trace"
        selectedCount={1}
        {...(description ? { description } : {})}
        onAddToExisting={(datasetId) => addTracesToDatasetFunction({ data: { projectId, datasetId, selection } })}
        onCreateNew={(name) => createDatasetFromTracesFunction({ data: { projectId, name, selection } })}
        onSuccess={() => setOpen(false)}
      />
    </>
  )
}
