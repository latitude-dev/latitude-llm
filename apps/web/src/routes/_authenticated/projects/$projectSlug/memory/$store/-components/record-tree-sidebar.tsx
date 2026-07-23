import { cn, Icon, Skeleton, Text } from "@repo/ui"
import {
  ChevronRightIcon,
  ChevronsDownUpIcon,
  ChevronsUpDownIcon,
  FileTextIcon,
  FolderIcon,
  FolderOpenIcon,
} from "lucide-react"
import { useMemo, useState } from "react"
import type { MemoryStoreSnapshotRecord } from "../../../../../../../domains/memories/memories.functions.ts"
import { recordDisplayLabel } from "../../-components/store-encoding.ts"
import { buildRecordTree, type RecordTreeNode } from "./build-record-tree.ts"

const INDENT_STEP = "w-4"

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
  const tree = useMemo(() => buildRecordTree(records), [records])
  const folderPaths = useMemo(() => collectFolderPaths(tree), [tree])
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set())

  const allCollapsed = folderPaths.length > 0 && folderPaths.every((path) => collapsed.has(path))
  const toggle = (path: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  const toggleAll = () => setCollapsed(allCollapsed ? new Set() : new Set(folderPaths))

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-9 shrink-0 items-center justify-between gap-2 border-b px-3">
        <Text.H6M color="foregroundMuted" noWrap ellipsis>
          Records{records.length > 0 ? ` · ${records.length}` : ""}
        </Text.H6M>
        {folderPaths.length > 0 ? (
          <button
            type="button"
            onClick={toggleAll}
            title={allCollapsed ? "Expand all" : "Collapse all"}
            className="flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <Icon icon={allCollapsed ? ChevronsUpDownIcon : ChevronsDownUpIcon} size="sm" />
          </button>
        ) : null}
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-1 p-3">
          {[0, 1, 2, 3, 4].map((row) => (
            <Skeleton key={row} className="h-7 w-full" />
          ))}
        </div>
      ) : records.length === 0 ? (
        <div className="flex flex-1 items-center justify-center p-3">
          <Text.H6 color="foregroundMuted">No records</Text.H6>
        </div>
      ) : (
        <div role="tree" className="flex min-h-0 flex-1 flex-col overflow-y-auto py-2">
          {tree.map((node) => (
            <NodeRow
              key={node.path}
              node={node}
              rails={[]}
              collapsed={collapsed}
              onToggle={toggle}
              selectedRecordId={selectedRecordId}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function NodeRow({
  node,
  rails,
  collapsed,
  onToggle,
  selectedRecordId,
  onSelect,
}: {
  readonly node: RecordTreeNode
  /** One entry per ancestor level: whether that level's guide line sits on the active (selected) path. */
  readonly rails: readonly boolean[]
  readonly collapsed: ReadonlySet<string>
  readonly onToggle: (path: string) => void
  readonly selectedRecordId?: string | undefined
  readonly onSelect: (recordId: string) => void
}) {
  const isFolder = node.children.length > 0
  const open = isFolder && !collapsed.has(node.path)
  const isSelected = node.recordId !== undefined && node.recordId === selectedRecordId
  const childRailActive = selectedRecordId?.startsWith(`${node.path}/`) ?? false

  return (
    <>
      <button
        type="button"
        role="treeitem"
        {...(isFolder ? { "aria-expanded": open } : {})}
        aria-selected={isSelected}
        onClick={() => {
          if (isFolder) onToggle(node.path)
          if (node.recordId !== undefined) onSelect(node.recordId)
        }}
        className={cn(
          "group flex h-7 w-full shrink-0 cursor-pointer items-center px-2 text-left transition-colors",
          "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring",
          isSelected ? "bg-accent" : "hover:bg-muted",
        )}
      >
        {rails.map((active, level) => (
          <span key={`${node.path}:${level}`} className={cn("flex h-full shrink-0 justify-center", INDENT_STEP)}>
            <span className={cn("h-full w-px", active ? "bg-accent-foreground/50" : "bg-border")} />
          </span>
        ))}
        <span className={cn("flex h-full shrink-0 items-center justify-center", INDENT_STEP)}>
          {isFolder ? (
            <ChevronRightIcon
              className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", open && "rotate-90")}
            />
          ) : null}
        </span>
        <Icon
          icon={isFolder ? (open ? FolderOpenIcon : FolderIcon) : FileTextIcon}
          size="sm"
          color={isSelected ? "accentForeground" : "foregroundMuted"}
          className="mr-1.5 shrink-0"
        />
        <Text.H6
          color={isSelected ? "accentForeground" : "foreground"}
          className={cn("min-w-0 flex-1", isSelected && "font-medium")}
          noWrap
          ellipsis
        >
          {recordDisplayLabel(node.segment)}
        </Text.H6>
      </button>
      {isFolder && open ? (
        <div className="flex flex-col">
          {node.children.map((child) => (
            <NodeRow
              key={child.path}
              node={child}
              rails={[...rails, childRailActive]}
              collapsed={collapsed}
              onToggle={onToggle}
              selectedRecordId={selectedRecordId}
              onSelect={onSelect}
            />
          ))}
        </div>
      ) : null}
    </>
  )
}

function collectFolderPaths(nodes: readonly RecordTreeNode[]): readonly string[] {
  const paths: string[] = []
  const walk = (list: readonly RecordTreeNode[]) => {
    for (const node of list) {
      if (node.children.length > 0) {
        paths.push(node.path)
        walk(node.children)
      }
    }
  }
  walk(nodes)
  return paths
}
