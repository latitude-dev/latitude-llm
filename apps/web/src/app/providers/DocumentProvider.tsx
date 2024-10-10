'use client'

import { createContext, ReactNode, useContext, useMemo } from 'react'

import { DocumentVersion } from '@latitude-data/core/browser'
import useDocumentVersions from '$/stores/documentVersions'

const DocumentContext = createContext<DocumentVersion | undefined>(undefined)

const DocumentVersionProvider = ({
  children,
  document: fallbackDocument,
  documentUuid,
  projectId,
  commitUuid,
}: {
  children: ReactNode
  document: DocumentVersion
  documentUuid: string
  projectId: number
  commitUuid: string
}) => {
  const { data: documents } = useDocumentVersions({
    projectId,
    commitUuid,
  })

  const document = useMemo(() => {
    return (
      documents?.find((d) => d.id === fallbackDocument.id) ?? fallbackDocument
    )
  }, [documents, documentUuid, fallbackDocument])

  return (
    <DocumentContext.Provider value={document || fallbackDocument}>
      {children}
    </DocumentContext.Provider>
  )
}

const useCurrentDocument = () => {
  const context = useContext(DocumentContext)
  if (!context) {
    throw new Error(
      'useCurrentDocument must be used within a DocumentVersionProvider',
    )
  }
  return context
}

export { DocumentVersionProvider, useCurrentDocument }
