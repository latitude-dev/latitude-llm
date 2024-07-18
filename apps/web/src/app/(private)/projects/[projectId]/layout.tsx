import { ReactNode } from 'react'

import { ProjectProvider } from '@latitude-data/web-ui'

export default async function PrivateLayout({
  children,
  params,
}: {
  children: ReactNode
  params: { projectId: number }
}) {
  const { projectId } = params

  return <ProjectProvider projectId={projectId}>{children}</ProjectProvider>
}
