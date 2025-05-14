import DocumentsLayout from '../_components/DocumentsLayout'
import { MainPage } from './_components/MainPage'

export default async function CopilotPage({
  params,
}: {
  params: Promise<{ projectId: string; commitUuid: string }>
}) {
  const { projectId, commitUuid } = await params

  return (
    <DocumentsLayout projectId={Number(projectId)} commitUuid={commitUuid}>
      <MainPage />
    </DocumentsLayout>
  )
}
