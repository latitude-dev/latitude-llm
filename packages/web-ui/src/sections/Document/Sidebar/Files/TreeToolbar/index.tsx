import { useCallback } from 'react'

import { create } from 'zustand'

import { Button, Text } from '../../../../../ds/atoms'
import { DocumentIcon } from '../DocumentHeader'
import { useFileTreeContext } from '../FilesProvider'
import { FolderIcons } from '../FolderHeader'
import NodeHeaderWrapper from '../NodeHeaderWrapper'
import { useTempNodes } from '../useTempNodes'

export enum EntityType {
  File = 'file',
  Folder = 'folder',
}

interface NodeInputState {
  nodeInput: EntityType | undefined
  setNodeInput: (type: EntityType | undefined) => void
}

export const useNodeInput = create<NodeInputState>((set) => ({
  nodeInput: undefined,
  setNodeInput: (type) => set({ nodeInput: type }),
}))

export function TreeToolbar() {
  const { addToRootFolder } = useTempNodes((s) => ({
    addToRootFolder: s.addToRootFolder,
  }))
  const { isMerged, onMergeCommitClick, onCreateFile } = useFileTreeContext()
  const { nodeInput, setNodeInput } = useNodeInput()
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
      <div className='bg-background sticky top-0 flex flex-row items-center justify-between px-4'>
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
              onCreateFile(path)
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
