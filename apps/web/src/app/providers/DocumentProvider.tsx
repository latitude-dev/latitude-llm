'use client'

import { createContext, ReactNode, useContext, useMemo } from 'react'

import { DocumentVersion } from '@latitude-data/core/browser'
import useDocumentVersions from '$/stores/documentVersions'

type DocumentVersionContext = {
  document: DocumentVersion
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
  const { data: documents } = useDocumentVersions({
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
