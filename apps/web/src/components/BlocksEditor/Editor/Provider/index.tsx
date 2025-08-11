import { createContext, ReactNode, useContext, useRef } from 'react'
import { BlocksEditorProps } from '../../types'

type IBlocksProvider = {
  currentDocument: BlocksEditorProps['currentDocument']
  prompts: BlocksEditorProps['prompts']
  readOnly: boolean
}

const BlocksEditorContext = createContext<IBlocksProvider | undefined>(
  undefined,
)

export function BlocksEditorProvider({
  children,
  currentDocument,
  prompts,
  readOnly,
}: {
  children: ReactNode
  currentDocument: BlocksEditorProps['currentDocument']
  prompts: BlocksEditorProps['prompts']
  readOnly: boolean
}) {
  const value = useRef<IBlocksProvider>({
    currentDocument,
    prompts,
    readOnly,
  })
  return (
    <BlocksEditorContext.Provider value={value.current}>
      {children}
    </BlocksEditorContext.Provider>
  )
}

export function useBlocksEditorContext() {
  const context = useContext(BlocksEditorContext)

  if (!context) {
    throw new Error(
      'useBlocksEditorContext must be used within an BlocksEditorProvider',
    )
  }
  return context
}
