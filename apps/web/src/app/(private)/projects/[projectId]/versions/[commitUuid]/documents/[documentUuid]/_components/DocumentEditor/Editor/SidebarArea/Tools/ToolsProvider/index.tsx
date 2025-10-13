import { createContext, ReactNode } from 'react'
import { SidebarEditorState } from '../hooks/useActiveIntegrationsStore'

type IToolsContext = {
  addIntegrationTool: (
    args: Parameters<SidebarEditorState['addTool']>[0],
  ) => void
  removeIntegrationTool: (
    args: Parameters<SidebarEditorState['removeTool']>[0],
  ) => void
}

export const ToolsContext = createContext<IToolsContext>({} as IToolsContext)

export function ToolsProvider({
  children,
  addIntegrationTool,
  removeIntegrationTool,
}: {
  children: ReactNode
} & IToolsContext) {
  return (
    <ToolsContext.Provider
      value={{ addIntegrationTool, removeIntegrationTool }}
    >
      {children}
    </ToolsContext.Provider>
  )
}
