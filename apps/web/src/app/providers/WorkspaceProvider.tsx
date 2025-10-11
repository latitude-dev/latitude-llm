'use client'

import { Workspace } from '@latitude-data/core/schema/types'
import { createContext, ReactNode, useContext } from 'react'

interface IWorkspaceContextType {
  workspace: Workspace
}

const WorkspaceContext = createContext<IWorkspaceContextType>(
  {} as IWorkspaceContextType,
)

const WorkspaceProvider = ({
  children,
  workspace,
}: { children: ReactNode } & IWorkspaceContextType) => {
  return (
    <WorkspaceContext.Provider value={{ workspace }}>
      {children}
    </WorkspaceContext.Provider>
  )
}

const useCurrentWorkspace = () => {
  const context = useContext(WorkspaceContext)
  if (!context) {
    throw new Error(
      'useCurrentWorkspace must be used within a WorkspaceProvider',
    )
  }
  return context
}

export { WorkspaceProvider, useCurrentWorkspace, type IWorkspaceContextType }
