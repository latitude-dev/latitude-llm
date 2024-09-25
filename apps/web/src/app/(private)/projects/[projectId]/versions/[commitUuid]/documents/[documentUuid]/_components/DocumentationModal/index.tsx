'use client'

import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'

import { ConversationMetadata, readMetadata } from '@latitude-data/compiler'
import { ApiKey } from '@latitude-data/core/browser'
import { Modal, useCurrentDocument } from '@latitude-data/web-ui'
import useDocumentVersions from '$/stores/documentVersions'

import { SettingsTabs } from './_components/SettingsTabs'

export const DocumentationContext = createContext<{
  open: boolean
  toggleDocumentation: () => void
}>({
  open: false,
  toggleDocumentation: () => {},
})

export default function DocumentationModal({
  projectId,
  commitUuid,
  apiKeys,
}: {
  projectId: string
  commitUuid: string
  apiKeys: ApiKey[]
}) {
  const { open, toggleDocumentation } = useContext(DocumentationContext)
  const serverDocument = useCurrentDocument()
  const { data } = useDocumentVersions(
    { projectId: Number(projectId), commitUuid },
    { fallbackData: [serverDocument] },
  )
  const document = useMemo(
    () => data?.find((d) => d.id === serverDocument.id),
    [data, serverDocument],
  )
  const [metadata, setMetadata] = useState<ConversationMetadata>()

  useEffect(() => {
    const doit = async () => {
      if (!document) return

      const metadata = await readMetadata({
        prompt: document.content ?? '',
        fullPath: document.path,
      })
      setMetadata(metadata)
    }

    doit()
  }, [document])

  return (
    <Modal
      title='Documentation'
      description="Implementing this prompt in your application is straightforward. Here's what you need to do."
      size='large'
      open={open}
      onOpenChange={toggleDocumentation}
    >
      {document && (
        <SettingsTabs
          projectId={Number(projectId)}
          commitUuid={commitUuid}
          document={document}
          apiKeys={apiKeys ?? []}
          parameters={metadata?.parameters ?? new Set()}
        />
      )}
    </Modal>
  )
}

export const DocumentationModalProvider = ({
  children,
}: {
  children: ReactNode
}) => {
  const [open, setOpen] = useState(false)
  const toggleDocumentation = () => setOpen((open) => !open)

  return (
    <DocumentationContext.Provider value={{ open, toggleDocumentation }}>
      {children}
    </DocumentationContext.Provider>
  )
}
