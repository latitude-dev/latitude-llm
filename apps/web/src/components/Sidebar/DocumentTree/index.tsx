'use client'

import type { DocumentVersion } from '@latitude-data/core'
import { useCurrentCommit, useCurrentProject } from '@latitude-data/web-ui'
import useDocumentVersions from '$/stores/documentVersions'

import { Node, useTree } from '../toTree'

export function CreateNode({ parentId }: { parentId?: number }) {
  return (
    <div className='flex flex-row items-center gap-1'>
      <CreateFolder parentId={parentId} />
      <CreateDocument parentId={parentId} />
    </div>
  )
}

function CreateFolder({ parentId }: { parentId?: number }) {
  const { commit } = useCurrentCommit()
  const isDraft = !commit.mergedAt
  const { project } = useCurrentProject()
  const { create } = useDocumentVersions({
    projectId: project.id,
    commitUuid: commit.uuid,
  })
  return (
    <button
      disabled={!isDraft}
      onClick={() => {
        if (!isDraft) return
        create({
          path: String(parentId), // TODO: This makes no sense, it's just so the linter doesn't complain
        })
      }}
    >
      +F
    </button>
  )
}

function CreateDocument({ parentId }: { parentId?: number }) {
  const { commit } = useCurrentCommit()
  const isDraft = !commit.mergedAt
  const { project } = useCurrentProject()
  const { create } = useDocumentVersions({
    projectId: project.id,
    commitUuid: commit.uuid,
  })
  return (
    <button
      disabled={!isDraft}
      onClick={() => {
        if (!isDraft) return
        create({
          path: String(parentId),
        }) // TODO: This makes no sense, it's just so the linter doesn't complain
      }}
    >
      +D
    </button>
  )
}

function TreeNode({ node, level = 0 }: { node: Node; level?: number }) {
  return (
    <div key={node.doc?.id || 'root'}>
      <div className='flex flex-col gap-2' style={{ paddingLeft: level * 2 }}>
        {!!node.doc && (
          <div className='flex flex-row align-items justify-between'></div>
        )}
        {node.children.map((node, idx) => (
          <TreeNode key={idx} node={node} level={level + 1} />
        ))}
      </div>
    </div>
  )
}

export default function DocumentTree({
  documents: serverDocuments,
}: {
  documents: DocumentVersion[]
}) {
  const { commit } = useCurrentCommit()
  const { project } = useCurrentProject()
  const { documents } = useDocumentVersions(
    { commitUuid: commit.uuid, projectId: project.id },
    { fallbackData: serverDocuments },
  )
  const rootNode = useTree({ documents })

  return <TreeNode node={rootNode} />
}
