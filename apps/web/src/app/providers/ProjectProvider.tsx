'use client'

import useProjects from '$/stores/projects'
import type { Project } from '@latitude-data/core/schema/models/types/Project'
import { createContext, ReactNode, useContext, useMemo } from 'react'

type IProjectContextType = {
  project: Project
}

const ProjectContext = createContext<IProjectContextType>(
  {} as IProjectContextType,
)

const ProjectProvider = ({
  children,
  project: serverProject,
}: {
  children: ReactNode
} & IProjectContextType) => {
  const { data: projects } = useProjects()

  const project = useMemo(() => {
    return projects?.find((p) => p.id === serverProject.id) ?? serverProject
  }, [projects, serverProject])

  const contextValue = useMemo(() => ({ project }), [project])

  return (
    <ProjectContext.Provider value={contextValue}>
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

export { ProjectProvider, useCurrentProject, type IProjectContextType }
