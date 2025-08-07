'use client'

import type { Commit } from '@latitude-data/core/browser'
import { createContext, type ReactNode, useContext } from 'react'

interface ICommitContextType {
  commit: Commit
  isHead: boolean
}

const CommitContext = createContext<ICommitContextType>({} as ICommitContextType)

const CommitProvider = ({
  children,
  commit,
  isHead,
}: {
  children: ReactNode
} & ICommitContextType) => {
  return <CommitContext.Provider value={{ commit, isHead }}>{children}</CommitContext.Provider>
}

const useCurrentCommit = () => {
  const context = useContext(CommitContext)
  if (!context) {
    throw new Error('useCurrentCommit must be used within a CommitProvider')
  }
  return context
}

export { CommitProvider, useCurrentCommit, type ICommitContextType }
