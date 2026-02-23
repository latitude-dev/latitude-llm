import { ClientOnly } from '@latitude-data/web-ui/atoms/ClientOnly'
import { cn } from '@latitude-data/web-ui/utils'
import { useParams } from 'next/navigation'
import { FileNode, TempFolderChildren } from './FileNode'
import { TreeToolbar } from './TreeToolbar'
import { useOpenCurrentDocumentPath } from './useOpenCurrentDocumentPath'
import { SidebarDocument, useTree, useTreeTopLevelNodeIds } from './useTree'

export function FilesTree({
  promptManagement,
  currentUuid,
  documents,
  liveDocuments,
}: {
  promptManagement: boolean
  documents: SidebarDocument[]
  liveDocuments?: SidebarDocument[]
  currentUuid: string | undefined
}) {
  const { evaluationUuid: currentEvaluationUuid } = useParams()
  useTree({
    documents,
    liveDocuments,
  })
  const topLevelNodeIds = useTreeTopLevelNodeIds()
  useOpenCurrentDocumentPath({ currentUuid, documents })

  return (
    <ClientOnly>
      <div className='flex flex-col gap-2'>
        <TreeToolbar promptManagement={promptManagement} />
        <ul className={cn('flex flex-col pt-1 pb-8')}>
          <TempFolderChildren parentPath='' />
          {topLevelNodeIds.map((nodeId) => (
            <li key={nodeId} className='cursor-pointer'>
              <FileNode
                nodeId={nodeId}
                currentUuid={currentUuid}
                currentEvaluationUuid={currentEvaluationUuid}
              />
            </li>
          ))}
        </ul>
      </div>
    </ClientOnly>
  )
}
