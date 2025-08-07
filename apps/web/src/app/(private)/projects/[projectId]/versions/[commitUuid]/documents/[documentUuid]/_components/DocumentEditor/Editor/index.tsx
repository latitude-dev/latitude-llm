'use client'

import useFeature from '$/stores/useFeature'
import useCurrentWorkspace from '$/stores/currentWorkspace'
import { type DocumentEditorProps, OldDocumentEditor } from './OldDocumentEditor'
import { DocumentEditor } from './DocumentEditor'

export default function DocumentEditorWrapper(props: DocumentEditorProps) {
  const { data: workspace, isLoading } = useCurrentWorkspace()
  const feature = useFeature(workspace?.id, 'latte')

  if (isLoading || feature.isLoading || feature.isValidating) return null
  if (feature.isEnabled) return <DocumentEditor {...props} />

  return <OldDocumentEditor {...props} />
}
