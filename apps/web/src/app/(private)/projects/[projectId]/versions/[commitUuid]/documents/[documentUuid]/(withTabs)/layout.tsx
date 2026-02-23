import { getDocumentByUuidCached } from '$/app/(private)/_data-access'
import { ReactNode } from 'react'
import DocumentTabs from '../_components/DocumentTabs'
import { TraceSpanSelectionProvider } from '$/components/traces/TraceSpanSelectionContext'

export default async function WithTabsLayout({
  children,
  params,
}: {
  params: Promise<{
    projectId: string
    commitUuid: string
    documentUuid: string
  }>
  children: ReactNode
}) {
  const paramsAwaited = await params
  const { projectId, commitUuid, documentUuid } = paramsAwaited
  const document = await getDocumentByUuidCached({
    projectId: Number(projectId),
    commitUuid,
    documentUuid,
  })

  return (
    <TraceSpanSelectionProvider>
      <DocumentTabs document={document} params={paramsAwaited}>
        {children}
      </DocumentTabs>
    </TraceSpanSelectionProvider>
  )
}
