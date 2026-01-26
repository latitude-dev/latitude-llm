'use client'

import { useCommitsFromProject } from '$/stores/commitsStore'
import type { Project } from '@latitude-data/core/schema/models/types/Project'
import type { Commit } from '@latitude-data/core/schema/models/types/Commit'
import { createContext, ReactNode, useContext, useMemo } from 'react'

interface ICommitContextType {
  commit: Commit
  isHead: boolean
}

const CommitContext = createContext<ICommitContextType>(
  {} as ICommitContextType,
)

const CommitProvider = ({
  children,
  project,
  commit: serverCommit,
  isHead,
}: {
  project: Project
  children: ReactNode
} & ICommitContextType) => {
  const { data: commits } = useCommitsFromProject(project.id)

  const commit = useMemo(() => {
    return commits?.find((c) => c.uuid === serverCommit.uuid) ?? serverCommit
  }, [commits, serverCommit])

  const contextValue = useMemo(() => ({ commit, isHead }), [commit, isHead])

  return (
    <CommitContext.Provider value={contextValue}>
      {children}
    </CommitContext.Provider>
  )
}

const useCurrentCommit = () => {
  const context = useContext(CommitContext)
  if (!context) {
    throw new Error('useCurrentCommit must be used within a CommitProvider')
  }
  return context
}

export { CommitProvider, useCurrentCommit, type ICommitContextType }
