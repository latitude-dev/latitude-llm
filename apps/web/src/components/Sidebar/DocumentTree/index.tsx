'use client'

import { faker } from '@faker-js/faker'
import type { DocumentType, DocumentVersion } from '@latitude-data/core'
import useDocumentVersions from '$/stores/documentVersions'

import toTree, { Node } from '../toTree'

function generateName() {
  return faker.science.chemicalElement().name
}

export function CreateNode({ parentId }: { parentId?: number }) {
  return (
    <div className='flex flex-row items-center gap-1'>
      <CreateFolder parentId={parentId} />
      <CreateDocument parentId={parentId} />
    </div>
  )
}

function CreateFolder({ parentId }: { parentId?: number }) {
  const { create } = useDocumentVersions({ staged: true })
  return (
    <button
      onClick={() =>
        create({
          parentId,
          documentType: 'folder' as DocumentType.Folder,
          name: generateName(),
        })
      }
    >
      +F
    </button>
  )
}

function CreateDocument({ parentId }: { parentId?: number }) {
  const { create } = useDocumentVersions({ staged: true })
  return (
    <button onClick={() => create({ parentId, name: generateName() })}>
      +D
    </button>
  )
}

function TreeNode({ node, level = 0 }: { node: Node; level?: number }) {
  return (
    <div key={node.doc?.id || 'root'}>
      <div className='flex flex-col gap-2' style={{ paddingLeft: level * 2 }}>
        {!!node.doc && (
          <div className='flex flex-row align-items justify-between'>
            {node.doc.documentType === 'folder' ? (
              <>
                <p>{node.doc.name}</p>
                <CreateNode parentId={node.doc.id} />
              </>
            ) : (
              <p className='font-bold'>{node.doc.name}</p>
            )}
          </div>
        )}
        {node.children.map((node) => (
          <TreeNode node={node} level={level + 1} />
        ))}
      </div>
    </div>
  )
}

export default function DocumentTree({ nodes }: { nodes: DocumentVersion[] }) {
  const { data } = useDocumentVersions(
    { staged: true },
    { fallbackData: nodes },
  )
  const rootNode = toTree(data)

  return <TreeNode node={rootNode} />
}
