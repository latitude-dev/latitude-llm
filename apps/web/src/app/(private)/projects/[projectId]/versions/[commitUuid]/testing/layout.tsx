import buildMetatags from '$/app/_lib/buildMetatags'
import ProjectLayout from '../_components/ProjectLayout'

export const metadata = buildMetatags({
  locationDescription: 'Deployment Testing Page',
})

export default async function TestingLayout({
  params,
  children,
}: {
  params: Promise<{ projectId: string; commitUuid: string }>
  children: React.ReactNode
}) {
  const { projectId, commitUuid } = await params
  return (
    <ProjectLayout projectId={Number(projectId)} commitUuid={commitUuid}>
      {children}
    </ProjectLayout>
  )
}
