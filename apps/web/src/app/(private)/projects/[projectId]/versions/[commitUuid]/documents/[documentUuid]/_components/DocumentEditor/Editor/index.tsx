'use client'

import useCurrentWorkspace from '$/stores/currentWorkspace'
import useFeature from '$/stores/useFeature'
import { DocumentEditor } from './DocumentEditor'
import { DocumentEditorProps, OldDocumentEditor } from './OldDocumentEditor'

export default function DocumentEditorWrapper(props: DocumentEditorProps) {
  const { data: workspace, isLoading } = useCurrentWorkspace()
  const feature = useFeature(workspace?.id, 'latte')

  if (isLoading || feature.isLoading || feature.isValidating) return null
  if (feature.isEnabled) return <DocumentEditor {...props} />

  return <OldDocumentEditor {...props} />
}
