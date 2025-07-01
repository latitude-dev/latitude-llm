import { createContext, ReactNode, useContext, useRef } from 'react'
import { BlocksEditorProps } from '../../types'

type IBlocksProvider = {
  currentDocument: BlocksEditorProps['currentDocument']
  prompts: BlocksEditorProps['prompts']
  Link: BlocksEditorProps['Link']
}

const BlocksEditorContext = createContext<IBlocksProvider | undefined>(
  undefined,
)

export function BlocksEditorProvider({
  children,
  currentDocument,
  Link,
  prompts,
}: {
  children: ReactNode
  currentDocument: BlocksEditorProps['currentDocument']
  prompts: BlocksEditorProps['prompts']
  Link: BlocksEditorProps['Link']
}) {
  const value = useRef<IBlocksProvider>({ currentDocument, prompts, Link })
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
