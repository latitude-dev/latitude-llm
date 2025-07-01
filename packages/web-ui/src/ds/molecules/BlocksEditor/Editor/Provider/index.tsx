import { createContext, ReactNode, useContext, useRef } from 'react'
import { BlocksEditorProps } from '../../types'

type IBlocksProvider = {
  prompts: BlocksEditorProps['prompts']
  Link: BlocksEditorProps['Link']
}

const BlocksEditorContext = createContext<IBlocksProvider | undefined>(
  undefined,
)

export function BlocksEditorProvider({
  children,
  Link,
  prompts,
}: {
  children: ReactNode
  prompts: BlocksEditorProps['prompts']
  Link: BlocksEditorProps['Link']
}) {
  const value = useRef<IBlocksProvider>({ prompts, Link })
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
