'use client'
import { Workspace } from '@latitude-data/core/schema/models/types/Workspace'

import { createContext, ReactNode } from 'react'

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

export { WorkspaceProvider, type IWorkspaceContextType }
