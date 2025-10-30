import { ReactNode } from 'react'
import { Metadata } from 'next'
import buildMetatags from '$/app/_lib/buildMetatags'
import ProjectLayout from '../_components/ProjectLayout'

export async function generateMetadata(): Promise<Metadata> {
  return buildMetatags({
    title: 'Issues',
  })
}

export default async function IssuesLayout({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{ projectId: string; commitUuid: string }>
}) {
  const { projectId, commitUuid } = await params
  return (
    <ProjectLayout projectId={Number(projectId)} commitUuid={commitUuid}>
      {children}
    </ProjectLayout>
  )
}
