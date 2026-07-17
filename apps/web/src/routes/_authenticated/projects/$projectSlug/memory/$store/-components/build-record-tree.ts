export interface RecordTreeNode {
  readonly segment: string
  readonly path: string
  /** Set when this node is itself a record (a leaf, or a folder that is also a record). */
  readonly recordId?: string
  readonly children: readonly RecordTreeNode[]
}

interface MutableNode {
  readonly segment: string
  readonly path: string
  recordId?: string
  readonly children: Map<string, MutableNode>
}

/** Build a nested tree from record ids split on `/`; ids without `/` become flat siblings. */
export function buildRecordTree(records: readonly { readonly recordId: string }[]): readonly RecordTreeNode[] {
  const roots = new Map<string, MutableNode>()
  for (const { recordId } of records) {
    const segments = recordId.split("/")
    let level = roots
    let prefix = ""
    let node: MutableNode | undefined
    for (const [index, segment] of segments.entries()) {
      prefix = index === 0 ? segment : `${prefix}/${segment}`
      const existing = level.get(segment)
      node = existing ?? { segment, path: prefix, children: new Map() }
      if (!existing) level.set(segment, node)
      level = node.children
    }
    if (node) node.recordId = recordId
  }
  return freezeLevel(roots)
}

function freezeLevel(level: Map<string, MutableNode>): readonly RecordTreeNode[] {
  return [...level.values()]
    .map(
      (node): RecordTreeNode => ({
        segment: node.segment,
        path: node.path,
        ...(node.recordId !== undefined ? { recordId: node.recordId } : {}),
        children: freezeLevel(node.children),
      }),
    )
    .sort(compareNodes)
}

// Folders before files, then alphabetical within each group.
function compareNodes(a: RecordTreeNode, b: RecordTreeNode): number {
  const aFolder = a.children.length > 0
  const bFolder = b.children.length > 0
  if (aFolder !== bFolder) return aFolder ? -1 : 1
  return a.segment < b.segment ? -1 : a.segment > b.segment ? 1 : 0
}
