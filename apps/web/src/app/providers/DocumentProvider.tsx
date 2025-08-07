'use client'

import { createContext, ReactNode, useContext, useMemo } from 'react'

import useDocumentVersions from '$/stores/documentVersions'
import { DocumentVersion } from '@latitude-data/core/browser'

type DocumentVersionContext = {
  document: DocumentVersion
}
const DocumentContext = createContext<DocumentVersionContext>(
  {} as DocumentVersionContext,
)

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
    projectId,
    commitUuid,
  })

  const document = useMemo(() => {
    return (
      documents?.find((d) => d.id === fallbackDocument.id) ?? fallbackDocument
    )
  }, [documents, fallbackDocument])

  return (
    <DocumentContext.Provider
      value={{
        document: document || fallbackDocument,
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

export { DocumentVersionProvider, useCurrentDocument }
