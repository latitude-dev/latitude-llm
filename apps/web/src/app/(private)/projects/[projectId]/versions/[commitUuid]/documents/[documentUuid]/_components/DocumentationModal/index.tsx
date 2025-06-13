'use client'

import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'

import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import useDocumentVersions from '$/stores/documentVersions'
import { ApiKey } from '@latitude-data/core/browser'
import { Modal } from '@latitude-data/web-ui/atoms/Modal'
import { scan, type ConversationMetadata } from 'promptl-ai'

import { SettingsTabs } from './_components/SettingsTabs'

export const DocumentationContext = createContext<{
  open: boolean
  toggleDocumentation: () => void
}>({
  open: false,
  toggleDocumentation: () => {},
})

export type UsedToolsDoc = { name: string; parameters: string[] }
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
  const { document: serverDocument } = useCurrentDocument()
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

      // TODO: Include referenceFn, otherwise it will fail if the prompt contains references
      const metadata =
        document.promptlVersion === 0
          ? undefined
          : await scan({
              prompt: document.content ?? '',
              fullPath: document.path,
            })

      setMetadata(metadata as ConversationMetadata)
    }

    doit()
  }, [document])

  const rawTools = metadata?.config?.tools
  const tools = useMemo(() => {
    if (!rawTools || typeof rawTools !== 'object') return []

    return Object.entries(rawTools).map(([name, values]) => ({
      name,
      parameters: Object.keys((values?.parameters ?? {}).properties ?? {}),
    })) as UsedToolsDoc[]
  }, [rawTools])
  return (
    <Modal
      dismissible
      title='Deploy this prompt'
      description="Deploying this prompt in your application is straightforward. Here's what you need to do."
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
          tools={tools}
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
