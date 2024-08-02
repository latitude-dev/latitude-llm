import { useCallback, useState } from 'react'

import { Button, Text } from '$ui/ds/atoms'
import { DocumentIcon } from '$ui/sections/Document/Sidebar/Files/DocumentHeader'
import { useFileTreeContext } from '$ui/sections/Document/Sidebar/Files/FilesProvider'
import { FolderIcons } from '$ui/sections/Document/Sidebar/Files/FolderHeader'
import NodeHeaderWrapper from '$ui/sections/Document/Sidebar/Files/NodeHeaderWrapper'
import { useTempNodes } from '$ui/sections/Document/Sidebar/Files/useTempNodes'

enum EntityType {
  File = 'file',
  Folder = 'folder',
}
export function TreeToolbar() {
  const { addToRootFolder } = useTempNodes((s) => ({
    addToRootFolder: s.addToRootFolder,
  }))
  const { isMerged, onMergeCommitClick, onCreateFile } = useFileTreeContext()
  const [nodeInput, setNodeInput] = useState<EntityType | undefined>()
  const isFile = nodeInput === EntityType.File
  const onClick = useCallback(
    (entityType: EntityType) => () => {
      if (isMerged) {
        onMergeCommitClick()
      } else {
        setNodeInput(entityType)
      }
    },
    [setNodeInput, isMerged, onMergeCommitClick],
  )
  return (
    <>
      <div className='bg-background sticky top-0 flex flex-row items-center justify-between px-4 mb-2'>
        <Text.H5M>Files</Text.H5M>
        <div className='flex flex-row space-x-2'>
          <Button
            variant='ghost'
            size='none'
            lookDisabled={isMerged}
            iconProps={{
              name: 'folderPlus',
              size: 16,
              widthClass: 'w-6',
              heightClass: 'h-6',
            }}
            onClick={onClick(EntityType.Folder)}
          />
          <Button
            variant='ghost'
            size='none'
            lookDisabled={isMerged}
            iconProps={{
              name: 'filePlus',
              size: 16,
              widthClass: 'w-6',
              heightClass: 'h-6',
            }}
            onClick={onClick(EntityType.File)}
          />
        </div>
      </div>
      {nodeInput ? (
        <NodeHeaderWrapper
          open={false}
          hasChildren={false}
          isFile={isFile}
          name=' '
          icons={isFile ? <DocumentIcon /> : <FolderIcons open={false} />}
          indentation={[{ isLast: true }]}
          onSaveValue={async ({ path }) => {
            if (isFile) {
              await onCreateFile(path)
            } else {
              addToRootFolder({ path })
            }

            setNodeInput(undefined)
          }}
          onLeaveWithoutSave={() => setNodeInput(undefined)}
        />
      ) : null}
    </>
  )
}
