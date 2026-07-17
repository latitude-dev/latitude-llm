import { cn, Skeleton, Text } from "@repo/ui"
import { ChevronDownIcon, ChevronRightIcon, FileTextIcon, FolderIcon } from "lucide-react"
import { useState } from "react"
import type { MemoryStoreSnapshotRecord } from "../../../../../../../domains/memories/memories.functions.ts"
import { recordDisplayLabel } from "../../-components/store-encoding.ts"
import { buildRecordTree, type RecordTreeNode } from "./build-record-tree.ts"

export function RecordTreeSidebar({
  records,
  isLoading,
  selectedRecordId,
  onSelect,
}: {
  readonly records: MemoryStoreSnapshotRecord["records"]
  readonly isLoading: boolean
  readonly selectedRecordId?: string | undefined
  readonly onSelect: (recordId: string) => void
}) {
  if (isLoading) {
    return (
      <div className="flex flex-col gap-1 p-3">
        {[0, 1, 2, 3].map((row) => (
          <Skeleton key={row} className="h-7 w-full" />
        ))}
      </div>
    )
  }

  if (records.length === 0) {
    return (
      <div className="flex min-h-16 items-center justify-center p-3">
        <Text.H6 color="foregroundMuted">No records</Text.H6>
      </div>
    )
  }

  const tree = buildRecordTree(records)
  return (
    <div className="flex flex-col gap-0.5 overflow-y-auto p-2">
      {tree.map((node) => (
        <NodeRow key={node.path} node={node} depth={0} selectedRecordId={selectedRecordId} onSelect={onSelect} />
      ))}
    </div>
  )
}

function NodeRow({
  node,
  depth,
  selectedRecordId,
  onSelect,
}: {
  readonly node: RecordTreeNode
  readonly depth: number
  readonly selectedRecordId?: string | undefined
  readonly onSelect: (recordId: string) => void
}) {
  const isFolder = node.children.length > 0
  const [open, setOpen] = useState(true)
  const isSelected = node.recordId !== undefined && node.recordId === selectedRecordId

  return (
    <>
      <button
        type="button"
        onClick={() => {
          if (node.recordId !== undefined) onSelect(node.recordId)
          if (isFolder) setOpen((value) => !value)
        }}
        className={cn(
          "flex w-full items-center gap-1.5 rounded-md py-1 pr-2 text-left transition-colors hover:bg-background",
          isSelected && "bg-accent",
        )}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
      >
        {isFolder ? (
          open ? (
            <ChevronDownIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRightIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          )
        ) : (
          <span className="w-3.5 shrink-0" />
        )}
        {isFolder ? (
          <FolderIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <FileTextIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        )}
        <Text.H6 className="min-w-0 flex-1" noWrap ellipsis>
          {recordDisplayLabel(node.segment)}
        </Text.H6>
      </button>
      {isFolder && open
        ? node.children.map((child) => (
            <NodeRow
              key={child.path}
              node={child}
              depth={depth + 1}
              selectedRecordId={selectedRecordId}
              onSelect={onSelect}
            />
          ))
        : null}
    </>
  )
}
