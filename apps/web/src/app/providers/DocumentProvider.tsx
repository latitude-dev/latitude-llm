'use client'

import { createContext, ReactNode, useContext, useMemo } from 'react'
import useDocumentVersions from '$/stores/documentVersions'
import { DocumentVersion } from '@latitude-data/core/schema/types'

type DocumentVersionContext = {
  document: DocumentVersion
  mutateDocumentUpdated: (document: DocumentVersion) => void
}
const DocumentContext = createContext<DocumentVersionContext>({
  document: {},
} as DocumentVersionContext)

const DocumentVersionProvider = ({
  children,
  document: fallbackDocument,
  projectId,
  commitUuid,
}: {
  children: ReactNode
  document: DocumentVersion
  projectId: number
  commitUuid: string
}) => {
  const { data: documents, mutateDocumentUpdated } = useDocumentVersions({
    projectId: projectId,
    commitUuid: commitUuid,
  })
  const document = useMemo(
    () =>
      documents.find((d) => d.documentUuid === fallbackDocument.documentUuid),
    [documents, fallbackDocument],
  )

  return (
    <DocumentContext.Provider
      value={{
        mutateDocumentUpdated,
        document: document ?? fallbackDocument,
      }}
    >
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
const useCurrentDocumentMaybe = () => {
  const context = useContext(DocumentContext)
  return context
}

export { DocumentVersionProvider, useCurrentDocument, useCurrentDocumentMaybe }
