'use client'

import {
  Node,
  SidebarDocument,
  useTree,
} from '$ui/sections/DocumentsSidebar/useTree'

function TreeNode({ node, level = 0 }: { node: Node; level?: number }) {
  return (
    <div key={node.id}>
      <div className='flex flex-col gap-2' style={{ paddingLeft: level * 2 }}>
        {node.children.map((node, idx) => (
          <TreeNode key={idx} node={node} level={level + 1} />
        ))}
      </div>
    </div>
  )
}

export default function DocumentTree({
  documents,
}: {
  documents: SidebarDocument[]
}) {
  const rootNode = useTree({ documents })

  return <TreeNode node={rootNode} />
}
