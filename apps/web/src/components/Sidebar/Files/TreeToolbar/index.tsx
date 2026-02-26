'use client'

import { memo, useCallback } from 'react'
import { create } from 'zustand'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Tooltip } from '@latitude-data/web-ui/atoms/Tooltip'

import NodeHeaderWrapper from '../NodeHeaderWrapper'
import { useTempNodes } from '../useTempNodes'
import { IconName } from '@latitude-data/web-ui/atoms/Icons'
import { ModifiedDocumentType } from '@latitude-data/core/constants'
import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { useDocumentVersionActions } from '$/stores/actions/documentVersionActions'
import { SidebarDocument } from '../useTree'

export enum EntityType {
  Prompt = 'prompt',
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

export const TreeToolbar = memo(function TreeToolbar({
  promptManagement,
  documents,
}: {
  promptManagement: boolean
  documents: SidebarDocument[]
}) {
  const addToRootFolder = useTempNodes((state) => state.addToRootFolder)
  const { commit } = useCurrentCommit()
  const { project } = useCurrentProject()
  const { createFile, isLoading } = useDocumentVersionActions({
    commitUuid: commit.uuid,
    projectId: project.id,
  })
  const isMerged = !!commit.mergedAt
  const { nodeInput, setNodeInput } = useNodeInput()
  const isFile = nodeInput ? nodeInput === EntityType.Prompt : false
  const icons: IconName[] =
    nodeInput === EntityType.Folder
      ? ['folderClose']
      : nodeInput === EntityType.Prompt
        ? ['file']
        : []

  const onClick = useCallback(
    (entityType: EntityType) => () => {
      if (isMerged) {
        // do nothing
      } else {
        setNodeInput(entityType)
      }
    },
    [setNodeInput, isMerged],
  )
  const headerText = promptManagement
    ? 'Files'
    : documents.length > 0
      ? 'Traces paths'
      : null

  return (
    <>
      <div className='bg-background sticky top-0 flex flex-row items-center justify-between pl-4 pr-2 z-10'>
        {headerText ? <Text.H5M>{headerText}</Text.H5M> : null}
        {promptManagement && (
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
              New file
            </Tooltip>
          </div>
        )}
      </div>
      {nodeInput ? (
        <div className='flex min-w-0'>
          {isFile ? <div className='w-4 shrink-0' /> : null}
          <div className='flex-1 min-w-0'>
            <NodeHeaderWrapper
              depth={0}
              open={false}
              hasChildren={false}
              isFile={isFile}
              name=''
              isEditing={true}
              setIsEditing={() => {}}
              icons={icons}
              onSaveValue={async ({ path }) => {
                if (isFile) {
                  await createFile({ path, agent: false })
                } else {
                  addToRootFolder({ path })
                }

                setNodeInput(undefined)
              }}
              onLeaveWithoutSave={() => setNodeInput(undefined)}
              changeType={ModifiedDocumentType.Created}
            />
          </div>
        </div>
      ) : null}
    </>
  )
})
