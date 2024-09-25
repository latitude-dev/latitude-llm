import { useCallback, useState } from 'react'

import { Button, Text } from '../../../../../ds/atoms'
import { DocumentIcon } from '../DocumentHeader'
import { useFileTreeContext } from '../FilesProvider'
import { FolderIcons } from '../FolderHeader'
import NodeHeaderWrapper from '../NodeHeaderWrapper'
import { useTempNodes } from '../useTempNodes'

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
            iconProps={{ name: 'folderPlus' }}
            onClick={onClick(EntityType.Folder)}
          />
          <Button
            variant='ghost'
            size='none'
            lookDisabled={isMerged}
            iconProps={{ name: 'filePlus' }}
            onClick={onClick(EntityType.File)}
          />
        </div>
      </div>
      {nodeInput ? (
        <NodeHeaderWrapper
          open={false}
          hasChildren={false}
          isFile={isFile}
          name=''
          isEditing={true}
          setIsEditing={() => {}}
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
