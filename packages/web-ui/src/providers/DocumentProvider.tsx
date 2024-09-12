'use client'

import { createContext, ReactNode, useContext } from 'react'

import { DocumentVersion } from '@latitude-data/core/browser'

const DocumentContext = createContext<DocumentVersion | undefined>(undefined)

const DocumentVersionProvider = ({
  children,
  document,
}: {
  children: ReactNode
  document: DocumentVersion
}) => {
  return (
    <DocumentContext.Provider value={document}>
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
