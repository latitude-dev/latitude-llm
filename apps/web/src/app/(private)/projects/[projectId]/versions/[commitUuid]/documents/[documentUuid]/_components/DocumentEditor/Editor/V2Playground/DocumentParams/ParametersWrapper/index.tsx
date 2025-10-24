import { ReactNode } from 'react'
import { useDocumentParameters } from '$/hooks/useDocumentParameters'
import { ClientOnly } from '@latitude-data/web-ui/atoms/ClientOnly'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import type { ICommitContextType } from '$/app/providers/CommitProvider'
import { DocumentVersion } from '@latitude-data/core/schema/models/types/DocumentVersion'

export function ParametersWrapper({
  document,
  commit,
  children,
}: {
  document: DocumentVersion
  commit: ICommitContextType['commit']
  children: (args: { metadataParameters: string[] }) => ReactNode
}) {
  const { metadataParameters } = useDocumentParameters({
    document,
    commitVersionUuid: commit.uuid,
  })
  return (
    <ClientOnly>
      <div className='flex flex-col gap-3'>
        {metadataParameters === undefined ? (
          <Text.H6 color='foregroundMuted'>Loading..</Text.H6>
        ) : (
          <>
            {metadataParameters.length > 0 ? (
              <div className='grid grid-cols-[auto_1fr] gap-y-3'>
                {children({ metadataParameters })}
              </div>
            ) : (
              <Text.H6 color='foregroundMuted'>
                No inputs. Use &#123;&#123;input_name&#125;&#125; to insert.
              </Text.H6>
            )}
          </>
        )}
      </div>
    </ClientOnly>
  )
}
