import { ReactNode } from 'react'
import { useMetadataParameters } from '$/hooks/useMetadataParameters'
import { ClientOnly } from '@latitude-data/web-ui/atoms/ClientOnly'
import { Text } from '@latitude-data/web-ui/atoms/Text'

export function ParametersWrapper({
  children,
}: {
  children: (args: { metadataParameters: string[] }) => ReactNode
}) {
  const { parameters } = useMetadataParameters()
  return (
    <ClientOnly>
      <div className='flex flex-col gap-3'>
        {parameters.length > 0 ? (
          <div className='grid grid-cols-[auto_1fr] gap-y-3'>
            {children({ metadataParameters: parameters })}
          </div>
        ) : (
          <Text.H6 color='foregroundMuted'>
            No inputs. Use &#123;&#123;input_name&#125;&#125; to insert.
          </Text.H6>
        )}
      </div>
    </ClientOnly>
  )
}
