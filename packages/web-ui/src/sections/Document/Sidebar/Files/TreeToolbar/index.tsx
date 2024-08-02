import { useState } from 'react'

import { Button, Text } from '$ui/ds/atoms'
import { DocumentIcon } from '$ui/sections/Document/Sidebar/Files/DocumentHeader'
import { useFileTreeContext } from '$ui/sections/Document/Sidebar/Files/FilesProvider'
import { FolderIcons } from '$ui/sections/Document/Sidebar/Files/FolderHeader'
import NodeHeaderWrapper from '$ui/sections/Document/Sidebar/Files/NodeHeaderWrapper'
import { useTempNodes } from '$ui/sections/Document/Sidebar/Files/useTempNodes'

export function TreeToolbar() {
  const { addToRootFolder } = useTempNodes((s) => ({
    addToRootFolder: s.addToRootFolder,
  }))
  const { onCreateFile } = useFileTreeContext()
  const [nodeInput, setNodeInput] = useState<'file' | 'folder' | undefined>()
  const isFile = nodeInput === 'file'
  return (
    <>
      <div className='flex flex-row items-center justify-between px-4 mb-2'>
        <Text.H5M>Files</Text.H5M>
        <div className='flex flex-row space-x-2'>
          <Button
            variant='ghost'
            size='none'
            iconProps={{
              name: 'folderPlus',
              size: 16,
              widthClass: 'w-6',
              heightClass: 'h-6',
            }}
            onClick={() => setNodeInput('folder')}
          />
          <Button
            variant='ghost'
            size='none'
            iconProps={{
              name: 'filePlus',
              size: 16,
              widthClass: 'w-6',
              heightClass: 'h-6',
            }}
            onClick={() => setNodeInput('file')}
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
