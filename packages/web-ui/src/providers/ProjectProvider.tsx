'use client'

import { createContext, ReactNode, useContext } from 'react'

type IProjectContextType = {
  project: { id: number; name: string }
}

const ProjectContext = createContext<IProjectContextType>(
  {} as IProjectContextType,
)

const ProjectProvider = ({
  children,
  project,
}: {
  children: ReactNode
} & IProjectContextType) => {
  return (
    <ProjectContext.Provider value={{ project }}>
      {children}
    </ProjectContext.Provider>
  )
}

const useCurrentProject = () => {
  const context = useContext(ProjectContext)
  if (!context) {
    throw new Error('useCurrentProject must be used within a ProjectProvider')
  }
  return context
}

export { ProjectProvider, useCurrentProject }
