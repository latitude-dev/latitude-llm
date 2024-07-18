'use client'

import { createContext, ReactNode, useContext } from 'react'

import { HEAD_COMMIT } from '@latitude-data/core/browser'

interface CommitContextType {
  commitUuid: string | typeof HEAD_COMMIT
  isDraft: boolean
}

const CommitContext = createContext<CommitContextType>({
  commitUuid: HEAD_COMMIT,
  isDraft: false,
})

const CommitProvider = ({
  children,
  ...context
}: {
  children: ReactNode
} & CommitContextType) => {
  return (
    <CommitContext.Provider value={context}>{children}</CommitContext.Provider>
  )
}

const useCurrentCommit = () => {
  const context = useContext(CommitContext)
  if (!context) {
    throw new Error('useCurrentCommit must be used within a CommitProvider')
  }
  return context
}

export { CommitProvider, useCurrentCommit }
