'use client'

import { createContext, ReactNode, useContext } from 'react'

interface ProjectContextType {
  projectId: number
}

const ProjectContext = createContext<ProjectContextType>({
  projectId: 0,
})

const ProjectProvider = ({
  children,
  ...context
}: {
  children: ReactNode
} & ProjectContextType) => {
  return (
    <ProjectContext.Provider value={context}>
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
