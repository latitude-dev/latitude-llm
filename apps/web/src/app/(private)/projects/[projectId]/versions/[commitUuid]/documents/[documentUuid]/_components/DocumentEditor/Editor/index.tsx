import { DevModeProvider } from '$/hooks/useDevMode'
import { DocumentEditor } from './DocumentEditor'
import { DocumentEditorProps, OldDocumentEditor } from './OldDocumentEditor'
import { DocumentValueProvider } from '$/hooks/useDocumentValueContext'
import { MetadataProvider } from '$/components/MetadataProvider'
import { getCurrentUserOrRedirect } from '$/services/auth/getCurrentUser'
import { isFeatureEnabledByName } from '@latitude-data/core/services/workspaceFeatures/isFeatureEnabledByName'

export default async function DocumentEditorWrapper(
  props: DocumentEditorProps,
) {
  const { workspace } = await getCurrentUserOrRedirect()
  const enabled = await isFeatureEnabledByName(workspace.id, 'latte').then(
    (r) => r.unwrap(),
  )

  return (
    <MetadataProvider>
      <DevModeProvider>
        <DocumentValueProvider
          key={props.document.content}
          document={props.document}
        >
          {enabled ? (
            <DocumentEditor {...props} />
          ) : (
            <OldDocumentEditor {...props} />
          )}
        </DocumentValueProvider>
      </DevModeProvider>
    </MetadataProvider>
  )
}
