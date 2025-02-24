'use client'

import { ChangeEvent, useCallback, useRef } from 'react'

import { create } from 'zustand'

import { Button, Text, Tooltip } from '../../../../../ds/atoms'
import { useFileTreeContext } from '../FilesProvider'
import NodeHeaderWrapper from '../NodeHeaderWrapper'
import { useTempNodes } from '../useTempNodes'
import { ModifiedDocumentType } from '@latitude-data/core/browser'

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
  const {
    isLoading,
    isMerged,
    onMergeCommitClick,
    onCreateFile,
    onUploadFile,
  } = useFileTreeContext()
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

  const fileUploadInputRef = useRef<HTMLInputElement>(null)
  const onClickFileUploadInput = useCallback(() => {
    if (isMerged) onMergeCommitClick()
    else fileUploadInputRef.current?.click()
  }, [isMerged, onMergeCommitClick])
  const onFileUploadChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]
      if (!file) return

      const filename = file.name.replace(/\.promptl$/, '').replace(/\s+/g, '_')
      onUploadFile({ path: filename, file })

      event.target.value = ''
    },
    [onUploadFile],
  )

  return (
    <>
      <div className='bg-background sticky top-0 flex flex-row items-center justify-between px-4'>
        <Text.H5M>Files</Text.H5M>
        <div className='flex flex-row space-x-2'>
          <Tooltip
            asChild
            trigger={
              <Button
                variant='ghost'
                size='none'
                lookDisabled={isMerged}
                disabled={isLoading}
                iconProps={{ name: 'folderPlus' }}
                onClick={onClick(EntityType.Folder)}
              />
            }
          >
            New folder
          </Tooltip>
          <Tooltip
            asChild
            trigger={
              <Button
                variant='ghost'
                size='none'
                lookDisabled={isMerged}
                disabled={isLoading}
                iconProps={{ name: 'filePlus' }}
                onClick={onClick(EntityType.File)}
              />
            }
          >
            New prompt
          </Tooltip>
          <Tooltip
            asChild
            trigger={
              <Button
                variant='ghost'
                size='none'
                lookDisabled={isMerged}
                disabled={isLoading}
                iconProps={{ name: 'paperclip' }}
                onClick={onClickFileUploadInput}
              />
            }
          >
            Upload document
          </Tooltip>
          <input
            ref={fileUploadInputRef}
            type='file'
            multiple={false}
            className='hidden'
            onChange={onFileUploadChange}
          />
        </div>
      </div>
      {nodeInput ? (
        <NodeHeaderWrapper
          open={false}
          canDrag={false}
          draggble={undefined}
          hasChildren={false}
          isFile={isFile}
          name=''
          isEditing={true}
          setIsEditing={() => {}}
          icons={isFile ? ['file'] : ['chevronRight', 'folderClose']}
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
          changeType={ModifiedDocumentType.Created}
        />
      ) : null}
    </>
  )
}
