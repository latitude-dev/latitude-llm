'use client'
import { useCallback } from 'react'
import { create } from 'zustand'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { ModifiedDocumentType } from '@latitude-data/core/browser'
import { Tooltip } from '@latitude-data/web-ui/atoms/Tooltip'

import { useFileTreeContext } from '../FilesProvider'
import NodeHeaderWrapper from '../NodeHeaderWrapper'
import { useTempNodes } from '../useTempNodes'
import { IconName } from '@latitude-data/web-ui/atoms/Icons'

export enum EntityType {
  Prompt = 'prompt',
  Agent = 'agent',
  Folder = 'folder',
}
const FILE_TYPES = [EntityType.Prompt, EntityType.Agent]

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
    onCreateAgent,
  } = useFileTreeContext()
  const { nodeInput, setNodeInput } = useNodeInput()
  const isFile = nodeInput ? FILE_TYPES.includes(nodeInput) : false
  const icons: IconName[] = nodeInput
    ? nodeInput === EntityType.Folder
      ? ['folderClose']
      : nodeInput === EntityType.Prompt
        ? ['file']
        : ['bot']
    : []

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
      <div className='bg-background sticky top-0 flex flex-row items-center justify-between pl-4 pr-2'>
        <Text.H5M>Files</Text.H5M>
        <div className='flex flex-row space-x-2'>
          <Tooltip
            asChild
            trigger={
              <Button
                variant='ghost'
                size='icon'
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
                size='icon'
                lookDisabled={isMerged}
                disabled={isLoading}
                iconProps={{ name: 'filePlus' }}
                onClick={onClick(EntityType.Prompt)}
              />
            }
          >
            New prompt
          </Tooltip>
          <Tooltip
            asChild
            trigger={
              <Button
                variant='shiny'
                size='icon'
                lookDisabled={isMerged}
                disabled={isLoading}
                iconProps={{
                  name: 'bot',
                  color: isMerged ? 'foregroundMuted' : 'primary',
                  darkColor: isMerged ? 'foregroundMuted' : 'foreground',
                }}
                onClick={onClick(EntityType.Agent)}
              />
            }
          >
            New AI agent
          </Tooltip>
        </div>
      </div>
      {nodeInput ? (
        <NodeHeaderWrapper
          open={false}
          canDrag={false}
          draggble={undefined}
          hasChildren={false}
          isFile={isFile}
          isAgent={nodeInput === EntityType.Agent}
          name=''
          isEditing={true}
          setIsEditing={() => {}}
          icons={icons}
          indentation={[{ isLast: true }]}
          onSaveValue={async ({ path }) => {
            if (nodeInput === EntityType.Prompt) {
              onCreateFile(path)
            } else if (nodeInput === EntityType.Agent) {
              onCreateAgent(path)
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
