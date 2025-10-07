'use client'

import { DocumentEditorContentArea } from './ContentArea'

export default function DocumentEditor(props: {
  freeRunsCount?: number
  refinementEnabled: boolean
  showPreview?: boolean
}) {
  return (
    <DocumentEditorContentArea
      freeRunsCount={props.freeRunsCount}
      refinementEnabled={props.refinementEnabled}
      showPreview={props.showPreview}
    />
  )
}
